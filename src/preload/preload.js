'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Sandboxed preload cannot require local sibling modules — keep in sync with dropped-files.js
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

function isDroppedImageFile(file, filePath) {
  const mime = String(file?.type || '').toLowerCase();
  if (IMAGE_MIME.has(mime)) return true;
  return Boolean(filePath && IMAGE_EXT.test(filePath));
}

function collectDroppedImagePaths(files, getPathForFile) {
  const paths = [];
  for (const file of files || []) {
    if (!file) continue;
    const filePath = getPathForFile(file);
    if (!filePath || !isDroppedImageFile(file, filePath)) continue;
    paths.push(filePath);
  }
  return paths;
}

contextBridge.exposeInMainWorld('productCanvas', {
  getBuildInfo: () => ipcRenderer.invoke('app:getBuildInfo'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  collectDroppedImagePaths: (files) => collectDroppedImagePaths(
    Array.from(files || []),
    (file) => webUtils.getPathForFile(file),
  ),
  getPreferences: () => ipcRenderer.invoke('app:getPreferences'),
  setPreferences: (patch) => ipcRenderer.invoke('app:setPreferences', patch),
  getCodexCliInfo: () => ipcRenderer.invoke('app:getCodexCliInfo'),
  pickCodexCliPath: () => ipcRenderer.invoke('app:pickCodexCliPath'),
  openSettings: () => ipcRenderer.invoke('app:openSettings'),
  bridgeGetStatus: () => ipcRenderer.invoke('bridge:getStatus'),
  codexGetRateLimits: (options) => ipcRenderer.invoke('codex:getRateLimits', options),
  bridgeEnsureReady: (code) => ipcRenderer.invoke('bridge:ensureReady', code),
  bridgeRequirePaired: (code) => ipcRenderer.invoke('bridge:requirePaired', code),
  bridgeResetPairing: () => ipcRenderer.invoke('bridge:resetPairing'),
  codexLogin: () => ipcRenderer.invoke('codex:login'),
  codexCheckInstalled: () => ipcRenderer.invoke('codex:checkInstalled'),
  codexInstall: () => ipcRenderer.invoke('codex:install'),
  codexRunDiagnostics: () => ipcRenderer.invoke('codex:runDiagnostics'),
  codexRunSmokeTest: (options) => ipcRenderer.invoke('codex:runSmokeTest', options),
  codexCheckUpdate: () => ipcRenderer.invoke('codex:checkUpdate'),
  codexUpdate: () => ipcRenderer.invoke('codex:update'),
  sessionGet: () => ipcRenderer.invoke('session:get'),
  sessionUpdate: (patch) => ipcRenderer.invoke('session:update', patch),
  profileSave: (opts) => ipcRenderer.invoke('profile:save', opts),
  profileSaveDialog: (name) => ipcRenderer.invoke('profile:saveDialog', name),
  profileListRecent: () => ipcRenderer.invoke('profile:listRecent'),
  refsAddDialog: () => ipcRenderer.invoke('refs:addDialog'),
  refsAddPaths: (paths) => ipcRenderer.invoke('refs:addPaths', paths),
  templatesList: () => ipcRenderer.invoke('templates:list'),
  getImageSettingsCatalog: () => ipcRenderer.invoke('settings:imageCatalog'),
  templatesImportDialog: () => ipcRenderer.invoke('templates:importDialog'),
  templatesImportPaths: (opts) => ipcRenderer.invoke('templates:importPaths', opts),
  templatesClone: (opts) => ipcRenderer.invoke('templates:clone', opts),
  templatesDelete: (id) => ipcRenderer.invoke('templates:delete', id),
  templatesRename: (opts) => ipcRenderer.invoke('templates:rename', opts),
  templatesReorder: (orderedIds) => ipcRenderer.invoke('templates:reorder', orderedIds),
  templatesGetImage: (id) => ipcRenderer.invoke('templates:getImage', id),
  templatesGetDimensions: (id) => ipcRenderer.invoke('templates:getDimensions', id),
  effectsList: () => ipcRenderer.invoke('effects:list'),
  effectsImportDialog: () => ipcRenderer.invoke('effects:importDialog'),
  effectsImportPaths: (opts) => ipcRenderer.invoke('effects:importPaths', opts),
  effectsDelete: (id) => ipcRenderer.invoke('effects:delete', id),
  effectsRename: (opts) => ipcRenderer.invoke('effects:rename', opts),
  effectsReorder: (orderedIds) => ipcRenderer.invoke('effects:reorder', orderedIds),
  effectsGetImage: (id) => ipcRenderer.invoke('effects:getImage', id),
  effectsGetDimensions: (id) => ipcRenderer.invoke('effects:getDimensions', id),
  effectsGenerate: (opts) => ipcRenderer.invoke('effects:generate', opts),
  effectsGetPendingGenerate: () => ipcRenderer.invoke('effects:getPendingGenerate'),
  effectsAcceptGenerate: (opts) => ipcRenderer.invoke('effects:acceptGenerate', opts),
  effectsRejectGenerate: () => ipcRenderer.invoke('effects:rejectGenerate'),
  effectsRunEdit: (opts) => ipcRenderer.invoke('effects:runEdit', opts),
  effectsGetPendingEdit: () => ipcRenderer.invoke('effects:getPendingEdit'),
  effectsAcceptEdit: () => ipcRenderer.invoke('effects:acceptEdit'),
  effectsRejectEdit: () => ipcRenderer.invoke('effects:rejectEdit'),
  templatesRunEdit: (opts) => ipcRenderer.invoke('templates:runEdit', opts),
  templatesGetPendingEdit: () => ipcRenderer.invoke('templates:getPendingEdit'),
  templatesAcceptEdit: () => ipcRenderer.invoke('templates:acceptEdit'),
  templatesRejectEdit: () => ipcRenderer.invoke('templates:rejectEdit'),
  previewRunEdit: (opts) => ipcRenderer.invoke('preview:runEdit', opts),
  previewGetPendingEdit: () => ipcRenderer.invoke('preview:getPendingEdit'),
  previewAcceptEdit: () => ipcRenderer.invoke('preview:acceptEdit'),
  previewRejectEdit: () => ipcRenderer.invoke('preview:rejectEdit'),
  previewResolveStored: () => ipcRenderer.invoke('preview:resolveStored'),
  previewImportPaths: (paths) => ipcRenderer.invoke('preview:importPaths', paths),
  generateBuildPrompt: (opts) => ipcRenderer.invoke('generate:buildPrompt', opts),
  generateSuggestAdLine: (opts) => ipcRenderer.invoke('generate:suggestAdLine', opts),
  generateImage: (opts) => ipcRenderer.invoke('generate:image', opts),
  generateAbort: (key) => ipcRenderer.invoke('generate:abort', key),
  exportSavePng: (path) => ipcRenderer.invoke('export:savePng', path),
  exportSavePngFromB64: (b64) => ipcRenderer.invoke('export:savePngFromB64', b64),
  filesReadDataUrl: (p) => ipcRenderer.invoke('files:readDataUrl', p),
  examplesGetImage: () => ipcRenderer.invoke('examples:getImage'),
  docsList: (locale) => ipcRenderer.invoke('docs:list', locale),
  docsLoad: (id, locale) => ipcRenderer.invoke('docs:load', id, locale),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  showContextMenu: (opts) => ipcRenderer.invoke('context:show', opts),
  debugGetLog: () => ipcRenderer.invoke('debug:getLog'),
  debugClear: () => ipcRenderer.invoke('debug:clear'),
  debugSaveDialog: () => ipcRenderer.invoke('debug:saveDialog'),
  dataBundleExportDialog: () => ipcRenderer.invoke('dataBundle:exportDialog'),
  dataBundlePickImportDialog: () => ipcRenderer.invoke('dataBundle:pickImportDialog'),
  dataBundleImportPath: (filePath) => ipcRenderer.invoke('dataBundle:importPath', filePath),
  supportComposeEmail: () => ipcRenderer.invoke('support:composeEmail'),
  on: (channel, cb) => {
    const allowed = [
      'session:loaded', 'session:saved', 'bridge:progress', 'job:progress',
      'help:open', 'nav:template-editor', 'nav:effect-editor', 'action:template-clone', 'action:template-delete',
      'action:save-as', 'action:import-session', 'action:export-session', 'templates:updated', 'effects:updated', 'template:selected', 'action:template-import',
      'action:bridge-setup', 'action:bridge-status', 'action:codex-setup', 'action:codex-install',
      'debug:entry', 'debug:show', 'preferences:changed',
    ];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_, data) => cb(data));
    }
  },
});
