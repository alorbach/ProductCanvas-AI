'use strict';

const fs = require('fs');
const { isAllowedExportSource } = require('../safe-paths');

function isValidStoredPreviewPath(filePath) {
  if (!filePath) return false;
  try {
    return fs.existsSync(filePath) && isAllowedExportSource(filePath);
  } catch {
    return false;
  }
}

function resolveStoredPreview(session = {}) {
  const pending = session.previewPendingEdit;
  if (pending && typeof pending === 'object') {
    const originalOk = isValidStoredPreviewPath(pending.originalPreviewPath);
    const editedOk = isValidStoredPreviewPath(pending.editedPreviewPath);
    if (!originalOk || !editedOk) {
      return {
        valid: false,
        path: '',
        pendingEdit: null,
        sessionPatch: { lastPreviewPath: '', previewPendingEdit: null },
      };
    }
    return {
      valid: true,
      path: pending.editedPreviewPath,
      pendingEdit: pending,
      sessionPatch: null,
    };
  }

  const storedPath = String(session.lastPreviewPath || '').trim();
  if (!isValidStoredPreviewPath(storedPath)) {
    const sessionPatch = storedPath
      ? { lastPreviewPath: '', previewPendingEdit: null }
      : null;
    return { valid: false, path: '', pendingEdit: null, sessionPatch };
  }

  return { valid: true, path: storedPath, pendingEdit: null, sessionPatch: null };
}

class PreviewEditService {
  constructor(previewEditPipeline, { getSession, patchSession } = {}) {
    this.pipeline = previewEditPipeline;
    this.getSession = getSession || (() => ({}));
    this.patchSession = patchSession || (() => {});
    this.pendingEdit = null;
    this.loadPendingFromSession();
  }

  loadPendingFromSession() {
    const session = this.getSession();
    if (session?.previewPendingEdit && typeof session.previewPendingEdit === 'object') {
      this.pendingEdit = { ...session.previewPendingEdit };
    }
  }

  persistPendingToSession(extra = {}) {
    this.patchSession({
      previewPendingEdit: this.pendingEdit,
      ...extra,
    });
  }

  clearPendingFromSession(extra = {}) {
    this.pendingEdit = null;
    this.patchSession({
      previewPendingEdit: null,
      ...extra,
    });
  }

  resolveStored(session = this.getSession()) {
    const resolved = resolveStoredPreview(session);
    if (resolved.pendingEdit) {
      this.pendingEdit = { ...resolved.pendingEdit };
    } else if (!resolved.valid) {
      this.pendingEdit = null;
    }
    return resolved;
  }

  async runEdit({ previewPath, templateId, changeRequest, quality, size }, onProgress, signalKey) {
    const result = await this.pipeline.runPreviewEdit(
      { previewPath, templateId, changeRequest, quality, size },
      onProgress,
      signalKey,
    );
    this.pendingEdit = {
      originalPreviewPath: result.previewPath,
      editedPreviewPath: result.editedPreviewPath,
      editedPreviewB64: result.editedPreviewB64,
      changeRequest: result.changeRequest,
      optimizedEditPrompt: result.optimizedEditPrompt,
      changeSummary: result.changeSummary,
      templateId: result.templateId,
      imageSize: result.imageSize,
      quality: result.imageQuality,
    };
    this.persistPendingToSession();
    return result;
  }

  getPendingEdit() {
    if (!this.pendingEdit) return null;
    let editedPreviewB64 = this.pendingEdit.editedPreviewB64 || '';
    if (!editedPreviewB64 && this.pendingEdit.editedPreviewPath
      && fs.existsSync(this.pendingEdit.editedPreviewPath)) {
      try {
        editedPreviewB64 = fs.readFileSync(this.pendingEdit.editedPreviewPath).toString('base64');
      } catch { /* ignore */ }
    }
    let originalPreviewB64 = '';
    if (this.pendingEdit.originalPreviewPath
      && fs.existsSync(this.pendingEdit.originalPreviewPath)) {
      try {
        originalPreviewB64 = fs.readFileSync(this.pendingEdit.originalPreviewPath).toString('base64');
      } catch { /* ignore */ }
    }
    return {
      originalPreviewPath: this.pendingEdit.originalPreviewPath,
      editedPreviewPath: this.pendingEdit.editedPreviewPath,
      originalPreviewB64,
      editedPreviewB64,
      changeRequest: this.pendingEdit.changeRequest,
      optimizedEditPrompt: this.pendingEdit.optimizedEditPrompt,
      changeSummary: this.pendingEdit.changeSummary,
      templateId: this.pendingEdit.templateId,
      imageSize: this.pendingEdit.imageSize,
      quality: this.pendingEdit.quality,
    };
  }

  acceptEdit() {
    if (!this.pendingEdit?.editedPreviewPath) {
      throw new Error('Keine ausstehende Vorschau zum Akzeptieren.');
    }
    const newPath = this.pendingEdit.editedPreviewPath;
    this.clearPendingFromSession({ lastPreviewPath: newPath });
    return { path: newPath, success: true };
  }

  rejectEdit() {
    if (this.pendingEdit?.editedPreviewPath && fs.existsSync(this.pendingEdit.editedPreviewPath)) {
      try { fs.unlinkSync(this.pendingEdit.editedPreviewPath); } catch { /* ignore */ }
    }
    const originalPath = this.pendingEdit?.originalPreviewPath || '';
    this.clearPendingFromSession({ lastPreviewPath: originalPath });
    return { path: originalPath, success: true };
  }
}

module.exports = {
  PreviewEditService,
  resolveStoredPreview,
  isValidStoredPreviewPath,
};
