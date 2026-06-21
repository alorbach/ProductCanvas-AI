'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const paths = require('../paths');
const debugLog = require('../debug/logger');
const {
  isImagePath,
  MAX_BRIDGE_FRAME_BYTES,
  EFFECT_REFERENCE_MAX_EDGE,
  EFFECT_REFERENCE_JPEG_QUALITY,
  EFFECT_REFERENCE_MAX_BYTES,
  PRODUCT_REFERENCE_MAX_EDGE,
  PRODUCT_REFERENCE_JPEG_QUALITY,
  computePerAttachmentByteBudget,
} = require('./image-prep');
const {
  summarizeReferencePrep,
  emitReferencePrepProgress,
} = require('./reference-prep-report');
const {
  buildLayoutEditableRules,
  buildLayoutFrozenRules,
  buildProductStageHint,
  buildTemplateLayoutHint,
  sanitizePreflightPrompt,
} = require('./layout-fidelity');
const {
  buildReferenceOrderBlock,
  layoutImageIndex,
} = require('./reference-roles');

const PREFLIGHT_JPEG_QUALITY = 92;

function getChoiceContent(result) {
  return result?.response?.choices?.[0]?.message?.content || '';
}

async function readReferenceImageMeta(filePath) {
  const meta = await sharp(filePath).rotate().metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  return { width, height };
}

function resolveReferenceByteBudget(options = {}) {
  if (Number(options.byteBudget) > 0) return Number(options.byteBudget);
  return computePerAttachmentByteBudget(options.attachmentCount || 1, options.promptCharEstimate || 0);
}

