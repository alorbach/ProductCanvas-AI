'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../paths');
const debugLog = require('../debug/logger');
const { collectReferencePaths } = require('./image-request');
const {
  buildReferenceImageEntries,
  buildPreflightMessages,
  computePreflightFingerprint,
  gatewayErrorNeedsResponsesContentParts,
  runImagePreflight,
} = require('./image-preflight');
const { resolveImageGenerationSettings } = require('./image-settings');
const {
  buildReferenceOrderBlock,
  resolvePrimaryDetailRef,
  selectReferencesForWerbung,
  MAX_WERBUNG_ATTACHMENTS,
} = require('./reference-roles');

const AD_LINE_KEYS = new Set(['brandName', 'seriesName', 'tagline']);

function buildReferencePromptFromForm(options, template, templateRegistry, productAnalysis, imagePaths, attachmentPlan) {
  const templatePath = templateRegistry.resolveTemplatePath(template);
  return {
    brandName: String(options.brandName || '').trim().toUpperCase(),
    seriesName: String(options.seriesName || '').trim(),
    tagline: String(options.tagline || '').trim(),
    productDescription: String(options.extraPrompt || '').trim(),
    placementInstructions: 'Place products naturally on the stage from the layout template without altering product appearance.',
    productAnalysis: productAnalysis || '',
    imagePrompt: '',
    finalPrompt: '',
    preflightPrompt: '',
    preflightFingerprint: computePreflightFingerprint(options, templatePath, imagePaths, {
      referenceRoles: (options.referenceImages || []).map((r) => ({
        path: path.resolve(r.path || r),
        role: r.role || 'detail',
      })),
    }),
    attachmentPlan: attachmentPlan || [],
  };
}

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

function brandLabel(options) {
  return String(options.brandName || 'the brand').trim() || 'the brand';
}

function buildAdLineTaskPrompt(line, options) {
  const mainLine = options.brandName || '–';
  const adLine1 = options.seriesName || '–';
  const adLine2 = options.tagline || '–';
  const extra = options.extraPrompt || '–';

  if (line === 'brandName') {
    return `Du bist Werbetexter für Produktwerbung.
Analysiere das angehängte Produktbild und schreibe genau eine kurze deutsche Hauptzeile (1–4 Wörter).
Nur sichtbare Marken, Logos oder Produktfamilien – nichts erfinden.
Bereits bekannt – Werbezeile 1: ${adLine1}, Werbezeile 2: ${adLine2}
Zusatz: ${extra}
Antworte nur mit der Hauptzeile, ohne Anführungszeichen.`;
  }
  if (line === 'seriesName') {
    return `Du bist Werbetexter für Produktwerbung.
Analysiere das angehängte Produktbild und schreibe genau eine kurze deutsche Werbezeile 1 (2–6 Wörter).
Serie, Modellfamilie oder Produktlinie – prägnant, nur aus dem Bild ableitbar.
Bereits bekannt – Hauptzeile: ${mainLine}, Werbezeile 2: ${adLine2}
Zusatz: ${extra}
Antworte nur mit Werbezeile 1, ohne Anführungszeichen.`;
  }
  return `Du bist Werbetexter für Produktwerbung.
Analysiere das angehängte Produktbild und schreibe genau eine kurze deutsche Werbezeile 2 (2–8 Wörter).
Knackiger Werbesatz – nur aus dem Bild ableitbar, nichts erfinden.
Bereits bekannt – Hauptzeile: ${mainLine}, Werbezeile 1: ${adLine1}
Zusatz: ${extra}
Antworte nur mit Werbezeile 2, ohne Anführungszeichen.`;
}

class PromptBuilder {
  constructor(bridgeClient, templateRegistry) {
    this.client = bridgeClient;
    this.registry = templateRegistry;
  }

