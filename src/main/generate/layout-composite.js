'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const paths = require('../paths');
const { parseSize } = require('./stage-mask');

function parseExplicitSize(size) {
  const match = String(size || '').match(/^(\d+)x(\d+)$/i);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function scaleProductStage(stage, templateDims, canvas) {
  if (!stage || !canvas?.width || !canvas?.height) return null;
  const { width, height } = canvas;
  const srcW = templateDims?.width || width;
  const srcH = templateDims?.height || height;
  if (!srcW || !srcH) return null;

  const scaleX = width / srcW;
  const scaleY = height / srcH;
  const left = Math.max(0, Math.round(stage.x * scaleX));
  const top = Math.max(0, Math.round(stage.y * scaleY));
  const stageW = Math.max(1, Math.round(stage.width * scaleX));
  const stageH = Math.max(1, Math.round(stage.height * scaleY));
  const extractW = Math.min(stageW, width - left);
  const extractH = Math.min(stageH, height - top);
  if (extractW < 1 || extractH < 1) return null;

  return {
    width,
    height,
    left,
    top,
    extractWidth: extractW,
    extractHeight: extractH,
  };
}

/**
 * Prefer explicit WxH output size; for `auto`/unknown use the generated image's native size
 * so compositing does not force the parseSize fallback (1536x1024).
 */
async function resolveCompositeCanvas(generatedPath, outputSize, template, templateDims) {
  const explicit = parseExplicitSize(outputSize);
  if (explicit) return explicit;

  try {
    const meta = await sharp(generatedPath).rotate().metadata();
    if (meta.width && meta.height) {
      return { width: meta.width, height: meta.height };
    }
  } catch {
    // fall through
  }

  const width = templateDims?.width || template?.width || parseSize(outputSize).width;
  const height = templateDims?.height || template?.height || parseSize(outputSize).height;
  return { width, height };
}

/**
 * Paste frozen layout zones (everything outside productStage) from the template
 * onto the generated image so header/footer band heights stay pixel-identical.
 *
 * @returns {Promise<{ path: string, b64: string, applied: true } | { applied: false, reason: string }>}
 */
async function compositeFrozenLayoutZones({
  generatedPath,
  templatePath,
  template,
  templateDims,
  outputSize,
  outPath,
}) {
  const stage = template?.productStage;
  if (!stage) {
    return { applied: false, reason: 'no_product_stage' };
  }
  if (!generatedPath || !fs.existsSync(generatedPath)) {
    return { applied: false, reason: 'missing_generated' };
  }
  if (!templatePath || !fs.existsSync(templatePath)) {
    return { applied: false, reason: 'missing_template' };
  }

  const canvas = await resolveCompositeCanvas(
    generatedPath,
    outputSize,
    template,
    {
      width: templateDims?.width || template?.width,
      height: templateDims?.height || template?.height,
    },
  );

  const scaled = scaleProductStage(
    stage,
    {
      width: templateDims?.width || template?.width,
      height: templateDims?.height || template?.height,
    },
    canvas,
  );
  if (!scaled) {
    return { applied: false, reason: 'invalid_stage' };
  }

  const { width, height, left, top, extractWidth, extractHeight } = scaled;

  const srcW = templateDims?.width || template?.width || width;
  const srcH = templateDims?.height || template?.height || height;
  const templateAspect = srcW / srcH;
  const outputAspect = width / height;
  if (Math.abs(templateAspect - outputAspect) > 0.02) {
    return { applied: false, reason: 'aspect_mismatch' };
  }

  const templateBase = await sharp(templatePath)
    .rotate()
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .png()
    .toBuffer();

  const stagePatch = await sharp(generatedPath)
    .rotate()
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .extract({
      left,
      top,
      width: extractWidth,
      height: extractHeight,
    })
    .png()
    .toBuffer();

  const targetPath = outPath || path.join(paths.tempPreviewDir(), `layout-composite-${Date.now()}.png`);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  const pngBuffer = await sharp(templateBase)
    .composite([{ input: stagePatch, left, top }])
    .png()
    .toBuffer();

  fs.writeFileSync(targetPath, pngBuffer);

  return {
    applied: true,
    path: targetPath,
    b64: pngBuffer.toString('base64'),
    stageRect: { left, top, width: extractWidth, height: extractHeight },
    canvas: { width, height },
  };
}

module.exports = {
  scaleProductStage,
  resolveCompositeCanvas,
  compositeFrozenLayoutZones,
};
