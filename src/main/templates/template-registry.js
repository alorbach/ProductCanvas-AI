'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const paths = require('../paths');

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

class TemplateRegistry {
  constructor() {
    this.systemMeta = readJson(path.join(paths.systemTemplatesDir(), 'templates.json'), { templates: [] });
    this.ensureUserRegistry();
  }

  ensureUserRegistry() {
    const p = paths.userTemplatesRegistryPath();
    if (!fs.existsSync(p)) {
      writeJson(p, { templates: [] });
    }
  }

  getUserRegistry() {
    return readJson(paths.userTemplatesRegistryPath(), { templates: [] });
  }

  saveUserRegistry(data) {
    writeJson(paths.userTemplatesRegistryPath(), data);
  }

  resolveTemplatePath(template) {
    if (template.type === 'system') {
      return path.join(paths.systemTemplatesDir(), template.file);
    }
    return path.join(paths.userTemplatesDir(), template.file);
  }

  listAll() {
    const system = (this.systemMeta.templates || []).map((t) => ({
      ...t,
      type: 'system',
      path: path.join(paths.systemTemplatesDir(), t.file),
    }));
    const user = (this.getUserRegistry().templates || []).map((t) => ({
      ...t,
      type: 'user',
      path: path.join(paths.userTemplatesDir(), t.file),
    }));
    return [...system, ...user];
  }

  getById(id) {
    return this.listAll().find((t) => t.id === id) || null;
  }

  clone(sourceId, name) {
    const source = this.getById(sourceId);
    if (!source) throw new Error('Vorlage nicht gefunden.');
    const srcPath = this.resolveTemplatePath(source);
    const newId = `user-${crypto.randomUUID().slice(0, 8)}`;
    const baseName = name || `${source.name} – Kopie`;
    const fileName = `${newId}.png`;
    const destPath = path.join(paths.userTemplatesDir(), fileName);
    fs.copyFileSync(srcPath, destPath);
    const entry = {
      id: newId,
      name: baseName,
      file: fileName,
      type: 'user',
      parentId: source.id,
      accent: source.accent,
      accentHex: source.accentHex,
      textGold: source.textGold,
      stageHint: source.stageHint,
      textZones: source.textZones,
      categories: source.categories,
      createdAt: new Date().toISOString(),
    };
    const reg = this.getUserRegistry();
    reg.templates.push(entry);
    this.saveUserRegistry(reg);
    return { ...entry, path: destPath };
  }

  importFromFile(filePath, name) {
    const newId = `user-${crypto.randomUUID().slice(0, 8)}`;
    const fileName = `${newId}.png`;
    const destPath = path.join(paths.userTemplatesDir(), fileName);
    fs.copyFileSync(filePath, destPath);
    const entry = {
      id: newId,
      name: name || path.basename(filePath, path.extname(filePath)),
      file: fileName,
      type: 'user',
      parentId: null,
      accent: 'blue',
      accentHex: '#31b4f2',
      textGold: '#c9a227',
      stageHint: 'Imported template',
      categories: ['TV', 'BEAMER', 'LEINWÄNDE', 'LAUTSPRECHER', 'AV-RECEIVER', 'SUBWOOFER', 'KINOSESSEL'],
      createdAt: new Date().toISOString(),
    };
    const reg = this.getUserRegistry();
    reg.templates.push(entry);
    this.saveUserRegistry(reg);
    return { ...entry, path: destPath };
  }

  deleteUserTemplate(id) {
    const reg = this.getUserRegistry();
    const idx = reg.templates.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error('Benutzer-Vorlage nicht gefunden.');
    const entry = reg.templates[idx];
    const filePath = path.join(paths.userTemplatesDir(), entry.file);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    reg.templates.splice(idx, 1);
    this.saveUserRegistry(reg);
    return { success: true };
  }

  renameUserTemplate(id, name) {
    const reg = this.getUserRegistry();
    const entry = reg.templates.find((t) => t.id === id);
    if (!entry) throw new Error('Benutzer-Vorlage nicht gefunden.');
    entry.name = name;
    this.saveUserRegistry(reg);
    return entry;
  }

  imageToDataUrl(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    const b64 = fs.readFileSync(filePath).toString('base64');
    return `data:${mime};base64,${b64}`;
  }
}

module.exports = { TemplateRegistry };
