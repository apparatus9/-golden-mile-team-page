import sharp from 'sharp';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const dir = 'team-photos';
const files = (await readdir(dir)).filter(f => /\.png$/i.test(f));

let beforeTotal = 0, afterTotal = 0;
for (const f of files) {
  const src = path.join(dir, f);
  const out = path.join(dir, f.replace(/\.png$/i, '.webp'));
  const before = (await stat(src)).size;
  await sharp(src)
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(out);
  const after = (await stat(out)).size;
  beforeTotal += before;
  afterTotal += after;
  console.log(`${f.padEnd(40)} ${(before/1024).toFixed(0).padStart(6)}KB -> ${(after/1024).toFixed(0).padStart(5)}KB`);
}
console.log(`\nTOTAL: ${(beforeTotal/1024/1024).toFixed(1)}MB -> ${(afterTotal/1024/1024).toFixed(2)}MB across ${files.length} photos`);
