'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');

const root = path.join(__dirname, '..');
const preloadPath = path.join(root, 'src', 'preload', 'preload.js');
const blankPage = 'data:text/html;charset=utf-8,<!DOCTYPE html><html><head><title>preload-smoke</title></head><body></body></html>';

app.whenReady().then(() => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on('preload-error', (_event, preloadFile, error) => {
    console.error('PRELOAD_ERROR', preloadFile, error?.message || error);
    app.exit(1);
  });

  win.loadURL(blankPage).catch((err) => {
    console.error('LOAD_ERROR', err.message || err);
    app.exit(1);
  });

  win.webContents.on('did-finish-load', async () => {
    try {
      const bridgeType = await win.webContents.executeJavaScript('typeof window.productCanvas');
      console.log('BRIDGE_TYPE', bridgeType);
      if (bridgeType !== 'object') {
        app.exit(1);
        return;
      }
      const hasPrefs = await win.webContents.executeJavaScript(
        'typeof window.productCanvas.getPreferences === "function"',
      );
      console.log('HAS_GET_PREFERENCES', hasPrefs);
      app.exit(hasPrefs ? 0 : 1);
    } catch (err) {
      console.error('EXEC_ERROR', err.message || err);
      app.exit(1);
    }
  });
});
