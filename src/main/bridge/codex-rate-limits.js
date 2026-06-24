'use strict';

const { spawn } = require('child_process');

const DEFAULT_TIMEOUT_MS = Number(process.env.ALORBACH_CODEX_RATE_LIMIT_TIMEOUT_MS || 15000);

function remainingPercent(window) {
  if (!window || typeof window.usedPercent !== 'number' || Number.isNaN(window.usedPercent)) {
    return null;
  }
  return Math.max(0, 100 - window.usedPercent);
}

function windowDurationLabel(window) {
  const mins = Number(window?.windowDurationMins || 0);
  if (mins > 0 && mins <= 360) return '5h';
  if (mins >= 1440) return 'weekly';
  if (mins > 0) return `${mins}m`;
  return 'limit';
}

function formatResetLabel(resetsAt, locale = 'en') {
  const seconds = Number(resetsAt || 0);
  if (!seconds) return '';
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleString(locale === 'de' ? 'de-DE' : 'en-US', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return date.toISOString();
  }
}

function findExhaustedWindow(rateLimits) {
  if (!rateLimits) return null;
  if (rateLimits.rateLimitReachedType) {
    const key = rateLimits.primary ? 'primary' : 'secondary';
    return { key, window: rateLimits[key] || null, reason: 'rateLimitReachedType' };
  }
  for (const key of ['primary', 'secondary']) {
    const window = rateLimits[key];
    const remaining = remainingPercent(window);
    if (remaining === 0) {
      return { key, window, reason: 'remaining_zero' };
    }
  }
  return null;
}

function isRateLimitExhausted(rateLimits) {
  return !!findExhaustedWindow(rateLimits);
}

function summarizeRateLimits(rateLimits) {
  const primaryRemaining = remainingPercent(rateLimits?.primary);
  const secondaryRemaining = remainingPercent(rateLimits?.secondary);
  return {
    planType: rateLimits?.planType || null,
    exhausted: isRateLimitExhausted(rateLimits),
    rateLimitReachedType: rateLimits?.rateLimitReachedType || null,
    primary: {
      label: windowDurationLabel(rateLimits?.primary),
      usedPercent: rateLimits?.primary?.usedPercent ?? null,
      remainingPercent: primaryRemaining,
      resetsAt: rateLimits?.primary?.resetsAt ?? null,
    },
    secondary: {
      label: windowDurationLabel(rateLimits?.secondary),
      usedPercent: rateLimits?.secondary?.usedPercent ?? null,
      remainingPercent: secondaryRemaining,
      resetsAt: rateLimits?.secondary?.resetsAt ?? null,
    },
  };
}

function lowestRemainingPercent(summary) {
  if (!summary) return null;
  const values = [summary.primary?.remainingPercent, summary.secondary?.remainingPercent]
    .filter((value) => typeof value === 'number' && !Number.isNaN(value));
  if (!values.length) return null;
  return Math.min(...values);
}

function buildRateLimitExhaustedError(rateLimits, locale = 'en') {
  const exhausted = findExhaustedWindow(rateLimits);
  if (!exhausted) return null;

  const windowLabel = windowDurationLabel(exhausted.window);
  const resetLabel = formatResetLabel(exhausted.window?.resetsAt, locale);
  const remaining = remainingPercent(exhausted.window);
  const message = resetLabel
    ? `Codex ${windowLabel} rate limit has 0% remaining (resets ${resetLabel}). Please wait and retry.`
    : `Codex ${windowLabel} rate limit has 0% remaining. Please wait and retry.`;

  const err = new Error(message);
  err.code = 'codex_rate_limited';
  err.details = {
    rateLimits,
    exhaustedWindow: exhausted.key,
    exhaustedWindowLabel: windowLabel,
    rateLimitWindow: windowLabel,
    rateLimitRemainingPercent: remaining,
    rateLimitResetsAt: exhausted.window?.resetsAt || null,
    rateLimitResetLabel: resetLabel,
    rateLimitReachedType: rateLimits.rateLimitReachedType || null,
  };
  return err;
}

function readRateLimits(options = {}) {
  const {
    codexBinary,
    codexHome,
    timeout = DEFAULT_TIMEOUT_MS,
  } = options;

  if (!codexBinary) {
    return Promise.reject(new Error('Codex binary is not configured.'));
  }

  return new Promise((resolve, reject) => {
    let proc;
    let stdout = '';
    let reqId = 0;
    const pending = new Map();
    const timer = setTimeout(() => {
      try { proc?.kill(); } catch { /* ignore */ }
      reject(new Error('Timeout waiting for Codex rate limit status.'));
    }, timeout);

    const cleanup = (err, result) => {
      clearTimeout(timer);
      try { proc?.kill(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(result);
    };

    try {
      proc = spawn(codexBinary, ['app-server'], {
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: codexHome ? { ...process.env, CODEX_HOME: codexHome } : process.env,
      });
    } catch (error) {
      cleanup(error);
      return;
    }

    proc.on('error', (error) => {
      cleanup(new Error(`Failed to start codex app-server: ${error.message}`));
    });

    proc.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
      let newlineIndex = stdout.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = stdout.slice(0, newlineIndex).trim();
        stdout = stdout.slice(newlineIndex + 1);
        newlineIndex = stdout.indexOf('\n');
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        const cb = pending.get(msg.id);
        if (!cb) continue;
        pending.delete(msg.id);
        cb(msg);
      }
    });

    function rpc(method, params = {}) {
      return new Promise((res, rej) => {
        const id = ++reqId;
        pending.set(id, (msg) => {
          if (msg.error) {
            rej(new Error(msg.error.message || `Codex app-server ${method} failed.`));
            return;
          }
          res(msg.result);
        });
        proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    }

    (async () => {
      try {
        await rpc('initialize', {
          clientInfo: { name: 'productcanvas-ai', version: '1.0.0' },
        });
        const result = await rpc('account/rateLimits/read');
        cleanup(null, result?.rateLimits || result || null);
      } catch (error) {
        cleanup(error);
      }
    })();
  });
}

async function assertRateLimitAvailable(options = {}) {
  const rateLimits = await readRateLimits(options);
  const err = buildRateLimitExhaustedError(rateLimits, options.locale);
  if (err) throw err;
  return rateLimits;
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  remainingPercent,
  windowDurationLabel,
  formatResetLabel,
  findExhaustedWindow,
  isRateLimitExhausted,
  summarizeRateLimits,
  lowestRemainingPercent,
  buildRateLimitExhaustedError,
  readRateLimits,
  assertRateLimitAvailable,
};
