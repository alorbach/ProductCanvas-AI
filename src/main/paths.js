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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const paths = {
  appRoot,
  userDataRoot() {
    try {
      return require('electron').app.getPath('userData');
    } catch {
      return path.join(os.homedir(), 'AppData', 'Roaming', 'productcanvas-ai');
    }
  },
  assetsDir: () => path.join(appRoot(), 'assets'),
  systemTemplatesDir: () => path.join(appRoot(), 'assets', 'templates'),
  examplesDir: () => path.join(appRoot(), 'assets', 'examples'),
  docsDir: () => path.join(appRoot(), 'docs'),
  bridgeDir: () => ensureDir(path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'productcanvas-ai', 'bridge')),
};

paths.userTemplatesDir = () => ensureDir(path.join(paths.userDataRoot(), 'templates'));
paths.userTemplatesHistoryDir = (id) => ensureDir(path.join(paths.userDataRoot(), 'templates', 'history', id));
paths.profilesDir = () => ensureDir(path.join(paths.userDataRoot(), 'profiles'));
paths.sessionPath = () => path.join(paths.userDataRoot(), 'session.json');
paths.recentPath = () => path.join(paths.userDataRoot(), 'recent.json');
paths.defaultsPath = () => path.join(paths.userDataRoot(), 'defaults.json');
paths.userTemplatesRegistryPath = () => path.join(paths.userDataRoot(), 'user-templates.json');
paths.userEffectsDir = () => ensureDir(path.join(paths.userDataRoot(), 'effects'));
paths.userEffectsHistoryDir = (id) => ensureDir(path.join(paths.userDataRoot(), 'effects', 'history', id));
paths.userEffectsRegistryPath = () => path.join(paths.userDataRoot(), 'user-effects.json');
paths.bridgeStatePath = () => path.join(paths.userDataRoot(), 'bridge-state.json');
paths.tempPreviewDir = () => ensureDir(path.join(paths.userDataRoot(), 'temp-previews'));

module.exports = paths;
