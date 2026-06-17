'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const { TemplateEditPipeline, isFormatOnlyEdit, buildTemplateEditReferences } = require(path.join(root, 'src', 'main', 'generate', 'template-edit-pipeline'));
const { MAX_BRIDGE_FRAME_BYTES } = require(path.join(root, 'src', 'main', 'generate', 'image-prep'));
const { buildTemplateEditFrozenRules } = require(path.join(root, 'src', 'main', 'generate', 'layout-fidelity'));

assert(isFormatOnlyEdit('', { size: '1792x1024' }, { width: 1536, height: 1024 }), 'empty change + new size = format only');
assert(!isFormatOnlyEdit('', { size: '1536x1024' }, { width: 1536, height: 1024 }), 'same size needs change request');
assert(!isFormatOnlyEdit('Neon rot', { size: '1792x1024' }, { width: 1536, height: 1024 }), 'change request is not format only');

const changeRequest = 'Neon-Rahmen von blau auf rot ändern';
const editRules = buildTemplateEditFrozenRules(changeRequest, { size: '1536x1024' });
assert(editRules.includes(changeRequest), 'edit rules include change request');
assert(editRules.includes('1536x1024'), 'edit rules include target size');
assert(editRules.includes('FROZEN'), 'edit rules include frozen zones');

const styleRules = buildTemplateEditFrozenRules('Hintergrund wie IMAGE 2', { size: '1536x1024' }, { hasStyleReference: true });
assert(styleRules.includes('IMAGE 2'), 'style rules mention IMAGE 2');
assert(styleRules.includes('style/visual reference'), 'style rules describe style reference');

class MockRegistry {
  constructor(templatePath) {
    this.template = {
      id: 'tpl-1',
      name: 'Test-Vorlage',
      file: 'test.png',
      width: 1536,
      height: 1024,
      productStage: { x: 48, y: 200, width: 1440, height: 580 },
    };
    this.templatePath = templatePath;
  }

  getById() { return this.template; }
  resolveTemplatePath() { return this.templatePath; }
  async getDimensions() { return { width: 1536, height: 1024 }; }
}

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-tpl-edit-'));
  const templatePath = path.join(tmpDir, 'template.png');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  fs.writeFileSync(templatePath, png);

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
      assert.equal(body.referenced_image_paths.length, 1, 'chat sends template path');
      return {
        response: {
          choices: [{
            message: {
              content: JSON.stringify({
                optimizedEditPrompt: 'Change neon border color to red only.',
                changeSummary: 'Neon wird rot.',
                preservedElements: ['Header', 'Footer'],
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

  const pipeline = new TemplateEditPipeline(client, new MockRegistry(templatePath));
  const result = await pipeline.runTemplateEdit(
    { templateId: 'tpl-1', changeRequest, quality: 'high' },
    () => {},
    'sig-test',
  );

  assert(chatCalled, 'chat optimization called');
  assert(chatPayload, 'chat payload captured');
  assert(imagesPayload, 'images generation called');
  assert(!imagesPayload.reference_images, 'images use paths only for template edit');
  assert.equal(imagesPayload.referenced_image_paths.length, 1, 'template path attached');
  assert.equal(imagesPayload.size, '1536x1024', 'api size matches template dimensions');
  assert.equal(imagesPayload.quality, 'high', 'quality normalized');
  assert(imagesPayload.prompt.includes('FROZEN'), 'final image prompt includes frozen block');
  assert(result.previewPath && fs.existsSync(result.previewPath), 'preview file written');
  assert.equal(result.templateWidth, 1536, 'result reports template width');
  assert.equal(result.templateHeight, 1024, 'result reports template height');

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
                optimizedEditPrompt: 'Replace product-stage background using mood from IMAGE 2.',
                changeSummary: 'Hintergrund angepasst.',
                preservedElements: ['Header', 'Footer'],
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

  const styleResult = await new TemplateEditPipeline(styleClient, new MockRegistry(templatePath)).runTemplateEdit(
    {
      templateId: 'tpl-1',
      changeRequest: 'Produktbühne-Hintergrund wie im Referenzbild',
      quality: 'high',
      referenceImagePath: stylePath,
    },
    () => {},
    'sig-style',
  );
  assert.equal(styleChatPaths, 2, 'style edit chat has two path attachments');
  assert(!styleImagesPayload.reference_images, 'style edit images payload uses paths only');
  assert.equal(styleImagesPayload.referenced_image_paths.length, 2, 'style edit paths include template and style');
  assert(styleImagesPayload.prompt.includes('visual style reference'), 'style hint in image prompt');
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
      assert.equal(payload.size, '1792x1024', 'format-only uses selected size');
      assert(/Resize the attached/i.test(payload.prompt), 'format-only resize prompt');
      assert(!payload.reference_images, 'format-only uses path attachment only');
      assert.equal(payload.referenced_image_paths.length, 1, 'format-only sends template path only');
      return {
        response: { data: [{ b64_json: png.toString('base64') }] },
        _attachmentMode: 'reference_images',
      };
    },
  };

  const formatResult = await new TemplateEditPipeline(formatClient, new MockRegistry(templatePath)).runTemplateEdit(
    { templateId: 'tpl-1', changeRequest: '', quality: 'high', size: '1792x1024', referenceImagePath: stylePath },
    () => {},
    'sig-format',
  );
  assert(!formatChatCalled, 'format-only skips chat optimization');
  assert(formatResult.formatOnly, 'formatOnly flag set');

  const largePath = path.join(tmpDir, 'large-template.png');
  const sharp = require('sharp');
  await sharp({
    create: {
      width: 1800,
      height: 1800,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  }).png({ compressionLevel: 0 }).toFile(largePath);
  assert(fs.statSync(largePath).size > MAX_BRIDGE_FRAME_BYTES, 'fixture exceeds bridge byte limit');
  const largeRefs = await buildTemplateEditReferences(largePath, '');
  assert.equal(largeRefs.length, 1, 'large template yields path-only reference');
  assert(!largeRefs[0].b64_json, 'large template is not base64-encoded');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (formatResult.previewPath && fs.existsSync(formatResult.previewPath)) {
    try { fs.unlinkSync(formatResult.previewPath); } catch { /* ignore */ }
  }

  console.log('All template-edit-pipeline tests passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
