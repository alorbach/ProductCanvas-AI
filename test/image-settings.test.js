'use strict';

const assert = require('assert');
const path = require('path');

const root = path.join(__dirname, '..');
const {
  GATEWAY_IMAGE_SIZES,
  IMAGE_QUALITIES,
  SIZE_FROM_TEMPLATE,
  normalizeQuality,
  resolveImageGenerationSettings,
  resolveOutputSize,
} = require(path.join(root, 'src', 'main', 'generate', 'image-settings'));

assert(GATEWAY_IMAGE_SIZES.includes('1536x1024'), 'gateway sizes include 1536x1024');
assert(GATEWAY_IMAGE_SIZES.includes('auto'), 'gateway sizes include auto');
assert.deepStrictEqual(IMAGE_QUALITIES, ['low', 'medium', 'high'], 'gateway qualities');

assert.equal(normalizeQuality('standard'), 'medium', 'legacy standard maps to medium');
assert.equal(normalizeQuality('high'), 'high', 'high quality preserved');

const fromTemplate = resolveOutputSize({ size: SIZE_FROM_TEMPLATE }, { width: 1536, height: 1024 });
assert.equal(fromTemplate.size, '1536x1024', 'template mode uses template dimensions');
assert.equal(fromTemplate.sizeMode, SIZE_FROM_TEMPLATE, 'template mode flagged');

const preset = resolveOutputSize({ size: '1792x1024' }, { width: 1536, height: 1024 });
assert.equal(preset.size, '1792x1024', 'preset size used');

const resolved = resolveImageGenerationSettings(
  { size: SIZE_FROM_TEMPLATE, quality: 'standard' },
  { width: 1920, height: 1080 },
);
assert.equal(resolved.size, '1920x1080', 'resolved payload size');
assert.equal(resolved.quality, 'medium', 'resolved payload quality');
assert.equal(resolved.sizeMode, SIZE_FROM_TEMPLATE, 'resolved size mode');

console.log('All image-settings tests passed.');
