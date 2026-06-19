'use strict';

import { api } from './bridge-api.js';
import { t } from './i18n/i18n.js';
import {
  estimateBytesFromB64,
} from './preview-meta.js';

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

let editorEffectId = '';
let effectEditorLocked = false;
let effectEditorGenerating = false;
let effectEditorOutputSize = 'template';
let effectEditorAspectRatio = 1;
let effectEditorSizeFieldSync = false;
let effectEditorReferenceImage = null;
let effectEditorPreviewMetaContext = {};

let $ = () => null;
let getEffects = () => [];
let getSession = () => ({});
let updateSession = async () => {};
let getImageSettingsCatalog = () => null;
let setImageSettingsCatalog = () => {};
let showStatus = () => {};
let showError = () => {};
let showWait = () => {};
let hideWait = () => {};
let ensureBridgeReady = async () => false;
let getPairingCode = () => '';
let loadEffects = async () => {};
let showView = () => {};
let isInternalSortDrag = () => false;
let imagePathsFromDataTransfer = () => [];
let qualityLabel = () => '';
let parseSizeWxH = () => null;
let refreshPreviewMetaOverlay = () => {};
let attachPreviewMetaListeners = () => {};

export function configureEffectEditor(deps) {
  $ = deps.$;
  getEffects = deps.getEffects;
  getSession = deps.getSession;
  updateSession = deps.updateSession;
  getImageSettingsCatalog = deps.getImageSettingsCatalog;
  setImageSettingsCatalog = deps.setImageSettingsCatalog;
  showStatus = deps.showStatus;
  showError = deps.showError;
  showWait = deps.showWait;
  hideWait = deps.hideWait;
  ensureBridgeReady = deps.ensureBridgeReady;
  getPairingCode = deps.getPairingCode;
  loadEffects = deps.loadEffects;
  showView = deps.showView;
  isInternalSortDrag = deps.isInternalSortDrag;
  imagePathsFromDataTransfer = deps.imagePathsFromDataTransfer;
  qualityLabel = deps.qualityLabel;
  parseSizeWxH = deps.parseSizeWxH;
  refreshPreviewMetaOverlay = deps.refreshPreviewMetaOverlay;
  attachPreviewMetaListeners = deps.attachPreviewMetaListeners;
}

export function getEditorEffectId() {
  return editorEffectId;
}

export function isEffectEditorBusy() {
  return effectEditorLocked || effectEditorGenerating;
}

function getEditorEffect() {
  const id = editorEffectId || getSession().effectId;
  return getEffects().find((item) => item.id === id) || null;
}

function effectSizeLabel(effect) {
  if (!effect?.width || !effect?.height) return '…';
  return `${effect.width}×${effect.height}`;
}

function formatEffectGatewaySizeLabel(size, effect) {
  const catalog = getImageSettingsCatalog();
  if (size === catalog?.sizeFromTemplate) {
    return t('settings.sizeEffect').replace('{size}', effectSizeLabel(effect));
  }
  if (size === 'auto') return 'Auto';
  return String(size).replace(/x/i, '×');
}

function setEffectEditorAspectRatio(effect) {
  const w = Number(effect?.width || 0);
  const h = Number(effect?.height || 0);
  effectEditorAspectRatio = w > 0 && h > 0 ? w / h : 1;
}

function setEffectEditorDimensionFields(width, height) {
  effectEditorSizeFieldSync = true;
  if ($('effect-editor-size-width')) $('effect-editor-size-width').value = width > 0 ? String(width) : '';
  if ($('effect-editor-size-height')) $('effect-editor-size-height').value = height > 0 ? String(height) : '';
  effectEditorSizeFieldSync = false;
}

