'use strict';

const fs = require('fs');
const path = require('path');
const { isAllowedExportSource } = require('../safe-paths');

function isValidStoredPreviewPath(filePath) {
  if (!filePath) return false;
  try {
    return fs.existsSync(filePath) && isAllowedExportSource(filePath);
  } catch {
    return false;
  }
}

function clearPreviewSessionPatch() {
  return {
    lastPreviewPath: '',
    lastPreviewEditSourcePath: '',
    previewPendingEdit: null,
  };
}

/** If display is `*.wm.ext`, prefer the clean sibling when present. */
function inferCleanSibling(displayPath) {
  const resolved = String(displayPath || '').trim();
  if (!resolved) return '';
  const ext = path.extname(resolved);
  const base = ext ? resolved.slice(0, -ext.length) : resolved;
  if (!base.toLowerCase().endsWith('.wm')) return '';
  const clean = `${base.slice(0, -3)}${ext || '.png'}`;
  return isValidStoredPreviewPath(clean) ? clean : '';
}

/** True when path looks like a stamped watermark sibling (`*.wm.ext`). */
function isWmDisplayPath(filePath) {
  const resolved = String(filePath || '').trim();
  if (!resolved) return false;
  const ext = path.extname(resolved);
  const base = ext ? resolved.slice(0, -ext.length) : resolved;
  return base.toLowerCase().endsWith('.wm');
}

function resolveEditSourceFallback(displayPath, editSourcePath) {
  const trimmed = String(editSourcePath || '').trim();
  if (trimmed && isValidStoredPreviewPath(trimmed) && !isWmDisplayPath(trimmed)) {
    return trimmed;
  }
  if (trimmed && isValidStoredPreviewPath(trimmed) && isWmDisplayPath(trimmed)) {
    const fromStoredWm = inferCleanSibling(trimmed);
    if (fromStoredWm) return fromStoredWm;
  }
  const inferred = inferCleanSibling(displayPath);
  if (inferred) return inferred;
  // Do not feed a stamped .wm.png into AI edit when the clean sibling is gone.
  if (isWmDisplayPath(displayPath)) return '';
  // Explicit empty edit-source means "no editable source" (e.g. imported wm-only file).
  if (editSourcePath !== undefined && editSourcePath !== null && !trimmed) {
    return '';
  }
  return isValidStoredPreviewPath(displayPath) ? displayPath : '';
}

/** Prefer a non-watermarked editable path among candidates (infer clean sibling for *.wm). */
function resolveNonWmEditPath(...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (isValidStoredPreviewPath(candidate) && !isWmDisplayPath(candidate)) {
      return candidate;
    }
    if (isValidStoredPreviewPath(candidate) && isWmDisplayPath(candidate)) {
      const inferred = inferCleanSibling(candidate);
      if (inferred) return inferred;
    }
  }
  return '';
}

