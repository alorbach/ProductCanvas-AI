'use strict';

const fs = require('fs');
const path = require('path');

const outDir = process.env.RELEASE_OUT_DIR || 'dist';

function readText(name) {
  return fs.readFileSync(path.join(outDir, name), 'utf8').trim();
}

function yamlBlock(key, text) {
  const lines = String(text || '').split(/\r?\n/);
  return `${key}: |\n${lines.map((line) => `  ${line}`).join('\n')}`;
}

const releaseContext = readText('release-context.txt');
const githubNotes = readText('github-notes.md');
const inputYaml = [yamlBlock('release_context', releaseContext), yamlBlock('github_notes', githubNotes)].join('\n');

const outPath = path.join(outDir, 'ai-inference-input.yaml');
fs.writeFileSync(outPath, inputYaml, 'utf8');
console.log(`Wrote ${outPath}`);
