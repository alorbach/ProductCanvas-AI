'use strict';

const fs = require('fs');
const path = require('path');

const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');

async function main() {
  if (fs.existsSync(iconPath)) {
    return;
  }
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    return;
  }
  const svg = `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
    <rect width="256" height="256" rx="32" fill="#1a1a1a"/>
    <rect x="48" y="64" width="160" height="100" rx="8" fill="#FFD700"/>
    <text x="128" y="200" fill="#FFD700" font-family="Arial" font-size="28" font-weight="bold" text-anchor="middle">WM</text>
  </svg>`;
  const pngPath = path.join(__dirname, '..', 'assets', 'icon.png');
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
  fs.copyFileSync(pngPath, iconPath.replace('.ico', '.png'));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
