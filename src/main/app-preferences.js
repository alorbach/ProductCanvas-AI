'use strict';

const fs = require('fs');
const paths = require('./paths');
const { normalizeBridgeUrl } = require('./safe-paths');

const SUPPORTED_LOCALES = ['en', 'de'];
const DEFAULT_UI_LOCALE = 'auto';
const DEFAULT_CODEX_BACKEND = 'direct';
const SUPPORTED_CODEX_BACKENDS = ['direct', 'bridge'];

function readDefaults() {
  try {
    const defaults = JSON.parse(fs.readFileSync(paths.defaultsPath(), 'utf8'));
    const cleanedCliPath = sanitizeCodexCliPath(defaults.codexCliPath);
    if (defaults.codexCliPath && cleanedCliPath !== normalizeCodexCliPath(defaults.codexCliPath)) {
      const next = { ...defaults, codexCliPath: '' };
      fs.writeFileSync(paths.defaultsPath(), JSON.stringify(next, null, 2));
      return next;
    }
    return defaults;
  } catch {
    return {};
  }
}

function writeDefaults(patch) {
  const current = readDefaults();
  const next = { ...current, ...patch };
  fs.mkdirSync(paths.userDataRoot(), { recursive: true });
  fs.writeFileSync(paths.defaultsPath(), JSON.stringify(next, null, 2));
  return next;
}

function resolveLocale(preference, systemLocale) {
  if (preference && preference !== 'auto' && SUPPORTED_LOCALES.includes(preference)) {
    return preference;
  }
  const lang = String(systemLocale || 'en').split('-')[0].toLowerCase();
  return lang === 'de' ? 'de' : 'en';
}

function normalizeCodexCliPath(value) {
  return String(value || '').trim();
}

function sanitizeCodexCliPath(value) {
  const normalized = normalizeCodexCliPath(value);
  if (!normalized) return '';
  if (/[\\/]pcai-cli-resolve-/i.test(normalized) && !fs.existsSync(normalized)) {
    return '';
  }
  return normalized;
}

function getPreferences(systemLocale) {
  const defaults = readDefaults();
  const uiLocale = defaults.uiLocale || DEFAULT_UI_LOCALE;
  const codexBackend = SUPPORTED_CODEX_BACKENDS.includes(defaults.codexBackend)
    ? defaults.codexBackend
    : DEFAULT_CODEX_BACKEND;
  return {
    uiLocale,
    resolvedLocale: resolveLocale(uiLocale, systemLocale),
    systemLocale: systemLocale || 'en',
    bridgeUrl: normalizeBridgeUrl(defaults.bridgeUrl),
    codexBackend,
    codexCliPath: sanitizeCodexCliPath(defaults.codexCliPath),
  };
}

function setPreferences(patch, systemLocale) {
  const allowed = {};
  if (patch.uiLocale !== undefined) {
    const value = String(patch.uiLocale);
    allowed.uiLocale = value === 'auto' || SUPPORTED_LOCALES.includes(value) ? value : DEFAULT_UI_LOCALE;
  }
  if (patch.bridgeUrl !== undefined) {
    allowed.bridgeUrl = normalizeBridgeUrl(patch.bridgeUrl);
  }
  if (patch.codexBackend !== undefined) {
    const value = String(patch.codexBackend);
    allowed.codexBackend = SUPPORTED_CODEX_BACKENDS.includes(value) ? value : DEFAULT_CODEX_BACKEND;
  }
  if (patch.codexCliPath !== undefined) {
    allowed.codexCliPath = normalizeCodexCliPath(patch.codexCliPath);
  }
  writeDefaults(allowed);
  return getPreferences(systemLocale);
}

module.exports = {
  SUPPORTED_LOCALES,
  DEFAULT_UI_LOCALE,
  DEFAULT_CODEX_BACKEND,
  SUPPORTED_CODEX_BACKENDS,
  resolveLocale,
  getPreferences,
  setPreferences,
  normalizeBridgeUrl,
  normalizeCodexCliPath,
  readDefaults,
};
