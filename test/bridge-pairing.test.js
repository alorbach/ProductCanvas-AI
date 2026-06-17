'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const paths = require(path.join(__dirname, '..', 'src', 'main', 'paths'));
const { BridgeClient } = require(path.join(__dirname, '..', 'src', 'main', 'bridge', 'bridge-client'));
const { BridgeManager } = require(path.join(__dirname, '..', 'src', 'main', 'bridge', 'bridge-manager'));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-bridge-pairing-'));
const origUserData = paths.userDataRoot;
paths.userDataRoot = () => tmpDir;

assert(BridgeClient.isPairingError({ status: 403, message: 'This WordPress origin is not paired' }));
assert(BridgeClient.isPairingError({ status: 403, message: 'invalid token' }));
assert(!BridgeClient.isPairingError({ status: 400, message: 'bad request' }));

async function testIsPairedWithoutToken() {
  const manager = new BridgeManager();
  manager.client.reloadBridgeState = () => {};
  manager.client.token = '';
  manager.client.importKnownToken = () => false;
  manager.client.syncTokenFromBridgeServer = () => false;
  const paired = await manager.isPaired({
    bridge: { paired_origins: ['http://127.0.0.1:9473'] },
  });
  assert.strictEqual(paired, false, 'origin listed but no token must not count as paired');
}

async function testIsPairedInvalidToken() {
  const manager = new BridgeManager();
  manager.client.reloadBridgeState = () => {};
  manager.client.token = 'stale-token';
  manager.client.validatePairingWithRetry = async () => {
    const err = new Error('not paired');
    err.status = 403;
    throw err;
  };
  manager.client.syncTokenFromBridgeServer = () => false;
  const paired = await manager.isPaired({ bridge: { paired_origins: [] } });
  assert.strictEqual(paired, false);
  assert.strictEqual(manager.client.token, '', 'invalid token should be cleared');
}

async function testIsPairedSyncsFromBridgeServer() {
  const manager = new BridgeManager();
  manager.client.reloadBridgeState = () => {};
  manager.client.token = 'stale-token';
  manager.client.validatePairingWithRetry = async () => {
    if (manager.client.token === 'fresh-token') {
      return { success: true };
    }
    const err = new Error('not paired');
    err.status = 403;
    throw err;
  };
  manager.client.syncTokenFromBridgeServer = function sync() {
    if (this.token === 'fresh-token') return false;
    this.token = 'fresh-token';
    return true;
  };
  const paired = await manager.isPaired({
    bridge: { paired_origins: ['http://127.0.0.1:9473'] },
  });
  assert.strictEqual(paired, true, 'should recover using bridge server token');
  assert.strictEqual(manager.client.token, 'fresh-token');
}

function testImagesPairingNotMasked() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'bridge', 'bridge-client.js'),
    'utf8',
  );
  assert(
    source.includes('if (BridgeClient.isPairingError(err) || err.needsPairing)'),
    'pairing errors must not be wrapped as REFERENCE_ATTACH_FAILED',
  );
}

function testSubscribeJobEventsUsesToken() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'bridge', 'bridge-client.js'),
    'utf8',
  );
  assert(
    source.includes("headers['X-Alorbach-Bridge-Token'] = this.token"),
    'SSE subscription must send bridge token when available',
  );
  assert(
    source.includes('if (!response.ok)'),
    'SSE subscription must check response.ok before reading body',
  );
}

(async () => {
  try {
    await testIsPairedWithoutToken();
    await testIsPairedInvalidToken();
    await testIsPairedSyncsFromBridgeServer();
    testImagesPairingNotMasked();
    testSubscribeJobEventsUsesToken();
    console.log('All bridge-pairing tests passed.');
  } finally {
    paths.userDataRoot = origUserData;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
