'use strict';

let strings = {};
let currentLocale = 'en';

export async function loadI18n(locale = 'en') {
  const loc = locale === 'de' ? 'de' : 'en';
  const res = await fetch(`./i18n/${loc}.json`);
  strings = await res.json();
  currentLocale = loc;
}

export function getLocale() {
  return currentLocale;
}

export function t(key, fallback = '') {
  return strings[key] ?? fallback ?? key;
}
