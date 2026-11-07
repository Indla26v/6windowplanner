// Draw the extension icons (dark rounded tile, orange ring, cream "6") as PNGs
// using only Node built-ins.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DARK = [0x14, 0x14, 0x13];
const ORANGE = [0xd9, 0x77, 0x57];
const CREAM = [0xfa, 0xf9, 0xf5];

// 5×7 glyph for "6".
const SIX = [
  '.###.',
  '#....',
  '#....',
  '####.',
  '#...#',
  '#...#',
  '.###.',
];

function sample(x, y) {
  // x, y in [0,1]
  const r = 0.22; // corner radius
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return null; // outside tile
  const d = Math.hypot(x - 0.5, y - 0.5);
  if (d > 0.3 && d < 0.4) return ORANGE;
  // glyph box centered, 0.26 wide × 0.36 tall
  const gx = (x - 0.37) / 0.26;
  const gy = (y - 0.32) / 0.36;
  if (gx >= 0 && gx < 1 && gy >= 0 && gy < 1) {
    const col = Math.floor(gx * 5);
    const row = Math.floor(gy * 7);
    if (SIX[row][col] === '#') return CREAM;
  }
  return DARK;
}

function render(size) {
  const ss = 4;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = sample((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
        }
      }
      const o = 1 + px * 4;
      if (a) { row[o] = r / a; row[o + 1] = g / a; row[o + 2] = b / a; }
      row[o + 3] = Math.round((a / (ss * ss)) * 255);
    }
    rows.push(row);
  }
  return png(size, size, Buffer.concat(rows));
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(join(root, 'chrome', 'icons'), { recursive: true });
mkdirSync(join(root, 'vscode', 'media'), { recursive: true });
for (const s of [16, 32, 48, 128]) writeFileSync(join(root, 'chrome', 'icons', `${s}.png`), render(s));
writeFileSync(join(root, 'vscode', 'media', 'icon.png'), render(128));
console.log('icons written: chrome/icons/{16,32,48,128}.png, vscode/media/icon.png');
