'use strict';

const assert = require('assert');
const path = require('path');

const root = path.join(__dirname, '..');
const {
  PRODUCT_FIDELITY_BLOCK,
  appendFidelityToImagePrompt,
  buildImageGenerationPrompt,
  buildImageApiPayload,
} = require(path.join(root, 'src', 'main', 'generate', 'image-request'));

const {
  buildPreflightMessages,
  computePreflightFingerprint,
} = require(path.join(root, 'src', 'main', 'generate', 'image-preflight'));

const attachmentPlan = [
  { imageIndex: 1, role: 'detail', label: 'product', isPrimaryDetail: true },
  { imageIndex: 2, role: 'layout', label: 'layout', isPrimaryDetail: false },
];

assert(PRODUCT_FIDELITY_BLOCK.includes('CRITICAL PRODUCT FIDELITY'), 'fidelity block defined');

const withFidelity = appendFidelityToImagePrompt('Create ad image.', true, attachmentPlan);
assert(withFidelity.includes('Create ad image.'), 'keeps original prompt');
assert(withFidelity.includes('ATTACHED REFERENCE IMAGES'), 'appends role order block');

const withoutRefs = appendFidelityToImagePrompt('Create ad image.', false);
assert.equal(withoutRefs, 'Create ad image.', 'no block without refs');

const genPrompt = buildImageGenerationPrompt({
  finalPrompt: 'Photorealistic Acme Audio ad with exact Martin Logan speakers.',
}, { hasProductReference: true });
assert(genPrompt.includes('Photorealistic Acme Audio'), 'uses preflight final prompt');
assert(genPrompt.includes('match attached product photo exactly'), 'short product hint');
assert(!genPrompt.includes('CRITICAL PRODUCT FIDELITY'), 'no long fidelity block in runtime prompt');

const dualPrompt = buildImageGenerationPrompt({
  finalPrompt: 'Merge product photo into layout template.',
}, {
  hasProductReference: true,
  hasTemplateReference: true,
  attachmentPlan,
});
assert(dualPrompt.includes('Merge product photo'), 'keeps preflight text');
assert(dualPrompt.includes('Image 1 (primary product)'), 'dynamic attachment order hint');
assert(!dualPrompt.includes('TWO ATTACHED REFERENCE IMAGES'), 'no duplicate dual block');

const apiPayload = buildImageApiPayload({
  promptData: {
    finalPrompt: 'Acme Audio ad with exact speakers on neon stage.',
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
  attachmentPlan,
});
assert(apiPayload.reference_images?.length === 2, 'reference_images primary payload');
assert.equal(apiPayload.referenced_image_paths, undefined, 'no duplicate path payload when encoded refs exist');
assert(apiPayload.frames?.length === 2, 'frames preserved');
assert(apiPayload.requireReferences === true, 'requireReferences when refs present');
assert(apiPayload.prompt.includes('Image 1 (primary product)'), 'role hint in payload');
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
  { referenceRoles: [{ path: 'C:\\prod.png', role: 'detail' }] },
);
const fp2 = computePreflightFingerprint(
  { templateId: 'a', brandName: 'X' },
  'C:\\tpl.png',
  ['C:\\prod.png'],
  { referenceRoles: [{ path: 'C:\\prod.png', role: 'detail' }] },
);
assert.equal(fp1, fp2, 'fingerprint stable');
assert.notEqual(
  computePreflightFingerprint(
    { templateId: 'b', brandName: 'X' },
    'C:\\tpl.png',
    ['C:\\prod.png'],
    { referenceRoles: [{ path: 'C:\\prod.png', role: 'detail' }] },
  ),
  fp1,
  'fingerprint changes with settings',
);
assert.notEqual(
  computePreflightFingerprint(
    { templateId: 'a', brandName: 'X' },
    'C:\\tpl.png',
    ['C:\\prod.png'],
    { referenceRoles: [{ path: 'C:\\prod.png', role: 'stage' }] },
  ),
  fp1,
  'fingerprint changes with role',
);

console.log('All prompt-fidelity tests passed.');
