'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../paths');
const debugLog = require('../debug/logger');
const {
  buildImageAttachments,
  buildImageApiPayload,
  collectReferencePaths,
} = require('./image-request');
const {
  runImagePreflight,
  computePreflightFingerprint,
} = require('./image-preflight');
const { resolveImageGenerationSettings } = require('./image-settings');
const { buildStageMaskPath } = require('./stage-mask');

class ImagePipeline {
  constructor(codexClient, templateRegistry) {
    this.client = codexClient;
    this.registry = templateRegistry;
  }

  async resolveFinalPrompt({
    promptData,
    settings,
    template,
    templatePath,
    attachments,
    productPaths,
    onProgress,
    signalKey,
  }) {
    const needsPreflight = attachments.hasProductReference || attachments.hasTemplateReference;
    if (!needsPreflight) {
      return {
        finalPrompt: promptData?.finalPrompt || promptData?.imagePrompt || '',
        preflightFingerprint: '',
      };
    }

    const fingerprint = computePreflightFingerprint(settings, templatePath, productPaths);

    const preflight = await runImagePreflight(this.client, {
      settings,
      promptData,
      template,
      productPath: attachments.productPaths[0] || '',
      layoutPath: attachments.hasTemplateReference ? templatePath : '',
      referenceImages: attachments.referenceImages,
      signalKey,
      onProgress,
    });

    return {
      finalPrompt: preflight.finalPrompt,
      preflightFingerprint: fingerprint,
    };
  }

