'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { isImagePath } = require('./image-prep');

const PREFLIGHT_REF_MAX_EDGE = 1024;
const PREFLIGHT_JPEG_QUALITY = 88;

function buildTemplateLayoutHint(template, options = {}) {
  if (!template) return '';
  const categories = (template.categories || []).join(', ');
  const lines = [
    `Selected layout template: "${template.name}" (${template.importedFrom || template.file || 'user template'}).`,
  ];
  if (options.layoutImageAttached) {
    lines.push(
      'IMAGE 2 is authoritative for neon accent color, header, footer, contact bar, typography zones, and stage framing.',
      'Copy accent and layout colors from IMAGE 2 exactly — never override with a different neon color.',
    );
  } else {
    lines.push(`Accent hint: ${template.accentHex || template.accent}.`);
    lines.push(`Stage: ${template.stageHint || 'dark showroom with neon side bars'}.`);
  }
  lines.push(
    'Gold typography for brand/series/tagline. Footer categories: ' + categories + '.',
    `Highlight category: ${template.categories?.[0] || 'LAUTSPRECHER'}.`,
  );
  return lines.join(' ');
}

function getChoiceContent(result) {
  return result?.response?.choices?.[0]?.message?.content || '';
}

async function buildReferenceImageEntry(filePath, label, maxPx = PREFLIGHT_REF_MAX_EDGE) {
  if (!filePath || !fs.existsSync(filePath) || !isImagePath(filePath)) {
    return null;
  }
  const meta = await sharp(filePath).rotate().metadata();
  const buffer = await sharp(filePath)
    .rotate()
    .resize(maxPx, maxPx, { fit: 'inside', withoutEnlargement: false })
    .jpeg({ quality: PREFLIGHT_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  const outMeta = await sharp(buffer).metadata();
  return {
    label,
    path: path.resolve(filePath),
    b64_json: buffer.toString('base64'),
    mime_type: 'image/jpeg',
    width: outMeta.width || meta.width || 0,
    height: outMeta.height || meta.height || 0,
    original_width: meta.width || 0,
    original_height: meta.height || 0,
    max_px: maxPx,
  };
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
  const lines = [
    'Create a TELE-KOHLGRAF retail advertisement image using the attached reference image(s).',
    'Return ONLY the final English image-edit prompt — no explanation, no markdown, no JSON.',
    '',
    'Rules:',
    '- IMAGE 1 (product): copy exact product models, driver layout, tweeter panels, logos, finishes.',
    '- IMAGE 2 (layout template): copy header, footer, contact bar, neon accent color, typography zones, stage framing exactly from the attached image.',
    '- The neon side-bar color in IMAGE 2 is mandatory (e.g. blue template = blue neon, not yellow).',
    '- Merge products from Image 1 into the layout structure of Image 2 photorealistically.',
    '- Do NOT invent different products. Do NOT use products from the layout template image.',
    '',
    `Brand: ${promptData?.brandName || settings?.brandName || '–'}`,
    `Series: ${promptData?.seriesName || settings?.seriesName || '–'}`,
    `Tagline: ${promptData?.tagline || settings?.tagline || '–'}`,
    `Category: ${promptData?.productCategory || settings?.productCategory || 'LAUTSPRECHER'}`,
    `Extra: ${settings?.extraPrompt || '–'}`,
  ];
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
      content: 'You are WerbungMaker image prompt preflight. Analyze attached images and return only the final concise English image-edit prompt. Preserve exact-match requirements. No markdown fences.',
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
    size: settings?.size || '',
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
  let result;
  try {
    result = await bridgeClient.chat({
      model,
      messages,
      max_tokens: 1800,
    }, signalKey);
  } catch (err) {
    if (!gatewayErrorNeedsResponsesContentParts(err)) {
      throw err;
    }
    messages = buildPreflightMessages(taskPrompt, referenceImages, {
      model,
      forceResponsesContentParts: true,
    });
    result = await bridgeClient.chat({
      model,
      messages,
      max_tokens: 1800,
    }, signalKey);
  }

  const finalPrompt = getChoiceContent(result).trim().replace(/^["']|["']$/g, '');
  if (!finalPrompt) {
    throw new Error('Bild-Preflight hat keinen finalen Prompt geliefert.');
  }

  return {
    finalPrompt,
    referenceImages,
    preflightTaskPrompt: taskPrompt,
  };
}

module.exports = {
  PREFLIGHT_REF_MAX_EDGE,
  buildReferenceImageEntry,
  buildReferenceImageEntries,
  buildPreflightTaskPrompt,
  buildPreflightMessages,
  buildTemplateLayoutHint,
  chatModelUsesResponsesContentParts,
  computePreflightFingerprint,
  gatewayErrorNeedsResponsesContentParts,
  runImagePreflight,
};
