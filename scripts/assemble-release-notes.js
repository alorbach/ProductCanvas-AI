'use strict';

const fs = require('fs');
const path = require('path');

const outDir = process.env.RELEASE_OUT_DIR || '.release';
const tagName = String(process.env.TAG_NAME || process.env.GITHUB_REF_NAME || 'v0.0.0').trim();
const version = process.env.RELEASE_VERSION || tagName.replace(/^v/, '');
const buildNumber = process.env.RELEASE_BUILD_NUMBER || '1';
const installerName = process.env.RELEASE_INSTALLER_NAME
  || `ProductCanvas-AI-${version}-build.${buildNumber}-win-x64.exe`;
const zipName = process.env.RELEASE_ZIP_NAME
  || `ProductCanvas-AI-${version}-build.${buildNumber}-win-x64.zip`;

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

function bullets(items) {
  return (items || []).map((item) => `- ${String(item).trim()}`).filter((line) => line !== '-').join('\n');
}

const githubNotes = readText(path.join(outDir, 'github-notes.md'))
  || 'No generated changelog entries were returned for this tag.';

let ai = null;
const aiRaw = readText(path.join(outDir, 'ai-release.json'));
if (aiRaw) {
  try {
    ai = JSON.parse(aiRaw);
  } catch (err) {
    console.warn('Could not parse ai-release.json:', err.message);
  }
}

const descriptionEn = ai?.description_en
  || 'Universal AI image studio for Windows — layout templates plus reference photos via Codex Local Bridge.';
const descriptionDe = ai?.description_de
  || 'Universelles KI-Bildstudio für Windows — Layout-Vorlagen und Referenzfotos über die Codex Local Bridge.';
const changelogEn = ai?.changelog_en?.length
  ? bullets(ai.changelog_en)
  : githubNotes;
const changelogDe = ai?.changelog_de?.length
  ? bullets(ai.changelog_de)
  : changelogEn;

const usedAi = Boolean(ai?.description_en || ai?.changelog_en?.length);

const body = [
  `# ProductCanvas AI ${tagName}`,
  '',
  descriptionEn,
  '',
  descriptionDe,
  '',
  '## Downloads',
  '',
  `- Windows installer: \`${installerName}\``,
  `- Portable ZIP: \`${zipName}\``,
  '',
  '## What\'s new',
  '',
  changelogEn,
  '',
  '## Neu in dieser Version',
  '',
  changelogDe,
  '',
  '## Validation',
  '',
  'This release was built by GitHub Actions after icon generation, JavaScript syntax checks, tests, and Windows packaging completed successfully.',
  usedAi ? 'Release notes were drafted with GitHub Models from commit history.' : 'Release notes use GitHub auto-generated changelog (AI step unavailable).',
  '',
  '## Technical changelog',
  '',
  githubNotes,
  '',
  '---',
  '',
  'Copyright (c) Andre Lorbach — https://github.com/alorbach',
  'License: GPL-2.0-or-later',
  '',
].join('\n');

fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'release-notes.md');
fs.writeFileSync(outPath, body, 'utf8');
console.log(`Wrote ${outPath}`);
