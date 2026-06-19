'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../paths');
const debugLog = require('../debug/logger');
const { normalizeQuality } = require('./image-settings');

const DEFAULT_EFFECT_SIZE = '1024x1024';

function buildEffectGenerationPrompt(userPrompt) {
  const request = String(userPrompt || '').trim();
  return [
    `Generate a seamless background/effect image: ${request}.`,
    'No products, no text, no logos, no UI chrome, no watermarks.',
    'Suitable as a photorealistic product photo background.',
    'Full-bleed texture or atmosphere only.',
  ].join(' ');
}

class EffectGeneratePipeline {
  constructor(bridgeClient) {
    this.client = bridgeClient;
  }

  resolveEffectSize(size) {
    const normalized = String(size || '').trim();
    if (/^\d+x\d+$/i.test(normalized)) return normalized;
    return DEFAULT_EFFECT_SIZE;
  }

  async generateEffectImage({ prompt, quality, size }, signalKey, onProgress) {
    onProgress?.({ status: 'running', messageKey: 'wait.status.effectGenerate' });

    const imagePrompt = buildEffectGenerationPrompt(prompt);
    const imageSize = this.resolveEffectSize(size);
    const imageQuality = normalizeQuality(quality);

    const apiPayload = {
      model: 'codex-local:image',
      prompt: imagePrompt,
      size: imageSize,
      quality: imageQuality,
      requireReferences: false,
    };

    debugLog.info('effect-generate-pipeline', 'Effektbild-Generierung', {
      imageSize,
      imageQuality,
      promptLength: imagePrompt.length,
    });

    const result = await this.client.images(apiPayload, signalKey);
    const b64 = result?.response?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('Keine Bilddaten von der KI erhalten.');
    }

    const outPath = path.join(paths.tempPreviewDir(), `effect-generate-${Date.now()}.png`);
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));

    return {
      previewPath: outPath,
      previewB64: b64,
      optimizedPrompt: imagePrompt,
      imageSize,
      imageQuality,
    };
  }

  async runEffectGenerate({ prompt, quality, size }, onProgress, signalKey) {
    const trimmed = String(prompt || '').trim();
    if (!trimmed) {
      throw new Error('Bitte Effekt-Beschreibung eingeben.');
    }

    const image = await this.generateEffectImage(
      { prompt: trimmed, quality, size },
      signalKey,
      onProgress,
    );

    return {
      prompt: trimmed,
      previewPath: image.previewPath,
      previewB64: image.previewB64,
      optimizedPrompt: image.optimizedPrompt,
      imageSize: image.imageSize,
      imageQuality: image.imageQuality,
    };
  }
}

module.exports = {
  EffectGeneratePipeline,
  buildEffectGenerationPrompt,
  DEFAULT_EFFECT_SIZE,
};