function populateEffectEditorSizePresetSelect(sizeSelect, effect) {
  sizeSelect.innerHTML = '';
  const catalog = getImageSettingsCatalog();
  const effectOpt = document.createElement('option');
  effectOpt.value = catalog.sizeFromTemplate;
  effectOpt.textContent = t('settings.sizeEffect').replace('{size}', effectSizeLabel(effect));
  sizeSelect.appendChild(effectOpt);
  for (const size of catalog.sizes) {
    if (size === 'auto') continue;
    const opt = document.createElement('option');
    opt.value = size;
    opt.textContent = formatEffectGatewaySizeLabel(size, effect);
    sizeSelect.appendChild(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = 'custom';
  customOpt.textContent = t('template.sizeCustom');
  sizeSelect.appendChild(customOpt);
}

function syncEffectEditorSizeFieldsFromValue(sizeValue, effect) {
  setEffectEditorAspectRatio(effect);
  const nativeW = Number(effect?.width || 0);
  const nativeH = Number(effect?.height || 0);
  const presetSelect = $('effect-editor-size-preset');
  if (!presetSelect) return;
  const catalog = getImageSettingsCatalog();
  const normalized = String(sizeValue || '').trim();
  if (!normalized || normalized === catalog.sizeFromTemplate) {
    presetSelect.value = catalog.sizeFromTemplate;
    setEffectEditorDimensionFields(nativeW, nativeH);
    effectEditorOutputSize = catalog.sizeFromTemplate;
    return;
  }
  const parsed = parseSizeWxH(normalized);
  if (parsed) {
    const isPreset = catalog.sizes.includes(normalized);
    presetSelect.value = isPreset ? normalized : 'custom';
    setEffectEditorDimensionFields(parsed.width, parsed.height);
    effectEditorOutputSize = normalized;
    return;
  }
  presetSelect.value = catalog.sizeFromTemplate;
  setEffectEditorDimensionFields(nativeW, nativeH);
  effectEditorOutputSize = catalog.sizeFromTemplate;
}

function getEffectEditorSizeValue() {
  const catalog = getImageSettingsCatalog();
  const preset = $('effect-editor-size-preset')?.value || catalog?.sizeFromTemplate;
  if (preset === catalog.sizeFromTemplate) {
    return catalog.sizeFromTemplate;
  }
  if (preset !== 'custom' && catalog?.sizes?.includes(preset)) {
    return preset;
  }
  const w = parseInt($('effect-editor-size-width')?.value, 10);
  const h = parseInt($('effect-editor-size-height')?.value, 10);
  if (!w || !h) return catalog.sizeFromTemplate;
  const effect = getEditorEffect();
  if (effect?.width === w && effect?.height === h) {
    return catalog.sizeFromTemplate;
  }
  return `${w}x${h}`;
}

function effectEditorDimensionsValid() {
  const w = parseInt($('effect-editor-size-width')?.value, 10);
  const h = parseInt($('effect-editor-size-height')?.value, 10);
  return w >= 64 && h >= 64 && w <= 8192 && h <= 8192;
}

function resolveEffectEditorTargetSize(sizeValue, effect) {
  if (!sizeValue || sizeValue === 'template') {
    if (effect?.width && effect?.height) return `${effect.width}x${effect.height}`;
    return '';
  }
  return sizeValue;
}

function isEffectEditorFormatOnly(changeRequest, sizeValue, effect) {
  if (String(changeRequest || '').trim()) return false;
  const native = effect?.width && effect?.height ? `${effect.width}x${effect.height}` : '';
  const target = resolveEffectEditorTargetSize(sizeValue, effect);
  if (!target) return false;
  if (target === 'auto') return true;
  return target !== native;
}

function setEffectEditorReviewBarVisible(visible) {
  const bar = $('effect-editor-review-bar');
  if (bar) bar.classList.toggle('hidden', !visible);
}

function clearEffectEditorPreview() {
  $('effect-editor-preview')?.classList.add('hidden');
  $('effect-editor-preview-empty')?.classList.remove('hidden');
  setEffectEditorReviewBarVisible(false);
  effectEditorPreviewMetaContext = {};
  refreshPreviewMetaOverlay('effect-editor-preview', 'effect-editor-preview-meta', {});
  if ($('effect-optimized-prompt')) $('effect-optimized-prompt').value = '';
  if ($('effect-change-summary')) $('effect-change-summary').textContent = '';
  const promptDetails = $('effect-editor-prompt-details');
  if (promptDetails) promptDetails.open = false;
}

function updateEffectEditorLockUi() {
  const bar = $('effect-editor-current-bar');
  const hint = $('effect-editor-locked-hint');
  const locked = effectEditorLocked || effectEditorGenerating;
  bar?.classList.toggle('locked', locked);
  const select = $('effect-editor-select');
  if (select) select.disabled = locked || !getEffects().length;
  hint?.classList.toggle('hidden', !locked);
  if (hint) hint.textContent = t('effect.lockedHint');
  if ($('btn-effect-generate-edit')) $('btn-effect-generate-edit').disabled = effectEditorGenerating;
  if ($('effect-change-request')) $('effect-change-request').disabled = effectEditorGenerating;
  if ($('effect-editor-size-preset')) $('effect-editor-size-preset').disabled = locked || effectEditorGenerating;
  if ($('effect-editor-size-width')) $('effect-editor-size-width').disabled = locked || effectEditorGenerating;
  if ($('effect-editor-size-height')) $('effect-editor-size-height').disabled = locked || effectEditorGenerating;
  if ($('effect-editor-quality')) $('effect-editor-quality').disabled = locked || effectEditorGenerating;
  if ($('btn-effect-editor-ref-add')) $('btn-effect-editor-ref-add').disabled = locked || effectEditorGenerating;
}

function setEffectEditorReferenceImage(ref, { persist = true } = {}) {
  effectEditorReferenceImage = ref?.path ? ref : null;
  if (persist) {
    void updateSession({ effectEditorReferenceImagePath: effectEditorReferenceImage?.path || '' });
  }
  renderEffectEditorReference();
}

function clearEffectEditorReference() {
  setEffectEditorReferenceImage(null);
}

function renderEffectEditorReference() {
  const preview = $('effect-editor-ref-preview');
  const empty = $('effect-editor-ref-empty');
  if (!preview || !empty) return;
  preview.innerHTML = '';
  if (!effectEditorReferenceImage?.path) {
    preview.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  preview.classList.remove('hidden');
  const div = document.createElement('div');
  div.className = 'ref-thumb';
  const img = document.createElement('img');
  img.alt = effectEditorReferenceImage.name || '';
  api.filesReadDataUrl(effectEditorReferenceImage.path).then((url) => { if (url) img.src = url; });
  const btn = document.createElement('button');
  btn.textContent = '×';
  btn.addEventListener('click', () => {
    if (effectEditorLocked || effectEditorGenerating) return;
    clearEffectEditorReference();
  });
  div.appendChild(img);
  div.appendChild(btn);
  preview.appendChild(div);
}

async function addEffectEditorReferencePaths(filePaths) {
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
  setEffectEditorReferenceImage(added[0]);
}

export async function refreshEffectEditorUi() {
  const effects = getEffects();
  const session = getSession();
  const activeId = editorEffectId || session.effectId || '';
  const effect = effects.find((item) => item.id === activeId);

  const select = $('effect-editor-select');
  if (!select) return;
  select.innerHTML = '';
  if (!effects.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = t('effect.empty');
    select.appendChild(opt);
    select.disabled = true;
  } else {
    for (const item of effects) {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.name;
      select.appendChild(opt);
    }
    const resolvedId = effects.some((item) => item.id === activeId)
      ? activeId
      : effects[0].id;
    select.value = resolvedId;
    select.disabled = effectEditorLocked || effectEditorGenerating;
  }

  const thumb = $('effect-editor-current-thumb');
  const thumbId = select.value || activeId;
  if (thumbId) {
    const url = await api.effectsGetImage(thumbId);
    if (thumbId === (editorEffectId || session.effectId) && url) {
      thumb.src = url;
      thumb.classList.remove('hidden');
    }
  } else {
    thumb?.removeAttribute('src');
    thumb?.classList.add('hidden');
  }

  const displayEffect = effects.find((item) => item.id === thumbId) || effect;
  let dims = displayEffect?.width && displayEffect?.height
    ? { width: displayEffect.width, height: displayEffect.height }
    : null;
  if (displayEffect?.id && !dims) {
    dims = await api.effectsGetDimensions(displayEffect.id);
    if (dims?.width && dims?.height) {
      displayEffect.width = dims.width;
      displayEffect.height = dims.height;
    }
  }

  let catalog = getImageSettingsCatalog();
  if (!catalog) {
    catalog = await api.getImageSettingsCatalog();
    setImageSettingsCatalog(catalog);
  }
  const presetSelect = $('effect-editor-size-preset');
  const prevSize = effectEditorOutputSize || catalog.defaultSize;
  if (presetSelect) {
    populateEffectEditorSizePresetSelect(presetSelect, displayEffect);
    syncEffectEditorSizeFieldsFromValue(prevSize, displayEffect);
    presetSelect.disabled = effectEditorLocked || effectEditorGenerating;
  }
  if ($('effect-editor-size-width')) $('effect-editor-size-width').disabled = effectEditorLocked || effectEditorGenerating;
  if ($('effect-editor-size-height')) $('effect-editor-size-height').disabled = effectEditorLocked || effectEditorGenerating;

  const qualitySelect = $('effect-editor-quality');
  if (!qualitySelect) return;
  const prevQuality = qualitySelect.value || session.quality || catalog.defaultQuality;
  qualitySelect.innerHTML = '';
  for (const quality of catalog.qualities) {
    const opt = document.createElement('option');
    opt.value = quality;
    opt.textContent = qualityLabel(quality);
    qualitySelect.appendChild(opt);
  }
  qualitySelect.value = catalog.qualities.includes(prevQuality)
    ? prevQuality
    : catalog.defaultQuality;
  qualitySelect.disabled = effectEditorLocked || effectEditorGenerating;
}

export async function selectEditorEffect(id, options = {}) {
  if ((effectEditorLocked || effectEditorGenerating) && !options.force) {
    showStatus(t('effect.lockedHint'), { level: 'warn', ms: 7000 });
    return;
  }
  editorEffectId = id;
  if (!options.preserveReference) {
    clearEffectEditorReference();
  }
  if (options.referenceImage) {
    setEffectEditorReferenceImage(options.referenceImage);
  }
  if (options.syncSession !== false) {
    await updateSession({ effectId: id });
  }
  const url = await api.effectsGetImage(id);
  if (url && $('effect-editor-original')) $('effect-editor-original').src = url;
  if (!options.preservePreview) {
    clearEffectEditorPreview();
  }
  await refreshEffectEditorUi();
}

export function waitContextForEffectEdit({ effectId, changeRequest, size, quality }) {
  const effect = getEffects().find((item) => item.id === effectId) || getEditorEffect();
  return {
    kind: 'effectEdit',
    effect: effect?.name || effect?.id || '',
    size: size || '',
    quality: quality || '',
    change: changeRequest ? String(changeRequest).slice(0, 240) : '',
  };
}

export function renderEffectEditWaitContext(ctx, add) {
  if (ctx.kind !== 'effectEdit') return;
  add('wait.context.effect', ctx.effect);
  const effect = getEditorEffect();
  if (ctx.size) add('wait.context.size', formatEffectGatewaySizeLabel(ctx.size, effect));
  if (ctx.quality) add('wait.context.quality', qualityLabel(ctx.quality));
  add('wait.context.change', ctx.change);
}

function effectEditorCompareAvailable() {
  const preview = $('effect-editor-preview');
  return Boolean($('effect-editor-original')?.src && preview && !preview.classList.contains('hidden'));
}

function openEffectEditorCompareLightbox() {
  if (!effectEditorCompareAvailable()) return;
  const overlay = $('editor-compare-lightbox');
  if (!overlay) return;
  $('editor-compare-original').src = $('effect-editor-original').src;
  $('editor-compare-preview').src = $('effect-editor-preview').src;
  overlay.classList.remove('hidden');
  document.body.classList.add('lightbox-open');
}

function onEffectEditorDimensionInput(axis) {
  if (effectEditorSizeFieldSync) return;
  const widthEl = $('effect-editor-size-width');
  const heightEl = $('effect-editor-size-height');
  let w = parseInt(widthEl?.value, 10);
  let h = parseInt(heightEl?.value, 10);
  if (!effectEditorAspectRatio || effectEditorAspectRatio <= 0) return;

  effectEditorSizeFieldSync = true;
  if (axis === 'width' && w > 0) {
    h = Math.max(1, Math.round(w / effectEditorAspectRatio));
    heightEl.value = String(h);
  } else if (axis === 'height' && h > 0) {
    w = Math.max(1, Math.round(h * effectEditorAspectRatio));
    widthEl.value = String(w);
  }
  effectEditorSizeFieldSync = false;

  w = parseInt(widthEl?.value, 10);
  h = parseInt(heightEl?.value, 10);
  if (w > 0 && h > 0) {
    $('effect-editor-size-preset').value = 'custom';
    effectEditorOutputSize = getEffectEditorSizeValue();
  }
}

function onEffectEditorSizePresetChange() {
  const catalog = getImageSettingsCatalog();
  const preset = $('effect-editor-size-preset')?.value;
  const effect = getEditorEffect();
  if (preset === catalog.sizeFromTemplate) {
    setEffectEditorDimensionFields(effect?.width, effect?.height);
    effectEditorOutputSize = catalog.sizeFromTemplate;
    return;
  }
  if (preset === 'custom') {
    effectEditorOutputSize = getEffectEditorSizeValue();
    return;
  }
  const parsed = parseSizeWxH(preset);
  if (parsed) {
    setEffectEditorDimensionFields(parsed.width, parsed.height);
    effectEditorOutputSize = preset;
  }
}

export function applyEffectEditorLabels() {
  if ($('lbl-effect-editor-title')) $('lbl-effect-editor-title').textContent = t('effect.editorTitle');
  if ($('lbl-effect-editor-effect')) $('lbl-effect-editor-effect').textContent = t('effect.editorEffect');
  if ($('effect-editor-preview-empty')) $('effect-editor-preview-empty').textContent = t('effect.previewEmpty');
  if ($('lbl-effect-original')) $('lbl-effect-original').textContent = t('template.original');
  if ($('lbl-effect-ki-preview')) $('lbl-effect-ki-preview').textContent = t('template.preview');
  if ($('lbl-effect-change')) $('lbl-effect-change').textContent = t('template.changeRequest');
  if ($('effect-change-request')) {
    $('effect-change-request').placeholder = t('effect.changeRequest.placeholder');
  }
  if ($('lbl-effect-opt-prompt')) $('lbl-effect-opt-prompt').textContent = t('prompt.optimized');
  if ($('btn-effect-generate-edit')) $('btn-effect-generate-edit').textContent = t('effect.generateEdit');
  if ($('lbl-effect-editor-size')) $('lbl-effect-editor-size').textContent = t('template.outputFormat');
  if ($('lbl-effect-editor-width')) $('lbl-effect-editor-width').textContent = t('template.editorWidth');
  if ($('lbl-effect-editor-height')) $('lbl-effect-editor-height').textContent = t('template.editorHeight');
  if ($('lbl-effect-editor-quality')) $('lbl-effect-editor-quality').textContent = t('settings.quality');
  if ($('effect-editor-change-hint')) $('effect-editor-change-hint').textContent = t('template.changeOptionalHint');
  if ($('btn-effect-accept')) $('btn-effect-accept').textContent = t('template.accept');
  if ($('btn-effect-reject')) $('btn-effect-reject').textContent = t('template.reject');
  if ($('btn-effect-editor-compare')) $('btn-effect-editor-compare').textContent = t('template.compareFullscreen');
  if ($('lbl-effect-editor-ref')) $('lbl-effect-editor-ref').textContent = t('template.editorRef');
  if ($('btn-effect-editor-ref-add')) $('btn-effect-editor-ref-add').textContent = t('template.editorRefAdd');
  if ($('effect-editor-ref-hint')) $('effect-editor-ref-hint').textContent = t('effect.editorRefHint');
  if ($('effect-editor-ref-empty')) $('effect-editor-ref-empty').textContent = t('template.editorRefEmpty');
  updateEffectEditorLockUi();
  renderEffectEditorReference();
}

export async function onShowEffectsView() {
  if (!effectEditorLocked && !effectEditorGenerating && getSession().effectId) {
    editorEffectId = getSession().effectId;
    await selectEditorEffect(getSession().effectId).catch(() => {});
  }
}

export async function restoreEffectEditorReferenceFromSession(session) {
  if (session.effectEditorReferenceImagePath) {
    setEffectEditorReferenceImage({
      path: session.effectEditorReferenceImagePath,
      name: session.effectEditorReferenceImagePath.split(/[/\\]/).pop() || '',
    }, { persist: false });
  }
}

export async function restoreEffectEditorPending() {
  const pendingEdit = await api.effectsGetPendingEdit();
  if (!pendingEdit?.effectId) {
    editorEffectId = getSession().effectId;
    if (editorEffectId) await selectEditorEffect(editorEffectId);
    return;
  }
  editorEffectId = pendingEdit.effectId;
  effectEditorLocked = true;
  if ($('effect-change-request')) $('effect-change-request').value = pendingEdit.changeRequest || '';
  if ($('effect-optimized-prompt')) $('effect-optimized-prompt').value = pendingEdit.optimizedEditPrompt || '';
  if ($('effect-change-summary')) $('effect-change-summary').textContent = pendingEdit.changeSummary || '';
  if (pendingEdit.referenceImagePath) {
    setEffectEditorReferenceImage({
      path: pendingEdit.referenceImagePath,
      name: pendingEdit.referenceImagePath.split(/[/\\]/).pop() || '',
    });
  }
  updateEffectEditorLockUi();
  await selectEditorEffect(pendingEdit.effectId, {
    preservePreview: true,
    preserveReference: true,
    force: true,
  });
  if (pendingEdit.previewB64) {
    effectEditorPreviewMetaContext = {
      format: 'PNG',
      fileSizeBytes: estimateBytesFromB64(pendingEdit.previewB64),
      requestedLabel: formatEffectGatewaySizeLabel(pendingEdit.imageSize, getEditorEffect()),
      quality: getSession().quality || 'high',
    };
    $('effect-editor-preview').src = `data:image/png;base64,${pendingEdit.previewB64}`;
    $('effect-editor-preview').classList.remove('hidden');
    $('effect-editor-preview-empty').classList.add('hidden');
    refreshPreviewMetaOverlay('effect-editor-preview', 'effect-editor-preview-meta', effectEditorPreviewMetaContext);
    setEffectEditorReviewBarVisible(true);
  }
}

export async function openEffectEditorForEffect(id) {
  await selectEditorEffect(id, { syncSession: false });
  showView('effects');
}

export function setupEffectEditorHandlers(deps) {
  configureEffectEditor(deps);

  $('effect-editor-size-preset')?.addEventListener('change', () => onEffectEditorSizePresetChange());
  $('effect-editor-size-width')?.addEventListener('input', () => onEffectEditorDimensionInput('width'));
  $('effect-editor-size-height')?.addEventListener('input', () => onEffectEditorDimensionInput('height'));

  $('btn-effect-editor-ref-add')?.addEventListener('click', async () => {
    if (effectEditorLocked || effectEditorGenerating) return;
    const picked = await api.refsAddDialog();
    if (picked?.length) await addEffectEditorReferencePaths([picked[0].path]);
  });

  const drop = $('effect-editor-ref-drop');
  if (drop) {
    const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
    drop.addEventListener('dragenter', (e) => {
      prevent(e);
      if (!effectEditorLocked && !effectEditorGenerating) drop.classList.add('drag-over');
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
      if (effectEditorLocked || effectEditorGenerating) return;
      if (isInternalSortDrag(e.dataTransfer)) return;
      const paths = imagePathsFromDataTransfer(e.dataTransfer);
      if (paths.length) await addEffectEditorReferencePaths(paths);
      else showError(new Error(t('template.editorRefDropInvalid')));
    });
  }

  $('btn-effect-editor-compare')?.addEventListener('click', () => openEffectEditorCompareLightbox());
  $('effect-editor-original')?.addEventListener('click', () => {
    if (effectEditorCompareAvailable()) openEffectEditorCompareLightbox();
  });
  $('effect-editor-preview')?.addEventListener('click', () => {
    if (!$('effect-editor-preview')?.classList.contains('hidden')) {
      if (effectEditorCompareAvailable()) openEffectEditorCompareLightbox();
    }
  });

  $('effect-editor-select')?.addEventListener('change', async () => {
    const id = $('effect-editor-select').value;
    if (!id || id === editorEffectId) return;
    await selectEditorEffect(id);
  });

  attachPreviewMetaListeners(
    'effect-editor-preview',
    'effect-editor-preview-meta',
    () => effectEditorPreviewMetaContext,
  );

  $('btn-effect-generate-edit')?.addEventListener('click', async () => {
    if (!(await ensureBridgeReady())) return;
    const id = editorEffectId || getSession().effectId;
    const changeRequest = $('effect-change-request')?.value.trim() || '';
    const size = getEffectEditorSizeValue();
    const effect = getEditorEffect();
    if (!effectEditorDimensionsValid()) {
      showStatus(t('effect.invalidSize'), { level: 'warn' });
      return;
    }
    if (!isEffectEditorFormatOnly(changeRequest, size, effect) && !changeRequest) {
      showStatus(t('effect.needChangeOrSize'), { level: 'warn' });
      return;
    }
    try {
      effectEditorGenerating = true;
      effectEditorOutputSize = size;
      updateEffectEditorLockUi();
      showWait(
        t('effect.generateEdit'),
        waitContextForEffectEdit({
          effectId: id,
          changeRequest,
          size,
          quality: $('effect-editor-quality')?.value,
        }),
      );
      const result = await api.effectsRunEdit({
        effectId: id,
        changeRequest,
        quality: $('effect-editor-quality')?.value,
        size,
        referenceImagePath: effectEditorReferenceImage?.path || '',
        pairingCode: getPairingCode(),
      });
      if ($('effect-optimized-prompt')) $('effect-optimized-prompt').value = result.optimizedEditPrompt || '';
      if ($('effect-change-summary')) $('effect-change-summary').textContent = result.changeSummary || '';
      if (result.previewB64) {
        effectEditorPreviewMetaContext = {
          format: 'PNG',
          fileSizeBytes: estimateBytesFromB64(result.previewB64),
          requestedLabel: formatEffectGatewaySizeLabel(size, effect),
          quality: $('effect-editor-quality')?.value,
        };
        $('effect-editor-preview').src = `data:image/png;base64,${result.previewB64}`;
        $('effect-editor-preview').classList.remove('hidden');
        $('effect-editor-preview-empty').classList.add('hidden');
        refreshPreviewMetaOverlay('effect-editor-preview', 'effect-editor-preview-meta', effectEditorPreviewMetaContext);
        setEffectEditorReviewBarVisible(true);
      }
      effectEditorLocked = true;
      hideWait();
    } catch (err) {
      hideWait();
      showError(err);
    } finally {
      effectEditorGenerating = false;
      updateEffectEditorLockUi();
      await refreshEffectEditorUi();
    }
  });

  $('btn-effect-accept')?.addEventListener('click', async () => {
    try {
      const accepted = await api.effectsAcceptEdit();
      effectEditorLocked = false;
      if ($('effect-change-request')) $('effect-change-request').value = '';
      clearEffectEditorPreview();
      updateEffectEditorLockUi();
      await loadEffects();
      await updateSession({ effectId: accepted.effectId });
      await selectEditorEffect(accepted.effectId);
      showStatus(t('effect.editSuccess'), { level: 'success' });
    } catch (err) {
      showError(err);
    }
  });

  $('btn-effect-reject')?.addEventListener('click', async () => {
    await api.effectsRejectEdit();
    effectEditorLocked = false;
    clearEffectEditorPreview();
    updateEffectEditorLockUi();
    await refreshEffectEditorUi();
  });
}
