'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const { EffectEditPipeline, buildEffectEditReferences } = require(path.join(root, 'src', 'main', 'generate', 'effect-edit-pipeline'));
const { isFormatOnlyEdit } = require(path.join(root, 'src', 'main', 'generate', 'template-edit-pipeline'));
const { buildEffectEditRules, LAYOUT_FROZEN_RULES } = require(path.join(root, 'src', 'main', 'generate', 'layout-fidelity'));

const changeRequest = 'Flammen intensiver und orange Leuchten verstärken';
const editRules = buildEffectEditRules(changeRequest, { size: '1024x1024' });
assert(editRules.includes(changeRequest), 'edit rules include change request');
assert(editRules.includes('1024x1024'), 'edit rules include target size');
assert(editRules.includes('EFFECT IMAGE RULES'), 'edit rules include effect rules');
assert(!editRules.includes('FROZEN'), 'effect edit rules exclude layout frozen block');
assert(!LAYOUT_FROZEN_RULES || !editRules.includes(LAYOUT_FROZEN_RULES.split('\n')[0]), 'no layout frozen rules');

const styleRules = buildEffectEditRules('Hintergrund wie IMAGE 2', { size: '1024x1024' }, { hasStyleReference: true });
assert(styleRules.includes('IMAGE 2'), 'style rules mention IMAGE 2');
assert(styleRules.includes('style/visual reference'), 'style rules describe style reference');

class MockRegistry {
  constructor(effectPath) {
    this.effect = {
      id: 'eff-1',
      name: 'Test-Effekt',
      file: 'test.png',
      width: 1024,
      height: 1024,
    };
    this.effectPath = effectPath;
  }

