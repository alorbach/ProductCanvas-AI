'use strict';

export function estimateBytesFromB64(b64) {
  if (!b64) return 0;
  return Math.ceil((String(b64).length * 3) / 4);
}

export function estimateBytesFromDataUrl(src) {
  if (!src) return 0;
  const comma = String(src).indexOf(',');
  const payload = comma >= 0 ? src.slice(comma + 1) : src;
  return estimateBytesFromB64(payload);
}

export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function normalizeRequestedSize(size) {
  return String(size || '').trim().replace(/×/gi, '×');
}
