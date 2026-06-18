'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const paths = require(path.join(root, 'src', 'main', 'paths'));
const { buildStageMaskPath, parseSize } = require(path.join(root, 'src', 'main', 'generate', 'stage-mask'));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-stage-mask-'));
const origTempPreview = paths.tempPreviewDir;
paths.tempPreviewDir = () => tmpDir;

(async () => {
  try {
    const parsed = parseSize('800x600');
    assert.equal(parsed.width, 800);
    assert.equal(parsed.height, 600);

    const template = {
      id: 't1',
      width: 1600,
      height: 1200,
      productStage: { x: 100, y: 200, width: 1400, height: 800 },
    };
    const maskPath = await buildStageMaskPath(template, { width: 1600, height: 1200 }, '800x600');
    assert.ok(maskPath && fs.existsSync(maskPath), 'mask file created');

    const meta = await sharp(maskPath).metadata();
    assert.equal(meta.width, 800);
    assert.equal(meta.height, 600);
    assert.equal(meta.channels, 4, 'mask has alpha channel');

    const { data, info } = await sharp(maskPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    const sampleEditable = data[((250 * 800) + 400) * channels + 3];
    const sampleProtected = data[((50 * 800) + 50) * channels + 3];
    assert.equal(sampleEditable, 255, 'stage center is opaque');
    assert.equal(sampleProtected, 0, 'header area is transparent');

    console.log('stage-mask.test.js OK');
  } finally {
    paths.tempPreviewDir = origTempPreview;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