async function encodeImageWithinBudget(resolved, byteBudget, maxEdge, startQuality) {
  let edge = maxEdge;
  let quality = startQuality;
  let buffer = null;
  while (edge >= 512) {
    quality = startQuality;
    while (quality >= 48) {
      buffer = await sharp(resolved)
        .rotate()
        .resize(edge, edge, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (buffer.length <= byteBudget) return buffer;
      quality -= 8;
    }
    edge = Math.floor(edge * 0.75);
  }
  return buffer || sharp(resolved).rotate().jpeg({ quality: 48, mozjpeg: true }).toBuffer();
}

async function prepareProductReferencePath(filePath, options = {}) {
  if (!filePath || !fs.existsSync(filePath) || !isImagePath(filePath)) {
    return filePath;
  }

  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  const meta = await sharp(resolved).rotate().metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const maxEdge = Math.max(width, height);
  const byteBudget = resolveReferenceByteBudget(options);
  const needsScale = maxEdge > PRODUCT_REFERENCE_MAX_EDGE || stat.size > byteBudget;
  if (!needsScale) {
    return resolved;
  }

  const cacheKey = crypto.createHash('sha256').update(JSON.stringify({
    path: resolved,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    maxEdge: PRODUCT_REFERENCE_MAX_EDGE,
    quality: PRODUCT_REFERENCE_JPEG_QUALITY,
    byteBudget,
    kind: 'product-ref',
  })).digest('hex').slice(0, 16);
  const outPath = path.join(paths.tempPreviewDir(), `ref-${cacheKey}.jpg`);
  if (fs.existsSync(outPath)) {
    return outPath;
  }

  const buffer = await encodeImageWithinBudget(
    resolved,
    byteBudget,
    PRODUCT_REFERENCE_MAX_EDGE,
    PRODUCT_REFERENCE_JPEG_QUALITY,
  );
  fs.writeFileSync(outPath, buffer);
  const outMeta = await sharp(buffer).metadata();
  debugLog.info('image-preflight', 'Referenzbild für Codex herunterskaliert', {
    label: options.label || path.basename(resolved),
    source: resolved,
    output: outPath,
    originalBytes: stat.size,
    scaledBytes: buffer.length,
    byteBudget,
    originalSize: `${width}x${height}`,
    scaledSize: `${outMeta.width || 0}x${outMeta.height || 0}`,
  });
  return outPath;
}

async function buildReferencePathEntry(filePath, label, options = {}) {
  if (!filePath || !fs.existsSync(filePath) || !isImagePath(filePath)) {
    return null;
  }
  const sourcePath = path.resolve(filePath);
  const byteBudget = resolveReferenceByteBudget(options);
  const originalMeta = await readReferenceImageMeta(sourcePath);
  const preparedPath = await prepareProductReferencePath(sourcePath, {
    ...options,
    label,
  });
  const { width, height } = await readReferenceImageMeta(preparedPath);
  const prep = summarizeReferencePrep({
    label,
    sourcePath,
    preparedPath,
    originalWidth: originalMeta.width,
    originalHeight: originalMeta.height,
    width,
    height,
    byteBudget,
  });
  return {
    label,
    source_path: sourcePath,
    path: path.resolve(preparedPath),
    width,
    height,
    original_width: originalMeta.width,
    original_height: originalMeta.height,
    byteBudget,
    prep,
  };
}

async function encodeReferenceImage(filePath, options = {}) {
  const byteBudget = resolveReferenceByteBudget(options);
  const preparedPath = await prepareProductReferencePath(filePath, options);
  const ext = path.extname(preparedPath).toLowerCase();
  const meta = await sharp(preparedPath).rotate().metadata();
  let buffer;
  let mime_type;
  if (ext === '.png' || ext === '.webp') {
    buffer = await sharp(preparedPath).rotate().png().toBuffer();
    mime_type = 'image/png';
    if (buffer.length > byteBudget || buffer.length > MAX_BRIDGE_FRAME_BYTES) {
      buffer = await encodeImageWithinBudget(
        preparedPath,
        Math.min(byteBudget, MAX_BRIDGE_FRAME_BYTES),
        PRODUCT_REFERENCE_MAX_EDGE,
        PRODUCT_REFERENCE_JPEG_QUALITY,
      );
      mime_type = 'image/jpeg';
    }
  } else {
    buffer = await sharp(preparedPath)
      .rotate()
      .jpeg({ quality: PREFLIGHT_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    mime_type = 'image/jpeg';
    if (buffer.length > byteBudget || buffer.length > MAX_BRIDGE_FRAME_BYTES) {
      buffer = await encodeImageWithinBudget(
        preparedPath,
        Math.min(byteBudget, MAX_BRIDGE_FRAME_BYTES),
        PRODUCT_REFERENCE_MAX_EDGE,
        PREFLIGHT_JPEG_QUALITY,
      );
    }
  }
  const outMeta = await sharp(buffer).metadata();
  return {
    buffer,
    mime_type,
    width: outMeta.width || meta.width || 0,
    height: outMeta.height || meta.height || 0,
    original_width: meta.width || 0,
    original_height: meta.height || 0,
  };
}

async function buildReferenceImageEntry(filePath, label, options = {}) {
  if (!filePath || !fs.existsSync(filePath) || !isImagePath(filePath)) {
    return null;
  }
  const sourcePath = path.resolve(filePath);
  const entryOptions = { ...options, label };
  const byteBudget = resolveReferenceByteBudget(entryOptions);
  const encoded = await encodeReferenceImage(sourcePath, entryOptions);
  const preparedPath = await prepareProductReferencePath(sourcePath, entryOptions);
  const prep = summarizeReferencePrep({
    label,
    sourcePath,
    preparedPath,
    originalWidth: encoded.original_width,
    originalHeight: encoded.original_height,
    width: encoded.width,
    height: encoded.height,
    byteBudget,
  });
  return {
    label,
    source_path: sourcePath,
    path: path.resolve(preparedPath),
    b64_json: encoded.buffer.toString('base64'),
    mime_type: encoded.mime_type,
    width: encoded.width,
    height: encoded.height,
    original_width: encoded.original_width,
    original_height: encoded.original_height,
    byteBudget,
    prep,
  };
}

async function prepareEffectReferencePath(effectPath) {
  if (!effectPath || !fs.existsSync(effectPath) || !isImagePath(effectPath)) {
    return effectPath;
  }

  const resolved = path.resolve(effectPath);
  const stat = fs.statSync(resolved);
  const meta = await sharp(resolved).rotate().metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const maxEdge = Math.max(width, height);
  const needsScale = maxEdge > EFFECT_REFERENCE_MAX_EDGE || stat.size > EFFECT_REFERENCE_MAX_BYTES;
  if (!needsScale) {
    return resolved;
  }

  const cacheKey = crypto.createHash('sha256').update(JSON.stringify({
    path: resolved,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    maxEdge: EFFECT_REFERENCE_MAX_EDGE,
    quality: EFFECT_REFERENCE_JPEG_QUALITY,
    maxBytes: EFFECT_REFERENCE_MAX_BYTES,
  })).digest('hex').slice(0, 16);
  const outPath = path.join(paths.tempPreviewDir(), `effect-ref-${cacheKey}.jpg`);
  if (fs.existsSync(outPath)) {
    return outPath;
  }

  const buffer = await sharp(resolved)
    .rotate()
    .resize(EFFECT_REFERENCE_MAX_EDGE, EFFECT_REFERENCE_MAX_EDGE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: EFFECT_REFERENCE_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  fs.writeFileSync(outPath, buffer);
  const outMeta = await sharp(buffer).metadata();
  debugLog.info('image-preflight', 'Effektbild für Codex herunterskaliert', {
    source: resolved,
    output: outPath,
    originalBytes: stat.size,
    scaledBytes: buffer.length,
    originalSize: `${width}x${height}`,
    scaledSize: `${outMeta.width || 0}x${outMeta.height || 0}`,
  });
  return outPath;
}

async function buildReferenceImageEntries({ productPath, layoutPath, productRefs } = {}) {
  const refs = Array.isArray(productRefs) && productRefs.length
    ? productRefs
    : [
      ...(productPath ? [{ path: productPath, role: 'detail', label: 'product' }] : []),
    ];
  const plannedPaths = [
    ...refs.map((r) => r.path),
    layoutPath,
  ].filter((p) => p && fs.existsSync(p) && isImagePath(p));
  const attachmentCount = Math.max(plannedPaths.length, 1);
  const byteBudget = computePerAttachmentByteBudget(attachmentCount);
  const options = { byteBudget, attachmentCount };

  const entries = [];
  for (const ref of refs) {
    const label = ref.label || 'product';
    const entry = await buildReferenceImageEntry(ref.path, label, options);
    if (entry) {
      entry.role = ref.role || 'detail';
      entries.push(entry);
    }
  }
  if (layoutPath) {
    const layout = await buildReferenceImageEntry(layoutPath, 'layout', options);
    if (layout) {
      layout.role = 'layout';
      entries.push(layout);
    }
  }
  return entries;
}

function buildPreflightTaskPrompt({ settings, promptData, template, effectApplied, attachmentPlan }) {
  const plan = Array.isArray(attachmentPlan) ? attachmentPlan : [];
  const templateHint = buildTemplateLayoutHint(template, {
    layoutImageAttached: plan.some((e) => e.role === 'layout'),
    attachmentPlan: plan,
  });
  const size = String(settings?.size || '').trim();
  const quality = String(settings?.quality || '').trim();
  const brand = String(promptData?.brandName || settings?.brandName || 'the brand').trim() || 'the brand';
  const layoutIdx = layoutImageIndex(plan);
  const orderBlock = buildReferenceOrderBlock(plan);
  const frozenRules = buildLayoutFrozenRules(plan);
  const editableRules = buildLayoutEditableRules(plan);
  const lines = [
    `Create a photorealistic retail advertisement image for ${brand} using the attached reference image(s).`,
    'Return ONLY the final English image-edit prompt — no explanation, no markdown, no JSON.',
    '',
    'Rules:',
    orderBlock,
  ];
  if (layoutIdx > 0) {
    lines.push(
      `- The neon side-bar color in IMAGE ${layoutIdx} is mandatory (e.g. blue template = blue neon, not yellow).`,
      `- Do NOT recolor header brand text to gold unless it is gold in IMAGE ${layoutIdx}.`,
      '- Do NOT add category highlight boxes or new footer emphasis.',
      '- Do NOT invent different products. Do NOT use products from the layout template image.',
    );
  }
  lines.push(
    frozenRules,
    editableRules,
    '',
    `Main line: ${promptData?.brandName || settings?.brandName || '–'}`,
    `Ad line 1: ${promptData?.seriesName || settings?.seriesName || '–'}`,
    `Ad line 2: ${promptData?.tagline || settings?.tagline || '–'}`,
    `Extra: ${settings?.extraPrompt || '–'}`,
    `Target output size: ${size || '1536x1024'}${settings?.sizeMode === 'template' ? ' (from selected layout template)' : ''}${settings?.sizeMode === 'template2x' ? ' (2× selected layout template)' : ''}`,
    `Preferred quality: ${quality || 'high'}`,
  );
  if (effectApplied) {
    lines.push('Product reference already has the selected effect image applied as background — preserve that background style in the product stage.');
  }
  if (template) lines.push(buildProductStageHint(template));
  if (templateHint) lines.push(`Layout context: ${templateHint}`);
  if (promptData?.productDescription) lines.push(`Product details: ${promptData.productDescription}`);
  if (promptData?.productAnalysis) lines.push(`Product analysis:\n${promptData.productAnalysis}`);
  if (promptData?.placementInstructions) lines.push(`Placement: ${promptData.placementInstructions}`);
  return lines.join('\n');
}

function chatModelUsesResponsesContentParts(model) {
  const normalized = String(model || '').toLowerCase().trim();
  if (!normalized) return false;
  const bare = normalized.includes('::')
    ? normalized.slice(normalized.lastIndexOf('::') + 2)
    : normalized;
  return bare.includes('codex') || /^gpt-5(?:[._-]|$)/.test(bare);
}

function gatewayErrorNeedsResponsesContentParts(err) {
  const haystack = `${String(err?.message || '').toLowerCase()} ${JSON.stringify(err?.details || {})}`.toLowerCase();
  return haystack.includes("invalid value: 'text'")
    && haystack.includes('input_text')
    && haystack.includes('input_image');
}

function buildPreflightMessages(taskPrompt, referenceImages, options = {}) {
  const model = options.model || 'codex-local:auto';
  const useResponses = options.forceResponsesContentParts === true
    || (options.useResponsesContentParts !== false && chatModelUsesResponsesContentParts(model));
  const content = [{
    type: useResponses ? 'input_text' : 'text',
    text: taskPrompt,
  }];
  for (const image of referenceImages || []) {
    const b64 = String(image.b64_json || '').trim();
    if (!b64) continue;
    const mime = image.mime_type || 'image/jpeg';
    const dataUrl = `data:${mime};base64,${b64}`;
    if (useResponses) {
      content.push({ type: 'input_image', image_url: dataUrl });
    } else {
      content.push({
        type: 'image_url',
        image_url: { url: dataUrl },
      });
    }
  }
  return [
    {
      role: 'system',
      content: 'You are ProductCanvas AI image prompt preflight. Analyze attached images and return only the final concise English image-edit prompt. Preserve exact-match requirements. No markdown fences.',
    },
    { role: 'user', content },
  ];
}

function computePreflightFingerprint(settings, templatePath, productPaths, options = {}) {
  const referenceRoles = (options.referenceRoles || []).map((r) => ({
    path: path.resolve(r.path),
    role: r.role || 'detail',
  }));
  const payload = {
    templateId: settings?.templateId || '',
    effectId: settings?.effectId || '',
    effectApplied: Boolean(options.effectApplied),
    compositedProductPath: options.compositedProductPath
      ? path.resolve(options.compositedProductPath)
      : '',
    templatePath: templatePath ? path.resolve(templatePath) : '',
    productPaths: (productPaths || []).map((p) => path.resolve(p)).sort(),
    referenceRoles,
    brandName: settings?.brandName || '',
    seriesName: settings?.seriesName || '',
    tagline: settings?.tagline || '',
    extraPrompt: settings?.extraPrompt || '',
    size: settings?.sizeMode === 'template' || settings?.sizeMode === 'template2x'
      ? settings.sizeMode
      : (settings?.size || ''),
    sizeMode: settings?.sizeMode || '',
    quality: settings?.quality || '',
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function runImagePreflight(bridgeClient, {
  settings,
  promptData,
  template,
  productPath,
  layoutPath,
  referenceImages: existingRefs,
  attachmentPlan,
  effectApplied,
  signalKey,
  onProgress,
},) {
  const referenceImages = existingRefs?.length
    ? existingRefs
    : await buildReferenceImageEntries({ productPath, layoutPath });

  if (!referenceImages.length) {
    throw new Error('Keine Referenzbilder für Preflight vorhanden.');
  }

  onProgress?.({ status: 'running', messageKey: 'wait.status.imagePreflight' });

  const taskPrompt = buildPreflightTaskPrompt({
    settings,
    promptData,
    template,
    effectApplied,
    attachmentPlan,
  });
  const model = 'codex-local:auto';
  let messages = buildPreflightMessages(taskPrompt, referenceImages, { model });
  const chatPayload = { model, messages, max_tokens: 1800 };
  let result;
  try {
    result = await bridgeClient.chat(chatPayload, signalKey);
  } catch (err) {
    if (!gatewayErrorNeedsResponsesContentParts(err)) {
      throw err;
    }
    messages = buildPreflightMessages(taskPrompt, referenceImages, {
      model,
      forceResponsesContentParts: true,
    });
    chatPayload.messages = messages;
    result = await bridgeClient.chat(chatPayload, signalKey);
  }

  let finalPrompt = getChoiceContent(result).trim().replace(/^["']|["']$/g, '');
  if (!finalPrompt) {
    throw new Error('Bild-Preflight hat keinen finalen Prompt geliefert.');
  }
  finalPrompt = sanitizePreflightPrompt(finalPrompt, {
    allowGoldHeader: Boolean(settings?.extraPrompt && /gold/i.test(settings.extraPrompt)),
  });

  return {
    finalPrompt,
    referenceImages,
    preflightTaskPrompt: taskPrompt,
  };
}

module.exports = {
  buildReferenceImageEntry,
  buildReferencePathEntry,
  buildReferenceImageEntries,
  prepareEffectReferencePath,
  prepareProductReferencePath,
  encodeImageWithinBudget,
  buildPreflightTaskPrompt,
  buildPreflightMessages,
  buildTemplateLayoutHint,
  chatModelUsesResponsesContentParts,
  computePreflightFingerprint,
  gatewayErrorNeedsResponsesContentParts,
  runImagePreflight,
  emitReferencePrepProgress,
};