  async buildWerbungPrompt(options, signalKey, onProgress) {
    const template = this.registry.getById(options.templateId);
    if (!template) throw new Error('Vorlage nicht gefunden.');

    const imagePaths = collectReferencePaths(options.referenceImages);
    const hasReferences = imagePaths.length > 0;
    const templatePath = this.registry.resolveTemplatePath(template);
    const selection = selectReferencesForWerbung(options.referenceImages, {
      templatePath,
      maxSlots: MAX_WERBUNG_ATTACHMENTS,
    });

    if (hasReferences && !options.runPreflight) {
      debugLog.info('prompt-builder', 'JSON-Builder und Preflight übersprungen (Preflight nur bei Generierung)');
      return buildReferencePromptFromForm(
        options,
        template,
        this.registry,
        options.productAnalysis || '',
        imagePaths,
        selection.attachmentPlan,
      );
    }

    if (hasReferences && options.runPreflight) {
      debugLog.info('prompt-builder', 'Preflight für manuelle Prompt-Generierung');
      const stub = buildReferencePromptFromForm(
        options,
        template,
        this.registry,
        options.productAnalysis || '',
        imagePaths,
        selection.attachmentPlan,
      );
      const templateDims = await this.registry.getDimensions(template);
      const imageSettings = resolveImageGenerationSettings(options, templateDims);
      const referenceImages = await buildReferenceImageEntries({
        productRefs: selection.refs.map((r) => ({ path: r.path, role: r.role, label: r.label })),
        layoutPath: selection.layoutPath,
      });
      const preflight = await runImagePreflight(this.client, {
        settings: imageSettings,
        promptData: stub,
        template,
        productPath: selection.primaryDetailPath,
        layoutPath: selection.layoutPath,
        referenceImages,
        attachmentPlan: selection.attachmentPlan,
        signalKey,
        onProgress,
      });
      const fingerprint = computePreflightFingerprint(imageSettings, templatePath, imagePaths, {
        referenceRoles: selection.refs.map((r) => ({ path: r.path, role: r.role })),
      });
      return {
        ...stub,
        imagePrompt: preflight.finalPrompt,
        finalPrompt: preflight.finalPrompt,
        preflightPrompt: preflight.finalPrompt,
        preflightFingerprint: fingerprint,
      };
    }

    const examplePath = path.join(paths.examplesDir(), template.exampleReference || 'Beispiel-Martin-Logan.png');
    const brand = brandLabel(options);
    let exampleHint = '';
    if (fs.existsSync(examplePath)) {
      exampleHint = `Orientiere dich am Layout-Beispiel: Hauptzeile prominent, Werbezeile 1 und 2, Produkt(e) auf der Bühne. Marke: ${brand}.`;
    }

    const fidelityRules = `
- imagePrompt MUSS englisch sein: photorealistic AI-generated premium retail advertisement for ${brand}, cinematic lighting, NOT a collage.
`;

    const orderHint = buildReferenceOrderBlock(selection.attachmentPlan);
    const chatPrompt = `Du bist Werbetexter für Produktwerbung.
Erzeuge ein JSON-Objekt für ein Werbebild. Nur gültiges JSON, keine Erklärung.

Vorlage: ${template.name}, Akzentfarbe: ${template.accent}, Bühne: ${template.stageHint}
${exampleHint}
${fidelityRules}
${orderHint ? `\nReferenz-Reihenfolge:\n${orderHint}` : ''}

Bereits bekannt – Hauptzeile: ${options.brandName || '–'}
Werbezeile 1: ${options.seriesName || '–'}
Werbezeile 2: ${options.tagline || '–'}

Produktanalyse:
Keine Referenzbilder – nutze allgemeine Produktbeschreibung aus Zusatz-Prompt.

Zusatz-Prompt: ${options.extraPrompt || '–'}

JSON-Felder:
- brandName (Großbuchstaben, Hauptzeile)
- seriesName (Werbezeile 1)
- tagline (Werbezeile 2, 1 Zeile Deutsch)
- productDescription (detailliert, zählbar, keine Erfindungen)
- placementInstructions (nur Platzierung, Produkt unverändert)
- imagePrompt (vollständiger englischer Prompt für die Referenzbilder — photorealistic ${brand} retail ad, NOT a flat collage)`;

    onProgress?.({ status: 'running', messageKey: 'wait.status.buildingPrompt' });

    const result = await this.client.chat({
      model: 'codex-local:auto',
      messages: [{ role: 'user', content: chatPrompt }],
      max_tokens: 2048,
    }, signalKey);

    const content = getChoiceContent(result);
    const parsed = extractJson(content);
    if (!parsed) {
      throw new Error('Prompt-Builder konnte kein gültiges JSON erzeugen.');
    }
    return parsed;
  }

  async suggestAdLine(options, signalKey) {
    const line = String(options.line || '').trim();
    if (!AD_LINE_KEYS.has(line)) {
      throw new Error('Ungültige Werbezeile für KI-Vorschlag.');
    }

    const primary = resolvePrimaryDetailRef(options.referenceImages);
    const productPath = primary?.path || '';
    if (!productPath) {
      throw new Error('Keine Referenzbilder für KI-Vorschlag vorhanden.');
    }

    const referenceImages = await buildReferenceImageEntries({
      productRefs: [{ path: productPath, role: 'detail', label: 'product' }],
      layoutPath: '',
    });
    if (!referenceImages.length) {
      throw new Error('Keine Referenzbilder für KI-Vorschlag vorhanden.');
    }

    const taskPrompt = buildAdLineTaskPrompt(line, options);
    const model = 'codex-local:auto';
    let messages = buildPreflightMessages(taskPrompt, referenceImages, {
      model,
      useResponsesContentParts: false,
    });
    messages[0] = {
      role: 'system',
      content: 'You are ProductCanvas AI ad copywriter. Analyze the attached product image and return only the requested German ad line. No explanation, no markdown, no quotes.',
    };

    const chatPayload = { model, messages, max_tokens: 64 };
    let result;
    try {
      result = await this.client.chat(chatPayload, signalKey);
    } catch (err) {
      if (!gatewayErrorNeedsResponsesContentParts(err)) {
        throw err;
      }
      messages = buildPreflightMessages(taskPrompt, referenceImages, {
        model,
        forceResponsesContentParts: true,
      });
      messages[0] = {
        role: 'system',
        content: 'You are ProductCanvas AI ad copywriter. Analyze the attached product image and return only the requested German ad line. No explanation, no markdown, no quotes.',
      };
      chatPayload.messages = messages;
      result = await this.client.chat(chatPayload, signalKey);
    }

    let text = getChoiceContent(result).trim().replace(/^["']|["']$/g, '');
    if (!text) {
      throw new Error('KI konnte keinen Werbetext vorschlagen.');
    }
    if (line === 'brandName') {
      text = text.toUpperCase();
    }
    return { [line]: text };
  }
}

module.exports = { PromptBuilder, buildReferencePromptFromForm };
