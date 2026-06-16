'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const { TemplateEditPipeline } = require(path.join(root, 'src', 'main', 'generate', 'template-edit-pipeline'));
const { buildTemplateEditFrozenRules } = require(path.join(root, 'src', 'main', 'generate', 'layout-fidelity'));

const changeRequest = 'Neon-Rahmen von blau auf rot ändern';
const editRules = buildTemplateEditFrozenRules(changeRequest, { size: '1536x1024' });
assert(editRules.includes(changeRequest), 'edit rules include change request');
assert(editRules.includes('1536x1024'), 'edit rules include target size');
assert(editRules.includes('FROZEN'), 'edit rules include frozen zones');

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
  let imagesPayload = null;
  const client = {
    async getCapabilities() {
      return { features: { image_reference_attachments: true } };
    },
    async chat(body) {
      chatCalled = true;
      const userContent = body.messages[1].content;
      const textPart = userContent.find((p) => p.type === 'input_text' || p.type === 'text');
      assert(textPart.text.includes(changeRequest), 'chat task includes change request');
      const imageParts = userContent.filter((p) => p.type === 'input_image' || p.type === 'image_url');
      assert.equal(imageParts.length, 1, 'exactly one template image in chat');
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
  assert(imagesPayload, 'images generation called');
  assert.equal(imagesPayload.reference_images.length, 1, 'exactly one reference image');
  assert.equal(imagesPayload.size, '1536x1024', 'api size matches template dimensions');
  assert.equal(imagesPayload.quality, 'high', 'quality normalized');
  assert(imagesPayload.prompt.includes('FROZEN'), 'final image prompt includes frozen block');
  assert(result.previewPath && fs.existsSync(result.previewPath), 'preview file written');
  assert.equal(result.templateWidth, 1536, 'result reports template width');
  assert.equal(result.templateHeight, 1024, 'result reports template height');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (result.previewPath && fs.existsSync(result.previewPath)) {
    try { fs.unlinkSync(result.previewPath); } catch { /* ignore */ }
  }

  console.log('All template-edit-pipeline tests passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
