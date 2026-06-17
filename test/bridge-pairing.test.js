'use strict';

const assert = require('assert');
const path = require('path');
const { BridgeClient } = require(path.join(__dirname, '..', 'src', 'main', 'bridge', 'bridge-client'));
const { BridgeManager } = require(path.join(__dirname, '..', 'src', 'main', 'bridge', 'bridge-manager'));

assert(BridgeClient.isPairingError({ status: 403, message: 'This WordPress origin is not paired' }));
assert(BridgeClient.isPairingError({ status: 403, message: 'invalid token' }));
assert(!BridgeClient.isPairingError({ status: 400, message: 'bad request' }));

async function testIsPairedWithoutToken() {
  const manager = new BridgeManager();
  manager.client.token = '';
  const paired = await manager.isPaired({
    bridge: { paired_origins: ['http://127.0.0.1:9473'] },
  });
  assert.strictEqual(paired, false, 'origin listed but no token must not count as paired');
}

async function testIsPairedInvalidToken() {
  const manager = new BridgeManager();
  manager.client.token = 'stale-token';
  manager.client.validatePairing = async () => {
    const err = new Error('not paired');
    err.status = 403;
    throw err;
  };
  const paired = await manager.isPaired({});
  assert.strictEqual(paired, false);
  assert.strictEqual(manager.client.token, '', 'invalid token should be cleared');
}

function testImagesPairingNotMasked() {
  const source = require('fs').readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'bridge', 'bridge-client.js'),
    'utf8',
  );
  assert(
    source.includes('if (BridgeClient.isPairingError(err) || err.needsPairing)'),
    'pairing errors must not be wrapped as REFERENCE_ATTACH_FAILED',
  );
}

(async () => {
  await testIsPairedWithoutToken();
  await testIsPairedInvalidToken();
  testImagesPairingNotMasked();
  console.log('All bridge-pairing tests passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
