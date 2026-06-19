'use strict';

const fs = require('fs');

class EffectGenerateService {
  constructor(effectGeneratePipeline, effectRegistry) {
    this.pipeline = effectGeneratePipeline;
    this.registry = effectRegistry;
    this.pendingGenerate = null;
  }

  async runGenerate({ prompt, quality, size }, onProgress, signalKey) {
    const result = await this.pipeline.runEffectGenerate(
      { prompt, quality, size },
      onProgress,
      signalKey,
    );
    this.pendingGenerate = {
      prompt: result.prompt,
      previewPath: result.previewPath,
      previewB64: result.previewB64,
      optimizedPrompt: result.optimizedPrompt,
      imageSize: result.imageSize,
      imageQuality: result.imageQuality,
    };
    return result;
  }

  getPendingGenerate() {
    if (!this.pendingGenerate) return null;
    let previewB64 = this.pendingGenerate.previewB64 || '';
    if (!previewB64 && this.pendingGenerate.previewPath
      && fs.existsSync(this.pendingGenerate.previewPath)) {
      try {
        previewB64 = fs.readFileSync(this.pendingGenerate.previewPath).toString('base64');
      } catch { /* ignore */ }
    }
    return {
      prompt: this.pendingGenerate.prompt,
      previewB64,
      optimizedPrompt: this.pendingGenerate.optimizedPrompt,
      imageSize: this.pendingGenerate.imageSize,
    };
  }

  async acceptGenerate(name) {
    if (!this.pendingGenerate?.previewPath) {
      throw new Error('Keine ausstehende Effekt-Vorschau zum Akzeptieren.');
    }
    const saved = await this.registry.saveGeneratedEffect({
      previewPath: this.pendingGenerate.previewPath,
      name,
      sourcePrompt: this.pendingGenerate.prompt,
      size: this.pendingGenerate.imageSize,
    });
    this.pendingGenerate = null;
    return saved;
  }

  rejectGenerate() {
    if (this.pendingGenerate?.previewPath && fs.existsSync(this.pendingGenerate.previewPath)) {
      try { fs.unlinkSync(this.pendingGenerate.previewPath); } catch { /* ignore */ }
    }
    this.pendingGenerate = null;
    return { success: true };
  }
}

module.exports = { EffectGenerateService };
