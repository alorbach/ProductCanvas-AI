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

class TemplateEditorService {
  constructor(templateEditPipeline, templateRegistry) {
    this.pipeline = templateEditPipeline;
    this.registry = templateRegistry;
    this.pendingEdit = null;
  }

  async runEdit({ templateId, changeRequest, quality, size, referenceImagePath }, onProgress, signalKey) {
    const result = await this.pipeline.runTemplateEdit(
      { templateId, changeRequest, quality, size, referenceImagePath },
      onProgress,
      signalKey,
    );
    this.pendingEdit = {
      templateId: result.templateId,
      templatePath: result.templatePath,
      changeRequest: result.changeRequest,
      referenceImagePath: result.referenceImagePath || '',
      optimizedEditPrompt: result.optimizedEditPrompt,
      changeSummary: result.changeSummary,
      previewPath: result.previewPath,
      previewB64: result.previewB64,
      imageSize: result.imageSize,
      imageSizeMode: result.imageSizeMode,
      formatOnly: result.formatOnly,
      templateWidth: result.templateWidth,
      templateHeight: result.templateHeight,
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
      templateId: this.pendingEdit.templateId,
      changeRequest: this.pendingEdit.changeRequest,
      referenceImagePath: this.pendingEdit.referenceImagePath || '',
      optimizedEditPrompt: this.pendingEdit.optimizedEditPrompt,
      changeSummary: this.pendingEdit.changeSummary,
      previewB64,
      imageSize: this.pendingEdit.imageSize,
    };
  }

  async acceptEdit() {
    if (!this.pendingEdit?.previewPath || !this.pendingEdit?.templateId) {
      throw new Error('Keine ausstehende Vorschau zum Akzeptieren.');
    }
    const template = this.registry.getById(this.pendingEdit.templateId);
    if (!template) throw new Error('Vorlage nicht gefunden.');

    const targetPath = this.registry.resolveTemplatePath(template);
    const dims = await this.registry.getDimensions(template);
    const historyDir = paths.userTemplatesHistoryDir(template.id);
    const histFile = path.join(historyDir, `${Date.now()}.png`);
    fs.copyFileSync(targetPath, histFile);

    const previewPath = this.pendingEdit.previewPath;
    const targetDims = parsePixelSize(this.pendingEdit.imageSize)
      || (this.pendingEdit.outputWidth && this.pendingEdit.outputHeight
        ? { width: this.pendingEdit.outputWidth, height: this.pendingEdit.outputHeight }
        : null)
      || (dims?.width && dims?.height ? { width: dims.width, height: dims.height } : null);

    fs.copyFileSync(previewPath, targetPath);

    const savedDims = await this.registry.readTemplateDimensions(targetPath);
    if (savedDims?.width && savedDims?.height) {
      this.registry.persistTemplateDimensions(template.id, savedDims);
      if (targetDims?.width && targetDims?.height
        && (savedDims.width !== targetDims.width || savedDims.height !== targetDims.height)) {
        debugLog.info('template-editor', 'KI-Vorschau weicht vom gewählten Ausgabeformat ab', {
          preview: `${savedDims.width}x${savedDims.height}`,
          requested: `${targetDims.width}x${targetDims.height}`,
        });
      }
    }
    const accepted = { templateId: template.id, path: targetPath };
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

module.exports = { TemplateEditorService };
