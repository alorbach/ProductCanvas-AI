'use strict';

import { loadI18n, t } from './i18n/i18n.js';
import { renderHelp, openHelpDoc } from './help/help-viewer.js';
import { showContextMenu, menuItem } from './context-menu.js';

const api = window.werbungMaker;
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
let editorReferenceImage = null;
let waitStart = 0;
let waitTimer = null;
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

const CATEGORIES = ['TV', 'BEAMER', 'LEINWÄNDE', 'LAUTSPRECHER', 'AV-RECEIVER', 'SUBWOOFER', 'KINOSESSEL'];
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

function $(id) { return document.getElementById(id); }

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

function showPairingBanner(message) {
  $('setup-banner').classList.remove('hidden');
  $('setup-message').textContent = message || t('bridge.status.needsPairing');
  $('pairing-code').focus();
}

function getPairingCode() {
  return $('pairing-code').value.trim();
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
  showPairingBanner(message);

  const code = getPairingCode();
  if (!code && status.running && status.ready) {
    return false;
  }

  showWait(t('bridge.setup.title'));
  const result = await api.bridgeEnsureReady(code);
  hideWait();
  if (!result.success) {
    showPairingBanner(result.message);
    return false;
  }
  await refreshBridgeStatus();
  return true;
}

function showError(err, context = '') {
  const message = formatError(err);
  const full = context ? `${context}: ${message}` : message;
  console.error(full, err);
  appendDebugLine({ time: new Date().toISOString(), level: 'error', source: 'ui', message: full, details: err?.details || null });
  if (err?.needsPairing || message === t('error.needsPairing')) {
    showPairingBanner(message);
  }
  alert(full);
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
    input.focus();
    input.select();
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
    alert(`${t('template.importSuccess')}: ${imported.length}`);
  }

  $('btn-import-template').addEventListener('click', () => {
    importTemplatesDialog().catch((err) => showError(err, t('template.import')));
  });

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
      const paths = [...(e.dataTransfer?.files || [])]
        .map((f) => f.path)
        .filter((p) => p && IMAGE_EXT.test(p));
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
    if (!templateDragId) return;
    const card = e.target.closest('.template-card');
    if (!card) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    templateList.querySelectorAll('.template-card.drop-target').forEach((el) => {
      el.classList.remove('drop-target');
    });
    card.classList.add('drop-target');
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
    if (refDragIndex === null || Number.isNaN(refDragIndex)) return;
    const thumb = e.target.closest('.ref-thumb');
    if (!thumb) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    refsList.querySelectorAll('.ref-thumb.drop-target').forEach((el) => {
      el.classList.remove('drop-target');
    });
    thumb.classList.add('drop-target');
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
      const paths = [...(e.dataTransfer?.files || [])]
        .map((f) => f.path)
        .filter((p) => p && IMAGE_EXT.test(p));
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
    lightboxImg.removeAttribute('src');
  }

  function openLightboxView(src) {
    if (!src) return;
    lightboxImg.src = src;
    overlay.classList.remove('hidden');
    document.body.classList.add('lightbox-open');
  }

  openLightbox = openLightboxView;

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

function closeEditorCompareLightbox() {
  const overlay = $('editor-compare-lightbox');
  overlay.classList.add('hidden');
  document.body.classList.remove('lightbox-open');
  $('editor-compare-original').removeAttribute('src');
  $('editor-compare-preview').removeAttribute('src');
}

function openEditorCompareLightbox() {
  if (!editorCompareAvailable()) return;
  $('editor-compare-original').src = $('editor-original').src;
  $('editor-compare-preview').src = $('editor-preview').src;
  $('editor-compare-lightbox').classList.remove('hidden');
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
}

