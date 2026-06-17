'use strict';

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

function isImageFile(file, filePath) {
  const mime = String(file?.type || '').toLowerCase();
  if (IMAGE_MIME.has(mime)) return true;
  return Boolean(filePath && IMAGE_EXT.test(filePath));
}

function getPathForFile(file) {
  const bridge = window.productCanvas;
  if (!bridge?.getPathForFile || !file) return '';
  try {
    return bridge.getPathForFile(file) || '';
  } catch {
    return '';
  }
}

function filesFromDataTransfer(dataTransfer) {
  const files = [];
  const items = dataTransfer?.items;
  if (items?.length) {
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (!files.length && dataTransfer?.files?.length) {
    for (const file of dataTransfer.files) {
      if (file) files.push(file);
    }
  }
  return files;
}

export function pathsFromDataTransfer(dataTransfer) {
  const paths = [];
  for (const file of filesFromDataTransfer(dataTransfer)) {
    const filePath = getPathForFile(file);
    if (filePath && isImageFile(file, filePath)) {
      paths.push(filePath);
    }
  }
  return paths;
}

export function isFileDrag(dataTransfer) {
  if (!dataTransfer?.types) return false;
  return [...dataTransfer.types].includes('Files');
}
