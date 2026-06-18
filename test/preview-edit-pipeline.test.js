'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const { PreviewEditPipeline, buildPreviewEditReferences } = require(path.join(root, 'src', 'main', 'generate', 'preview-edit-pipeline'));
const { buildPreviewEditFrozenRules } = require(path.join(root, 'src', 'main', 'generate', 'layout-fidelity'));
const {
  resolveStoredPreview,
  isValidStoredPreviewPath,
} = require(path.join(root, 'src', 'main', 'generate', 'preview-edit-service'));
const paths = require(path.join(root, 'src', 'main', 'paths'));

const changeRequest = 'Neon-Rahmen von blau auf rot ändern';
const editRules = buildPreviewEditFrozenRules(changeRequest, { size: '1536x1024' }, { hasTemplateReference: true });
assert(editRules.includes(changeRequest), 'preview edit rules include change request');
assert(editRules.includes('IMAGE 1'), 'preview edit rules mention IMAGE 1');
assert(editRules.includes('IMAGE 2'), 'preview edit rules mention IMAGE 2');

const editRulesNoTpl = buildPreviewEditFrozenRules(changeRequest, { size: '1536x1024' }, { hasTemplateReference: false });
assert(editRulesNoTpl.includes('ONE ATTACHED IMAGE'), 'no template uses single image rules');

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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-preview-edit-'));
  const previewDir = path.join(tmpDir, 'temp-previews');
  fs.mkdirSync(previewDir, { recursive: true });
  const previewPath = path.join(previewDir, 'preview-base.png');
  const templatePath = path.join(tmpDir, 'template.png');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  fs.writeFileSync(previewPath, png);
  fs.writeFileSync(templatePath, png);

  const originalTempPreviewDir = paths.tempPreviewDir;
  paths.tempPreviewDir = () => previewDir;

  try {
    assert(isValidStoredPreviewPath(previewPath), 'preview path under temp-previews is valid');
    assert(!isValidStoredPreviewPath('/tmp/outside.png'), 'outside path invalid');

    const resolvedOk = resolveStoredPreview({ lastPreviewPath: previewPath });
    assert(resolvedOk.valid && resolvedOk.path === previewPath, 'resolve stored preview');

    const resolvedMissing = resolveStoredPreview({ lastPreviewPath: path.join(previewDir, 'missing.png') });
    assert(!resolvedMissing.valid && resolvedMissing.sessionPatch, 'missing preview clears session');

    const refs = await buildPreviewEditReferences(previewPath, templatePath);
    assert.strictEqual(refs.length, 2, 'preview + template references');

    const refsOnly = await buildPreviewEditReferences(previewPath, '');
    assert.strictEqual(refsOnly.length, 1, 'preview only when no template');

    let chatCalled = false;
    let imagesCalled = false;
    const mockClient = {
      async getCapabilities() {
        return { features: { image_reference_attachments: true } };
      },
      async chat(payload) {
        chatCalled = true;
        assert(payload.referenced_image_paths?.length >= 1, 'chat forwards reference paths');
        return {
          response: {
            choices: [{
              message: {
                content: JSON.stringify({
                  optimizedEditPrompt: 'Change neon bars from blue to red in the product stage only.',
                  changeSummary: 'Neon-Rahmen rot',
                  preservedElements: ['Header'],
                }),
              },
            }],
          },
        };
      },
      async images(payload) {
        imagesCalled = true;
        assert(payload.requireReferences === true, 'preview edit requires references');
        assert(payload.referenced_image_paths?.length >= 1, 'images forwards paths');
        return {
          response: {
            data: [{ b64_json: png.toString('base64') }],
            provider_details: { refs_forwarded_to_codex: true, reference_attachment_count: 2 },
          },
          _attachmentMode: 'referenced_image_paths',
        };
      },
    };

    const pipeline = new PreviewEditPipeline(mockClient, new MockRegistry(templatePath));
    const result = await pipeline.runPreviewEdit({
      previewPath,
      templateId: 'tpl-1',
      changeRequest,
      quality: 'high',
      size: '1536x1024',
    });

    assert(chatCalled && imagesCalled, 'chat and images were called');
    assert(result.editedPreviewPath.includes('preview-edit-'), 'writes preview-edit file');
    assert(fs.existsSync(result.editedPreviewPath), 'edited preview file exists');
    assert(result.changeSummary.includes('Neon'), 'change summary preserved');
    assert(result.editedPreviewB64, 'returns b64');

    console.log('preview-edit-pipeline.test.js: all assertions passed');
  } finally {
    paths.tempPreviewDir = originalTempPreviewDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
