'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');
const { BridgeClient, APP_ORIGIN, DEFAULT_BRIDGE_URL } = require('./bridge-client');
const paths = require('../paths');

const GITHUB_RELEASES = 'https://api.github.com/repos/alorbach/codex-local-bridge/releases/latest';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ProductCanvas AI' } }, (res) => {
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
    https.get(url, { headers: { 'User-Agent': 'ProductCanvas AI' } }, (res) => {
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

  originListedAsPaired(status) {
    const origins = status?.bridge?.paired_origins || [];
    return origins.includes(this.client.origin);
  }

  async isPaired(statusResponse) {
    if (!this.client.token) {
      return false;
    }
    try {
      await this.client.validatePairing();
      return true;
    } catch (err) {
      if (BridgeClient.isPairingError(err)) {
        this.client.clearToken();
      }
      return false;
    }
  }

  async getFullStatus() {
    const check = await this.checkStatus();
    const paired = check.running ? await this.isPaired(check.status) : false;
    return {
      ...check,
      paired,
      hasToken: !!this.client.token,
      origin: this.client.origin,
      bridgeUrl: this.client.bridgeUrl,
    };
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
        origin: this.client.origin,
      };
    }

    const code = String(pairingCode || '').trim();
    let paired = await this.isPaired(check.status);

    if (!paired && code) {
      onProgress?.({ step: 'pair', message: 'Verbinde mit Bridge…' });
      try {
        await this.client.pair(code);
        check = await this.checkStatus();
        paired = await this.isPaired(check.status);
      } catch (err) {
        return {
          success: false,
          message: err.message || 'Pairing fehlgeschlagen. Prüfen Sie den 6-stelligen Code im Bridge-Tray.',
          needsPairing: true,
          status: check.status,
          origin: this.client.origin,
        };
      }
    }

    if (!paired) {
      return {
        success: false,
        message: 'Pairing-Code erforderlich. Öffnen Sie das Tray-Menü der Codex Local Bridge und geben Sie den 6-stelligen Code ein.',
        needsPairing: true,
        status: check.status,
        origin: this.client.origin,
      };
    }

    return { success: true, status: check.status, origin: this.client.origin };
  }

  pairingRequiredError() {
    const err = new Error(
      'Diese App ist noch nicht mit der Codex Local Bridge verbunden. Bitte den Pairing-Code aus dem Bridge-Tray eingeben und auf Verbinden klicken.',
    );
    err.needsPairing = true;
    err.origin = this.client.origin;
    return err;
  }

  async requirePaired(pairingCode) {
    const status = await this.getFullStatus();
    if (!status.running || !status.ready) {
      const ready = await this.ensureReady(pairingCode);
      if (!ready.success) {
        const err = new Error(ready.message);
        err.needsPairing = !!ready.needsPairing;
        err.needsCodexLogin = !!ready.needsCodexLogin;
        err.origin = ready.origin;
        throw err;
      }
      return ready;
    }
    if (!status.paired) {
      const code = String(pairingCode || '').trim();
      if (!code) {
        throw this.pairingRequiredError();
      }
      await this.client.pair(code);
      const paired = await this.isPaired((await this.checkStatus()).status);
      if (!paired) {
        throw this.pairingRequiredError();
      }
    }
    return { success: true };
  }
}

module.exports = { BridgeManager, APP_ORIGIN, DEFAULT_BRIDGE_URL };
