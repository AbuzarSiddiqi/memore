// Regenerates MEMORE app icons (PNG) + app/icon.svg
// Matches components/brand.tsx: purple rounded square (black border) + chunky
// angular lime M (bevel peaks, mitered centre V) + big black aura spark.
// The M is rendered as an exact stroke-outline polygon so PNGs share the SVG's
// sharp joins instead of capsule-round ones.
import zlib from "zlib";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const ICONS_DIR = path.join(ROOT, "public", "icons");
fs.mkdirSync(ICONS_DIR, { recursive: true });

const PURPLE = [124, 77, 255], LIME = [200, 255, 61], BLACK = [10, 10, 10];

// --- PNG encoder ---
const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function pngChunk(type, data) { const out = Buffer.alloc(8 + data.length + 4); out.writeUInt32BE(data.length, 0); out.write(type, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 8 + data.length); return out; }
function encodePNG(width, height, rgba) {
  const stride = width * 4; const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", ihdr), pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })), pngChunk("IEND", Buffer.alloc(0))]);
}

// --- geometry (0..100 space, y down) ---
function roundedRectSDF(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r), qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - r;
}
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Stroke a centreline exactly like SVG stroke-miterlimit with clipped miters:
// sharp corners (peaks) become near-pointed clipped miters, the wide centre V
// keeps its full point when it fits. Caps are butt.
const MITER_LIMIT = 1.4;
const M_PTS = [[26, 74], [26, 26], [50, 59], [74, 26], [74, 74]];

function unit(x, y) { const l = Math.hypot(x, y); return [x / l, y / l]; }
function lineIsect(q1, d1, q2, d2) {
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q2[0] - q1[0]) * d2[1] - (q2[1] - q1[1]) * d2[0]) / den;
  return [q1[0] + t * d1[0], q1[1] + t * d1[1]];
}
// boundary of the stroke's left side, walking start -> end
function leftBoundary(pts, h) {
  const n = pts.length;
  const dirs = [];
  for (let i = 0; i < n - 1; i++) dirs.push(unit(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
  const nl = (d) => [d[1], -d[0]];
  const out = [[pts[0][0] + nl(dirs[0])[0] * h, pts[0][1] + nl(dirs[0])[1] * h]];
  for (let k = 1; k < n - 1; k++) {
    const dA = dirs[k - 1], dB = dirs[k];
    const cross = dA[0] * dB[1] - dA[1] * dB[0];
    const a = [pts[k][0] + nl(dA)[0] * h, pts[k][1] + nl(dA)[1] * h];
    const b = [pts[k][0] + nl(dB)[0] * h, pts[k][1] + nl(dB)[1] * h];
    const tip = lineIsect(a, dA, b, dB);
    if (cross > 0) {
      // outer corner: miter, clipped at the limit (miter-clip)
      if (tip) {
        const len = Math.hypot(tip[0] - pts[k][0], tip[1] - pts[k][1]);
        const cap = h * MITER_LIMIT;
        if (len <= cap) out.push(a, tip, b);
        else {
          const s = cap / len;
          out.push(a, [pts[k][0] + (tip[0] - pts[k][0]) * s, pts[k][1] + (tip[1] - pts[k][1]) * s], b);
        }
      } else out.push(a, b);
    } else {
      // inner corner: the offset edges intersect behind the join
      out.push(tip ?? b);
    }
  }
  const dl = dirs[n - 2];
  out.push([pts[n - 1][0] + nl(dl)[0] * h, pts[n - 1][1] + nl(dl)[1] * h]);
  return out;
}
function strokeOutline(pts, h) {
  return [...leftBoundary(pts, h), ...leftBoundary([...pts].reverse(), h)];
}
const BLACK_M = strokeOutline(M_PTS, 13); // lime 16/2 + outline 5
const LIME_M = strokeOutline(M_PTS, 8);

// 4-point aura spark (straight-edged star reads identically at icon sizes)
const SPARK_PTS = (() => {
  const cx = 50, cy = 47, R = 13, r = R * 0.24;
  return [[cx, cy - R], [cx + r, cy - r], [cx + R, cy], [cx + r, cy + r], [cx, cy + R], [cx - r, cy + r], [cx - R, cy], [cx - r, cy - r]];
})();

function renderIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const S = size;
  const border = maskable ? 0 : S * 0.035;
  const rectHW = maskable ? 0.5 : 0.47;
  const rectR = maskable ? 0.22 : 0.25;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const u = (x + 0.5) / S, v = (y + 0.5) / S;
      let col = BLACK, alpha = 0;
      const dRect = roundedRectSDF(u, v, 0.5, 0.5, rectHW, rectHW, rectR);
      const inBorder = !maskable && (x < border || y < border || x >= S - border || y >= S - border);
      if (dRect <= 0) { col = PURPLE; alpha = 255; }
      if (inBorder) { col = BLACK; alpha = 255; }
      // maskable keeps the mark inside the 80% safe zone
      const px = maskable ? 50 + (u * 100 - 50) / 0.8 : u * 100;
      const py = maskable ? 50 + (v * 100 - 50) / 0.8 : v * 100;
      if (inPoly(px, py, BLACK_M)) { col = BLACK; alpha = 255; }
      if (inPoly(px, py, LIME_M)) { col = LIME; alpha = 255; }
      if (inPoly(px, py, SPARK_PTS)) { col = BLACK; alpha = 255; }
      rgba[i] = col[0]; rgba[i + 1] = col[1]; rgba[i + 2] = col[2]; rgba[i + 3] = alpha;
    }
  }
  return encodePNG(S, S, rgba);
}

for (const [name, size, opts] of [
  ["icon-512.png", 512, {}],
  ["icon-192.png", 192, {}],
  ["icon-512-maskable.png", 512, { maskable: true }],
  ["apple-touch-icon.png", 180, {}],
  ["icon-32.png", 32, {}],
]) {
  fs.writeFileSync(path.join(ICONS_DIR, name), renderIcon(size, opts));
  console.log("icon:", name);
}

const SPARK_SVG = "M50 33.5c.8 4.9 2.1 7.9 4.1 9.3 1.3 1 3 1.6 5.6 1.6-4.9.8-7.9 2.1-9.3 4.1-1 1.3-1.6 3-1.6 5.6-.8-4.9-2.1-7.9-4.1-9.3-1.3-1-3-1.6-5.6-1.6 4.9-.8 7.9-2.1 9.3-4.1 1-1.3 1.6-3 1.6-5.6Z";
fs.writeFileSync(
  path.join(ROOT, "app", "icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect x="3.5" y="3.5" width="93" height="93" rx="26" fill="#7C4DFF" stroke="#0a0a0a" stroke-width="6.5"/>
<path d="M26 74V26l24 33L74 26v48" fill="none" stroke="#0a0a0a" stroke-width="26" stroke-linecap="butt" stroke-linejoin="miter-clip" stroke-miterlimit="1.4"/>
<path d="M26 74V26l24 33L74 26v48" fill="none" stroke="#C8FF3D" stroke-width="16" stroke-linecap="butt" stroke-linejoin="miter-clip" stroke-miterlimit="1.4"/>
<path d="${SPARK_SVG}" fill="#0a0a0a" stroke="#0a0a0a" stroke-width="3" stroke-linejoin="round"/>
</svg>`
);
console.log("app/icon.svg written");
