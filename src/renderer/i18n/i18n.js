'use strict';

let strings = {};
let currentLocale = 'en';

export function interpolate(text, vars = {}) {
  if (!text || !vars || typeof vars !== 'object') return text;
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, String(value ?? ''));
  }
  return result;
}

export async function loadI18n(locale = 'en') {
  const loc = locale === 'de' ? 'de' : 'en';
  const res = await fetch(`./i18n/${loc}.json`);
  strings = await res.json();
  currentLocale = loc;
}

export function getLocale() {
  return currentLocale;
}

export function t(key, vars = '') {
  let text = strings[key];
  if (text == null) {
    if (typeof vars === 'string' && vars) return vars;
    return key;
  }
  if (vars && typeof vars === 'object') {
    return interpolate(text, vars);
  }
  return text;
}
