'use strict';

const fs = require('fs');
const path = require('path');

const cache = {};

function loadLocale(locale) {
  const loc = locale === 'de' ? 'de' : 'en';
  if (cache[loc]) return cache[loc];
  const filePath = path.join(__dirname, `${loc}.json`);
  cache[loc] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return cache[loc];
}

function t(locale, key, vars = {}) {
  const strings = loadLocale(locale);
  let text = strings[key] ?? key;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
  }
  return text;
}

function clearCache() {
  for (const key of Object.keys(cache)) delete cache[key];
}

module.exports = { t, loadLocale, clearCache };
