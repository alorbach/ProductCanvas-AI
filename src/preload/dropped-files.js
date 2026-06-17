'use strict';

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

function isDroppedImagePath(filePath) {
  return Boolean(filePath && IMAGE_EXT.test(filePath));
}

function isDroppedImageFile(file, filePath) {
  const mime = String(file?.type || '').toLowerCase();
  if (IMAGE_MIME.has(mime)) return true;
  return isDroppedImagePath(filePath);
}

function collectDroppedImagePaths(files, getPathForFile) {
  const paths = [];
  for (const file of files || []) {
    if (!file) continue;
    const filePath = getPathForFile(file);
    if (!filePath || !isDroppedImageFile(file, filePath)) continue;
    paths.push(filePath);
  }
  return paths;
}

module.exports = {
  IMAGE_EXT,
  IMAGE_MIME,
  isDroppedImagePath,
  isDroppedImageFile,
  collectDroppedImagePaths,
};
