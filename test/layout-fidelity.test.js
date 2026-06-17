'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const {
  buildTemplateLayoutHint,
  sanitizePreflightPrompt,
  appendLayoutLockBlock,
  LAYOUT_FROZEN_RULES,
} = require(path.join(root, 'src', 'main', 'generate', 'layout-fidelity'));
const { buildPreflightTaskPrompt, buildReferenceImageEntry } = require(path.join(root, 'src', 'main', 'generate', 'image-preflight'));
const { buildImageApiPayload } = require(path.join(root, 'src', 'main', 'generate', 'image-request'));
const { resolveImageGenerationSettings } = require(path.join(root, 'src', 'main', 'generate', 'image-settings'));
const { TemplateEditorService } = require(path.join(root, 'src', 'main', 'templates', 'template-editor-service'));

const template = {
  id: 'tpl-test',
  name: 'Vorlage-blau',
  width: 1536,
  height: 1024,
  productStage: { x: 48, y: 200, width: 1440, height: 580 },
  categories: ['TV', 'LAUTSPRECHER'],
};

const hint = buildTemplateLayoutHint(template, { layoutImageAttached: true });
assert(!/gold typography/i.test(hint), 'layout hint must not mention gold typography');
assert(!/highlight category/i.test(hint), 'layout hint must not mention highlight category');
assert(/product stage/i.test(hint), 'layout hint mentions product stage');

const taskPrompt = buildPreflightTaskPrompt({
  settings: { size: '1536x1024', quality: 'high', sizeMode: 'template' },
  promptData: { brandName: 'TELE', seriesName: 'Martin Logan' },
  template,
});
assert(taskPrompt.includes('LAYOUT FROZEN ZONES'), 'preflight task includes frozen rules');
assert(!/Highlight category/i.test(taskPrompt), 'preflight task must not highlight category');
assert(!/Gold typography for brand/i.test(taskPrompt), 'preflight task must not force gold brand');

const dirty = 'Add gold typography for brand. Highlight category: TV. Output 1365x1024 with futuristic font.';
const clean = sanitizePreflightPrompt(dirty);
assert(!/highlight category/i.test(clean), 'sanitizer removes highlight category');
assert(!/gold typography for brand/i.test(clean), 'sanitizer removes gold typography line');

const locked = appendLayoutLockBlock('Place Martin Logan speakers.', template, { size: '1536x1024' });
assert(locked.includes(LAYOUT_FROZEN_RULES), 'layout lock block appended');
assert(locked.includes('1536x1024'), 'layout lock includes exact size');
assert(!locked.includes('1365x1024'), 'layout lock does not use wrong size');

const wrongDims = resolveImageGenerationSettings(
  { size: 'template', quality: 'high' },
  { width: 1536, height: 1024 },
);
assert.equal(wrongDims.size, '1536x1024', 'template mode resolves to 1536x1024');
assert.notEqual(wrongDims.size, '1365x1024', 'wrong size not used when template is 1536x1024');

const apiPayload = buildImageApiPayload({
  promptData: { finalPrompt: dirty },
  settings: wrongDims,
  template,
  referenceImages: [{ label: 'layout' }],
  attachmentPaths: [],
  frames: [],
  hasProductReference: false,
  hasTemplateReference: true,
});
assert.equal(apiPayload.size, '1536x1024', 'api payload uses template size');
assert(!/Highlight category/i.test(apiPayload.prompt), 'api prompt sanitized');
assert(apiPayload.prompt.includes('FROZEN'), 'api prompt has layout lock');

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-accept-'));
  const refPath = path.join(tmpDir, 'ref.png');
  await sharp({
    create: {
      width: 1024,
      height: 768,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
  }).png().toFile(refPath);

  const entry = await buildReferenceImageEntry(refPath, 'product');
  assert.equal(entry.width, 1024, 'reference width preserved');
  assert.equal(entry.height, 768, 'reference height preserved');
  assert.equal(entry.mime_type, 'image/png', 'png mime preserved');

  const previewPath = path.join(tmpDir, 'preview.png');
  await sharp({
    create: {
      width: 1365,
      height: 1024,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  }).png().toFile(previewPath);

  const templatePath = path.join(tmpDir, 'template.png');
  fs.copyFileSync(refPath, templatePath);

  let persisted = null;
  const registry = {
    getById: () => ({ id: 't1', file: 'template.png' }),
    resolveTemplatePath: () => templatePath,
    getDimensions: async () => ({ width: 1536, height: 1024 }),
    readTemplateDimensions: async (p) => {
      const m = await sharp(p).metadata();
      return { width: m.width, height: m.height };
    },
    persistTemplateDimensions: (_id, dims) => { persisted = dims; },
  };

  const service = new TemplateEditorService(null, registry);
  service.pendingEdit = {
    templateId: 't1',
    previewPath,
    imageSize: '1536x1024',
  };
  await service.acceptEdit();

  const savedMeta = await sharp(templatePath).metadata();
  assert.equal(savedMeta.width, 1365, 'accept preserves preview width');
  assert.equal(savedMeta.height, 1024, 'accept preserves preview height');
  assert.equal(persisted.width, 1365, 'registry gets actual width');
  assert.equal(persisted.height, 1024, 'registry gets actual height');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('All layout-fidelity tests passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
