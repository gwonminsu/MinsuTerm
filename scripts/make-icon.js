'use strict';
/**
 * Renders the MinsuTerm mark on a transparent background.
 * Writes build/icon.ico (multi-size), build/icon.png and src/assets/icon.png.
 *
 *   node scripts/make-icon.js            -> builds the chosen variant (VARIANT below)
 *   node scripts/make-icon.js --sheet    -> writes build/logo-options.png comparing all variants
 *
 * No dependencies: signed-distance shapes + 5x5 supersampling + PNG/ICO encoders.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const VARIANT = process.env.MT_LOGO || 'C';

const CORAL = [0xff, 0x8a, 0x5b];
const GRAD = { x1: 6, y1: 12, x2: 58, y2: 52, stops: [[0, [0x7c, 0x5c, 0xff]], [0.55, [0xc2, 0x66, 0xe8]], [1, [0xff, 0x8a, 0x5b]]] };

// Geometry in a 64x64 design grid. Later shapes paint over earlier ones.
const VARIANTS = {
  // A: "M_" — monogram stroke + terminal underscore cursor
  A: [
    { t: 'poly', pts: [[9, 47], [9, 17.5], [27, 35.5], [45, 17.5], [45, 47]], half: 4.5, fill: 'grad' },
    { t: 'rect', x: 49.5, y: 45, w: 12, h: 6.5, r: 3.2, fill: CORAL },
  ],
  // B: ">M" — shell prompt chevron followed by the monogram
  B: [
    { t: 'poly', pts: [[5, 24], [13, 32], [5, 40]], half: 3.6, fill: CORAL },
    { t: 'poly', pts: [[22, 47], [22, 17.5], [38, 33.5], [54, 17.5], [54, 47]], half: 4.5, fill: 'grad' },
  ],
  // C: M whose last stroke is a solid block cursor
  C: [
    { t: 'poly', pts: [[10, 48], [10, 16.5], [28, 34.5], [44, 18.5]], half: 4.6, fill: 'grad' },
    { t: 'rect', x: 41.5, y: 12, w: 12, h: 40.6, r: 4, fill: CORAL },
  ],
  // D: terminal window frame holding a small "M_"
  D: [
    { t: 'frame', x: 4, y: 8, w: 56, h: 48, r: 12, half: 2.7, fill: 'grad' },
    { t: 'poly', pts: [[17, 43], [17, 23], [27, 33], [37, 23], [37, 43]], half: 3.4, fill: 'grad' },
    { t: 'rect', x: 41, y: 39.6, w: 8, h: 4.8, r: 2.2, fill: CORAL },
  ],
};

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function rrectSd(px, py, { x, y, w, h, r }) {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const qy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function gradColor(px, py) {
  const { x1, y1, x2, y2, stops } = GRAD;
  const vx = x2 - x1;
  const vy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / (vx * vx + vy * vy)));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const k = (t - t0) / (t1 - t0);
      return c0.map((v, j) => v + (c1[j] - v) * k);
    }
  }
  return stops[stops.length - 1][1];
}

function hit(s, u, v, boost) {
  if (s.t === 'poly') {
    let d = Infinity;
    for (let i = 0; i < s.pts.length - 1; i++) d = Math.min(d, segDist(u, v, s.pts[i][0], s.pts[i][1], s.pts[i + 1][0], s.pts[i + 1][1]));
    return d <= s.half * boost;
  }
  if (s.t === 'rect') return rrectSd(u, v, s) <= 0;
  if (s.t === 'frame') return Math.abs(rrectSd(u, v, s)) <= s.half * boost;
  return false;
}

function render(size, shapes) {
  const SS = 5;
  const scale = 64 / size;
  const boost = size <= 24 ? 1.13 : size <= 48 ? 1.06 : 1; // heavier strokes at tiny sizes
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) * scale;
          const v = (y + (sy + 0.5) / SS) * scale;
          let col = null;
          for (const s of shapes) if (hit(s, u, v, boost)) col = s.fill === 'grad' ? gradColor(u, v) : s.fill;
          if (col) { r += col[0]; g += col[1]; b += col[2]; a += 1; }
        }
      }
      if (a) {
        const o = (y * size + x) * 4;
        px[o] = Math.round(r / a);
        px[o + 1] = Math.round(g / a);
        px[o + 2] = Math.round(b / a);
        px[o + 3] = Math.round((a / (SS * SS)) * 255);
      }
    }
  }
  return px;
}

/* --- PNG encoder --- */
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --- ICO (PNG-compressed entries) --- */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir[o] = size >= 256 ? 0 : size;
    dir[o + 1] = size >= 256 ? 0 : size;
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...images.map((x) => x.data)]);
}

