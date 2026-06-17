'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const LEGACY_APPDATA_NAMES = ['WerbungMaker', 'werbungmaker', 'productcanvas-ai'];
const MIGRATION_MARKER = '.migration-werbungmaker-done';

function listDirSafe(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function isDirEmpty(dir) {
  return listDirSafe(dir).length === 0;
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function legacyAppDataRoots(currentUserData) {
  const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return LEGACY_APPDATA_NAMES
    .map((name) => path.join(roaming, name))
    .filter((legacy) => path.resolve(legacy) !== path.resolve(currentUserData));
}

function legacyBridgeDirs(currentBridgeDir) {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return LEGACY_APPDATA_NAMES
    .map((name) => path.join(local, name, 'bridge'))
    .filter((legacy) => path.resolve(legacy) !== path.resolve(currentBridgeDir));
}

function migrateIfNeeded(userDataRoot, bridgeDir) {
  const marker = path.join(userDataRoot, MIGRATION_MARKER);
  if (fs.existsSync(marker)) return { migrated: false };

  const empty = isDirEmpty(userDataRoot);
  if (!empty) {
    fs.writeFileSync(marker, new Date().toISOString());
    return { migrated: false };
  }

  for (const legacy of legacyAppDataRoots(userDataRoot)) {
    if (!fs.existsSync(legacy) || isDirEmpty(legacy)) continue;
    copyRecursive(legacy, userDataRoot);
    fs.writeFileSync(marker, `migrated-from:${legacy}\n${new Date().toISOString()}`);
    for (const legacyBridge of legacyBridgeDirs(bridgeDir)) {
      if (fs.existsSync(legacyBridge) && !fs.existsSync(bridgeDir)) {
        copyRecursive(legacyBridge, bridgeDir);
      }
    }
    return { migrated: true, from: legacy };
  }

  fs.writeFileSync(marker, new Date().toISOString());
  return { migrated: false };
}

module.exports = { migrateIfNeeded };
