'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../paths');
const debugLog = require('../debug/logger');
const { isImagePath } = require('./image-prep');
const {
  buildReferencePathEntry,
  buildPreflightMessages,
  gatewayErrorNeedsResponsesContentParts,
} = require('./image-preflight');
const {
  appendLayoutLockBlock,
  buildPreviewEditFrozenRules,
  sanitizePreflightPrompt,
} = require('./layout-fidelity');
const { resolveImageGenerationSettings } = require('./image-settings');

const PREVIEW_REFERENCE_HINT = 'Image 1 = generated ad preview to edit; Image 2 = layout template for frozen header/footer/neon zones.';

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

async function buildPreviewEditReferences(previewPath, templatePath) {
  const preview = await buildReferencePathEntry(previewPath, 'preview');
  if (!preview) {
    throw new Error('Vorschaubild konnte nicht gelesen werden.');
  }
  const refs = [preview];
  const tplPath = String(templatePath || '').trim();
  if (tplPath && fs.existsSync(tplPath) && isImagePath(tplPath)) {
    const layout = await buildReferencePathEntry(tplPath, 'layout');
    if (layout) refs.push(layout);
  }
  return refs;
}

function collectReferencePaths(referenceImages) {
  return (referenceImages || []).map((r) => r.path).filter(Boolean);
}

class PreviewEditPipeline {
  constructor(bridgeClient, templateRegistry) {
    this.client = bridgeClient;
    this.registry = templateRegistry;
  }

  async optimizeEditPrompt(template, previewPath, templatePath, changeRequest, imageSettings, signalKey, onProgress) {
    onProgress?.({ status: 'running', messageKey: 'wait.status.previewEditPrompt' });

    const referenceImages = await buildPreviewEditReferences(previewPath, templatePath);
    const hasTemplateReference = referenceImages.length > 1;
    const refPaths = collectReferencePaths(referenceImages);

    const taskPrompt = buildPreviewEditFrozenRules(changeRequest, imageSettings, { hasTemplateReference });
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
      throw new Error('Prompt-Optimierung für Vorschau-Edit fehlgeschlagen.');
    }

    optimizedEditPrompt = appendLayoutLockBlock(optimizedEditPrompt, template, imageSettings);
    if (hasTemplateReference) {
      optimizedEditPrompt = `${optimizedEditPrompt}\n\n${PREVIEW_REFERENCE_HINT}`;
    }

    return {
      optimizedEditPrompt,
      changeSummary: String(parsed?.changeSummary || '').trim(),
      preservedElements: parsed?.preservedElements || [],
      referenceImages,
      hasTemplateReference,
    };
  }

  async generatePreviewImage(template, previewPath, templatePath, optimizedEditPrompt, imageSettings, hasTemplateReference, signalKey, onProgress) {
    onProgress?.({ status: 'running', messageKey: 'wait.status.previewEditImage' });

    const referenceImages = await buildPreviewEditReferences(previewPath, templatePath);
    const refPaths = collectReferencePaths(referenceImages);

    let bridgeCapabilities = null;
    try {
      bridgeCapabilities = await this.client.getCapabilities();
    } catch (err) {
      debugLog.warn('preview-edit-pipeline', 'Bridge-Capabilities nicht abrufbar', { message: err.message });
    }

    let prompt = appendLayoutLockBlock(optimizedEditPrompt, template, imageSettings);
    if (hasTemplateReference) {
      prompt = `${prompt}\n\n${PREVIEW_REFERENCE_HINT}`;
    }

    const encodedRefs = referenceImages.filter((r) => r.b64_json);
    const apiPayload = {
      model: 'codex-local:image',
      prompt,
      size: imageSettings.size,
      quality: imageSettings.quality,
      requireReferences: true,
      referenced_image_paths: refPaths,
    };
    if (encodedRefs.length) {
      apiPayload.reference_images = encodedRefs;
    }

    debugLog.info('preview-edit-pipeline', 'Vorschau-Edit Bildgenerierung', {
      templateId: template?.id || '',
      imageSize: imageSettings.size,
      imageQuality: imageSettings.quality,
      referenceCount: referenceImages.length,
      hasTemplateReference,
      bridgeSupportsRefs: bridgeCapabilities?.features?.image_reference_attachments === true,
    });

    const result = await this.client.images(apiPayload, signalKey);
    const b64 = result?.response?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('Keine Bilddaten von der Bridge erhalten.');
    }

    const outPath = path.join(paths.tempPreviewDir(), `preview-edit-${Date.now()}.png`);
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));

    const providerDetails = result?.response?.provider_details || {};
    return {
      path: outPath,
      b64,
      attachmentMode: result._attachmentMode || 'reference_images',
      refsForwardedToCodex: providerDetails.refs_forwarded_to_codex === true
        || Number(providerDetails.reference_attachment_count || 0) > 0,
      referenceAttachmentCount: Number(providerDetails.reference_attachment_count || 0),
      optimizedEditPrompt: prompt,
    };
  }

  async runPreviewEdit({ previewPath, templateId, changeRequest, quality, size }, onProgress, signalKey) {
    const preview = String(previewPath || '').trim();
    if (!preview || !fs.existsSync(preview)) {
      throw new Error('Keine gültige Vorschau zum Bearbeiten.');
    }
    if (!String(changeRequest || '').trim()) {
      throw new Error('Bitte Änderungswunsch eingeben.');
    }

    const template = templateId ? this.registry.getById(templateId) : null;
    const templatePath = template ? this.registry.resolveTemplatePath(template) : '';
    const dims = template ? await this.registry.getDimensions(template) : null;
    const imageSettings = resolveImageGenerationSettings(
      { size: size || 'template', quality },
      dims,
    );

    const optimized = await this.optimizeEditPrompt(
      template,
      preview,
      templatePath,
      changeRequest,
      imageSettings,
      signalKey,
      onProgress,
    );

    const image = await this.generatePreviewImage(
      template,
      preview,
      templatePath,
      optimized.optimizedEditPrompt,
      imageSettings,
      optimized.hasTemplateReference,
      signalKey,
      onProgress,
    );

    return {
      previewPath: preview,
      templateId: templateId || '',
      changeRequest,
      changeSummary: optimized.changeSummary,
      preservedElements: optimized.preservedElements,
      optimizedEditPrompt: image.optimizedEditPrompt,
      editedPreviewPath: image.path,
      editedPreviewB64: image.b64,
      imageSize: imageSettings.size,
      imageQuality: imageSettings.quality,
      refsForwardedToCodex: image.refsForwardedToCodex,
      referenceAttachmentCount: image.referenceAttachmentCount,
    };
  }
}

module.exports = {
  PreviewEditPipeline,
  buildPreviewEditReferences,
  PREVIEW_REFERENCE_HINT,
};
