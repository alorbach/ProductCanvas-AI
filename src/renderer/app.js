'use strict';

import { loadI18n, t } from './i18n/i18n.js';
import { renderHelp, openHelpDoc } from './help/help-viewer.js';
import { showContextMenu, menuItem } from './context-menu.js';

const api = window.werbungMaker;
let session = {};
let templates = [];
let promptData = null;
let lastPreviewPath = '';
let lastPreviewB64 = '';
let editorTemplateId = '';
let waitStart = 0;
let waitTimer = null;
let openLightbox = () => {};

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
      const paths = [...(e.dataTransfer?.files || [])]
        .map((f) => f.path)
        .filter((p) => p && IMAGE_EXT.test(p));
      if (paths.length) await importPaths(paths);
      else showError(new Error(t('template.importInvalid')));
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
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      closeLightbox();
    }
  });
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
}

function applyLabels() {
  $('app-title').textContent = t('app.title');
  $('app-subtitle').textContent = t('app.subtitle');
  $('nav-werbung').textContent = t('nav.werbung');
  $('nav-templates').textContent = t('nav.templates');
  $('nav-help').textContent = t('nav.help');
  $('lbl-template').textContent = t('template.select');
  $('templates-import-hint').textContent = t('template.importHint');
  $('btn-import-template').textContent = t('template.import');
  $('lbl-refs').textContent = t('refs.title');
  $('btn-add-refs').textContent = t('refs.add');
  $('lbl-settings').textContent = t('settings.title');
  $('lbl-size').textContent = t('settings.size');
  $('lbl-quality').textContent = t('settings.quality');
  $('lbl-category').textContent = t('settings.category');
  $('lbl-compositing').textContent = t('settings.compositing');
  $('compositing-hint').textContent = t('settings.compositingHint');
  $('lbl-media-analysis').textContent = t('settings.mediaAnalysis');
  $('media-analysis-hint').textContent = t('settings.mediaAnalysisHint');
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
  $('lbl-example').textContent = t('generate.exampleHint');
  $('lbl-original').textContent = t('template.original');
  $('lbl-ki-preview').textContent = t('template.preview');
  $('lbl-change').textContent = t('template.changeRequest');
  $('change-request').placeholder = t('template.changeRequest.placeholder');
  $('btn-optimize-prompt').textContent = t('template.optimizePrompt');
  $('lbl-opt-prompt').textContent = t('prompt.optimized');
  $('btn-apply-edit').textContent = t('template.applyEdit');
  $('btn-accept').textContent = t('template.accept');
  $('btn-reject').textContent = t('template.reject');
  $('wait-title').textContent = t('wait.title');
  $('btn-wait-cancel').textContent = t('wait.cancel');
  $('btn-bridge-connect').textContent = t('bridge.setup.connect');
  $('btn-codex-login').textContent = t('bridge.setup.codexLogin');
  $('refs-drop-hint').textContent = t('refs.dropHint');
  $('refs-usage-hint').textContent = t('refs.usageHint');
  $('btn-suggest-tagline').title = t('tagline.suggest');
  $('debug-toggle').textContent = t('debug.title');
  $('btn-debug-copy').textContent = t('debug.copy');
  $('btn-debug-clear').textContent = t('debug.clear');
}

