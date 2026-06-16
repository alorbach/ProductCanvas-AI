'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('werbungMaker', {
  getBuildInfo: () => ipcRenderer.invoke('app:getBuildInfo'),
  bridgeGetStatus: () => ipcRenderer.invoke('bridge:getStatus'),
  bridgeEnsureReady: (code) => ipcRenderer.invoke('bridge:ensureReady', code),
  bridgeRequirePaired: (code) => ipcRenderer.invoke('bridge:requirePaired', code),
  codexLogin: () => ipcRenderer.invoke('codex:login'),
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
  templatesGetImage: (id) => ipcRenderer.invoke('templates:getImage', id),
  templatesGetDimensions: (id) => ipcRenderer.invoke('templates:getDimensions', id),
  templatesRunEdit: (opts) => ipcRenderer.invoke('templates:runEdit', opts),
  templatesGetPendingEdit: () => ipcRenderer.invoke('templates:getPendingEdit'),
  templatesAcceptEdit: () => ipcRenderer.invoke('templates:acceptEdit'),
  templatesRejectEdit: () => ipcRenderer.invoke('templates:rejectEdit'),
  generateBuildPrompt: (opts) => ipcRenderer.invoke('generate:buildPrompt', opts),
  generateSuggestTagline: (opts) => ipcRenderer.invoke('generate:suggestTagline', opts),
  generateImage: (opts) => ipcRenderer.invoke('generate:image', opts),
  generateAbort: (key) => ipcRenderer.invoke('generate:abort', key),
  exportSavePng: (path) => ipcRenderer.invoke('export:savePng', path),
  exportSavePngFromB64: (b64) => ipcRenderer.invoke('export:savePngFromB64', b64),
  filesReadDataUrl: (p) => ipcRenderer.invoke('files:readDataUrl', p),
  examplesGetImage: () => ipcRenderer.invoke('examples:getImage'),
  docsList: () => ipcRenderer.invoke('docs:list'),
  docsLoad: (id) => ipcRenderer.invoke('docs:load', id),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  showContextMenu: (opts) => ipcRenderer.invoke('context:show', opts),
  debugGetLog: () => ipcRenderer.invoke('debug:getLog'),
  debugClear: () => ipcRenderer.invoke('debug:clear'),
  on: (channel, cb) => {
    const allowed = [
      'session:loaded', 'session:saved', 'bridge:progress', 'job:progress',
      'help:open', 'nav:template-editor', 'action:template-clone', 'action:template-delete',
      'action:save-as', 'templates:updated', 'template:selected', 'action:template-import', 'debug:entry', 'debug:show',
    ];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_, data) => cb(data));
    }
  },
});
