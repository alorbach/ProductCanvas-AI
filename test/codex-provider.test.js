'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const paths = require(path.join(root, 'src', 'main', 'paths'));
const { createCodexProvider } = require(path.join(root, 'src', 'main', 'bridge', 'codex-provider'));
const { getPreferences, setPreferences } = require(path.join(root, 'src', 'main', 'app-preferences'));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-codex-provider-'));
const origUserData = paths.userDataRoot;
paths.userDataRoot = () => tmpDir;

const mockBridge = {
  getStatus: async () => ({ success: true }),
  getCapabilities: async () => ({ features: { image_reference_attachments: true } }),
  chat: async () => ({ response: { choices: [{ message: { content: 'ok' } }] } }),
  images: async () => ({ response: { data: [{ b64_json: 'abc' }] } }),
  mediaAnalyze: async () => ({ response: { choices: [{ message: { content: 'ok' } }] } }),
  abort: () => true,
  subscribeJobEvents: () => () => {},
  _capabilities: { features: { image_reference_attachments: true } },
};

const mockCli = {
  getStatus: async () => ({ success: true }),
  getCapabilities: async () => ({ features: { image_reference_attachments: true, image_masks: false } }),
  chat: async () => ({ response: { choices: [{ message: { content: 'cli' } }] } }),
  images: async () => ({ response: { data: [{ b64_json: 'def' }] } }),
  mediaAnalyze: async () => ({ response: { choices: [{ message: { content: 'cli' } }] } }),
  abort: () => true,
  subscribeJobEvents: () => () => {},
  supportsImageReferenceAttachments: () => true,
  supportsImageMasks: () => false,
};

(async () => {
  try {
    setPreferences({ codexBackend: 'direct' }, 'en');
    const router = createCodexProvider(mockBridge, {
      cliClient: mockCli,
      systemLocaleFn: () => 'en',
    });

    assert.equal(router.resolveBackend(), 'direct', 'defaults to direct backend');
    assert.equal(router.active().backend, 'direct');

    setPreferences({ codexBackend: 'bridge' }, 'en');
    assert.equal(router.resolveBackend(), 'bridge', 'reads bridge backend from preferences');
    assert.equal(router.active().backend, 'bridge');

    const chat = await router.chat({ messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(chat.response.choices[0].message.content, 'ok', 'bridge chat when bridge backend selected');

    setPreferences({ codexBackend: 'direct' }, 'en');
    const cliChat = await router.chat({ messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(cliChat.response.choices[0].message.content, 'cli', 'direct chat when direct backend selected');

    assert.equal(getPreferences('en').codexBackend, 'direct');
    console.log('codex-provider.test.js OK');
  } finally {
    paths.userDataRoot = origUserData;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
