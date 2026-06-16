'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');
const { BridgeClient, DEFAULT_BRIDGE_URL } = require('./bridge-client');
const paths = require('../paths');

const GITHUB_RELEASES = 'https://api.github.com/repos/alorbach/codex-local-bridge/releases/latest';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'WerbungMaker' } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'WerbungMaker' } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

class BridgeManager {
  constructor() {
    this.client = new BridgeClient();
    this.bridgeProcess = null;
  }

  getClient() {
    return this.client;
  }

  async checkStatus() {
    try {
      const status = await this.client.getStatus();
      return { running: true, ready: !!status.success, status };
    } catch {
      return { running: false, ready: false, status: null };
    }
  }

  findBridgeExe() {
    const bridgeDir = paths.bridgeDir();
    const candidates = [
      path.join(bridgeDir, 'Codex Local Bridge.exe'),
      path.join(bridgeDir, 'win-unpacked', 'Codex Local Bridge.exe'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    const entries = fs.readdirSync(bridgeDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        const nested = path.join(bridgeDir, e.name, 'Codex Local Bridge.exe');
        if (fs.existsSync(nested)) return nested;
      }
    }
    return null;
  }

  async downloadBridge(onProgress) {
    onProgress?.({ step: 'download', message: 'Lade neueste Codex Local Bridge Version…' });
    const release = await fetchJson(GITHUB_RELEASES);
    const zipAsset = (release.assets || []).find((a) => a.name.endsWith('-win-x64.zip'));
    if (!zipAsset) {
      throw new Error('Kein Windows-ZIP in der neuesten Bridge-Version gefunden.');
    }
    const zipPath = path.join(paths.bridgeDir(), zipAsset.name);
    await downloadFile(zipAsset.browser_download_url, zipPath);
    onProgress?.({ step: 'extract', message: 'Entpacke Bridge…' });
    const { execFile } = require('child_process');
    await new Promise((resolve, reject) => {
      execFile('powershell', [
        '-NoProfile', '-Command',
        `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${paths.bridgeDir().replace(/'/g, "''")}' -Force`,
      ], (err) => (err ? reject(err) : resolve()));
    });
    return this.findBridgeExe();
  }

  async startBridge(onProgress) {
    let exe = this.findBridgeExe();
    if (!exe) {
      await this.downloadBridge(onProgress);
      exe = this.findBridgeExe();
    }
    if (!exe) {
      throw new Error('Codex Local Bridge konnte nach dem Download nicht gefunden werden.');
    }
    if (this.bridgeProcess) {
      return;
    }
    onProgress?.({ step: 'start', message: 'Starte Codex Local Bridge…' });
    this.bridgeProcess = spawn(exe, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    this.bridgeProcess.unref();
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const check = await this.checkStatus();
      if (check.running) {
        return check;
      }
    }
    throw new Error('Codex Local Bridge antwortet nicht auf Port 8765.');
  }

  async ensureReady(pairingCode, onProgress) {
    let check = await this.checkStatus();
    if (!check.running) {
      await this.startBridge(onProgress);
      check = await this.checkStatus();
    }
    if (!check.ready) {
      return {
        success: false,
        message: check.status?.message || 'Codex CLI ist nicht bereit. Bitte codex login ausführen.',
        needsCodexLogin: true,
        status: check.status,
      };
    }
    if (!this.client.token && pairingCode) {
      onProgress?.({ step: 'pair', message: 'Verbinde mit Bridge…' });
      await this.client.pair(pairingCode);
    }
    if (!this.client.token) {
      return {
        success: false,
        message: 'Pairing-Code erforderlich. Code aus dem Bridge-Tray-Menü eingeben.',
        needsPairing: true,
        status: check.status,
      };
    }
    return { success: true, status: check.status };
  }
}

module.exports = { BridgeManager, DEFAULT_BRIDGE_URL };
