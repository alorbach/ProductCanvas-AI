'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../paths');
const debugLog = require('../debug/logger');
const { isImagePath } = require('./image-prep');
const {
  buildReferenceImageEntry,
  buildPreflightMessages,
  gatewayErrorNeedsResponsesContentParts,
} = require('./image-preflight');
const {
  appendLayoutLockBlock,
  buildResizeOnlyPrompt,
  buildTemplateEditFrozenRules,
  sanitizePreflightPrompt,
} = require('./layout-fidelity');
const { resolveImageGenerationSettings } = require('./image-settings');

const STYLE_REFERENCE_HINT = 'Image 1 = layout template to edit; Image 2 = visual style reference for the user request.';

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

function isFormatOnlyEdit(changeRequest, imageSettings, templateDims) {
  if (String(changeRequest || '').trim()) return false;
  const native = templateDims?.width && templateDims?.height
    ? `${templateDims.width}x${templateDims.height}`
    : '';
  const target = String(imageSettings?.size || '');
  if (!target) return false;
  if (target === 'auto') return true;
  return target !== native;
}

function formatResizeSummary(imageSettings) {
  const size = imageSettings.size === 'auto' ? 'Auto' : imageSettings.size.replace(/x/i, '×');
  return `Ausgabeformat auf ${size} skaliert (ohne Layout-Änderung).`;
}

async function buildTemplateEditReferences(templatePath, referenceImagePath) {
  const layout = await buildReferenceImageEntry(templatePath, 'layout');
  if (!layout) {
    throw new Error('Vorlagenbild konnte nicht gelesen werden.');
  }
  const refs = [layout];
  const stylePath = String(referenceImagePath || '').trim();
  if (stylePath && fs.existsSync(stylePath) && isImagePath(stylePath)) {
    const style = await buildReferenceImageEntry(stylePath, 'style');
    if (style) refs.push(style);
  }
  return refs;
}

class TemplateEditPipeline {
  constructor(bridgeClient, templateRegistry) {
    this.client = bridgeClient;
    this.registry = templateRegistry;
  }

  async optimizeEditPrompt(template, templatePath, changeRequest, imageSettings, referenceImagePath, signalKey, onProgress) {
    onProgress?.({ status: 'running', messageKey: 'wait.status.templateEditPrompt' });

    const referenceImages = await buildTemplateEditReferences(templatePath, referenceImagePath);
    const hasStyleReference = referenceImages.length > 1;

    const taskPrompt = buildTemplateEditFrozenRules(changeRequest, imageSettings, { hasStyleReference });
    const model = 'codex-local:auto';
    let messages = buildPreflightMessages(taskPrompt, referenceImages, { model });

    let result;
    try {
      result = await this.client.chat({ model, messages, max_tokens: 2048 }, signalKey);
    } catch (err) {
      if (!gatewayErrorNeedsResponsesContentParts(err)) throw err;
      messages = buildPreflightMessages(taskPrompt, referenceImages, {
        model,
        forceResponsesContentParts: true,
      });
      result = await this.client.chat({ model, messages, max_tokens: 2048 }, signalKey);
    }

    const parsed = extractJson(getChoiceContent(result));
    let optimizedEditPrompt = sanitizePreflightPrompt(
      parsed?.optimizedEditPrompt || getChoiceContent(result),
    );
    if (!optimizedEditPrompt) {
      throw new Error('Prompt-Optimierung für Vorlagen-Edit fehlgeschlagen.');
    }

    optimizedEditPrompt = appendLayoutLockBlock(optimizedEditPrompt, template, imageSettings);
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

  buildFormatOnlyEdit(template, imageSettings, templateDims) {
    const optimizedEditPrompt = buildResizeOnlyPrompt(template, imageSettings, templateDims);
    return {
      optimizedEditPrompt,
      changeSummary: formatResizeSummary(imageSettings),
      preservedElements: ['Header', 'Footer', 'Layout', 'Farben', 'Neon-Rahmen'],
      referenceImages: [],
      hasStyleReference: false,
    };
  }

  async generateTemplateImage(template, templatePath, optimizedEditPrompt, imageSettings, referenceImagePath, hasStyleReference, signalKey, onProgress) {
    onProgress?.({ status: 'running', messageKey: 'wait.status.templateEditImage' });

    const referenceImages = await buildTemplateEditReferences(templatePath, referenceImagePath);

    let bridgeCapabilities = null;
    try {
      bridgeCapabilities = await this.client.getCapabilities();
    } catch (err) {
      debugLog.warn('template-edit-pipeline', 'Bridge-Capabilities nicht abrufbar', { message: err.message });
    }

    let prompt = appendLayoutLockBlock(optimizedEditPrompt, template, imageSettings);
    if (hasStyleReference) {
      prompt = `${prompt}\n\n${STYLE_REFERENCE_HINT}`;
    }

    const apiPayload = {
      model: 'codex-local:image',
      prompt,
      size: imageSettings.size,
      quality: imageSettings.quality,
      requireReferences: true,
      reference_images: referenceImages,
    };

    debugLog.info('template-edit-pipeline', 'Vorlagen-Edit Bildgenerierung', {
      templateId: template.id,
      templateName: template.name,
      imageSize: imageSettings.size,
      imageSizeMode: imageSettings.sizeMode,
      imageQuality: imageSettings.quality,
      referenceCount: referenceImages.length,
      hasStyleReference,
      bridgeSupportsRefs: bridgeCapabilities?.features?.image_reference_attachments === true,
    });

    const result = await this.client.images(apiPayload, signalKey);
    const b64 = result?.response?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('Keine Bilddaten von der Bridge erhalten.');
    }

    const outPath = path.join(paths.tempPreviewDir(), `template-edit-${Date.now()}.png`);
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

  async runTemplateEdit({ templateId, changeRequest, quality, size, referenceImagePath }, onProgress, signalKey) {
    const template = this.registry.getById(templateId);
    if (!template) throw new Error('Vorlage nicht gefunden.');

    const templatePath = this.registry.resolveTemplatePath(template);
    const dims = await this.registry.getDimensions(template);
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
      ? this.buildFormatOnlyEdit(template, imageSettings, dims)
      : await this.optimizeEditPrompt(
        template,
        templatePath,
        changeRequest,
        imageSettings,
        stylePath,
        signalKey,
        onProgress,
      );

    const image = await this.generateTemplateImage(
      template,
      templatePath,
      optimized.optimizedEditPrompt,
      imageSettings,
      formatOnly ? '' : stylePath,
      optimized.hasStyleReference,
      signalKey,
      onProgress,
    );

    return {
      templateId,
      templatePath,
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
      templateWidth: dims?.width || 0,
      templateHeight: dims?.height || 0,
      outputWidth: imageSettings.outputWidth || 0,
      outputHeight: imageSettings.outputHeight || 0,
      refsForwardedToCodex: image.refsForwardedToCodex,
      referenceAttachmentCount: image.referenceAttachmentCount,
    };
  }
}

module.exports = {
  TemplateEditPipeline,
  isFormatOnlyEdit,
  buildTemplateEditReferences,
};
