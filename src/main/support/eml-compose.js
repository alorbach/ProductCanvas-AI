'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function encodeHeaderValue(value) {
  return String(value || '')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function buildBoundary() {
  return `----=_ProductCanvas_${crypto.randomUUID().replace(/-/g, '')}`;
}

function base64Chunked(buffer) {
  const b64 = buffer.toString('base64');
  const lines = [];
  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76));
  }
  return lines.join('\r\n');
}

function attachmentPart(boundary, filePath, displayName) {
  const content = fs.readFileSync(filePath);
  const baseName = displayName || path.basename(filePath);
  const ext = path.extname(baseName).toLowerCase();
  const mime = ext === '.zip'
    ? 'application/zip'
    : ext === '.log'
      ? 'text/plain'
      : 'application/octet-stream';
  return [
    `--${boundary}`,
    `Content-Type: ${mime}; name="${baseName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${baseName}"`,
    '',
    base64Chunked(content),
    '',
  ].join('\r\n');
}

function composeEml({ subject, body, attachments = [], to = '' }) {
  const boundary = buildBoundary();
  const lines = [
    'MIME-Version: 1.0',
    `To: ${encodeHeaderValue(to)}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    String(body || '').replace(/\r?\n/g, '\r\n'),
    '',
  ];

  for (const item of attachments) {
    const filePath = typeof item === 'string' ? item : item.path;
    const name = typeof item === 'string' ? undefined : item.name;
    if (!filePath || !fs.existsSync(filePath)) continue;
    lines.push(attachmentPart(boundary, filePath, name));
  }

  lines.push(`--${boundary}--`, '');
  return lines.join('\r\n');
}

function createSupportDraftDir() {
  const dir = path.join(os.tmpdir(), 'productcanvas-ai', `support-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeEmlFile(dir, content) {
  const emlPath = path.join(dir, 'ProductCanvas-Support.eml');
  fs.writeFileSync(emlPath, content, 'utf8');
  return emlPath;
}

module.exports = {
  composeEml,
  createSupportDraftDir,
  writeEmlFile,
};
