'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const paths = require('../paths');

function parseSize(size) {
  const match = String(size || '').match(/^(\d+)x(\d+)$/i);
  if (!match) return { width: 1536, height: 1024 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

async function buildStageMaskPath(template, templateDims, outputSize) {
  const stage = template?.productStage;
  if (!stage) return null;

  const { width, height } = parseSize(outputSize);
  const srcW = templateDims?.width || template.width || width;
  const srcH = templateDims?.height || template.height || height;
  if (!srcW || !srcH) return null;

  const scaleX = width / srcW;
  const scaleY = height / srcH;
  const rx = Math.max(0, Math.round(stage.x * scaleX));
  const ry = Math.max(0, Math.round(stage.y * scaleY));
  const rw = Math.max(1, Math.round(stage.width * scaleX));
  const rh = Math.max(1, Math.round(stage.height * scaleY));

  const channels = 4;
  const data = Buffer.alloc(width * height * channels, 0);
  const xEnd = Math.min(rx + rw, width);
  const yEnd = Math.min(ry + rh, height);
  for (let y = ry; y < yEnd; y += 1) {
    for (let x = rx; x < xEnd; x += 1) {
      const idx = (y * width + x) * channels;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }

  const outDir = paths.tempPreviewDir();
  fs.mkdirSync(outDir, { recursive: true });
  const maskPath = path.join(outDir, `stage-mask-${Date.now()}.png`);
  await sharp(data, { raw: { width, height, channels } }).png().toFile(maskPath);
  return maskPath;
}

module.exports = {
  parseSize,
  buildStageMaskPath,
};
