'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const {
  summarizeReferencePrep,
  referencePrepFromEntry,
  emitReferencePrepProgress,
} = require(path.join(root, 'src', 'main', 'generate', 'reference-prep-report'));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-ref-prep-report-'));

try {
  const originalPath = path.join(tmpDir, 'speaker-photo.png');
  const preparedPath = path.join(tmpDir, 'ref-scaled.jpg');
  fs.writeFileSync(originalPath, Buffer.alloc(500_000, 1));
  fs.writeFileSync(preparedPath, Buffer.alloc(240_000, 2));

  const unchanged = summarizeReferencePrep({
    label: 'product',
    sourcePath: originalPath,
    preparedPath: originalPath,
    originalWidth: 1200,
    originalHeight: 800,
    width: 1200,
    height: 800,
    byteBudget: 360_000,
  });
  assert.equal(unchanged.fileName, 'speaker-photo.png');
  assert.equal(unchanged.scaled, false);
  assert.equal(unchanged.originalBytes, 500_000);

  const scaled = summarizeReferencePrep({
    label: 'layout',
    sourcePath: originalPath,
    preparedPath,
    originalWidth: 1448,
    originalHeight: 1086,
    width: 1448,
    height: 1086,
    byteBudget: 360_000,
  });
  assert.equal(scaled.fileName, 'speaker-photo.png');
  assert.equal(scaled.scaled, true);
  assert.equal(scaled.originalBytes, 500_000);
  assert.equal(scaled.preparedBytes, 240_000);
  assert.equal(scaled.originalSize, '1448×1086');
  assert.ok(!scaled.fileName.includes('\\') && !scaled.fileName.includes('/'));

  const fromEntry = referencePrepFromEntry({
    label: 'product',
    source_path: originalPath,
    path: preparedPath,
    original_width: 1535,
    original_height: 1024,
    width: 1535,
    height: 1024,
    byteBudget: 363216,
    prep: scaled,
  });
  assert.deepStrictEqual(fromEntry, scaled);

  let emitted = null;
  emitReferencePrepProgress((payload) => { emitted = payload; }, [{
    label: 'product',
    prep: scaled,
  }], { effectApplied: true, effectCompositeCached: true });
  assert.equal(emitted.messageKey, 'wait.status.preparingRefs');
  assert.equal(emitted.referencePrep.length, 1);
  assert.equal(emitted.effectApplied, true);
  assert.equal(emitted.effectCompositeCached, true);

  console.log('reference-prep-report.test.js OK');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
