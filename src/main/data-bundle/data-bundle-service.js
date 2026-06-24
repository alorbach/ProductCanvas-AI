'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const archiver = require('archiver');
const extract = require('extract-zip');
const paths = require('../paths');
const { DEFAULTS } = require('../profiles/profile-store');
const { migrateReferenceImages } = require('../generate/reference-roles');
const { isImagePath } = require('../generate/image-prep');

const BUNDLE_FORMAT = 'productcanvas-session-bundle';
const BUNDLE_VERSION = 1;

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function getAppVersion() {
  try {
    return require('../../../package.json').version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function sanitizeFileStem(value, fallback = 'Session') {
  const stem = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return stem || fallback;
}

function defaultExportFileName(session) {
  const date = new Date().toISOString().slice(0, 10);
  const label = sanitizeFileStem(session?.profileName || session?.brandName || session?.seriesName, 'Session');
  return `ProductCanvas-Session-${label}-${date}.zip`;
}

function sessionSettings(session) {
  const { dirty, profilePath, ...data } = session || {};
  return { ...data };
}

function uniqueArchiveName(used, preferred, fallbackExt = '.png') {
  let name = path.basename(preferred || `file${fallbackExt}`);
  if (!path.extname(name)) name += fallbackExt;
  const stem = path.basename(name, path.extname(name));
  const ext = path.extname(name);
  let candidate = name;
  let suffix = 1;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${stem}-${suffix}${ext}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function buildSessionManifest(session, templateRegistry, effectRegistry) {
  const settings = sessionSettings(session);
  const usedNames = new Set();
  const templates = [];
  const effects = [];
  const fileEntries = [];

  if (settings.templateId) {
    const entry = templateRegistry.getById(settings.templateId);
    const filePath = entry ? templateRegistry.resolveTemplatePath(entry) : null;
    if (entry?.id && entry?.file && filePath && fs.existsSync(filePath)) {
      templates.push(entry);
      fileEntries.push({ archivePath: `templates/${entry.file}`, sourcePath: filePath });
    }
  }

  if (settings.effectId) {
    const entry = effectRegistry.getById(settings.effectId);
    const filePath = entry ? effectRegistry.resolveEffectPath(entry) : null;
    if (entry?.id && entry?.file && filePath && fs.existsSync(filePath)) {
      effects.push(entry);
      fileEntries.push({ archivePath: `effects/${entry.file}`, sourcePath: filePath });
    }
  }

  const exportedRefs = [];
  for (const ref of settings.referenceImages || []) {
    if (!ref?.path || !fs.existsSync(ref.path) || !isImagePath(ref.path)) continue;
    const archiveName = uniqueArchiveName(usedNames, ref.name || ref.path, path.extname(ref.path) || '.png');
    const archivePath = `references/${archiveName}`;
    exportedRefs.push({
      archivePath,
      name: ref.name || archiveName,
      role: ref.role || 'detail',
    });
    fileEntries.push({ archivePath, sourcePath: ref.path });
  }
  settings.referenceImages = exportedRefs;

  const pathFields = [
    ['lastPreviewPath', 'previews'],
    ['editorReferenceImagePath', 'editor-refs'],
    ['effectEditorReferenceImagePath', 'effect-editor-refs'],
  ];
  for (const [field, folder] of pathFields) {
    const sourcePath = settings[field];
    if (!sourcePath || !fs.existsSync(sourcePath) || !isImagePath(sourcePath)) {
      settings[field] = '';
      continue;
    }
    const archiveName = uniqueArchiveName(usedNames, path.basename(sourcePath), path.extname(sourcePath) || '.png');
    const archivePath = `${folder}/${archiveName}`;
    settings[field] = archivePath;
    fileEntries.push({ archivePath, sourcePath });
  }

  settings.previewPendingEdit = null;

  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: getAppVersion(),
    name: session?.profileName || session?.brandName || 'Session',
    session: settings,
    templates,
    effects,
    fileEntries,
  };
}

function exportToFile(destZipPath, session, templateRegistry, effectRegistry) {
  return new Promise((resolve, reject) => {
    const manifest = buildSessionManifest(session, templateRegistry, effectRegistry);
    const output = fs.createWriteStream(destZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      resolve({
        path: destZipPath,
        templateCount: manifest.templates.length,
        effectCount: manifest.effects.length,
        referenceCount: manifest.session.referenceImages?.length || 0,
        bytes: archive.pointer(),
      });
    });
    archive.on('error', reject);
    output.on('error', reject);

    archive.pipe(output);
    const { fileEntries, ...jsonManifest } = manifest;
    archive.append(JSON.stringify(jsonManifest, null, 2), { name: 'data.json' });
    for (const entry of fileEntries) {
      archive.file(entry.sourcePath, { name: entry.archivePath });
    }
    archive.finalize();
  });
}

function validateManifest(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid session bundle: missing data.json.');
  }
  if (data.format !== BUNDLE_FORMAT) {
    throw new Error(`Invalid session bundle format: ${data.format || '(none)'}.`);
  }
  if (data.version !== BUNDLE_VERSION) {
    throw new Error(`Unsupported session bundle version: ${data.version}.`);
  }
  if (!data.session || typeof data.session !== 'object') {
    throw new Error('Invalid session bundle: session data missing.');
  }
  if (!Array.isArray(data.templates) || !Array.isArray(data.effects)) {
    throw new Error('Invalid session bundle: templates/effects must be arrays.');
  }
  return data;
}