/* --- macOS: the mark on a dark rounded tile (Big Sur grid: 824/1024 tile, soft drop shadow) --- */
function macTile(size, shapes) {
  const out = Buffer.alloc(size * size * 4);
  const t = size * 824 / 1024;
  const x0 = (size - t) / 2;
  const y0 = (size - t) / 2 - size * 0.01;
  const box = { x: x0, y: y0, w: t, h: t, r: t * 0.225 };
  const shadowBox = { ...box, y: y0 + size * 0.012 };
  const blur = size * 0.028;
  const top = [0x23, 0x26, 0x33];
  const bot = [0x0b, 0x0d, 0x12];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const px = x + 0.5; const py = y + 0.5;
      // shadow
      const sd2 = rrectSd(px, py, shadowBox);
      let sa = sd2 < 0 ? 0.42 : 0.42 * Math.max(0, 1 - sd2 / blur) ** 2;
      // tile
      const sd = rrectSd(px, py, box);
      const cov = Math.max(0, Math.min(1, 0.5 - sd)); // 1px anti-aliased edge
      const k = Math.max(0, Math.min(1, (py - y0) / t));
      let r = top[0] + (bot[0] - top[0]) * k;
      let g = top[1] + (bot[1] - top[1]) * k;
      let b = top[2] + (bot[2] - top[2]) * k;
      if (sd > -Math.max(1, size / 512) && sd <= 0 && py < y0 + t * 0.5) { r += 40; g += 40; b += 46; } // a light catching the top rim
      const a = cov + sa * (1 - cov);
      if (a > 0) {
        out[o] = Math.round((r * cov) / a); out[o + 1] = Math.round((g * cov) / a); out[o + 2] = Math.round((b * cov) / a);
        out[o + 3] = Math.round(a * 255);
      }
    }
  }
  const m = Math.round(t * 0.66);
  const mark = render(m, shapes);
  const mx = Math.round((size - m) / 2); const my = Math.round(y0 + (t - m) / 2);
  for (let y = 0; y < m; y++) {
    for (let x = 0; x < m; x++) {
      const s = (y * m + x) * 4; const a = mark[s + 3] / 255; if (!a) continue;
      const o = ((my + y) * size + mx + x) * 4;
      const da = out[o + 3] / 255;
      const oa = a + da * (1 - a);
      for (let c = 0; c < 3; c++) out[o + c] = Math.round((mark[s + c] * a + out[o + c] * da * (1 - a)) / oa);
      out[o + 3] = Math.round(oa * 255);
    }
  }
  return out;
}

/* --- ICNS (PNG-compressed entries, macOS 10.7+) --- */
function icns(entries) {
  const parts = entries.map(([type, data]) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

/* --- comparison sheet --- */
function sheet() {
  const keys = Object.keys(VARIANTS);
  const CELL = 300;
  const W = CELL * keys.length;
  const H = 600;
  const out = Buffer.alloc(W * H * 4);
  const fill = (x0, y0, w, h, c) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const o = (y * W + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255; }
  };
  const blit = (img, size, x0, y0) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4; const a = img[s + 3] / 255; if (!a) continue;
      const o = ((y0 + y) * W + x0 + x) * 4;
      for (let k = 0; k < 3; k++) out[o + k] = Math.round(img[s + k] * a + out[o + k] * (1 - a));
    }
  };
  keys.forEach((k, i) => {
    const x0 = i * CELL;
    fill(x0, 0, CELL, 300, [16, 19, 26]);
    fill(x0, 300, CELL, 300, [243, 244, 246]);
    const big = render(200, VARIANTS[k]);
    blit(big, 200, x0 + 50, 20);
    blit(big, 200, x0 + 320 - 270, 320);
    for (const [sz, ox] of [[48, 70], [32, 140], [16, 200]]) {
      const im = render(sz, VARIANTS[k]);
      blit(im, sz, x0 + ox, 240);
      blit(im, sz, x0 + ox, 540);
    }
  });
  fs.writeFileSync(path.join(ROOT, 'build', 'logo-options.png'), png(W, H, out));
  console.log('sheet written: build/logo-options.png (', keys.join(' '), ')');
}

fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'src', 'assets'), { recursive: true });

if (process.argv.includes('--sheet')) {
  sheet();
} else {
  const shapes = VARIANTS[VARIANT];
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const images = sizes.map((size) => ({ size, data: png(size, size, render(size, shapes)) }));
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.ico'), ico(images));
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), png(512, 512, render(512, shapes)));
  fs.writeFileSync(path.join(ROOT, 'src', 'assets', 'icon.png'), images.find((x) => x.size === 256).data);
  console.log(`icons written (variant ${VARIANT}):`, sizes.join(', '), '+ 512 png');
  // macOS: build/icon.icns + build/icon-mac.png (the Dock icon)
  const mac = {};
  for (const s of [16, 32, 64, 128, 256, 512, 1024]) mac[s] = png(s, s, macTile(s, shapes));
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.icns'), icns([
    ['icp4', mac[16]], ['icp5', mac[32]], ['ic11', mac[32]], ['ic12', mac[64]],
    ['ic07', mac[128]], ['ic08', mac[256]], ['ic13', mac[256]], ['ic09', mac[512]], ['ic14', mac[1024]], ['ic10', mac[1024]],
  ]));
  fs.writeFileSync(path.join(ROOT, 'build', 'icon-mac.png'), mac[1024]);
  console.log('macOS icon written: build/icon.icns');
}
