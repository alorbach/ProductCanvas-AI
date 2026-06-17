'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

assert(fs.existsSync(path.join(root, 'package.json')), 'package.json exists');
assert(fs.existsSync(path.join(root, 'LICENSE')), 'LICENSE exists');
assert(fs.existsSync(path.join(root, 'src', 'main', 'main.js')), 'main.js exists');
assert(fs.existsSync(path.join(root, 'src', 'renderer', 'i18n', 'de.json')), 'de.json exists');
assert(fs.existsSync(path.join(root, 'src', 'renderer', 'i18n', 'en.json')), 'en.json exists');
assert(fs.existsSync(path.join(root, 'src', 'main', 'app-preferences.js')), 'app-preferences.js exists');

const license = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
assert(license.includes('Andre Lorbach'), 'LICENSE copyright');

const de = JSON.parse(fs.readFileSync(path.join(root, 'src', 'renderer', 'i18n', 'de.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'src', 'renderer', 'i18n', 'en.json'), 'utf8'));
const deKeys = Object.keys(de).sort();
const enKeys = Object.keys(en).sort();
assert.deepStrictEqual(deKeys, enKeys, 'renderer i18n key parity');

assert.strictEqual(de['app.title'], 'ProductCanvas AI', 'German app title');
assert.strictEqual(en['app.title'], 'ProductCanvas AI', 'English app title');
assert(de['settings.projectTitle'], 'project panel title');
assert(en['settings.language'], 'settings language label');

const docChapters = [
  'en/user-guide.md', 'en/getting-started.md', 'en/create-image.md',
  'de/benutzerhandbuch.md', 'de/einrichtung.md', 'de/bild-erstellen.md',
];
for (const chapter of docChapters) {
  assert(fs.existsSync(path.join(root, 'docs', chapter)), `doc exists: ${chapter}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.name, 'productcanvas-ai');
assert.strictEqual(pkg.build.productName, 'ProductCanvas AI');
assert.strictEqual(pkg.author, 'Andre Lorbach');

const { DEFAULTS } = require(path.join(root, 'src', 'main', 'profiles', 'profile-store'));
assert.strictEqual(DEFAULTS.uiLocale, 'auto');
assert.strictEqual(DEFAULTS.size, 'template');

const { inferAccentKey, inferAccentMeta } = require(path.join(root, 'src', 'main', 'templates', 'template-accent'));
assert.equal(inferAccentKey('Vorlage-blau'), 'blue');
assert.equal(inferAccentMeta({ name: 'Vorlage-grün' }).accentHex, '#00c853');

const { buildTemplateLayoutHint } = require(path.join(root, 'src', 'main', 'generate', 'image-preflight'));
const hint = buildTemplateLayoutHint({ name: 'Vorlage-blau', accentHex: '#FFD700', categories: ['LAUTSPRECHER'] }, { layoutImageAttached: true });
assert(hint.includes('IMAGE 2 is authoritative'));
assert(!hint.includes('#FFD700'));

const { buildReferencePromptFromForm } = require(path.join(root, 'src', 'main', 'generate', 'prompt-builder'));
const stubRegistry = { resolveTemplatePath: () => 'C:\\tpl.png' };
const stub = buildReferencePromptFromForm(
  { brandName: 'acme', seriesName: 'Motion', tagline: 'Test', templateId: 't1', productCategory: 'LAUTSPRECHER' },
  { id: 't1' },
  stubRegistry,
  '',
  ['C:\\prod.png'],
);
assert.equal(stub.brandName, 'ACME');
assert.equal(stub.imagePrompt, '');
assert(stub.preflightFingerprint.length === 64);

console.log('All basic tests passed.');
