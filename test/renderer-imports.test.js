'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rendererDir = path.join(root, 'src', 'renderer');

const IMPORT_RE = /^\s*import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/gm;

function collectJsFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const resolved = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    resolved,
    `${resolved}.js`,
    path.join(resolved, 'index.js'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || resolved;
}

const missing = [];

for (const file of collectJsFiles(rendererDir)) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(content)) !== null) {
    const spec = match[1];
    if (!spec.startsWith('.')) continue;
    const target = resolveImport(file, spec);
    if (!fs.existsSync(target)) {
      missing.push({
        file: path.relative(root, file),
        spec,
        expected: path.relative(root, target),
      });
    }
  }
}

if (missing.length) {
  const details = missing
    .map((m) => `  ${m.file}: import '${m.spec}' -> missing (${m.expected})`)
    .join('\n');
  assert.fail(`Broken renderer import paths:\n${details}`);
}

console.log('All renderer import paths resolve.');
