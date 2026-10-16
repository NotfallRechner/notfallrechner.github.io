// Generates the PNG app icons in icons/ without any dependencies.
// Run with: node tools/make-icons.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const BG = [0x24, 0x56, 0xd6];
const FG = [0xff, 0xff, 0xff];

// Coverage of a pixel by the icon shapes, in unit coordinates (0..1).
// `rounded`: transparent rounded corners; otherwise full-bleed (maskable).
// `scale`: size of the glyph, smaller for maskable icons to stay in the safe zone.
function sample(x, y, rounded, scale) {
  let bg = 1;
  if (rounded) {
    const r = 0.22;
    const cx = Math.min(Math.max(x, r), 1 - r);
    const cy = Math.min(Math.max(y, r), 1 - r);
    bg = (x - cx) ** 2 + (y - cy) ** 2 <= r * r ? 1 : 0;
  }
  // Plus sign with rounded ends.
  const dx = Math.abs(x - 0.5) / scale;
  const dy = Math.abs(y - 0.5) / scale;
  const half = 0.27;
  const w = 0.085;
  const inBar = (a, b) => (a <= half - w && b <= w) || (a > half - w && (a - (half - w)) ** 2 + b ** 2 <= w * w);
  const fg = bg && (inBar(dx, dy) || inBar(dy, dx)) ? 1 : 0;
  return { bg, fg };
}

function render(size, rounded, scale) {
  const ss = 4;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let px = 0; px < size; px++) {
      let a = 0;
      let f = 0;
      for (let i = 0; i < ss; i++) {
        for (let j = 0; j < ss; j++) {
          const s = sample((px + (i + 0.5) / ss) / size, (py + (j + 0.5) / ss) / size, rounded, scale);
          a += s.bg;
          f += s.fg;
        }
      }
      const n = ss * ss;
      const t = a ? f / a : 0;
      const o = 1 + px * 4;
      for (let c = 0; c < 3; c++) row[o + c] = Math.round(BG[c] + (FG[c] - BG[c]) * t);
      row[o + 3] = Math.round((a / n) * 255);
    }
    rows.push(row);
  }
  return png(size, Buffer.concat(rows));
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
const icons = [
  ['icon-192.png', 192, true, 1],
  ['icon-512.png', 512, true, 1],
  ['icon-maskable-512.png', 512, false, 0.8],
  // iOS adds its own rounded corners and dislikes transparency.
  ['apple-touch-icon.png', 180, false, 1],
];
for (const [name, size, rounded, scale] of icons) {
  fs.writeFileSync(path.join(out, name), render(size, rounded, scale));
  console.log('wrote icons/' + name);
}
