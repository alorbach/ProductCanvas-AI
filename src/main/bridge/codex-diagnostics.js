'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const debugLog = require('../debug/logger');
const {
  getCodexCliInfo,
  probeCapabilities,
} = require('./codex-cli-client');
const { remainingPercent } = require('./codex-rate-limits');

const execFileAsync = promisify(execFile);

const TEXT_SMOKE_TOKEN = 'PCAI_OK';
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const WINGET_UPGRADE_HINT = 'winget upgrade --id OpenAI.Codex -e';
const GITHUB_API_URL = 'https://api.github.com';

function parseSemverParts(version) {
  const match = String(version || '').trim().match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a, b) {
  const left = parseSemverParts(a);
  const right = parseSemverParts(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i += 1) {
    if (left[i] > right[i]) return 1;
    if (left[i] < right[i]) return -1;
  }
  return 0;
}

function parseWingetVersion(output) {
  const text = String(output || '');
  const versionMatch = text.match(/^\s*Version:\s*(.+)$/im);
  return versionMatch ? versionMatch[1].trim() : '';
}

function makeCheck(id, labelKey, status, message, details = null, durationMs = 0) {
  return { id, labelKey, status, message, details, durationMs };
}

function aggregateOverall(checks) {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return 'ok';
}

function formatCapabilitiesSummary(features = {}) {
  const parts = [];
  if (features.structured_exec_json) parts.push('--json');
  if (features.image_attachments) parts.push('--image');
  if (features.image_masks) parts.push('--mask');
  return parts.length ? parts.join(', ') : '—';
}

function formatRateLimitSummary(summary) {
  if (!summary) return '—';
  const primary = summary.primary?.remainingPercent;
  const secondary = summary.secondary?.remainingPercent;
  const fmt = (value, label) => (typeof value === 'number' ? `${label} ${value}%` : `${label} —`);
  return `${fmt(primary, '5h')}; ${fmt(secondary, 'weekly')}`;
}

