'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MAX_EDGE = 1024;
const PRODUCT_REF_MAX_EDGE = 1536;
const JPEG_QUALITY = 80;
const PRODUCT_REF_JPEG_QUALITY = 92;
const MAX_BRIDGE_FRAME_BYTES = 2 * 1024 * 1024;
const MAX_ANALYZE_IMAGES = 4;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function isImagePath(filePath) {
  return IMAGE_EXT.has(path.extname(filePath).toLowerCase());
}

function frameByteSize(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return 0;
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.ceil((b64.length * 3) / 4);
}

async function prepareBridgeFrame(filePath, options = {}) {
  const maxEdge = options.maxEdge || MAX_EDGE;
  const quality = options.quality || JPEG_QUALITY;
  if (!fs.existsSync(filePath)) {
    throw new Error(`Bild nicht gefunden: ${filePath}`);
  }
  const buffer = await sharp(filePath)
    .rotate()
    .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

async function prepareProductReferenceFrame(filePath, options = {}) {
  const maxEdge = options.maxEdge || PRODUCT_REF_MAX_EDGE;
  const quality = options.quality || PRODUCT_REF_JPEG_QUALITY;
  if (!fs.existsSync(filePath)) {
    throw new Error(`Bild nicht gefunden: ${filePath}`);
  }
  const buffer = await sharp(filePath)
    .rotate()
    .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: false })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

async function prepareBridgeFrames(filePaths, options = {}) {
  const limit = options.limit ?? MAX_ANALYZE_IMAGES;
  const productMode = options.productMode === true;
  const frames = [];
  const meta = [];
  for (const filePath of filePaths.slice(0, limit)) {
    if (!isImagePath(filePath)) continue;
    const frame = productMode
      ? await prepareProductReferenceFrame(filePath, options)
      : await prepareBridgeFrame(filePath, options);
    frames.push(frame);
    meta.push({
      path: filePath,
      bytes: frameByteSize(frame),
      productMode,
    });
  }
  if (filePaths.length > limit) {
    meta.skipped = filePaths.length - limit;
  }
  return { frames, meta };
}

module.exports = {
  MAX_ANALYZE_IMAGES,
  MAX_BRIDGE_FRAME_BYTES,
  PRODUCT_REF_MAX_EDGE,
  isImagePath,
  frameByteSize,
  prepareBridgeFrame,
  prepareProductReferenceFrame,
  prepareBridgeFrames,
};
