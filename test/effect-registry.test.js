'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const paths = require(path.join(root, 'src', 'main', 'paths'));
const { EffectRegistry } = require(path.join(root, 'src', 'main', 'effects', 'effect-registry'));

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

(async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-effect-reg-'));
  const originalUserDataRoot = paths.userDataRoot;
  paths.userDataRoot = () => tmpRoot;

  try {
    const registry = new EffectRegistry();
    const sourcePath = path.join(tmpRoot, 'fire.png');
    fs.writeFileSync(sourcePath, png);

    const imported = await registry.importFromFile(sourcePath, 'Feuer Test');
    assert(imported.id.startsWith('effect-'), 'effect id prefix');
    assert.equal(imported.sourceType, 'imported');
    assert(imported.width > 0 && imported.height > 0, 'dimensions stored');

    const list = registry.listAll();
    assert(list.some((e) => e.id === imported.id), 'imported effect appears in list');
    assert.equal(registry.getById(imported.id).name, 'Feuer Test');

    registry.renameEffect(imported.id, 'Feuer umbenannt');
    assert.equal(registry.getById(imported.id).name, 'Feuer umbenannt');

    registry.deleteEffect(imported.id);
    assert(!registry.getById(imported.id), 'deleted effect removed');

    console.log('effect-registry.test.js: all assertions passed');
  } finally {
    paths.userDataRoot = originalUserDataRoot;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
