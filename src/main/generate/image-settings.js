'use strict';

/** Gateway / PMS image dimension presets (OpenAI image API compatible). */
const GATEWAY_IMAGE_SIZES = [
  '1024x1024',
  '1024x1536',
  '1536x1024',
  '1792x1024',
  '1024x1792',
  '2048x2048',
  '2048x1152',
  '3840x2160',
  '2160x3840',
  'auto',
];

const IMAGE_QUALITIES = ['low', 'medium', 'high'];

const SIZE_FROM_TEMPLATE = 'template';

const DEFAULT_FALLBACK_SIZE = '1536x1024';

function normalizeQuality(quality) {
  const q = String(quality || '').trim().toLowerCase();
  if (q === 'standard') return 'medium';
  if (IMAGE_QUALITIES.includes(q)) return q;
  return 'high';
}

function normalizeSize(size) {
  const s = String(size || '').trim().toLowerCase();
  if (s === SIZE_FROM_TEMPLATE) return SIZE_FROM_TEMPLATE;
  if (s === 'auto') return 'auto';
  const m = s.match(/^(\d{2,5})x(\d{2,5})$/);
  if (!m) return '';
  return `${parseInt(m[1], 10)}x${parseInt(m[2], 10)}`;
}

function formatSizeLabel(size) {
  if (size === SIZE_FROM_TEMPLATE) return 'template';
  if (size === 'auto') return 'Auto';
  const m = String(size).match(/^(\d+)x(\d+)$/i);
  if (!m) return String(size);
  return `${m[1]}×${m[2]}`;
}

function aspectLabel(size) {
  const normalized = normalizeSize(size);
  if (!normalized || normalized === SIZE_FROM_TEMPLATE || normalized === 'auto') return '';
  const m = normalized.match(/^(\d+)x(\d+)$/);
  if (!m) return '';
  const width = parseInt(m[1], 10);
  const height = parseInt(m[2], 10);
  if (width === height) return '1:1';
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const g = gcd(width, height);
  return `${width / g}:${height / g}`;
}

function resolveOutputSize(settings, templateDimensions) {
  const raw = normalizeSize(settings?.size) || SIZE_FROM_TEMPLATE;
  if (raw === SIZE_FROM_TEMPLATE) {
    const width = Number(templateDimensions?.width || 0);
    const height = Number(templateDimensions?.height || 0);
    if (width > 0 && height > 0) {
      return {
        size: `${width}x${height}`,
        sizeMode: SIZE_FROM_TEMPLATE,
        width,
        height,
        fallback: false,
      };
    }
    const fb = normalizeSize(DEFAULT_FALLBACK_SIZE);
    const m = fb.match(/^(\d+)x(\d+)$/);
    return {
      size: fb,
      sizeMode: SIZE_FROM_TEMPLATE,
      width: m ? parseInt(m[1], 10) : 1536,
      height: m ? parseInt(m[2], 10) : 1024,
      fallback: true,
    };
  }
  if (raw === 'auto') {
    return { size: 'auto', sizeMode: 'preset', width: 0, height: 0, fallback: false };
  }
  const m = raw.match(/^(\d+)x(\d+)$/);
  return {
    size: raw,
    sizeMode: 'preset',
    width: m ? parseInt(m[1], 10) : 0,
    height: m ? parseInt(m[2], 10) : 0,
    fallback: false,
  };
}

function resolveImageGenerationSettings(settings, templateDimensions) {
  const output = resolveOutputSize(settings, templateDimensions);
  return {
    ...settings,
    size: output.size,
    quality: normalizeQuality(settings?.quality),
    sizeMode: output.sizeMode,
    outputWidth: output.width,
    outputHeight: output.height,
    sizeFromTemplateFallback: output.fallback === true,
  };
}

function getImageSettingsCatalog() {
  return {
    sizes: [...GATEWAY_IMAGE_SIZES],
    qualities: [...IMAGE_QUALITIES],
    sizeFromTemplate: SIZE_FROM_TEMPLATE,
    defaultSize: SIZE_FROM_TEMPLATE,
    defaultQuality: 'high',
  };
}

module.exports = {
  DEFAULT_FALLBACK_SIZE,
  GATEWAY_IMAGE_SIZES,
  IMAGE_QUALITIES,
  SIZE_FROM_TEMPLATE,
  aspectLabel,
  formatSizeLabel,
  getImageSettingsCatalog,
  normalizeQuality,
  normalizeSize,
  resolveImageGenerationSettings,
  resolveOutputSize,
};
