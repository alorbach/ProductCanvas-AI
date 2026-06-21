'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const paths = require('../paths');
const debugLog = require('../debug/logger');
const { isImagePath, computePerAttachmentByteBudget } = require('./image-prep');
const {
  buildReferencePathEntry,
  prepareEffectReferencePath,
} = require('./image-preflight');
const { normalizeQuality } = require('./image-settings');

const PRODUCT_EFFECT_PROMPT = [
  'Replace the background of IMAGE 1 (product photo) with the visual style from IMAGE 2 (effect/background reference).',
  'Keep every product pixel-identical: models, drivers, logos, finishes, arrangement.',
  'Do not crop, resize, or alter products.',
  'Photorealistic composite — products naturally placed on the effect background.',
].join(' ');

const PRODUCT_EFFECT_OVERRIDE_KEYWORDS = /\b(background|hintergrund|product|produkt|placement|platzierung|produktfoto|product photo)\b/i;

function extraPromptOverridesEffectBackground(extraPrompt) {
  return PRODUCT_EFFECT_OVERRIDE_KEYWORDS.test(String(extraPrompt || ''));
}

function buildCompositeCacheKey(productPath, effectPath, extraPrompt) {
  const payload = {
    productPath: path.resolve(productPath),
    effectPath: path.resolve(effectPath),
    extraPrompt: String(extraPrompt || '').trim(),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

function compositeCachePath(cacheKey) {
  return path.join(paths.tempPreviewDir(), `product-effect-${cacheKey}.png`);
}

async function buildProductEffectReferences(productPath, effectPath) {
  const options = {
    byteBudget: computePerAttachmentByteBudget(2),
    attachmentCount: 2,
  };
  const product = await buildReferencePathEntry(productPath, 'product', options);
  const scaledEffectPath = await prepareEffectReferencePath(effectPath);
  const effect = await buildReferencePathEntry(scaledEffectPath, 'effect', options);
  if (!product) throw new Error('Produktreferenz konnte nicht gelesen werden.');
  if (!effect) throw new Error('Effektbild konnte nicht gelesen werden.');
  return [product, effect];
}

class ProductEffectPipeline {
  constructor(bridgeClient) {
    this.client = bridgeClient;
  }

  shouldApplyEffect({ effectPath, extraPrompt }) {
    if (!effectPath || !fs.existsSync(effectPath) || !isImagePath(effectPath)) {
      return false;
    }
    return !extraPromptOverridesEffectBackground(extraPrompt);
  }

  async applyEffectToProduct({ productPath, effectPath, extraPrompt, quality }, signalKey, onProgress) {
    if (!this.shouldApplyEffect({ effectPath, extraPrompt })) {
      return { path: productPath, composited: false, skipped: true };
    }

    const cacheKey = buildCompositeCacheKey(productPath, effectPath, extraPrompt);
    const cachedPath = compositeCachePath(cacheKey);
    if (fs.existsSync(cachedPath)) {
      debugLog.info('product-effect-pipeline', 'Cache-Treffer für Produkt+Effekt', { cachedPath });
      return { path: cachedPath, composited: true, skipped: false, cached: true };
    }

    onProgress?.({ status: 'running', messageKey: 'wait.status.productEffect' });

    const referenceImages = await buildProductEffectReferences(productPath, effectPath);
    const refPaths = referenceImages.map((r) => r.path).filter(Boolean);
    const imageQuality = normalizeQuality(quality);

    let prompt = PRODUCT_EFFECT_PROMPT;
    const extra = String(extraPrompt || '').trim();
    if (extra) {
      prompt = `${prompt}\n\nAdditional instructions: ${extra}`;
    }

    const apiPayload = {
      model: 'codex-local:image',
      prompt,
      size: 'auto',
      quality: imageQuality,
      requireReferences: true,
      referenced_image_paths: refPaths,
    };

    debugLog.info('product-effect-pipeline', 'Produkt-Hintergrund mit Effekt', {
      productPath,
      effectPath,
      scaledEffectPath: refPaths[1] || effectPath,
      referenceCount: referenceImages.length,
    });

    const result = await this.client.images(apiPayload, signalKey);
    const b64 = result?.response?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('Produkt-Hintergrund konnte nicht mit Effektbild zusammengeführt werden.');
    }

    fs.writeFileSync(cachedPath, Buffer.from(b64, 'base64'));
    return { path: cachedPath, composited: true, skipped: false, cached: false };
  }
}

module.exports = {
  ProductEffectPipeline,
  extraPromptOverridesEffectBackground,
  buildCompositeCacheKey,
  PRODUCT_EFFECT_PROMPT,
};
