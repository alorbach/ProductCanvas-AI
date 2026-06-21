'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const paths = require(path.join(root, 'src', 'main', 'paths'));
const {
  PRODUCT_REFERENCE_MAX_EDGE,
  computePerAttachmentByteBudget,
  estimateBase64Chars,
} = require(path.join(root, 'src', 'main', 'generate', 'image-prep'));
const {
  prepareProductReferencePath,
  buildReferenceImageEntry,
} = require(path.join(root, 'src', 'main', 'generate', 'image-preflight'));

(async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-product-scale-'));
  const origUserData = paths.userDataRoot;
  paths.userDataRoot = () => tmpRoot;

  try {
    const smallPath = path.join(tmpRoot, 'small.png');
    await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 3,
        background: { r: 30, g: 30, b: 30 },
      },
    }).png().toFile(smallPath);

    const byteBudget = computePerAttachmentByteBudget(1);
    const scaledSmall = await prepareProductReferencePath(smallPath, { byteBudget, label: 'small' });
    assert.equal(path.resolve(scaledSmall), path.resolve(smallPath), 'small product ref is not rescaled');

    const largePath = path.join(tmpRoot, 'large.png');
    await sharp({
      create: {
        width: 2048,
        height: 1536,
        channels: 3,
        background: { r: 180, g: 60, b: 20 },
      },
    }).png().toFile(largePath);

    const scaledLarge = await prepareProductReferencePath(largePath, { byteBudget, label: 'large' });
    assert.notEqual(path.resolve(scaledLarge), path.resolve(largePath), 'large product ref is rescaled');
    assert.ok(fs.existsSync(scaledLarge), 'scaled product ref exists');
    assert.ok(scaledLarge.endsWith('.jpg'), 'scaled product ref is JPEG');

    const meta = await sharp(scaledLarge).metadata();
    assert.ok(Math.max(meta.width || 0, meta.height || 0) <= PRODUCT_REFERENCE_MAX_EDGE,
      'scaled product ref fits max edge');
    assert.ok(fs.statSync(scaledLarge).size <= byteBudget, 'scaled product ref fits byte budget');
    assert.ok(estimateBase64Chars(fs.statSync(scaledLarge).size) < 1_048_576,
      'scaled product ref fits Codex char budget alone');

    const scaledAgain = await prepareProductReferencePath(largePath, { byteBudget, label: 'large' });
    assert.equal(scaledAgain, scaledLarge, 'scaled product ref path is cached');

    const twoBudget = computePerAttachmentByteBudget(2);
    const entryA = await buildReferenceImageEntry(largePath, 'product', {
      byteBudget: twoBudget,
      attachmentCount: 2,
    });
    const entryB = await buildReferenceImageEntry(largePath, 'layout', {
      byteBudget: twoBudget,
      attachmentCount: 2,
    });
    assert.ok(entryA?.b64_json, 'encoded product entry has base64');
    assert.ok(entryB?.b64_json, 'encoded layout entry has base64');
    const encodedBytes = Buffer.from(entryA.b64_json, 'base64').length;
    assert.ok(encodedBytes <= twoBudget, 'two-attachment budget respected for product entry');
    assert.ok(Buffer.from(entryB.b64_json, 'base64').length <= twoBudget,
      'two-attachment budget respected for layout entry');

    console.log('product-reference-scale.test.js OK');
  } finally {
    paths.userDataRoot = origUserData;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
