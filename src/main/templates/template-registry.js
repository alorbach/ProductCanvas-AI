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
  stageHint: 'Retail layout template with product stage and footer',
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

  async readTemplateDimensions(filePath) {
    if (!filePath || !fs.existsSync(filePath) || !isImagePath(filePath)) {
      return null;
    }
    const meta = await sharp(filePath).rotate().metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    if (!width || !height) return null;
    return { width, height };
  }

  async getDimensions(template) {
    if (!template) return null;
    const filePath = this.resolveTemplatePath(template);
    const fileDims = await this.readTemplateDimensions(filePath);
    if (fileDims?.width && fileDims?.height) {
      if (template.width !== fileDims.width || template.height !== fileDims.height) {
        this.persistTemplateDimensions(template.id, fileDims);
        template.width = fileDims.width;
        template.height = fileDims.height;
      }
      return fileDims;
    }
    if (template.width > 0 && template.height > 0) {
      return { width: template.width, height: template.height };
    }
    return null;
  }

  persistTemplateDimensions(id, dims) {
    const reg = this.getUserRegistry();
    const entry = reg.templates.find((t) => t.id === id);
    if (!entry || !dims?.width || !dims?.height) return;
    entry.width = dims.width;
    entry.height = dims.height;
    this.saveUserRegistry(reg);
  }

  pruneMissingTemplates() {
    const reg = this.getUserRegistry();
    const before = reg.templates || [];
    const kept = [];
    const removedIds = [];
    for (const entry of before) {
      const filePath = this.resolveTemplatePath(entry);
      if (fs.existsSync(filePath)) {
        kept.push(entry);
      } else {
        removedIds.push(entry.id);
      }
    }
    if (removedIds.length) {
      reg.templates = kept;
      this.saveUserRegistry(reg);
    }
    return { removedIds };
  }

  listAll() {
    this.pruneMissingTemplates();
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
    if (!fs.existsSync(srcPath)) {
      throw new Error('Vorlagendatei nicht gefunden.');
    }
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
      width: source.width || 0,
      height: source.height || 0,
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

  /** EXIF straighten + PNG speichern – Auflösung bleibt unverändert (Skalierung nur im Editor). */
  async normalizeTemplateImage(sourcePath, destPath) {
    await sharp(sourcePath)
      .rotate()
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
    const dims = await this.readTemplateDimensions(destPath);

    const entry = {
      id: newId,
      name: (name || path.basename(filePath, path.extname(filePath))).trim() || 'Importierte Vorlage',
      file: fileName,
      type: 'user',
      parentId: null,
      width: dims?.width || 0,
      height: dims?.height || 0,
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
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Vorlagenname darf nicht leer sein.');
    entry.name = trimmed;
    this.saveUserRegistry(reg);
    return entry;
  }

  reorderTemplates(orderedIds) {
    const ids = (orderedIds || []).map((id) => String(id || '').trim()).filter(Boolean);
    if (!ids.length) return this.listAll();
    const reg = this.getUserRegistry();
    const byId = new Map(reg.templates.map((entry) => [entry.id, entry]));
    const reordered = [];
    for (const id of ids) {
      if (byId.has(id)) {
        reordered.push(byId.get(id));
        byId.delete(id);
      }
    }
    for (const entry of reg.templates) {
      if (byId.has(entry.id)) reordered.push(entry);
    }
    reg.templates = reordered;
    this.saveUserRegistry(reg);
    return this.listAll();
  }

  imageToDataUrl(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    const b64 = fs.readFileSync(filePath).toString('base64');
    return `data:${mime};base64,${b64}`;
  }

  getImageDataUrl(id) {
    const reg = this.getUserRegistry();
    const entry = (reg.templates || []).find((t) => t.id === id);
    if (!entry) return { dataUrl: null, pruned: false };
    const filePath = this.resolveTemplatePath(entry);
    if (!fs.existsSync(filePath)) {
      const { removedIds } = this.pruneMissingTemplates();
      return { dataUrl: null, pruned: removedIds.length > 0 };
    }
    return { dataUrl: this.imageToDataUrl(filePath), pruned: false };
  }
}

module.exports = { TemplateRegistry, DEFAULT_TEMPLATE_META };
