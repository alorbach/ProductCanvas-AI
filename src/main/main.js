'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { BridgeManager } = require('./bridge/bridge-manager');
const { subscribeBridgeJobProgress } = require('./bridge/bridge-job-progress');
const { CodexManager } = require('./bridge/codex-manager');
const { TemplateRegistry } = require('./templates/template-registry');
const { TemplateEditorService } = require('./templates/template-editor-service');
const { TemplateEditPipeline } = require('./generate/template-edit-pipeline');
const { PreviewEditPipeline } = require('./generate/preview-edit-pipeline');
const { PreviewEditService } = require('./generate/preview-edit-service');
const { importPreviewFromPaths } = require('./generate/preview-import');
const { ProfileStore } = require('./profiles/profile-store');
const { PromptBuilder } = require('./generate/prompt-builder');
const { getImageSettingsCatalog } = require('./generate/image-settings');
const { ImagePipeline } = require('./generate/image-pipeline');
const { DocLoader } = require('./docs/doc-loader');
const paths = require('./paths');
const debugLog = require('./debug/logger');
const { isImagePath } = require('./generate/image-prep');
const { getPreferences, setPreferences } = require('./app-preferences');
const {
  MAX_DATA_URL_BYTES,
  isAllowedReadPath,
  isAllowedExportSource,
} = require('./safe-paths');
const { migrateIfNeeded } = require('./migration/user-data-migrate');
const mainI18n = require('./i18n/main-i18n');

const MAIN_WINDOW_WIDTH = 1440;
const MAIN_WINDOW_HEIGHT = 900;
const MAIN_WINDOW_MIN_WIDTH = 1440;
const MAIN_WINDOW_MIN_HEIGHT = 900;

let mainWindow = null;
let settingsWindow = null;
let bridgeManager;
let codexManager;
let templateRegistry;
let profileStore;
let promptBuilder;
let imagePipeline;
let templateEditor;
let templateEditPipeline;
let previewEditor;
let previewEditPipeline;
let docLoader;
let session = null;
let autosaveTimer = null;
let resolvedLocale = 'en';

function systemLocale() {
  return app.getLocale?.() || 'en';
}

function refreshLocale() {
  resolvedLocale = getPreferences(systemLocale()).resolvedLocale;
  return resolvedLocale;
}

function getBuildInfo() {
  try {
    return require('../build-info.json');
  } catch {
    return { version: '1.0.0', build_number: 0 };
  }
}

function mt(key, vars) {
  return mainI18n.t(resolvedLocale, key, vars);
}

function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    if (session) profileStore.saveSession(session);
  }, 300);
}

function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function broadcastPreferences() {
  const prefs = getPreferences(systemLocale());
  resolvedLocale = prefs.resolvedLocale;
  buildMenu();
  send('preferences:changed', prefs);
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('preferences:loaded', prefs);
  }
}

