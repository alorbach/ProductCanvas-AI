'use strict';



const fs = require('fs');

const path = require('path');

const paths = require('../paths');

const debugLog = require('../debug/logger');

const { prepareBridgeFrame, prepareBridgeFrames, MAX_ANALYZE_IMAGES } = require('./image-prep');

const { ANALYZE_PRODUCT_PROMPT, collectReferencePaths } = require('./image-request');
const { computePreflightFingerprint } = require('./image-preflight');

function buildReferencePromptFromForm(options, template, templateRegistry, productAnalysis, imagePaths) {
  const templatePath = templateRegistry.resolveTemplatePath(template);
  return {
    brandName: String(options.brandName || '').trim().toUpperCase(),
    seriesName: String(options.seriesName || '').trim(),
    tagline: String(options.tagline || '').trim(),
    productCategory: options.productCategory || 'LAUTSPRECHER',
    productDescription: String(options.extraPrompt || '').trim(),
    placementInstructions: 'Place products naturally on the stage from the layout template without altering product appearance.',
    productAnalysis: productAnalysis || '',
    imagePrompt: '',
    finalPrompt: '',
    preflightPrompt: '',
    preflightFingerprint: computePreflightFingerprint(options, templatePath, imagePaths),
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



function isBodyTooLarge(err) {

  const msg = String(err?.message || err || '').toLowerCase();

  return msg.includes('body is too large') || msg.includes('too large');

}



class PromptBuilder {

  constructor(bridgeClient, templateRegistry) {

    this.client = bridgeClient;

    this.registry = templateRegistry;

    this.lastProductAnalysis = '';

  }



  async analyzeSingleFrame(frame, index, signalKey) {

    const result = await this.client.mediaAnalyze({

      model: 'codex-local:auto',

      prompt: `${ANALYZE_PRODUCT_PROMPT}\n\n(Bild ${index + 1})`,

      frames: [frame],

    }, signalKey);

    return getChoiceContent(result) || JSON.stringify(result.response || result);

  }



  async analyzeReferences(imagePaths, signalKey, onProgress) {
    if (!imagePaths.length) return '';

    onProgress?.({ status: 'running', messageKey: 'wait.status.preparingRefs' });

    const { frames, meta } = await prepareBridgeFrames(imagePaths);

    debugLog.info('prompt-builder', 'Referenzbilder vorbereitet', {

      count: frames.length,

      frames: meta,

      skipped: meta.skipped,

    });



    if (!frames.length) return '';



    const parts = [];

    for (let i = 0; i < frames.length; i++) {
      onProgress?.({
        status: 'running',
        messageKey: 'wait.status.analyzingRef',
        messageParams: { current: i + 1, total: frames.length },
      });
      try {

        const text = await this.analyzeSingleFrame(frames[i], i, signalKey);

        parts.push(`Bild ${i + 1}:\n${text}`);

      } catch (err) {

        debugLog.warn('prompt-builder', `Analyse Bild ${i + 1} fehlgeschlagen`, {

          message: err.message,

          frameBytes: meta[i]?.bytes,

        });

        if (isBodyTooLarge(err)) {

          parts.push(`Bild ${i + 1}: Analyse übersprungen (Payload zu groß).`);

        }

      }

    }



    if (meta.skipped) {

      debugLog.warn('prompt-builder', `${meta.skipped} Referenzbild(er) übersprungen (Limit ${MAX_ANALYZE_IMAGES})`);

    }



    const combined = parts.join('\n\n');

    this.lastProductAnalysis = combined;

    return combined;

  }



  async buildWerbungPrompt(options, signalKey, onProgress) {
    const template = this.registry.getById(options.templateId);
    if (!template) throw new Error('Vorlage nicht gefunden.');

    const imagePaths = collectReferencePaths(options.referenceImages);
    const hasReferences = imagePaths.length > 0;
    const mediaAnalysisEnabled = options.mediaAnalysisEnabled === true;
    let productAnalysis = '';

    if (mediaAnalysisEnabled) {
      try {
        productAnalysis = await this.analyzeReferences(imagePaths, signalKey, onProgress);
      } catch (err) {

        debugLog.error('prompt-builder', 'Produktanalyse fehlgeschlagen', { message: err.message });

        if (!isBodyTooLarge(err)) throw err;

        productAnalysis = '';

      }
    } else if (hasReferences) {
      debugLog.info('prompt-builder', 'Produktbild-Analyse übersprungen (Einstellung deaktiviert)');
    }

    if (hasReferences) {
      debugLog.info('prompt-builder', 'JSON-Builder und Preflight übersprungen (Preflight nur bei Generierung)');
      return buildReferencePromptFromForm(
        options,
        template,
        this.registry,
        productAnalysis,
        imagePaths,
      );
    }

    const examplePath = path.join(paths.examplesDir(), template.exampleReference || 'Beispiel-Martin-Logan.png');

    let exampleHint = '';

    if (fs.existsSync(examplePath)) {

      exampleHint = 'Orientiere dich am TELE-KOHLGRAF-Werbelayout: Markenname groß in Gold, Serienname, Tagline, Produkt(e) auf Betonbühne, Footer-Kategorie hervorgehoben.';

    }



    const fidelityRules = `

- imagePrompt MUSS englisch sein: photorealistic AI-generated premium TELE-KOHLGRAF retail advertisement, cinematic lighting, NOT a collage.

`;



    const chatPrompt = `Du bist Werbetexter für TELE-KOHLGRAF (Bild & Ton).

Erzeuge ein JSON-Objekt für ein Werbebild. Nur gültiges JSON, keine Erklärung.



Vorlage: ${template.name}, Akzentfarbe: ${template.accent}, Bühne: ${template.stageHint}

${exampleHint}

${fidelityRules}



Bereits bekannt – Markenname: ${options.brandName || '–'}

Serie: ${options.seriesName || '–'}

Tagline-Vorgabe: ${options.tagline || '–'}



Produktanalyse:

${productAnalysis || 'Keine Referenzbilder – nutze allgemeine Produktbeschreibung aus Zusatz-Prompt.'}



Zusatz-Prompt: ${options.extraPrompt || '–'}

Gewünschte Kategorie: ${options.productCategory || 'LAUTSPRECHER'}



JSON-Felder:

- brandName (Großbuchstaben)

- seriesName

- tagline (1 Zeile Deutsch)

- productCategory (eines von: TV, BEAMER, LEINWÄNDE, LAUTSPRECHER, AV-RECEIVER, SUBWOOFER, KINOSESSEL)

- productDescription (detailliert, zählbar, keine Erfindungen)

- placementInstructions (nur Platzierung, Produkt unverändert)

- imagePrompt (vollständiger englischer Prompt: merge products from attached Image 1 into layout from attached Image 2, photorealistic TELE-KOHLGRAF ad, gold brand text, highlighted footer category — NOT a flat collage)`;

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



  async suggestTagline(options, signalKey) {

    const imagePaths = collectReferencePaths(options.referenceImages);

    let productHint = this.lastProductAnalysis || '';



    if (!productHint && imagePaths.length && options.mediaAnalysisEnabled === true) {

      try {

        const frame = await prepareBridgeFrame(imagePaths[0]);

        productHint = await this.analyzeSingleFrame(frame, 0, signalKey);

      } catch (err) {

        debugLog.warn('prompt-builder', 'Tagline-Hinweis ohne Bildanalyse', { message: err.message });

      }

    }



    const chatPrompt = `Schreibe genau eine kurze deutsche Werbe-Tagline (max. 12 Wörter) für TELE-KOHLGRAF.



Markenname: ${options.brandName || 'unbekannt'}

Serie: ${options.seriesName || 'unbekannt'}

Kategorie: ${options.productCategory || 'LAUTSPRECHER'}

Zusatz: ${options.extraPrompt || '–'}

Produkthinweis: ${productHint || '–'}



Antworte nur mit der Tagline, ohne Anführungszeichen.`;



    const result = await this.client.chat({

      model: 'codex-local:auto',

      messages: [{ role: 'user', content: chatPrompt }],

      max_tokens: 128,

    }, signalKey);



    const tagline = getChoiceContent(result).trim().replace(/^["']|["']$/g, '');

    if (!tagline) throw new Error('KI konnte keinen Werbetext vorschlagen.');

    return { tagline };

  }

}



module.exports = { PromptBuilder, buildReferencePromptFromForm };


