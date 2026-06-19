'use strict';

const assert = require('assert');
const path = require('path');

const root = path.join(__dirname, '..');
const {
  ProductEffectPipeline,
  extraPromptOverridesEffectBackground,
} = require(path.join(root, 'src', 'main', 'generate', 'product-effect-pipeline'));

assert(extraPromptOverridesEffectBackground('Produkt größer im Hintergrund'), 'German override');
assert(extraPromptOverridesEffectBackground('change background to studio'), 'English override');
assert(!extraPromptOverridesEffectBackground('Neon blau'), 'no override for unrelated extra');

(async () => {
  const pipeline = new ProductEffectPipeline({});
  const skipped = await pipeline.applyEffectToProduct({
    productPath: 'C:\\prod.png',
    effectPath: 'C:\\effect.png',
    extraPrompt: 'Hintergrund bitte Studio',
  });
  assert(skipped.skipped, 'skipped when extra overrides');
  assert.equal(skipped.path, 'C:\\prod.png');

  console.log('product-effect-pipeline.test.js: all assertions passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
