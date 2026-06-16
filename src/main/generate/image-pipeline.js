'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../paths');

class ImagePipeline {
  constructor(bridgeClient) {
    this.client = bridgeClient;
  }

  async generateImage(promptData, settings, onProgress, signalKey) {
    const prompt = promptData.imagePrompt || promptData.optimizedEditPrompt || '';
    if (!prompt.trim()) {
      throw new Error('Kein Bild-Prompt vorhanden.');
    }

    let unsubscribe = () => {};
    if (onProgress) {
      unsubscribe = this.client.subscribeJobEvents((jobs) => {
        if (jobs.error) return;
        const active = jobs.active?.[0];
        onProgress({
          running_count: jobs.running_count,
          queued_count: jobs.queued_count,
          status: active?.status || 'running',
          elapsed_ms: active?.elapsed_ms || 0,
          session_output: active?.session_output || '',
          type: active?.type || 'images',
        });
      });
    }

    try {
      const result = await this.client.images({
        model: 'codex-local:image',
        prompt,
        size: settings.size || '1536x1024',
        quality: settings.quality || 'high',
      }, signalKey);

      const b64 = result?.response?.data?.[0]?.b64_json;
      if (!b64) {
        throw new Error('Keine Bilddaten von der Bridge erhalten.');
      }

      const outPath = path.join(paths.tempPreviewDir(), `preview-${Date.now()}.png`);
      fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
      return { success: true, path: outPath, b64, result };
    } finally {
      unsubscribe();
    }
  }
}

module.exports = { ImagePipeline };
