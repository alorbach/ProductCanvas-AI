'use strict';

const { spawn, execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

class CodexManager {
  async isInstalled() {
    try {
      const { stdout } = await execFileAsync('codex', ['--version'], { windowsHide: true });
      return { installed: true, version: stdout.trim() };
    } catch {
      return { installed: false, version: '' };
    }
  }

  async installViaWinget(onProgress) {
    onProgress?.({ step: 'codex-install', message: 'Installiere Codex CLI über winget…' });
    try {
      await execFileAsync('winget', [
        'install', '--id', 'OpenAI.Codex', '-e',
        '--accept-source-agreements', '--accept-package-agreements',
      ], { windowsHide: true, timeout: 300000 });
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message || 'winget-Installation fehlgeschlagen.' };
    }
  }

  async installViaNpm(onProgress) {
    onProgress?.({ step: 'codex-install', message: 'Installiere Codex CLI über npm…' });
    try {
      await execFileAsync('npm', ['install', '-g', '@openai/codex'], {
        windowsHide: true,
        timeout: 300000,
        shell: true,
      });
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message || 'npm-Installation fehlgeschlagen.' };
    }
  }

  async ensureInstalled(onProgress) {
    let check = await this.isInstalled();
    if (check.installed) {
      return { success: true, version: check.version };
    }
    let result = await this.installViaWinget(onProgress);
    if (!result.success) {
      result = await this.installViaNpm(onProgress);
    }
    check = await this.isInstalled();
    if (check.installed) {
      return { success: true, version: check.version };
    }
    return {
      success: false,
      message: 'Codex CLI konnte nicht automatisch installiert werden. Bitte manuell installieren: https://github.com/openai/codex',
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

module.exports = { CodexManager };
