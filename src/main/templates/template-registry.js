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
  // Coordinates relative to REFERENCE_CANVAS; scaled to real template size on import.
  // Leaves ~19.5% header and ~26.8% footer so contact bar + category row stay frozen.
  productStage: { x: 48, y: 200, width: 1440, height: 550 },
  categories: ['TV', 'BEAMER', 'LEINWÄNDE', 'LAUTSPRECHER', 'AV-RECEIVER', 'SUBWOOFER', 'KINOSESSEL'],
};

/** Default productStage / textZones are authored for this canvas size. */
const REFERENCE_CANVAS = { width: 1536, height: 1024 };

function clampProductStage(stage, canvasW, canvasH) {
  if (!stage || !canvasW || !canvasH) return stage || null;
  const x = Math.max(0, Math.min(Number(stage.x) || 0, canvasW - 1));
  const y = Math.max(0, Math.min(Number(stage.y) || 0, canvasH - 1));
  const width = Math.max(1, Math.min(Number(stage.width) || 1, canvasW - x));
  const height = Math.max(1, Math.min(Number(stage.height) || 1, canvasH - y));
  return { x, y, width, height };
}

/**
 * Fit a productStage defined on REFERENCE_CANVAS onto an actual template size,
 * preserving header/footer band fractions so Kopf and Fußzeile stay outside the stage.
 */
function fitProductStageToCanvas(stage, canvasW, canvasH, refW = REFERENCE_CANVAS.width, refH = REFERENCE_CANVAS.height) {
  if (!stage || !canvasW || !canvasH || !refW || !refH) {
    return clampProductStage(stage, canvasW, canvasH);
  }
  const headerFrac = Math.max(0, (Number(stage.y) || 0) / refH);
  const footerFrac = Math.max(0, (refH - ((Number(stage.y) || 0) + (Number(stage.height) || 0))) / refH);
  const y = Math.round(headerFrac * canvasH);
  const bottomReserve = Math.round(footerFrac * canvasH);
  const height = Math.max(1, canvasH - y - bottomReserve);
  const x = Math.round((Number(stage.x) || 0) * canvasW / refW);
  const width = Math.round((Number(stage.width) || refW) * canvasW / refW);
  return clampProductStage({ x, y, width, height }, canvasW, canvasH);
}

function scaleTextZonesToCanvas(textZones, canvasW, canvasH, refW = REFERENCE_CANVAS.width, refH = REFERENCE_CANVAS.height) {
  if (!textZones || !canvasW || !canvasH) return textZones;
  const out = {};
  for (const [key, zone] of Object.entries(textZones)) {
    if (!zone || typeof zone !== 'object') {
      out[key] = zone;
      continue;
    }
    out[key] = {
      ...zone,
      x: Math.round((Number(zone.x) || 0) * canvasW / refW),
      y: Math.round((Number(zone.y) || 0) * canvasH / refH),
    };
  }
  return out;
}

function looksLikeUnscaledReferenceStage(stage, canvasW, canvasH) {
  if (!stage || !canvasW || !canvasH) return false;
  const canvasDiffers = canvasW !== REFERENCE_CANVAS.width || canvasH !== REFERENCE_CANVAS.height;
  if (!canvasDiffers) return false;

  const def = DEFAULT_TEMPLATE_META.productStage;
  const x = Number(stage.x) || 0;
  const y = Number(stage.y) || 0;
  const w = Number(stage.width) || 0;
  const h = Number(stage.height) || 0;
  const matchesDefaultXY = Math.abs(x - def.x) < 2 && Math.abs(y - def.y) < 2;
  // Current default width 1440; accept legacy default height 580 as well as 550.
  const matchesDefaultW = Math.abs(w - def.width) < 2 || Math.abs(w - 1440) < 2;
  const matchesDefaultH = Math.abs(h - def.height) < 2 || Math.abs(h - 580) < 2;
  return matchesDefaultXY && matchesDefaultW && matchesDefaultH;
}

function productStageNeedsRefit(stage, canvasW, canvasH) {
  if (!stage || !canvasW || !canvasH) return false;
  const x = Number(stage.x) || 0;
  const y = Number(stage.y) || 0;
  const w = Number(stage.width) || 0;
  const h = Number(stage.height) || 0;
  if (x < 0 || y < 0 || w < 1 || h < 1) return true;
  if (x + w > canvasW || y + h > canvasH) return true;
  // Unscaled reference-sized stage on a different canvas (smaller or larger than 1536×1024).
  if (looksLikeUnscaledReferenceStage(stage, canvasW, canvasH)) {
    return true;
  }
  return false;
}

function normalizeTemplateStageMeta(template) {
  if (!template?.productStage || !template.width || !template.height) return template;
  // Versioned coordinate space: do not re-interpret custom stages after import/migration.
  if (Number(template.stageSpaceVersion) === 1) {
    const overflow = productStageNeedsRefit(template.productStage, template.width, template.height)
      && !looksLikeUnscaledReferenceStage(template.productStage, template.width, template.height);
    if (!overflow) return template;
    return {
      ...template,
      productStage: clampProductStage(template.productStage, template.width, template.height),
      stageSpaceVersion: 1,
    };
  }
  if (!productStageNeedsRefit(template.productStage, template.width, template.height)) {
    return template;
  }
  return {
    ...template,
    productStage: fitProductStageToCanvas(
      DEFAULT_TEMPLATE_META.productStage,
      template.width,
      template.height,
    ),
    stageSpaceVersion: 1,
  };
}

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
    return (this.getUserRegistry().templates || []).map((t) => {
      const enriched = enrichTemplateMeta({
        ...t,
        type: 'user',
        path: path.join(paths.userTemplatesDir(), t.file),
      });
      return normalizeTemplateStageMeta(enriched);
    });
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
      stageSpaceVersion: source.stageSpaceVersion || 1,
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
    const canvasW = dims?.width || 0;
    const canvasH = dims?.height || 0;
    const productStage = canvasW && canvasH
      ? fitProductStageToCanvas(templateMeta.productStage, canvasW, canvasH)
      : templateMeta.productStage;
    const textZones = canvasW && canvasH
      ? scaleTextZonesToCanvas(templateMeta.textZones, canvasW, canvasH)
      : templateMeta.textZones;

    const entry = {
      id: newId,
      name: (name || path.basename(filePath, path.extname(filePath))).trim() || 'Importierte Vorlage',
      file: fileName,
      type: 'user',
      parentId: null,
      width: canvasW,
      height: canvasH,
      accent: templateMeta.accent,
      accentHex: templateMeta.accentHex,
      textGold: templateMeta.textGold,
      stageHint: templateMeta.stageHint,
      textZones,
      productStage,
      stageSpaceVersion: 1,
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

module.exports = {
  TemplateRegistry,
  DEFAULT_TEMPLATE_META,
  REFERENCE_CANVAS,
  clampProductStage,
  fitProductStageToCanvas,
  looksLikeUnscaledReferenceStage,
  normalizeTemplateStageMeta,
  productStageNeedsRefit,
  scaleTextZonesToCanvas,
};
