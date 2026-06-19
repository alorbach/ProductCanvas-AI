'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const paths = require(path.join(root, 'src', 'main', 'paths'));
const { setPreferences, normalizeCodexCliPath } = require(path.join(root, 'src', 'main', 'app-preferences'));
const {
  resolveCodexBinary,
  invalidateCodexBinaryCache,
  getCodexCliInfo,
} = require(path.join(root, 'src', 'main', 'bridge', 'codex-cli-client'));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-cli-resolve-'));
const origUserData = paths.userDataRoot;
paths.userDataRoot = () => tmpDir;

const fakeExe = path.join(tmpDir, 'codex-fake.exe');
fs.writeFileSync(fakeExe, '@echo off\r\n');

try {
  assert.equal(normalizeCodexCliPath('  C:\\codex.exe  '), 'C:\\codex.exe');
  assert.equal(normalizeCodexCliPath(null), '');
  assert.ok(paths.defaultsPath().startsWith(tmpDir), 'defaultsPath uses mocked userDataRoot');

  invalidateCodexBinaryCache();
  setPreferences({ codexCliPath: fakeExe }, 'en');
  invalidateCodexBinaryCache();
  assert.equal(resolveCodexBinary(), fakeExe, 'uses configured CLI path from settings');

  const info = getCodexCliInfo();
  assert.equal(info.configuredPath, fakeExe);
  assert.equal(info.resolutionSource, 'settings');
  assert.equal(info.binaryExists, true);

  setPreferences({ codexCliPath: path.join(tmpDir, 'missing.exe') }, 'en');
  invalidateCodexBinaryCache();
  const fallback = resolveCodexBinary();
  assert.notEqual(fallback, path.join(tmpDir, 'missing.exe'), 'falls back when configured path is missing');

  console.log('codex-cli-resolve.test.js OK');
} finally {
  paths.userDataRoot = origUserData;
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