function setupDebugPanel() {
  $('debug-toggle').addEventListener('click', () => {
    $('debug-panel').classList.toggle('collapsed');
    document.body.classList.toggle('debug-open', !$('debug-panel').classList.contains('collapsed'));
  });
  $('btn-debug-copy').addEventListener('click', async () => {
    const text = debugLines.map(formatDebugEntry).join('\n');
    await navigator.clipboard.writeText(text);
    alert(t('debug.copied'));
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
  $('lbl-settings').textContent = t('settings.title');
  $('lbl-size').textContent = t('settings.size');
  $('lbl-quality').textContent = t('settings.quality');
  $('image-settings-hint').textContent = t('settings.imageOptionsHint');
  $('lbl-category').textContent = t('settings.category');
  $('lbl-brand').textContent = t('settings.brandName');
  $('lbl-series').textContent = t('settings.seriesName');
  $('lbl-tagline').textContent = t('settings.tagline');
  $('lbl-extra').textContent = t('settings.extraPrompt');
  $('lbl-prompt-image').textContent = t('prompt.image');
  $('btn-build-prompt').textContent = t('generate.buildPrompt');
  $('btn-generate').textContent = t('generate.button');
  $('lbl-preview').textContent = t('generate.preview');
  $('preview-lightbox-hint').textContent = t('preview.fullscreenClose');
  $('preview-lightbox-close').setAttribute('aria-label', t('help.close'));
  $('preview-image').title = t('preview.fullscreen');
  $('btn-export').textContent = t('generate.export');
  $('lbl-original').textContent = t('template.original');
  $('lbl-ki-preview').textContent = t('template.preview');
  $('lbl-change').textContent = t('template.changeRequest');
  $('change-request').placeholder = t('template.changeRequest.placeholder');
  $('lbl-opt-prompt').textContent = t('prompt.optimized');
  $('btn-generate-edit').textContent = t('template.generateEdit');
  $('lbl-editor-size').textContent = t('template.outputFormat');
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
  $('refs-drop-hint').textContent = t('refs.dropHint');
  $('refs-usage-hint').textContent = `${t('refs.usageHint')} ${t('refs.reorderHint')}`;
  $('btn-suggest-tagline').title = t('tagline.suggest');
  $('debug-toggle').textContent = t('debug.title');
  $('btn-debug-copy').textContent = t('debug.copy');
  $('btn-debug-clear').textContent = t('debug.clear');
}

async function updateSession(patch) {
  session = await api.sessionUpdate(patch);
}

function formatGatewaySizeLabel(size) {
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

function appendTemplateSizeOptions(sizeSelect, tmpl) {
  const templateOpt = document.createElement('option');
  templateOpt.value = imageSettingsCatalog.sizeFromTemplate;
  templateOpt.textContent = t('settings.sizeTemplate').replace('{size}', templateSizeLabel(tmpl));
  sizeSelect.appendChild(templateOpt);
  const template2xOpt = document.createElement('option');
  template2xOpt.value = imageSettingsCatalog.sizeFromTemplate2x;
  template2xOpt.textContent = t('settings.sizeTemplate2x').replace('{size}', templateSizeLabel2x(tmpl));
  sizeSelect.appendChild(template2xOpt);
}

function templateSizeModeValues() {
  return [
    imageSettingsCatalog.sizeFromTemplate,
    imageSettingsCatalog.sizeFromTemplate2x,
    ...imageSettingsCatalog.sizes,
  ];
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
  const sizeSelect = $('editor-size');
  const prevSize = sizeSelect?.value || editorOutputSize || imageSettingsCatalog.defaultSize;
  if (sizeSelect) {
    sizeSelect.innerHTML = '';
    appendTemplateSizeOptions(sizeSelect, displayTmpl);
    for (const size of imageSettingsCatalog.sizes) {
      const opt = document.createElement('option');
      opt.value = size;
      opt.textContent = formatGatewaySizeLabel(size);
      sizeSelect.appendChild(opt);
    }
    const validSizes = templateSizeModeValues();
    const nextSize = validSizes.includes(prevSize) ? prevSize : imageSettingsCatalog.defaultSize;
    sizeSelect.value = nextSize;
    editorOutputSize = nextSize;
    sizeSelect.disabled = editorLocked || editorGenerating;
  }

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
  if ($('editor-size')) $('editor-size').disabled = locked || editorGenerating;
  if ($('editor-quality')) $('editor-quality').disabled = locked || editorGenerating;
  if ($('btn-editor-ref-add')) $('btn-editor-ref-add').disabled = locked || editorGenerating;
}

function setEditorReferenceImage(ref) {
  editorReferenceImage = ref?.path ? ref : null;
  renderEditorReference();
}

function clearEditorReference() {
  editorReferenceImage = null;
  renderEditorReference();
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
  $('btn-editor-ref-add').addEventListener('click', async () => {
    if (editorLocked || editorGenerating) return;
    const picked = await api.refsAddDialog();
    if (picked?.length) await addEditorReferencePaths([picked[0].path]);
  });

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
    const paths = [...(e.dataTransfer?.files || [])]
      .map((f) => f.path)
      .filter((p) => p && IMAGE_EXT.test(p));
    if (paths.length) await addEditorReferencePaths(paths);
    else showError(new Error(t('template.editorRefDropInvalid')));
  });
}

function clearEditorPreview() {
  $('editor-preview').classList.add('hidden');
  $('editor-preview-empty').classList.remove('hidden');
  $('accept-row').classList.add('hidden');
  $('optimized-prompt').value = '';
  $('change-summary').textContent = '';
}

async function refreshImageSettingsUi() {
  if (!imageSettingsCatalog) {
    imageSettingsCatalog = await api.getImageSettingsCatalog();
  }
  const selected = getSelectedTemplate();
  if (selected?.id && (!selected.width || !selected.height)) {
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

  const validSizes = templateSizeModeValues();
  sizeSelect.value = validSizes.includes(prevSize) ? prevSize : imageSettingsCatalog.defaultSize;

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
    productCategory: $('setting-category').value,
    brandName: $('setting-brand').value,
    seriesName: $('setting-series').value,
    tagline: $('setting-tagline').value,
    extraPrompt: $('setting-extra').value,
    referenceImages: session.referenceImages || [],
    preflightPrompt: session.preflightPrompt || '',
    preflightFingerprint: session.preflightFingerprint || '',
    productAnalysis: session.productAnalysis || '',
  };
}

function promptInputsFromSettings(settings) {
  return {
    templateId: settings.templateId || '',
    productCategory: settings.productCategory || '',
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
    productCategory: session.productCategory || '',
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
  if (data.productCategory) {
    $('setting-category').value = data.productCategory;
  }
  session = await api.sessionUpdate({
    brandName: data.brandName || '',
    seriesName: data.seriesName || '',
    tagline: data.tagline || '',
    productCategory: data.productCategory || session.productCategory,
    imagePrompt: data.imagePrompt || '',
    productDescription: data.productDescription || '',
    placementInstructions: data.placementInstructions || '',
    productAnalysis: data.productAnalysis || '',
    preflightPrompt: data.preflightPrompt || data.finalPrompt || data.imagePrompt || '',
    preflightFingerprint: data.preflightFingerprint || '',
    promptFingerprint: fingerprint,
  });
}

async function buildAndPersistPrompt(settings, waitMessage) {
  showWait(waitMessage || t('wait.status.buildingPrompt'));
  const data = await api.generateBuildPrompt(withPairing(settings));
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
    productCategory: settings.productCategory || '',
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
  $('setting-category').value = session.productCategory || 'LAUTSPRECHER';
  $('setting-brand').value = session.brandName || '';
  $('setting-series').value = session.seriesName || '';
  $('setting-tagline').value = session.tagline || '';
  $('setting-extra').value = session.extraPrompt || '';
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
    alert(t('template.empty'));
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
    alert(t('template.cloneSuccess'));
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
    alert(t('template.deleteSuccess'));
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
  if (imported?.length) {
    await loadTemplates();
    alert(`${t('template.importSuccess')}: ${imported.length}`);
  }
}

async function addReferenceImagesDialog() {
  const added = await api.refsAddDialog();
  if (added.length) {
    await updateSession({ referenceImages: [...(session.referenceImages || []), ...added] });
    renderRefs();
  }
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
    if (!$('accept-row').classList.contains('hidden')) {
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

function showWait(message) {
  waitStart = Date.now();
  $('wait-status').textContent = message || t('wait.status.running');
  $('wait-elapsed').textContent = '';
  $('wait-output').textContent = '';
  if (waitTimer) clearInterval(waitTimer);
  waitTimer = setInterval(() => updateWait({ status: 'running' }), 1000);
  $('wait-dialog').showModal();
}

function updateWait(progress) {
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
  if (waitTimer) {
    clearInterval(waitTimer);
    waitTimer = null;
  }
  $('wait-dialog').close();
}

function showPreview(path, b64) {
  const img = $('preview-image');
  if (b64) {
    img.src = `data:image/png;base64,${b64}`;
  } else if (path) {
    api.filesReadDataUrl(path).then((url) => { if (url) img.src = url; });
  }
  img.classList.remove('hidden');
  $('preview-empty').classList.add('hidden');
  $('btn-export').classList.remove('hidden');
  lastPreviewPath = path;
  lastPreviewB64 = b64 || '';
}

async function refreshBridgeStatus() {
  const status = await api.bridgeGetStatus();
  const el = $('bridge-status');
  const banner = $('setup-banner');
  if (status.running && status.ready && status.paired) {
    el.className = 'bridge-status ready';
    el.title = t('bridge.status.paired');
    banner.classList.add('hidden');
  } else if (status.running && status.ready) {
    el.className = 'bridge-status error';
    el.title = t('bridge.status.needsPairing');
    banner.classList.remove('hidden');
    $('setup-message').textContent = t('bridge.status.needsPairing');
  } else if (status.running) {
    el.className = 'bridge-status error';
    el.title = t('bridge.status.needsLogin');
    banner.classList.remove('hidden');
    $('setup-message').textContent = status.status?.message || t('bridge.status.needsLogin');
  } else {
    el.className = 'bridge-status error';
    el.title = t('bridge.status.notRunning');
    banner.classList.remove('hidden');
    $('setup-message').textContent = t('bridge.status.notRunning');
  }
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
    alert(t('template.lockedHint'));
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

async function init() {
  await loadI18n();
  applyLabels();

  const catSelect = $('setting-category');
  CATEGORIES.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    catSelect.appendChild(opt);
  });

  session = await api.sessionGet();
  await refreshImageSettingsUi();
  writeSettingsToUi();
  restorePromptFromSession();
  await loadTemplates();
  renderRefs();
  await refreshBridgeStatus();
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
      $('editor-preview').src = `data:image/png;base64,${pendingEdit.previewB64}`;
      $('editor-preview').classList.remove('hidden');
      $('editor-preview-empty').classList.add('hidden');
      $('accept-row').classList.remove('hidden');
    }
  } else {
    editorTemplateId = session.templateId;
    if (editorTemplateId) await selectEditorTemplate(editorTemplateId);
  }

  setupTemplateImport();
  setupSortableDnD();
  setupDragDrop();
  setupPreviewLightbox();
  setupEditorCompareLightbox();
  setupEditorReference();
  setupEditorImageContextMenus();
  setupPanelContextMenus();
  setupDebugPanel();
  await loadDebugLog();

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.mode));
  });

  ['setting-size', 'setting-quality', 'setting-category', 'setting-brand', 'setting-series', 'setting-tagline', 'setting-extra'].forEach((id) => {
    $(id).addEventListener('change', async () => {
      await updateSession(readSettingsFromUi());
    });
    $(id).addEventListener('input', async () => {
      await updateSession(readSettingsFromUi());
    });
  });

  $('btn-add-refs').addEventListener('click', () => addReferenceImagesDialog());

  $('btn-suggest-tagline').addEventListener('click', async () => {
    if (!(await ensureBridgeReady())) return;
    try {
      $('btn-suggest-tagline').disabled = true;
      showWait(t('tagline.suggesting'));
      const result = await api.generateSuggestTagline(withPairing(readSettingsFromUi()));
      $('setting-tagline').value = result.tagline || '';
      await updateSession({ tagline: result.tagline });
      hideWait();
    } catch (err) {
      hideWait();
      showError(err, t('tagline.suggest'));
    } finally {
      $('btn-suggest-tagline').disabled = false;
    }
  });

  $('btn-build-prompt').addEventListener('click', async () => {
    if (!session.templateId) {
      alert(t('template.empty'));
      return;
    }
    if (!(await ensureBridgeReady())) return;
    try {
      await buildAndPersistPrompt(readSettingsFromUi());
    } catch (err) {
      hideWait();
      showError(err, t('error.promptFailed'));
    }
  });

  $('btn-generate').addEventListener('click', async () => {
    if (!session.templateId) {
      alert(t('template.empty'));
      return;
    }
    const settings = readSettingsFromUi();
    if (!(await ensureBridgeReady())) return;
    try {
      if (needsPromptRebuild(settings)) {
        await buildAndPersistPrompt(settings, t('generate.rebuildPrompt'));
      } else {
        promptData = promptDataForGenerate(settings);
      }
      showWait(t('wait.status.running'));
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
      showPreview(result.path, result.b64);
      await updateSession({ lastPreviewPath: result.path });
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

  $('btn-bridge-connect').addEventListener('click', async () => {
    const code = getPairingCode();
    if (!/^\d{6}$/.test(code)) {
      showPairingBanner(t('bridge.status.needsPairing'));
      return;
    }
    try {
      showWait(t('bridge.setup.title'));
      const result = await api.bridgeEnsureReady(code);
      hideWait();
      if (!result.success) {
        showPairingBanner(result.message);
        return;
      }
      await refreshBridgeStatus();
    } catch (err) {
      hideWait();
      showError(err);
    }
  });

  $('btn-codex-login').addEventListener('click', async () => {
    await api.codexLogin();
    alert('Bitte melden Sie sich im geöffneten Terminal mit codex login an.');
  });

  $('editor-template-select').addEventListener('change', async () => {
    const id = $('editor-template-select').value;
    if (!id || id === editorTemplateId) return;
    await selectEditorTemplate(id);
  });

  $('editor-size').addEventListener('change', () => {
    editorOutputSize = $('editor-size').value;
  });

  $('btn-generate-edit').addEventListener('click', async () => {
    if (!(await ensureBridgeReady())) return;
    const id = editorTemplateId || session.templateId;
    const changeRequest = $('change-request').value.trim();
    const size = $('editor-size').value;
    const tmpl = getEditorTemplate();
    if (!isEditorFormatOnly(changeRequest, size, tmpl) && !changeRequest) {
      alert(t('template.needChangeOrSize'));
      return;
    }
    try {
      editorGenerating = true;
      editorOutputSize = size;
      updateEditorLockUi();
      showWait(t('template.generateEdit'));
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
        $('editor-preview').src = `data:image/png;base64,${result.previewB64}`;
        $('editor-preview').classList.remove('hidden');
        $('editor-preview-empty').classList.add('hidden');
        $('accept-row').classList.remove('hidden');
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
      alert(t('template.editSuccess'));
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

  $('btn-wait-cancel').addEventListener('click', () => hideWait());

  api.on('job:progress', (p) => updateWait(p));
  api.on('bridge:progress', (p) => updateWait(p));
  api.on('session:loaded', async (s) => {
    session = s;
    await refreshImageSettingsUi();
    writeSettingsToUi();
    restorePromptFromSession();
    renderRefs();
    await loadTemplates();
  });
  api.on('help:open', (id) => {
    showView('help');
    openHelpDoc(id, $('help-content'), $('help-sidebar'));
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
  api.on('action:template-import', () => importTemplatesDialog().catch((err) => showError(err, t('template.import'))));
  api.on('template:selected', async (id) => {
    editorTemplateId = id;
    await selectEditorTemplate(id);
    showView('templates');
  });
  api.on('action:template-clone', async () => {
    const id = session.templateId || editorTemplateId;
    if (!id) {
      alert(t('template.selectFirst'));
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

init().catch((err) => {
  console.error(err);
  alert(err.message || 'Startfehler');
});
