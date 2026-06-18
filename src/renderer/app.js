'use strict';

import { loadI18n, getLocale, t } from './i18n/i18n.js';
import { renderHelp, openHelpDoc } from './help/help-viewer.js';
import { showContextMenu, menuItem } from './context-menu.js';

import { api } from './bridge-api.js';
import { pathsFromDataTransfer, isFileDrag } from './image-paths.js';
import {
  estimateBytesFromB64,
  estimateBytesFromDataUrl,
  formatFileSize,
} from './preview-meta.js';
let session = {};
let templates = [];
let imageSettingsCatalog = null;
let promptData = null;
let lastPreviewPath = '';
let lastPreviewB64 = '';
let editorTemplateId = '';
let editorLocked = false;
let editorGenerating = false;
let editorOutputSize = 'template';
let editorAspectRatio = 1;
let editorSizeFieldSync = false;
let editorReferenceImage = null;
let mainPreviewMetaContext = {};
let editorPreviewMetaContext = {};
let previewEditLocked = false;
let previewEditGenerating = false;
let previewOriginalB64 = '';
let waitStart = 0;
let waitTimer = null;
let activeAbortKey = '';
let currentWaitContext = null;
let openLightbox = () => {};
let openEditorCompare = () => {};
let suppressTemplateClick = false;

const WM_SORT_MIME = 'application/x-wm-sort';

