'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const archiver = require('archiver');
const extract = require('extract-zip');
const paths = require('../paths');
const { DEFAULTS } = require('../profiles/profile-store');
const { migrateReferenceImages } = require('../generate/reference-roles');
const { isImagePath } = require('../generate/image-prep');

const execFileAsync = promisify(execFile);
const EXTRACT_TIMEOUT_MS = 60_000;

const BUNDLE_FORMAT = 'productcanvas-session-bundle';
const BUNDLE_VERSION = 1;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

async function extractZipToDir(zipPath, destDir) {
  if (process.platform === 'win32') {
    await execFileAsync('tar', ['-xf', zipPath, '-C', destDir], {
      windowsHide: true,
      timeout: EXTRACT_TIMEOUT_MS,
    });
    return;
  }
  await withTimeout(extract(zipPath, { dir: destDir }), EXTRACT_TIMEOUT_MS, 'ZIP extract');
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function importSummary(result) {
  return {
    importedTemplates: result.importedTemplates,
    skippedTemplates: result.skippedTemplates,
    importedEffects: result.importedEffects,
    skippedEffects: result.skippedEffects,
    name: result.name || result.session?.profileName || 'Session',
  };
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

function archiveRefName(index, sourcePath) {
  const ext = path.extname(sourcePath || '') || '.png';
  return `ref-${index}${ext.toLowerCase()}`;
}

function archivePreviewName(sourcePath) {
  const ext = path.extname(sourcePath || '') || '.png';
  return `preview${ext.toLowerCase()}`;
}

function archiveEditorRefName(field, sourcePath) {
  const ext = path.extname(sourcePath || '') || '.png';
  const key = field === 'editorReferenceImagePath' ? 'editor-ref' : 'effect-editor-ref';
  return `${key}${ext.toLowerCase()}`;
}

function buildSessionManifest(session, templateRegistry, effectRegistry) {
  const settings = sessionSettings(session);
  const templates = [];
  const effects = [];
  const fileEntries = [];

  if (settings.templateId) {
    const entry = templateRegistry.getById(settings.templateId);
    const filePath = entry ? templateRegistry.resolveTemplatePath(entry) : null;
    if (entry?.id && entry?.file && filePath && fs.existsSync(filePath)) {
      const { path: _path, ...cleanEntry } = entry;
      templates.push(cleanEntry);
      fileEntries.push({ archivePath: `templates/${entry.file}`, sourcePath: filePath });
    }
  }

  if (settings.effectId) {
    const entry = effectRegistry.getById(settings.effectId);
    const filePath = entry ? effectRegistry.resolveEffectPath(entry) : null;
    if (entry?.id && entry?.file && filePath && fs.existsSync(filePath)) {
      const { path: _path, ...cleanEntry } = entry;
      effects.push(cleanEntry);
      fileEntries.push({ archivePath: `effects/${entry.file}`, sourcePath: filePath });
    }
  }

  const exportedRefs = [];
  for (const ref of settings.referenceImages || []) {
    if (!ref?.path || !fs.existsSync(ref.path) || !isImagePath(ref.path)) continue;
    const archiveName = archiveRefName(exportedRefs.length, ref.path);
    const archivePath = `references/${archiveName}`;
    exportedRefs.push({
      archivePath,
      name: ref.name || path.basename(ref.path),
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
    const archiveName = field === 'lastPreviewPath'
      ? archivePreviewName(sourcePath)
      : archiveEditorRefName(field, sourcePath);
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

function importAssetEntry(entry, registryItems, destDir, tempSubDir) {
  if (!entry?.id || !entry?.file) return 'skipped';

  const destPath = path.join(destDir, entry.file);
  const srcPath = path.join(tempSubDir, entry.file);
  const existingIdx = registryItems.findIndex((item) => item.id === entry.id);
  const fileOnDisk = fs.existsSync(destPath);
  const fileInZip = fs.existsSync(srcPath);
  const cleanEntry = { ...entry };
  delete cleanEntry.path;

  if (existingIdx >= 0) {
    if (!fileOnDisk && fileInZip) {
      fs.copyFileSync(srcPath, destPath);
      return 'restored';
    }
    return 'skipped';
  }

  if (fileOnDisk) {
    registryItems.push(cleanEntry);
    return 'imported';
  }

  if (!fileInZip) {
    return 'skipped';
  }

  fs.copyFileSync(srcPath, destPath);
  registryItems.push(cleanEntry);
  return 'imported';
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
    const status = importAssetEntry(
      entry,
      templateReg.templates,
      paths.userTemplatesDir(),
      path.join(tempDir, 'templates'),
    );
    if (status === 'imported' || status === 'restored') {
      result.importedTemplates += 1;
    } else {
      result.skippedTemplates += 1;
    }
  }

  for (const entry of manifest.effects) {
    const status = importAssetEntry(
      entry,
      effectReg.effects,
      paths.userEffectsDir(),
      path.join(tempDir, 'effects'),
    );
    if (status === 'imported' || status === 'restored') {
      result.importedEffects += 1;
    } else {
      result.skippedEffects += 1;
    }
  }

  if (result.importedTemplates > 0) templateRegistry.saveUserRegistry(templateReg);
  if (result.importedEffects > 0) effectRegistry.saveUserRegistry(effectReg);
  return result;
}

function resolveArchivedSource(tempDir, archivePath) {
  if (!archivePath) return '';
  const direct = path.join(tempDir, archivePath);
  if (fs.existsSync(direct)) return direct;

  const folder = path.dirname(archivePath);
  const base = path.basename(archivePath);
  const dir = path.join(tempDir, folder);
  if (!fs.existsSync(dir)) return '';

  const entries = fs.readdirSync(dir);
  const caseMatch = entries.find((name) => name.toLowerCase() === base.toLowerCase());
  if (caseMatch) return path.join(dir, caseMatch);
  if (entries.length === 1) return path.join(dir, entries[0]);
  return '';
}

function restoreArchivedFile(tempDir, archivePath, importDir) {
  const srcPath = resolveArchivedSource(tempDir, archivePath);
  if (!srcPath) return '';
  const destPath = path.join(importDir, path.basename(archivePath) || path.basename(srcPath));
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
    await extractZipToDir(zipPath, tempDir);
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
  importSummary,
  defaultExportFileName,
  buildSessionManifest,
};
