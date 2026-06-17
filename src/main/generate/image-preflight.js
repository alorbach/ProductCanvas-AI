'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { isImagePath, MAX_BRIDGE_FRAME_BYTES } = require('./image-prep');
const {
  LAYOUT_EDITABLE_RULES,
  LAYOUT_FROZEN_RULES,
  buildProductStageHint,
  buildTemplateLayoutHint,
  sanitizePreflightPrompt,
} = require('./layout-fidelity');

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

async function buildReferencePathEntry(filePath, label) {
  if (!filePath || !fs.existsSync(filePath) || !isImagePath(filePath)) {
    return null;
  }
  const { width, height } = await readReferenceImageMeta(filePath);
  return {
    label,
    path: path.resolve(filePath),
    width,
    height,
    original_width: width,
    original_height: height,
  };
}

async function encodeReferenceImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const meta = await sharp(filePath).rotate().metadata();
  let buffer;
  let mime_type;
  if (ext === '.png' || ext === '.webp') {
    buffer = await sharp(filePath).rotate().png().toBuffer();
    mime_type = 'image/png';
  } else {
    buffer = await sharp(filePath)
      .rotate()
      .jpeg({ quality: PREFLIGHT_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    mime_type = 'image/jpeg';
  }
  if (buffer.length > MAX_BRIDGE_FRAME_BYTES) {
    const name = path.basename(filePath);
    throw new Error(
      `Referenzbild „${name}“ ist zu groß (${Math.round(buffer.length / 1024)} KB). Bitte eine kleinere Datei verwenden – die App skaliert Referenzen nicht mehr automatisch.`,
    );
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

async function buildReferenceImageEntry(filePath, label) {
  if (!filePath || !fs.existsSync(filePath) || !isImagePath(filePath)) {
    return null;
  }
  try {
    const fileSize = fs.statSync(filePath).size;
    if (fileSize > MAX_BRIDGE_FRAME_BYTES) {
      return buildReferencePathEntry(filePath, label);
    }
    const encoded = await encodeReferenceImage(filePath);
    return {
      label,
      path: path.resolve(filePath),
      b64_json: encoded.buffer.toString('base64'),
      mime_type: encoded.mime_type,
      width: encoded.width,
      height: encoded.height,
      original_width: encoded.original_width,
      original_height: encoded.original_height,
    };
  } catch (err) {
    if (/zu groß/i.test(String(err?.message || ''))) {
      return buildReferencePathEntry(filePath, label);
    }
    throw err;
  }
}

async function buildReferenceImageEntries({ productPath, layoutPath } = {}) {
  const entries = [];
  if (productPath) {
    const product = await buildReferenceImageEntry(productPath, 'product');
    if (product) entries.push(product);
  }
  if (layoutPath) {
    const layout = await buildReferenceImageEntry(layoutPath, 'layout');
    if (layout) entries.push(layout);
  }
  return entries;
}

function buildPreflightTaskPrompt({ settings, promptData, template }) {
  const templateHint = buildTemplateLayoutHint(template, { layoutImageAttached: true });
  const size = String(settings?.size || '').trim();
  const quality = String(settings?.quality || '').trim();
  const brand = String(promptData?.brandName || settings?.brandName || 'the brand').trim() || 'the brand';
  const lines = [
    `Create a photorealistic retail advertisement image for ${brand} using the attached reference image(s).`,
    'Return ONLY the final English image-edit prompt — no explanation, no markdown, no JSON.',
    '',
    'Rules:',
    '- IMAGE 1 (product): copy exact product models, driver layout, tweeter panels, logos, finishes.',
    '- IMAGE 2 (layout template): copy frozen layout zones exactly — header, footer, contact bar, brand text colors, icon row, neon accents.',
    '- The neon side-bar color in IMAGE 2 is mandatory (e.g. blue template = blue neon, not yellow).',
    '- Do NOT recolor header brand text to gold unless it is gold in IMAGE 2.',
    '- Do NOT add category highlight boxes or new footer emphasis.',
    '- Merge products from Image 1 into the product stage of Image 2 photorealistically.',
    '- Do NOT invent different products. Do NOT use products from the layout template image.',
    LAYOUT_FROZEN_RULES,
    LAYOUT_EDITABLE_RULES,
    '',
    `Brand: ${promptData?.brandName || settings?.brandName || '–'}`,
    `Series: ${promptData?.seriesName || settings?.seriesName || '–'}`,
    `Tagline: ${promptData?.tagline || settings?.tagline || '–'}`,
    `Category: ${promptData?.productCategory || settings?.productCategory || 'LAUTSPRECHER'}`,
    `Extra: ${settings?.extraPrompt || '–'}`,
    `Target output size: ${size || '1536x1024'}${settings?.sizeMode === 'template' ? ' (from selected layout template)' : ''}${settings?.sizeMode === 'template2x' ? ' (2× selected layout template)' : ''}`,
    `Preferred quality: ${quality || 'high'}`,
  ];
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

function computePreflightFingerprint(settings, templatePath, productPaths) {
  const payload = {
    templateId: settings?.templateId || '',
    templatePath: templatePath ? path.resolve(templatePath) : '',
    productPaths: (productPaths || []).map((p) => path.resolve(p)).sort(),
    brandName: settings?.brandName || '',
    seriesName: settings?.seriesName || '',
    tagline: settings?.tagline || '',
    productCategory: settings?.productCategory || '',
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

  const taskPrompt = buildPreflightTaskPrompt({ settings, promptData, template });
  const model = 'codex-local:auto';
  let messages = buildPreflightMessages(taskPrompt, referenceImages, { model });
  const refPaths = (referenceImages || []).map((r) => r.path).filter(Boolean);
  const chatPayload = { model, messages, max_tokens: 1800 };
  if (refPaths.length) {
    chatPayload.referenced_image_paths = refPaths;
  }
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
  buildPreflightTaskPrompt,
  buildPreflightMessages,
  buildTemplateLayoutHint,
  chatModelUsesResponsesContentParts,
  computePreflightFingerprint,
  gatewayErrorNeedsResponsesContentParts,
  runImagePreflight,
};
