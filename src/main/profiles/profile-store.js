'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../paths');

const DEFAULTS = {
  templateId: '',
  mode: 'werbung',
  size: 'template',
  quality: 'high',
  bridgeUrl: 'http://127.0.0.1:8765',
  uiLocale: 'auto',
  productCategory: 'LAUTSPRECHER',
  brandName: '',
  seriesName: '',
  tagline: '',
  extraPrompt: '',
  internalComment: '',
  referenceImages: [],
  lastPreviewPath: '',
  imagePrompt: '',
  productDescription: '',
  placementInstructions: '',
  productAnalysis: '',
  promptFingerprint: '',
  preflightPrompt: '',
  preflightFingerprint: '',
};

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function profileBaseName(filePath) {
  const base = path.basename(filePath);
  if (base.endsWith('.pcprofile.json')) return base.slice(0, -'.pcprofile.json'.length);
  if (base.endsWith('.wmprofile.json')) return base.slice(0, -'.wmprofile.json'.length);
  return path.basename(filePath, path.extname(filePath));
}

class ProfileStore {
  constructor() {
    fs.mkdirSync(paths.userDataRoot(), { recursive: true });
    fs.mkdirSync(paths.profilesDir(), { recursive: true });
    if (!fs.existsSync(paths.defaultsPath())) {
      writeJson(paths.defaultsPath(), DEFAULTS);
    }
  }

  getDefaults() {
    return { ...DEFAULTS, ...readJson(paths.defaultsPath(), DEFAULTS) };
  }

  loadSession() {
    const session = readJson(paths.sessionPath(), null);
    if (!session) {
      return { ...this.getDefaults(), dirty: false, profilePath: '' };
    }
    return { ...this.getDefaults(), ...session, dirty: false };
  }

  saveSession(session) {
    const { dirty, profilePath, ...data } = session;
    writeJson(paths.sessionPath(), data);
    return data;
  }

  loadProfile(filePath) {
    const data = readJson(filePath, null);
    if (!data) throw new Error('Profil konnte nicht geladen werden.');
    return { ...this.getDefaults(), ...data.settings, profilePath: filePath, profileName: data.name || '' };
  }

  saveProfile(filePath, session, name) {
    const profileDir = path.join(path.dirname(filePath), profileBaseName(filePath));
    fs.mkdirSync(profileDir, { recursive: true });
    const refs = [];
    for (const ref of session.referenceImages || []) {
      if (ref.path && fs.existsSync(ref.path)) {
        const destName = path.basename(ref.path);
        const dest = path.join(profileDir, destName);
        if (path.resolve(ref.path) !== path.resolve(dest)) {
          fs.copyFileSync(ref.path, dest);
        }
        refs.push({ ...ref, path: dest });
      }
    }
    const data = {
      name: name || session.profileName || 'Profil',
      version: 1,
      savedAt: new Date().toISOString(),
      settings: { ...session, referenceImages: refs },
    };
    writeJson(filePath, data);
    this.addRecent(filePath, data.name);
    return { path: filePath, name: data.name };
  }

  addRecent(filePath, name) {
    const recent = readJson(paths.recentPath(), { items: [] });
    recent.items = [{ path: filePath, name, openedAt: new Date().toISOString() },
      ...recent.items.filter((i) => i.path !== filePath)].slice(0, 10);
    writeJson(paths.recentPath(), recent);
  }

  listRecent() {
    return readJson(paths.recentPath(), { items: [] }).items.filter((i) => fs.existsSync(i.path));
  }

  newSession() {
    return { ...this.getDefaults(), dirty: false, profilePath: '', profileName: '' };
  }
}

module.exports = { ProfileStore, DEFAULTS };