function buildSummaryText(report) {
  const lines = [
    `ProductCanvas AI — Codex diagnostics`,
    `Generated: ${report.generatedAt}`,
    `Backend: ${report.backend}`,
    `Overall: ${report.overall}`,
    '',
  ];
  for (const check of report.checks || []) {
    lines.push(`[${check.status.toUpperCase()}] ${check.id}: ${check.message}`);
    if (check.details && typeof check.details === 'object') {
      for (const [key, value] of Object.entries(check.details)) {
        if (value == null || value === '') continue;
        lines.push(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
      }
    }
  }
  return lines.join('\n');
}

function evaluateTextSmokeResponse(responseText) {
  return /PCAI_OK/i.test(String(responseText || ''));
}

async function timed(fn) {
  const start = Date.now();
  const result = await fn();
  return { result, durationMs: Date.now() - start };
}

async function checkWingetUpdate(currentVersion) {
  if (process.platform !== 'win32') {
    return makeCheck(
      'update',
      'codex.diagnostics.check.update',
      'skipped',
      'winget update check is only available on Windows.',
      { currentVersion: currentVersion || '—' },
    );
  }
  try {
    const { stdout } = await execFileAsync('winget', ['show', '--id', 'OpenAI.Codex', '-e'], {
      windowsHide: true,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    const availableVersion = parseWingetVersion(stdout);
    if (!availableVersion) {
      return makeCheck(
        'update',
        'codex.diagnostics.check.update',
        'skipped',
        'Could not read available version from winget.',
        { currentVersion: currentVersion || '—' },
      );
    }
    const cmp = compareSemver(availableVersion, currentVersion);
    if (cmp === null) {
      return makeCheck(
        'update',
        'codex.diagnostics.check.update',
        'warn',
        `Installed: ${currentVersion || '—'}; winget: ${availableVersion}`,
        { currentVersion, availableVersion, upgradeHint: WINGET_UPGRADE_HINT },
      );
    }
    if (cmp > 0) {
      return makeCheck(
        'update',
        'codex.diagnostics.check.update',
        'warn',
        `Update available: ${currentVersion || '—'} → ${availableVersion}`,
        { currentVersion, availableVersion, upgradeHint: WINGET_UPGRADE_HINT },
      );
    }
    return makeCheck(
      'update',
      'codex.diagnostics.check.update',
      'ok',
      `Up to date (${currentVersion || availableVersion}).`,
      { currentVersion: currentVersion || availableVersion, availableVersion },
    );
  } catch (err) {
    return makeCheck(
      'update',
      'codex.diagnostics.check.update',
      'skipped',
      err.message || 'winget is not available.',
      { currentVersion: currentVersion || '—' },
    );
  }
}

async function checkGithubReachable() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(GITHUB_API_URL, {
      method: 'HEAD',
      signal: controller.signal,
    });
    return makeCheck(
      'github',
      'codex.diagnostics.check.github',
      response.ok || response.status === 403 ? 'ok' : 'warn',
      response.ok ? 'GitHub API reachable.' : `GitHub API returned HTTP ${response.status}.`,
      { status: response.status },
    );
  } catch (err) {
    return makeCheck(
      'github',
      'codex.diagnostics.check.github',
      'warn',
      err.message || 'GitHub API not reachable.',
    );
  } finally {
    clearTimeout(timer);
  }
}

async function runStaticChecks(codexService, codexManager) {
  const checks = [];
  const backend = codexService.getBackend();

  const { result: cliInfo, durationMs: cliInfoMs } = await timed(async () => getCodexCliInfo());
  checks.push(makeCheck(
    'binary',
    'codex.diagnostics.check.binary',
    cliInfo.binaryExists ? 'ok' : 'fail',
    cliInfo.binaryExists
      ? `CLI found (${cliInfo.resolutionSource}).`
      : 'Codex CLI binary not found.',
    {
      resolvedBinary: cliInfo.resolvedBinary,
      resolutionSource: cliInfo.resolutionSource,
      configuredPath: cliInfo.configuredPath || undefined,
      envOverride: cliInfo.envOverride || undefined,
    },
    cliInfoMs,
  ));

  const { result: installCheck, durationMs: versionMs } = await timed(() => codexManager.isInstalled());
  checks.push(makeCheck(
    'version',
    'codex.diagnostics.check.version',
    installCheck.installed ? 'ok' : 'fail',
    installCheck.installed ? installCheck.version : 'codex --version failed.',
    { version: installCheck.version || undefined, binary: installCheck.binary || undefined },
    versionMs,
  ));

  const { checkStatus } = require('./codex-cli-client');
  const { result: status, durationMs: statusMs } = await timed(async () => checkStatus());
  const loggedIn = !!status.success;
  checks.push(makeCheck(
    'login',
    'codex.diagnostics.check.login',
    loggedIn ? 'ok' : (installCheck.installed ? 'fail' : 'skipped'),
    loggedIn ? 'Signed in.' : (status.message || 'Not signed in.'),
    {
      loginStatus: status.details?.login_status || undefined,
      authPath: status.details?.auth_path || undefined,
    },
    statusMs,
  ));

  checks.push(makeCheck(
    'auth',
    'codex.diagnostics.check.auth',
    cliInfo.authExists ? 'ok' : (loggedIn ? 'warn' : 'fail'),
    cliInfo.authExists ? 'auth.json present.' : 'auth.json missing.',
    { authPath: cliInfo.authPath },
  ));

  const { result: capabilities, durationMs: capMs } = await timed(async () => probeCapabilities());
  checks.push(makeCheck(
    'capabilities',
    'codex.diagnostics.check.capabilities',
    capabilities.success ? 'ok' : 'warn',
    capabilities.success ? formatCapabilitiesSummary(capabilities.features) : 'Could not probe exec --help.',
    {
      version: capabilities.codex?.version || undefined,
      features: capabilities.features,
    },
    capMs,
  ));

  const { result: ratePayload, durationMs: rateMs } = await timed(() => codexService.getRateLimits({ force: true }));
  let rateStatus = 'skipped';
  let rateMessage = 'Rate limits unavailable.';
  if (ratePayload?.success && ratePayload.summary) {
    rateStatus = ratePayload.summary.exhausted ? 'warn' : 'ok';
    rateMessage = formatRateLimitSummary(ratePayload.summary);
  } else if (ratePayload?.reason === 'not_logged_in') {
    rateMessage = 'Sign in required for rate limits.';
  } else if (ratePayload?.error) {
    rateStatus = 'warn';
    rateMessage = ratePayload.error;
  }
  checks.push(makeCheck(
    'rateLimits',
    'codex.diagnostics.check.rateLimits',
    rateStatus,
    rateMessage,
    ratePayload?.summary || { reason: ratePayload?.reason || undefined },
    rateMs,
  ));

  const { result: fullStatus, durationMs: backendMs } = await timed(() => codexService.getFullStatus());
  const backendMessage = backend === 'bridge'
    ? `Bridge ${fullStatus.running ? 'reachable' : 'not reachable'}; paired: ${fullStatus.paired ? 'yes' : 'no'}.`
    : 'Direct CLI backend.';
  checks.push(makeCheck(
    'backend',
    'codex.diagnostics.check.backend',
    backend === 'bridge'
      ? (fullStatus.ready && fullStatus.paired ? 'ok' : 'warn')
      : (fullStatus.ready ? 'ok' : 'warn'),
    backendMessage,
    {
      backend,
      bridgeUrl: fullStatus.bridgeUrl || undefined,
      origin: fullStatus.origin || undefined,
      ready: fullStatus.ready,
      paired: fullStatus.paired,
    },
    backendMs,
  ));

  const { result: updateCheck, durationMs: updateMs } = await timed(() => checkWingetUpdate(installCheck.version));
  updateCheck.durationMs = updateMs;
  checks.push(updateCheck);

  const { result: githubCheck, durationMs: githubMs } = await timed(() => checkGithubReachable());
  githubCheck.durationMs = githubMs;
  checks.push(githubCheck);

  const report = {
    generatedAt: new Date().toISOString(),
    backend,
    overall: aggregateOverall(checks),
    checks,
    summaryText: '',
    fullStatus,
    rateLimits: ratePayload || null,
    capabilities: capabilities || null,
    installCheck,
  };
  report.summaryText = buildSummaryText(report);
  debugLog.info('codex-diagnostics', 'Static checks completed', {
    overall: report.overall,
    backend: report.backend,
    check_count: checks.length,
  });
  return report;
}

async function withDiagTimeouts(chatMs, imageMs, fn) {
  const prevChat = process.env.ALORBACH_CODEX_CHAT_TIMEOUT_MS;
  const prevImage = process.env.ALORBACH_CODEX_IMAGE_TIMEOUT_MS;
  process.env.ALORBACH_CODEX_CHAT_TIMEOUT_MS = String(chatMs);
  process.env.ALORBACH_CODEX_IMAGE_TIMEOUT_MS = String(imageMs);
  try {
    return await fn();
  } finally {
    if (prevChat === undefined) delete process.env.ALORBACH_CODEX_CHAT_TIMEOUT_MS;
    else process.env.ALORBACH_CODEX_CHAT_TIMEOUT_MS = prevChat;
    if (prevImage === undefined) delete process.env.ALORBACH_CODEX_IMAGE_TIMEOUT_MS;
    else process.env.ALORBACH_CODEX_IMAGE_TIMEOUT_MS = prevImage;
  }
}

async function runSmokeTest(codexService, provider, options = {}) {
  const includeImage = options.includeImage === true;
  const checks = [];
  const backend = codexService.getBackend();
  const chatTimeout = Number(process.env.ALORBACH_CODEX_DIAG_CHAT_TIMEOUT_MS || 60000);
  const imageTimeout = Number(process.env.ALORBACH_CODEX_DIAG_IMAGE_TIMEOUT_MS || 120000);

  const { checkStatus } = require('./codex-cli-client');
  const status = checkStatus();
  if (!status.success) {
    const skipped = makeCheck(
      'textSmoke',
      'codex.diagnostics.check.textSmoke',
      'skipped',
      status.message || 'Sign in required before smoke test.',
    );
    checks.push(skipped);
    if (includeImage) {
      checks.push(makeCheck(
        'imageSmoke',
        'codex.diagnostics.check.imageSmoke',
        'skipped',
        'Skipped because Codex is not signed in.',
      ));
    }
    const report = {
      generatedAt: new Date().toISOString(),
      backend,
      overall: 'fail',
      checks,
      summaryText: '',
    };
    report.summaryText = buildSummaryText(report);
    return report;
  }

  const textStart = Date.now();
  try {
    const chatResult = await withDiagTimeouts(chatTimeout, imageTimeout, () => provider.chat({
      model: 'codex-local:auto',
      messages: [{
        role: 'user',
        content: `Reply with exactly: ${TEXT_SMOKE_TOKEN} and nothing else.`,
      }],
    }, 'diag-text-smoke'));
    const responseText = chatResult?.response?.choices?.[0]?.message?.content || '';
    const ok = evaluateTextSmokeResponse(responseText);
    checks.push(makeCheck(
      'textSmoke',
      'codex.diagnostics.check.textSmoke',
      ok ? 'ok' : 'fail',
      ok ? 'Text prompt returned expected token.' : 'Text prompt did not return PCAI_OK.',
      { responsePreview: String(responseText).slice(0, 500) },
      Date.now() - textStart,
    ));
  } catch (err) {
    checks.push(makeCheck(
      'textSmoke',
      'codex.diagnostics.check.textSmoke',
      'fail',
      err.message || 'Text smoke test failed.',
      err.details || undefined,
      Date.now() - textStart,
    ));
  }

  if (includeImage) {
    const ratePayload = await codexService.getRateLimits({ force: true });
    const exhausted = ratePayload?.summary?.exhausted
      || remainingPercent(ratePayload?.rateLimits?.primary) === 0
      || remainingPercent(ratePayload?.rateLimits?.secondary) === 0;
    if (exhausted) {
      checks.push(makeCheck(
        'imageSmoke',
        'codex.diagnostics.check.imageSmoke',
        'warn',
        'Rate limit exhausted; image smoke test skipped.',
        ratePayload?.summary || undefined,
      ));
    } else {
      const imageStart = Date.now();
      try {
        const imageResult = await withDiagTimeouts(chatTimeout, imageTimeout, () => provider.images({
          prompt: 'Generate a simple 64x64 solid blue square PNG.',
          size: '1024x1024',
          quality: 'low',
          reference_images: [{
            b64_json: TINY_PNG_B64,
            mime_type: 'image/png',
            label: 'reference',
          }],
        }, 'diag-image-smoke'));
        const hasImage = Boolean(imageResult?.response?.data?.[0]?.b64_json);
        checks.push(makeCheck(
          'imageSmoke',
          'codex.diagnostics.check.imageSmoke',
          hasImage ? 'ok' : 'fail',
          hasImage ? 'Image smoke test returned PNG data.' : 'Image smoke test produced no image.',
          {
            imageSource: imageResult?.response?.provider_details?.image_source || undefined,
          },
          Date.now() - imageStart,
        ));
      } catch (err) {
        checks.push(makeCheck(
          'imageSmoke',
          'codex.diagnostics.check.imageSmoke',
          'fail',
          err.message || 'Image smoke test failed.',
          err.details || undefined,
          Date.now() - imageStart,
        ));
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    backend,
    overall: aggregateOverall(checks),
    checks,
    summaryText: '',
  };
  report.summaryText = buildSummaryText(report);
  debugLog.info('codex-diagnostics', 'Smoke test completed', {
    overall: report.overall,
    backend: report.backend,
    include_image: includeImage,
    check_count: checks.length,
  });
  return report;
}

module.exports = {
  TEXT_SMOKE_TOKEN,
  WINGET_UPGRADE_HINT,
  parseWingetVersion,
  compareSemver,
  evaluateTextSmokeResponse,
  buildSummaryText,
  formatCapabilitiesSummary,
  formatRateLimitSummary,
  runStaticChecks,
  runSmokeTest,
};
