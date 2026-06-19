'use strict';

const assert = require('assert');
const path = require('path');

const root = path.join(__dirname, '..');
const {
  buildEffectGenerationPrompt,
  EffectGeneratePipeline,
} = require(path.join(root, 'src', 'main', 'generate', 'effect-generate-pipeline'));

const prompt = buildEffectGenerationPrompt('fire background on black');
assert(prompt.includes('fire background on black'), 'user prompt included');
assert(/no products/i.test(prompt), 'no products rule');
assert(/no text/i.test(prompt), 'no text rule');

(async () => {
  let imagesCalled = false;
  const mockClient = {
    async images(payload) {
      imagesCalled = true;
      assert(payload.prompt.includes('fire background on black'), 'payload prompt');
      assert.equal(payload.size, '1024x1024');
      return {
        response: {
          data: [{ b64_json: Buffer.from('x').toString('base64') }],
        },
      };
    },
  };

  const pipeline = new EffectGeneratePipeline(mockClient);
  const result = await pipeline.runEffectGenerate({
    prompt: 'fire background on black',
    quality: 'high',
    size: '1024x1024',
  });

  assert(imagesCalled, 'images API called');
  assert(result.previewPath.includes('effect-generate-'), 'preview path');
  assert(result.previewB64, 'preview b64 returned');

  console.log('effect-generate-pipeline.test.js: all assertions passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
