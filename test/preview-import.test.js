'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const paths = require(path.join(root, 'src', 'main', 'paths'));
const { importPreviewFromPaths } = require(path.join(root, 'src', 'main', 'generate', 'preview-import'));
const { isAllowedExportSource } = require(path.join(root, 'src', 'main', 'safe-paths'));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-preview-import-'));
const previewDir = path.join(tmpDir, 'temp-previews');
fs.mkdirSync(previewDir, { recursive: true });
paths.tempPreviewDir = () => previewDir;

const sourcePath = path.join(tmpDir, 'source.png');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
fs.writeFileSync(sourcePath, png);

const imported = importPreviewFromPaths([sourcePath]);
assert(imported?.path, 'imports first valid image');
assert(imported.path.includes('preview-import-'), 'uses preview-import prefix');
assert(fs.existsSync(imported.path), 'copied file exists');
assert(isAllowedExportSource(imported.path), 'imported preview is allowed for edit/export');

assert.equal(importPreviewFromPaths(['C:\\missing.png']), null, 'missing file rejected');
assert.equal(importPreviewFromPaths(['C:\\bad.txt']), null, 'non-image rejected');

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('All preview-import tests passed.');
