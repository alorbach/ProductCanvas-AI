'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const {
  collectImageAttachments,
  imagePrompt,
  buildChatPrompt,
  probeCapabilities,
  listGeneratedImages,
  resolveGeneratedImagePath,
  isBenignCodexStderr,
  imageFailureErrorMessage,
} = require(path.join(root, 'src', 'main', 'bridge', 'codex-cli-client'));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-cli-client-'));

(async () => {
  try {
    const attachments = await collectImageAttachments({
      reference_images: [{
        b64_json: Buffer.from('fakepng').toString('base64'),
        mime_type: 'image/png',
        label: 'product',
      }],
      referenced_image_paths: [],
      frames: [],
    }, tempDir);

    assert.equal(attachments.length, 1, 'reference image decoded to temp file');
    assert.ok(fs.existsSync(attachments[0].path));

    const prompt = imagePrompt({
      prompt: 'test',
      size: '1024x1024',
      quality: 'high',
      attachment_plan: [
        { imageIndex: 1, role: 'detail', label: 'product', isPrimaryDetail: true },
        { imageIndex: 2, role: 'layout', label: 'layout', isPrimaryDetail: false },
      ],
    }, attachments, '');
    assert.ok(prompt.includes('User prompt: test'));
    assert.ok(prompt.includes('Image 1'));
    assert.ok(prompt.includes('ATTACHED REFERENCE IMAGES'), 'role order block included');
    assert.ok(prompt.includes('Save the final generated image as a file under:'), 'save path instruction included');

    const outputDir = path.join(tempDir, 'generated-images');
    const savePathPrompt = imagePrompt({ prompt: 'save test', size: '1024x1024' }, [], '', outputDir);
    assert.ok(savePathPrompt.includes(outputDir), 'custom output dir passed to prompt');

    const maskedPrompt = imagePrompt({ prompt: 'edit stage', size: '1024x1024' }, attachments, '/tmp/mask.png');
    assert.ok(maskedPrompt.includes('layout mask'), 'mask hint included when mask path set');

    const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const dataUrl = `data:image/png;base64,${tinyPng}`;
    const chat = await buildChatPrompt([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Analyze this product.' },
          { type: 'input_image', image_url: dataUrl },
        ],
      },
    ], 1024, tempDir, []);

    assert.equal(chat.attachments.length, 1, 'chat inline image becomes attachment');
    assert.ok(!chat.prompt.includes('data:image'), 'chat prompt does not embed base64 data URLs');
    assert.ok(chat.prompt.includes('[Image 1 attached]'), 'chat prompt references attached image');

    const refPng = path.join(tempDir, 'ref-source.png');
    fs.writeFileSync(refPng, Buffer.from(tinyPng, 'base64'));
    const pathOnlyChat = await buildChatPrompt([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Analyze this product.' },
          { type: 'input_image', image_url: dataUrl },
        ],
      },
    ], 1024, tempDir, [refPng]);

    assert.equal(pathOnlyChat.attachments.length, 1, 'path-only chat uses referenced paths instead of inline decode');
    assert.ok(pathOnlyChat.attachments[0].path.includes('ref-source.png')
      || pathOnlyChat.attachments[0].path.includes('ref-'),
      'path-only chat attachment comes from referenced path');
    assert.ok(!pathOnlyChat.prompt.includes('data:image'), 'path-only chat prompt has no inline base64');

    const caps = probeCapabilities();
    assert.ok(typeof caps.features.image_reference_attachments === 'boolean');
    assert.ok(typeof caps.features.image_masks === 'boolean');

    const tinyPngBuffer = Buffer.from(tinyPng, 'base64');
    const genDir = path.join(tempDir, 'gen-images');
    const workDir = path.join(tempDir, 'work');
    fs.mkdirSync(genDir, { recursive: true });
    fs.mkdirSync(workDir, { recursive: true });
    const runStartMs = Date.now();

    const beforeEmpty = listGeneratedImages(genDir);
    assert.equal(beforeEmpty.length, 0);

    const newGenPath = path.join(genDir, 'new-output.png');
    fs.writeFileSync(newGenPath, tinyPngBuffer);
    const afterNew = listGeneratedImages(genDir);
    const resolvedNew = resolveGeneratedImagePath({
      before: beforeEmpty,
      after: afterNew,
      tempDir: workDir,
      runStartMs,
    });
    assert.equal(resolvedNew?.source, 'generated_images_new');
    assert.equal(resolvedNew?.path, newGenPath);

    const existingPath = path.join(genDir, 'existing.png');
    fs.writeFileSync(existingPath, tinyPngBuffer);
    const beforeExisting = listGeneratedImages(genDir);
    const touchStart = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 5));
    fs.writeFileSync(existingPath, Buffer.concat([tinyPngBuffer, Buffer.from([0])]));
    const afterTouch = listGeneratedImages(genDir);
    const resolvedTouch = resolveGeneratedImagePath({
      before: beforeExisting,
      after: afterTouch,
      tempDir: workDir,
      runStartMs: touchStart,
    });
    assert.equal(resolvedTouch?.source, 'generated_images_mtime');
    assert.equal(resolvedTouch?.path, existingPath);

    const inputPath = path.join(workDir, 'input-image-1.jpg');
    fs.writeFileSync(inputPath, tinyPngBuffer);
    const outputPath = path.join(workDir, 'output', 'imagegen', 'result.png');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const tempStart = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 5));
    fs.writeFileSync(outputPath, tinyPngBuffer);
    const resolvedTemp = resolveGeneratedImagePath({
      before: [],
      after: [],
      tempDir: workDir,
      runStartMs: tempStart,
    });
    assert.equal(resolvedTemp?.source, 'temp_dir');
    assert.equal(resolvedTemp?.path, outputPath);

    const resolvedNone = resolveGeneratedImagePath({
      before: beforeExisting,
      after: beforeExisting,
      tempDir: path.join(tempDir, 'empty-work'),
      runStartMs: Date.now(),
    });
    assert.equal(resolvedNone, null);

    assert.ok(isBenignCodexStderr('Reading prompt from stdin...'));
    assert.ok(!isBenignCodexStderr('fatal: auth failed'));

    const failure = {
      code: 'codex_no_image_output',
      message: 'Codex CLI completed, but no new generated image file was detected.',
    };
    const benignRun = { status: 0, stderr: 'Reading prompt from stdin...' };
    assert.equal(
      imageFailureErrorMessage(benignRun, failure),
      failure.message,
      'benign stderr must not become user-facing error',
    );

    const realErrRun = { status: 1, stderr: 'fatal: permission denied' };
    assert.equal(imageFailureErrorMessage(realErrRun, failure), 'fatal: permission denied');

    console.log('codex-cli-client.test.js OK');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
