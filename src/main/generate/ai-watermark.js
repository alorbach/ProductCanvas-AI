'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const paths = require('../paths');
const {
  getPreferences,
  normalizeAiWatermarkCorner,
  DEFAULT_AI_WATERMARK_CORNER,
} = require('../app-preferences');
const debugLog = require('../debug/logger');

function resolveSystemLocale() {
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const { app } = require('electron');
    if (app && typeof app.getLocale === 'function') {
      return app.getLocale();
    }
  } catch {
    // Unit tests / non-Electron contexts
  }
  return 'en';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Sibling path for stamped preview; keeps the editable source intact. */
function defaultWatermarkOutputPath(inputPath) {
  const ext = path.extname(inputPath) || '.png';
  const base = inputPath.slice(0, inputPath.length - ext.length);
  return `${base}.wm${ext}`;
}

function resolveEuBasicIconPath(variant = 'white') {
  const file = variant === 'white-50'
    ? 'eu-ai-label-basic-white-50.svg'
    : 'eu-ai-label-basic-white.svg';
  return path.join(paths.assetsDir(), 'eu-ai-label', file);
}

/**
 * Build a southeast overlay: official EU Basic icon only.
 * The Basic icon already carries the "AI" mark; Art. 50 does not require an extra caption.
 */
async function buildWatermarkOverlay({ iconSize }) {
  const iconPath = resolveEuBasicIconPath('white');
  if (!fs.existsSync(iconPath)) {
    throw new Error(`EU Basic icon missing: ${iconPath}`);
  }

  const overlay = await sharp(iconPath)
    .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return { overlay, badgeWidth: iconSize, badgeHeight: iconSize };
}

/** Pixel position for the watermark overlay in the chosen corner (3 px inset). */
function cornerOffset({ corner, width, height, badgeWidth, badgeHeight, margin }) {
  const resolved = normalizeAiWatermarkCorner(corner);
  const leftEdge = margin;
  const topEdge = margin;
  const rightEdge = Math.max(0, width - badgeWidth - margin);
  const bottomEdge = Math.max(0, height - badgeHeight - margin);
  switch (resolved) {
    case 'bottom-left':
      return { left: leftEdge, top: bottomEdge };
    case 'top-right':
      return { left: rightEdge, top: topEdge };
    case 'top-left':
      return { left: leftEdge, top: topEdge };
    case 'bottom-right':
    default:
      return { left: rightEdge, top: bottomEdge };
  }
}

/**
 * Stamp the EU Basic AI label onto a PNG (chosen corner, default bottom-right).
 * Writes to outputPath (default: overwrite inputPath). Source stays intact when outputPath differs.
 * @returns {{ applied: true, path: string, sourcePath: string, b64: string }}
 */
async function applyAiWatermark(inputPath, options = {}) {
  const outputPath = options.outputPath || inputPath;
  const corner = normalizeAiWatermarkCorner(
    options.corner || DEFAULT_AI_WATERMARK_CORNER,
  );
  const meta = await sharp(inputPath).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (width < 64 || height < 64) {
    throw new Error('Image too small for watermark');
  }

  // Clearly visible size (~8% of short side); pin to the corner with a tight edge inset.
  const shortSide = Math.min(width, height);
  const iconSize = clamp(Math.round(shortSide * 0.08), 40, 128);
  const margin = 3;

  const { overlay, badgeWidth, badgeHeight } = await buildWatermarkOverlay({ iconSize });

  let finalOverlay = overlay;
  let finalBadgeWidth = badgeWidth;
  let finalBadgeHeight = badgeHeight;
  const maxBadgeWidth = Math.max(32, width - (margin * 2));
  if (badgeWidth > maxBadgeWidth) {
    const scaled = await sharp(overlay)
      .resize({
        width: maxBadgeWidth,
        height: Math.max(20, Math.round(badgeHeight * (maxBadgeWidth / badgeWidth))),
        fit: 'inside',
      })
      .png()
      .toBuffer();
    const scaledMeta = await sharp(scaled).metadata();
    finalOverlay = scaled;
    finalBadgeWidth = scaledMeta.width || maxBadgeWidth;
    finalBadgeHeight = scaledMeta.height || badgeHeight;
  }

  const { left, top } = cornerOffset({
    corner,
    width,
    height,
    badgeWidth: finalBadgeWidth,
    badgeHeight: finalBadgeHeight,
    margin,
  });

  const tmpPath = `${outputPath}.wm.tmp${path.extname(outputPath) || '.png'}`;
  try {
    await sharp(inputPath)
      .composite([{ input: finalOverlay, left, top, blend: 'over' }])
      .png()
      .toFile(tmpPath);
    fs.renameSync(tmpPath, outputPath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }

  const b64 = fs.readFileSync(outputPath).toString('base64');
  return { applied: true, path: outputPath, sourcePath: inputPath, b64 };
}

/**
 * Apply watermark when preference aiWatermark is enabled (default on).
 * Stamps a sibling `.wm.png` so the editable source file is never overwritten.
 * On skip or failure returns { applied: false, path: inputPath, sourcePath, b64: null }.
 */
async function maybeApplyAiWatermark(inputPath, options = {}) {
  try {
    const systemLocale = options.systemLocale || resolveSystemLocale();
    const prefs = getPreferences(systemLocale);
    if (!prefs.aiWatermark) {
      return { applied: false, path: inputPath, sourcePath: inputPath, b64: null };
    }
    const outputPath = options.outputPath || defaultWatermarkOutputPath(inputPath);
    return await applyAiWatermark(inputPath, {
      outputPath,
      corner: options.corner || prefs.aiWatermarkCorner,
    });
  } catch (err) {
    debugLog.warn('ai-watermark', 'Wasserzeichen konnte nicht gesetzt werden', {
      message: err.message,
      path: inputPath,
    });
    return { applied: false, path: inputPath, sourcePath: inputPath, b64: null };
  }
}

module.exports = {
  applyAiWatermark,
  maybeApplyAiWatermark,
  defaultWatermarkOutputPath,
  resolveEuBasicIconPath,
  resolveSystemLocale,
  cornerOffset,
};
