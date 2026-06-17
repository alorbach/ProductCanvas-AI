'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const isPackaged = () => {
  try {
    return require('electron').app.isPackaged;
  } catch {
    return false;
  }
};

function appRoot() {
  if (isPackaged()) {
    return path.join(process.resourcesPath, 'app');
  }
  return path.join(__dirname, '..', '..');
}

function userDataRoot() {
  try {
    return require('electron').app.getPath('userData');
  } catch {
    return path.join(os.homedir(), 'AppData', 'Roaming', 'productcanvas-ai');
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const paths = {
  appRoot,
  userDataRoot,
  assetsDir: () => path.join(appRoot(), 'assets'),
  systemTemplatesDir: () => path.join(appRoot(), 'assets', 'templates'),
  examplesDir: () => path.join(appRoot(), 'assets', 'examples'),
  docsDir: () => path.join(appRoot(), 'docs'),
  userTemplatesDir: () => ensureDir(path.join(userDataRoot(), 'templates')),
  userTemplatesHistoryDir: (id) => ensureDir(path.join(userDataRoot(), 'templates', 'history', id)),
  profilesDir: () => ensureDir(path.join(userDataRoot(), 'profiles')),
  bridgeDir: () => ensureDir(path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'productcanvas-ai', 'bridge')),
  sessionPath: () => path.join(userDataRoot(), 'session.json'),
  recentPath: () => path.join(userDataRoot(), 'recent.json'),
  defaultsPath: () => path.join(userDataRoot(), 'defaults.json'),
  userTemplatesRegistryPath: () => path.join(userDataRoot(), 'user-templates.json'),
  bridgeStatePath: () => path.join(userDataRoot(), 'bridge-state.json'),
  tempPreviewDir: () => ensureDir(path.join(userDataRoot(), 'temp-previews')),
};

module.exports = paths;
