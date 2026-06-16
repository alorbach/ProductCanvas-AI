'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { BridgeManager } = require('./bridge/bridge-manager');
const { CodexManager } = require('./bridge/codex-manager');
const { TemplateRegistry } = require('./templates/template-registry');
const { TemplateEditorService } = require('./templates/template-editor-service');
const { ProfileStore } = require('./profiles/profile-store');
const { PromptBuilder } = require('./generate/prompt-builder');
const { ImagePipeline } = require('./generate/image-pipeline');
const { DocLoader } = require('./docs/doc-loader');
const paths = require('./paths');

let mainWindow = null;
let bridgeManager;
let codexManager;
let templateRegistry;
let profileStore;
let promptBuilder;
let imagePipeline;
let templateEditor;
let docLoader;
let session = null;
let autosaveTimer = null;

function getBuildInfo() {
  try {
    return require('../build-info.json');
  } catch {
    return { version: '1.0.0', build_number: 0 };
  }
}

function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    if (session) profileStore.saveSession(session);
  }, 300);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'WerbungMaker',
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

function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
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
          dialog.showErrorBox('Fehler', err.message);
        }
      },
    }))
    : [{ label: '(keine)', enabled: false }];

  const template = [
    {
      label: 'Vorlagen',
      submenu: [
        { label: 'Bearbeiten…', click: () => send('nav:template-editor', {}) },
        { label: 'Klonen', click: () => send('action:template-clone', {}) },
        { type: 'separator' },
        {
          label: 'Importieren…',
          click: async () => {
            const r = await dialog.showOpenDialog(mainWindow, {
              filters: [{ name: 'PNG', extensions: ['png'] }],
              properties: ['openFile'],
            });
            if (!r.canceled && r.filePaths[0]) {
              try {
                const t = templateRegistry.importFromFile(r.filePaths[0]);
                send('templates:updated', templateRegistry.listAll());
                send('template:selected', t.id);
              } catch (err) {
                dialog.showErrorBox('Fehler', err.message);
              }
            }
          },
        },
        { label: 'Löschen', click: () => send('action:template-delete', {}) },
      ],
    },
    {
      label: 'Hilfe',
      submenu: [
        { label: 'Erste Schritte', click: () => send('help:open', 'einrichtung') },
        { label: 'Benutzerhandbuch', click: () => send('help:open', 'benutzerhandbuch') },
        { label: 'Vorlagen bearbeiten', click: () => send('help:open', 'vorlagen-bearbeiten') },
        { type: 'separator' },
        {
          label: 'Über WerbungMaker…',
          click: () => {
            const info = getBuildInfo();
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Über WerbungMaker',
              message: 'WerbungMaker',
              detail: `Version ${info.version} (Build ${info.build_number})\nTELE-KOHLGRAF – Werbebild-Generator`,
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate([
    {
      label: 'Datei',
      submenu: [
        {
          label: 'Neu',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            session = profileStore.newSession();
            send('session:loaded', session);
          },
        },
        {
          label: 'Öffnen…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const r = await dialog.showOpenDialog(mainWindow, {
              filters: [{ name: 'WerbungMaker-Profil', extensions: ['wmprofile.json'] }],
              properties: ['openFile'],
            });
            if (!r.canceled && r.filePaths[0]) {
              session = profileStore.loadProfile(r.filePaths[0]);
              send('session:loaded', session);
            }
          },
        },
        {
          label: 'Speichern',
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
          label: 'Speichern unter…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => send('action:save-as', {}),
        },
        { type: 'separator' },
        { label: 'Zuletzt geöffnet', submenu: recentSubmenu },
        { type: 'separator' },
        { role: 'quit', label: 'Beenden' },
      ],
    },
    ...template,
  ]);
  Menu.setApplicationMenu(menu);
}

