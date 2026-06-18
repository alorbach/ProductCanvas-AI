'use strict';

const { spawn, execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const CODEX_INSTALL_DOCS = 'https://developers.openai.com/codex/cli';
const CODEX_INSTALL_SCRIPT = 'https://chatgpt.com/codex/install.ps1';

class CodexManager {
  async isInstalled() {
    try {
      const { stdout } = await execFileAsync('codex', ['--version'], { windowsHide: true });
      return { installed: true, version: stdout.trim() };
    } catch {
      return { installed: false, version: '' };
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

  startLogin() {
    const child = spawn('codex', ['login'], {
      detached: true,
      stdio: 'inherit',
      shell: true,
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
