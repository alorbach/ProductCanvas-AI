'use strict';

const assert = require('assert');
const { resolveLocale } = require('../src/main/app-preferences');

assert.strictEqual(resolveLocale('auto', 'de-DE'), 'de');
assert.strictEqual(resolveLocale('auto', 'en-US'), 'en');
assert.strictEqual(resolveLocale('auto', 'fr-FR'), 'en');
assert.strictEqual(resolveLocale('de', 'en-US'), 'de');
assert.strictEqual(resolveLocale('en', 'de-DE'), 'en');
assert.strictEqual(resolveLocale('auto', ''), 'en');

console.log('All locale tests passed.');
