import { loadI18n, t } from './i18n/i18n.js';

import { api } from './bridge-api.js';
const $ = (id) => document.getElementById(id);

let activeTab = 'general';

function selectTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll('.settings-tab').forEach((btn) => {
    const selected = btn.dataset.tab === tabId;
    btn.classList.toggle('active', selected);
    btn.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
  document.querySelectorAll('.settings-panel').forEach((panel) => {
    const isActive = panel.id === `tab-panel-${tabId}`;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });
  if (tabId === 'codex') {
    refreshCodexCliInfo();
  }
}

function resolutionSourceLabel(source) {
  const key = `settings.codexCliPath.source.${source || 'default'}`;
  const label = t(key);
  return label === key ? String(source || 'default') : label;
}

async function refreshCodexCliInfo() {
  const resolvedHint = $('codex-cli-resolved-hint');
  if (!resolvedHint || ($('setting-codex-backend').value || 'direct') !== 'direct') {
    if (resolvedHint) resolvedHint.textContent = '';
    return;
  }
  try {
    const info = await api.getCodexCliInfo();
    const configured = $('setting-codex-cli-path').value.trim();
    const parts = [];
    if (info.envOverride) {
      parts.push(t('settings.codexCliPath.envOverride'));
    }
    if (configured && info.configuredPath && info.resolutionSource !== 'settings') {
      parts.push(t('settings.codexCliPath.missing'));
    }
    if (info.resolvedBinary) {
      parts.push(t('settings.codexCliPath.resolvedHint', {
        path: info.resolvedBinary,
        source: resolutionSourceLabel(info.resolutionSource),
      }));
    }
    resolvedHint.textContent = parts.join(' ');
  } catch {
    resolvedHint.textContent = '';
  }
}

async function applyLabels() {
  document.title = t('settings.title');
  $('lbl-settings-title').textContent = t('settings.title');
  $('tab-btn-general').textContent = t('settings.tab.general');
  $('tab-btn-codex').textContent = t('settings.tab.codex');
  $('lbl-language').textContent = t('settings.language');
  $('opt-locale-auto').textContent = t('settings.language.auto');
  $('opt-locale-en').textContent = t('settings.language.en');
  $('opt-locale-de').textContent = t('settings.language.de');
  $('lbl-codex-backend').textContent = t('settings.codexBackend');
  $('opt-backend-direct').textContent = t('settings.codexBackend.direct');
  $('opt-backend-bridge').textContent = t('settings.codexBackend.bridge');
  $('codex-backend-hint').textContent = t('settings.codexBackendHint');
  $('codex-subscription-hint').textContent = t('codex.subscription.hint');
  $('lbl-bridge-url').textContent = t('settings.bridgeUrl');
  $('lbl-codex-cli-path').textContent = t('settings.codexCliPath');
  $('codex-cli-path-hint').textContent = t('settings.codexCliPathHint');
  $('btn-codex-cli-browse').textContent = t('settings.codexCliPath.browse');
  $('btn-codex-cli-clear').textContent = t('settings.codexCliPath.clear');
  $('btn-save-settings').textContent = t('settings.save');
  document.querySelector('.settings-tabs')?.setAttribute('aria-label', t('settings.tabsLabel'));
}

function updateSystemHint(prefs) {
  $('system-locale-hint').textContent = t('settings.language.systemHint', { locale: prefs.systemLocale || 'en' });
}

function updateCodexFieldVisibility() {
  const backend = $('setting-codex-backend').value || 'direct';
  const isDirect = backend === 'direct';
  const isBridge = backend === 'bridge';
  const bridgeField = $('bridge-url-field');
  const cliField = $('codex-cli-path-field');
  const cliHint = $('codex-cli-path-hint');
  const resolvedHint = $('codex-cli-resolved-hint');
  if (bridgeField) bridgeField.hidden = !isBridge;
  if (cliField) cliField.hidden = !isDirect;
  if (cliHint) cliHint.hidden = !isDirect;
  if (resolvedHint) resolvedHint.hidden = !isDirect;
  if (isDirect) {
    refreshCodexCliInfo();
  } else if (resolvedHint) {
    resolvedHint.textContent = '';
  }
}

async function loadForm() {
  const prefs = await api.getPreferences();
  $('setting-locale').value = prefs.uiLocale || 'auto';
  $('setting-codex-backend').value = prefs.codexBackend || 'direct';
  $('setting-bridge-url').value = prefs.bridgeUrl || 'http://127.0.0.1:8765';
  $('setting-codex-cli-path').value = prefs.codexCliPath || '';
  await loadI18n(prefs.resolvedLocale || 'en');
  await applyLabels();
  updateSystemHint(prefs);
  updateCodexFieldVisibility();
  selectTab(activeTab);
}

async function saveSettings() {
  const patch = {
    uiLocale: $('setting-locale').value,
    codexBackend: $('setting-codex-backend').value,
    bridgeUrl: $('setting-bridge-url').value.trim(),
    codexCliPath: $('setting-codex-cli-path').value.trim(),
  };
  const prefs = await api.setPreferences(patch);
  await loadI18n(prefs.resolvedLocale);
  await applyLabels();
  updateSystemHint(prefs);
  updateCodexFieldVisibility();
  const status = $('settings-status');
  status.hidden = false;
  status.textContent = t('settings.saved');
}

document.querySelectorAll('.settings-tab').forEach((btn) => {
  btn.addEventListener('click', () => selectTab(btn.dataset.tab));
});

$('setting-codex-backend').addEventListener('change', updateCodexFieldVisibility);
$('btn-save-settings').addEventListener('click', () => saveSettings());
$('btn-codex-cli-browse').addEventListener('click', async () => {
  const picked = await api.pickCodexCliPath();
  if (picked) {
    $('setting-codex-cli-path').value = picked;
    await refreshCodexCliInfo();
  }
});
$('btn-codex-cli-clear').addEventListener('click', async () => {
  $('setting-codex-cli-path').value = '';
  await refreshCodexCliInfo();
});
$('setting-codex-cli-path').addEventListener('change', () => refreshCodexCliInfo());

api.on('preferences:changed', async (prefs) => {
  await loadI18n(prefs.resolvedLocale);
  await applyLabels();
  updateSystemHint(prefs);
  if ($('setting-codex-backend')) {
    $('setting-codex-backend').value = prefs.codexBackend || 'direct';
  }
  if ($('setting-codex-cli-path') && prefs.codexCliPath !== undefined) {
    $('setting-codex-cli-path').value = prefs.codexCliPath || '';
  }
  updateCodexFieldVisibility();
});

loadForm();
