'use strict';

const fs = require('fs');
const path = require('path');

const outDir = process.env.RELEASE_OUT_DIR || 'dist';

function readText(name) {
  return fs.readFileSync(path.join(outDir, name), 'utf8').trim();
}

function yamlSingleLine(key, value) {
  return `${key}: ${JSON.stringify(String(value || ''))}`;
}

const releaseContext = readText('release-context.txt');
const githubNotes = readText('github-notes.md');
const inputYaml = [
  yamlSingleLine('release_context_json', releaseContext),
  yamlSingleLine('github_notes_json', githubNotes),
].join('\n');

const outPath = path.join(outDir, 'ai-inference-input.yaml');
fs.writeFileSync(outPath, inputYaml, 'utf8');
console.log(`Wrote ${outPath}`);
