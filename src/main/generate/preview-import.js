'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../paths');
const { isImagePath } = require('./image-prep');

function importPreviewFromPath(sourcePath) {
  const resolved = path.resolve(String(sourcePath || '').trim());
  if (!resolved || !fs.existsSync(resolved) || !isImagePath(resolved)) {
    return null;
  }
  const ext = path.extname(resolved).toLowerCase() || '.png';
  const dest = path.join(paths.tempPreviewDir(), `preview-import-${Date.now()}${ext}`);
  fs.copyFileSync(resolved, dest);
  return dest;
}

function importPreviewFromPaths(filePaths) {
  for (const filePath of filePaths || []) {
    const dest = importPreviewFromPath(filePath);
    if (dest) {
      return { path: dest, name: path.basename(dest) };
    }
  }
  return null;
}

module.exports = {
  importPreviewFromPath,
  importPreviewFromPaths,
};
