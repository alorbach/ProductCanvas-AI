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
  $('btn-save-settings').textContent = t('settings.save');
  document.querySelector('.settings-tabs')?.setAttribute('aria-label', t('settings.tabsLabel'));
}

function updateSystemHint(prefs) {
  $('system-locale-hint').textContent = t('settings.language.systemHint', { locale: prefs.systemLocale || 'en' });
}

function updateBridgeUrlVisibility() {
  const backend = $('setting-codex-backend').value || 'direct';
  const field = $('bridge-url-field');
  if (field) field.hidden = backend !== 'bridge';
}

async function loadForm() {
  const prefs = await api.getPreferences();
  $('setting-locale').value = prefs.uiLocale || 'auto';
  $('setting-codex-backend').value = prefs.codexBackend || 'direct';
  $('setting-bridge-url').value = prefs.bridgeUrl || 'http://127.0.0.1:8765';
  await loadI18n(prefs.resolvedLocale || 'en');
  await applyLabels();
  updateSystemHint(prefs);
  updateBridgeUrlVisibility();
  selectTab(activeTab);
}

async function saveSettings() {
  const patch = {
    uiLocale: $('setting-locale').value,
    codexBackend: $('setting-codex-backend').value,
    bridgeUrl: $('setting-bridge-url').value.trim(),
  };
  const prefs = await api.setPreferences(patch);
  await loadI18n(prefs.resolvedLocale);
  await applyLabels();
  updateSystemHint(prefs);
  updateBridgeUrlVisibility();
  const status = $('settings-status');
  status.hidden = false;
  status.textContent = t('settings.saved');
}

document.querySelectorAll('.settings-tab').forEach((btn) => {
  btn.addEventListener('click', () => selectTab(btn.dataset.tab));
});

$('setting-codex-backend').addEventListener('change', updateBridgeUrlVisibility);
$('btn-save-settings').addEventListener('click', () => saveSettings());

api.on('preferences:changed', async (prefs) => {
  await loadI18n(prefs.resolvedLocale);
  await applyLabels();
  updateSystemHint(prefs);
  if ($('setting-codex-backend')) {
    $('setting-codex-backend').value = prefs.codexBackend || 'direct';
  }
  updateBridgeUrlVisibility();
});

loadForm();
