'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const extract = require('extract-zip');

const root = path.join(__dirname, '..');
const paths = require(path.join(root, 'src', 'main', 'paths'));
const { TemplateRegistry } = require(path.join(root, 'src', 'main', 'templates', 'template-registry'));
const { EffectRegistry } = require(path.join(root, 'src', 'main', 'effects', 'effect-registry'));
const {
  exportToFile,
  importFromFile,
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  buildSessionManifest,
} = require(path.join(root, 'src', 'main', 'data-bundle', 'data-bundle-service'));
const { composeEml } = require(path.join(root, 'src', 'main', 'support', 'eml-compose'));

async function writePng(filePath, width, height) {
  await sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 80, b: 160 } },
  }).png().toFile(filePath);
}

async function run() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-session-bundle-'));
  const origUserData = paths.userDataRoot;
  paths.userDataRoot = () => tmpDir;

  try {
    const templateRegistry = new TemplateRegistry();
    const effectRegistry = new EffectRegistry();

    const srcTemplate = path.join(tmpDir, 'src-template.png');
    const srcEffect = path.join(tmpDir, 'src-effect.png');
    const srcRef = path.join(tmpDir, 'src-ref.png');
    await writePng(srcTemplate, 800, 600);
    await writePng(srcEffect, 400, 400);
    await writePng(srcRef, 300, 300);

    const template = await templateRegistry.importFromFile(srcTemplate, 'Session Template');
    const effect = await effectRegistry.importFromFile(srcEffect, 'Session Effect');

    const session = {
      profileName: 'Test Session',
      templateId: template.id,
      effectId: effect.id,
      brandName: 'Brand',
      referenceImages: [{ path: srcRef, name: 'ref.png', role: 'detail' }],
      lastPreviewPath: '',
      editorReferenceImagePath: '',
      effectEditorReferenceImagePath: '',
    };

    const manifest = buildSessionManifest(session, templateRegistry, effectRegistry);
    assert.equal(manifest.templates.length, 1);
    assert.equal(manifest.effects.length, 1);
    assert.equal(manifest.session.referenceImages.length, 1);
    assert.equal(manifest.session.referenceImages[0].archivePath, 'references/ref.png');

    const zipPath = path.join(tmpDir, 'export.zip');
    const exportResult = await exportToFile(zipPath, session, templateRegistry, effectRegistry);
    assert.equal(exportResult.templateCount, 1);
    assert.equal(exportResult.effectCount, 1);
    assert.equal(exportResult.referenceCount, 1);
    assert(fs.existsSync(zipPath), 'export zip must exist');

    const extractDir = path.join(tmpDir, 'extracted');
    fs.mkdirSync(extractDir, { recursive: true });
    await extract(zipPath, { dir: extractDir });
    const data = JSON.parse(fs.readFileSync(path.join(extractDir, 'data.json'), 'utf8'));
    assert.equal(data.format, BUNDLE_FORMAT);
    assert.equal(data.version, BUNDLE_VERSION);
    assert.equal(data.templates.length, 1);
    assert.equal(data.effects.length, 1);
    assert.equal(data.session.templateId, template.id);
    assert(fs.existsSync(path.join(extractDir, 'templates', template.file)));
    assert(fs.existsSync(path.join(extractDir, 'effects', effect.file)));
    assert(fs.existsSync(path.join(extractDir, 'references', 'ref.png')));

    const importDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-session-import-'));
    paths.userDataRoot = () => importDir;
    const importTemplateRegistry = new TemplateRegistry();
    const importEffectRegistry = new EffectRegistry();

    const firstImport = await importFromFile(zipPath, importTemplateRegistry, importEffectRegistry);
    assert.equal(firstImport.importedTemplates, 1);
    assert.equal(firstImport.importedEffects, 1);
    assert.equal(firstImport.session.templateId, template.id);
    assert.equal(firstImport.session.effectId, effect.id);
    assert.equal(firstImport.session.referenceImages.length, 1);
    assert(fs.existsSync(firstImport.session.referenceImages[0].path));
    assert.equal(firstImport.session.brandName, 'Brand');

    const secondImport = await importFromFile(zipPath, importTemplateRegistry, importEffectRegistry);
    assert.equal(secondImport.importedTemplates, 0);
    assert.equal(secondImport.importedEffects, 0);
    assert.equal(secondImport.skippedTemplates, 1);
    assert.equal(secondImport.skippedEffects, 1);
    assert.equal(secondImport.session.templateId, template.id);

    const partialDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-session-partial-'));
    paths.userDataRoot = () => partialDir;
    const partialTemplateRegistry = new TemplateRegistry();
    const partialEffectRegistry = new EffectRegistry();
    fs.mkdirSync(path.join(partialDir, 'templates'), { recursive: true });
    fs.copyFileSync(
      path.join(importDir, 'templates', template.file),
      path.join(partialDir, 'templates', template.file),
    );

    const partialImport = await importFromFile(zipPath, partialTemplateRegistry, partialEffectRegistry);
    assert.equal(partialImport.skippedTemplates, 1);
    assert.equal(partialImport.importedEffects, 1);
    assert.equal(partialImport.session.referenceImages.length, 1);

    const emlAttachment = path.join(tmpDir, 'sample.log');
    fs.writeFileSync(emlAttachment, 'test log line\n', 'utf8');
    const eml = composeEml({
      subject: 'Test Support',
      body: 'Hello support',
      attachments: [{ path: emlAttachment, name: 'debug.log' }],
    });
    assert.match(eml, /multipart\/mixed/);
    assert.match(eml, /Content-Disposition: attachment; filename="debug.log"/);
    assert.match(eml, /dGVzdCBsb2cgbGluZQ/);
  } finally {
    paths.userDataRoot = origUserData;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('All data-bundle tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
