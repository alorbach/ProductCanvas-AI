'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('productCanvas', {
  getPreferences: () => ipcRenderer.invoke('app:getPreferences'),
  setPreferences: (patch) => ipcRenderer.invoke('app:setPreferences', patch),
  on: (channel, cb) => {
    const allowed = ['preferences:loaded', 'preferences:changed'];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_, data) => cb(data));
    }
  },
});
