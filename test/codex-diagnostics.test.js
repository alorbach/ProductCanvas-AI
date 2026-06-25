'use strict';

const assert = require('assert');
const path = require('path');

const root = path.join(__dirname, '..');
const {
  parseWingetVersion,
  compareSemver,
  evaluateTextSmokeResponse,
  buildSummaryText,
  formatCapabilitiesSummary,
  formatRateLimitSummary,
  runSmokeTest,
  TEXT_SMOKE_TOKEN,
} = require(path.join(root, 'src', 'main', 'bridge', 'codex-diagnostics'));

assert.equal(parseWingetVersion('Version: 0.141.0\nPublisher: OpenAI'), '0.141.0');
assert.equal(parseWingetVersion('no version here'), '');

assert.equal(compareSemver('0.141.0', '0.140.0'), 1);
assert.equal(compareSemver('0.140.0', '0.141.0'), -1);
assert.equal(compareSemver('1.2.3', '1.2.3'), 0);
assert.equal(compareSemver('bad', '1.2.3'), null);

assert.equal(evaluateTextSmokeResponse('Reply: PCAI_OK'), true);
assert.equal(evaluateTextSmokeResponse('pcai_ok'), true);
assert.equal(evaluateTextSmokeResponse('not ok'), false);
assert.equal(TEXT_SMOKE_TOKEN, 'PCAI_OK');

assert.equal(
  formatCapabilitiesSummary({ structured_exec_json: true, image_attachments: true }),
  '--json, --image',
);
assert.equal(formatCapabilitiesSummary({}), '—');

assert.ok(
  formatRateLimitSummary({
    primary: { remainingPercent: 80 },
    secondary: { remainingPercent: 50 },
  }).includes('80%'),
);

const sampleReport = {
  generatedAt: '2026-06-24T12:00:00.000Z',
  backend: 'direct',
  overall: 'warn',
  checks: [
    { id: 'version', status: 'ok', message: '0.141.0' },
    { id: 'update', status: 'warn', message: 'Update available' },
  ],
};
const summary = buildSummaryText(sampleReport);
assert.ok(summary.includes('ProductCanvas AI — Codex diagnostics'));
assert.ok(summary.includes('[WARN] update: Update available'));

(async () => {
  const mockService = {
    getBackend: () => 'direct',
    getRateLimits: async () => ({ success: true, summary: { exhausted: false } }),
  };
  const mockProvider = {
    chat: async () => ({
      response: { choices: [{ message: { content: 'PCAI_OK' } }] },
    }),
    images: async () => ({
      response: { data: [{ b64_json: 'abc' }] },
    }),
  };

  const cliClient = require(path.join(root, 'src', 'main', 'bridge', 'codex-cli-client'));
  const originalCheckStatus = cliClient.checkStatus;

  cliClient.checkStatus = () => ({
    success: true,
    message: 'Signed in.',
    details: { login_status: 'Logged in' },
  });

  const loggedInReport = await runSmokeTest(mockService, mockProvider, { includeImage: true });
  assert.equal(loggedInReport.checks.some((c) => c.id === 'textSmoke' && c.status === 'ok'), true);
  assert.equal(loggedInReport.checks.some((c) => c.id === 'imageSmoke' && c.status === 'ok'), true);

  cliClient.checkStatus = () => ({ success: false, message: 'Not signed in.' });
  const skippedReport = await runSmokeTest(mockService, mockProvider, { includeImage: true });
  assert.equal(skippedReport.checks[0].status, 'skipped');
  assert.equal(skippedReport.checks[1].status, 'skipped');

  cliClient.checkStatus = originalCheckStatus;

  console.log('codex-diagnostics tests passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
