'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const paths = require(path.join(root, 'src', 'main', 'paths'));
const {
  EFFECT_REFERENCE_MAX_EDGE,
  EFFECT_REFERENCE_MAX_BYTES,
} = require(path.join(root, 'src', 'main', 'generate', 'image-prep'));
const { prepareEffectReferencePath } = require(path.join(root, 'src', 'main', 'generate', 'image-preflight'));

(async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-effect-scale-'));
  const origUserData = paths.userDataRoot;
  paths.userDataRoot = () => tmpRoot;

  try {
    const smallPath = path.join(tmpRoot, 'small.png');
    await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 3,
        background: { r: 20, g: 20, b: 20 },
      },
    }).png().toFile(smallPath);

    const scaledSmall = await prepareEffectReferencePath(smallPath);
    assert.equal(path.resolve(scaledSmall), path.resolve(smallPath), 'small effect is not rescaled');

    const largePath = path.join(tmpRoot, 'large.png');
    await sharp({
      create: {
        width: 2048,
        height: 1536,
        channels: 3,
        background: { r: 200, g: 40, b: 10 },
      },
    }).png().toFile(largePath);

    const scaledLarge = await prepareEffectReferencePath(largePath);
    assert.notEqual(path.resolve(scaledLarge), path.resolve(largePath), 'large effect is rescaled');
    assert.ok(fs.existsSync(scaledLarge), 'scaled effect file exists');
    assert.ok(scaledLarge.endsWith('.jpg'), 'scaled effect is JPEG');

    const meta = await sharp(scaledLarge).metadata();
    assert.ok(Math.max(meta.width || 0, meta.height || 0) <= EFFECT_REFERENCE_MAX_EDGE,
      'scaled effect fits max edge');
    assert.ok(fs.statSync(scaledLarge).size < fs.statSync(largePath).size,
      'scaled effect is smaller than source');

    const scaledAgain = await prepareEffectReferencePath(largePath);
    assert.equal(scaledAgain, scaledLarge, 'scaled effect path is cached');

    const widePath = path.join(tmpRoot, 'wide.png');
    await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 10, g: 120, b: 200, alpha: 1 },
      },
    }).png({ compressionLevel: 0 }).toFile(widePath);
    if (fs.statSync(widePath).size <= EFFECT_REFERENCE_MAX_BYTES) {
      console.log('effect-reference-scale.test.js OK (byte-only case skipped on this platform)');
      return;
    }

    const scaledWide = await prepareEffectReferencePath(widePath);
    assert.notEqual(path.resolve(scaledWide), path.resolve(widePath), 'byte-heavy effect is rescaled');
    assert.ok(fs.statSync(scaledWide).size < fs.statSync(widePath).size,
      'byte-heavy effect is reduced');

    console.log('effect-reference-scale.test.js OK');
  } finally {
    paths.userDataRoot = origUserData;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
