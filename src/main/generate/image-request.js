'use strict';

const {
  appendLayoutLockBlock,
  buildTemplateLayoutHint,
  sanitizePreflightPrompt,
} = require('./layout-fidelity');
const {
  normalizeQuality,
} = require('./image-settings');
const { buildReferenceImageEntries } = require('./image-preflight');
const {
  collectReferencePaths,
  collectReferenceRefs,
  selectReferencesForWerbung,
  buildReferenceOrderBlock,
  MAX_WERBUNG_ATTACHMENTS,
} = require('./reference-roles');

const PRODUCT_FIDELITY_BLOCK = [
  'CRITICAL PRODUCT FIDELITY — HIGHEST PRIORITY:',
  'The attached product reference photo is the ONLY source for product appearance.',
].join(' ');

const ANALYZE_PRODUCT_PROMPT = `Analysiere das Produktbild für eine Werbeanzeige. Antworte auf Deutsch, strukturiert und präzise:
- Exakte Stückzahl und Typ jedes Geräts (z. B. Standlautsprecher, Center, Regal, Subwoofer)
- Hochtöner: Form (z. B. rechteckiger Folded-Motion-Tweeter mit horizontalen Lamellen)
- Tieftöner/Mitteltöner: Anzahl, Größe, Konus-Textur, Material
- Gehäuse: Farbe, Finish (matt/seidenmatt), Kanten, Fuß/Stand
- Logo: Form, Position, Farbe
- Gesamtanordnung im Bild
Wichtig: Nichts hinzuerfinden, nichts weglassen. Nur sichtbare Details beschreiben.`;

function appendFidelityToImagePrompt(imagePrompt, hasReferenceImages, attachmentPlan = null) {
  const base = String(imagePrompt || '').trim();
  if (!hasReferenceImages) return base;
  if (base.toUpperCase().includes('ATTACHED REFERENCE IMAGES')) return base;
  const orderBlock = buildReferenceOrderBlock(attachmentPlan);
  if (orderBlock) {
    return base ? `${base}\n\n${orderBlock}` : orderBlock;
  }
  if (base.toUpperCase().includes('CRITICAL PRODUCT FIDELITY')) return base;
  return base ? `${base}\n\n${PRODUCT_FIDELITY_BLOCK}` : PRODUCT_FIDELITY_BLOCK;
}

function normalizeRefOptions(refOptions) {
  if (typeof refOptions === 'boolean') {
    return {
      hasProductReference: refOptions,
      hasTemplateReference: false,
      attachmentPlan: [],
    };
  }
  return {
    hasProductReference: Boolean(refOptions?.hasProductReference),
    hasTemplateReference: Boolean(refOptions?.hasTemplateReference),
    attachmentPlan: Array.isArray(refOptions?.attachmentPlan) ? refOptions.attachmentPlan : [],
  };
}

function buildImageGenerationPrompt(promptData, refOptions) {
  const { hasProductReference, hasTemplateReference, attachmentPlan } = normalizeRefOptions(refOptions);
  const parts = [];
  const finalPrompt = String(promptData?.finalPrompt || promptData?.imagePrompt || '').trim();
  if (finalPrompt) parts.push(finalPrompt);

  const orderBlock = buildReferenceOrderBlock(attachmentPlan);
  if (orderBlock && (hasProductReference || hasTemplateReference)) {
    parts.push(orderBlock);
  } else if (hasProductReference) {
    parts.push('Reference: match attached product photo exactly.');
  } else if (hasTemplateReference) {
    parts.push('Reference: match attached layout template for structure and branding.');
  }

  return parts.filter(Boolean).join('\n\n');
}

async function buildImageAttachments(referenceImages, templatePath, options = {}) {
  const selection = selectReferencesForWerbung(referenceImages, {
    templatePath,
    attachTemplate: options.attachTemplate !== false,
    maxSlots: MAX_WERBUNG_ATTACHMENTS,
  });

  const referenceImagesEntries = await buildReferenceImageEntries({
    productRefs: selection.refs.map((r) => ({ path: r.path, role: r.role, label: r.label })),
    layoutPath: selection.layoutPath,
  });

  const hasProductReference = selection.refs.length > 0;
  const hasTemplateReference = Boolean(selection.layoutPath);

  return {
    productPaths: selection.productPaths,
    attachmentPaths: selection.attachmentPaths,
    referenceImages: referenceImagesEntries,
    attachmentPlan: selection.attachmentPlan,
    skippedRefs: selection.skipped,
    primaryDetailPath: selection.primaryDetailPath,
    frames: [],
    frameMeta: [],
    hasProductReference,
    hasTemplateReference,
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
  attachmentPlan,
  maskPath,
}) {
  const requireReferences = hasProductReference || hasTemplateReference;
  let prompt = buildImageGenerationPrompt(promptData, {
    hasProductReference,
    hasTemplateReference,
    attachmentPlan,
  });
  prompt = sanitizePreflightPrompt(prompt, {
    allowGoldHeader: Boolean(settings?.extraPrompt && /gold/i.test(settings.extraPrompt)),
  });
  if (hasTemplateReference && template) {
    prompt = appendLayoutLockBlock(prompt, template, settings, attachmentPlan);
  }

  const payload = {
    model: 'codex-local:image',
    prompt,
    size: settings.size || '1536x1024',
    quality: normalizeQuality(settings.quality),
    requireReferences,
    attachment_plan: attachmentPlan || [],
  };

  if (referenceImages?.length) {
    const encodedRefs = referenceImages.filter((r) => r.b64_json);
    if (encodedRefs.length) {
      payload.reference_images = encodedRefs;
    } else if (attachmentPaths?.length) {
      payload.referenced_image_paths = attachmentPaths;
    }
  } else if (attachmentPaths?.length) {
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
  ANALYZE_PRODUCT_PROMPT,
  MAX_WERBUNG_ATTACHMENTS,
  appendFidelityToImagePrompt,
  buildImageGenerationPrompt,
  buildTemplateLayoutHint,
  collectReferencePaths,
  collectReferenceRefs,
  buildImageAttachments,
  buildImageApiPayload,
};
