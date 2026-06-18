'use strict';

const assert = require('assert');
const { CodexManager, CODEX_INSTALL_DOCS, CODEX_INSTALL_SCRIPT } = require('../src/main/bridge/codex-manager');

assert.ok(CODEX_INSTALL_DOCS.includes('developers.openai.com/codex/cli'));
assert.ok(CODEX_INSTALL_SCRIPT.includes('install.ps1'));

const manager = new CodexManager();
assert.equal(typeof manager.isInstalled, 'function');
assert.equal(typeof manager.install, 'function');
assert.equal(typeof manager.startLogin, 'function');

console.log('codex-manager.test.js OK');
