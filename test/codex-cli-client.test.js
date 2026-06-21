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

    console.log('codex-cli-client.test.js OK');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
