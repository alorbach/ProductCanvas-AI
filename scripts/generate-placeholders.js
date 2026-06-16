'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const examplesDir = path.join(root, 'assets', 'examples');

async function ensurePng(filePath, accent) {
  if (fs.existsSync(filePath)) {
    return;
  }
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    fs.writeFileSync(filePath, Buffer.alloc(0));
    return;
  }
  const width = 1536;
  const height = 1024;
  const color = accent === 'yellow' ? { r: 255, g: 215, b: 0 } : { r: 49, g: 180, b: 242 };
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#1a1a1a"/>
    <rect x="40" y="120" width="${width - 80}" height="${height - 280}" fill="#2a2a2a" stroke="rgb(${color.r},${color.g},${color.b})" stroke-width="4"/>
    <text x="80" y="80" fill="#fff" font-family="Arial" font-size="36" font-weight="bold">TELE-KOHLGRAF</text>
    <text x="80" y="115" fill="${accent === 'yellow' ? '#FFD700' : '#31b4f2'}" font-family="Arial" font-size="18">Ihr Partner für Bild &amp; Ton</text>
    <text x="${width / 2}" y="${height / 2}" fill="#666" font-family="Arial" font-size="24" text-anchor="middle">Produktbühne</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(filePath);
}

async function main() {
  fs.mkdirSync(examplesDir, { recursive: true });
  const examplePath = path.join(examplesDir, 'Beispiel-Martin-Logan.png');
  if (!fs.existsSync(examplePath)) {
    await ensurePng(examplePath, 'blue');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