function profileFilters() {
  return [
    { name: mt('menu.profile.filter'), extensions: ['pcprofile.json', 'wmprofile.json'] },
  ];
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: MAIN_WINDOW_WIDTH,
    height: MAIN_WINDOW_HEIGHT,
    minWidth: MAIN_WINDOW_MIN_WIDTH,
    minHeight: MAIN_WINDOW_MIN_HEIGHT,
    title: 'ProductCanvas AI',
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  buildMenu();
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 480,
    height: 380,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow || undefined,
    modal: !!mainWindow,
    title: mt('menu.preferences'),
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.setMenu(null);
  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

async function importTemplateFiles(filePaths, name) {
  const imported = await templateRegistry.importFromPaths(filePaths, name);
  if (imported.length && session) {
    session.templateId = imported[imported.length - 1].id;
    scheduleAutosave();
    send('session:loaded', session);
  }
  send('templates:updated', templateRegistry.listAll());
  return imported;
}

function buildMenu() {
  const recent = profileStore.listRecent();
  const recentSubmenu = recent.length
    ? recent.map((item) => ({
      label: item.name,
      click: () => {
        try {
          session = profileStore.loadProfile(item.path);
          send('session:loaded', session);
        } catch (err) {
          dialog.showErrorBox(mt('menu.error.title'), err.message);
        }
      },
    }))
    : [{ label: mt('menu.recent.none'), enabled: false }];

  const template = [
    {
      label: mt('menu.templates'),
      submenu: [
        { label: mt('menu.templates.edit'), click: () => send('nav:template-editor', {}) },
        { label: mt('menu.templates.clone'), click: () => send('action:template-clone', {}) },
        { type: 'separator' },
        {
          label: mt('menu.templates.import'),
          click: async () => {
            const r = await dialog.showOpenDialog(mainWindow, {
              filters: [{ name: mt('menu.images'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
              properties: ['openFile', 'multiSelections'],
            });
            if (!r.canceled && r.filePaths.length) {
              try {
                await importTemplateFiles(r.filePaths);
              } catch (err) {
                dialog.showErrorBox(mt('menu.error.title'), err.message);
              }
            }
          },
        },
        { label: mt('menu.templates.delete'), click: () => send('action:template-delete', {}) },
      ],
    },
    {
      label: mt('menu.bridge'),
      submenu: [
        { label: mt('menu.bridge.status'), click: () => send('action:bridge-status', {}) },
        { label: mt('menu.bridge.connect'), click: () => send('action:bridge-setup', {}) },
        { type: 'separator' },
        { label: mt('menu.bridge.codexLogin'), click: () => codexManager.startLogin() },
        {
          label: mt('menu.bridge.openStatus'),
          click: () => {
            const url = `${bridgeManager.getClient().bridgeUrl.replace(/\/$/, '')}/status`;
            shell.openExternal(url);
          },
        },
        {
          label: mt('menu.bridge.resetPairing'),
          click: async () => {
            bridgeManager.getClient().clearToken();
            send('action:bridge-setup', {});
          },
        },
      ],
    },
    {
      label: mt('menu.help'),
      submenu: [
        { label: mt('menu.help.gettingStarted'), click: () => send('help:open', 'getting-started') },
        { label: mt('menu.help.handbook'), click: () => send('help:open', 'user-guide') },
        { label: mt('menu.help.editTemplates'), click: () => send('help:open', 'edit-templates') },
        { type: 'separator' },
        { label: mt('menu.help.debug'), click: () => send('debug:show', {}) },
        { type: 'separator' },
        {
          label: mt('menu.help.about'),
          click: () => {
            const info = getBuildInfo();
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: mt('about.title'),
              message: mt('about.message'),
              detail: mt('about.detail', { version: info.version, build: info.build_number }),
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate([
    {
      label: mt('menu.file'),
      submenu: [
        {
          label: mt('menu.new'),
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            session = profileStore.newSession();
            send('session:loaded', session);
          },
        },
        {
          label: mt('menu.open'),
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const r = await dialog.showOpenDialog(mainWindow, {
              filters: profileFilters(),
              properties: ['openFile'],
            });
            if (!r.canceled && r.filePaths[0]) {
              session = profileStore.loadProfile(r.filePaths[0]);
              send('session:loaded', session);
            }
          },
        },
        {
          label: mt('menu.save'),
          accelerator: 'CmdOrCtrl+S',
          click: async () => {
            if (session?.profilePath) {
              profileStore.saveProfile(session.profilePath, session, session.profileName);
              send('session:saved', session);
            } else {
              send('action:save-as', {});
            }
          },
        },
        {
          label: mt('menu.saveAs'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => send('action:save-as', {}),
        },
        { type: 'separator' },
        {
          label: mt('menu.preferences'),
          accelerator: 'CmdOrCtrl+,',
          click: () => createSettingsWindow(),
        },
        { type: 'separator' },
        { label: mt('menu.recent'), submenu: recentSubmenu },
        { type: 'separator' },
        { role: 'quit', label: mt('menu.quit') },
      ],
    },
    ...template,
  ]);
  Menu.setApplicationMenu(menu);
}

function registerIpc() {
  ipcMain.handle('app:getBuildInfo', () => getBuildInfo());
  ipcMain.handle('app:getPreferences', () => getPreferences(systemLocale()));
  ipcMain.handle('app:setPreferences', (_, patch) => {
    const prefs = setPreferences(patch, systemLocale());
    if (patch.bridgeUrl !== undefined) {
      bridgeManager.getClient().setBridgeUrl(prefs.bridgeUrl);
      if (session) {
        session.bridgeUrl = prefs.bridgeUrl;
        scheduleAutosave();
      }
    }
    broadcastPreferences();
    return prefs;
  });
  ipcMain.handle('app:openSettings', () => {
    createSettingsWindow();
    return true;
  });

  ipcMain.handle('bridge:getStatus', async () => bridgeManager.getFullStatus());

  ipcMain.handle('bridge:ensureReady', async (_, pairingCode) => {
    const onProgress = (p) => send('bridge:progress', p);
    await codexManager.ensureInstalled(onProgress);
    return bridgeManager.ensureReady(pairingCode, onProgress);
  });

  ipcMain.handle('bridge:requirePaired', async (_, pairingCode) => {
    try {
      return await bridgeManager.requirePaired(pairingCode);
    } catch (err) {
      debugLog.warn('main', 'Bridge pairing required', { message: err.message, origin: err.origin });
      throw err;
    }
  });

  ipcMain.handle('bridge:resetPairing', async () => {
    bridgeManager.getClient().clearToken();
    return bridgeManager.getFullStatus();
  });

  ipcMain.handle('codex:login', async () => codexManager.startLogin());

  ipcMain.handle('session:get', () => session || profileStore.loadSession());
  ipcMain.handle('session:update', (_, patch) => {
    if (!session) {
      session = profileStore.loadSession();
    }
    session = { ...session, ...patch };
    scheduleAutosave();
    return session;
  });

  ipcMain.handle('profile:save', async (_, { filePath, name }) => {
    const saved = profileStore.saveProfile(filePath, session, name);
    session.profilePath = saved.path;
    session.profileName = saved.name;
    buildMenu();
    return saved;
  });

  ipcMain.handle('profile:saveDialog', async (_, name) => {
    const r = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${name || 'Profile'}.pcprofile.json`,
      filters: profileFilters(),
    });
    if (r.canceled) return null;
    return profileStore.saveProfile(r.filePath, session, name);
  });

  ipcMain.handle('profile:listRecent', () => profileStore.listRecent());

  ipcMain.handle('refs:addDialog', async () => {
    focusMainWindow();
    const r = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: mt('menu.images'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile', 'multiSelections'],
    });
    return r.canceled ? [] : r.filePaths.map((p) => ({ path: p, name: path.basename(p) }));
  });

  ipcMain.handle('refs:addPaths', (_, filePaths) => {
    const valid = (filePaths || []).filter((p) => p && fs.existsSync(p) && isImagePath(p));
    return valid.map((p) => ({ path: p, name: path.basename(p) }));
  });

  ipcMain.handle('templates:list', () => templateRegistry.listAll());
  ipcMain.handle('settings:imageCatalog', () => getImageSettingsCatalog());

  ipcMain.handle('templates:getDimensions', async (_, id) => {
    const template = templateRegistry.getById(id);
    if (!template) return null;
    return templateRegistry.getDimensions(template);
  });

  ipcMain.handle('templates:importDialog', async () => {
    focusMainWindow();
    const r = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: mt('menu.images'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (r.canceled) return [];
    return importTemplateFiles(r.filePaths);
  });

  ipcMain.handle('templates:importPaths', async (_, { paths: filePaths, name }) => {
    return importTemplateFiles(filePaths || [], name);
  });

  ipcMain.handle('templates:clone', (_, { sourceId, name }) => {
    const cloned = templateRegistry.clone(sourceId, name);
    send('templates:updated', templateRegistry.listAll());
    return cloned;
  });

  ipcMain.handle('templates:delete', (_, id) => templateRegistry.deleteUserTemplate(id));
  ipcMain.handle('templates:rename', (_, { id, name }) => templateRegistry.renameUserTemplate(id, name));
  ipcMain.handle('templates:reorder', (_, orderedIds) => {
    const list = templateRegistry.reorderTemplates(orderedIds);
    send('templates:updated', list);
    return list;
  });

  ipcMain.handle('templates:getImage', (_, id) => {
    const t = templateRegistry.getById(id);
    if (!t) return null;
    const p = templateRegistry.resolveTemplatePath(t);
    return templateRegistry.imageToDataUrl(p);
  });

  ipcMain.handle('templates:runEdit', async (_, { templateId, changeRequest, quality, size, referenceImagePath, pairingCode }) => {
    const signalKey = `edit-${Date.now()}`;
    send('job:progress', { status: 'running', signalKey, messageKey: 'wait.status.templateEditPrompt' });
    const onProgress = (p) => send('job:progress', { ...p, signalKey });
    await bridgeManager.requirePaired(pairingCode);
    const unsubscribe = subscribeBridgeJobProgress(bridgeManager.getClient(), onProgress);
    try {
      return await templateEditor.runEdit(
        { templateId, changeRequest, quality, size, referenceImagePath },
        onProgress,
        signalKey,
      );
    } finally {
      unsubscribe();
    }
  });

  ipcMain.handle('templates:getPendingEdit', () => templateEditor.getPendingEdit());
  ipcMain.handle('templates:acceptEdit', () => templateEditor.acceptEdit());
  ipcMain.handle('templates:rejectEdit', () => templateEditor.rejectEdit());

  ipcMain.handle('preview:runEdit', async (_, { previewPath, templateId, changeRequest, quality, size, pairingCode }) => {
    if (!isAllowedExportSource(previewPath)) {
      throw new Error('PREVIEW_SOURCE_NOT_ALLOWED');
    }
    const signalKey = `preview-edit-${Date.now()}`;
    send('job:progress', { status: 'running', signalKey, messageKey: 'wait.status.previewEditPrompt' });
    const onProgress = (p) => send('job:progress', { ...p, signalKey });
    await bridgeManager.requirePaired(pairingCode);
    const unsubscribe = subscribeBridgeJobProgress(bridgeManager.getClient(), onProgress);
    try {
      return await previewEditor.runEdit(
        { previewPath, templateId, changeRequest, quality, size },
        onProgress,
        signalKey,
      );
    } finally {
      unsubscribe();
    }
  });

  ipcMain.handle('preview:getPendingEdit', () => previewEditor.getPendingEdit());

  ipcMain.handle('preview:acceptEdit', () => {
    const result = previewEditor.acceptEdit();
    if (session) {
      session.lastPreviewPath = result.path;
      session.previewPendingEdit = null;
      scheduleAutosave();
      send('session:saved', session);
    }
    return result;
  });

  ipcMain.handle('preview:rejectEdit', () => {
    const result = previewEditor.rejectEdit();
    if (session) {
      session.lastPreviewPath = result.path;
      session.previewPendingEdit = null;
      scheduleAutosave();
      send('session:saved', session);
    }
    return result;
  });

  ipcMain.handle('preview:importPaths', (_, filePaths) => {
    const imported = importPreviewFromPaths(filePaths);
    if (!imported) {
      throw new Error('PREVIEW_IMPORT_INVALID');
    }
    return imported;
  });

  ipcMain.handle('preview:resolveStored', () => {
    if (!session) {
      session = profileStore.loadSession();
    }
    const resolved = previewEditor.resolveStored(session);
    if (resolved.sessionPatch) {
      session = { ...session, ...resolved.sessionPatch };
      scheduleAutosave();
      send('session:saved', session);
    }
    let originalPreviewB64 = '';
    let editedPreviewB64 = '';
    if (resolved.pendingEdit?.originalPreviewPath && fs.existsSync(resolved.pendingEdit.originalPreviewPath)) {
      try {
        originalPreviewB64 = fs.readFileSync(resolved.pendingEdit.originalPreviewPath).toString('base64');
      } catch { /* ignore */ }
    }
    if (resolved.valid && resolved.path && fs.existsSync(resolved.path)) {
      try {
        editedPreviewB64 = fs.readFileSync(resolved.path).toString('base64');
      } catch { /* ignore */ }
    } else if (resolved.valid && resolved.path) {
      editedPreviewB64 = '';
    }
    return {
      valid: resolved.valid,
      path: resolved.path,
      pendingEdit: resolved.pendingEdit
        ? {
          ...resolved.pendingEdit,
          originalPreviewB64,
          editedPreviewB64,
        }
        : null,
      session: session || null,
    };
  });

  ipcMain.handle('generate:buildPrompt', async (_, options = {}) => {
    const { pairingCode, ...promptOpts } = options;
    const signalKey = `prompt-${Date.now()}`;
    send('job:progress', { status: 'running', signalKey, messageKey: 'wait.status.buildingPrompt' });
    const onProgress = (p) => send('job:progress', { ...p, signalKey });
    const unsubscribe = subscribeBridgeJobProgress(bridgeManager.getClient(), onProgress);
    try {
      await bridgeManager.requirePaired(pairingCode);
      const result = await promptBuilder.buildWerbungPrompt(promptOpts, signalKey, onProgress);
      send('job:progress', { status: 'completed', messageKey: 'wait.status.completed' });
      return result;
    } catch (err) {
      debugLog.error('main', 'generate:buildPrompt failed', { message: err.message, details: err.details });
      throw err;
    } finally {
      unsubscribe();
    }
  });

  ipcMain.handle('generate:suggestAdLine', async (_, options = {}) => {
    const { pairingCode, ...adLineOpts } = options;
    const signalKey = `adLine-${Date.now()}`;
    send('job:progress', { status: 'running', signalKey, messageKey: 'wait.context.task.adLine' });
    try {
      await bridgeManager.requirePaired(pairingCode);
      return await promptBuilder.suggestAdLine(adLineOpts, signalKey);
    } catch (err) {
      debugLog.error('main', 'generate:suggestAdLine failed', { message: err.message });
      throw err;
    }
  });

  ipcMain.handle('generate:image', async (_, { promptData, settings, pairingCode }) => {
    const signalKey = `image-${Date.now()}`;
    send('job:progress', { status: 'running', signalKey, messageKey: 'wait.status.running' });
    const onProgress = (p) => send('job:progress', { ...p, signalKey });
    await bridgeManager.requirePaired(pairingCode);
    const onPreflightComplete = (preflight) => {
      if (!preflight?.preflightPrompt) return;
      if (!session) {
        session = profileStore.loadSession();
      }
      session = {
        ...session,
        preflightPrompt: preflight.preflightPrompt,
        imagePrompt: preflight.preflightPrompt,
        preflightFingerprint: preflight.preflightFingerprint || session.preflightFingerprint || '',
      };
      scheduleAutosave();
      send('session:saved', session);
    };
    return imagePipeline.generateImage(
      promptData,
      settings,
      onProgress,
      signalKey,
      { onPreflightComplete },
    );
  });

  ipcMain.handle('generate:abort', (_, signalKey) => {
    const success = bridgeManager.getClient().abort(signalKey);
    return { success };
  });

  ipcMain.handle('export:savePng', async (_, sourcePath) => {
    if (!isAllowedExportSource(sourcePath)) {
      throw new Error('EXPORT_SOURCE_NOT_ALLOWED');
    }
    const r = await dialog.showSaveDialog(mainWindow, {
      defaultPath: mt('export.defaultName', { timestamp: Date.now() }),
      filters: [{ name: mt('export.png'), extensions: ['png'] }],
    });
    if (r.canceled) return null;
    fs.copyFileSync(sourcePath, r.filePath);
    return r.filePath;
  });

  ipcMain.handle('export:savePngFromB64', async (_, b64) => {
    const buffer = Buffer.from(b64 || '', 'base64');
    if (buffer.byteLength > MAX_DATA_URL_BYTES) {
      throw new Error('EXPORT_PAYLOAD_TOO_LARGE');
    }
    const r = await dialog.showSaveDialog(mainWindow, {
      defaultPath: mt('export.defaultName', { timestamp: Date.now() }),
      filters: [{ name: mt('export.png'), extensions: ['png'] }],
    });
    if (r.canceled) return null;
    fs.writeFileSync(r.filePath, buffer);
    return r.filePath;
  });

  ipcMain.handle('files:readDataUrl', (_, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return null;
    if (!isAllowedReadPath(filePath, { session, templateRegistry, templateEditor, previewEditor }) || !isImagePath(filePath)) {
      return null;
    }
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_DATA_URL_BYTES) return null;
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
    const b64 = fs.readFileSync(filePath).toString('base64');
    return `data:${mime};base64,${b64}`;
  });

  ipcMain.handle('examples:getImage', () => {
    const p = path.join(paths.examplesDir(), 'Beispiel-Martin-Logan.png');
    if (!fs.existsSync(p)) return null;
    const b64 = fs.readFileSync(p).toString('base64');
    return `data:image/png;base64,${b64}`;
  });

  ipcMain.handle('docs:list', (_, locale) => docLoader.list(locale || resolvedLocale));
  ipcMain.handle('docs:load', (_, id, locale) => docLoader.load(id, locale || resolvedLocale));

  ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url));
  ipcMain.handle('shell:showItemInFolder', (_, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return true;
    }
    return false;
  });

  ipcMain.handle('context:show', async (event, { x, y, items }) => {
    return new Promise((resolve) => {
      let selectedId = null;
      let settled = false;
      const finish = (id) => {
        if (settled) return;
        settled = true;
        resolve(id ?? null);
      };

      const template = (items || []).map((entry) => {
        if (entry.separator) return { type: 'separator' };
        return {
          label: entry.label || '',
          enabled: entry.enabled !== false,
          click: () => { selectedId = entry.id; },
        };
      });

      const win = BrowserWindow.fromWebContents(event.sender);
      const menu = Menu.buildFromTemplate(template);
      menu.popup({
        window: win,
        x: Math.round(x),
        y: Math.round(y),
        callback: () => {
          if (win && !win.isDestroyed()) {
            win.focus();
            win.webContents.focus();
          }
          finish(selectedId);
        },
      });
    });
  });

  ipcMain.handle('debug:getLog', () => debugLog.getLog());
  ipcMain.handle('debug:clear', () => {
    debugLog.clear();
    return { success: true };
  });
}

app.setName('productcanvas-ai');

app.whenReady().then(() => {
  registerIpc();

  migrateIfNeeded(paths.userDataRoot(), paths.bridgeDir());
  refreshLocale();
  bridgeManager = new BridgeManager();
  codexManager = new CodexManager();
  templateRegistry = new TemplateRegistry();
  profileStore = new ProfileStore();
  const client = bridgeManager.getClient();
  promptBuilder = new PromptBuilder(client, templateRegistry);
  imagePipeline = new ImagePipeline(client, templateRegistry);
  templateEditPipeline = new TemplateEditPipeline(client, templateRegistry);
  templateEditor = new TemplateEditorService(templateEditPipeline, templateRegistry);
  previewEditPipeline = new PreviewEditPipeline(client, templateRegistry);
  previewEditor = new PreviewEditService(previewEditPipeline, {
    getSession: () => session || profileStore.loadSession(),
    patchSession: (patch) => {
      if (!session) {
        session = profileStore.loadSession();
      }
      session = { ...session, ...patch };
      scheduleAutosave();
      send('session:saved', session);
    },
  });
  docLoader = new DocLoader();
  session = profileStore.loadSession();
  const prefs = getPreferences(systemLocale());
  if (prefs.bridgeUrl && !session.bridgeUrl) {
    session.bridgeUrl = prefs.bridgeUrl;
  }
  debugLog.setBroadcast((entry) => send('debug:entry', entry));
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
