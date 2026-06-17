'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const paths = require(path.join(root, 'src', 'main', 'paths'));
const { TemplateRegistry } = require(path.join(root, 'src', 'main', 'templates', 'template-registry'));

async function writePng(filePath, width, height) {
  await sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 60, b: 120 } },
  }).png().toFile(filePath);
}

async function run() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-template-import-'));
  const origUserData = paths.userDataRoot;
  paths.userDataRoot = () => tmpDir;

  try {
    const registry = new TemplateRegistry();
    const src = path.join(tmpDir, 'source.png');
    await writePng(src, 1024, 768);
    const imported = await registry.importFromFile(src, 'blau.DB');
    assert.equal(imported.width, 1024, 'import keeps 1024 px width');
    assert.equal(imported.height, 768, 'import keeps 768 px height');
    const storedMeta = await sharp(registry.resolveTemplatePath(imported)).metadata();
    assert.equal(storedMeta.width, 1024, 'stored png keeps width');
    assert.equal(storedMeta.height, 768, 'stored png keeps height');

    const largeSrc = path.join(tmpDir, 'large.png');
    await writePng(largeSrc, 2730, 2048);
    const importedLarge = await registry.importFromFile(largeSrc, 'large');
    assert.equal(importedLarge.width, 2730, 'large import keeps native width');
    assert.equal(importedLarge.height, 2048, 'large import keeps native height');
  } finally {
    paths.userDataRoot = origUserData;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('All template-import tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
