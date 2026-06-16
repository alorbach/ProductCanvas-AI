'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const paths = require('../paths');
const { isImagePath } = require('../generate/image-prep');
const { enrichTemplateMeta, inferAccentMeta } = require('./template-accent');

const DEFAULT_TEMPLATE_META = {
  accent: 'yellow',
  accentHex: '#FFD700',
  textGold: '#c9a227',
  stageHint: 'TELE-KOHLGRAF Werbevorlage mit Produktbühne und Footer',
  textZones: {
    brandName: { x: 80, y: 280, fontSize: 72, color: 'gold' },
    seriesName: { x: 80, y: 360, fontSize: 28 },
    tagline: { x: 80, y: 400, fontSize: 18 },
  },
  productStage: { x: 48, y: 200, width: 1440, height: 580 },
  categories: ['TV', 'BEAMER', 'LEINWÄNDE', 'LAUTSPRECHER', 'AV-RECEIVER', 'SUBWOOFER', 'KINOSESSEL'],
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

class TemplateRegistry {
  constructor() {
    this.ensureUserRegistry();
    fs.mkdirSync(paths.userTemplatesDir(), { recursive: true });
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
    return path.join(paths.userTemplatesDir(), template.file);
  }

  listAll() {
    return (this.getUserRegistry().templates || []).map((t) => enrichTemplateMeta({
      ...t,
      type: 'user',
      path: path.join(paths.userTemplatesDir(), t.file),
    }));
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
      productStage: source.productStage,
      categories: source.categories,
      createdAt: new Date().toISOString(),
    };
    const reg = this.getUserRegistry();
    reg.templates.push(entry);
    this.saveUserRegistry(reg);
    return { ...entry, path: destPath };
  }

  getDefaultTemplateMeta() {
    return { ...DEFAULT_TEMPLATE_META };
  }

  async normalizeTemplateImage(sourcePath, destPath) {
    await sharp(sourcePath)
      .rotate()
      .resize(1536, 1024, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toFile(destPath);
  }

  async importFromFile(filePath, name) {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('Bilddatei nicht gefunden.');
    }
    if (!isImagePath(filePath)) {
      throw new Error('Nur PNG, JPG oder WebP können als Vorlage importiert werden.');
    }

    const meta = this.getDefaultTemplateMeta();
    const inferred = inferAccentMeta(name || path.basename(filePath));
    const templateMeta = inferred ? { ...meta, ...inferred } : meta;
    const newId = `user-${crypto.randomUUID().slice(0, 8)}`;
    const fileName = `${newId}.png`;
    const destPath = path.join(paths.userTemplatesDir(), fileName);
    await this.normalizeTemplateImage(filePath, destPath);

    const entry = {
      id: newId,
      name: (name || path.basename(filePath, path.extname(filePath))).trim() || 'Importierte Vorlage',
      file: fileName,
      type: 'user',
      parentId: null,
      accent: templateMeta.accent,
      accentHex: templateMeta.accentHex,
      textGold: templateMeta.textGold,
      stageHint: templateMeta.stageHint,
      textZones: templateMeta.textZones,
      productStage: templateMeta.productStage,
      categories: templateMeta.categories,
      importedFrom: path.basename(filePath),
      createdAt: new Date().toISOString(),
    };
    const reg = this.getUserRegistry();
    reg.templates.push(entry);
    this.saveUserRegistry(reg);
    return { ...entry, path: destPath };
  }

  async importFromPaths(filePaths, name) {
    const valid = (filePaths || []).filter((p) => p && fs.existsSync(p) && isImagePath(p));
    if (!valid.length) {
      throw new Error('Keine gültigen Bilddateien zum Importieren.');
    }
    const imported = [];
    for (let i = 0; i < valid.length; i++) {
      imported.push(await this.importFromFile(valid[i], i === 0 ? name : undefined));
    }
    return imported;
  }

  deleteUserTemplate(id) {
    const reg = this.getUserRegistry();
    const idx = reg.templates.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error('Vorlage nicht gefunden.');
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
    if (!entry) throw new Error('Vorlage nicht gefunden.');
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

module.exports = { TemplateRegistry, DEFAULT_TEMPLATE_META };
