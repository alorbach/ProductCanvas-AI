'use strict';

let strings = {};

export async function loadI18n() {
  const res = await fetch('./i18n/de.json');
  strings = await res.json();
}

export function t(key, fallback = '') {
  return strings[key] ?? fallback ?? key;
}
