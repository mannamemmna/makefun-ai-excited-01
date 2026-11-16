// SPDX-License-Identifier: MIT
// make.fun ai-excited-01 — "PHOTON SURGE"
// Deterministic procedural render: a blazing spiral galaxy caught mid-eruption,
// with radial momentum streaks and a vector-font announcement burned into the
// frame. Node 22+, standard library only. `node main.ts` writes ./out/entry.png.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;
const SEED = 0x5eedc0de;

// ---------------------------------------------------------------- PRNG / noise
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix: number, iy: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ SEED;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x: number, y: number): number {
  let v = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 4; o++) {
    v += amp * valueNoise(x * f, y * f);
    amp *= 0.5;
    f *= 2.13;
  }
  return v;
}

// ---------------------------------------------------------------- vector font
// Stroke glyphs on a 5x7 grid; each entry is [x1,y1,x2,y2].
type Seg = [number, number, number, number];
const GLYPHS: Record<string, Seg[]> = {
  E: [[0,0,4,0],[0,0,0,6],[0,3,3,3],[0,6,4,6]],
  X: [[0,0,4,6],[4,0,0,6]],
  C: [[4,0,0,0],[0,0,0,6],[0,6,4,6]],
  I: [[1,0,3,0],[2,0,2,6],[1,6,3,6]],
  T: [[0,0,4,0],[2,0,2,6]],
  D: [[0,0,0,6],[0,0,2,0],[2,0,4,1],[4,1,4,5],[4,5,2,6],[2,6,0,6]],
  "!": [[2,0,2,4],[2,5.4,2,6]],
  M: [[0,6,0,0],[0,0,2,3.6],[2,3.6,4,0],[4,0,4,6]],
  A: [[0,6,2,0],[2,0,4,6],[0,4,4,4]],
  K: [[0,0,0,6],[0,3.8,4,0],[1.8,2,4,6]],
  F: [[0,0,0,6],[0,0,4,0],[0,3,3,3]],
  U: [[0,0,0,6],[0,6,4,6],[4,0,4,6]],
  N: [[0,6,0,0],[0,0,4,6],[4,6,4,0]],
  "-": [[0,3,4,3]],
  ".": [[2,5.5,2,6]],
  "0": [[0,1,1,0],[1,0,3,0],[3,0,4,1],[4,1,4,5],[4,5,3,6],[3,6,1,6],[1,6,0,5],[0,5,0,1],[0,1,4,5]],
  "1": [[1,1,2,0],[2,0,2,6],[1,6,3,6]],
};
const GW = 5, GH = 7;

const HDR = new Float32Array(W * H * 3);
const MASK = new Float32Array(W * H); // text coverage

function splatMask(cx: number, cy: number, radius: number, strength: number): void {
  const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(W - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(H - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) / radius;
      if (d < 1) MASK[y * W + x] += strength * (1 - d * d);
    }
  }
}
function strokeMask(x1: number, y1: number, x2: number, y2: number, thick: number): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(2, Math.ceil(len));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    splatMask(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, thick, 1);
  }
}
function drawText(str: string, ox: number, oy: number, scale: number, thick: number): void {
  let pen = ox;
  for (const ch of str) {
    const g = GLYPHS[ch];
    if (g) {
      for (const [ax, ay, bx, by] of g) {
        strokeMask(pen + ax * scale, oy + ay * scale, pen + bx * scale, oy + by * scale, thick);
      }
    }
    pen += (GW + 1) * scale;
  }
}

