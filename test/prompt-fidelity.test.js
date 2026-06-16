'use strict';

const assert = require('assert');
const path = require('path');

const root = path.join(__dirname, '..');
const {
  PRODUCT_FIDELITY_BLOCK,
  DUAL_REFERENCE_MIX_BLOCK,
  appendFidelityToImagePrompt,
  buildImageGenerationPrompt,
  buildImageApiPayload,
} = require(path.join(root, 'src', 'main', 'generate', 'image-request'));

const {
  buildPreflightMessages,
  computePreflightFingerprint,
} = require(path.join(root, 'src', 'main', 'generate', 'image-preflight'));

assert(PRODUCT_FIDELITY_BLOCK.includes('CRITICAL PRODUCT FIDELITY'), 'fidelity block defined');
assert(DUAL_REFERENCE_MIX_BLOCK.includes('IMAGE 1 = PRODUCT REFERENCE'), 'dual reference block defined');

const withFidelity = appendFidelityToImagePrompt('Create ad image.', true);
assert(withFidelity.includes('Create ad image.'), 'keeps original prompt');
assert(withFidelity.includes('CRITICAL PRODUCT FIDELITY'), 'appends fidelity block');

const withoutRefs = appendFidelityToImagePrompt('Create ad image.', false);
assert.equal(withoutRefs, 'Create ad image.', 'no block without refs');

const genPrompt = buildImageGenerationPrompt({
  finalPrompt: 'Photorealistic TELE-KOHLGRAF ad with exact Martin Logan speakers.',
}, { hasProductReference: true });
assert(genPrompt.includes('Photorealistic TELE-KOHLGRAF'), 'uses preflight final prompt');
assert(genPrompt.includes('match attached product photo exactly'), 'short product hint');
assert(!genPrompt.includes('CRITICAL PRODUCT FIDELITY'), 'no long fidelity block in runtime prompt');

const dualPrompt = buildImageGenerationPrompt({
  finalPrompt: 'Merge product photo into layout template.',
}, { hasProductReference: true, hasTemplateReference: true });
assert(dualPrompt.includes('Merge product photo'), 'keeps preflight text');
assert(dualPrompt.includes('Image 1 = exact products'), 'dual attachment order hint');
assert(!dualPrompt.includes('TWO ATTACHED REFERENCE IMAGES'), 'no duplicate dual block');

const apiPayload = buildImageApiPayload({
  promptData: {
    finalPrompt: 'TELE-KOHLGRAF ad with exact speakers on neon stage.',
  },
  settings: { size: '1536x1024', quality: 'high' },
  referenceImages: [
    { b64_json: 'abc', mime_type: 'image/jpeg', label: 'product' },
    { b64_json: 'def', mime_type: 'image/jpeg', label: 'layout' },
  ],
  attachmentPaths: ['C:\\test\\product.png', 'C:\\test\\template.png'],
  frames: ['data:image/jpeg;base64,abc', 'data:image/jpeg;base64,def'],
  hasProductReference: true,
  hasTemplateReference: true,
});
assert(apiPayload.reference_images?.length === 2, 'reference_images primary payload');
assert(apiPayload.referenced_image_paths?.length === 2, 'paths as secondary attempt');
assert(apiPayload.frames?.length === 2, 'frames as tertiary attempt');
assert(apiPayload.requireReferences === true, 'requireReferences when refs present');
assert(apiPayload.prompt.includes('Image 1 = exact products'), 'short hint in payload');
assert(apiPayload.model === 'codex-local:image', 'image model');

const messages = buildPreflightMessages('Task prompt', [
  { b64_json: 'abc', mime_type: 'image/jpeg' },
]);
assert.equal(messages.length, 2, 'system + user messages');
assert.equal(messages[1].content.length, 2, 'text + one image part');

const fp1 = computePreflightFingerprint(
  { templateId: 'a', brandName: 'X' },
  'C:\\tpl.png',
  ['C:\\prod.png'],
);
const fp2 = computePreflightFingerprint(
  { templateId: 'a', brandName: 'X' },
  'C:\\tpl.png',
  ['C:\\prod.png'],
);
assert.equal(fp1, fp2, 'fingerprint stable');
assert.notEqual(
  computePreflightFingerprint({ templateId: 'b', brandName: 'X' }, 'C:\\tpl.png', ['C:\\prod.png']),
  fp1,
  'fingerprint changes with settings',
);

const { fitInStage, parseSize } = require(path.join(root, 'src', 'main', 'generate', 'product-compositor'));
const stage = { x: 48, y: 200, width: 1440, height: 580 };
const fit = fitInStage(2000, 1000, stage);
assert(fit.width === 1160, 'fit scales down width');
assert(fit.height === 580, 'fit scales down height');
assert.equal(parseSize('1536x1024').width, 1536);

console.log('All prompt-fidelity tests passed.');
