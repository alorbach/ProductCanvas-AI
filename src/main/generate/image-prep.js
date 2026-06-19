'use strict';

const path = require('path');

const MAX_BRIDGE_FRAME_BYTES = 2 * 1024 * 1024;
const MAX_ANALYZE_IMAGES = 4;
/** Max longest edge when sending effect images to Codex (background reference only). */
const EFFECT_REFERENCE_MAX_EDGE = 1024;
/** JPEG quality for downscaled effect references. */
const EFFECT_REFERENCE_JPEG_QUALITY = 82;
/** Downscale effect files larger than this even when within max edge. */
const EFFECT_REFERENCE_MAX_BYTES = 350 * 1024;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function isImagePath(filePath) {
  return IMAGE_EXT.has(path.extname(filePath).toLowerCase());
}

module.exports = {
  MAX_ANALYZE_IMAGES,
  MAX_BRIDGE_FRAME_BYTES,
  EFFECT_REFERENCE_MAX_EDGE,
  EFFECT_REFERENCE_JPEG_QUALITY,
  EFFECT_REFERENCE_MAX_BYTES,
  isImagePath,
};
