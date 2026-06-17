'use strict';

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const { interpolate } = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'renderer', 'i18n', 'i18n.js')).href);
  assert.strictEqual(
    interpolate('System language: {locale}', { locale: 'de-DE' }),
    'System language: de-DE',
  );
  assert.strictEqual(interpolate('No vars', {}), 'No vars');
  console.log('All i18n-interpolation tests passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
