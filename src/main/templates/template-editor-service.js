'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const paths = require('../paths');
const debugLog = require('../debug/logger');

class TemplateEditorService {
  constructor(templateEditPipeline, templateRegistry) {
    this.pipeline = templateEditPipeline;
    this.registry = templateRegistry;
    this.pendingEdit = null;
  }

  async runEdit({ templateId, changeRequest, quality }, onProgress, signalKey) {
    const result = await this.pipeline.runTemplateEdit(
      { templateId, changeRequest, quality },
      onProgress,
      signalKey,
    );
    this.pendingEdit = {
      templateId: result.templateId,
      templatePath: result.templatePath,
      changeRequest: result.changeRequest,
      optimizedEditPrompt: result.optimizedEditPrompt,
      changeSummary: result.changeSummary,
      previewPath: result.previewPath,
      previewB64: result.previewB64,
      imageSize: result.imageSize,
      templateWidth: result.templateWidth,
      templateHeight: result.templateHeight,
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

    let previewPath = this.pendingEdit.previewPath;
    if (dims?.width && dims?.height) {
      const meta = await sharp(previewPath).metadata();
      if (meta.width !== dims.width || meta.height !== dims.height) {
        const resizedPath = path.join(paths.tempPreviewDir(), `template-accept-${Date.now()}.png`);
        await sharp(previewPath)
          .resize(dims.width, dims.height, { fit: 'fill' })
          .png()
          .toFile(resizedPath);
        previewPath = resizedPath;
        debugLog.info('template-editor', 'Vorschau auf Vorlagenmaß skaliert', {
          from: `${meta.width}x${meta.height}`,
          to: `${dims.width}x${dims.height}`,
        });
      }
    }

    fs.copyFileSync(previewPath, targetPath);
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
