'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const {
  collectImageAttachments,
  imagePrompt,
  probeCapabilities,
} = require(path.join(root, 'src', 'main', 'bridge', 'codex-cli-client'));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-cli-client-'));

try {
  const attachments = collectImageAttachments({
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

  const prompt = imagePrompt({ prompt: 'test', size: '1024x1024', quality: 'high' }, attachments, '');
  assert.ok(prompt.includes('User prompt: test'));
  assert.ok(prompt.includes('Image 1'));

  const maskedPrompt = imagePrompt({ prompt: 'edit stage', size: '1024x1024' }, attachments, '/tmp/mask.png');
  assert.ok(maskedPrompt.includes('layout mask'), 'mask hint included when mask path set');

  const caps = probeCapabilities();
  assert.ok(typeof caps.features.image_reference_attachments === 'boolean');
  assert.ok(typeof caps.features.image_masks === 'boolean');

  console.log('codex-cli-client.test.js OK');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
