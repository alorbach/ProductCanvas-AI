'use strict';

const assert = require('assert');
const { resolveLocale, normalizeBridgeUrl } = require('../src/main/app-preferences');

assert.strictEqual(resolveLocale('auto', 'de-DE'), 'de');
assert.strictEqual(resolveLocale('auto', 'en-US'), 'en');
assert.strictEqual(resolveLocale('auto', 'fr-FR'), 'en');
assert.strictEqual(resolveLocale('de', 'en-US'), 'de');
assert.strictEqual(resolveLocale('en', 'de-DE'), 'en');
assert.strictEqual(resolveLocale('auto', ''), 'en');
assert.strictEqual(normalizeBridgeUrl('javascript:alert(1)'), 'http://127.0.0.1:8765');

console.log('All locale tests passed.');
