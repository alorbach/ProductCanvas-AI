'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../paths');
const debugLog = require('../debug/logger');

function parsePixelSize(sizeStr) {
  const m = String(sizeStr || '').match(/^(\d+)x(\d+)$/i);
  if (!m) return null;
  return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
}

class EffectEditorService {
  constructor(effectEditPipeline, effectRegistry) {
    this.pipeline = effectEditPipeline;
    this.registry = effectRegistry;
    this.pendingEdit = null;
  }

  async runEdit({ effectId, changeRequest, quality, size, referenceImagePath }, onProgress, signalKey) {
    const result = await this.pipeline.runEffectEdit(
      { effectId, changeRequest, quality, size, referenceImagePath },
      onProgress,
      signalKey,
    );
    this.pendingEdit = {
      effectId: result.effectId,
      effectPath: result.effectPath,
      changeRequest: result.changeRequest,
      referenceImagePath: result.referenceImagePath || '',
      optimizedEditPrompt: result.optimizedEditPrompt,
      changeSummary: result.changeSummary,
      previewPath: result.previewPath,
      previewB64: result.previewB64,
      imageSize: result.imageSize,
      imageSizeMode: result.imageSizeMode,
      formatOnly: result.formatOnly,
      effectWidth: result.effectWidth,
      effectHeight: result.effectHeight,
      outputWidth: result.outputWidth,
      outputHeight: result.outputHeight,
    };
    return result;
  }

  getPendingEdit() {
    if (!this.pendingEdit) return null;
    let previewB64 = this.pendingEdit.previewB64 || '';
    if (!previewB64 && this.pendingEdit.previewPath && fs.existsSync(this.pendingEdit.previewPath)) {
      try {
        previewB64 = fs.readFileSync(this.pendingEdit.previewPath).toString('base64');
      } catch { /* ignore */ }
    }
    return {
      effectId: this.pendingEdit.effectId,
      changeRequest: this.pendingEdit.changeRequest,
      referenceImagePath: this.pendingEdit.referenceImagePath || '',
      optimizedEditPrompt: this.pendingEdit.optimizedEditPrompt,
      changeSummary: this.pendingEdit.changeSummary,
      previewB64,
      imageSize: this.pendingEdit.imageSize,
    };
  }

  async acceptEdit() {
    if (!this.pendingEdit?.previewPath || !this.pendingEdit?.effectId) {
      throw new Error('Keine ausstehende Effekt-Vorschau zum Akzeptieren.');
    }
    const effect = this.registry.getById(this.pendingEdit.effectId);
    if (!effect) throw new Error('Effektbild nicht gefunden.');

    const targetPath = this.registry.resolveEffectPath(effect);
    const dims = await this.registry.getDimensions(effect);
    const historyDir = paths.userEffectsHistoryDir(effect.id);
    const histFile = path.join(historyDir, `${Date.now()}.png`);
    fs.copyFileSync(targetPath, histFile);

    const previewPath = this.pendingEdit.previewPath;
    const targetDims = parsePixelSize(this.pendingEdit.imageSize)
      || (this.pendingEdit.outputWidth && this.pendingEdit.outputHeight
        ? { width: this.pendingEdit.outputWidth, height: this.pendingEdit.outputHeight }
        : null)
      || (dims?.width && dims?.height ? { width: dims.width, height: dims.height } : null);

    fs.copyFileSync(previewPath, targetPath);

    const savedDims = await this.registry.readEffectDimensions(targetPath);
    if (savedDims?.width && savedDims?.height) {
      this.registry.persistEffectDimensions(effect.id, savedDims);
      if (targetDims?.width && targetDims?.height
        && (savedDims.width !== targetDims.width || savedDims.height !== targetDims.height)) {
        debugLog.info('effect-editor', 'KI-Vorschau weicht vom gewählten Ausgabeformat ab', {
          preview: `${savedDims.width}x${savedDims.height}`,
          requested: `${targetDims.width}x${targetDims.height}`,
        });
      }
    }

    if (this.pendingEdit.changeRequest) {
      const reg = this.registry.getUserRegistry();
      const entry = reg.effects.find((e) => e.id === effect.id);
      if (entry) {
        const prior = String(entry.sourcePrompt || '').trim();
        entry.sourcePrompt = prior
          ? `${prior}\nEdit: ${this.pendingEdit.changeRequest}`
          : this.pendingEdit.changeRequest;
        this.registry.saveUserRegistry(reg);
      }
    }

    const accepted = { effectId: effect.id, path: targetPath };
    this.pendingEdit = null;
    return accepted;
  }

  rejectEdit() {
    if (this.pendingEdit?.previewPath && fs.existsSync(this.pendingEdit.previewPath)) {
      try { fs.unlinkSync(this.pendingEdit.previewPath); } catch { /* ignore */ }
    }
    this.pendingEdit = null;
    return { success: true };
  }
}

module.exports = { EffectEditorService };