async function updateSession(patch) {
  session = await api.sessionUpdate(patch);
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
    compositingMode: $('setting-compositing').checked,
    mediaAnalysisEnabled: $('setting-media-analysis').checked,
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
    referenceImages: (settings.referenceImages || []).map((r) => r.path).filter(Boolean).sort(),
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

function restorePromptFromSession() {
  promptData = promptDataFromSession();
  $('prompt-image').value = session.imagePrompt || '';
}

async function applyBuiltPrompt(data, fingerprint) {
  promptData = data;
  const pendingPreflight = !data.imagePrompt && !data.preflightPrompt && (session.referenceImages || []).length > 0;
  $('prompt-image').value = data.imagePrompt || (pendingPreflight ? t('prompt.pendingPreflight') : '');
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
  if (settings.compositingMode && (settings.referenceImages || []).length) {
    return false;
  }
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
  $('setting-size').value = session.size || '1536x1024';
  $('setting-quality').value = session.quality || 'high';
  $('setting-category').value = session.productCategory || 'LAUTSPRECHER';
  $('setting-brand').value = session.brandName || '';
  $('setting-series').value = session.seriesName || '';
  $('setting-tagline').value = session.tagline || '';
  $('setting-extra').value = session.extraPrompt || '';
  $('setting-compositing').checked = session.compositingMode === true;
  $('setting-media-analysis').checked = session.mediaAnalysisEnabled === true;
}

async function openPathInExplorer(filePath) {
  if (filePath) await api.showItemInFolder(filePath);
}

async function selectTemplate(id, { openEditor = false } = {}) {
  await updateSession({ templateId: id });
  if (openEditor) {
    await selectEditorTemplate(id);
    showView('templates');
  } else {
    await loadTemplates();
  }
}

async function renameTemplate(id) {
  const tmpl = templates.find((item) => item.id === id);
  if (!tmpl) return;
  const name = prompt('Neuer Name:', tmpl.name);
  if (name === null || !name.trim()) return;
  await api.templatesRename({ id, name: name.trim() });
  await loadTemplates();
}

async function cloneTemplate(id) {
  const tmpl = templates.find((item) => item.id === id);
  if (!tmpl) return;
  const name = prompt('Name der Kopie:', `${tmpl.name} – Kopie`);
  if (name === null) return;
  await api.templatesClone({ sourceId: id, name: name || undefined });
  await loadTemplates();
  alert('Vorlage wurde geklont.');
}

async function deleteTemplate(id) {
  const tmpl = templates.find((item) => item.id === id);
  if (!tmpl) return;
  if (!confirm(`Vorlage „${tmpl.name}" wirklich löschen?`)) return;
  await api.templatesDelete(id);
  if (session.templateId === id) {
    const fallback = templates.find((item) => item.id !== id);
    await updateSession({ templateId: fallback?.id || '' });
  }
  await loadTemplates();
  alert('Vorlage gelöscht.');
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
    const action = await showContextMenu(e, [
      menuItem('fullscreen', 'context.fullscreen'),
      menuItem('explorer', 'context.showInExplorer', { enabled: !!tmpl?.path }),
    ]);
    if (action === 'fullscreen' && $('editor-original').src) openLightbox($('editor-original').src);
    if (action === 'explorer' && tmpl?.path) await openPathInExplorer(tmpl.path);
  });

  $('editor-preview').addEventListener('contextmenu', async (e) => {
    if ($('editor-preview').classList.contains('hidden')) return;
    const items = [menuItem('fullscreen', 'context.fullscreen')];
    if (!$('accept-row').classList.contains('hidden')) {
      items.push(menuItem('sep', '', { separator: true }));
      items.push(menuItem('accept', 'context.acceptEdit'));
      items.push(menuItem('reject', 'context.rejectEdit'));
    }
    const action = await showContextMenu(e, items);
    if (action === 'fullscreen' && $('editor-preview').src) openLightbox($('editor-preview').src);
    if (action === 'accept') $('btn-accept').click();
    if (action === 'reject') $('btn-reject').click();
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
  if (!templates.length) {
    el.innerHTML = `<p class="muted">${t('template.empty')}</p>`;
    return;
  }
  for (const tmpl of templates) {
    const card = document.createElement('div');
    card.className = `template-card${tmpl.id === selectedId ? ' selected' : ''}`;
    card.dataset.id = tmpl.id;
    const img = document.createElement('img');
    img.alt = tmpl.name;
    api.templatesGetImage(tmpl.id).then((url) => { if (url) img.src = url; });
    const span = document.createElement('span');
    span.textContent = tmpl.name;
    card.appendChild(img);
    card.appendChild(span);
    card.addEventListener('click', () => onSelect(tmpl.id));
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
    const img = document.createElement('img');
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
  renderTemplateList('editor-template-list', editorTemplateId || session.templateId, selectEditorTemplate);
}

async function selectEditorTemplate(id) {
  editorTemplateId = id;
  renderTemplateList('editor-template-list', id, selectEditorTemplate);
  const url = await api.templatesGetImage(id);
  if (url) $('editor-original').src = url;
  $('editor-preview').classList.add('hidden');
  $('editor-preview-empty').classList.remove('hidden');
  $('accept-row').classList.add('hidden');
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
  writeSettingsToUi();
  restorePromptFromSession();
  await loadTemplates();
  renderRefs();
  await refreshBridgeStatus();
  await renderHelp($('help-sidebar'), $('help-content'));

  const exampleImg = await api.examplesGetImage();
  if (exampleImg) $('example-image').src = exampleImg;

  setupTemplateImport();
  setupDragDrop();
  setupPreviewLightbox();
  setupEditorImageContextMenus();
  setupPanelContextMenus();
  setupDebugPanel();
  await loadDebugLog();

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.mode));
  });

  ['setting-size', 'setting-quality', 'setting-category', 'setting-compositing', 'setting-media-analysis', 'setting-brand', 'setting-series', 'setting-tagline', 'setting-extra'].forEach((id) => {
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
    const useCompositing = settings.compositingMode === true && (settings.referenceImages || []).length;
    if (!useCompositing && !(await ensureBridgeReady())) return;
    try {
      if (needsPromptRebuild(settings)) {
        await buildAndPersistPrompt(settings, t('generate.rebuildPrompt'));
      } else {
        promptData = promptDataForGenerate(settings);
      }
      showWait(useCompositing ? t('generate.compositing') : t('wait.status.running'));
      const result = await api.generateImage({
        promptData,
        settings,
        pairingCode: useCompositing ? '' : getPairingCode(),
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
      } else if ((settings.referenceImages || []).length > 0 && settings.compositingMode !== true) {
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
          preflightFingerprint: result.preflightFingerprint || session.preflightFingerprint,
        });
      }
      showPreview(result.path, result.b64);
      await updateSession({ lastPreviewPath: result.path, compositingMode: settings.compositingMode });
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

  $('btn-optimize-prompt').addEventListener('click', async () => {
    if (!(await ensureBridgeReady())) return;
    const id = editorTemplateId || session.templateId;
    const changeRequest = $('change-request').value.trim();
    if (!changeRequest) return alert('Bitte Änderungswunsch eingeben.');
    try {
      showWait(t('template.optimizePrompt'));
      const result = await api.templatesOptimizePrompt({
        templateId: id,
        changeRequest,
        pairingCode: getPairingCode(),
      });
      $('optimized-prompt').value = result.optimizedEditPrompt || '';
      $('change-summary').textContent = result.changeSummary || '';
      hideWait();
    } catch (err) {
      hideWait();
      showError(err);
    }
  });

  $('btn-apply-edit').addEventListener('click', async () => {
    if (!(await ensureBridgeReady())) return;
    try {
      showWait(t('template.applyEdit'));
      const settings = readSettingsFromUi();
      const result = await api.templatesApplyEdit({
        settings,
        optimizedPrompt: $('optimized-prompt').value,
        pairingCode: getPairingCode(),
      });
      if (result.previewB64) {
        $('editor-preview').src = `data:image/png;base64,${result.previewB64}`;
        $('editor-preview').classList.remove('hidden');
        $('editor-preview-empty').classList.add('hidden');
        $('accept-row').classList.remove('hidden');
      }
      hideWait();
    } catch (err) {
      hideWait();
      showError(err);
    }
  });

  $('btn-accept').addEventListener('click', async () => {
    try {
      const accepted = await api.templatesAcceptEdit();
      await loadTemplates();
      await updateSession({ templateId: accepted.templateId });
      $('accept-row').classList.add('hidden');
      alert('Vorlage wurde gespeichert.');
    } catch (err) {
      showError(err);
    }
  });

  $('btn-reject').addEventListener('click', async () => {
    await api.templatesRejectEdit();
    $('editor-preview').classList.add('hidden');
    $('editor-preview-empty').classList.remove('hidden');
    $('accept-row').classList.add('hidden');
  });

  $('btn-wait-cancel').addEventListener('click', () => hideWait());

  api.on('job:progress', (p) => updateWait(p));
  api.on('bridge:progress', (p) => updateWait(p));
  api.on('session:loaded', async (s) => {
    session = s;
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
    if (!id) return;
    await cloneTemplate(id);
  });
  api.on('action:template-delete', async () => {
    const id = editorTemplateId || session.templateId;
    if (!id) return;
    await deleteTemplate(id);
  });

  editorTemplateId = session.templateId;
  if (editorTemplateId) await selectEditorTemplate(editorTemplateId);
}

init().catch((err) => {
  console.error(err);
  alert(err.message || 'Startfehler');
});
