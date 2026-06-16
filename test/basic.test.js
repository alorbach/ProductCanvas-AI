'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

assert(fs.existsSync(path.join(root, 'package.json')), 'package.json exists');
assert(fs.existsSync(path.join(root, 'src', 'main', 'main.js')), 'main.js exists');
assert(fs.existsSync(path.join(root, 'assets', 'templates', 'templates.json')), 'templates.json exists');
assert(fs.existsSync(path.join(root, 'src', 'renderer', 'i18n', 'de.json')), 'de.json exists');

const de = JSON.parse(fs.readFileSync(path.join(root, 'src', 'renderer', 'i18n', 'de.json'), 'utf8'));
assert(de['app.title'] === 'WerbungMaker', 'German UI strings');
assert(de['generate.button'], 'generate button label');

console.log('All basic tests passed.');
