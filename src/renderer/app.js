'use strict';

import { loadI18n, t } from './i18n/i18n.js';
import { renderHelp, openHelpDoc } from './help/help-viewer.js';

const api = window.werbungMaker;
let session = {};
let templates = [];
let promptData = null;
let lastPreviewPath = '';
let lastPreviewB64 = '';
let editorTemplateId = '';
let waitStart = 0;

const CATEGORIES = ['TV', 'BEAMER', 'LEINWÄNDE', 'LAUTSPRECHER', 'AV-RECEIVER', 'SUBWOOFER', 'KINOSESSEL'];

function $(id) { return document.getElementById(id); }

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
  $('lbl-refs').textContent = t('refs.title');
  $('btn-add-refs').textContent = t('refs.add');
  $('lbl-settings').textContent = t('settings.title');
  $('lbl-size').textContent = t('settings.size');
  $('lbl-quality').textContent = t('settings.quality');
  $('lbl-category').textContent = t('settings.category');
  $('lbl-brand').textContent = t('settings.brandName');
  $('lbl-series').textContent = t('settings.seriesName');
  $('lbl-tagline').textContent = t('settings.tagline');
  $('lbl-extra').textContent = t('settings.extraPrompt');
  $('lbl-prompt-image').textContent = t('prompt.image');
  $('btn-build-prompt').textContent = t('generate.buildPrompt');
  $('btn-generate').textContent = t('generate.button');
  $('lbl-preview').textContent = t('generate.preview');
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
}

function renderTemplateList(containerId, selectedId, onSelect) {
  const el = $(containerId);
  el.innerHTML = '';
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
    el.appendChild(card);
  }
}

function renderRefs() {
  const el = $('refs-list');
  const refs = session.referenceImages || [];
  if (!refs.length) {
    el.innerHTML = `<p class="muted">${t('refs.empty')}</p>`;
    return;
  }
  el.innerHTML = '';
  refs.forEach((ref, idx) => {
    const div = document.createElement('div');
    div.className = 'ref-thumb';
    const img = document.createElement('img');
    api.filesReadDataUrl(ref.path).then((url) => { if (url) img.src = url; });
    const btn = document.createElement('button');
    btn.textContent = '×';
    btn.addEventListener('click', async () => {
      const next = [...refs];
      next.splice(idx, 1);
      await updateSession({ referenceImages: next });
      renderRefs();
    });
    div.appendChild(img);
    div.appendChild(btn);
    el.appendChild(div);
  });
}

function showWait(message) {
  waitStart = Date.now();
  $('wait-status').textContent = message || t('wait.status.running');
  $('wait-elapsed').textContent = '';
  $('wait-output').textContent = '';
  $('wait-dialog').showModal();
}