function resolveStoredPreview(session = {}) {
  const pending = session.previewPendingEdit;
  if (pending && typeof pending === 'object') {
    const editedDisplayOk = isValidStoredPreviewPath(pending.editedPreviewPath);
    const editedSource = resolveNonWmEditPath(
      pending.editedEditSourcePath,
      pending.editedPreviewPath,
    );
    const originalSource = resolveNonWmEditPath(
      pending.originalEditSourcePath,
      pending.originalPreviewPath,
      pending.originalDisplayPath,
    );
    if (!editedDisplayOk || !editedSource || !originalSource) {
      return {
        valid: false,
        path: '',
        pendingEdit: null,
        sessionPatch: clearPreviewSessionPatch(),
      };
    }
    const patchedPending = {
      ...pending,
      editedEditSourcePath: editedSource,
      originalEditSourcePath: originalSource,
      originalDisplayPath: isValidStoredPreviewPath(pending.originalDisplayPath)
        ? pending.originalDisplayPath
        : (isValidStoredPreviewPath(pending.originalPreviewPath)
          ? pending.originalPreviewPath
          : pending.originalDisplayPath),
    };
    return {
      valid: true,
      path: pending.editedPreviewPath,
      pendingEdit: patchedPending,
      sessionPatch: null,
    };
  }

  const storedPath = String(session.lastPreviewPath || '').trim();
  const editSource = String(session.lastPreviewEditSourcePath || '').trim();

  if (!isValidStoredPreviewPath(storedPath)) {
    if (isValidStoredPreviewPath(editSource) && !isWmDisplayPath(editSource)) {
      const wmSibling = (() => {
        const ext = path.extname(editSource);
        const base = ext ? editSource.slice(0, -ext.length) : editSource;
        if (base.toLowerCase().endsWith('.wm')) return '';
        const candidate = `${base}.wm${ext || '.png'}`;
        return isValidStoredPreviewPath(candidate) ? candidate : '';
      })();
      const display = wmSibling || editSource;
      return {
        valid: true,
        path: display,
        pendingEdit: null,
        sessionPatch: {
          lastPreviewPath: display,
          lastPreviewEditSourcePath: editSource,
        },
      };
    }
    const sessionPatch = (storedPath || editSource) ? clearPreviewSessionPatch() : null;
    return { valid: false, path: '', pendingEdit: null, sessionPatch };
  }

  const resolvedEditSource = resolveEditSourceFallback(storedPath, editSource);
  let sessionPatch = null;
  if (resolvedEditSource !== editSource) {
    sessionPatch = { lastPreviewEditSourcePath: resolvedEditSource || '' };
  }

  return { valid: true, path: storedPath, pendingEdit: null, sessionPatch };
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
    const session = this.getSession() || {};
    const result = await this.pipeline.runPreviewEdit(
      { previewPath, templateId, changeRequest, quality, size },
      onProgress,
      signalKey,
    );
    this.pendingEdit = {
      originalPreviewPath: result.previewPath,
      originalDisplayPath: session.lastPreviewPath || result.previewPath,
      originalEditSourcePath: result.previewPath,
      editedPreviewPath: result.editedPreviewPath,
      editedEditSourcePath: result.editedEditSourcePath || result.editedPreviewPath,
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
    const originalDisplay = this.pendingEdit.originalDisplayPath
      || this.pendingEdit.originalPreviewPath;
    if (originalDisplay && fs.existsSync(originalDisplay)) {
      try {
        originalPreviewB64 = fs.readFileSync(originalDisplay).toString('base64');
      } catch { /* ignore */ }
    }
    return {
      originalPreviewPath: this.pendingEdit.originalPreviewPath,
      originalDisplayPath: originalDisplay,
      originalEditSourcePath: this.pendingEdit.originalEditSourcePath
        || this.pendingEdit.originalPreviewPath,
      editedPreviewPath: this.pendingEdit.editedPreviewPath,
      editedEditSourcePath: this.pendingEdit.editedEditSourcePath
        || this.pendingEdit.editedPreviewPath,
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
    const displayPath = this.pendingEdit.editedPreviewPath;
    const editSourcePath = resolveNonWmEditPath(
      this.pendingEdit.editedEditSourcePath,
      displayPath,
    );
    this.clearPendingFromSession({
      lastPreviewPath: displayPath,
      lastPreviewEditSourcePath: editSourcePath || '',
    });
    return { path: displayPath, editSourcePath: editSourcePath || '', success: true };
  }

  rejectEdit() {
    const editedDisplay = this.pendingEdit?.editedPreviewPath;
    const editedSource = this.pendingEdit?.editedEditSourcePath;
    if (editedDisplay && fs.existsSync(editedDisplay)) {
      try { fs.unlinkSync(editedDisplay); } catch { /* ignore */ }
    }
    if (editedSource && editedSource !== editedDisplay && fs.existsSync(editedSource)) {
      try { fs.unlinkSync(editedSource); } catch { /* ignore */ }
    }
    const displayPath = this.pendingEdit?.originalDisplayPath
      || this.pendingEdit?.originalPreviewPath
      || '';
    const editSourcePath = this.pendingEdit?.originalEditSourcePath
      || this.pendingEdit?.originalPreviewPath
      || displayPath;
    this.clearPendingFromSession({
      lastPreviewPath: displayPath,
      lastPreviewEditSourcePath: editSourcePath,
    });
    return { path: displayPath, editSourcePath, success: true };
  }
}

module.exports = {
  PreviewEditService,
  resolveStoredPreview,
  isValidStoredPreviewPath,
};
