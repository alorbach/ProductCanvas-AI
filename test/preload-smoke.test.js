'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const electron = require(path.join(root, 'node_modules', 'electron'));

function runSmoke(scriptName, successTokens) {
  const script = path.join(root, 'scripts', scriptName);
  const result = spawnSync(electron, [script], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.status !== 0) {
    console.error(output.trim());
    process.exit(result.status || 1);
  }
  for (const token of successTokens) {
    if (!output.includes(token)) {
      console.error(`Expected "${token}" in smoke output:\n${output.trim()}`);
      process.exit(1);
    }
  }
}

runSmoke('smoke-preload.js', ['BRIDGE_TYPE object', 'HAS_GET_PREFERENCES true']);
runSmoke('smoke-ipc.js', ['IPC_GET_PREFERENCES']);

console.log('Preload smoke tests passed.');

