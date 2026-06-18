'use strict';

const fs = require('fs');
const path = require('path');
const {
  isImagePath,
} = require('./image-prep');
const { buildReferenceImageEntries } = require('./image-preflight');
const {
  appendLayoutLockBlock,
  buildTemplateLayoutHint,
  sanitizePreflightPrompt,
} = require('./layout-fidelity');
const {
  normalizeQuality,
} = require('./image-settings');

const PRODUCT_FIDELITY_BLOCK = [
  'CRITICAL PRODUCT FIDELITY — HIGHEST PRIORITY:',
  'The attached product reference photo is the ONLY source for product appearance.',
].join(' ');

const DUAL_REFERENCE_MIX_BLOCK = [
  'TWO ATTACHED REFERENCE IMAGES — merge them as follows:',
  'IMAGE 1 = PRODUCT REFERENCE; IMAGE 2 = LAYOUT TEMPLATE.',
].join(' ');

const ANALYZE_PRODUCT_PROMPT = `Analysiere das Produktbild für eine Werbeanzeige. Antworte auf Deutsch, strukturiert und präzise:
- Exakte Stückzahl und Typ jedes Geräts (z. B. Standlautsprecher, Center, Regal, Subwoofer)
- Hochtöner: Form (z. B. rechteckiger Folded-Motion-Tweeter mit horizontalen Lamellen)
- Tieftöner/Mitteltöner: Anzahl, Größe, Konus-Textur, Material
- Gehäuse: Farbe, Finish (matt/seidenmatt), Kanten, Fuß/Stand
- Logo: Form, Position, Farbe
- Gesamtanordnung im Bild
Wichtig: Nichts hinzuerfinden, nichts weglassen. Nur sichtbare Details beschreiben.`;

const MAX_IMAGE_ATTACHMENTS = 2;

function appendFidelityToImagePrompt(imagePrompt, hasReferenceImages, hasLayoutTemplate = false) {
  const base = String(imagePrompt || '').trim();
  if (!hasReferenceImages) return base;
  if (base.toUpperCase().includes('TWO ATTACHED REFERENCE IMAGES')) return base;
  if (hasLayoutTemplate) {
    const block = DUAL_REFERENCE_MIX_BLOCK;
    return base ? `${base}\n\n${block}` : block;
  }
  if (base.toUpperCase().includes('CRITICAL PRODUCT FIDELITY')) return base;
  return base ? `${base}\n\n${PRODUCT_FIDELITY_BLOCK}` : PRODUCT_FIDELITY_BLOCK;
}

function normalizeRefOptions(refOptions) {
  if (typeof refOptions === 'boolean') {
    return {
      hasProductReference: refOptions,
      hasTemplateReference: false,
    };
  }
  return {
    hasProductReference: Boolean(refOptions?.hasProductReference),
    hasTemplateReference: Boolean(refOptions?.hasTemplateReference),
  };
}

function buildImageGenerationPrompt(promptData, refOptions) {
  const { hasProductReference, hasTemplateReference } = normalizeRefOptions(refOptions);
  const parts = [];
  const finalPrompt = String(promptData?.finalPrompt || promptData?.imagePrompt || '').trim();
  if (finalPrompt) parts.push(finalPrompt);

  if (hasProductReference && hasTemplateReference) {
    parts.push('Reference order: Image 1 = exact products from product photo; Image 2 = layout/branding from template. Copy neon accent color from Image 2 exactly. Photorealistic merge, not a collage.');
  } else if (hasProductReference) {
    parts.push('Reference: match attached product photo exactly.');
  } else if (hasTemplateReference) {
    parts.push('Reference: match attached layout template for structure and branding.');
  }

  return parts.filter(Boolean).join('\n\n');
}

function collectReferencePaths(referenceImages) {
  return (referenceImages || [])
    .map((r) => (typeof r === 'string' ? r : r?.path))
    .filter((p) => p && fs.existsSync(p) && isImagePath(p))
    .map((p) => path.resolve(p));
}

async function buildImageAttachments(referenceImages, templatePath, options = {}) {
  const attachTemplate = options.attachTemplate !== false
    && templatePath
    && fs.existsSync(templatePath)
    && isImagePath(templatePath);

  const productPaths = collectReferencePaths(referenceImages);
  const maxProducts = attachTemplate ? MAX_IMAGE_ATTACHMENTS - 1 : MAX_IMAGE_ATTACHMENTS;
  const selectedProducts = productPaths.slice(0, Math.max(maxProducts, 0));

  const productPath = selectedProducts[0] || '';
  const layoutPath = attachTemplate ? path.resolve(templatePath) : '';

  const referenceImagesEntries = await buildReferenceImageEntries({ productPath, layoutPath });

  const attachmentPaths = [...selectedProducts];
  if (layoutPath && !attachmentPaths.includes(layoutPath)) {
    attachmentPaths.push(layoutPath);
  }

  return {
    productPaths: selectedProducts,
    attachmentPaths,
    referenceImages: referenceImagesEntries,
    frames: [],
    frameMeta: [],
    hasProductReference: selectedProducts.length > 0,
    hasTemplateReference: Boolean(layoutPath),
  };
}

function buildImageApiPayload({
  promptData,
  settings,
  template,
  referenceImages,
  attachmentPaths,
  frames,
  hasProductReference,
  hasTemplateReference,
  maskPath,
}) {
  const requireReferences = hasProductReference || hasTemplateReference;
  let prompt = buildImageGenerationPrompt(promptData, {
    hasProductReference,
    hasTemplateReference,
  });
  prompt = sanitizePreflightPrompt(prompt, {
    allowGoldHeader: Boolean(settings?.extraPrompt && /gold/i.test(settings.extraPrompt)),
  });
  if (hasTemplateReference && template) {
    prompt = appendLayoutLockBlock(prompt, template, settings);
  }

  const payload = {
    model: 'codex-local:image',
    prompt,
    size: settings.size || '1536x1024',
    quality: normalizeQuality(settings.quality),
    requireReferences,
  };

  if (referenceImages?.length) {
    const encodedRefs = referenceImages.filter((r) => r.b64_json);
    if (encodedRefs.length) {
      payload.reference_images = encodedRefs;
    }
  }
  if (attachmentPaths?.length) {
    payload.referenced_image_paths = attachmentPaths;
  }
  if (frames?.length) {
    payload.frames = frames;
  }
  if (maskPath) {
    payload.mask_path = maskPath;
  }

  return payload;
}

module.exports = {
  PRODUCT_FIDELITY_BLOCK,
  DUAL_REFERENCE_MIX_BLOCK,
  ANALYZE_PRODUCT_PROMPT,
  MAX_IMAGE_ATTACHMENTS,
  appendFidelityToImagePrompt,
  buildImageGenerationPrompt,
  buildTemplateLayoutHint,
  collectReferencePaths,
  buildImageAttachments,
  buildImageApiPayload,
};
