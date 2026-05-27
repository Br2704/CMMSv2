// Node script to generate PWA icons from tamoptix-logo.svg using sharp
// Usage: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const publicDir = path.resolve(__dirname, '../public/tamoptix');
const srcSvg = path.join(publicDir, 'tamoptix-logo.svg');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function ensureDir() {
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
}

async function generate() {
  if (!fs.existsSync(srcSvg)) {
    console.error('Source SVG not found:', srcSvg);
    process.exit(1);
  }
  await ensureDir();

  await Promise.all(sizes.map(async (s) => {
    const outPng = path.join(publicDir, `tamoptix-${s}x${s}.png`);
    await sharp(srcSvg)
      .resize(s, s)
      .png({ quality: 90 })
      .toFile(outPng);
    console.log('Written', outPng);
  }));

  // generate favicons (16,32) and ico using sharp
  await sharp(srcSvg).resize(16, 16).png().toFile(path.join(publicDir, 'favicon-16x16.png'));
  await sharp(srcSvg).resize(32, 32).png().toFile(path.join(publicDir, 'favicon-32x32.png'));
  // create favicon.ico (multi-size) - sharp cannot write .ico directly; use png-to-ico if available
  try {
    const pngToIco = require('png-to-ico');
    const icoPath = path.join(publicDir, 'favicon.ico');
    const pngs = [16, 32, 48].map((s) => path.join(publicDir, `favicon-${s}x${s}.png`));
    // ensure 48 exists
    await sharp(srcSvg).resize(48, 48).png().toFile(path.join(publicDir, 'favicon-48x48.png'));
    await pngToIco(pngs).then(buf => fs.writeFileSync(icoPath, buf));
    console.log('Written', icoPath);
  } catch (err) {
    console.warn('png-to-ico not installed; skipping favicon.ico generation. You can `npm i png-to-ico` and re-run script.');
  }
}

generate().catch(err => { console.error(err); process.exit(1); });
