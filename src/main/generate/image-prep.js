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

/** Codex CLI turn/start combined input limit (characters). */
const CODEX_TURN_MAX_CHARS = 1_048_576;
/** Headroom reserved for prompts and system text in a Codex turn. */
const CODEX_TURN_PROMPT_RESERVE_CHARS = 80_000;
/** Max longest edge for product/template/preview references sent to Codex. */
const PRODUCT_REFERENCE_MAX_EDGE = 1536;
/** Starting JPEG quality for downscaled product/template references. */
const PRODUCT_REFERENCE_JPEG_QUALITY = 88;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function isImagePath(filePath) {
  return IMAGE_EXT.has(path.extname(filePath).toLowerCase());
}

function estimateBase64Chars(byteLength) {
  const bytes = Math.max(0, Number(byteLength) || 0);
  return Math.ceil(bytes / 3) * 4;
}

function computePerAttachmentByteBudget(attachmentCount, promptCharEstimate = 0) {
  const count = Math.max(1, Number(attachmentCount) || 1);
  const promptChars = Math.max(0, Number(promptCharEstimate) || 0);
  const reserve = Math.max(CODEX_TURN_PROMPT_RESERVE_CHARS, promptChars);
  const availableChars = Math.max(0, CODEX_TURN_MAX_CHARS - reserve);
  const perImageChars = Math.floor(availableChars / count);
  return Math.floor((perImageChars * 3) / 4);
}

module.exports = {
  MAX_ANALYZE_IMAGES,
  MAX_BRIDGE_FRAME_BYTES,
  EFFECT_REFERENCE_MAX_EDGE,
  EFFECT_REFERENCE_JPEG_QUALITY,
  EFFECT_REFERENCE_MAX_BYTES,
  CODEX_TURN_MAX_CHARS,
  CODEX_TURN_PROMPT_RESERVE_CHARS,
  PRODUCT_REFERENCE_MAX_EDGE,
  PRODUCT_REFERENCE_JPEG_QUALITY,
  estimateBase64Chars,
  computePerAttachmentByteBudget,
  isImagePath,
};
