'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const paths = require(path.join(root, 'src', 'main', 'paths'));
const {
  getPreferences,
  setPreferences,
  DEFAULT_AI_WATERMARK,
  DEFAULT_AI_WATERMARK_CORNER,
  normalizeAiWatermarkCorner,
} = require(path.join(root, 'src', 'main', 'app-preferences'));
const {
  applyAiWatermark,
  maybeApplyAiWatermark,
  defaultWatermarkOutputPath,
  resolveEuBasicIconPath,
  cornerOffset,
} = require(path.join(root, 'src', 'main', 'generate', 'ai-watermark'));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-ai-watermark-'));
const origUserData = paths.userDataRoot;
paths.userDataRoot = () => tmpDir;

(async () => {
  try {
    assert.equal(DEFAULT_AI_WATERMARK, true, 'default watermark preference is on');
    assert.equal(DEFAULT_AI_WATERMARK_CORNER, 'bottom-right');
    assert.equal(getPreferences('en').aiWatermark, true, 'missing key means watermark on');
    assert.equal(getPreferences('en').aiWatermarkCorner, 'bottom-right');
    assert.equal(normalizeAiWatermarkCorner('top-left'), 'top-left');
    assert.equal(normalizeAiWatermarkCorner('nope'), 'bottom-right');
    assert.ok(fs.existsSync(resolveEuBasicIconPath('white')), 'EU Basic white icon present');
    assert.ok(fs.existsSync(resolveEuBasicIconPath('white-50')), 'EU Basic white-50 icon present');

    setPreferences({ aiWatermark: false }, 'en');
    assert.equal(getPreferences('en').aiWatermark, false, 'can disable watermark');
    setPreferences({ aiWatermark: true, aiWatermarkCorner: 'top-left' }, 'en');
    assert.equal(getPreferences('en').aiWatermark, true, 'can re-enable watermark');
    assert.equal(getPreferences('en').aiWatermarkCorner, 'top-left');
    setPreferences({ aiWatermarkCorner: 'bottom-right' }, 'en');

    assert.deepStrictEqual(
      cornerOffset({
        corner: 'bottom-right',
        width: 400,
        height: 300,
        badgeWidth: 40,
        badgeHeight: 40,
        margin: 3,
      }),
      { left: 357, top: 257 },
    );
    assert.deepStrictEqual(
      cornerOffset({
        corner: 'top-left',
        width: 400,
        height: 300,
        badgeWidth: 40,
        badgeHeight: 40,
        margin: 3,
      }),
      { left: 3, top: 3 },
    );

    const srcPath = path.join(tmpDir, 'sample.png');
    await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 40, g: 120, b: 200 },
      },
    }).png().toFile(srcPath);

    const before = fs.readFileSync(srcPath);
    const beforeMeta = await sharp(srcPath).metadata();

    const stampedInPlace = await applyAiWatermark(srcPath, { corner: 'bottom-right' });
    assert.equal(stampedInPlace.applied, true);
    assert.ok(stampedInPlace.b64 && stampedInPlace.b64.length > 0, 'returns b64');
    assert.notDeepStrictEqual(fs.readFileSync(srcPath), before, 'in-place stamp changes pixels');

    // Restore clean source for sibling-path tests
    await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 40, g: 120, b: 200 },
      },
    }).png().toFile(srcPath);
    const cleanBytes = fs.readFileSync(srcPath);

    setPreferences({ aiWatermark: true, aiWatermarkCorner: 'top-right' }, 'en');
    const stamped = await maybeApplyAiWatermark(srcPath, { systemLocale: 'de' });
    assert.equal(stamped.applied, true);
    const wmPath = defaultWatermarkOutputPath(srcPath);
    assert.equal(stamped.path, wmPath, 'stamps sibling .wm.png');
    assert.equal(stamped.sourcePath, srcPath);
    assert.ok(fs.existsSync(wmPath), 'watermark file exists');
    assert.deepStrictEqual(fs.readFileSync(srcPath), cleanBytes, 'editable source unchanged');

    const afterMeta = await sharp(wmPath).metadata();
    assert.equal(afterMeta.width, beforeMeta.width, 'width unchanged');
    assert.equal(afterMeta.height, beforeMeta.height, 'height unchanged');

    setPreferences({ aiWatermark: false }, 'en');
    const skipPath = path.join(tmpDir, 'skip.png');
    fs.copyFileSync(srcPath, skipPath);
    const skipBefore = fs.readFileSync(skipPath);
    const skipped = await maybeApplyAiWatermark(skipPath, { systemLocale: 'en' });
    assert.equal(skipped.applied, false);
    assert.equal(skipped.b64, null);
    assert.deepStrictEqual(fs.readFileSync(skipPath), skipBefore, 'file unchanged when pref off');
    assert.ok(!fs.existsSync(defaultWatermarkOutputPath(skipPath)), 'no sibling when pref off');

    console.log('ai-watermark.test.js OK');
  } finally {
    paths.userDataRoot = origUserData;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
