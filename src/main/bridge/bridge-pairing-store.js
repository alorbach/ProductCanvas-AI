'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const paths = require('../paths');

function bridgeServerStatePath() {
  return path.join(os.homedir(), '.alorbach-codex-bridge', 'state.json');
}

function readBridgeServerToken(origin) {
  try {
    const state = JSON.parse(fs.readFileSync(bridgeServerStatePath(), 'utf8'));
    return String(state?.pairings?.[origin]?.token || '').trim();
  } catch {
    return '';
  }
}

function legacyAppBridgeStatePaths() {
  const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const names = ['WerbungMaker', 'werbungmaker', 'productcanvas-ai', 'ProductCanvas AI'];
  const current = path.resolve(paths.userDataRoot());
  return names
    .map((name) => path.join(roaming, name, 'bridge-state.json'))
    .filter((filePath) => path.resolve(filePath) !== path.resolve(paths.bridgeStatePath()));
}

function readLegacyAppToken() {
  for (const filePath of legacyAppBridgeStatePaths()) {
    try {
      const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const token = String(state?.token || '').trim();
      if (token) return token;
    } catch {
      /* try next */
    }
  }
  return '';
}

module.exports = {
  bridgeServerStatePath,
  legacyAppBridgeStatePaths,
  readBridgeServerToken,
  readLegacyAppToken,
};