function moveArrayItem(list, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function isInternalSortDrag(dataTransfer) {
  return Boolean(dataTransfer?.types && [...dataTransfer.types].includes(WM_SORT_MIME));
}

const AD_LINES = [
  {
    line: 'brandName',
    inputId: 'setting-brand',
    buttonId: 'btn-suggest-brand',
    suggestKey: 'adLine.suggest.main',
    suggestingKey: 'adLine.suggesting.main',
  },
  {
    line: 'seriesName',
    inputId: 'setting-series',
    buttonId: 'btn-suggest-series',
    suggestKey: 'adLine.suggest.line1',
    suggestingKey: 'adLine.suggesting.line1',
  },
  {
    line: 'tagline',
    inputId: 'setting-tagline',
    buttonId: 'btn-suggest-tagline',
    suggestKey: 'adLine.suggest.line2',
    suggestingKey: 'adLine.suggesting.line2',
  },
];
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

function imagePathsFromDataTransfer(dataTransfer) {
  return pathsFromDataTransfer(dataTransfer);
}

function setupGlobalFileDragAccept() {
  document.addEventListener('dragover', (e) => {
    if (!isFileDrag(e.dataTransfer) || isInternalSortDrag(e.dataTransfer)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
}

function $(id) { return document.getElementById(id); }

function bindClick(id, handler, context = '') {
  const el = $(id);
  if (!el) {
    console.error(`Missing button #${id}`);
    return;
  }
  el.addEventListener('click', () => {
    Promise.resolve(handler()).catch((err) => showError(err, context));
  });
}

function isAbortError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  const raw = String(err.message || err).toLowerCase();
  return raw.includes('abort') || raw.includes('aborted');
}

function formatError(err) {
  const raw = String(err?.message || err || '');
  if (err?.needsPairing || raw.toLowerCase().includes('not paired') || raw.toLowerCase().includes('pairing-code')) {
    return t('error.needsPairing');
  }
  if (raw.toLowerCase().includes('body is too large')) {
    return t('error.bodyTooLarge');
  }
  if (raw.includes('BRIDGE_HEADERS_TIMEOUT') || raw.toLowerCase().includes('headers timeout')
    || raw.includes('zu lange nicht geantwortet')) {
    return t('error.bridgeTimeout');
  }
  if (err?.code === 'REFERENCE_ATTACH_FAILED') {
    const cause = err?.cause;
    const causeMsg = String(cause?.message || '').toLowerCase();
    if (cause?.needsPairing || causeMsg.includes('not paired') || causeMsg.includes('pairing')) {
      return t('error.needsPairing');
    }
    return t('error.referenceAttachFailed');
  }
  if (raw.toLowerCase().includes('fetch failed')) {
    return t('error.bridgeTimeout');
  }
  const ipcMatch = raw.match(/Error invoking remote method '([^']+)': Error: (.+)/);
  if (ipcMatch) {
    const inner = ipcMatch[2];
    if (inner.toLowerCase().includes('not paired') || inner.toLowerCase().includes('pairing')) {
      return t('error.needsPairing');
    }
    if (inner.toLowerCase().includes('body is too large')) return t('error.bodyTooLarge');
    return inner;
  }
  return raw || t('error.generic');
}

let bridgeDialogAutoShown = false;

function showPairingBanner(message) {
  $('setup-banner').classList.remove('hidden');
  $('setup-message').textContent = message || t('bridge.status.needsPairing');
}

function getPairingCode() {
  const dialogCode = $('bridge-dialog-pairing-code')?.value?.trim();
  if (dialogCode) return dialogCode;
  return $('pairing-code')?.value?.trim() || '';
}

function syncPairingCodeInputs(code) {
  if ($('pairing-code')) $('pairing-code').value = code;
  if ($('bridge-dialog-pairing-code')) $('bridge-dialog-pairing-code').value = code;
}

function bridgeDialogHint(status) {
  if (!status?.running) return t('bridge.dialog.hintNotRunning');
  if (!status?.ready) return t('bridge.dialog.hintLogin');
  if (!status?.paired) return t('bridge.dialog.hint');
  return t('bridge.status.paired');
}

function renderBridgeDialogStatus(status) {
  const grid = $('bridge-dialog-status');
  if (!grid) return;
  const rows = [
    [t('bridge.dialog.lblRunning'), status?.running ? t('bridge.dialog.valYes') : t('bridge.dialog.valNo')],
    [t('bridge.dialog.lblReady'), status?.ready ? t('bridge.dialog.valReady') : t('bridge.dialog.valNotReady')],
    [t('bridge.dialog.lblPaired'), status?.paired ? t('bridge.dialog.valPaired') : t('bridge.dialog.valNotPaired')],
    [t('bridge.dialog.lblOrigin'), status?.origin || '—'],
    [t('bridge.dialog.lblUrl'), status?.bridgeUrl || '—'],
  ];
  grid.innerHTML = rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join('');
}

function closeBridgeSetupDialog() {
  const dialog = $('bridge-setup-dialog');
  if (dialog?.open) dialog.close();
}

async function openBridgeSetupDialog(options = {}) {
  const status = await api.bridgeGetStatus();
  $('bridge-dialog-title').textContent = t('bridge.dialog.title');
  $('bridge-dialog-hint').textContent = options.message || bridgeDialogHint(status);
  renderBridgeDialogStatus(status);
  syncPairingCodeInputs(getPairingCode());
  const dialog = $('bridge-setup-dialog');
  if (!dialog.open) dialog.showModal();
  if (options.focusPairing !== false && (!status.paired || options.focusPairing)) {
    $('bridge-dialog-pairing-code')?.focus();
  }
}

function showBridgeSetup(message, options = {}) {
  if (message) showPairingBanner(message);
  openBridgeSetupDialog({ message, focusPairing: options.focusPairing });
}

function withPairing(opts = {}) {
  return { ...opts, pairingCode: getPairingCode() };
}

async function ensureBridgeReady() {
  const status = await api.bridgeGetStatus();
  if (status.running && status.ready && status.paired) {
    return true;
  }

  const message = !status.running
    ? t('bridge.status.notRunning')
    : !status.ready
      ? (status.status?.message || t('bridge.status.needsLogin'))
      : t('bridge.status.needsPairing');
  showBridgeSetup(message);

  const code = getPairingCode();
  if (!code && status.running && status.ready) {
    return false;
  }

  showWait(t('bridge.setup.title'), waitContextForBridge(message));
  const result = await api.bridgeEnsureReady(code);
  hideWait();
  if (!result.success) {
    showBridgeSetup(result.message);
    return false;
  }
  await refreshBridgeStatus();
  closeBridgeSetupDialog();
  return true;
}

let statusTimer = null;

function showStatus(message, { level = 'info', ms = 5000 } = {}) {
  const el = $('app-status');
  if (!el || !String(message || '').trim()) return;
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  el.textContent = String(message).trim();
  el.className = `app-status app-status-${level}`;
  statusTimer = setTimeout(() => {
    el.textContent = '';
    el.classList.add('hidden');
    statusTimer = null;
  }, ms);
}

function showError(err, context = '') {
  if (isAbortError(err)) return;
  const message = formatError(err);
  const full = context ? `${context}: ${message}` : message;
  console.error(full, err);
  appendDebugLine({ time: new Date().toISOString(), level: 'error', source: 'ui', message: full, details: err?.details || null });
  if (err?.needsPairing || message === t('error.needsPairing')) {
    showBridgeSetup(message);
    return;
  }
  showStatus(full, { level: 'error', ms: 8000 });
}

function focusDialogField(el) {
  if (!el) return;
  const focus = () => {
    el.focus({ preventScroll: true });
    if (typeof el.select === 'function') el.select();
  };
  requestAnimationFrame(() => requestAnimationFrame(focus));
}

function askPrompt(title, defaultValue = '') {
  return new Promise((resolve) => {
    const dialog = $('prompt-dialog');
    const input = $('prompt-input');
    const form = $('prompt-form');
    $('prompt-title').textContent = title;
    input.value = defaultValue;
    const cleanup = () => {
      form.removeEventListener('submit', onSubmit);
      $('prompt-cancel').removeEventListener('click', onCancel);
      dialog.removeEventListener('cancel', onCancel);
    };
    const onCancel = (e) => {
      e?.preventDefault();
      cleanup();
      dialog.close();
      resolve(null);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      const value = input.value.trim();
      cleanup();
      dialog.close();
      resolve(value);
    };
    form.addEventListener('submit', onSubmit);
    $('prompt-cancel').addEventListener('click', onCancel);
    dialog.addEventListener('cancel', onCancel);
    dialog.showModal();
    focusDialogField(input);
  });
}

function askConfirm(title, message) {
  return new Promise((resolve) => {
    const dialog = $('confirm-dialog');
    const form = $('confirm-form');
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message;
    const cleanup = () => {
      form.removeEventListener('submit', onSubmit);
      $('confirm-cancel').removeEventListener('click', onCancel);
      dialog.removeEventListener('cancel', onCancel);
    };
    const onCancel = (e) => {
      e?.preventDefault();
      cleanup();
      dialog.close();
      resolve(false);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      cleanup();
      dialog.close();
      resolve(true);
    };
    form.addEventListener('submit', onSubmit);
    $('confirm-cancel').addEventListener('click', onCancel);
    dialog.addEventListener('cancel', onCancel);
    dialog.showModal();
  });
}

let debugLines = [];

function formatDebugEntry(entry) {
  const detail = entry.details ? ` ${JSON.stringify(entry.details)}` : '';
  return `[${entry.time}] ${entry.level.toUpperCase()} ${entry.source}: ${entry.message}${detail}`;
}

function renderDebugLog() {
  const el = $('debug-log-output');
  if (!el) return;
  el.innerHTML = debugLines.map((e) => {
    const cls = `level-${e.level}`;
    return `<span class="${cls}">${escapeHtml(formatDebugEntry(e))}</span>\n`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function appendDebugLine(entry) {
  debugLines.push(entry);
  if (debugLines.length > 200) debugLines.shift();
  renderDebugLog();
}

async function loadDebugLog() {
  try {
    debugLines = await api.debugGetLog();
    renderDebugLog();
  } catch { /* ignore */ }
}

function openDebugPanel() {
  const panel = $('debug-panel');
  panel.classList.remove('collapsed');
  document.body.classList.add('debug-open');
  showView('werbung');
}

async function addReferencePaths(filePaths) {
  const added = await api.refsAddPaths(filePaths);
  if (!added.length) {
    showError(new Error(t('refs.dropInvalid')));
    return;
  }
  await updateSession({ referenceImages: [...(session.referenceImages || []), ...added] });
  renderRefs();
}

function setupTemplateImport() {
  const panel = $('templates-panel');
  const zone = $('template-list');
  const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };

  async function importPaths(paths) {
    const imported = await api.templatesImportPaths({ paths });
    if (!imported?.length) {
      showError(new Error(t('template.importInvalid')));
      return;
    }
    await loadTemplates();
    showStatus(`${t('template.importSuccess')}: ${imported.length}`, { level: 'success' });
  }

  bindClick('btn-import-template', () => importTemplatesDialog(), t('template.import'));

  [panel, zone].forEach((el) => {
    el.addEventListener('dragenter', (e) => {
      prevent(e);
      panel.classList.add('drag-over');
      zone.classList.add('drag-over');
    });
    el.addEventListener('dragover', (e) => {
      prevent(e);
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    el.addEventListener('dragleave', (e) => {
      prevent(e);
      if (!panel.contains(e.relatedTarget)) {
        panel.classList.remove('drag-over');
        zone.classList.remove('drag-over');
      }
    });
    el.addEventListener('drop', async (e) => {
      prevent(e);
      panel.classList.remove('drag-over');
      zone.classList.remove('drag-over');
      if (isInternalSortDrag(e.dataTransfer)) return;
      const paths = imagePathsFromDataTransfer(e.dataTransfer);
      if (paths.length) await importPaths(paths);
      else showError(new Error(t('template.importInvalid')));
    });
  });
}

function setupSortableDnD() {
  let templateDragId = null;
  let refDragIndex = null;

  const templateList = $('template-list');
  templateList.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.template-card');
    if (!card) return;
    templateDragId = card.dataset.id;
    card.classList.add('dragging');
    suppressTemplateClick = true;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(WM_SORT_MIME, 'template');
    e.dataTransfer.setData('text/plain', templateDragId);
  });

  templateList.addEventListener('dragover', (e) => {
    if (templateDragId) {
      const card = e.target.closest('.template-card');
      if (!card) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      templateList.querySelectorAll('.template-card.drop-target').forEach((el) => {
        el.classList.remove('drop-target');
      });
      card.classList.add('drop-target');
      return;
    }
    if (isFileDrag(e.dataTransfer)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });

  templateList.addEventListener('drop', async (e) => {
    if (!templateDragId || !isInternalSortDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    const card = e.target.closest('.template-card');
    if (!card) return;
    const toId = card.dataset.id;
    const ids = templates.map((tmpl) => tmpl.id);
    const fromIdx = ids.indexOf(templateDragId);
    const toIdx = ids.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const nextIds = moveArrayItem(ids, fromIdx, toIdx);
    templates = await api.templatesReorder(nextIds);
    renderTemplateList('template-list', session.templateId, async (id) => {
      await selectTemplate(id);
    });
    await refreshEditorUi();
  });

  templateList.addEventListener('dragend', () => {
    templateDragId = null;
    templateList.querySelectorAll('.template-card.dragging, .template-card.drop-target').forEach((el) => {
      el.classList.remove('dragging', 'drop-target');
    });
    setTimeout(() => { suppressTemplateClick = false; }, 0);
  });

  const refsList = $('refs-list');
  refsList.addEventListener('dragstart', (e) => {
    if (e.target.closest('button')) {
      e.preventDefault();
      return;
    }
    const thumb = e.target.closest('.ref-thumb');
    if (!thumb) return;
    refDragIndex = Number(thumb.dataset.index);
    thumb.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(WM_SORT_MIME, 'ref');
    e.dataTransfer.setData('text/plain', String(refDragIndex));
  });

  refsList.addEventListener('dragover', (e) => {
    if (refDragIndex !== null && !Number.isNaN(refDragIndex)) {
      const thumb = e.target.closest('.ref-thumb');
      if (!thumb) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      refsList.querySelectorAll('.ref-thumb.drop-target').forEach((el) => {
        el.classList.remove('drop-target');
      });
      thumb.classList.add('drop-target');
      return;
    }
    if (isFileDrag(e.dataTransfer)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });

  refsList.addEventListener('drop', async (e) => {
    if (refDragIndex === null || !isInternalSortDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    const thumb = e.target.closest('.ref-thumb');
    if (!thumb) return;
    const toIdx = Number(thumb.dataset.index);
    if (!Number.isFinite(toIdx) || toIdx === refDragIndex) return;
    const refs = moveArrayItem(session.referenceImages || [], refDragIndex, toIdx);
    await updateSession({ referenceImages: refs });
    renderRefs();
  });

  refsList.addEventListener('dragend', () => {
    refDragIndex = null;
    refsList.querySelectorAll('.ref-thumb.dragging, .ref-thumb.drop-target').forEach((el) => {
      el.classList.remove('dragging', 'drop-target');
    });
  });
}

function setupDragDrop() {
  const panel = $('refs-panel');
  const zone = $('refs-list');
  const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };

  [panel, zone].forEach((el) => {
    el.addEventListener('dragenter', (e) => {
      prevent(e);
      panel.classList.add('drag-over');
      zone.classList.add('drag-over');
    });
    el.addEventListener('dragover', (e) => {
      prevent(e);
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    el.addEventListener('dragleave', (e) => {
      prevent(e);
      if (!panel.contains(e.relatedTarget)) {
        panel.classList.remove('drag-over');
        zone.classList.remove('drag-over');
      }
    });
    el.addEventListener('drop', async (e) => {
      prevent(e);
      panel.classList.remove('drag-over');
      zone.classList.remove('drag-over');
      if (isInternalSortDrag(e.dataTransfer)) return;
      const paths = imagePathsFromDataTransfer(e.dataTransfer);
      if (paths.length) await addReferencePaths(paths);
      else showError(new Error(t('refs.dropInvalid')));
    });
  });
}

function setupPreviewLightbox() {
  const overlay = $('preview-lightbox');
  const lightboxImg = $('preview-lightbox-image');
  const preview = $('preview-image');

  function closeLightbox() {
    overlay.classList.add('hidden');
    document.body.classList.remove('lightbox-open');
    resetLightboxZoom(overlay);
    lightboxImg.removeAttribute('src');
  }

  function openLightboxView(src) {
    if (!src) return;
    resetLightboxZoom(overlay);
    lightboxImg.src = src;
    overlay.classList.remove('hidden');
    document.body.classList.add('lightbox-open');
  }

  openLightbox = openLightboxView;

  bindLightboxZoom(overlay);

  preview.addEventListener('click', () => {
    if (!preview.classList.contains('hidden') && preview.src) {
      openLightboxView(preview.src);
    }
  });

  preview.addEventListener('contextmenu', async (e) => {
    if (preview.classList.contains('hidden')) return;
    const action = await showContextMenu(e, [
      menuItem('fullscreen', 'context.fullscreen'),
      menuItem('export', 'context.exportPng'),
      menuItem('explorer', 'context.showInExplorer', { enabled: !!lastPreviewPath }),
    ]);
    if (action === 'fullscreen' && preview.src) openLightboxView(preview.src);
    if (action === 'export') {
      if (lastPreviewPath) await api.exportSavePng(lastPreviewPath);
      else if (lastPreviewB64) await api.exportSavePngFromB64(lastPreviewB64);
    }
    if (action === 'explorer' && lastPreviewPath) await openPathInExplorer(lastPreviewPath);
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === lightboxImg) {
      closeLightbox();
    }
  });

  $('preview-lightbox-close').addEventListener('click', closeLightbox);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('preview-compare-lightbox')?.classList.contains('hidden')) {
      closePreviewCompareLightbox();
      return;
    }
    if (!$('editor-compare-lightbox').classList.contains('hidden')) {
      closeEditorCompareLightbox();
      return;
    }
    if (!overlay.classList.contains('hidden')) {
      closeLightbox();
    }
  });
}

function editorCompareAvailable() {
  const original = $('editor-original');
  const preview = $('editor-preview');
  return Boolean(original?.src && !preview.classList.contains('hidden') && preview.src);
}

const LIGHTBOX_ZOOM_MIN = 1;
const LIGHTBOX_ZOOM_MAX = 6;

function getLightboxZoomTarget(overlay) {
  return overlay.querySelector('.editor-compare-grid')
    || overlay.querySelector('.preview-lightbox-zoom-target');
}

function getLightboxZoomViewport(overlay) {
  return overlay.querySelector('.editor-compare-viewport')
    || overlay.querySelector('.preview-lightbox-viewport');
}

function resetLightboxZoom(overlay) {
  if (!overlay) return;
  const target = getLightboxZoomTarget(overlay);
  if (target) {
    target.style.transform = '';
    target.style.transformOrigin = 'center center';
  }
  overlay.dataset.lightboxZoom = '1';
  const viewport = getLightboxZoomViewport(overlay);
  if (viewport) {
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }
}

function applyLightboxZoom(overlay, scale, originX, originY) {
  const target = getLightboxZoomTarget(overlay);
  if (!target) return;
  const clamped = Math.min(LIGHTBOX_ZOOM_MAX, Math.max(LIGHTBOX_ZOOM_MIN, scale));
  target.style.transformOrigin = `${originX}% ${originY}%`;
  target.style.transform = clamped === 1 ? '' : `scale(${clamped})`;
  overlay.dataset.lightboxZoom = String(clamped);
}

function onLightboxWheel(e) {
  const overlay = e.currentTarget;
  if (overlay.classList.contains('hidden')) return;
  const viewport = getLightboxZoomViewport(overlay);
  if (!viewport) return;
  e.preventDefault();
  const current = Number(overlay.dataset.lightboxZoom) || 1;
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  const rect = viewport.getBoundingClientRect();
  const originX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
  const originY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
  applyLightboxZoom(overlay, current * factor, originX, originY);
}

function bindLightboxZoom(overlay) {
  if (!overlay || overlay.dataset.zoomBound === '1') return;
  overlay.dataset.zoomBound = '1';
  overlay.dataset.lightboxZoom = '1';
  overlay.addEventListener('wheel', onLightboxWheel, { passive: false });
}

function closeEditorCompareLightbox() {
  const overlay = $('editor-compare-lightbox');
  overlay.classList.add('hidden');
  document.body.classList.remove('lightbox-open');
  resetLightboxZoom(overlay);
  $('editor-compare-original').removeAttribute('src');
  $('editor-compare-preview').removeAttribute('src');
}

function openEditorCompareLightbox() {
  if (!editorCompareAvailable()) return;
  const overlay = $('editor-compare-lightbox');
  resetLightboxZoom(overlay);
  $('editor-compare-original').src = $('editor-original').src;
  $('editor-compare-preview').src = $('editor-preview').src;
  overlay.classList.remove('hidden');
  document.body.classList.add('lightbox-open');
}

function setupEditorCompareLightbox() {
  openEditorCompare = openEditorCompareLightbox;

  const overlay = $('editor-compare-lightbox');
  $('btn-editor-compare').addEventListener('click', () => openEditorCompareLightbox());

  const openCompareFromImage = (e) => {
    if (!editorCompareAvailable()) {
      if ($('editor-original').src) openLightbox($('editor-original').src);
      return;
    }
    e?.preventDefault();
    openEditorCompareLightbox();
  };

  $('editor-original').addEventListener('click', openCompareFromImage);
  $('editor-preview').addEventListener('click', (e) => {
    if ($('editor-preview').classList.contains('hidden')) return;
    openCompareFromImage(e);
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeEditorCompareLightbox();
  });
  $('editor-compare-close').addEventListener('click', closeEditorCompareLightbox);
  bindLightboxZoom(overlay);
}

function setupPreviewCompareLightbox() {
  const overlay = $('preview-compare-lightbox');
  if (!overlay) return;
  $('btn-preview-compare')?.addEventListener('click', () => openPreviewCompareLightbox());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePreviewCompareLightbox();
  });
  $('preview-compare-close')?.addEventListener('click', closePreviewCompareLightbox);
  bindLightboxZoom(overlay);
}

function setupDebugPanel() {
  $('debug-toggle').addEventListener('click', () => {
    $('debug-panel').classList.toggle('collapsed');
    document.body.classList.toggle('debug-open', !$('debug-panel').classList.contains('collapsed'));
  });
  $('btn-debug-copy').addEventListener('click', async () => {
    const text = debugLines.map(formatDebugEntry).join('\n');
    await navigator.clipboard.writeText(text);
    showStatus(t('debug.copied'), { level: 'info' });
  });
  $('btn-debug-clear').addEventListener('click', async () => {
    await api.debugClear();
    debugLines = [];
    renderDebugLog();
  });
  api.on('debug:entry', (entry) => appendDebugLine(entry));
  api.on('debug:show', () => openDebugPanel());
}

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  $(`view-${name}`)?.classList.add('active');
  document.querySelector(`[data-mode="${name}"]`)?.classList.add('active');
  if (name === 'templates' && !editorLocked && !editorGenerating && session.templateId) {
    editorTemplateId = session.templateId;
    selectEditorTemplate(session.templateId).catch(() => {});
  }
}

function applyLabels() {
  $('app-title').textContent = t('app.title');
  $('app-subtitle').textContent = t('app.subtitle');
  $('nav-werbung').textContent = t('nav.werbung');
  $('nav-templates').textContent = t('nav.templates');
  $('nav-help').textContent = t('nav.help');
  $('lbl-template').textContent = t('template.select');
  $('templates-import-hint').textContent = `${t('template.importHint')} ${t('template.reorderHint')}`;
  $('btn-import-template').textContent = t('template.import');
  $('lbl-refs').textContent = t('refs.title');
  $('btn-add-refs').textContent = t('refs.add');
  $('lbl-settings').textContent = t('settings.projectTitle');
  if ($('lbl-editor-title')) $('lbl-editor-title').textContent = t('template.editorTitle');
  if ($('preview-empty')) $('preview-empty').textContent = t('preview.empty');
  if ($('editor-preview-empty')) $('editor-preview-empty').textContent = t('template.previewEmpty');
  if ($('pairing-code')) $('pairing-code').placeholder = t('bridge.setup.pairingCode');
  $('lbl-size').textContent = t('settings.size');
  $('lbl-quality').textContent = t('settings.quality');
  $('image-settings-hint').textContent = t('settings.imageOptionsHint');
  $('lbl-brand').textContent = t('settings.brandName');
  $('lbl-series').textContent = t('settings.seriesName');
  $('lbl-tagline').textContent = t('settings.tagline');
  $('lbl-extra').textContent = t('settings.extraPrompt');
  $('lbl-internal-comment').textContent = t('settings.internalComment');
  if ($('setting-internal-comment')) {
    $('setting-internal-comment').placeholder = t('settings.internalCommentHint');
  }
  $('lbl-prompt-image').textContent = t('prompt.image');
  $('btn-build-prompt').textContent = t('generate.buildPrompt');
  $('btn-generate').textContent = t('generate.button');
  $('lbl-preview').textContent = t('generate.preview');
  $('preview-lightbox-hint').textContent = t('preview.fullscreenClose');
  $('preview-lightbox-close').setAttribute('aria-label', t('help.close'));
  $('preview-image').title = t('preview.fullscreen');
  $('btn-export').textContent = t('generate.export');
  if ($('lbl-preview-change')) $('lbl-preview-change').textContent = t('preview.changeRequest');
  if ($('preview-change-request')) {
    $('preview-change-request').placeholder = t('preview.changeRequest.placeholder');
  }
  if ($('btn-preview-edit')) $('btn-preview-edit').textContent = t('preview.editButton');
  if ($('btn-preview-accept')) $('btn-preview-accept').textContent = t('preview.accept');
  if ($('btn-preview-reject')) $('btn-preview-reject').textContent = t('preview.reject');
  if ($('btn-preview-compare')) $('btn-preview-compare').textContent = t('preview.compare');
  if ($('lbl-preview-opt-prompt')) $('lbl-preview-opt-prompt').textContent = t('prompt.optimized');
  if ($('preview-compare-lbl-original')) $('preview-compare-lbl-original').textContent = t('preview.compareOriginal');
  if ($('preview-compare-lbl-edited')) $('preview-compare-lbl-edited').textContent = t('preview.compareEdited');
  if ($('preview-compare-hint')) $('preview-compare-hint').textContent = t('preview.compareHint');
  if ($('preview-compare-close')) $('preview-compare-close').setAttribute('aria-label', t('help.close'));
  updatePreviewEditLockUi();
  $('lbl-original').textContent = t('template.original');
  $('lbl-ki-preview').textContent = t('template.preview');
  $('lbl-change').textContent = t('template.changeRequest');
  $('change-request').placeholder = t('template.changeRequest.placeholder');
  $('lbl-opt-prompt').textContent = t('prompt.optimized');
  $('btn-generate-edit').textContent = t('template.generateEdit');
  $('lbl-editor-size').textContent = t('template.outputFormat');
  if ($('lbl-editor-width')) $('lbl-editor-width').textContent = t('template.editorWidth');
  if ($('lbl-editor-height')) $('lbl-editor-height').textContent = t('template.editorHeight');
  $('lbl-editor-quality').textContent = t('settings.quality');
  $('editor-change-hint').textContent = t('template.changeOptionalHint');
  $('lbl-editor-template').textContent = t('template.current');
  $('btn-accept').textContent = t('template.accept');
  $('btn-reject').textContent = t('template.reject');
  $('btn-editor-compare').textContent = t('template.compareFullscreen');
  $('editor-compare-lbl-original').textContent = t('template.original');
  $('editor-compare-lbl-preview').textContent = t('template.preview');
  $('editor-compare-hint').textContent = t('template.compareHint');
  $('editor-compare-close').setAttribute('aria-label', t('help.close'));
  $('lbl-editor-ref').textContent = t('template.editorRef');
  $('btn-editor-ref-add').textContent = t('template.editorRefAdd');
  $('editor-ref-hint').textContent = t('template.editorRefHint');
  $('editor-ref-empty').textContent = t('template.editorRefEmpty');
  $('prompt-cancel').textContent = t('dialog.cancel');
  $('prompt-ok').textContent = t('dialog.ok');
  $('confirm-cancel').textContent = t('dialog.cancel');
  $('confirm-ok').textContent = t('dialog.ok');
  updateEditorLockUi();
  renderEditorReference();
  $('wait-title').textContent = t('wait.title');
  $('btn-wait-cancel').textContent = t('wait.cancel');
  $('btn-bridge-connect').textContent = t('bridge.setup.connect');
  $('btn-codex-login').textContent = t('bridge.setup.codexLogin');
  if ($('setup-message')) $('setup-message').textContent = t('bridge.setup.message');
  $('refs-drop-hint').textContent = t('refs.dropHint');
  $('refs-usage-hint').textContent = `${t('refs.usageHint')} ${t('refs.reorderHint')}`;
  AD_LINES.forEach((cfg) => {
    const btn = $(cfg.buttonId);
    if (btn) btn.title = t(cfg.suggestKey);
  });
  $('debug-toggle').textContent = t('debug.title');
  $('btn-debug-copy').textContent = t('debug.copy');
  $('btn-debug-clear').textContent = t('debug.clear');
  if ($('bridge-dialog-title')) $('bridge-dialog-title').textContent = t('bridge.dialog.title');
  if ($('bridge-dialog-lbl-code')) $('bridge-dialog-lbl-code').textContent = t('bridge.setup.pairingCode');
  if ($('bridge-dialog-pairing-code')) $('bridge-dialog-pairing-code').placeholder = t('bridge.setup.pairingCode');
  if ($('bridge-dialog-open-status')) $('bridge-dialog-open-status').textContent = t('bridge.dialog.openStatus');
  if ($('bridge-dialog-codex-login')) $('bridge-dialog-codex-login').textContent = t('bridge.setup.codexLogin');
  if ($('bridge-dialog-reset')) $('bridge-dialog-reset').textContent = t('bridge.dialog.resetPairing');
  if ($('bridge-dialog-close')) $('bridge-dialog-close').textContent = t('bridge.dialog.close');
  if ($('bridge-dialog-connect')) $('bridge-dialog-connect').textContent = t('bridge.setup.connect');
  if ($('bridge-status')) $('bridge-status').title = t('bridge.status.title');
}

async function connectBridgeFromUi() {
  const status = await api.bridgeGetStatus();
  const code = getPairingCode();
  if (status.running && status.ready && !/^\d{6}$/.test(code)) {
    showBridgeSetup(t('bridge.status.needsPairing'), { focusPairing: true });
    return false;
  }
  try {
    showWait(t('bridge.setup.title'), waitContextForBridge(t('bridge.setup.title')));
    const result = await api.bridgeEnsureReady(code);
    hideWait();
    if (!result.success) {
      showBridgeSetup(result.message);
      return false;
    }
    await refreshBridgeStatus();
    closeBridgeSetupDialog();
    return true;
  } catch (err) {
    hideWait();
    showError(err);
    return false;
  }
}

async function openBridgeStatusPage() {
  const status = await api.bridgeGetStatus();
  const base = (status?.bridgeUrl || 'http://127.0.0.1:8765').replace(/\/$/, '');
  await api.openExternal(`${base}/status`);
}

function setupBridgeDialog() {
  $('bridge-status').addEventListener('click', () => {
    openBridgeSetupDialog({ focusPairing: false });
  });

  $('bridge-dialog-close').addEventListener('click', () => closeBridgeSetupDialog());
  $('bridge-setup-dialog').addEventListener('cancel', () => closeBridgeSetupDialog());

  $('bridge-dialog-connect').addEventListener('click', () => {
    connectBridgeFromUi().catch((err) => showError(err));
  });

  $('bridge-dialog-codex-login').addEventListener('click', async () => {
    await api.codexLogin();
    showStatus(t('bridge.dialog.hintLogin'), { level: 'info', ms: 7000 });
  });

  $('bridge-dialog-open-status').addEventListener('click', () => {
    openBridgeStatusPage().catch((err) => showError(err));
  });

  $('bridge-dialog-reset').addEventListener('click', async () => {
    await api.bridgeResetPairing();
    syncPairingCodeInputs('');
    await refreshBridgeStatus();
    showStatus(t('bridge.dialog.resetDone'), { level: 'success' });
    showBridgeSetup(t('bridge.status.needsPairing'), { focusPairing: true });
  });

  $('btn-bridge-connect').addEventListener('click', () => {
    connectBridgeFromUi().catch((err) => showError(err));
  });

  $('btn-codex-login').addEventListener('click', async () => {
    await api.codexLogin();
    showStatus(t('bridge.dialog.hintLogin'), { level: 'info', ms: 7000 });
  });
}

async function updateSession(patch) {
  session = await api.sessionUpdate(patch);
}

function formatGatewaySizeLabel(size, tmpl) {
  if (size === imageSettingsCatalog?.sizeFromTemplate) {
    return t('settings.sizeTemplate').replace('{size}', templateSizeLabel(tmpl));
  }
  if (size === imageSettingsCatalog?.sizeFromTemplate2x) {
    return t('settings.sizeTemplate2x').replace('{size}', templateSizeLabel2x(tmpl));
  }
  if (size === 'auto') return 'Auto';
  return String(size).replace(/x/i, '×');
}

function qualityLabel(quality) {
  const key = `settings.quality.${quality}`;
  const label = t(key);
  return label === key ? quality : label;
}

function getSelectedTemplate() {
  return templates.find((tmpl) => tmpl.id === session.templateId) || null;
}

function templateSizeLabel(tmpl) {
  if (!tmpl?.width || !tmpl?.height) return '…';
  return `${tmpl.width}×${tmpl.height}`;
}

function templateSizeLabel2x(tmpl) {
  if (!tmpl?.width || !tmpl?.height) return '…';
  return `${tmpl.width * 2}×${tmpl.height * 2}`;
}

function shouldOfferTemplate2x(tmpl) {
  if (!imageSettingsCatalog) return true;
  const w = Number(tmpl?.width || 0);
  const h = Number(tmpl?.height || 0);
  if (!w || !h) return true;
  const maxNative = imageSettingsCatalog.template2xMaxNativeEdge ?? 1920;
  const maxOutput = imageSettingsCatalog.template2xMaxOutputEdge ?? 4096;
  if (Math.max(w, h) >= maxNative) return false;
  if (Math.max(w * 2, h * 2) > maxOutput) return false;
  return true;
}

function appendTemplateSizeOptions(sizeSelect, tmpl) {
  const templateOpt = document.createElement('option');
  templateOpt.value = imageSettingsCatalog.sizeFromTemplate;
  templateOpt.textContent = t('settings.sizeTemplate').replace('{size}', templateSizeLabel(tmpl));
  sizeSelect.appendChild(templateOpt);
  if (shouldOfferTemplate2x(tmpl)) {
    const template2xOpt = document.createElement('option');
    template2xOpt.value = imageSettingsCatalog.sizeFromTemplate2x;
    template2xOpt.textContent = t('settings.sizeTemplate2x').replace('{size}', templateSizeLabel2x(tmpl));
    sizeSelect.appendChild(template2xOpt);
  }
}

function templateSizeModeValues(tmpl) {
  return [
    imageSettingsCatalog.sizeFromTemplate,
    ...(shouldOfferTemplate2x(tmpl) ? [imageSettingsCatalog.sizeFromTemplate2x] : []),
    ...imageSettingsCatalog.sizes,
  ];
}

function parseSizeWxH(size) {
  const m = String(size || '').match(/^(\d{2,5})x(\d{2,5})$/i);
  if (!m) return null;
  return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
}

function setEditorTemplateAspectRatio(tmpl) {
  const w = Number(tmpl?.width || 0);
  const h = Number(tmpl?.height || 0);
  editorAspectRatio = w > 0 && h > 0 ? w / h : 1;
}

function setEditorDimensionFields(width, height) {
  editorSizeFieldSync = true;
  if ($('editor-size-width')) $('editor-size-width').value = width > 0 ? String(width) : '';
  if ($('editor-size-height')) $('editor-size-height').value = height > 0 ? String(height) : '';
  editorSizeFieldSync = false;
}

function populateEditorSizePresetSelect(sizeSelect, tmpl) {
  sizeSelect.innerHTML = '';
  const templateOpt = document.createElement('option');
  templateOpt.value = imageSettingsCatalog.sizeFromTemplate;
  templateOpt.textContent = t('settings.sizeTemplate').replace('{size}', templateSizeLabel(tmpl));
  sizeSelect.appendChild(templateOpt);
  for (const size of imageSettingsCatalog.sizes) {
    if (size === 'auto') continue;
    const opt = document.createElement('option');
    opt.value = size;
    opt.textContent = formatGatewaySizeLabel(size);
    sizeSelect.appendChild(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = 'custom';
  customOpt.textContent = t('template.sizeCustom');
  sizeSelect.appendChild(customOpt);
}

function syncEditorSizeFieldsFromValue(sizeValue, tmpl) {
  setEditorTemplateAspectRatio(tmpl);
  const nativeW = Number(tmpl?.width || 0);
  const nativeH = Number(tmpl?.height || 0);
  const presetSelect = $('editor-size-preset');
  if (!presetSelect) return;

  const normalized = String(sizeValue || '').trim();
  if (!normalized
    || normalized === imageSettingsCatalog.sizeFromTemplate
    || normalized === imageSettingsCatalog.sizeFromTemplate2x) {
    presetSelect.value = imageSettingsCatalog.sizeFromTemplate;
    setEditorDimensionFields(nativeW, nativeH);
    editorOutputSize = imageSettingsCatalog.sizeFromTemplate;
    return;
  }

  const parsed = parseSizeWxH(normalized);
  if (parsed) {
    const isPreset = imageSettingsCatalog.sizes.includes(normalized);
    presetSelect.value = isPreset ? normalized : 'custom';
    setEditorDimensionFields(parsed.width, parsed.height);
    editorOutputSize = normalized;
    return;
  }

  presetSelect.value = imageSettingsCatalog.sizeFromTemplate;
  setEditorDimensionFields(nativeW, nativeH);
  editorOutputSize = imageSettingsCatalog.sizeFromTemplate;
}

function getEditorSizeValue() {
  const preset = $('editor-size-preset')?.value || imageSettingsCatalog?.sizeFromTemplate;
  if (preset === imageSettingsCatalog.sizeFromTemplate) {
    return imageSettingsCatalog.sizeFromTemplate;
  }
  if (preset !== 'custom' && imageSettingsCatalog?.sizes?.includes(preset)) {
    return preset;
  }
  const w = parseInt($('editor-size-width')?.value, 10);
  const h = parseInt($('editor-size-height')?.value, 10);
  if (!w || !h) return imageSettingsCatalog.sizeFromTemplate;
  const tmpl = getEditorTemplate();
  if (tmpl?.width === w && tmpl?.height === h) {
    return imageSettingsCatalog.sizeFromTemplate;
  }
  return `${w}x${h}`;
}

function editorDimensionsValid() {
  const w = parseInt($('editor-size-width')?.value, 10);
  const h = parseInt($('editor-size-height')?.value, 10);
  return w >= 64 && h >= 64 && w <= 8192 && h <= 8192;
}

function onEditorSizePresetChange() {
  const preset = $('editor-size-preset')?.value;
  const tmpl = getEditorTemplate();
  if (preset === imageSettingsCatalog.sizeFromTemplate) {
    setEditorDimensionFields(tmpl?.width, tmpl?.height);
    editorOutputSize = imageSettingsCatalog.sizeFromTemplate;
    return;
  }
  if (preset === 'custom') {
    editorOutputSize = getEditorSizeValue();
    return;
  }
  const parsed = parseSizeWxH(preset);
  if (parsed) {
    setEditorDimensionFields(parsed.width, parsed.height);
    editorOutputSize = preset;
  }
}

function onEditorDimensionInput(axis) {
  if (editorSizeFieldSync) return;
  const widthEl = $('editor-size-width');
  const heightEl = $('editor-size-height');
  let w = parseInt(widthEl?.value, 10);
  let h = parseInt(heightEl?.value, 10);
  if (!editorAspectRatio || editorAspectRatio <= 0) return;

  editorSizeFieldSync = true;
  if (axis === 'width' && w > 0) {
    h = Math.max(1, Math.round(w / editorAspectRatio));
    heightEl.value = String(h);
  } else if (axis === 'height' && h > 0) {
    w = Math.max(1, Math.round(h * editorAspectRatio));
    widthEl.value = String(w);
  }
  editorSizeFieldSync = false;

  w = parseInt(widthEl?.value, 10);
  h = parseInt(heightEl?.value, 10);
  if (w > 0 && h > 0) {
    $('editor-size-preset').value = 'custom';
    editorOutputSize = getEditorSizeValue();
  }
}

function setupEditorSizeControls() {
  $('editor-size-preset')?.addEventListener('change', () => {
    onEditorSizePresetChange();
  });
  $('editor-size-width')?.addEventListener('input', () => {
    onEditorDimensionInput('width');
  });
  $('editor-size-height')?.addEventListener('input', () => {
    onEditorDimensionInput('height');
  });
}

function getEditorTemplate() {
  const id = editorTemplateId || session.templateId;
  return templates.find((item) => item.id === id) || null;
}

function resolveEditorTargetSize(sizeValue, tmpl) {
  if (!sizeValue || sizeValue === 'template') {
    if (tmpl?.width && tmpl?.height) return `${tmpl.width}x${tmpl.height}`;
    return '';
  }
  if (sizeValue === 'template2x') {
    if (tmpl?.width && tmpl?.height) return `${tmpl.width * 2}x${tmpl.height * 2}`;
    return '';
  }
  return sizeValue;
}

function isEditorFormatOnly(changeRequest, sizeValue, tmpl) {
  if (String(changeRequest || '').trim()) return false;
  const native = tmpl?.width && tmpl?.height ? `${tmpl.width}x${tmpl.height}` : '';
  const target = resolveEditorTargetSize(sizeValue, tmpl);
  if (!target) return false;
  if (target === 'auto') return true;
  return target !== native;
}

async function refreshEditorUi() {
  const activeId = editorTemplateId || session.templateId || '';
  const tmpl = templates.find((item) => item.id === activeId);

  const select = $('editor-template-select');
  select.innerHTML = '';
  if (!templates.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = t('template.empty');
    select.appendChild(opt);
    select.disabled = true;
  } else {
    for (const item of templates) {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.name;
      select.appendChild(opt);
    }
    const resolvedId = templates.some((item) => item.id === activeId)
      ? activeId
      : templates[0].id;
    select.value = resolvedId;
    select.disabled = editorLocked || editorGenerating;
  }

  const thumb = $('editor-current-thumb');
  const thumbId = select.value || activeId;
  if (thumbId) {
    const url = await api.templatesGetImage(thumbId);
    if (thumbId === (editorTemplateId || session.templateId) && url) {
      thumb.src = url;
      thumb.classList.remove('hidden');
    }
  } else {
    thumb.removeAttribute('src');
    thumb.classList.add('hidden');
  }

  const displayTmpl = templates.find((item) => item.id === thumbId) || tmpl;
  let dims = displayTmpl?.width && displayTmpl?.height
    ? { width: displayTmpl.width, height: displayTmpl.height }
    : null;
  if (displayTmpl?.id && !dims) {
    dims = await api.templatesGetDimensions(displayTmpl.id);
    if (dims?.width && dims?.height) {
      displayTmpl.width = dims.width;
      displayTmpl.height = dims.height;
    }
  }
  const sizeBadge = $('editor-size-badge');
  if (sizeBadge) {
    sizeBadge.classList.add('hidden');
    sizeBadge.textContent = '';
  }

  if (!imageSettingsCatalog) {
    imageSettingsCatalog = await api.getImageSettingsCatalog();
  }
  const presetSelect = $('editor-size-preset');
  const prevSize = editorOutputSize || imageSettingsCatalog.defaultSize;
  if (presetSelect) {
    populateEditorSizePresetSelect(presetSelect, displayTmpl);
    syncEditorSizeFieldsFromValue(prevSize, displayTmpl);
    presetSelect.disabled = editorLocked || editorGenerating;
  }
  if ($('editor-size-width')) $('editor-size-width').disabled = editorLocked || editorGenerating;
  if ($('editor-size-height')) $('editor-size-height').disabled = editorLocked || editorGenerating;

  const qualitySelect = $('editor-quality');
  const prevQuality = qualitySelect.value || session.quality || imageSettingsCatalog.defaultQuality;
  qualitySelect.innerHTML = '';
  for (const quality of imageSettingsCatalog.qualities) {
    const opt = document.createElement('option');
    opt.value = quality;
    opt.textContent = qualityLabel(quality);
    qualitySelect.appendChild(opt);
  }
  qualitySelect.value = imageSettingsCatalog.qualities.includes(prevQuality)
    ? prevQuality
    : imageSettingsCatalog.defaultQuality;
  qualitySelect.disabled = editorLocked || editorGenerating;
}

function updateEditorLockUi() {
  const bar = $('editor-current-bar');
  const hint = $('editor-locked-hint');
  const locked = editorLocked || editorGenerating;
  bar.classList.toggle('locked', locked);
  const select = $('editor-template-select');
  if (select) select.disabled = locked || !templates.length;
  hint.classList.toggle('hidden', !locked);
  hint.textContent = t('template.lockedHint');
  $('btn-generate-edit').disabled = editorGenerating;
  $('change-request').disabled = editorGenerating;
  if ($('editor-size-preset')) $('editor-size-preset').disabled = locked || editorGenerating;
  if ($('editor-size-width')) $('editor-size-width').disabled = locked || editorGenerating;
  if ($('editor-size-height')) $('editor-size-height').disabled = locked || editorGenerating;
  if ($('editor-quality')) $('editor-quality').disabled = locked || editorGenerating;
  if ($('btn-editor-ref-add')) $('btn-editor-ref-add').disabled = locked || editorGenerating;
}

function setEditorReferenceImage(ref, { persist = true } = {}) {
  editorReferenceImage = ref?.path ? ref : null;
  if (persist) {
    void updateSession({ editorReferenceImagePath: editorReferenceImage?.path || '' });
  }
  renderEditorReference();
}

function clearEditorReference() {
  setEditorReferenceImage(null);
}

function renderEditorReference() {
  const preview = $('editor-ref-preview');
  const empty = $('editor-ref-empty');
  if (!preview || !empty) return;
  preview.innerHTML = '';
  if (!editorReferenceImage?.path) {
    preview.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  preview.classList.remove('hidden');
  const div = document.createElement('div');
  div.className = 'ref-thumb';
  const img = document.createElement('img');
  img.alt = editorReferenceImage.name || '';
  api.filesReadDataUrl(editorReferenceImage.path).then((url) => { if (url) img.src = url; });
  const btn = document.createElement('button');
  btn.textContent = '×';
  btn.addEventListener('click', () => {
    if (editorLocked || editorGenerating) return;
    clearEditorReference();
  });
  div.appendChild(img);
  div.appendChild(btn);
  preview.appendChild(div);
}

async function addEditorReferencePaths(filePaths) {
  const paths = (filePaths || []).filter((p) => p && IMAGE_EXT.test(p));
  if (!paths.length) {
    showError(new Error(t('template.editorRefDropInvalid')));
    return;
  }
  const added = await api.refsAddPaths([paths[0]]);
  if (!added.length) {
    showError(new Error(t('template.editorRefDropInvalid')));
    return;
  }
  setEditorReferenceImage(added[0]);
}

function setupEditorReference() {
  bindClick('btn-editor-ref-add', async () => {
    if (editorLocked || editorGenerating) return;
    const picked = await api.refsAddDialog();
    if (picked?.length) await addEditorReferencePaths([picked[0].path]);
  }, t('template.editorRefAdd'));

  const drop = $('editor-ref-drop');
  const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
  drop.addEventListener('dragenter', (e) => {
    prevent(e);
    if (!editorLocked && !editorGenerating) drop.classList.add('drag-over');
  });
  drop.addEventListener('dragover', (e) => {
    prevent(e);
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  drop.addEventListener('dragleave', (e) => {
    prevent(e);
    if (!drop.contains(e.relatedTarget)) drop.classList.remove('drag-over');
  });
  drop.addEventListener('drop', async (e) => {
    prevent(e);
    drop.classList.remove('drag-over');
    if (editorLocked || editorGenerating) return;
    if (isInternalSortDrag(e.dataTransfer)) return;
    const paths = imagePathsFromDataTransfer(e.dataTransfer);
    if (paths.length) await addEditorReferencePaths(paths);
    else showError(new Error(t('template.editorRefDropInvalid')));
  });
}

function setPreviewReviewBarVisible(visible) {
  const bar = $('preview-review-bar');
  if (bar) bar.classList.toggle('hidden', !visible);
}

function updatePreviewEditLockUi() {
  const locked = previewEditLocked || previewEditGenerating;
  const hint = $('preview-locked-hint');
  if (hint) hint.classList.toggle('hidden', !previewEditLocked);
  if (hint && previewEditLocked) hint.textContent = t('preview.lockedHint');
  if ($('preview-change-request')) $('preview-change-request').disabled = locked;
  if ($('btn-preview-edit')) $('btn-preview-edit').disabled = locked || !lastPreviewPath;
  if ($('btn-generate')) $('btn-generate').disabled = locked;
  if ($('btn-build-prompt')) $('btn-build-prompt').disabled = locked;
}

function buildPreviewMetaFromSession(s = session) {
  return {
    format: 'PNG',
    requestedLabel: formatGatewaySizeLabel(s.size, getSelectedTemplate()),
    quality: s.quality || 'high',
  };
}

function applyPreviewPendingEditUi(pending) {
  if (!pending) return;
  previewEditLocked = true;
  previewOriginalB64 = pending.originalPreviewB64 || '';
  $('preview-change-request').value = pending.changeRequest || '';
  $('preview-optimized-prompt').value = pending.optimizedEditPrompt || '';
  $('preview-change-summary').textContent = pending.changeSummary || '';
  const editedB64 = pending.editedPreviewB64 || '';
  if (editedB64) {
    mainPreviewMetaContext = {
      format: 'PNG',
      fileSizeBytes: estimateBytesFromB64(editedB64),
      requestedLabel: formatGatewaySizeLabel(pending.imageSize || session.size, getSelectedTemplate()),
      quality: pending.quality || session.quality || 'high',
    };
    showPreview(pending.editedPreviewPath || lastPreviewPath, editedB64, mainPreviewMetaContext);
  }
  setPreviewReviewBarVisible(true);
  const details = $('preview-prompt-details');
  if (details && pending.optimizedEditPrompt) details.open = true;
  updatePreviewEditLockUi();
}

async function restorePreviewFromSession(s = session) {
  const resolved = await api.previewResolveStored();
  if (resolved.session) {
    session = resolved.session;
  }
  if (!resolved.valid) {
    previewEditLocked = false;
    previewOriginalB64 = '';
    setPreviewReviewBarVisible(false);
    if ($('preview-edit-block')) $('preview-edit-block').classList.add('hidden');
    updatePreviewEditLockUi();
    return;
  }
  if (resolved.pendingEdit) {
    lastPreviewPath = resolved.pendingEdit.originalPreviewPath || resolved.path || '';
    applyPreviewPendingEditUi(resolved.pendingEdit);
    if ($('preview-edit-block')) $('preview-edit-block').classList.remove('hidden');
    return;
  }
  if (resolved.path) {
    previewEditLocked = false;
    previewOriginalB64 = '';
    setPreviewReviewBarVisible(false);
    showPreview(resolved.path, '', buildPreviewMetaFromSession(s));
    if ($('preview-edit-block')) $('preview-edit-block').classList.remove('hidden');
    updatePreviewEditLockUi();
  }
}

function previewCompareAvailable() {
  const preview = $('preview-image');
  return Boolean(previewOriginalB64 && !preview.classList.contains('hidden') && preview.src);
}

function closePreviewCompareLightbox() {
  const overlay = $('preview-compare-lightbox');
  if (!overlay) return;
  overlay.classList.add('hidden');
  document.body.classList.remove('lightbox-open');
  resetLightboxZoom(overlay);
  $('preview-compare-original')?.removeAttribute('src');
  $('preview-compare-edited')?.removeAttribute('src');
}

function openPreviewCompareLightbox() {
  if (!previewCompareAvailable()) return;
  const overlay = $('preview-compare-lightbox');
  resetLightboxZoom(overlay);
  const preview = $('preview-image');
  $('preview-compare-original').src = previewOriginalB64
    ? `data:image/png;base64,${previewOriginalB64}`
    : '';
  $('preview-compare-edited').src = preview.src;
  overlay.classList.remove('hidden');
  document.body.classList.add('lightbox-open');
}

function setEditorReviewBarVisible(visible) {
  const bar = $('editor-review-bar');
  if (bar) bar.classList.toggle('hidden', !visible);
}

function refreshPreviewMetaOverlay(imgId, overlayId, context = {}) {
  const img = $(imgId);
  const overlay = $(overlayId);
  if (!img || !overlay) return;
  if (img.classList.contains('hidden') || !img.src) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.textContent = '';
    return;
  }
  const w = img.naturalWidth || 0;
  const h = img.naturalHeight || 0;
  if (!w || !h) return;

  const lines = [];
  lines.push(t('preview.meta.dimensions').replace('{size}', `${w}×${h}`));
  lines.push(t('preview.meta.format').replace('{format}', context.format || 'PNG'));
  const bytes = context.fileSizeBytes || estimateBytesFromDataUrl(img.src);
  const sizeLabel = formatFileSize(bytes);
  if (sizeLabel) {
    lines.push(t('preview.meta.fileSize').replace('{size}', sizeLabel));
  }
  if (context.requestedLabel) {
    lines.push(t('preview.meta.requested').replace('{size}', context.requestedLabel));
  }
  if (context.quality) {
    lines.push(t('preview.meta.quality').replace('{quality}', qualityLabel(context.quality)));
  }
  overlay.textContent = lines.join('\n');
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
}

function attachPreviewMetaListeners(imgId, overlayId, getContext) {
  const img = $(imgId);
  if (!img) return;
  img.addEventListener('load', () => {
    refreshPreviewMetaOverlay(imgId, overlayId, getContext());
  });
}

function clearEditorPreview() {
  $('editor-preview').classList.add('hidden');
  $('editor-preview-empty').classList.remove('hidden');
  setEditorReviewBarVisible(false);
  editorPreviewMetaContext = {};
  refreshPreviewMetaOverlay('editor-preview', 'editor-preview-meta', {});
  $('optimized-prompt').value = '';
  $('change-summary').textContent = '';
  const promptDetails = $('editor-prompt-details');
  if (promptDetails) promptDetails.open = false;
}

async function refreshImageSettingsUi() {
  if (!imageSettingsCatalog) {
    imageSettingsCatalog = await api.getImageSettingsCatalog();
  }
  const selected = getSelectedTemplate();
  if (selected?.id) {
    const dims = await api.templatesGetDimensions(selected.id);
    if (dims?.width && dims?.height) {
      selected.width = dims.width;
      selected.height = dims.height;
    }
  }
  const sizeSelect = $('setting-size');
  const qualitySelect = $('setting-quality');
  const prevSize = session.size || sizeSelect.value || imageSettingsCatalog.defaultSize;
  let prevQuality = session.quality || qualitySelect.value || imageSettingsCatalog.defaultQuality;
  if (prevQuality === 'standard') prevQuality = 'medium';

  sizeSelect.innerHTML = '';
  appendTemplateSizeOptions(sizeSelect, getSelectedTemplate());
  for (const size of imageSettingsCatalog.sizes) {
    const opt = document.createElement('option');
    opt.value = size;
    opt.textContent = formatGatewaySizeLabel(size);
    sizeSelect.appendChild(opt);
  }

  const validSizes = templateSizeModeValues(getSelectedTemplate());
  let nextSize = validSizes.includes(prevSize) ? prevSize : imageSettingsCatalog.defaultSize;
  if (prevSize === imageSettingsCatalog.sizeFromTemplate2x && !shouldOfferTemplate2x(getSelectedTemplate())) {
    nextSize = imageSettingsCatalog.defaultSize;
    if (session.size === imageSettingsCatalog.sizeFromTemplate2x) {
      await updateSession({ size: nextSize });
    }
  }
  sizeSelect.value = nextSize;

  qualitySelect.innerHTML = '';
  for (const quality of imageSettingsCatalog.qualities) {
    const opt = document.createElement('option');
    opt.value = quality;
    opt.textContent = qualityLabel(quality);
    qualitySelect.appendChild(opt);
  }
  qualitySelect.value = imageSettingsCatalog.qualities.includes(prevQuality)
    ? prevQuality
    : imageSettingsCatalog.defaultQuality;
}

function readSettingsFromUi() {
  return {
    templateId: session.templateId,
    size: $('setting-size').value,
    quality: $('setting-quality').value,
    brandName: $('setting-brand').value,
    seriesName: $('setting-series').value,
    tagline: $('setting-tagline').value,
    extraPrompt: $('setting-extra').value,
    internalComment: $('setting-internal-comment')?.value || '',
    referenceImages: session.referenceImages || [],
    preflightPrompt: session.preflightPrompt || '',
    preflightFingerprint: session.preflightFingerprint || '',
    productAnalysis: session.productAnalysis || '',
  };
}

function promptInputsFromSettings(settings) {
  return {
    templateId: settings.templateId || '',
    brandName: settings.brandName || '',
    seriesName: settings.seriesName || '',
    tagline: settings.tagline || '',
    extraPrompt: settings.extraPrompt || '',
    referenceImages: (settings.referenceImages || []).map((r) => r.path).filter(Boolean),
  };
}

function computePromptFingerprint(settings) {
  return JSON.stringify(promptInputsFromSettings(settings));
}

function promptInputsChanged(settings) {
  return computePromptFingerprint(settings) !== (session.promptFingerprint || '');
}

function promptDataFromSession() {
  const hasMeta = session.imagePrompt || session.preflightPrompt
    || session.brandName || session.tagline || (session.referenceImages || []).length;
  if (!hasMeta) return null;
  const finalPrompt = session.preflightPrompt || session.imagePrompt || '';
  return {
    brandName: session.brandName || '',
    seriesName: session.seriesName || '',
    tagline: session.tagline || '',
    productDescription: session.productDescription || '',
    placementInstructions: session.placementInstructions || '',
    productAnalysis: session.productAnalysis || '',
    imagePrompt: session.imagePrompt || finalPrompt,
    finalPrompt,
  };
}

function pendingPreflightPlaceholder(source = session) {
  return (source.referenceImages || []).length > 0
    && !String(source.preflightPrompt || '').trim()
    && !String(source.imagePrompt || '').trim();
}

function resolvePromptDisplayText(source = session) {
  const prompt = String(source.preflightPrompt || source.imagePrompt || '').trim();
  if (prompt) return prompt;
  if (pendingPreflightPlaceholder(source)) return t('prompt.pendingPreflight');
  return '';
}

function refreshPromptImageField() {
  $('prompt-image').value = resolvePromptDisplayText();
}

function restorePromptFromSession() {
  promptData = promptDataFromSession();
  refreshPromptImageField();
}

async function applyBuiltPrompt(data, fingerprint) {
  promptData = data;
  const displaySource = {
    preflightPrompt: data.preflightPrompt || data.finalPrompt || '',
    imagePrompt: data.imagePrompt || '',
  };
  $('prompt-image').value = resolvePromptDisplayText({
    ...session,
    ...displaySource,
  });
  $('setting-brand').value = data.brandName || '';
  $('setting-series').value = data.seriesName || '';
  $('setting-tagline').value = data.tagline || '';
  session = await api.sessionUpdate({
    brandName: data.brandName || '',
    seriesName: data.seriesName || '',
    tagline: data.tagline || '',
    imagePrompt: data.imagePrompt || '',
    productDescription: data.productDescription || '',
    placementInstructions: data.placementInstructions || '',
    productAnalysis: data.productAnalysis || '',
    preflightPrompt: data.preflightPrompt || data.finalPrompt || data.imagePrompt || '',
    preflightFingerprint: data.preflightFingerprint || '',
    promptFingerprint: fingerprint,
  });
}

async function buildAndPersistPrompt(settings, waitMessage, { runPreflight = false } = {}) {
  showWait(
    waitMessage || t('wait.status.buildingPrompt'),
    waitContextForGeneration(settings, 'prompt'),
  );
  const data = await api.generateBuildPrompt(withPairing({ ...settings, runPreflight }));
  const fingerprint = computePromptFingerprint(settings);
  await applyBuiltPrompt(data, fingerprint);
  hideWait();
  return data;
}

function needsPromptRebuild(settings) {
  const hasRefs = (settings.referenceImages || []).length > 0;
  if (hasRefs && session.promptFingerprint && !promptInputsChanged(settings)) {
    return false;
  }
  return !session.imagePrompt || promptInputsChanged(settings);
}

function promptDataForGenerate(settings) {
  const fromSession = promptDataFromSession();
  if (fromSession) return fromSession;
  return {
    brandName: settings.brandName || '',
    seriesName: settings.seriesName || '',
    tagline: settings.tagline || '',
    imagePrompt: session.imagePrompt || '',
    productDescription: session.productDescription || '',
    placementInstructions: session.placementInstructions || '',
    productAnalysis: session.productAnalysis || '',
  };
}

function writeSettingsToUi() {
  $('setting-size').value = session.size || imageSettingsCatalog?.defaultSize || 'template';
  let quality = session.quality || imageSettingsCatalog?.defaultQuality || 'high';
  if (quality === 'standard') quality = 'medium';
  $('setting-quality').value = quality;
  $('setting-brand').value = session.brandName || '';
  $('setting-series').value = session.seriesName || '';
  $('setting-tagline').value = session.tagline || '';
  $('setting-extra').value = session.extraPrompt || '';
  if ($('setting-internal-comment')) {
    $('setting-internal-comment').value = session.internalComment || '';
  }
}

async function openPathInExplorer(filePath) {
  if (filePath) await api.showItemInFolder(filePath);
}

async function selectTemplate(id, { openEditor = false } = {}) {
  await updateSession({ templateId: id });
  if (!editorLocked && !editorGenerating) {
    editorTemplateId = id;
  }
  await refreshImageSettingsUi();
  writeSettingsToUi();
  if (openEditor) {
    await selectEditorTemplate(id, { syncSession: false });
    showView('templates');
  } else {
    await loadTemplates();
  }
}

async function renameTemplate(id) {
  const tmpl = templates.find((item) => item.id === id);
  if (!tmpl) return;
  const name = await askPrompt(t('template.rename'), tmpl.name);
  if (name === null || !name.trim()) return;
  try {
    await api.templatesRename({ id, name: name.trim() });
    await loadTemplates();
  } catch (err) {
    showError(err, t('template.rename'));
  }
}

async function cloneTemplate(id) {
  const tmpl = templates.find((item) => item.id === id);
  if (!tmpl) {
    showStatus(t('template.empty'), { level: 'warn' });
    return;
  }
  const name = await askPrompt(t('template.clone'), `${tmpl.name} – Kopie`);
  if (name === null) return;
  try {
    const cloned = await api.templatesClone({ sourceId: id, name: name || undefined });
    await loadTemplates();
    if (cloned?.id) {
      await updateSession({ templateId: cloned.id });
      editorTemplateId = cloned.id;
      await selectEditorTemplate(cloned.id);
    }
    showStatus(t('template.cloneSuccess'), { level: 'success' });
  } catch (err) {
    showError(err, t('template.clone'));
  }
}

async function deleteTemplate(id) {
  const tmpl = templates.find((item) => item.id === id);
  if (!tmpl) return;
  const ok = await askConfirm(t('template.delete'), t('template.deleteConfirm').replace('{name}', tmpl.name));
  if (!ok) return;
  try {
    await api.templatesDelete(id);
    if (session.templateId === id) {
      const fallback = templates.find((item) => item.id !== id);
      await updateSession({ templateId: fallback?.id || '' });
    }
    await loadTemplates();
    showStatus(t('template.deleteSuccess'), { level: 'success' });
  } catch (err) {
    showError(err, t('template.delete'));
  }
}

async function removeReferenceAt(index) {
  const refs = [...(session.referenceImages || [])];
  refs.splice(index, 1);
  await updateSession({ referenceImages: refs });
  renderRefs();
}

async function importTemplatesDialog() {
  const imported = await api.templatesImportDialog();
  if (!imported?.length) return;
  await loadTemplates();
  showStatus(`${t('template.importSuccess')}: ${imported.length}`, { level: 'success' });
}

async function addReferenceImagesDialog() {
  const added = await api.refsAddDialog();
  if (!added?.length) return;
  await updateSession({ referenceImages: [...(session.referenceImages || []), ...added] });
  renderRefs();
}

function templateContextItems(tmpl) {
  return [
    menuItem('select', 'context.select'),
    menuItem('edit', 'context.edit'),
    menuItem('rename', 'context.rename'),
    menuItem('clone', 'context.clone'),
    menuItem('delete', 'context.delete'),
    menuItem('sep', '', { separator: true }),
    menuItem('explorer', 'context.showInExplorer', { enabled: !!tmpl.path }),
  ];
}

async function handleTemplateContextAction(actionId, tmpl, onSelect) {
  switch (actionId) {
    case 'select':
      await onSelect(tmpl.id);
      break;
    case 'edit':
      await selectTemplate(tmpl.id, { openEditor: true });
      break;
    case 'rename':
      await renameTemplate(tmpl.id);
      break;
    case 'clone':
      await cloneTemplate(tmpl.id);
      break;
    case 'delete':
      await deleteTemplate(tmpl.id);
      break;
    case 'explorer':
      if (tmpl.path) await openPathInExplorer(tmpl.path);
      break;
    default:
      break;
  }
}

function setupEditorImageContextMenus() {
  $('editor-original').addEventListener('contextmenu', async (e) => {
    const tmpl = templates.find((item) => item.id === (editorTemplateId || session.templateId));
    const items = [
      menuItem('fullscreen', 'context.fullscreen'),
    ];
    if (editorCompareAvailable()) {
      items.push(menuItem('compare', 'context.compareFullscreen'));
    }
    items.push(menuItem('explorer', 'context.showInExplorer', { enabled: !!tmpl?.path }));
    const action = await showContextMenu(e, items);
    if (action === 'compare') openEditorCompareLightbox();
    else if (action === 'fullscreen' && $('editor-original').src) openLightbox($('editor-original').src);
    else if (action === 'explorer' && tmpl?.path) await openPathInExplorer(tmpl.path);
  });

  $('editor-preview').addEventListener('contextmenu', async (e) => {
    if ($('editor-preview').classList.contains('hidden')) return;
    const items = [
      menuItem('compare', 'context.compareFullscreen'),
      menuItem('fullscreen', 'context.fullscreen'),
    ];
    if (!$('editor-review-bar').classList.contains('hidden')) {
      items.push(menuItem('sep', '', { separator: true }));
      items.push(menuItem('accept', 'context.acceptEdit'));
      items.push(menuItem('reject', 'context.rejectEdit'));
    }
    const action = await showContextMenu(e, items);
    if (action === 'compare') openEditorCompareLightbox();
    else if (action === 'fullscreen' && $('editor-preview').src) openLightbox($('editor-preview').src);
    else if (action === 'accept') $('btn-accept').click();
    else if (action === 'reject') $('btn-reject').click();
  });
}

function setupPanelContextMenus() {
  $('templates-panel').addEventListener('contextmenu', async (e) => {
    if (e.target.closest('.template-card')) return;
    const action = await showContextMenu(e, [menuItem('import', 'context.import')]);
    if (action === 'import') {
      try {
        await importTemplatesDialog();
      } catch (err) {
        showError(err, t('template.import'));
      }
    }
  });

  $('refs-panel').addEventListener('contextmenu', async (e) => {
    if (e.target.closest('.ref-thumb')) return;
    const action = await showContextMenu(e, [menuItem('add', 'context.addImages')]);
    if (action === 'add') await addReferenceImagesDialog();
  });
}

function renderTemplateList(containerId, selectedId, onSelect) {
  const el = $(containerId);
  el.innerHTML = '';
  const sortable = containerId === 'template-list';
  if (!templates.length) {
    el.innerHTML = `<p class="muted">${t('template.empty')}</p>`;
    return;
  }
  for (const tmpl of templates) {
    const card = document.createElement('div');
    card.className = `template-card${tmpl.id === selectedId ? ' selected' : ''}`;
    card.dataset.id = tmpl.id;
    if (sortable) card.draggable = true;
    const img = document.createElement('img');
    img.alt = tmpl.name;
    img.draggable = false;
    api.templatesGetImage(tmpl.id).then((url) => { if (url) img.src = url; });
    const span = document.createElement('span');
    span.textContent = tmpl.name;
    card.appendChild(img);
    card.appendChild(span);
    card.addEventListener('click', () => {
      if (suppressTemplateClick) return;
      onSelect(tmpl.id);
    });
    card.addEventListener('contextmenu', async (e) => {
      const action = await showContextMenu(e, templateContextItems(tmpl));
      if (action) await handleTemplateContextAction(action, tmpl, onSelect);
    });
    el.appendChild(card);
  }
}

function renderRefs() {
  const el = $('refs-list');
  const refs = session.referenceImages || [];
  el.innerHTML = '';
  if (!refs.length) {
    el.innerHTML = `<p class="muted refs-empty-inline">${t('refs.empty')}</p>`;
    return;
  }
  refs.forEach((ref, idx) => {
    const div = document.createElement('div');
    div.className = 'ref-thumb';
    div.draggable = true;
    div.dataset.index = String(idx);
    const img = document.createElement('img');
    img.draggable = false;
    api.filesReadDataUrl(ref.path).then((url) => { if (url) img.src = url; });
    const btn = document.createElement('button');
    btn.textContent = '×';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await removeReferenceAt(idx);
    });
    div.addEventListener('contextmenu', async (e) => {
      const action = await showContextMenu(e, [
        menuItem('fullscreen', 'context.fullscreen'),
        menuItem('explorer', 'context.showInExplorer', { enabled: !!ref.path }),
        menuItem('sep', '', { separator: true }),
        menuItem('remove', 'context.remove'),
      ]);
      if (action === 'fullscreen') {
        const url = await api.filesReadDataUrl(ref.path);
        if (url) openLightbox(url);
      }
      if (action === 'explorer' && ref.path) await openPathInExplorer(ref.path);
      if (action === 'remove') await removeReferenceAt(idx);
    });
    div.appendChild(img);
    div.appendChild(btn);
    el.appendChild(div);
  });
}

function resolveWaitMessage(progress) {
  if (progress.message) return progress.message;
  if (progress.messageKey) {
    let text = t(progress.messageKey);
    const params = progress.messageParams || {};
    for (const [key, value] of Object.entries(params)) {
      text = text.replace(`{${key}}`, String(value));
    }
    return text;
  }
  if (progress.status) {
    return t(`wait.status.${progress.status}`) || progress.status;
  }
  return '';
}

function waitContextExcerpt(text, max = 200) {
  const s = String(text || '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function resolvePromptExcerpt(settings, pdata) {
  const fromData = pdata?.preflightPrompt || pdata?.finalPrompt || pdata?.imagePrompt;
  if (fromData) return waitContextExcerpt(fromData);
  const fromSession = session.preflightPrompt || session.imagePrompt;
  if (fromSession) return waitContextExcerpt(fromSession);
  if (settings?.extraPrompt) return waitContextExcerpt(settings.extraPrompt);
  return '';
}

function waitContextForGeneration(settings, kind, pdata) {
  const tmpl = templates.find((item) => item.id === (settings.templateId || session.templateId));
  return {
    kind,
    template: tmpl?.name || tmpl?.id || '',
    mainLine: settings.brandName || '',
    adLine1: settings.seriesName || '',
    adLine2: settings.tagline || '',
    size: settings.size || '',
    quality: settings.quality || '',
    refs: (settings.referenceImages || []).length,
    prompt: resolvePromptExcerpt(settings, pdata),
  };
}

function waitContextForTemplateEdit({ templateId, changeRequest, size, quality }) {
  const tmpl = templates.find((item) => item.id === templateId) || getEditorTemplate();
  return {
    kind: 'templateEdit',
    template: tmpl?.name || tmpl?.id || '',
    size: size || '',
    quality: quality || '',
    change: waitContextExcerpt(changeRequest, 240),
  };
}

function waitContextForPreviewEdit({ templateId, changeRequest, size, quality }) {
  const tmpl = templates.find((item) => item.id === templateId) || getSelectedTemplate();
  return {
    kind: 'previewEdit',
    template: tmpl?.name || tmpl?.id || '',
    size: size || '',
    quality: quality || '',
    change: waitContextExcerpt(changeRequest, 240),
  };
}

function waitContextForAdLine(settings) {
  return {
    kind: 'adLine',
    mainLine: settings.brandName || '',
    adLine1: settings.seriesName || '',
    adLine2: settings.tagline || '',
  };
}

function waitContextForBridge(detail) {
  return {
    kind: 'bridge',
    detail: detail || '',
  };
}

function renderWaitContext(ctx) {
  const el = $('wait-context');
  if (!el) return;
  if (!ctx) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  const rows = [];
  const add = (labelKey, value) => {
    if (value == null || value === '') return;
    rows.push(`<dt>${escapeHtml(t(labelKey))}</dt><dd>${escapeHtml(String(value))}</dd>`);
  };

  const kindKey = `wait.context.task.${ctx.kind}`;
  const kindLabel = t(kindKey);
  add('wait.context.task', kindLabel === kindKey ? ctx.kind : kindLabel);

  if (ctx.kind === 'image' || ctx.kind === 'prompt') {
    add('wait.context.template', ctx.template);
    add('wait.context.mainLine', ctx.mainLine);
    add('wait.context.adLine1', ctx.adLine1);
    add('wait.context.adLine2', ctx.adLine2);
    const sizeTmpl = getSelectedTemplate();
    if (ctx.size) add('wait.context.size', formatGatewaySizeLabel(ctx.size, sizeTmpl));
    if (ctx.quality) add('wait.context.quality', qualityLabel(ctx.quality));
    if (ctx.refs != null) add('wait.context.refs', ctx.refs);
  } else if (ctx.kind === 'templateEdit') {
    add('wait.context.template', ctx.template);
    const sizeTmpl = getEditorTemplate();
    if (ctx.size) add('wait.context.size', formatGatewaySizeLabel(ctx.size, sizeTmpl));
    if (ctx.quality) add('wait.context.quality', qualityLabel(ctx.quality));
    add('wait.context.change', ctx.change);
  } else if (ctx.kind === 'previewEdit') {
    add('wait.context.template', ctx.template);
    const sizeTmpl = getSelectedTemplate();
    if (ctx.size) add('wait.context.size', formatGatewaySizeLabel(ctx.size, sizeTmpl));
    if (ctx.quality) add('wait.context.quality', qualityLabel(ctx.quality));
    add('wait.context.change', ctx.change);
  } else if (ctx.kind === 'adLine') {
    add('wait.context.mainLine', ctx.mainLine);
    add('wait.context.adLine1', ctx.adLine1);
    add('wait.context.adLine2', ctx.adLine2);
  } else if (ctx.kind === 'bridge') {
    add('wait.context.detail', ctx.detail);
  }

  let html = `<dl class="wait-context-grid">${rows.join('')}</dl>`;
  if (ctx.prompt && (ctx.kind === 'image' || ctx.kind === 'prompt')) {
    html += `<p class="wait-context-prompt"><strong>${escapeHtml(t('wait.context.prompt'))}:</strong> ${escapeHtml(ctx.prompt)}</p>`;
  }
  el.innerHTML = html;
}

function showWait(message, context) {
  currentWaitContext = context || null;
  waitStart = Date.now();
  $('wait-status').textContent = message || t('wait.status.running');
  $('wait-elapsed').textContent = '';
  $('wait-output').textContent = '';
  renderWaitContext(currentWaitContext);
  if (waitTimer) clearInterval(waitTimer);
  waitTimer = setInterval(() => updateWait({ status: 'running' }), 1000);
  $('wait-dialog').showModal();
}

function updateWait(progress) {
  if (progress?.signalKey) {
    activeAbortKey = progress.signalKey;
  }
  const message = resolveWaitMessage(progress);
  if (message) {
    $('wait-status').textContent = message;
  }
  if (progress.elapsed_ms != null) {
    $('wait-elapsed').textContent = `${t('wait.elapsed')}: ${Math.round(progress.elapsed_ms / 1000)} s`;
  } else if (waitStart) {
    $('wait-elapsed').textContent = `${t('wait.elapsed')}: ${Math.round((Date.now() - waitStart) / 1000)} s`;
  }
  if (progress.session_output) {
    $('wait-output').textContent = progress.session_output.slice(-2000);
  }
}

function hideWait() {
  currentWaitContext = null;
  activeAbortKey = '';
  if (waitTimer) {
    clearInterval(waitTimer);
    waitTimer = null;
  }
  $('wait-dialog').close();
  renderWaitContext(null);
}

function showPreview(path, b64, meta = {}) {
  const img = $('preview-image');
  mainPreviewMetaContext = {
    format: meta.format || 'PNG',
    fileSizeBytes: meta.fileSizeBytes ?? estimateBytesFromB64(b64),
    requestedLabel: meta.requestedLabel || '',
    quality: meta.quality || '',
  };
  if (b64) {
    img.src = `data:image/png;base64,${b64}`;
  } else if (path) {
    api.filesReadDataUrl(path).then((url) => {
      if (!url) return;
      img.src = url;
      if (!mainPreviewMetaContext.fileSizeBytes) {
        mainPreviewMetaContext.fileSizeBytes = estimateBytesFromDataUrl(url);
      }
    });
  }
  img.classList.remove('hidden');
  $('preview-empty').classList.add('hidden');
  $('btn-export').classList.remove('hidden');
  if ($('preview-edit-block')) $('preview-edit-block').classList.remove('hidden');
  lastPreviewPath = path;
  lastPreviewB64 = b64 || '';
  if (b64) {
    refreshPreviewMetaOverlay('preview-image', 'preview-image-meta', mainPreviewMetaContext);
  }
  updatePreviewEditLockUi();
}

async function refreshBridgeStatus(options = {}) {
  const status = await api.bridgeGetStatus();
  if (
    options.autoOpen
    && !options._retried
    && !bridgeDialogAutoShown
    && status.running
    && status.ready
    && status.hasToken
    && !status.paired
  ) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return refreshBridgeStatus({ ...options, _retried: true });
  }
  return applyBridgeStatusUi(status, options);
}

async function applyBridgeStatusUi(status, options = {}) {
  const el = $('bridge-status');
  const banner = $('setup-banner');
  if (status.running && status.ready && status.paired) {
    el.className = 'bridge-status ready';
    el.title = t('bridge.status.paired');
    banner.classList.add('hidden');
    closeBridgeSetupDialog();
  } else if (status.running && status.ready) {
    el.className = 'bridge-status error';
    el.title = t('bridge.status.needsPairing');
    banner.classList.remove('hidden');
    $('setup-message').textContent = t('bridge.status.needsPairing');
    if (options.autoOpen && !bridgeDialogAutoShown) {
      bridgeDialogAutoShown = true;
      showBridgeSetup(t('bridge.status.needsPairing'), { focusPairing: true });
    }
  } else if (status.running) {
    el.className = 'bridge-status error';
    el.title = t('bridge.status.needsLogin');
    banner.classList.remove('hidden');
    $('setup-message').textContent = status.status?.message || t('bridge.status.needsLogin');
    if (options.autoOpen && !bridgeDialogAutoShown) {
      bridgeDialogAutoShown = true;
      showBridgeSetup(status.status?.message || t('bridge.status.needsLogin'), { focusPairing: false });
    }
  } else {
    el.className = 'bridge-status error';
    el.title = t('bridge.status.notRunning');
    banner.classList.remove('hidden');
    $('setup-message').textContent = t('bridge.status.notRunning');
    if (options.autoOpen && !bridgeDialogAutoShown) {
      bridgeDialogAutoShown = true;
      showBridgeSetup(t('bridge.status.notRunning'), { focusPairing: false });
    }
  }
  if ($('bridge-setup-dialog')?.open) {
    renderBridgeDialogStatus(status);
    $('bridge-dialog-hint').textContent = bridgeDialogHint(status);
  }
  return status;
}

async function loadTemplates() {
  templates = await api.templatesList();
  let selectedId = session.templateId;
  if (selectedId && !templates.some((t) => t.id === selectedId)) {
    selectedId = '';
    await updateSession({ templateId: '' });
  }
  if (!selectedId && templates.length) {
    selectedId = templates[templates.length - 1].id;
    await updateSession({ templateId: selectedId });
  }
  renderTemplateList('template-list', session.templateId, async (id) => {
    await selectTemplate(id);
  });
  await refreshImageSettingsUi();
  await refreshEditorUi();
  writeSettingsToUi();
  if ($('view-templates')?.classList.contains('active')) {
    const id = editorTemplateId || session.templateId;
    if (id) {
      const url = await api.templatesGetImage(id);
      if (url) $('editor-original').src = url;
    }
  }
}

async function selectEditorTemplate(id, options = {}) {
  if ((editorLocked || editorGenerating) && !options.force) {
    showStatus(t('template.lockedHint'), { level: 'warn', ms: 7000 });
    return;
  }
  editorTemplateId = id;
  if (!options.preserveReference) {
    clearEditorReference();
  }
  if (options.referenceImage) {
    setEditorReferenceImage(options.referenceImage);
  }
  if (options.syncSession !== false) {
    await updateSession({ templateId: id });
  }
  const url = await api.templatesGetImage(id);
  if (url) $('editor-original').src = url;
  if (!options.preservePreview) {
    clearEditorPreview();
  }
  await refreshEditorUi();
  await refreshImageSettingsUi();
}

async function reloadLocale(prefs) {
  const locale = prefs?.resolvedLocale || getLocale() || 'en';
  await loadI18n(locale);
  document.documentElement.lang = locale;
  applyLabels();
  await renderHelp($('help-sidebar'), $('help-content'));
}

function setupInteractionHandlers() {
  setupGlobalFileDragAccept();
  setupBridgeDialog();
  setupTemplateImport();
  setupSortableDnD();
  setupDragDrop();
  setupPreviewLightbox();
  setupEditorCompareLightbox();
  setupPreviewCompareLightbox();
  setupEditorSizeControls();
  attachPreviewMetaListeners('preview-image', 'preview-image-meta', () => mainPreviewMetaContext);
  attachPreviewMetaListeners('editor-preview', 'editor-preview-meta', () => editorPreviewMetaContext);
  setupEditorReference();
  setupEditorImageContextMenus();
  setupPanelContextMenus();
  setupDebugPanel();

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.mode));
  });

  ['setting-size', 'setting-quality', 'setting-brand', 'setting-series', 'setting-tagline', 'setting-extra', 'setting-internal-comment'].forEach((id) => {
    const el = $(id);
    if (!el) {
      console.error(`Missing control #${id}`);
      return;
    }
    el.addEventListener('change', async () => {
      await updateSession(readSettingsFromUi());
    });
    el.addEventListener('input', async () => {
      await updateSession(readSettingsFromUi());
    });
  });

  bindClick('btn-add-refs', () => addReferenceImagesDialog(), t('refs.add'));

  async function suggestAdLine(lineKey, cfg) {
    if (!(await ensureBridgeReady())) return;
    const refs = session.referenceImages || [];
    if (!refs.length) {
      showStatus(t('adLine.needRefs'), { level: 'warn' });
      return;
    }
    const btn = $(cfg.buttonId);
    try {
      if (btn) btn.disabled = true;
      const settings = readSettingsFromUi();
      showWait(t(cfg.suggestingKey), waitContextForAdLine(settings));
      const result = await api.generateSuggestAdLine(withPairing({ ...settings, line: lineKey }));
      const value = result[lineKey] || '';
      $(cfg.inputId).value = value;
      await updateSession({ [lineKey]: value });
      hideWait();
    } catch (err) {
      hideWait();
      showError(err, t(cfg.suggestKey));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  AD_LINES.forEach((cfg) => {
    const btn = $(cfg.buttonId);
    if (!btn) {
      console.error(`Missing button #${cfg.buttonId}`);
      return;
    }
    btn.addEventListener('click', () => suggestAdLine(cfg.line, cfg));
  });

  $('btn-build-prompt').addEventListener('click', async () => {
    if (!session.templateId) {
      showStatus(t('template.empty'), { level: 'warn' });
      return;
    }
    if (!(await ensureBridgeReady())) return;
    try {
      await buildAndPersistPrompt(readSettingsFromUi(), undefined, { runPreflight: true });
    } catch (err) {
      hideWait();
      showError(err, t('error.promptFailed'));
    }
  });

  $('btn-generate').addEventListener('click', async () => {
    if (!session.templateId) {
      showStatus(t('template.empty'), { level: 'warn' });
      return;
    }
    if (previewEditLocked) {
      const discard = await askConfirm(t('generate.button'), t('preview.pendingGenerateConfirm'));
      if (!discard) return;
      await api.previewRejectEdit();
      previewEditLocked = false;
      previewOriginalB64 = '';
      setPreviewReviewBarVisible(false);
      updatePreviewEditLockUi();
      if (lastPreviewPath) {
        showPreview(lastPreviewPath, lastPreviewB64, buildPreviewMetaFromSession());
      }
    }
    const settings = readSettingsFromUi();
    if (!(await ensureBridgeReady())) return;
    try {
      if (needsPromptRebuild(settings)) {
        await buildAndPersistPrompt(settings, t('generate.rebuildPrompt'));
      } else {
        promptData = promptDataForGenerate(settings);
      }
      showWait(t('wait.status.running'), waitContextForGeneration(settings, 'image', promptData));
      const result = await api.generateImage({
        promptData,
        settings,
        pairingCode: getPairingCode(),
      });
      if (result.attachmentMode) {
        const modeMsg = t('debug.attachmentMode').replace('{mode}', result.attachmentMode);
        appendDebugLine({
          time: new Date().toISOString(),
          level: 'info',
          source: 'ui',
          message: modeMsg,
        });
      }
      if (result.refsForwardedToCodex) {
        appendDebugLine({
          time: new Date().toISOString(),
          level: 'info',
          source: 'ui',
          message: t('debug.refsForwarded').replace('{count}', String(result.referenceAttachmentCount || 0)),
        });
      } else if ((settings.referenceImages || []).length > 0) {
        appendDebugLine({
          time: new Date().toISOString(),
          level: 'warn',
          source: 'ui',
          message: t('debug.refsNotForwarded'),
        });
      }
      if (result.preflightPrompt) {
        await updateSession({
          preflightPrompt: result.preflightPrompt,
          imagePrompt: result.preflightPrompt,
          preflightFingerprint: result.preflightFingerprint || session.preflightFingerprint,
        });
        if (promptData) {
          promptData.finalPrompt = result.preflightPrompt;
          promptData.imagePrompt = result.preflightPrompt;
        }
        refreshPromptImageField();
        const details = document.querySelector('.prompt-details');
        if (details) details.open = true;
      }
      showPreview(result.path, result.b64, {
        format: 'PNG',
        fileSizeBytes: estimateBytesFromB64(result.b64),
        requestedLabel: formatGatewaySizeLabel(settings.size, getSelectedTemplate()),
        quality: settings.quality,
      });
      previewEditLocked = false;
      previewOriginalB64 = '';
      setPreviewReviewBarVisible(false);
      $('preview-change-summary').textContent = '';
      $('preview-optimized-prompt').value = '';
      await updateSession({ lastPreviewPath: result.path, previewPendingEdit: null });
      updatePreviewEditLockUi();
      hideWait();
    } catch (err) {
      hideWait();
      showError(err, t('error.generateFailed'));
    }
  });

  $('btn-export').addEventListener('click', async () => {
    if (lastPreviewPath) await api.exportSavePng(lastPreviewPath);
    else if (lastPreviewB64) await api.exportSavePngFromB64(lastPreviewB64);
  });

  $('btn-preview-edit')?.addEventListener('click', async () => {
    if (!(await ensureBridgeReady())) return;
    if (!lastPreviewPath) return;
    const changeRequest = $('preview-change-request').value.trim();
    if (!changeRequest) {
      showStatus(t('preview.needChange'), { level: 'warn' });
      return;
    }
    const settings = readSettingsFromUi();
    try {
      previewEditGenerating = true;
      updatePreviewEditLockUi();
      previewOriginalB64 = lastPreviewB64 || '';
      if (!previewOriginalB64 && lastPreviewPath) {
        const url = await api.filesReadDataUrl(lastPreviewPath);
        if (url?.startsWith('data:')) {
          previewOriginalB64 = url.split(',')[1] || '';
        }
      }
      showWait(
        t('preview.editButton'),
        waitContextForPreviewEdit({
          templateId: settings.templateId || session.templateId,
          changeRequest,
          size: settings.size,
          quality: settings.quality,
        }),
      );
      const result = await api.previewRunEdit({
        previewPath: lastPreviewPath,
        templateId: settings.templateId || session.templateId,
        changeRequest,
        quality: settings.quality,
        size: settings.size,
        pairingCode: getPairingCode(),
      });
      $('preview-optimized-prompt').value = result.optimizedEditPrompt || '';
      $('preview-change-summary').textContent = result.changeSummary || '';
      if (result.editedPreviewB64) {
        mainPreviewMetaContext = {
          format: 'PNG',
          fileSizeBytes: estimateBytesFromB64(result.editedPreviewB64),
          requestedLabel: formatGatewaySizeLabel(settings.size, getSelectedTemplate()),
          quality: settings.quality,
        };
        showPreview(result.editedPreviewPath, result.editedPreviewB64, mainPreviewMetaContext);
        setPreviewReviewBarVisible(true);
        const details = $('preview-prompt-details');
        if (details) details.open = true;
      }
      previewEditLocked = true;
      hideWait();
    } catch (err) {
      hideWait();
      showError(err);
    } finally {
      previewEditGenerating = false;
      updatePreviewEditLockUi();
    }
  });

  $('btn-preview-accept')?.addEventListener('click', async () => {
    try {
      const result = await api.previewAcceptEdit();
      previewEditLocked = false;
      previewOriginalB64 = '';
      setPreviewReviewBarVisible(false);
      $('preview-change-summary').textContent = '';
      $('preview-optimized-prompt').value = '';
      if (result.path) {
        lastPreviewB64 = '';
        showPreview(result.path, '', buildPreviewMetaFromSession());
        await updateSession({ lastPreviewPath: result.path });
      }
      updatePreviewEditLockUi();
    } catch (err) {
      showError(err);
    }
  });

  $('btn-preview-reject')?.addEventListener('click', async () => {
    try {
      const result = await api.previewRejectEdit();
      previewEditLocked = false;
      setPreviewReviewBarVisible(false);
      $('preview-change-summary').textContent = '';
      $('preview-optimized-prompt').value = '';
      if (result.path) {
        if (previewOriginalB64) {
          showPreview(result.path, previewOriginalB64, buildPreviewMetaFromSession());
        } else {
          showPreview(result.path, '', buildPreviewMetaFromSession());
        }
      }
      previewOriginalB64 = '';
      updatePreviewEditLockUi();
    } catch (err) {
      showError(err);
    }
  });

  $('editor-template-select').addEventListener('change', async () => {
    const id = $('editor-template-select').value;
    if (!id || id === editorTemplateId) return;
    await selectEditorTemplate(id);
  });

  $('btn-generate-edit').addEventListener('click', async () => {
    if (!(await ensureBridgeReady())) return;
    const id = editorTemplateId || session.templateId;
    const changeRequest = $('change-request').value.trim();
    const size = getEditorSizeValue();
    const tmpl = getEditorTemplate();
    if (!editorDimensionsValid()) {
      showStatus(t('template.invalidSize'), { level: 'warn' });
      return;
    }
    if (!isEditorFormatOnly(changeRequest, size, tmpl) && !changeRequest) {
      showStatus(t('template.needChangeOrSize'), { level: 'warn' });
      return;
    }
    try {
      editorGenerating = true;
      editorOutputSize = size;
      updateEditorLockUi();
      showWait(
        t('template.generateEdit'),
        waitContextForTemplateEdit({
          templateId: id,
          changeRequest,
          size,
          quality: $('editor-quality').value,
        }),
      );
      const result = await api.templatesRunEdit({
        templateId: id,
        changeRequest,
        quality: $('editor-quality').value,
        size,
        referenceImagePath: editorReferenceImage?.path || '',
        pairingCode: getPairingCode(),
      });
      $('optimized-prompt').value = result.optimizedEditPrompt || '';
      $('change-summary').textContent = result.changeSummary || '';
      if (result.previewB64) {
        editorPreviewMetaContext = {
          format: 'PNG',
          fileSizeBytes: estimateBytesFromB64(result.previewB64),
          requestedLabel: formatGatewaySizeLabel(size, tmpl),
          quality: $('editor-quality').value,
        };
        $('editor-preview').src = `data:image/png;base64,${result.previewB64}`;
        $('editor-preview').classList.remove('hidden');
        $('editor-preview-empty').classList.add('hidden');
        refreshPreviewMetaOverlay('editor-preview', 'editor-preview-meta', editorPreviewMetaContext);
        setEditorReviewBarVisible(true);
      }
      editorLocked = true;
      hideWait();
    } catch (err) {
      hideWait();
      showError(err);
    } finally {
      editorGenerating = false;
      updateEditorLockUi();
      await refreshEditorUi();
    }
  });

  $('btn-accept').addEventListener('click', async () => {
    try {
      const accepted = await api.templatesAcceptEdit();
      editorLocked = false;
      $('change-request').value = '';
      clearEditorPreview();
      updateEditorLockUi();
      await loadTemplates();
      await updateSession({ templateId: accepted.templateId });
      await selectEditorTemplate(accepted.templateId);
      showStatus(t('template.editSuccess'), { level: 'success' });
    } catch (err) {
      showError(err);
    }
  });

  $('btn-reject').addEventListener('click', async () => {
    await api.templatesRejectEdit();
    editorLocked = false;
    clearEditorPreview();
    updateEditorLockUi();
    await refreshEditorUi();
  });

  $('btn-wait-cancel').addEventListener('click', async () => {
    if (activeAbortKey) {
      await api.generateAbort(activeAbortKey);
    }
    hideWait();
  });

  api.on('job:progress', (p) => updateWait(p));
  api.on('bridge:progress', (p) => updateWait(p));
  api.on('session:loaded', async (s) => {
    session = s;
    await refreshImageSettingsUi();
    writeSettingsToUi();
    restorePromptFromSession();
    renderRefs();
    if (s.editorReferenceImagePath) {
      setEditorReferenceImage({
        path: s.editorReferenceImagePath,
        name: s.editorReferenceImagePath.split(/[/\\]/).pop() || '',
      }, { persist: false });
    } else if (!editorLocked) {
      clearEditorReference();
    }
    await loadTemplates();
    await restorePreviewFromSession(s);
  });
  api.on('session:saved', (s) => {
    session = s;
    restorePromptFromSession();
    const details = document.querySelector('.prompt-details');
    if (details && (s.preflightPrompt || s.imagePrompt)) details.open = true;
  });
  api.on('help:open', (id) => {
    showView('help');
    openHelpDoc(id, $('help-content'), $('help-sidebar'), getLocale());
  });
  api.on('preferences:changed', async (prefs) => {
    await reloadLocale(prefs);
    await refreshBridgeStatus();
  });
  api.on('nav:template-editor', () => showView('templates'));
  api.on('action:save-as', async () => {
    const name = session.profileName || 'Profil';
    const saved = await api.profileSaveDialog(name);
    if (saved) {
      session.profilePath = saved.path;
      session.profileName = saved.name;
    }
  });
  api.on('templates:updated', async () => {
    await loadTemplates();
  });
  api.on('action:template-import', () => importTemplatesDialog());
  api.on('action:bridge-setup', () => showBridgeSetup(t('bridge.status.needsPairing'), { focusPairing: true }));
  api.on('action:bridge-status', () => openBridgeSetupDialog({ focusPairing: false }));
  api.on('template:selected', async (id) => {
    editorTemplateId = id;
    await selectEditorTemplate(id);
    showView('templates');
  });
  api.on('action:template-clone', async () => {
    const id = session.templateId || editorTemplateId;
    if (!id) {
      showStatus(t('template.selectFirst'), { level: 'warn' });
      return;
    }
    await cloneTemplate(id);
  });
  api.on('action:template-delete', async () => {
    const id = editorTemplateId || session.templateId;
    if (!id) return;
    await deleteTemplate(id);
  });
}

async function init() {
  document.body.classList.add('i18n-pending');
  const prefs = await api.getPreferences();
  await loadI18n(prefs.resolvedLocale || 'en');
  document.documentElement.lang = prefs.resolvedLocale || 'en';
  applyLabels();
  document.body.classList.remove('i18n-pending');

  setupInteractionHandlers();

  session = await api.sessionGet();
  if (session.editorReferenceImagePath) {
    setEditorReferenceImage({
      path: session.editorReferenceImagePath,
      name: session.editorReferenceImagePath.split(/[/\\]/).pop() || '',
    }, { persist: false });
  }
  await refreshImageSettingsUi();
  writeSettingsToUi();
  restorePromptFromSession();
  await loadTemplates();
  renderRefs();
  await restorePreviewFromSession(session);
  await refreshBridgeStatus({ autoOpen: true });
  await renderHelp($('help-sidebar'), $('help-content'));

  const pendingEdit = await api.templatesGetPendingEdit();
  if (pendingEdit?.templateId) {
    editorTemplateId = pendingEdit.templateId;
    editorLocked = true;
    $('change-request').value = pendingEdit.changeRequest || '';
    $('optimized-prompt').value = pendingEdit.optimizedEditPrompt || '';
    $('change-summary').textContent = pendingEdit.changeSummary || '';
    if (pendingEdit.referenceImagePath) {
      setEditorReferenceImage({
        path: pendingEdit.referenceImagePath,
        name: pendingEdit.referenceImagePath.split(/[/\\]/).pop() || '',
      });
    }
    updateEditorLockUi();
    await selectEditorTemplate(pendingEdit.templateId, {
      preservePreview: true,
      preserveReference: true,
      force: true,
    });
    if (pendingEdit.previewB64) {
      editorPreviewMetaContext = {
        format: 'PNG',
        fileSizeBytes: estimateBytesFromB64(pendingEdit.previewB64),
        requestedLabel: formatGatewaySizeLabel(pendingEdit.imageSize, getEditorTemplate()),
        quality: session.quality || 'high',
      };
      $('editor-preview').src = `data:image/png;base64,${pendingEdit.previewB64}`;
      $('editor-preview').classList.remove('hidden');
      $('editor-preview-empty').classList.add('hidden');
      refreshPreviewMetaOverlay('editor-preview', 'editor-preview-meta', editorPreviewMetaContext);
      setEditorReviewBarVisible(true);
    }
  } else {
    editorTemplateId = session.templateId;
    if (editorTemplateId) await selectEditorTemplate(editorTemplateId);
  }

  await loadDebugLog();
}

init().catch((err) => {
  console.error(err);
  showStatus(err.message || 'Startfehler', { level: 'error', ms: 10000 });
});
