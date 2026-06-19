'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const paths = require('../paths');
const { isImagePath } = require('../generate/image-prep');

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

class EffectRegistry {
  constructor() {
    this.ensureUserRegistry();
    fs.mkdirSync(paths.userEffectsDir(), { recursive: true });
  }

  ensureUserRegistry() {
    const p = paths.userEffectsRegistryPath();
    if (!fs.existsSync(p)) {
      writeJson(p, { effects: [] });
    }
  }

  getUserRegistry() {
    return readJson(paths.userEffectsRegistryPath(), { effects: [] });
  }

  saveUserRegistry(data) {
    writeJson(paths.userEffectsRegistryPath(), data);
  }

  resolveEffectPath(effect) {
    return path.join(paths.userEffectsDir(), effect.file);
  }

  async readEffectDimensions(filePath) {
    if (!filePath || !fs.existsSync(filePath) || !isImagePath(filePath)) {
      return null;
    }
    const meta = await sharp(filePath).rotate().metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    if (!width || !height) return null;
    return { width, height };
  }

  async getDimensions(effect) {
    if (!effect) return null;
    const filePath = this.resolveEffectPath(effect);
    const fileDims = await this.readEffectDimensions(filePath);
    if (fileDims?.width && fileDims?.height) {
      if (effect.width !== fileDims.width || effect.height !== fileDims.height) {
        this.persistEffectDimensions(effect.id, fileDims);
        effect.width = fileDims.width;
        effect.height = fileDims.height;
      }
      return fileDims;
    }
    if (effect.width > 0 && effect.height > 0) {
      return { width: effect.width, height: effect.height };
    }
    return null;
  }

  persistEffectDimensions(id, dims) {
    const reg = this.getUserRegistry();
    const entry = reg.effects.find((e) => e.id === id);
    if (!entry || !dims?.width || !dims?.height) return;
    entry.width = dims.width;
    entry.height = dims.height;
    this.saveUserRegistry(reg);
  }

  pruneMissingEffects() {
    const reg = this.getUserRegistry();
    const before = reg.effects || [];
    const kept = [];
    const removedIds = [];
    for (const entry of before) {
      const filePath = this.resolveEffectPath(entry);
      if (fs.existsSync(filePath)) {
        kept.push(entry);
      } else {
        removedIds.push(entry.id);
      }
    }
    if (removedIds.length) {
      reg.effects = kept;
      this.saveUserRegistry(reg);
    }
    return { removedIds };
  }

  listAll() {
    this.pruneMissingEffects();
    return (this.getUserRegistry().effects || []).map((e) => ({
      ...e,
      path: path.join(paths.userEffectsDir(), e.file),
    }));
  }

  getById(id) {
    return this.listAll().find((e) => e.id === id) || null;
  }

  async normalizeEffectImage(sourcePath, destPath) {
    await sharp(sourcePath)
      .rotate()
      .png()
      .toFile(destPath);
  }

  async importFromFile(filePath, name, sourcePrompt = '') {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('Bilddatei nicht gefunden.');
    }
    if (!isImagePath(filePath)) {
      throw new Error('Nur PNG, JPG oder WebP können als Effektbild importiert werden.');
    }

    const newId = `effect-${crypto.randomUUID().slice(0, 8)}`;
    const fileName = `${newId}.png`;
    const destPath = path.join(paths.userEffectsDir(), fileName);
    await this.normalizeEffectImage(filePath, destPath);
    const dims = await this.readEffectDimensions(destPath);

    const entry = {
      id: newId,
      name: (name || path.basename(filePath, path.extname(filePath))).trim() || 'Importiertes Effektbild',
      file: fileName,
      sourcePrompt: String(sourcePrompt || '').trim(),
      sourceType: 'imported',
      width: dims?.width || 0,
      height: dims?.height || 0,
      importedFrom: path.basename(filePath),
      createdAt: new Date().toISOString(),
    };
    const reg = this.getUserRegistry();
    reg.effects.push(entry);
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

  async saveGeneratedEffect({ previewPath, name, sourcePrompt, size }) {
    if (!previewPath || !fs.existsSync(previewPath)) {
      throw new Error('Keine gültige Effekt-Vorschau zum Speichern.');
    }
    const newId = `effect-${crypto.randomUUID().slice(0, 8)}`;
    const fileName = `${newId}.png`;
    const destPath = path.join(paths.userEffectsDir(), fileName);
    fs.copyFileSync(previewPath, destPath);
    const dims = await this.readEffectDimensions(destPath);

    const entry = {
      id: newId,
      name: String(name || sourcePrompt || 'Effektbild').trim().slice(0, 80) || 'Effektbild',
      file: fileName,
      sourcePrompt: String(sourcePrompt || '').trim(),
      sourceType: 'generated',
      width: dims?.width || 0,
      height: dims?.height || 0,
      generatedSize: size || '',
      createdAt: new Date().toISOString(),
    };
    const reg = this.getUserRegistry();
    reg.effects.push(entry);
    this.saveUserRegistry(reg);
    return { ...entry, path: destPath };
  }

  deleteEffect(id) {
    const reg = this.getUserRegistry();
    const idx = reg.effects.findIndex((e) => e.id === id);
    if (idx < 0) throw new Error('Effektbild nicht gefunden.');
    const entry = reg.effects[idx];
    const filePath = path.join(paths.userEffectsDir(), entry.file);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    reg.effects.splice(idx, 1);
    this.saveUserRegistry(reg);
    return { success: true };
  }

  renameEffect(id, name) {
    const reg = this.getUserRegistry();
    const entry = reg.effects.find((e) => e.id === id);
    if (!entry) throw new Error('Effektbild nicht gefunden.');
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Name darf nicht leer sein.');
    entry.name = trimmed;
    this.saveUserRegistry(reg);
    return entry;
  }

  reorderEffects(orderedIds) {
    const ids = (orderedIds || []).map((id) => String(id || '').trim()).filter(Boolean);
    if (!ids.length) return this.listAll();
    const reg = this.getUserRegistry();
    const byId = new Map(reg.effects.map((entry) => [entry.id, entry]));
    const reordered = [];
    for (const id of ids) {
      if (byId.has(id)) {
        reordered.push(byId.get(id));
        byId.delete(id);
      }
    }
    for (const entry of reg.effects) {
      if (byId.has(entry.id)) reordered.push(entry);
    }
    reg.effects = reordered;
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
    const entry = (reg.effects || []).find((e) => e.id === id);
    if (!entry) return { dataUrl: null, pruned: false };
    const filePath = this.resolveEffectPath(entry);
    if (!fs.existsSync(filePath)) {
      const { removedIds } = this.pruneMissingEffects();
      return { dataUrl: null, pruned: removedIds.length > 0 };
    }
    return { dataUrl: this.imageToDataUrl(filePath), pruned: false };
  }
}

module.exports = { EffectRegistry };
