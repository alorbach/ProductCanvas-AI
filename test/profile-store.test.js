'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const paths = require(path.join(root, 'src', 'main', 'paths'));
const { ProfileStore } = require(path.join(root, 'src', 'main', 'profiles', 'profile-store'));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcai-profile-store-'));
const origUserData = paths.userDataRoot;
paths.userDataRoot = () => tmpDir;

try {
  const store = new ProfileStore();
  const sharedSource = path.join(tmpDir, 'photo.png');
  fs.writeFileSync(sharedSource, 'fake-png');
  const profilePath = path.join(tmpDir, 'profiles', 'test.pcprofile.json');
  const session = {
    profileName: 'Test',
    referenceImages: [
      { path: sharedSource, name: 'photo.png' },
      { path: sharedSource, name: 'photo.png' },
    ],
  };

  const saved = store.saveProfile(profilePath, session, 'Test');
  assert.strictEqual(saved.name, 'Test');

  const profileDir = path.join(path.dirname(profilePath), 'test');
  const copied = fs.readdirSync(profileDir).filter((name) => name.endsWith('.png')).sort();
  assert.deepStrictEqual(copied, ['photo-1.png', 'photo.png'], 'duplicate basenames get unique profile copies');
} finally {
  paths.userDataRoot = origUserData;
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('All profile-store tests passed.');
