import { loadI18n, t } from './i18n/i18n.js';

import { api } from './bridge-api.js';
const $ = (id) => document.getElementById(id);

async function applyLabels() {
  document.title = t('settings.title');
  $('lbl-settings-title').textContent = t('settings.title');
  $('lbl-language').textContent = t('settings.language');
  $('opt-locale-auto').textContent = t('settings.language.auto');
  $('opt-locale-en').textContent = t('settings.language.en');
  $('opt-locale-de').textContent = t('settings.language.de');
  $('lbl-bridge-url').textContent = t('settings.bridgeUrl');
  $('btn-save-settings').textContent = t('settings.save');
}

function updateSystemHint(prefs) {
  $('system-locale-hint').textContent = t('settings.language.systemHint', { locale: prefs.systemLocale || 'en' });
}

async function loadForm() {
  const prefs = await api.getPreferences();
  $('setting-locale').value = prefs.uiLocale || 'auto';
  $('setting-bridge-url').value = prefs.bridgeUrl || 'http://127.0.0.1:8765';
  await loadI18n(prefs.resolvedLocale || 'en');
  await applyLabels();
  updateSystemHint(prefs);
}

async function saveSettings() {
  const patch = {
    uiLocale: $('setting-locale').value,
    bridgeUrl: $('setting-bridge-url').value.trim(),
  };
  const prefs = await api.setPreferences(patch);
  await loadI18n(prefs.resolvedLocale);
  await applyLabels();
  updateSystemHint(prefs);
  const status = $('settings-status');
  status.hidden = false;
  status.textContent = t('settings.saved');
}

$('btn-save-settings').addEventListener('click', () => saveSettings());

api.on('preferences:changed', async (prefs) => {
  await loadI18n(prefs.resolvedLocale);
  await applyLabels();
  updateSystemHint(prefs);
});

loadForm();
