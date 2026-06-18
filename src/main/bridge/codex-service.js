'use strict';

const { getPreferences } = require('../app-preferences');

class CodexService {
  constructor(bridgeManager, codexManager, codexProvider, systemLocaleFn) {
    this.bridgeManager = bridgeManager;
    this.codexManager = codexManager;
    this.provider = codexProvider;
    this.systemLocaleFn = systemLocaleFn || (() => 'en');
  }

  getBackend() {
    return getPreferences(this.systemLocaleFn()).codexBackend || 'direct';
  }

  isBridgeBackend() {
    return this.getBackend() === 'bridge';
  }

  async getFullStatus() {
    const installCheck = await this.codexManager.isInstalled();
    if (this.isBridgeBackend()) {
      const status = await this.bridgeManager.getFullStatus();
      return {
        ...status,
        backend: 'bridge',
        codexInstalled: installCheck.installed,
        codexVersion: installCheck.version,
      };
    }
    let cliStatus;
    try {
      cliStatus = await this.provider.getStatus();
    } catch {
      cliStatus = { success: false, message: 'Codex CLI status unavailable.' };
    }
    const ready = installCheck.installed && !!cliStatus.success;
    return {
      running: true,
      ready,
      paired: ready,
      hasToken: false,
      backend: 'direct',
      origin: null,
      bridgeUrl: null,
      codexInstalled: installCheck.installed,
      codexVersion: installCheck.version,
      status: cliStatus,
    };
  }

  async ensureReady(pairingCode, onProgress) {
    const installCheck = await this.codexManager.isInstalled();
    if (!installCheck.installed) {
      return {
        success: false,
        needsCodexInstall: true,
        message: 'Codex CLI is not installed.',
        backend: this.getBackend(),
        codexInstalled: false,
      };
    }
    if (this.isBridgeBackend()) {
      const result = await this.bridgeManager.ensureReady(pairingCode, onProgress);
      return { ...result, backend: 'bridge' };
    }
    const status = await this.provider.getStatus();
    if (!status.success) {
      const loginStatus = status.details?.login_status || '';
      return {
        success: false,
        message: status.message || 'Codex CLI is not ready.',
        needsCodexLogin: !/logged in/i.test(loginStatus),
        status,
        backend: 'direct',
      };
    }
    return { success: true, status, backend: 'direct' };
  }

  async requireReady(pairingCode) {
    if (this.isBridgeBackend()) {
      return this.bridgeManager.requirePaired(pairingCode);
    }
    const status = await this.getFullStatus();
    if (status.ready) {
      return { success: true, backend: 'direct' };
    }
    const ready = await this.ensureReady('', () => {});
    if (!ready.success) {
      const err = new Error(ready.message || 'Codex CLI is not ready.');
      err.needsCodexLogin = !!ready.needsCodexLogin;
      err.needsCodexInstall = !!ready.needsCodexInstall;
      throw err;
    }
    return { success: true, backend: 'direct' };
  }
}

module.exports = { CodexService };
