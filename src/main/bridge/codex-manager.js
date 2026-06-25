'use strict';

const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const { resolveCodexBinary, invalidateCodexBinaryCache } = require('./codex-cli-client');
const { compareSemver, parseWingetVersion } = require('./codex-diagnostics');

const execFileAsync = promisify(execFile);

const CODEX_INSTALL_DOCS = 'https://developers.openai.com/codex/cli';
const CODEX_INSTALL_SCRIPT = 'https://chatgpt.com/codex/install.ps1';

class CodexManager {
  async isInstalled() {
    try {
      const binary = resolveCodexBinary();
      const { stdout } = await execFileAsync(binary, ['--version'], { windowsHide: true });
      return { installed: true, version: stdout.trim(), binary };
    } catch {
      return { installed: false, version: '', binary: resolveCodexBinary() };
    }
  }

  async installViaOfficialScript(onProgress) {
    onProgress?.({
      step: 'codex-install',
      message: 'Installiere Codex CLI (offizieller Windows-Installer)…',
      messageKey: 'wait.status.codexInstallOfficial',
    });
    try {
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        `$env:CODEX_NON_INTERACTIVE='1'; irm ${CODEX_INSTALL_SCRIPT} | iex`,
      ], { windowsHide: true, timeout: 600000 });
      return { success: true, method: 'official-script' };
    } catch (err) {
      return {
        success: false,
        method: 'official-script',
        message: err.message || 'Offizieller Codex-Installer fehlgeschlagen.',
      };
    }
  }

  async installViaWinget(onProgress) {
    onProgress?.({
      step: 'codex-install',
      message: 'Installiere Codex CLI über winget…',
      messageKey: 'wait.status.codexInstallWinget',
    });
    try {
      await execFileAsync('winget', [
        'install', '--id', 'OpenAI.Codex', '-e',
        '--accept-source-agreements', '--accept-package-agreements',
      ], { windowsHide: true, timeout: 300000 });
      return { success: true, method: 'winget' };
    } catch (err) {
      return {
        success: false,
        method: 'winget',
        message: err.message || 'winget-Installation fehlgeschlagen.',
      };
    }
  }

  async installViaNpm(onProgress) {
    onProgress?.({
      step: 'codex-install',
      message: 'Installiere Codex CLI über npm…',
      messageKey: 'wait.status.codexInstallNpm',
    });
    try {
      await execFileAsync('npm', ['install', '-g', '@openai/codex'], {
        windowsHide: true,
        timeout: 300000,
        shell: true,
      });
      return { success: true, method: 'npm' };
    } catch (err) {
      return {
        success: false,
        method: 'npm',
        message: err.message || 'npm-Installation fehlgeschlagen.',
      };
    }
  }

  async install(onProgress) {
    const methods = [
      () => this.installViaOfficialScript(onProgress),
      () => this.installViaWinget(onProgress),
      () => this.installViaNpm(onProgress),
    ];
    const attempts = [];
    for (const run of methods) {
      const result = await run();
      attempts.push(result);
      if (result.success) break;
    }
    const check = await this.isInstalled();
    if (check.installed) {
      return {
        success: true,
        version: check.version,
        method: attempts.find((a) => a.success)?.method || 'unknown',
        attempts,
      };
    }
    const lastMessage = attempts.filter((a) => !a.success).map((a) => a.message).filter(Boolean).pop();
    return {
      success: false,
      message: lastMessage || `Codex CLI konnte nicht installiert werden. Siehe ${CODEX_INSTALL_DOCS}`,
      attempts,
      docsUrl: CODEX_INSTALL_DOCS,
    };
  }

  async checkForUpdate() {
    const installCheck = await this.isInstalled();
    if (!installCheck.installed) {
      return {
        available: false,
        upToDate: false,
        reason: 'not_installed',
        currentVersion: '',
        availableVersion: '',
      };
    }

    if (process.platform === 'win32') {
      try {
        const { stdout } = await execFileAsync('winget', ['show', '--id', 'OpenAI.Codex', '-e'], {
          windowsHide: true,
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        });
        const availableVersion = parseWingetVersion(stdout);
        if (!availableVersion) {
          return {
            available: false,
            upToDate: false,
            reason: 'winget_version_unavailable',
            currentVersion: installCheck.version,
            availableVersion: '',
            method: 'winget',
          };
        }
        const cmp = compareSemver(availableVersion, installCheck.version);
        return {
          available: cmp > 0,
          upToDate: cmp === 0,
          currentVersion: installCheck.version,
          availableVersion,
          method: 'winget',
          reason: cmp === null ? 'version_compare_unknown' : undefined,
        };
      } catch (err) {
        return {
          available: false,
          upToDate: false,
          reason: 'winget_unavailable',
          error: err.message || String(err),
          currentVersion: installCheck.version,
          availableVersion: '',
        };
      }
    }

    try {
      const { stdout } = await execFileAsync('npm', ['view', '@openai/codex', 'version'], {
        windowsHide: true,
        timeout: 30000,
        shell: true,
      });
      const availableVersion = String(stdout || '').trim();
      const cmp = compareSemver(availableVersion, installCheck.version);
      return {
        available: cmp > 0,
        upToDate: cmp === 0,
        currentVersion: installCheck.version,
        availableVersion,
        method: 'npm',
        reason: cmp === null ? 'version_compare_unknown' : undefined,
      };
    } catch (err) {
      return {
        available: false,
        upToDate: false,
        reason: 'npm_unavailable',
        error: err.message || String(err),
        currentVersion: installCheck.version,
        availableVersion: '',
      };
    }
  }

  async updateViaWinget(onProgress) {
    onProgress?.({
      step: 'codex-update',
      message: 'Aktualisiere Codex CLI über winget…',
      messageKey: 'wait.status.codexUpdateWinget',
    });
    try {
      await execFileAsync('winget', [
        'upgrade', '--id', 'OpenAI.Codex', '-e',
        '--accept-source-agreements', '--accept-package-agreements',
      ], { windowsHide: true, timeout: 600000 });
      return { success: true, method: 'winget' };
    } catch (err) {
      return {
        success: false,
        method: 'winget',
        message: err.message || 'winget-Upgrade fehlgeschlagen.',
      };
    }
  }

  async updateViaNpm(onProgress) {
    onProgress?.({
      step: 'codex-update',
      message: 'Aktualisiere Codex CLI über npm…',
      messageKey: 'wait.status.codexUpdateNpm',
    });
    try {
      await execFileAsync('npm', ['update', '-g', '@openai/codex'], {
        windowsHide: true,
        timeout: 300000,
        shell: true,
      });
      return { success: true, method: 'npm' };
    } catch (err) {
      return {
        success: false,
        method: 'npm',
        message: err.message || 'npm-Upgrade fehlgeschlagen.',
      };
    }
  }

  async update(onProgress) {
    const before = await this.checkForUpdate();
    const installCheck = await this.isInstalled();
    if (!installCheck.installed) {
      return {
        success: false,
        reason: 'not_installed',
        message: 'Codex CLI is not installed.',
      };
    }
    if (before.upToDate) {
      return {
        success: true,
        upToDate: true,
        version: installCheck.version,
        currentVersion: installCheck.version,
      };
    }

    const methods = process.platform === 'win32'
      ? [() => this.updateViaWinget(onProgress), () => this.updateViaNpm(onProgress)]
      : [() => this.updateViaNpm(onProgress)];
    const attempts = [];
    for (const run of methods) {
      const result = await run();
      attempts.push(result);
      if (result.success) break;
    }

    invalidateCodexBinaryCache();

    const check = await this.isInstalled();
    if (!check.installed) {
      const lastMessage = attempts.filter((a) => !a.success).map((a) => a.message).filter(Boolean).pop();
      return {
        success: false,
        message: lastMessage || 'Codex CLI update finished, but the CLI is no longer reachable.',
        attempts,
      };
    }

    const after = await this.checkForUpdate();
    if (attempts.some((a) => a.success)) {
      return {
        success: true,
        version: check.version,
        previousVersion: before.currentVersion,
        availableVersion: before.availableVersion,
        method: attempts.find((a) => a.success)?.method || 'unknown',
        attempts,
        upToDate: after.upToDate || compareSemver(check.version, before.availableVersion) >= 0,
      };
    }

    const lastMessage = attempts.filter((a) => !a.success).map((a) => a.message).filter(Boolean).pop();
    return {
      success: false,
      message: lastMessage || 'Codex CLI could not be updated.',
      attempts,
      currentVersion: check.version,
    };
  }

  startLogin() {
    const child = spawn(resolveCodexBinary(), ['login'], {
      detached: true,
      stdio: 'inherit',
      shell: false,
    });
    child.unref();
    return { started: true };
  }

  async checkLoginFromBridgeStatus(bridgeStatus) {
    if (!bridgeStatus?.success) {
      return { loggedIn: false, message: bridgeStatus?.message || 'Codex nicht bereit' };
    }
    const login = bridgeStatus.details?.login_status || '';
    const loggedIn = /logged in/i.test(login);
    return { loggedIn, message: login || bridgeStatus.message };
  }
}

module.exports = {
  CodexManager,
  CODEX_INSTALL_DOCS,
  CODEX_INSTALL_SCRIPT,
};
