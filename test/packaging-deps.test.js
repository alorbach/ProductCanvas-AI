'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert(pkg.dependencies?.undici, 'undici must be a production dependency for packaged builds');
assert(pkg.dependencies?.sharp, 'sharp must be a production dependency for packaged builds');
assert(pkg.dependencies?.archiver, 'archiver must be a production dependency for packaged builds');
assert(pkg.dependencies?.['extract-zip'], 'extract-zip must be a production dependency for packaged builds');

const undici = require('undici');
assert(typeof undici.Agent === 'function', 'undici.Agent must be available');

const bridgeSource = fs.readFileSync(
  path.join(root, 'src', 'main', 'bridge', 'bridge-client.js'),
  'utf8',
);
assert(bridgeSource.includes("require('undici')"), 'bridge-client must use undici');

console.log('All packaging-deps tests passed.');
