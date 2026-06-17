'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const paths = require(path.join(root, 'src', 'main', 'paths'));
const {
  DEFAULT_BRIDGE_URL,
  isPathInside,
  normalizeBridgeUrl,
  isAllowedReadPath,
  isAllowedExportSource,
} = require(path.join(root, 'src', 'main', 'safe-paths'));

assert.strictEqual(normalizeBridgeUrl('http://127.0.0.1:8765/'), 'http://127.0.0.1:8765');
assert.strictEqual(normalizeBridgeUrl('ftp://evil.test'), DEFAULT_BRIDGE_URL);
assert.strictEqual(normalizeBridgeUrl('not-a-url'), DEFAULT_BRIDGE_URL);
assert.strictEqual(normalizeBridgeUrl(''), DEFAULT_BRIDGE_URL);
assert.strictEqual(normalizeBridgeUrl('https://localhost:9999/bridge'), 'https://localhost:9999/bridge');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-safe-paths-'));
const origUserData = paths.userDataRoot;
paths.userDataRoot = () => tmpDir;

try {
  const userFile = path.join(tmpDir, 'templates', 'tpl.png');
  fs.mkdirSync(path.dirname(userFile), { recursive: true });
  fs.writeFileSync(userFile, 'png');

  const outsideFile = path.join(os.tmpdir(), 'pcai-outside.png');
  fs.writeFileSync(outsideFile, 'png');

  assert(isPathInside(tmpDir, userFile), 'file inside userData');
  assert(!isPathInside(tmpDir, outsideFile), 'file outside userData');
  const traversalAttempt = path.resolve(tmpDir, '..', '..', 'etc', 'passwd');
  assert(!isPathInside(tmpDir, traversalAttempt), 'traversal outside root denied');

  assert(isAllowedReadPath(userFile, { session: {} }), 'userData path allowed');
  assert(!isAllowedReadPath(outsideFile, { session: {} }), 'outside path denied without session ref');

  const sessionRef = path.join(os.tmpdir(), 'session-ref.png');
  assert(
    isAllowedReadPath(sessionRef, { session: { referenceImages: [{ path: sessionRef }] } }),
    'session reference path allowed',
  );

  const previewDir = paths.tempPreviewDir();
  fs.mkdirSync(previewDir, { recursive: true });
  const previewFile = path.join(previewDir, 'preview-1.png');
  fs.writeFileSync(previewFile, 'png');
  assert(isAllowedExportSource(previewFile), 'temp preview export allowed');
  assert(!isAllowedExportSource(outsideFile), 'outside export denied');
} finally {
  paths.userDataRoot = origUserData;
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(path.join(os.tmpdir(), 'pcai-outside.png'), { force: true });
}

console.log('All safe-paths tests passed.');
