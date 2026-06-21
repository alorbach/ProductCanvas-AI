'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../paths');
const debugLog = require('../debug/logger');
const { isImagePath, computePerAttachmentByteBudget } = require('./image-prep');
const {
  buildReferencePathEntry,
  buildPreflightMessages,
  gatewayErrorNeedsResponsesContentParts,
  emitReferencePrepProgress,
} = require('./image-preflight');
const {
  appendEffectEditLockBlock,
  buildEffectEditRules,
  buildEffectResizeOnlyPrompt,
  sanitizePreflightPrompt,
} = require('./layout-fidelity');
const { isFormatOnlyEdit } = require('./template-edit-pipeline');
const { resolveImageGenerationSettings } = require('./image-settings');

const STYLE_REFERENCE_HINT = 'Image 1 = effect/background image to edit; Image 2 = visual style reference for the user request.';

function extractJson(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
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

function formatResizeSummary(imageSettings) {
  const size = imageSettings.size === 'auto' ? 'Auto' : imageSettings.size.replace(/x/i, '×');
  return `Ausgabeformat auf ${size} skaliert (ohne Inhaltsänderung).`;
}

async function buildEffectEditReferences(effectPath, referenceImagePath) {
  const stylePath = String(referenceImagePath || '').trim();
  const hasStyle = stylePath && fs.existsSync(stylePath) && isImagePath(stylePath);
  const attachmentCount = hasStyle ? 2 : 1;
  const options = {
    byteBudget: computePerAttachmentByteBudget(attachmentCount),
    attachmentCount,
  };

  const effect = await buildReferencePathEntry(effectPath, 'effect', options);
  if (!effect) {
    throw new Error('Effektbild konnte nicht gelesen werden.');
  }
  const refs = [effect];
  if (hasStyle) {
    const style = await buildReferencePathEntry(stylePath, 'style', options);
    if (style) refs.push(style);
  }
  return refs;
}

function collectReferencePaths(referenceImages) {
  return (referenceImages || []).map((r) => r.path).filter(Boolean);
}

class EffectEditPipeline {
  constructor(bridgeClient, effectRegistry) {
    this.client = bridgeClient;
    this.registry = effectRegistry;
  }

  async optimizeEditPrompt(effect, effectPath, changeRequest, imageSettings, referenceImagePath, signalKey, onProgress) {
    onProgress?.({ status: 'running', messageKey: 'wait.status.effectEditPrompt' });

    const referenceImages = await buildEffectEditReferences(effectPath, referenceImagePath);
    emitReferencePrepProgress(onProgress, referenceImages);
    const hasStyleReference = referenceImages.length > 1;
    const refPaths = collectReferencePaths(referenceImages);

    const taskPrompt = buildEffectEditRules(changeRequest, imageSettings, { hasStyleReference });
    const model = 'codex-local:auto';
    let messages = buildPreflightMessages(taskPrompt, referenceImages, { model });

    let result;
    try {
      result = await this.client.chat({
        model,
        messages,
        max_tokens: 2048,
        referenced_image_paths: refPaths,
      }, signalKey);
    } catch (err) {
      if (!gatewayErrorNeedsResponsesContentParts(err)) throw err;
      messages = buildPreflightMessages(taskPrompt, referenceImages, {
        model,
        forceResponsesContentParts: true,
      });
      result = await this.client.chat({
        model,
        messages,
        max_tokens: 2048,
        referenced_image_paths: refPaths,
      }, signalKey);
    }

    const parsed = extractJson(getChoiceContent(result));
    let optimizedEditPrompt = sanitizePreflightPrompt(
      parsed?.optimizedEditPrompt || getChoiceContent(result),
    );
    if (!optimizedEditPrompt) {
      throw new Error('Prompt-Optimierung für Effektbild-Edit fehlgeschlagen.');
    }

    optimizedEditPrompt = appendEffectEditLockBlock(optimizedEditPrompt, imageSettings);
    if (hasStyleReference) {
      optimizedEditPrompt = `${optimizedEditPrompt}\n\n${STYLE_REFERENCE_HINT}`;
    }

    return {
      optimizedEditPrompt,
      changeSummary: String(parsed?.changeSummary || '').trim(),
      preservedElements: parsed?.preservedElements || [],
      referenceImages,
      hasStyleReference,
    };
  }

  buildFormatOnlyEdit(imageSettings, effectDims) {
    const optimizedEditPrompt = buildEffectResizeOnlyPrompt(imageSettings, effectDims);
    return {
      optimizedEditPrompt,
      changeSummary: formatResizeSummary(imageSettings),
      preservedElements: ['Hintergrund', 'Atmosphäre', 'Textur'],
      referenceImages: [],
      hasStyleReference: false,
    };
  }

  async generateEffectImage(effectPath, optimizedEditPrompt, imageSettings, referenceImagePath, hasStyleReference, signalKey, onProgress) {
    onProgress?.({ status: 'running', messageKey: 'wait.status.effectEditImage' });

    const referenceImages = await buildEffectEditReferences(effectPath, referenceImagePath);
    emitReferencePrepProgress(onProgress, referenceImages);
    const refPaths = collectReferencePaths(referenceImages);

    let prompt = appendEffectEditLockBlock(optimizedEditPrompt, imageSettings);
    if (hasStyleReference) {
      prompt = `${prompt}\n\n${STYLE_REFERENCE_HINT}`;
    }

    const apiPayload = {
      model: 'codex-local:image',
      prompt,
      size: imageSettings.size,
      quality: imageSettings.quality,
      requireReferences: true,
      referenced_image_paths: refPaths,
    };

    debugLog.info('effect-edit-pipeline', 'Effektbild-Edit Bildgenerierung', {
      referenceCount: referenceImages.length,
      hasStyleReference,
      imageSize: imageSettings.size,
      imageQuality: imageSettings.quality,
    });

    const result = await this.client.images(apiPayload, signalKey);
    const b64 = result?.response?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('Keine Bilddaten von der KI erhalten.');
    }

    const outPath = path.join(paths.tempPreviewDir(), `effect-edit-${Date.now()}.png`);
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));

    const providerDetails = result?.response?.provider_details || {};
    return {
      path: outPath,
      b64,
      attachmentMode: result._attachmentMode || 'referenced_image_paths',
      refsForwardedToCodex: providerDetails.refs_forwarded_to_codex === true
        || Number(providerDetails.reference_attachment_count || 0) > 0,
      referenceAttachmentCount: Number(providerDetails.reference_attachment_count || 0),
      optimizedEditPrompt: prompt,
    };
  }

  async runEffectEdit({ effectId, changeRequest, quality, size, referenceImagePath }, onProgress, signalKey) {
    const effect = this.registry.getById(effectId);
    if (!effect) throw new Error('Effektbild nicht gefunden.');

    const effectPath = this.registry.resolveEffectPath(effect);
    const dims = await this.registry.getDimensions(effect);
    const imageSettings = resolveImageGenerationSettings(
      { size: size || 'template', quality },
      dims,
    );
    const stylePath = isFormatOnlyEdit(changeRequest, imageSettings, dims)
      ? ''
      : String(referenceImagePath || '').trim();

    const formatOnly = isFormatOnlyEdit(changeRequest, imageSettings, dims);
    if (!String(changeRequest || '').trim() && !formatOnly) {
      throw new Error('Bitte Änderungswunsch eingeben oder ein anderes Ausgabeformat wählen.');
    }

    const optimized = formatOnly
      ? this.buildFormatOnlyEdit(imageSettings, dims)
      : await this.optimizeEditPrompt(
        effect,
        effectPath,
        changeRequest,
        imageSettings,
        stylePath,
        signalKey,
        onProgress,
      );

    const image = await this.generateEffectImage(
      effectPath,
      optimized.optimizedEditPrompt,
      imageSettings,
      formatOnly ? '' : stylePath,
      optimized.hasStyleReference,
      signalKey,
      onProgress,
    );

    return {
      effectId,
      effectPath,
      changeRequest: changeRequest || '',
      referenceImagePath: formatOnly ? '' : stylePath,
      changeSummary: optimized.changeSummary,
      preservedElements: optimized.preservedElements,
      optimizedEditPrompt: image.optimizedEditPrompt,
      previewPath: image.path,
      previewB64: image.b64,
      imageSize: imageSettings.size,
      imageSizeMode: imageSettings.sizeMode,
      imageQuality: imageSettings.quality,
      formatOnly,
      effectWidth: dims?.width || 0,
      effectHeight: dims?.height || 0,
      outputWidth: imageSettings.outputWidth || 0,
      outputHeight: imageSettings.outputHeight || 0,
      refsForwardedToCodex: image.refsForwardedToCodex,
      referenceAttachmentCount: image.referenceAttachmentCount,
    };
  }
}

module.exports = {
  EffectEditPipeline,
  buildEffectEditReferences,
};
