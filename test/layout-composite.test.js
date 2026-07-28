'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const paths = require(path.join(root, 'src', 'main', 'paths'));
const {
  scaleProductStage,
  compositeFrozenLayoutZones,
} = require(path.join(root, 'src', 'main', 'generate', 'layout-composite'));
const {
  normalizeTemplateStageMeta,
} = require(path.join(root, 'src', 'main', 'templates', 'template-registry'));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-layout-composite-'));
const origTempPreview = paths.tempPreviewDir;
paths.tempPreviewDir = () => tmpDir;

function pixelAt(raw, width, channels, x, y) {
  const idx = (y * width + x) * channels;
  return [raw[idx], raw[idx + 1], raw[idx + 2]];
}

(async () => {
  try {
    const scaled = scaleProductStage(
      { x: 100, y: 200, width: 1400, height: 800 },
      { width: 1600, height: 1200 },
      { width: 800, height: 600 },
    );
    assert.ok(scaled);
    assert.equal(scaled.width, 800);
    assert.equal(scaled.height, 600);
    assert.equal(scaled.left, 50);
    assert.equal(scaled.top, 100);
    assert.equal(scaled.extractWidth, 700);
    assert.equal(scaled.extractHeight, 400);

    const W = 200;
    const H = 100;
    const stage = { x: 20, y: 20, width: 160, height: 50 };

    const templatePath = path.join(tmpDir, 'template.png');
    const generatedPath = path.join(tmpDir, 'generated.png');
    const outPath = path.join(tmpDir, 'out.png');

    // Template: red header/footer; stage area green (will be overwritten)
    await sharp({
      create: {
        width: W,
        height: H,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .composite([{
        input: await sharp({
          create: {
            width: stage.width,
            height: stage.height,
            channels: 3,
            background: { r: 0, g: 255, b: 0 },
          },
        }).png().toBuffer(),
        left: stage.x,
        top: stage.y,
      }])
      .png()
      .toFile(templatePath);

    // Generated: entire canvas cyan — stage should keep cyan, frozen zones must stay red from template
    await sharp({
      create: {
        width: W,
        height: H,
        channels: 3,
        background: { r: 0, g: 255, b: 255 },
      },
    }).png().toFile(generatedPath);

    const result = await compositeFrozenLayoutZones({
      generatedPath,
      templatePath,
      template: { width: W, height: H, productStage: stage },
      templateDims: { width: W, height: H },
      outputSize: `${W}x${H}`,
      outPath,
    });

    assert.equal(result.applied, true, 'composite applied');
    assert.ok(fs.existsSync(result.path));
    assert.ok(result.b64);

    const { data, info } = await sharp(result.path).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;

    assert.deepEqual(pixelAt(data, W, ch, 100, 5), [255, 0, 0], 'header stays template red');
    assert.deepEqual(pixelAt(data, W, ch, 100, 90), [255, 0, 0], 'footer stays template red');
    assert.deepEqual(pixelAt(data, W, ch, 5, 40), [255, 0, 0], 'left margin stays template');
    assert.deepEqual(pixelAt(data, W, ch, 100, 40), [0, 255, 255], 'stage uses generated pixels');

    // Auto size must keep generated native dimensions (not force 1536x1024)
    const autoGen = path.join(tmpDir, 'auto-gen.png');
    const autoTpl = path.join(tmpDir, 'auto-tpl.png');
    const autoOut = path.join(tmpDir, 'auto-out.png');
    await sharp({
      create: { width: 640, height: 480, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).png().toFile(autoGen);
    await sharp({
      create: { width: 640, height: 480, channels: 3, background: { r: 200, g: 0, b: 0 } },
    }).png().toFile(autoTpl);
    const autoResult = await compositeFrozenLayoutZones({
      generatedPath: autoGen,
      templatePath: autoTpl,
      template: {
        width: 640,
        height: 480,
        productStage: { x: 40, y: 60, width: 560, height: 300 },
      },
      templateDims: { width: 640, height: 480 },
      outputSize: 'auto',
      outPath: autoOut,
    });
    assert.equal(autoResult.applied, true);
    assert.equal(autoResult.canvas.width, 640, 'auto uses generated width');
    assert.equal(autoResult.canvas.height, 480, 'auto uses generated height');

    // Mismatched aspect ratio must skip compositing (no stretch distortion)
    const mismatch = await compositeFrozenLayoutZones({
      generatedPath: autoGen,
      templatePath: autoTpl,
      template: {
        width: 640,
        height: 480,
        productStage: { x: 40, y: 60, width: 560, height: 300 },
      },
      templateDims: { width: 640, height: 480 },
      outputSize: '512x512',
      outPath: path.join(tmpDir, 'mismatch-out.png'),
    });
    assert.equal(mismatch.applied, false);
    assert.equal(mismatch.reason, 'aspect_mismatch');

    // Legacy unscaled default stage on a larger canvas must refit
    const legacy = normalizeTemplateStageMeta({
      width: 1920,
      height: 1080,
      productStage: { x: 48, y: 200, width: 1440, height: 580 },
    });
    assert.ok(legacy.productStage.width > 1440, 'larger canvas widens stage');
    assert.ok(
      legacy.productStage.x + legacy.productStage.width <= 1920,
      'refit stage fits larger canvas',
    );
    assert.notDeepEqual(
      legacy.productStage,
      { x: 48, y: 200, width: 1440, height: 580 },
      'legacy default stage is not left unscaled',
    );

    const skipped = await compositeFrozenLayoutZones({
      generatedPath,
      templatePath,
      template: { width: W, height: H },
      templateDims: { width: W, height: H },
      outputSize: `${W}x${H}`,
    });
    assert.equal(skipped.applied, false);
    assert.equal(skipped.reason, 'no_product_stage');

    console.log('layout-composite.test.js OK');
  } finally {
    paths.tempPreviewDir = origTempPreview;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
