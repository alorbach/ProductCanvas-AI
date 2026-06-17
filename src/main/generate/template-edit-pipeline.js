'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../paths');
const debugLog = require('../debug/logger');
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

class TemplateEditPipeline {
  constructor(bridgeClient, templateRegistry) {
    this.client = bridgeClient;
    this.registry = templateRegistry;
  }

  async optimizeEditPrompt(template, templatePath, changeRequest, imageSettings, signalKey, onProgress) {
    onProgress?.({ status: 'running', messageKey: 'wait.status.templateEditPrompt' });

    const referenceImage = await buildReferenceImageEntry(templatePath, 'layout');
    if (!referenceImage) {
      throw new Error('Vorlagenbild konnte nicht gelesen werden.');
    }

    const taskPrompt = buildTemplateEditFrozenRules(changeRequest, imageSettings);
    const model = 'codex-local:auto';
    let messages = buildPreflightMessages(taskPrompt, [referenceImage], { model });

    let result;
    try {
      result = await this.client.chat({ model, messages, max_tokens: 2048 }, signalKey);
    } catch (err) {
      if (!gatewayErrorNeedsResponsesContentParts(err)) throw err;
      messages = buildPreflightMessages(taskPrompt, [referenceImage], {
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

    return {
      optimizedEditPrompt,
      changeSummary: String(parsed?.changeSummary || '').trim(),
      preservedElements: parsed?.preservedElements || [],
      referenceImage,
    };
  }

  buildFormatOnlyEdit(template, imageSettings, templateDims) {
    const optimizedEditPrompt = buildResizeOnlyPrompt(template, imageSettings, templateDims);
    return {
      optimizedEditPrompt,
      changeSummary: formatResizeSummary(imageSettings),
      preservedElements: ['Header', 'Footer', 'Layout', 'Farben', 'Neon-Rahmen'],
    };
  }

  async generateTemplateImage(template, templatePath, optimizedEditPrompt, imageSettings, signalKey, onProgress) {
    onProgress?.({ status: 'running', messageKey: 'wait.status.templateEditImage' });

    const referenceImage = await buildReferenceImageEntry(templatePath, 'layout');
    if (!referenceImage) {
      throw new Error('Vorlagenbild konnte nicht gelesen werden.');
    }

    let bridgeCapabilities = null;
    try {
      bridgeCapabilities = await this.client.getCapabilities();
    } catch (err) {
      debugLog.warn('template-edit-pipeline', 'Bridge-Capabilities nicht abrufbar', { message: err.message });
    }

    const prompt = appendLayoutLockBlock(optimizedEditPrompt, template, imageSettings);
    const apiPayload = {
      model: 'codex-local:image',
      prompt,
      size: imageSettings.size,
      quality: imageSettings.quality,
      requireReferences: true,
      reference_images: [referenceImage],
    };

    debugLog.info('template-edit-pipeline', 'Vorlagen-Edit Bildgenerierung', {
      templateId: template.id,
      templateName: template.name,
      imageSize: imageSettings.size,
      imageSizeMode: imageSettings.sizeMode,
      imageQuality: imageSettings.quality,
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

  async runTemplateEdit({ templateId, changeRequest, quality, size }, onProgress, signalKey) {
    const template = this.registry.getById(templateId);
    if (!template) throw new Error('Vorlage nicht gefunden.');

    const templatePath = this.registry.resolveTemplatePath(template);
    const dims = await this.registry.getDimensions(template);
    const imageSettings = resolveImageGenerationSettings(
      { size: size || 'template', quality },
      dims,
    );

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
        signalKey,
        onProgress,
      );

    const image = await this.generateTemplateImage(
      template,
      templatePath,
      optimized.optimizedEditPrompt,
      imageSettings,
      signalKey,
      onProgress,
    );

    return {
      templateId,
      templatePath,
      changeRequest: changeRequest || '',
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
};
