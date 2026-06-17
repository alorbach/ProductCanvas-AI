'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { getPreferences } = require(path.join(__dirname, '..', 'src', 'main', 'app-preferences'));

const root = path.join(__dirname, '..');
const preloadPath = path.join(root, 'src', 'preload', 'preload.js');
const blankPage = 'data:text/html;charset=utf-8,<!DOCTYPE html><html><body></body></html>';

app.whenReady().then(() => {
  ipcMain.handle('app:getPreferences', () => getPreferences('en'));

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(blankPage).catch((err) => {
    console.error('LOAD_ERROR', err.message || err);
    app.exit(1);
  });

  win.webContents.on('did-finish-load', async () => {
    try {
      const locale = await win.webContents.executeJavaScript('window.productCanvas.getPreferences().then((p) => p.resolvedLocale)');
      console.log('IPC_GET_PREFERENCES', locale);
      app.exit(locale === 'en' || locale === 'de' ? 0 : 1);
    } catch (err) {
      console.error('IPC_ERROR', err.message || err);
      app.exit(1);
    }
  });
});
