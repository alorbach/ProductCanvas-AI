'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const scanDirs = ['src', 'docs', 'scripts', '.github'];
const banned = /tele-kohlgraf/i;
const allowedPathFragments = [
  path.join('migration', 'user-data-migrate.js'),
  'tmp' + path.sep,
];

function shouldScan(filePath) {
  if (!/\.(js|json|md|yml|yaml|html|css|ps1)$/i.test(filePath)) return false;
  const rel = path.relative(root, filePath);
  if (rel.startsWith('docs' + path.sep)) {
    return rel.startsWith('docs' + path.sep + 'en' + path.sep)
      || rel.startsWith('docs' + path.sep + 'de' + path.sep)
      || rel === path.join('docs', 'AGENTS.md');
  }
  if (allowedPathFragments.some((frag) => rel.includes(frag.replace(/\//g, path.sep)))) {
    return false;
  }
  return true;
}

const hits = [];
for (const dir of scanDirs) {
  const base = path.join(root, dir);
  if (!fs.existsSync(base)) continue;
  const stack = [base];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'tmp') continue;
        stack.push(full);
        continue;
      }
      if (!shouldScan(full)) continue;
      const text = fs.readFileSync(full, 'utf8');
      if (banned.test(text)) hits.push(path.relative(root, full));
    }
  }
}

if (hits.length) {
  console.error('Banned brand strings found in:\n' + hits.join('\n'));
  process.exit(1);
}

console.log('Brand-free scan passed.');
