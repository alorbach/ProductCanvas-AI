'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../paths');

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function getChoiceContent(result) {
  return result?.response?.choices?.[0]?.message?.content || '';
}

class TemplateEditorService {
  constructor(bridgeClient, templateRegistry, imagePipeline) {
    this.client = bridgeClient;
    this.registry = templateRegistry;
    this.imagePipeline = imagePipeline;
    this.pendingEdit = null;
  }

  async optimizePrompt(templateId, changeRequest, signalKey) {
    const template = this.registry.getById(templateId);
    if (!template) throw new Error('Vorlage nicht gefunden.');
    const templatePath = this.registry.resolveTemplatePath(template);
    const frame = this.registry.imageToDataUrl(templatePath);

    const analyzeResult = await this.client.mediaAnalyze({
      model: 'codex-local:auto',
      prompt: 'Analysiere diese Werbe-Vorlage: Layout, Farben, Neon-Akzente, Header, Footer, Kontaktleiste, Bühnenbereich. Antworte strukturiert auf Deutsch.',
      frames: [frame],
    }, signalKey);

    const analysis = getChoiceContent(analyzeResult) || '';

    const chatResult = await this.client.chat({
      model: 'codex-local:auto',
      messages: [{
        role: 'user',
        content: `Du optimierst einen Bildbearbeitungs-Prompt für eine TELE-KOHLGRAF-Vorlage.

Vorlagen-Analyse:
${analysis}

Änderungswunsch des Nutzers:
${changeRequest}

Regeln:
- TELE-KOHLGRAF-Branding (Header, Kontakt, Footer) unverändert lassen, außer explizit gewünscht
- Gleiche Bildabmessungen und Gesamtlayout
- Nur die gewünschte Änderung durchführen

Antworte NUR mit JSON:
{
  "optimizedEditPrompt": "englischer Prompt für Bildgenerierung",
  "changeSummary": "kurze deutsche Zusammenfassung",
  "preservedElements": ["Header", "Footer", ...]
}`,
      }],
      max_tokens: 2048,
    }, signalKey);

    const parsed = extractJson(getChoiceContent(chatResult));
    if (!parsed?.optimizedEditPrompt) {
      throw new Error('Prompt-Optimierung fehlgeschlagen.');
    }

    this.pendingEdit = {
      templateId,
      templatePath,
      changeRequest,
      ...parsed,
    };
    return parsed;
  }

  async applyEdit(settings, optimizedPrompt, onProgress, signalKey) {
    const edit = this.pendingEdit || {};
    const prompt = optimizedPrompt || edit.optimizedEditPrompt;
    const result = await this.imagePipeline.generateImage(
      { optimizedEditPrompt: prompt },
      settings,
      onProgress,
      signalKey,
    );
    this.pendingEdit = {
      ...edit,
      previewPath: result.path,
      previewB64: result.b64,
    };
    return {
      previewPath: result.path,
      previewB64: result.b64,
      originalPath: edit.templatePath || this.registry.resolveTemplatePath(this.registry.getById(edit.templateId)),
    };
  }

  acceptEdit() {
    if (!this.pendingEdit?.previewPath || !this.pendingEdit?.templateId) {
      throw new Error('Keine ausstehende Vorschau zum Akzeptieren.');
    }
    const template = this.registry.getById(this.pendingEdit.templateId);
    if (!template) throw new Error('Vorlage nicht gefunden.');

    let targetPath;
    let targetId = template.id;

    if (template.type === 'system') {
      const cloned = this.registry.clone(template.id, `${template.name} – bearbeitet`);
      targetPath = cloned.path;
      targetId = cloned.id;
    } else {
      targetPath = this.registry.resolveTemplatePath(template);
      const historyDir = paths.userTemplatesHistoryDir(template.id);
      const histFile = path.join(historyDir, `${Date.now()}.png`);
      fs.copyFileSync(targetPath, histFile);
    }

    fs.copyFileSync(this.pendingEdit.previewPath, targetPath);
    const accepted = { templateId: targetId, path: targetPath };
    this.pendingEdit = null;
    return accepted;
  }

  rejectEdit() {
    if (this.pendingEdit?.previewPath && fs.existsSync(this.pendingEdit.previewPath)) {
      try { fs.unlinkSync(this.pendingEdit.previewPath); } catch { /* ignore */ }
    }
    this.pendingEdit = null;
    return { success: true };
  }
}

module.exports = { TemplateEditorService };