function updateWait(progress) {
  if (progress.status) {
    $('wait-status').textContent = progress.message || t(`wait.status.${progress.status}`) || progress.status;
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
  if (status.running && status.ready) {
    el.className = 'bridge-status ready';
    el.title = t('bridge.status.ready');
    banner.classList.add('hidden');
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
  const lastId = session.templateId || templates[templates.length - 1]?.id;
  if (lastId && !session.templateId) {
    await updateSession({ templateId: lastId });
  }
  renderTemplateList('template-list', session.templateId, async (id) => {
    await updateSession({ templateId: id });
    renderTemplateList('template-list', id, () => {});
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
  await loadTemplates();
  renderRefs();
  await refreshBridgeStatus();
  await renderHelp($('help-sidebar'), $('help-content'));

  const exampleImg = await api.examplesGetImage();
  if (exampleImg) $('example-image').src = exampleImg;

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

  $('btn-add-refs').addEventListener('click', async () => {
    const added = await api.refsAddDialog();
    if (added.length) {
      await updateSession({ referenceImages: [...(session.referenceImages || []), ...added] });
      renderRefs();
    }
  });

  $('btn-build-prompt').addEventListener('click', async () => {
    try {
      showWait(t('generate.buildPrompt'));
      const opts = readSettingsFromUi();
      promptData = await api.generateBuildPrompt(opts);
      $('prompt-image').value = promptData.imagePrompt || '';
      $('setting-brand').value = promptData.brandName || '';
      $('setting-series').value = promptData.seriesName || '';
      $('setting-tagline').value = promptData.tagline || '';
      $('setting-category').value = promptData.productCategory || session.productCategory;
      await updateSession({
        brandName: promptData.brandName,
        seriesName: promptData.seriesName,
        tagline: promptData.tagline,
        productCategory: promptData.productCategory,
      });
      hideWait();
    } catch (err) {
      hideWait();
      alert(err.message || t('error.generic'));
    }
  });

  $('btn-generate').addEventListener('click', async () => {
    try {
      if (!promptData?.imagePrompt) {
        promptData = await api.generateBuildPrompt(readSettingsFromUi());
        $('prompt-image').value = promptData.imagePrompt || '';
      }
      showWait(t('wait.status.running'));
      const settings = readSettingsFromUi();
      const result = await api.generateImage({ promptData, settings });
      showPreview(result.path, result.b64);
      await updateSession({ lastPreviewPath: result.path });
      hideWait();
    } catch (err) {
      hideWait();
      alert(err.message || t('error.generic'));
    }
  });

  $('btn-export').addEventListener('click', async () => {
    if (lastPreviewPath) await api.exportSavePng(lastPreviewPath);
    else if (lastPreviewB64) await api.exportSavePngFromB64(lastPreviewB64);
  });

  $('btn-bridge-connect').addEventListener('click', async () => {
    const code = $('pairing-code').value.trim();
    showWait(t('bridge.setup.title'));
    const result = await api.bridgeEnsureReady(code);
    hideWait();
    if (!result.success) alert(result.message);
    await refreshBridgeStatus();
  });

  $('btn-codex-login').addEventListener('click', async () => {
    await api.codexLogin();
    alert('Bitte melden Sie sich im geöffneten Terminal mit codex login an.');
  });

  $('btn-optimize-prompt').addEventListener('click', async () => {
    const id = editorTemplateId || session.templateId;
    const changeRequest = $('change-request').value.trim();
    if (!changeRequest) return alert('Bitte Änderungswunsch eingeben.');
    try {
      showWait(t('template.optimizePrompt'));
      const result = await api.templatesOptimizePrompt({ templateId: id, changeRequest });
      $('optimized-prompt').value = result.optimizedEditPrompt || '';
      $('change-summary').textContent = result.changeSummary || '';
      hideWait();
    } catch (err) {
      hideWait();
      alert(err.message);
    }
  });

  $('btn-apply-edit').addEventListener('click', async () => {
    try {
      showWait(t('template.applyEdit'));
      const settings = readSettingsFromUi();
      const result = await api.templatesApplyEdit({
        settings,
        optimizedPrompt: $('optimized-prompt').value,
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
      alert(err.message);
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
      alert(err.message);
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
  api.on('template:selected', async (id) => {
    editorTemplateId = id;
    await selectEditorTemplate(id);
    showView('templates');
  });
  api.on('action:template-clone', async () => {
    const id = session.templateId || editorTemplateId;
    if (!id) return;
    const name = prompt('Name der Kopie:', 'Vorlage – Kopie');
    if (name === null) return;
    await api.templatesClone({ sourceId: id, name: name || undefined });
    await loadTemplates();
    alert('Vorlage wurde geklont.');
  });
  api.on('action:template-delete', async () => {
    const id = editorTemplateId || session.templateId;
    const tmpl = templates.find((t) => t.id === id);
    if (!tmpl || tmpl.type !== 'user') {
      alert('Nur eigene Vorlagen können gelöscht werden.');
      return;
    }
    if (!confirm(`Vorlage „${tmpl.name}" wirklich löschen?`)) return;
    await api.templatesDelete(id);
    await loadTemplates();
    alert('Vorlage gelöscht.');
  });

  editorTemplateId = session.templateId;
  if (editorTemplateId) await selectEditorTemplate(editorTemplateId);
}

init().catch((err) => {
  console.error(err);
  alert(err.message || 'Startfehler');
});