  getById() { return this.effect; }
  resolveEffectPath() { return this.effectPath; }
  async getDimensions() { return { width: 1024, height: 1024 }; }
}

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-eff-edit-'));
  const effectPath = path.join(tmpDir, 'effect.png');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  fs.writeFileSync(effectPath, png);

  let chatCalled = false;
  let chatPayload = null;
  let imagesPayload = null;
  const client = {
    async getCapabilities() {
      return { features: { image_reference_attachments: true } };
    },
    async chat(body) {
      chatCalled = true;
      chatPayload = body;
      const userContent = body.messages[1].content;
      const textPart = userContent.find((p) => p.type === 'input_text' || p.type === 'text');
      assert(textPart.text.includes(changeRequest), 'chat task includes change request');
      const imageParts = userContent.filter((p) => p.type === 'input_image' || p.type === 'image_url');
      assert.equal(imageParts.length, 0, 'chat uses path attachments instead of inline images');
      assert.equal(body.referenced_image_paths.length, 1, 'chat sends effect path');
      return {
        response: {
          choices: [{
            message: {
              content: JSON.stringify({
                optimizedEditPrompt: 'Intensify flames and orange glow only.',
                changeSummary: 'Flammen verstärkt.',
                preservedElements: ['Background', 'Texture'],
              }),
            },
          }],
        },
      };
    },
    async images(payload) {
      imagesPayload = payload;
      return {
        response: {
          data: [{ b64_json: png.toString('base64') }],
          provider_details: { reference_attachment_count: 1, refs_forwarded_to_codex: true },
        },
        _attachmentMode: 'reference_images',
      };
    },
  };

  const pipeline = new EffectEditPipeline(client, new MockRegistry(effectPath));
  const result = await pipeline.runEffectEdit(
    { effectId: 'eff-1', changeRequest, quality: 'high' },
    () => {},
    'sig-test',
  );

  assert(chatCalled, 'chat optimization called');
  assert(chatPayload, 'chat payload captured');
  assert(imagesPayload, 'images generation called');
  assert(!imagesPayload.reference_images, 'images use paths only for effect edit');
  assert.equal(imagesPayload.referenced_image_paths.length, 1, 'effect path attached');
  assert.equal(imagesPayload.size, '1024x1024', 'api size matches effect dimensions');
  assert.equal(imagesPayload.quality, 'high', 'quality normalized');
  assert(!imagesPayload.prompt.includes('FROZEN'), 'final image prompt excludes frozen layout block');
  assert(imagesPayload.prompt.includes('EFFECT IMAGE RULES') || imagesPayload.prompt.includes('background'), 'final prompt includes effect constraints');
  assert(result.previewPath && fs.existsSync(result.previewPath), 'preview file written');
  assert.equal(result.effectWidth, 1024, 'result reports effect width');
  assert.equal(result.effectHeight, 1024, 'result reports effect height');

  if (result.previewPath && fs.existsSync(result.previewPath)) {
    try { fs.unlinkSync(result.previewPath); } catch { /* ignore */ }
  }

  const stylePath = path.join(tmpDir, 'style-ref.png');
  fs.writeFileSync(stylePath, png);
  let styleChatPaths = 0;
  let styleImagesPayload = null;
  const styleClient = {
    async getCapabilities() {
      return { features: { image_reference_attachments: true } };
    },
    async chat(body) {
      const userContent = body.messages[1].content;
      const textPart = userContent.find((p) => p.type === 'input_text' || p.type === 'text');
      assert(textPart.text.includes('IMAGE 2'), 'style chat task mentions IMAGE 2');
      styleChatPaths = body.referenced_image_paths?.length || 0;
      return {
        response: {
          choices: [{
            message: {
              content: JSON.stringify({
                optimizedEditPrompt: 'Adjust effect atmosphere using mood from IMAGE 2.',
                changeSummary: 'Atmosphäre angepasst.',
                preservedElements: ['Background'],
              }),
            },
          }],
        },
      };
    },
    async images(payload) {
      styleImagesPayload = payload;
      return {
        response: {
          data: [{ b64_json: png.toString('base64') }],
          provider_details: { reference_attachment_count: 2, refs_forwarded_to_codex: true },
        },
        _attachmentMode: 'reference_images',
      };
    },
  };

  const styleResult = await new EffectEditPipeline(styleClient, new MockRegistry(effectPath)).runEffectEdit(
    {
      effectId: 'eff-1',
      changeRequest: 'Atmosphäre wie im Referenzbild',
      quality: 'high',
      referenceImagePath: stylePath,
    },
    () => {},
    'sig-style',
  );
  assert.equal(styleChatPaths, 2, 'style edit chat has two path attachments');
  assert(!styleImagesPayload.reference_images, 'style edit images payload uses paths only');
  assert.equal(styleImagesPayload.referenced_image_paths.length, 2, 'style edit paths include effect and style');
  assert(styleImagesPayload.prompt.includes('visual style reference') || styleImagesPayload.prompt.includes('IMAGE 2'), 'style hint in image prompt');
  assert.equal(styleResult.referenceImagePath, stylePath, 'result stores reference path');

  if (styleResult.previewPath && fs.existsSync(styleResult.previewPath)) {
    try { fs.unlinkSync(styleResult.previewPath); } catch { /* ignore */ }
  }

  let formatChatCalled = false;
  const formatClient = {
    async getCapabilities() {
      return { features: { image_reference_attachments: true } };
    },
    async chat() {
      formatChatCalled = true;
      return { response: { choices: [{ message: { content: '{}' } }] } };
    },
    async images(payload) {
      assert.equal(payload.size, '1536x1024', 'format-only uses selected size');
      assert(/Resize the attached/i.test(payload.prompt), 'format-only resize prompt');
      assert(!payload.reference_images, 'format-only uses path attachment only');
      assert.equal(payload.referenced_image_paths.length, 1, 'format-only sends effect path only');
      return {
        response: { data: [{ b64_json: png.toString('base64') }] },
        _attachmentMode: 'reference_images',
      };
    },
  };

  assert(isFormatOnlyEdit('', { size: '1536x1024' }, { width: 1024, height: 1024 }), 'empty change + new size = format only');

  const formatResult = await new EffectEditPipeline(formatClient, new MockRegistry(effectPath)).runEffectEdit(
    { effectId: 'eff-1', changeRequest: '', quality: 'high', size: '1536x1024', referenceImagePath: stylePath },
    () => {},
    'sig-format',
  );
  assert(!formatChatCalled, 'format-only skips chat optimization');
  assert(formatResult.formatOnly, 'formatOnly flag set');

  const refs = await buildEffectEditReferences(effectPath, stylePath);
  assert.equal(refs.length, 2, 'two reference paths with style image');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (formatResult.previewPath && fs.existsSync(formatResult.previewPath)) {
    try { fs.unlinkSync(formatResult.previewPath); } catch { /* ignore */ }
  }

  console.log('All effect-edit-pipeline tests passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
