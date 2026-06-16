'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const debugLog = require('../debug/logger');

const DEFAULT_OUTPUT = { width: 1536, height: 1024 };
const DEFAULT_STAGE = { x: 48, y: 200, width: 1440, height: 580 };
const DESIGN_SIZE = { width: 1536, height: 1024 };
const BLACK_KEY_THRESHOLD = 32;

function parseSize(sizeStr) {
  const m = String(sizeStr || '').match(/^(\d+)x(\d+)$/i);
  if (!m) return { ...DEFAULT_OUTPUT };
  return { width: Number(m[1]), height: Number(m[2]) };
}

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scaleStage(stage, outW, outH) {
  const sx = outW / DESIGN_SIZE.width;
  const sy = outH / DESIGN_SIZE.height;
  return {
    x: Math.round(stage.x * sx),
    y: Math.round(stage.y * sy),
    width: Math.round(stage.width * sx),
    height: Math.round(stage.height * sy),
  };
}

function scaleTextZone(zone, outW, outH) {
  const sx = outW / DESIGN_SIZE.width;
  const sy = outH / DESIGN_SIZE.height;
  return {
    x: Math.round(zone.x * sx),
    y: Math.round(zone.y * sy),
    fontSize: Math.max(12, Math.round((zone.fontSize || 18) * sx)),
  };
}

function fitInStage(imageWidth, imageHeight, stage) {
  if (!imageWidth || !imageHeight) {
    return { width: 0, height: 0, left: stage.x, top: stage.y };
  }
  const scale = Math.min(stage.width / imageWidth, stage.height / imageHeight);
  const width = Math.round(imageWidth * scale);
  const height = Math.round(imageHeight * scale);
  return {
    width,
    height,
    left: stage.x + Math.round((stage.width - width) / 2),
    top: stage.y + Math.round((stage.height - height) / 2),
  };
}

async function stripBlackBackground(inputBuffer, threshold = BLACK_KEY_THRESHOLD) {
  const { data, info } = await sharp(inputBuffer)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  const channels = info.channels;
  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    if (r <= threshold && g <= threshold && b <= threshold) {
      pixels[i + 3] = 0;
    }
  }

  return sharp(pixels, {
    raw: { width: info.width, height: info.height, channels },
  }).png().toBuffer();
}

function buildTextOverlaySvg({ width, height, template, promptData, settings }) {
  const zones = template.textZones || {};
  const gold = template.textGold || '#c9a227';
  const brand = escapeXml(promptData.brandName || settings.brandName || '');
  const series = escapeXml(promptData.seriesName || settings.seriesName || '');
  const tagline = escapeXml(promptData.tagline || settings.tagline || '');

  const parts = [`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`];

  if (brand && zones.brandName) {
    const z = scaleTextZone(zones.brandName, width, height);
    parts.push(
      `<text x="${z.x}" y="${z.y}" fill="${gold}" font-family="Georgia, 'Times New Roman', serif" font-size="${z.fontSize}" font-weight="bold">${brand}</text>`,
    );
  }
  if (series && zones.seriesName) {
    const z = scaleTextZone(zones.seriesName, width, height);
    parts.push(
      `<text x="${z.x}" y="${z.y}" fill="${gold}" font-family="Georgia, 'Times New Roman', serif" font-size="${z.fontSize}">${series}</text>`,
    );
  }
  if (tagline && zones.tagline) {
    const z = scaleTextZone(zones.tagline, width, height);
    parts.push(
      `<text x="${z.x}" y="${z.y}" fill="#e8e8e8" font-family="Arial, Helvetica, sans-serif" font-size="${z.fontSize}">${tagline}</text>`,
    );
  }

  parts.push('</svg>');
  return Buffer.from(parts.join(''));
}

async function compositeProductAd({
  templatePath,
  productPath,
  template,
  promptData,
  settings,
}) {
  if (!templatePath || !fs.existsSync(templatePath)) {
    throw new Error('Vorlage nicht gefunden für Compositing.');
  }
  if (!productPath || !fs.existsSync(productPath)) {
    throw new Error('Referenz-Produktbild nicht gefunden für Compositing.');
  }

  const { width, height } = parseSize(settings.size);
  const stage = scaleStage(template.productStage || DEFAULT_STAGE, width, height);

  const base = await sharp(templatePath)
    .rotate()
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer();

  const productRaw = await fs.promises.readFile(productPath);
  const productCutout = await stripBlackBackground(productRaw);
  const productMeta = await sharp(productCutout).metadata();
  const placement = fitInStage(productMeta.width, productMeta.height, stage);

  const productLayer = await sharp(productCutout)
    .resize(placement.width, placement.height, { fit: 'inside' })
    .png()
    .toBuffer();

  const textSvg = buildTextOverlaySvg({
    width,
    height,
    template,
    promptData,
    settings,
  });

  const result = await sharp(base)
    .composite([
      { input: productLayer, left: placement.left, top: placement.top },
      { input: textSvg, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();

  debugLog.info('product-compositor', 'Compositing abgeschlossen', {
    template: template.id,
    productPath,
    output: `${width}x${height}`,
    placement,
  });

  return result;
}

module.exports = {
  parseSize,
  escapeXml,
  fitInStage,
  scaleStage,
  stripBlackBackground,
  compositeProductAd,
  DEFAULT_STAGE,
  BLACK_KEY_THRESHOLD,
};