function shouldSkipEntry(entry, registryItems, destDir) {
  if (!entry?.id || !entry?.file) return true;
  if (registryItems.some((item) => item.id === entry.id)) return true;
  const destPath = path.join(destDir, entry.file);
  if (fs.existsSync(destPath)) return true;
  return false;
}

function importRegistryEntries(manifest, tempDir, templateRegistry, effectRegistry) {
  const templateReg = templateRegistry.getUserRegistry();
  const effectReg = effectRegistry.getUserRegistry();
  const result = {
    importedTemplates: 0,
    skippedTemplates: 0,
    importedEffects: 0,
    skippedEffects: 0,
  };

  fs.mkdirSync(paths.userTemplatesDir(), { recursive: true });
  fs.mkdirSync(paths.userEffectsDir(), { recursive: true });

  for (const entry of manifest.templates) {
    if (shouldSkipEntry(entry, templateReg.templates, paths.userTemplatesDir())) {
      result.skippedTemplates += 1;
      continue;
    }
    const srcPath = path.join(tempDir, 'templates', entry.file);
    if (!fs.existsSync(srcPath)) {
      result.skippedTemplates += 1;
      continue;
    }
    fs.copyFileSync(srcPath, path.join(paths.userTemplatesDir(), entry.file));
    templateReg.templates.push({ ...entry });
    result.importedTemplates += 1;
  }

  for (const entry of manifest.effects) {
    if (shouldSkipEntry(entry, effectReg.effects, paths.userEffectsDir())) {
      result.skippedEffects += 1;
      continue;
    }
    const srcPath = path.join(tempDir, 'effects', entry.file);
    if (!fs.existsSync(srcPath)) {
      result.skippedEffects += 1;
      continue;
    }
    fs.copyFileSync(srcPath, path.join(paths.userEffectsDir(), entry.file));
    effectReg.effects.push({ ...entry });
    result.importedEffects += 1;
  }

  if (result.importedTemplates > 0) templateRegistry.saveUserRegistry(templateReg);
  if (result.importedEffects > 0) effectRegistry.saveUserRegistry(effectReg);
  return result;
}

function restoreArchivedFile(tempDir, archivePath, importDir) {
  if (!archivePath) return '';
  const srcPath = path.join(tempDir, archivePath);
  if (!fs.existsSync(srcPath)) return '';
  const destPath = path.join(importDir, path.basename(archivePath));
  fs.copyFileSync(srcPath, destPath);
  return destPath;
}

function restoreSession(manifest, tempDir) {
  const importDir = path.join(paths.tempPreviewDir(), `session-import-${Date.now()}`);
  fs.mkdirSync(importDir, { recursive: true });

  const restored = { ...DEFAULTS, ...manifest.session };
  restored.referenceImages = migrateReferenceImages(
    (manifest.session.referenceImages || []).map((ref) => ({
      path: restoreArchivedFile(tempDir, ref.archivePath, importDir),
      name: ref.name || path.basename(ref.archivePath || ''),
      role: ref.role || 'detail',
    })).filter((ref) => ref.path),
  );
  restored.lastPreviewPath = restoreArchivedFile(tempDir, manifest.session.lastPreviewPath, importDir);
  restored.editorReferenceImagePath = restoreArchivedFile(
    tempDir,
    manifest.session.editorReferenceImagePath,
    importDir,
  );
  restored.effectEditorReferenceImagePath = restoreArchivedFile(
    tempDir,
    manifest.session.effectEditorReferenceImagePath,
    importDir,
  );
  restored.previewPendingEdit = null;
  restored.profileName = manifest.name || restored.profileName || '';
  return restored;
}

async function importFromFile(zipPath, templateRegistry, effectRegistry) {
  if (!zipPath || !fs.existsSync(zipPath)) {
    throw new Error('ZIP file not found.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-session-import-'));
  try {
    await extract(zipPath, { dir: tempDir });
    const manifestPath = path.join(tempDir, 'data.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('Invalid session bundle: data.json not found.');
    }
    const manifest = validateManifest(readJson(manifestPath, null));
    const result = importRegistryEntries(manifest, tempDir, templateRegistry, effectRegistry);
    const session = restoreSession(manifest, tempDir);
    return {
      ...result,
      session,
      name: manifest.name || session.profileName || 'Session',
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  exportToFile,
  importFromFile,
  defaultExportFileName,
  buildSessionManifest,
};
