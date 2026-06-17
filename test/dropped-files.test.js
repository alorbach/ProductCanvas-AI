'use strict';

const assert = require('assert');
const path = require('path');
const {
  isDroppedImagePath,
  isDroppedImageFile,
  collectDroppedImagePaths,
} = require(path.join(__dirname, '..', 'src', 'preload', 'dropped-files.js'));

assert(isDroppedImagePath('C:\\images\\template.png'));
assert(isDroppedImagePath('/tmp/photo.JPG'));
assert(isDroppedImagePath('ad.webp'));
assert(!isDroppedImagePath('C:\\docs\\readme.pdf'));
assert(!isDroppedImagePath(''));

const pngFile = { type: 'image/png' };
assert(isDroppedImageFile(pngFile, 'C:\\no-extension'));
assert(isDroppedImageFile({ type: '' }, 'C:\\tpl.jpeg'));

const collected = collectDroppedImagePaths(
  [{ type: 'image/png' }, { type: 'application/pdf' }],
  (file) => (file.type === 'image/png' ? 'C:\\drop\\layout.png' : 'C:\\drop\\doc.pdf'),
);
assert.deepStrictEqual(collected, ['C:\\drop\\layout.png']);

const emptyPath = collectDroppedImagePaths(
  [{ type: 'image/jpeg' }],
  () => '',
);
assert.deepStrictEqual(emptyPath, []);

console.log('All dropped-files tests passed.');
