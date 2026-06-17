'use strict';

const path = require('path');
const paths = require('./paths');

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:8765';
const MAX_DATA_URL_BYTES = 20 * 1024 * 1024;

function isPathInside(root, filePath) {
  if (!root || !filePath) return false;
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(filePath);
  const prefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  return resolvedFile === resolvedRoot || resolvedFile.startsWith(prefix);
}

function normalizeBridgeUrl(raw) {
  const trimmed = String(raw || '').trim() || DEFAULT_BRIDGE_URL;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return DEFAULT_BRIDGE_URL;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return DEFAULT_BRIDGE_URL;
  }
  const pathname = url.pathname.replace(/\/$/, '');
  return `${url.origin}${pathname === '' || pathname === '/' ? '' : pathname}`;
}

function collectKnownPaths(context = {}) {
  const known = new Set();
  const { session, templateRegistry, templateEditor } = context;

  for (const ref of session?.referenceImages || []) {
    if (ref?.path) known.add(path.resolve(ref.path));
  }

  if (templateRegistry?.listAll) {
    for (const template of templateRegistry.listAll()) {
      if (template?.path) known.add(path.resolve(template.path));
    }
  }

  const pendingEdit = templateEditor?.getPendingEdit?.();
  if (pendingEdit?.referenceImagePath) {
    known.add(path.resolve(pendingEdit.referenceImagePath));
  }

  return known;
}

function isAllowedReadPath(filePath, context = {}) {
  if (!filePath) return false;
  const resolved = path.resolve(filePath);
  if (isPathInside(paths.userDataRoot(), resolved)) {
    return true;
  }
  return collectKnownPaths(context).has(resolved);
}

function isAllowedExportSource(filePath) {
  if (!filePath) return false;
  return isPathInside(paths.tempPreviewDir(), path.resolve(filePath));
}

module.exports = {
  DEFAULT_BRIDGE_URL,
  MAX_DATA_URL_BYTES,
  isPathInside,
  normalizeBridgeUrl,
  isAllowedReadPath,
  isAllowedExportSource,
  collectKnownPaths,
};
