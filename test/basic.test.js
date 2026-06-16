'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

assert(fs.existsSync(path.join(root, 'package.json')), 'package.json exists');
assert(fs.existsSync(path.join(root, 'src', 'main', 'main.js')), 'main.js exists');
assert(fs.existsSync(path.join(root, 'src', 'renderer', 'i18n', 'de.json')), 'de.json exists');
assert(fs.existsSync(path.join(root, 'src', 'main', 'generate', 'image-prep.js')), 'image-prep.js exists');
assert(fs.existsSync(path.join(root, 'src', 'main', 'generate', 'image-preflight.js')), 'image-preflight.js exists');
assert(fs.existsSync(path.join(root, 'src', 'main', 'debug', 'logger.js')), 'logger.js exists');

const de = JSON.parse(fs.readFileSync(path.join(root, 'src', 'renderer', 'i18n', 'de.json'), 'utf8'));
assert(de['app.title'] === 'WerbungMaker', 'German UI strings');
assert(de['generate.button'], 'generate button label');
assert(de['error.bodyTooLarge'], 'body too large error message');
assert(de['error.referenceAttachFailed'], 'reference attach error message');
assert(de['refs.dropHint'], 'drag drop hint');
assert(de['template.import'], 'template import label');
assert(de['template.empty'], 'template empty hint');
assert(de['tagline.suggest'], 'tagline suggest label');
assert(de['settings.mediaAnalysis'], 'media analysis setting label');

const { DEFAULTS } = require(path.join(root, 'src', 'main', 'profiles', 'profile-store'));
assert.strictEqual(DEFAULTS.mediaAnalysisEnabled, false, 'media analysis disabled by default');

const { inferAccentKey, inferAccentMeta } = require(path.join(root, 'src', 'main', 'templates', 'template-accent'));
assert.equal(inferAccentKey('Vorlage-blau'), 'blue', 'infer blue from German name');
assert.equal(inferAccentMeta({ name: 'Vorlage-grün' }).accentHex, '#00c853', 'infer green hex');

const { buildTemplateLayoutHint } = require(path.join(root, 'src', 'main', 'generate', 'image-preflight'));
const hint = buildTemplateLayoutHint({ name: 'Vorlage-blau', accentHex: '#FFD700', categories: ['LAUTSPRECHER'] }, { layoutImageAttached: true });
assert(hint.includes('IMAGE 2 is authoritative'), 'layout image overrides metadata accent');
assert(!hint.includes('#FFD700'), 'no misleading yellow hex when image attached');

const { enrichTemplateMeta } = require(path.join(root, 'src', 'main', 'templates', 'template-accent'));
const enriched = enrichTemplateMeta({ name: 'Vorlage-blau', accent: 'yellow', accentHex: '#FFD700' });
assert.equal(enriched.accent, 'blue', 'enrich fixes stored yellow on blue template');

const { buildReferencePromptFromForm } = require(path.join(root, 'src', 'main', 'generate', 'prompt-builder'));
const stubRegistry = { resolveTemplatePath: () => 'C:\\tpl.png' };
const stub = buildReferencePromptFromForm(
  { brandName: 'tele', seriesName: 'Motion', tagline: 'Test', templateId: 't1', productCategory: 'LAUTSPRECHER' },
  { id: 't1' },
  stubRegistry,
  '',
  ['C:\\prod.png'],
);
assert.equal(stub.brandName, 'TELE', 'form stub uppercases brand');
assert.equal(stub.imagePrompt, '', 'no image prompt until generate');
assert(stub.preflightFingerprint.length === 64, 'preflight fingerprint set');

const waitStatusKeys = [
  'wait.status.preparingRefs',
  'wait.status.analyzingRef',
  'wait.status.buildingPrompt',
  'wait.status.imagePreflight',
];
for (const key of waitStatusKeys) {
  assert(de[key], `wait status i18n: ${key}`);
}

assert(fs.existsSync(path.join(root, 'src', 'main', 'bridge', 'bridge-job-progress.js')), 'bridge-job-progress.js exists');

const contextKeys = [
  'context.select', 'context.edit', 'context.rename', 'context.clone', 'context.delete',
  'context.import', 'context.addImages', 'context.remove', 'context.fullscreen',
  'context.exportPng', 'context.showInExplorer', 'context.acceptEdit', 'context.rejectEdit',
];
for (const key of contextKeys) {
  assert(de[key], `context menu i18n: ${key}`);
}

assert(fs.existsSync(path.join(root, 'src', 'renderer', 'context-menu.js')), 'context-menu.js exists');

const { frameByteSize, isImagePath } = require(path.join(root, 'src', 'main', 'generate', 'image-prep'));
assert(isImagePath('C:\\test\\photo.JPG'), 'isImagePath accepts jpg');
assert(!isImagePath('C:\\test\\doc.pdf'), 'isImagePath rejects pdf');
const smallFrame = 'data:image/jpeg;base64,' + 'A'.repeat(100);
assert(frameByteSize(smallFrame) > 0, 'frameByteSize works');

console.log('All basic tests passed.');