function registerIpc() {
  ipcMain.handle('app:getBuildInfo', () => getBuildInfo());

  ipcMain.handle('bridge:getStatus', async () => bridgeManager.checkStatus());

  ipcMain.handle('bridge:ensureReady', async (_, pairingCode) => {
    const onProgress = (p) => send('bridge:progress', p);
    await codexManager.ensureInstalled(onProgress);
    return bridgeManager.ensureReady(pairingCode, onProgress);
  });

  ipcMain.handle('codex:login', async () => codexManager.startLogin());

  ipcMain.handle('session:get', () => session || profileStore.loadSession());
  ipcMain.handle('session:update', (_, patch) => {
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
      defaultPath: `${name || 'Profil'}.wmprofile.json`,
      filters: [{ name: 'WerbungMaker-Profil', extensions: ['wmprofile.json'] }],
    });
    if (r.canceled) return null;
    return profileStore.saveProfile(r.filePath, session, name);
  });

  ipcMain.handle('profile:listRecent', () => profileStore.listRecent());

  ipcMain.handle('refs:addDialog', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile', 'multiSelections'],
    });
    return r.canceled ? [] : r.filePaths.map((p) => ({ path: p, name: path.basename(p) }));
  });

  ipcMain.handle('templates:list', () => templateRegistry.listAll());

  ipcMain.handle('templates:clone', (_, { sourceId, name }) => templateRegistry.clone(sourceId, name));

  ipcMain.handle('templates:delete', (_, id) => templateRegistry.deleteUserTemplate(id));

  ipcMain.handle('templates:rename', (_, { id, name }) => templateRegistry.renameUserTemplate(id, name));

  ipcMain.handle('templates:getImage', (_, id) => {
    const t = templateRegistry.getById(id);
    if (!t) return null;
    const p = templateRegistry.resolveTemplatePath(t);
    return templateRegistry.imageToDataUrl(p);
  });

  ipcMain.handle('templates:optimizePrompt', async (_, { templateId, changeRequest }, evt) => {
    const signalKey = `edit-${Date.now()}`;
    return templateEditor.optimizePrompt(templateId, changeRequest, signalKey);
  });

  ipcMain.handle('templates:applyEdit', async (_, { settings, optimizedPrompt }) => {
    const signalKey = `apply-${Date.now()}`;
    const onProgress = (p) => send('job:progress', p);
    return templateEditor.applyEdit(settings, optimizedPrompt, onProgress, signalKey);
  });

  ipcMain.handle('templates:acceptEdit', () => templateEditor.acceptEdit());
  ipcMain.handle('templates:rejectEdit', () => templateEditor.rejectEdit());

  ipcMain.handle('generate:buildPrompt', async (_, options) => {
    const signalKey = `prompt-${Date.now()}`;
    const onProgress = (p) => send('job:progress', p);
    send('job:progress', { status: 'running', message: 'Prompt wird erstellt…' });
    const result = await promptBuilder.buildWerbungPrompt(options, signalKey);
    send('job:progress', { status: 'completed' });
    return result;
  });

  ipcMain.handle('generate:image', async (_, { promptData, settings }) => {
    const signalKey = `image-${Date.now()}`;
    const onProgress = (p) => send('job:progress', p);
    return imagePipeline.generateImage(promptData, settings, onProgress, signalKey);
  });

  ipcMain.handle('generate:abort', (_, signalKey) => {
    bridgeManager.getClient().abort(signalKey);
  });

  ipcMain.handle('export:savePng', async (_, sourcePath) => {
    const r = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `Werbung-${Date.now()}.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (r.canceled) return null;
    fs.copyFileSync(sourcePath, r.filePath);
    return r.filePath;
  });

  ipcMain.handle('export:savePngFromB64', async (_, b64) => {
    const r = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `Werbung-${Date.now()}.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (r.canceled) return null;
    fs.writeFileSync(r.filePath, Buffer.from(b64, 'base64'));
    return r.filePath;
  });

  ipcMain.handle('files:readDataUrl', (_, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return null;
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

  ipcMain.handle('docs:list', () => docLoader.list());
  ipcMain.handle('docs:load', (_, id) => docLoader.load(id));

  ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url));
}

app.whenReady().then(() => {
  bridgeManager = new BridgeManager();
  codexManager = new CodexManager();
  templateRegistry = new TemplateRegistry();
  profileStore = new ProfileStore();
  const client = bridgeManager.getClient();
  promptBuilder = new PromptBuilder(client, templateRegistry);
  imagePipeline = new ImagePipeline(client);
  templateEditor = new TemplateEditorService(client, templateRegistry, imagePipeline);
  docLoader = new DocLoader();
  session = profileStore.loadSession();
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
