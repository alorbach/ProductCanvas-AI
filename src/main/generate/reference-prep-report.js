'use strict';

const fs = require('fs');
const path = require('path');

function formatSizeLabel(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (!w || !h) return '';
  return `${w}×${h}`;
}

function safeFileBytes(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return 0;
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function summarizeReferencePrep({
  label,
  sourcePath,
  preparedPath,
  originalWidth,
  originalHeight,
  width,
  height,
  byteBudget,
}) {
  const source = path.resolve(String(sourcePath || '').trim());
  const prepared = path.resolve(String(preparedPath || source || '').trim());
  if (!source) return null;

  const originalBytes = safeFileBytes(source);
  const preparedBytes = safeFileBytes(prepared) || originalBytes;
  const originalSize = formatSizeLabel(originalWidth, originalHeight);
  const preparedSize = formatSizeLabel(width, height);
  const pathsDiffer = prepared && source.toLowerCase() !== prepared.toLowerCase();
  const bytesReduced = preparedBytes > 0 && originalBytes > 0 && preparedBytes < originalBytes;
  const sizeReduced = originalSize && preparedSize && originalSize !== preparedSize;
  const scaled = pathsDiffer || bytesReduced || sizeReduced;

  return {
    label: String(label || 'reference').trim() || 'reference',
    fileName: path.basename(source),
    scaled,
    originalBytes,
    preparedBytes,
    originalSize,
    preparedSize,
    byteBudget: Number(byteBudget) > 0 ? Number(byteBudget) : undefined,
  };
}

function referencePrepFromEntry(entry) {
  if (!entry) return null;
  if (entry.prep) {
    const prep = { ...entry.prep };
    if (entry.role) prep.role = entry.role;
    return prep;
  }
  const prep = summarizeReferencePrep({
    label: entry.label,
    sourcePath: entry.source_path || entry.path,
    preparedPath: entry.path,
    originalWidth: entry.original_width || entry.width,
    originalHeight: entry.original_height || entry.height,
    width: entry.width,
    height: entry.height,
    byteBudget: entry.byteBudget,
  });
  if (!prep) return null;
  if (entry.role) {
    return { ...prep, role: entry.role };
  }
  return prep;
}

function skippedRefPrep(ref) {
  if (!ref) return null;
  const fileName = path.basename(String(ref.path || '').trim());
  if (!fileName) return null;
  return {
    label: 'skipped',
    fileName,
    role: ref.role || 'detail',
    skipped: true,
    scaled: false,
    pending: false,
  };
}

function emitReferencePrepProgress(onProgress, entries, extra = {}) {
  const referencePrep = (Array.isArray(entries) ? entries : [])
    .map(referencePrepFromEntry)
    .filter(Boolean);
  for (const skipped of extra.skippedRefs || []) {
    const item = skippedRefPrep(skipped);
    if (item) referencePrep.push(item);
  }
  if (!referencePrep.length && extra.effectApplied == null) return;
  onProgress?.({
    status: 'running',
    messageKey: 'wait.status.preparingRefs',
    referencePrep,
    ...extra,
  });
}

module.exports = {
  summarizeReferencePrep,
  referencePrepFromEntry,
  emitReferencePrepProgress,
  formatSizeLabel,
};
