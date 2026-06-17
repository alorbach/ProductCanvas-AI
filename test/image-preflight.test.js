'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const {
  buildReferenceImageEntries,
  buildPreflightMessages,
  chatModelUsesResponsesContentParts,
  computePreflightFingerprint,
  gatewayErrorNeedsResponsesContentParts,
} = require(path.join(root, 'src', 'main', 'generate', 'image-preflight'));
const { BridgeClient } = require(path.join(root, 'src', 'main', 'bridge', 'bridge-client'));

(async () => {
  const entries = await buildReferenceImageEntries({ productPath: '', layoutPath: '' });
  assert.equal(entries.length, 0, 'empty paths yield no entries');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-preflight-'));
  const productPath = path.join(tmpDir, 'product.png');
  const layoutPath = path.join(tmpDir, 'layout.png');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  fs.writeFileSync(productPath, png);
  fs.writeFileSync(layoutPath, png);

  const built = await buildReferenceImageEntries({ productPath, layoutPath });
  assert.equal(built.length, 2, 'product + layout entries');
  assert.equal(built[0].label, 'product', 'product first');
  assert.equal(built[1].label, 'layout', 'layout second');
  assert(built[0].b64_json.length > 10, 'product has b64');
  assert.equal(built[0].mime_type, 'image/png', 'png mime preserved');

  const messages = buildPreflightMessages('Create ad', built);
  const imageParts = messages[1].content.filter((p) => p.type === 'input_image' || p.type === 'image_url');
  assert.equal(imageParts.length, 2, 'two images in preflight message');
  assert.equal(messages[1].content[0].type, 'input_text', 'codex uses input_text');

  const legacyMessages = buildPreflightMessages('Create ad', built, {
    model: 'gpt-4o',
    useResponsesContentParts: false,
  });
  assert.equal(legacyMessages[1].content[0].type, 'text', 'legacy text parts');
  assert.equal(legacyMessages[1].content[1].type, 'image_url', 'legacy image_url parts');

  assert(chatModelUsesResponsesContentParts('codex-local:auto'), 'codex model uses responses parts');
  assert(!chatModelUsesResponsesContentParts('gpt-4o'), 'gpt-4o uses chat parts');
  const gatewayErr = new Error("invalid value: 'text'");
  gatewayErr.details = { hint: 'expected input_text or input_image' };
  assert(gatewayErrorNeedsResponsesContentParts(gatewayErr), 'detect responses content part mismatch');

  const fingerprint = computePreflightFingerprint(
    { templateId: 'tpl-1', brandName: 'TELE' },
    layoutPath,
    [productPath],
  );
  assert.equal(fingerprint.length, 64, 'sha256 hex fingerprint');

  let callIndex = 0;
  const client = new BridgeClient('http://127.0.0.1:1');
  client.fetchJson = async () => {
    callIndex += 1;
    if (callIndex < 3) {
      const err = new Error('bad request');
      err.status = 400;
      throw err;
    }
    return { response: { data: [{ b64_json: 'x' }] } };
  };
  client.jobEnvelope = async (_type, body) => body;

  const result = await client.images({
    prompt: 'test',
    reference_images: [{ b64_json: 'a', mime_type: 'image/jpeg' }],
    referenced_image_paths: ['C:\\a.png'],
    frames: ['data:image/jpeg;base64,b'],
    requireReferences: true,
  }, 'sig-test');

  assert.equal(result._attachmentMode, 'frames', 'third attempt succeeds');
  assert.equal(callIndex, 3, 'tried referenced_image_paths, reference_images, frames');

  let promptOnlyThrown = false;
  const strictClient = new BridgeClient('http://127.0.0.1:1');
  strictClient.fetchJson = async () => {
    const err = new Error('bad request');
    err.status = 400;
    throw err;
  };
  strictClient.jobEnvelope = async (_type, body) => body;

  try {
    await strictClient.images({
      prompt: 'test',
      reference_images: [{ b64_json: 'a', mime_type: 'image/jpeg' }],
      requireReferences: true,
    }, 'sig-strict');
  } catch (err) {
    promptOnlyThrown = err.code === 'REFERENCE_ATTACH_FAILED';
  }
  assert(promptOnlyThrown, 'no prompt-only fallback when requireReferences');

  let capabilitiesCalled = false;
  const capClient = new BridgeClient('http://127.0.0.1:1');
  capClient.fetchJson = async (route) => {
    if (route === '/v1/capabilities') {
      capabilitiesCalled = true;
      return {
        features: { image_reference_attachments: true },
        bridge: { version: '1.0.4' },
      };
    }
    return {
      response: {
        data: [{ b64_json: 'x' }],
        provider_details: {
          reference_attachment_count: 2,
          refs_forwarded_to_codex: true,
        },
      },
    };
  };
  capClient.jobEnvelope = async (_type, body) => body;
  const capResult = await capClient.images({
    prompt: 'test',
    reference_images: [{ b64_json: 'a', mime_type: 'image/jpeg' }],
    requireReferences: true,
  }, 'sig-cap');
  assert.equal(capResult._refsForwardedToCodex, true, 'refs forwarded flag from provider_details');
  assert.equal(capResult._referenceAttachmentCount, 2, 'attachment count from provider_details');
  const caps = await capClient.getCapabilities();
  assert(capabilitiesCalled, 'getCapabilities fetches /v1/capabilities');
  assert.equal(caps.bridge.version, '1.0.4', 'capabilities bridge version');
  assert(capClient.supportsImageReferenceAttachments(), 'supportsImageReferenceAttachments');

  const de = JSON.parse(fs.readFileSync(path.join(root, 'src', 'renderer', 'i18n', 'de.json'), 'utf8'));
  assert(de['error.referenceAttachFailed'], 'i18n attach error key');
  assert(de['wait.status.imagePreflight'], 'i18n preflight wait key');
  assert(de['debug.attachmentMode'], 'i18n attachment mode key');
  assert(de['debug.refsForwarded'], 'i18n refs forwarded key');
  assert(de['debug.refsNotForwarded'], 'i18n refs not forwarded key');

  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log('All image-preflight tests passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