  async generateViaBridge(promptData, settings, onProgress, signalKey, options = {}) {
    let template = null;
    let templatePath = '';
    if (settings.templateId && this.registry) {
      template = this.registry.getById(settings.templateId);
      if (template) {
        templatePath = this.registry.resolveTemplatePath(template);
      }
    }

    const productPaths = collectReferencePaths(settings.referenceImages);
    const templateDims = template ? await this.registry.getDimensions(template) : null;
    const imageSettings = resolveImageGenerationSettings(settings, templateDims);
    const enrichedPromptData = {
      ...promptData,
      productAnalysis: promptData?.productAnalysis || settings.productAnalysis || '',
    };

    const attachments = await buildImageAttachments(settings.referenceImages, templatePath, {
      attachTemplate: Boolean(templatePath),
    });

    const { finalPrompt, preflightFingerprint } = await this.resolveFinalPrompt({
      promptData: enrichedPromptData,
      settings: imageSettings,
      template,
      templatePath,
      attachments,
      productPaths,
      onProgress,
      signalKey,
    });

    const ranPreflight = attachments.hasProductReference || attachments.hasTemplateReference;
    if (ranPreflight && finalPrompt) {
      options.onPreflightComplete?.({
        preflightPrompt: finalPrompt,
        preflightFingerprint,
      });
    }

    if (!finalPrompt) {
      throw new Error('Kein Bild-Prompt für die KI-Generierung vorhanden.');
    }

    enrichedPromptData.finalPrompt = finalPrompt;

    let stageMaskPath = null;
    if (template?.productStage) {
      try {
        stageMaskPath = await buildStageMaskPath(template, templateDims, imageSettings.size);
        if (stageMaskPath) {
          debugLog.info('image-pipeline', 'Produktbühnen-Maske erzeugt', {
            maskPath: stageMaskPath,
            templateId: template.id,
          });
        }
      } catch (err) {
        debugLog.warn('image-pipeline', 'Produktbühnen-Maske konnte nicht erzeugt werden', { message: err.message });
      }
    }

    const apiPayload = buildImageApiPayload({
      promptData: enrichedPromptData,
      settings: imageSettings,
      template,
      referenceImages: attachments.referenceImages,
      attachmentPaths: attachments.attachmentPaths,
      frames: attachments.frames,
      hasProductReference: attachments.hasProductReference,
      hasTemplateReference: attachments.hasTemplateReference,
      maskPath: stageMaskPath,
    });

    let providerCapabilities = null;
    try {
      providerCapabilities = await this.client.getCapabilities();
    } catch (err) {
      debugLog.warn('image-pipeline', 'Codex-Capabilities nicht abrufbar', { message: err.message });
    }
    const providerSupportsRefs = providerCapabilities?.features?.image_reference_attachments === true;
    const providerSupportsMasks = providerCapabilities?.features?.image_masks === true;
    if (stageMaskPath && !providerSupportsMasks) {
      debugLog.info('image-pipeline', 'Layout-Maske vorbereitet, Provider unterstützt Masken noch nicht', {
        maskPath: stageMaskPath,
      });
    }
    const hasReferencePayload = attachments.referenceImages.length > 0
      || attachments.attachmentPaths.length > 0
      || attachments.frames.length > 0;
    if (hasReferencePayload && !providerSupportsRefs) {
      debugLog.warn('image-pipeline', 'Provider ohne image_reference_attachments – Referenzen nur per Preflight-Text', {
        providerVersion: providerCapabilities?.bridge?.version || providerCapabilities?.codex?.version || 'unknown',
      });
    }

    debugLog.info('image-pipeline', 'KI-Bildgenerierung mit Anhängen', {
      templateId: settings.templateId || '',
      templateName: template?.name || '',
      templateFile: template?.file || '',
      productRefs: attachments.productPaths.length,
      templateAttached: attachments.hasTemplateReference,
      referenceImages: attachments.referenceImages.length,
      frameBytes: attachments.frameMeta.map((m) => m.bytes),
      attachmentModes: [
        attachments.referenceImages.length ? 'reference_images' : null,
        attachments.attachmentPaths.length ? 'referenced_image_paths' : null,
        attachments.frames.length ? 'frames' : null,
      ].filter(Boolean),
      providerSupportsRefs,
      providerSupportsMasks,
      stageMaskPrepared: Boolean(stageMaskPath),
      providerVersion: providerCapabilities?.bridge?.version || providerCapabilities?.codex?.version || 'unknown',
      imageSize: imageSettings.size,
      imageSizeMode: imageSettings.sizeMode,
      imageQuality: imageSettings.quality,
    });

    let unsubscribe = () => {};
    if (onProgress) {
      unsubscribe = this.client.subscribeJobEvents((jobs) => {
        if (jobs.error) return;
        const active = jobs.active?.[0];
        onProgress({
          running_count: jobs.running_count,
          queued_count: jobs.queued_count,
          status: active?.status || 'running',
          elapsed_ms: active?.elapsed_ms || 0,
          session_output: active?.session_output || '',
          type: active?.type || 'images',
        });
      });
    }

    try {
      const result = await this.client.images(apiPayload, signalKey);
      const attachmentMode = result._attachmentMode || 'unknown';
      const providerDetails = result?.response?.provider_details || {};
      const referenceAttachmentCount = Number(providerDetails.reference_attachment_count || 0);
      const refsForwardedToCodex = providerDetails.refs_forwarded_to_codex === true
        || referenceAttachmentCount > 0;

      debugLog.info('image-pipeline', 'Bildgenerierung abgeschlossen', {
        attachmentMode,
        referenceCount: attachments.referenceImages.length,
        refsForwardedToCodex,
        referenceAttachmentCount,
        providerSupportsRefs,
        providerSupportsMasks,
      });

      const b64 = result?.response?.data?.[0]?.b64_json;
      if (!b64) {
        throw new Error('Keine Bilddaten vom Codex-Provider erhalten.');
      }

      const outPath = path.join(paths.tempPreviewDir(), `preview-${Date.now()}.png`);
      fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
      return {
        success: true,
        path: outPath,
        b64,
        result,
        composited: false,
        attachmentMode,
        preflightPrompt: finalPrompt,
        preflightFingerprint,
        refsForwardedToCodex,
        providerSupportsRefs,
        providerSupportsMasks,
        referenceAttachmentCount,
        stageMaskPrepared: Boolean(stageMaskPath),
      };
    } finally {
      unsubscribe();
    }
  }

  async generateImage(promptData, settings, onProgress, signalKey, options = {}) {
    const productPaths = collectReferencePaths(settings.referenceImages);
    const hasPrompt = Boolean(
      promptData?.finalPrompt
      || promptData?.imagePrompt
      || promptData?.optimizedEditPrompt
      || settings?.preflightPrompt,
    );
    const canRunPreflight = productPaths.length > 0 && settings.templateId;
    if (!hasPrompt && !canRunPreflight) {
      throw new Error('Kein Bild-Prompt vorhanden.');
    }

    return this.generateViaBridge(promptData, settings, onProgress, signalKey, options);
  }
}

module.exports = { ImagePipeline };
