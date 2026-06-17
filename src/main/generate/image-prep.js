'use strict';

const path = require('path');

const MAX_BRIDGE_FRAME_BYTES = 2 * 1024 * 1024;
const MAX_ANALYZE_IMAGES = 4;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function isImagePath(filePath) {
  return IMAGE_EXT.has(path.extname(filePath).toLowerCase());
}

module.exports = {
  MAX_ANALYZE_IMAGES,
  MAX_BRIDGE_FRAME_BYTES,
  isImagePath,
};
