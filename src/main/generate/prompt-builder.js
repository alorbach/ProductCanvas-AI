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

class PromptBuilder {
  constructor(bridgeClient, templateRegistry) {
    this.client = bridgeClient;
    this.registry = templateRegistry;
  }

  framesFromPaths(imagePaths) {
    return imagePaths.map((p) => this.registry.imageToDataUrl(p));
  }

  async analyzeReferences(imagePaths, signalKey) {
    if (!imagePaths.length) return '';
    const frames = this.framesFromPaths(imagePaths);
    const result = await this.client.mediaAnalyze({
      model: 'codex-local:auto',
      prompt: 'Beschreibe die Produkte auf diesen Bildern detailliert: Form, Farbe, Material, Anzahl, Markenmerkmale. Antworte auf Deutsch.',
      frames,
    }, signalKey);
    return getChoiceContent(result) || JSON.stringify(result.response || result);
  }

  async buildWerbungPrompt(options, signalKey) {
    const template = this.registry.getById(options.templateId);
    if (!template) throw new Error('Vorlage nicht gefunden.');

    const productAnalysis = await this.analyzeReferences(
      (options.referenceImages || []).map((r) => r.path).filter(Boolean),
      signalKey,
    );

    const examplePath = path.join(paths.examplesDir(), template.exampleReference || 'Beispiel-Martin-Logan.png');
    let exampleHint = '';
    if (fs.existsSync(examplePath)) {
      exampleHint = 'Orientiere dich am TELE-KOHLGRAF-Werbelayout: Markenname groß in Gold, Serienname, Tagline, Produkt(e) auf Betonbühne, Footer-Kategorie hervorgehoben.';
    }

    const chatPrompt = `Du bist Werbetexter für TELE-KOHLGRAF (Bild & Ton).
Erzeuge ein JSON-Objekt für ein Werbebild. Nur gültiges JSON, keine Erklärung.

Vorlage: ${template.name}, Akzentfarbe: ${template.accent}, Bühne: ${template.stageHint}
${exampleHint}

Produktanalyse:
${productAnalysis || 'Keine Referenzbilder – nutze allgemeine Produktbeschreibung aus Zusatz-Prompt.'}

Zusatz-Prompt: ${options.extraPrompt || '–'}
Gewünschte Kategorie: ${options.productCategory || 'LAUTSPRECHER'}

JSON-Felder:
- brandName (Großbuchstaben)
- seriesName
- tagline (1 Zeile Deutsch)
- productCategory (eines von: TV, BEAMER, LEINWÄNDE, LAUTSPRECHER, AV-RECEIVER, SUBWOOFER, KINOSESSEL)
- productDescription
- placementInstructions
- imagePrompt (vollständiger englischer Prompt für Bildgenerierung: TELE-KOHLGRAF template stage, preserve exact product appearance, gold brand text, highlighted footer category icon)`;

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
}

module.exports = { PromptBuilder };
