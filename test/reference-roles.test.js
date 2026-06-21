'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const {
  normalizeReferenceRole,
  migrateReferenceImages,
  selectReferencesForWerbung,
  buildReferenceOrderBlock,
  resolvePrimaryDetailRef,
  layoutImageIndex,
} = require(path.join(root, 'src', 'main', 'generate', 'reference-roles'));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-ref-roles-'));

function touch(name) {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, 'fake');
  return filePath;
}

assert.equal(normalizeReferenceRole({ role: 'stage' }), 'stage');
assert.equal(normalizeReferenceRole({ role: 'unknown' }), 'detail');

const migrated = migrateReferenceImages([{ path: touch('a.png'), name: 'a.png' }]);
assert.equal(migrated[0].role, 'detail');

const speaker = touch('speaker.png');
const skull = touch('skull.png');
const mood = touch('mood.png');
const template = touch('template.png');

const refs = [
  { path: speaker, name: 'speaker.png', role: 'detail' },
  { path: skull, name: 'skull.png', role: 'stage' },
  { path: mood, name: 'mood.png', role: 'style' },
];

const primary = resolvePrimaryDetailRef(refs);
assert.equal(primary.path, path.resolve(speaker));

const selection = selectReferencesForWerbung(refs, {
  templatePath: template,
  maxSlots: 4,
});
assert.equal(selection.refs.length, 3, 'includes all product refs within budget');
assert.equal(selection.skipped.length, 0);
assert.equal(selection.layoutPath, path.resolve(template));
assert.equal(selection.attachmentPlan.length, 4);
assert.equal(layoutImageIndex(selection.attachmentPlan), 4);

const orderBlock = buildReferenceOrderBlock(selection.attachmentPlan);
assert(orderBlock.includes('Image 2 (stage element)'), 'stage role in prompt block');
assert(orderBlock.includes('Image 3 (style reference)'), 'style role in prompt block');
assert(orderBlock.includes('Image 4 (layout template)'), 'layout index in prompt block');

const extra = touch('extra.png');
const overflow = selectReferencesForWerbung([
  ...refs,
  { path: extra, name: 'extra.png', role: 'detail' },
], {
  templatePath: template,
  maxSlots: 4,
});
assert.equal(overflow.refs.length, 3);
assert.equal(overflow.skipped.length, 1);
assert.equal(overflow.skipped[0].reason, 'no_slot');

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('All reference-roles tests passed.');
