'use strict';

const assert = require('assert');
const path = require('path');

const root = path.join(__dirname, '..');
const {
  remainingPercent,
  windowDurationLabel,
  findExhaustedWindow,
  isRateLimitExhausted,
  summarizeRateLimits,
  lowestRemainingPercent,
  buildRateLimitExhaustedError,
} = require(path.join(root, 'src', 'main', 'bridge', 'codex-rate-limits'));

const sampleLimits = {
  limitId: 'codex',
  primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1782314683 },
  secondary: { usedPercent: 92, windowDurationMins: 10080, resetsAt: 1782336085 },
  planType: 'plus',
  rateLimitReachedType: null,
};

assert.equal(remainingPercent({ usedPercent: 100 }), 0);
assert.equal(remainingPercent({ usedPercent: 12 }), 88);
assert.equal(remainingPercent(null), null);

assert.equal(windowDurationLabel({ windowDurationMins: 300 }), '5h');
assert.equal(windowDurationLabel({ windowDurationMins: 10080 }), 'weekly');

assert.equal(findExhaustedWindow(sampleLimits), null);
assert.equal(isRateLimitExhausted(sampleLimits), false);

const exhaustedPrimary = {
  ...sampleLimits,
  primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: 1782314683 },
};
const primaryHit = findExhaustedWindow(exhaustedPrimary);
assert.equal(primaryHit?.key, 'primary');
assert.equal(isRateLimitExhausted(exhaustedPrimary), true);

const exhaustedByFlag = {
  ...sampleLimits,
  rateLimitReachedType: 'primary',
};
assert.equal(findExhaustedWindow(exhaustedByFlag)?.reason, 'rateLimitReachedType');

const summary = summarizeRateLimits(sampleLimits);
assert.equal(summary.primary.remainingPercent, 88);
assert.equal(summary.secondary.remainingPercent, 8);
assert.equal(lowestRemainingPercent(summary), 8);

const err = buildRateLimitExhaustedError(exhaustedPrimary);
assert.equal(err?.code, 'codex_rate_limited');
assert.ok(err?.message.includes('0% remaining'));
assert.equal(err?.details.rateLimitRemainingPercent, 0);
assert.equal(buildRateLimitExhaustedError(sampleLimits), null);

console.log('codex-rate-limits.test.js OK');