// ---------------------------------------------------------------- render
const CX = 512, CY = 430; // galaxy core, lifted so text has clean air below
function renderBackground(): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const n = fbm(x / 90, y / 90);
      const neb = Math.pow(n, 2.6) * 0.16;
      // deep space base: indigo -> near-black, subtle nebula wisp
      HDR[i] = 0.015 + neb * 0.9;
      HDR[i + 1] = 0.010 + neb * 0.35;
      HDR[i + 2] = 0.045 + neb * 1.5;
    }
  }
}
function renderGalaxy(): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - CX, dy = y - CY;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const i = (y * W + x) * 3;
      // swirl: inner gas rotates fast -> captured motion
      const swirl = a + 4.2 * Math.exp(-r / 210) - 1.15 * Math.log(r / 60 + 1);
      // two logarithmic arms
      const armPhase = Math.sin(2 * (swirl - Math.log(r / 26 + 1) * 2.4));
      const arm = Math.pow(Math.max(0, armPhase), 6) * Math.exp(-r / 330) * Math.exp(-r / 900);
      // inter-arm disc glow
      const disc = Math.exp(-r / 240) * 0.55;
      // brilliant core
      const core = Math.exp(-(r * r) / (46 * 46)) * 26 + Math.exp(-(r * r) / (120 * 120)) * 3.2;
      // hot inner ring flare
      const ring = Math.exp(-Math.pow((r - 88) / 26, 2)) * 2.4;
      const lum = core + ring + disc * 0.5 + arm * 2.6;
      // colour ramp: white-hot core -> gold -> magenta -> electric cyan edges
      const rn = Math.min(1, r / 520);
      let cr: number, cg: number, cb: number;
      if (rn < 0.22) { // core
        const t = rn / 0.22;
        cr = 1.0; cg = 0.97 - 0.12 * t; cb = 0.85 - 0.25 * t;
      } else if (rn < 0.5) { // gold -> magenta
        const t = (rn - 0.22) / 0.28;
        cr = 1.0; cg = 0.85 - 0.72 * t; cb = 0.60 + 0.28 * t;
      } else { // magenta -> cyan
        const t = (rn - 0.5) / 0.5;
        cr = 1.0 - 0.92 * t; cg = 0.13 + 0.42 * t; cb = 0.88 + 0.12 * t;
      }
      HDR[i] += lum * cr;
      HDR[i + 1] += lum * cg;
      HDR[i + 2] += lum * cb;
    }
  }
}
function splatLine(x1: number, y1: number, x2: number, y2: number, thick: number,
                   cr: number, cg: number, cb: number, gain: number): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(2, Math.ceil(len));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = x1 + (x2 - x1) * t, cy = y1 + (y2 - y1) * t;
    const fade = Math.pow(1 - t, 2.2);
    splatHDR(cx, cy, thick, cr * gain * fade, cg * gain * fade, cb * gain * fade);
  }
}
function splatHDR(cx: number, cy: number, radius: number, r: number, g: number, b: number): void {
  const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(W - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(H - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      const q = (dx * dx + dy * dy) / (radius * radius);
      if (q < 1) {
        const w = 1 - q;
        const i = (y * W + x) * 3;
        HDR[i] += r * w; HDR[i + 1] += g * w; HDR[i + 2] += b * w;
      }
    }
  }
}
function renderStreaks(rng: () => number): void {
  // 70 radial momentum streaks erupting from the core outward
  for (let s = 0; s < 70; s++) {
    const ang = rng() * Math.PI * 2;
    const inner = 70 + rng() * 90;
    const outer = inner + 180 + rng() * 420;
    const thick = 1.4 + rng() * 3.2;
    const cyan = rng() < 0.4;
    const cr = cyan ? 0.4 : 1.0;
    const cg = cyan ? 1.0 : 0.75 + rng() * 0.2;
    const cb = cyan ? 1.0 : 0.45;
    splatLine(
      CX + Math.cos(ang) * inner, CY + Math.sin(ang) * inner,
      CX + Math.cos(ang) * outer, CY + Math.sin(ang) * outer,
      thick, cr, cg, cb, 0.9 + rng() * 1.4
    );
  }
}
function renderStars(rng: () => number): void {
  for (let s = 0; s < 420; s++) {
    const x = rng() * W, y = rng() * H;
    const bright = Math.pow(rng(), 3) * 2.2 + 0.15;
    const tint = rng();
    splatHDR(x, y, 0.6 + rng() * 1.1,
      bright * (0.8 + 0.2 * tint), bright * (0.8 + 0.1 * tint), bright);
  }
}
function blurMask(): void {
  // two-pass separable box blur -> soft halo around the glyphs
  const tmp = new Float32Array(W * H);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let v = 0;
        for (let k = -3; k <= 3; k++) v += MASK[y * W + Math.min(W - 1, Math.max(0, x + k))];
        tmp[y * W + x] = v / 7;
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let v = 0;
        for (let k = -3; k <= 3; k++) v += tmp[Math.min(H - 1, Math.max(0, y + k)) * W + x];
        MASK[y * W + x] = v / 7;
      }
    }
  }
}
function compositeText(): void {
  // dark plate behind text for readability, then hot gradient fill + halo
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const m = Math.min(1, MASK[y * W + x]);
      if (m <= 0) continue;
      const grad = y / H; // top of text cyan-hot, bottom magenta-hot
      const cr = 0.4 + 0.6 * grad;
      const cg = 1.0 - 0.25 * grad;
      const cb = 1.0 - 0.2 * grad;
      // plate: darken scene under the text
      const plate = Math.min(1, m * 3.0) * 0.9;
      HDR[i] *= 1 - plate; HDR[i + 1] *= 1 - plate; HDR[i + 2] *= 1 - plate;
      const glow = Math.pow(m, 1.8) * 2.6 + m * 0.35;
      HDR[i] += glow * cr; HDR[i + 1] += glow * cg; HDR[i + 2] += glow * cb;
    }
  }
}
function toneMap(): Uint8Array {
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const o = (y * W + x) * 4;
      const dx = x / W - 0.5, dy = y / H - 0.5;
      const vig = 1 - 0.42 * Math.pow(dx * dx + dy * dy, 1.1) * 2.2;
      for (let c = 0; c < 3; c++) {
        const v = Math.max(0, HDR[i + c]) * vig;
        const mapped = v / (1 + v); // reinhard
        const g = Math.pow(mapped, 1 / 2.2);
        out[o + c] = Math.round(g * 255);
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function filterRow(cur: Uint8Array, prev: Uint8Array, bpp: number): { data: Uint8Array; score: number } {
  const n = cur.length;
  const cand: Uint8Array[] = [];
  // 0 none, 1 sub, 2 up, 3 avg, 4 paeth
  const f1 = new Uint8Array(n), f2 = new Uint8Array(n), f3 = new Uint8Array(n), f4 = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = cur[i], a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
    f1[i] = (x - a) & 0xff;
    f2[i] = (x - b) & 0xff;
    const avg = (a + b) >> 1;
    f3[i] = (x - avg) & 0xff;
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    f4[i] = (x - pr) & 0xff;
  }
  cand.push(cur, f1, f2, f3, f4);
  let best = cand[0], bestScore = Infinity, bestType = 0;
  for (let t = 0; t < 5; t++) {
    let s = 0;
    const d = cand[t];
    for (let i = 0; i < n; i++) {
      const v = d[i];
      s += v < 128 ? v : 256 - v;
    }
    if (s < bestScore) { bestScore = s; best = d; bestType = t; }
  }
  return { data: best, score: bestType };
}
function encodePNG(rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const bpp = 3;
  const stride = W * bpp;
  const rgb = new Uint8Array(stride * H);
  for (let p = 0; p < W * H; p++) {
    rgb[p * 3] = rgba[p * 4];
    rgb[p * 3 + 1] = rgba[p * 4 + 1];
    rgb[p * 3 + 2] = rgba[p * 4 + 2];
  }
  const raw = Buffer.alloc((stride + 1) * H);
  const prev = new Uint8Array(stride);
  for (let y = 0; y < H; y++) {
    const cur = rgb.subarray(y * stride, (y + 1) * stride);
    const r = filterRow(cur, prev, bpp);
    raw[y * (stride + 1)] = r.score;
    raw.set(r.data, y * (stride + 1) + 1);
    prev.set(cur);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(idat.buffer, idat.byteOffset, idat.length)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

// ---------------------------------------------------------------- main
function main(): void {
  const rng = mulberry32(SEED);
  renderBackground();
  renderGalaxy();
  renderStreaks(rng);
  renderStars(rng);
  // announcement: big headline + caption, sized to fit with margins
  const headline = "EXCITED!";
  const hscale = 19;
  const hw = headline.length * (GW + 1) * hscale - 1 * hscale;
  drawText(headline, (W - hw) / 2, 690, hscale, hscale * 0.3);
  const caption = "MAKE.FUN AI-EXCITED-01";
  const cscale = 7;
  const cw = caption.length * (GW + 1) * cscale - 1 * cscale;
  drawText(caption, (W - cw) / 2, 905, cscale, cscale * 0.4);
  blurMask();
  compositeText();
  const png = encodePNG(toneMap());
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "out";
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, "entry.png");
  fs.writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes, ${W}x${H})`);
}
main();
