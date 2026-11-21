import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'AdManager');
const dst = path.join(root, 'dist', 'AdManager');
if (!fs.existsSync(src)) process.exit(0);
fs.mkdirSync(dst, { recursive: true });

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, ent.name);
    const d = path.join(to, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(src, dst);

// Generate manifest.json and manifest.js from actual files
const imgRe = /\.(?:jpe?g|png|webp|mp4|webm)$/i;
function list(kind) {
  const dir = path.join(src, kind);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => imgRe.test(f)).sort();
}
const manifest = { billboards: list('billboards'), overheads: list('overheads') };
const json = JSON.stringify(manifest, null, 2);
fs.writeFileSync(path.join(src, 'manifest.json'), json);
fs.writeFileSync(path.join(dst, 'manifest.json'), json);
const js = `window.__BAJAJ_AD_MANIFEST__ = ${JSON.stringify(manifest)};\n`;
fs.writeFileSync(path.join(src, 'manifest.js'), js);
fs.writeFileSync(path.join(dst, 'manifest.js'), js);
console.log('AdManager synced:', manifest);
