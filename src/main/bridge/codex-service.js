'use strict';

const { getPreferences } = require('../app-preferences');
const { getCodexCliInfo, resolveCodexBinary } = require('./codex-cli-client');
const {
  readRateLimits,
  summarizeRateLimits,
} = require('./codex-rate-limits');

const RATE_LIMIT_CACHE_MS = Number(process.env.ALORBACH_CODEX_RATE_LIMIT_CACHE_MS || 60000);
let rateLimitCache = null;

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

  invalidateRateLimitCache() {
    rateLimitCache = null;
  }

  async getRateLimits(options = {}) {
    const force = options.force === true;
    const now = Date.now();
    if (!force && rateLimitCache?.rateLimits && now - rateLimitCache.fetchedAt < RATE_LIMIT_CACHE_MS) {
      return { ...rateLimitCache, cached: true };
    }

    const installCheck = await this.codexManager.isInstalled();
    if (!installCheck.installed) {
      return {
        success: false,
        unavailable: true,
        reason: 'not_installed',
        summary: null,
        rateLimits: null,
      };
    }

    const cliInfo = getCodexCliInfo();
    if (!cliInfo.authExists) {
      return {
        success: false,
        unavailable: true,
        reason: 'not_logged_in',
        summary: null,
        rateLimits: null,
      };
    }

    try {
      const rateLimits = await readRateLimits({
        codexBinary: resolveCodexBinary(),
        codexHome: cliInfo.codexHome,
      });
      const payload = {
        success: true,
        rateLimits,
        summary: summarizeRateLimits(rateLimits),
        fetchedAt: now,
        cached: false,
      };
      rateLimitCache = payload;
      return payload;
    } catch (err) {
      if (rateLimitCache?.rateLimits) {
        return {
          ...rateLimitCache,
          cached: true,
          stale: true,
          error: err.message || String(err),
        };
      }
      return {
        success: false,
        unavailable: true,
        reason: 'fetch_failed',
        error: err.message || String(err),
        summary: null,
        rateLimits: null,
      };
    }
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
    const cliInfo = getCodexCliInfo();
    const loginStatus = String(cliStatus.details?.login_status || '').trim();
    const loggedIn = !!cliStatus.success;
    const codexInstalled = installCheck.installed || cliInfo.binaryExists;
    const ready = codexInstalled && loggedIn;
    return {
      running: true,
      ready,
      paired: ready,
      hasToken: false,
      backend: 'direct',
      origin: null,
      bridgeUrl: null,
      codexInstalled,
      codexVersion: cliStatus.details?.version || installCheck.version,
      codexCli: {
        configuredPath: cliInfo.configuredPath,
        resolvedBinary: cliInfo.resolvedBinary,
        resolutionSource: cliInfo.resolutionSource,
        binaryExists: cliInfo.binaryExists,
        envOverride: cliInfo.envOverride,
        authExists: cliInfo.authExists,
        loggedIn,
        loginStatus: loginStatus || cliStatus.message,
        version: cliStatus.details?.version || installCheck.version,
        codexHome: cliInfo.codexHome,
      },
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
