// Native-grid pixel art pipeline — a prototype. Draws directly on a 128×128
// integer grid: no supersampling, no smoothing, every op writes whole pixels.
// Nothing imports this yet.

import type { SpriteTex } from "./types";

export const PIX = 128;

type RGB = [number, number, number];
export type Ramp = [RGB, RGB, RGB, RGB]; // [shadow, base, light, highlight]

const clamp = (v: number): number => Math.max(0, Math.min(255, v));

// 4-tone ramp: shadow darker AND cooler (toward indigo), lights lighter AND
// warmer (toward amber).
export function ramp(base: RGB): Ramp {
  return [
    [clamp(base[0] * 0.55), clamp(base[1] * 0.55), clamp(base[2] * 0.55 + 18)],
    base,
    [clamp(base[0] * 1.25 + 10), clamp(base[1] * 1.25 + 6), clamp(base[2] * 1.25)],
    [clamp(base[0] * 1.5 + 24), clamp(base[1] * 1.5 + 16), clamp(base[2] * 1.5)],
  ];
}

export class Pix {
  data = new Uint8ClampedArray(PIX * PIX * 4);

  set(x: number, y: number, c: RGB): void {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= PIX || yi >= PIX) return;
    const i = (yi * PIX + xi) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = 255;
  }

  rect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    for (let y = Math.round(y0); y <= Math.round(y1); y++)
      for (let x = Math.round(x0); x <= Math.round(x1); x++) this.set(x, y, c);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const dy = (y - cy) / ry;
      if (dy * dy > 1) continue;
      const hw = rx * Math.sqrt(1 - dy * dy);
      for (let x = Math.ceil(cx - hw); x <= Math.floor(cx + hw); x++) this.set(x, y, c);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    let x = Math.round(x0), y = Math.round(y0);
    const ex = Math.round(x1), ey = Math.round(y1);
    const dx = Math.abs(ex - x), dy = Math.abs(ey - y);
    const sx = x < ex ? 1 : -1, sy = y < ey ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      this.set(x, y, c);
      if (x === ex && y === ey) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
    let x = Math.round(x0), y = Math.round(y0);
    const ex = Math.round(x1), ey = Math.round(y1);
    const dx = Math.abs(ex - x), dy = Math.abs(ey - y);
    const sx = x < ex ? 1 : -1, sy = y < ey ? 1 : -1;
    let err = dx - dy;
    const h = Math.floor(w / 2);
    for (;;) {
      this.rect(x - h, y - h, x - h + w - 1, y - h + w - 1, c);
      if (x === ex && y === ey) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  poly(pts: [number, number][], c: RGB): void {
    const yMin = Math.floor(Math.min(...pts.map((p) => p[1])));
    const yMax = Math.ceil(Math.max(...pts.map((p) => p[1])));
    for (let y = yMin; y <= yMax; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [xa, ya] = pts[i];
        const [xb, yb] = pts[(i + 1) % pts.length];
        if ((ya <= y && yb > y) || (yb <= y && ya > y)) xs.push(xa + ((y - ya) / (yb - ya)) * (xb - xa));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2)
        for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) this.set(x, y, c);
    }
  }

  // ---- shaded helpers (light from top-left) ----

  shadedEllipse(cx: number, cy: number, rx: number, ry: number, R: Ramp): void {
    const yTop = cy - ry, h = ry * 2;
    for (let y = Math.floor(yTop); y <= Math.ceil(cy + ry); y++) {
      const dy = (y - cy) / ry;
      if (dy * dy > 1) continue;
      const hw = rx * Math.sqrt(1 - dy * dy);
      const x0 = Math.ceil(cx - hw), x1 = Math.floor(cx + hw);
      const w = x1 - x0;
      for (let x = x0; x <= x1; x++) {
        const t = (x - x0) / Math.max(1, w);
        let c = R[1];
        if (t < 0.35) c = R[2]; else if (t > 0.72) c = R[0];
        if (y - yTop > h * 0.8) c = R[0];
        this.set(x, y, c);
      }
      // highlight run near the top-left edge
      if (y - yTop < h * 0.45) this.set(x0 + 1, y, R[3]);
    }
  }

  shadedPoly(pts: [number, number][], R: Ramp, folds = 0): void {
    const yMin = Math.floor(Math.min(...pts.map((p) => p[1])));
    const yMax = Math.ceil(Math.max(...pts.map((p) => p[1])));
    for (let y = yMin; y <= yMax; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [xa, ya] = pts[i];
        const [xb, yb] = pts[(i + 1) % pts.length];
        if ((ya <= y && yb > y) || (yb <= y && ya > y)) xs.push(xa + ((y - ya) / (yb - ya)) * (xb - xa));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x0 = Math.ceil(xs[i]), x1 = Math.floor(xs[i + 1]);
        const w = Math.max(1, x1 - x0);
        for (let x = x0; x <= x1; x++) {
          const t = (x - x0) / w;
          let c = R[1];
          if (t < 0.3) c = R[2]; else if (t > 0.74) c = R[0];
          if (folds > 0) {
            const col = (x - x0) % Math.max(3, Math.floor(w / folds));
            if (col === 0) c = R[0]; else if (col === 1) c = R[2];
          }
          this.set(x, y, c);
        }
      }
    }
  }

  tube(x0: number, y0: number, x1: number, y1: number, w: number, R: Ramp): void {
    this.thickLine(x0, y0, x1, y1, w, R[1]);
    // perpendicular (normalised)
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.max(1e-6, Math.hypot(dx, dy));
    const nx = -dy / len, ny = dx / len;
    // orient n toward the upper-left light
    const sgn = nx + ny > 0 ? -1 : 1;
    const off = Math.floor(w / 3);
    this.line(x0 + nx * off * sgn, y0 + ny * off * sgn, x1 + nx * off * sgn, y1 + ny * off * sgn, R[2]);
    this.line(x0 - nx * off * sgn, y0 - ny * off * sgn, x1 - nx * off * sgn, y1 - ny * off * sgn, R[0]);
  }

  // Dither a rect region: every other pixel in alternating rows becomes c.
  dither(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    for (let y = Math.round(y0); y <= Math.round(y1); y++)
      for (let x = Math.round(x0) + ((y - Math.round(y0)) % 2); x <= Math.round(x1); x += 2) this.set(x, y, c);
  }

  private opaque(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < PIX && y < PIX && this.data[(y * PIX + x) * 4 + 3] >= 128;
  }

  outline(color: RGB = [12, 9, 10]): void {
    const d = this.data;
    const lum = (x: number, y: number) => {
      const i = (y * PIX + x) * 4;
      return d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    };
    const mark = new Uint8Array(PIX * PIX); // 1 silhouette, 2 material edge
    for (let y = 0; y < PIX; y++) {
      for (let x = 0; x < PIX; x++) {
        if (!this.opaque(x, y)) continue;
        if (!this.opaque(x - 1, y) || !this.opaque(x + 1, y) || !this.opaque(x, y - 1) || !this.opaque(x, y + 1)) {
          mark[y * PIX + x] = 1;
          continue;
        }
        const l = lum(x, y);
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
          if (this.opaque(x + dx, y + dy) && lum(x + dx, y + dy) - l > 55) { mark[y * PIX + x] = 2; break; }
        }
      }
    }
    for (let y = 0; y < PIX; y++) {
      for (let x = 0; x < PIX; x++) {
        const m = mark[y * PIX + x];
        if (!m) continue;
        const i = (y * PIX + x) * 4;
        if (m === 1) { d[i] = color[0]; d[i + 1] = color[1]; d[i + 2] = color[2]; }
        else { d[i] *= 0.55; d[i + 1] *= 0.55; d[i + 2] = clamp(d[i + 2] * 0.55 + 10); }
      }
    }
  }

  toTex(): SpriteTex {
    return { w: PIX, h: PIX, data: new Uint8Array(this.data) };
  }
}

// ---------------------------------------------------------------------------
// The cordon guard — 5 heads tall on a 128 grid, feet on y 120.
export function guardPix(): SpriteTex {
  const p = new Pix();
  const wood = ramp([92, 64, 36]);
  const steel = ramp([150, 156, 170]);
  const hose = ramp([40, 44, 50]);
  const boot = ramp([52, 40, 30]);
  const mail = ramp([96, 100, 108]);
  const tabard = ramp([78, 70, 54]);
  const cross = ramp([128, 40, 36]);
  const leather = ramp([64, 44, 28]);
  const brass = ramp([170, 140, 70]);
  const skin = ramp([172, 134, 98]);
  const helm = ramp([120, 124, 132]);
  const sk = skin[1], skS = skin[0], skL = skin[2];

  // Halberd shaft behind everything.
  p.tube(92, 0, 92, 120, 3, wood);
  p.poly([[86, 26], [86, 8], [92, 6], [100, 12], [98, 22], [92, 26]], steel[1]);
  p.line(87, 24, 87, 10, steel[3]);
  p.rect(91, 0, 93, 6, steel[1]);
  p.set(92, 1, steel[3]);

  // Legs — hose thighs and shins, knee joints, high boots.
  p.tube(56, 70, 54, 95, 9, hose);
  p.tube(72, 70, 74, 95, 9, hose);
  p.tube(54, 95, 53, 115, 8, hose);
  p.tube(74, 95, 75, 115, 8, hose);
  p.rect(53, 94, 56, 96, hose[0]);
  p.rect(73, 94, 76, 96, hose[0]);
  for (const ax of [53, 75]) {
    p.rect(ax - 4, 100, ax + 4, 116, boot[1]);
    p.rect(ax - 5, 99, ax + 5, 101, boot[2]); // turned cuff
    p.ellipse(ax, 117, 7, 4, boot[1]);
    p.ellipse(ax - 2, 116, 4, 3, boot[2]);
  }

  // Mail torso, sleeves and the gripping right arm — checker dither weave.
  p.poly([[44, 34], [84, 34], [86, 72], [42, 72]], mail[1]);
  p.dither(43, 35, 85, 71, mail[0]);
  p.tube(46, 36, 40, 60, 9, mail);
  p.tube(40, 60, 38, 82, 8, mail);
  p.tube(82, 36, 84, 58, 9, mail);
  p.tube(84, 58, 90, 40, 8, mail);
  p.dither(36, 40, 92, 80, mail[0]);

  // Tabard over the mail — open sides, folds, the red cross of the cordon.
  p.shadedPoly([[50, 34], [78, 34], [80, 98], [48, 98]], tabard, 4);
  p.rect(62, 40, 66, 90, cross[1]);
  p.rect(54, 50, 74, 54, cross[1]);
  p.line(62, 40, 62, 90, cross[2]);
  p.line(54, 50, 74, 50, cross[2]);

  // Belt, buckle, pouch.
  p.rect(48, 66, 80, 70, leather[1]);
  p.line(48, 66, 80, 66, leather[2]);
  p.rect(61, 65, 67, 71, brass[1]);
  p.set(62, 66, brass[3]);
  p.rect(72, 70, 79, 78, leather[0]);
  p.line(72, 72, 79, 72, leather[2]);

  // Hands — right fist grips the shaft, left hangs open.
  p.ellipse(38, 84, 4, 5, sk);
  p.ellipse(91, 40, 4, 4, sk);
  p.rect(36, 81, 41, 82, skS);
  p.rect(88, 37, 94, 38, skS);

  // Mail coif over the skull; the face shows through its opening.
  p.shadedEllipse(64, 22, 11, 12, mail);
  p.dither(53, 12, 75, 33, mail[0]);
  p.ellipse(64, 24, 7, 9, sk);
  for (let y = 16; y <= 32; y++) {
    const dy = (y - 24) / 9;
    const hw = 7 * Math.sqrt(Math.max(0, 1 - dy * dy));
    const x0 = Math.ceil(64 - hw), x1 = Math.floor(64 + hw);
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / Math.max(1, x1 - x0);
      if (t < 0.33) p.set(x, y, skL); else if (t > 0.75) p.set(x, y, skS);
    }
  }

  // Face — hand-placed pixels.
  p.rect(58, 19, 70, 20, skS); // brow shadow row
  // eyes: two rows — whites flanking a brown iris over a dark pupil
  for (const ex of [58, 66]) {
    p.set(ex + 1, 22, [200, 190, 170]); p.set(ex + 3, 22, [200, 190, 170]);
    p.set(ex + 2, 22, [70, 46, 30]);
    p.set(ex + 2, 23, [10, 8, 8]);
    p.set(ex + 1, 23, [70, 46, 30]); p.set(ex + 3, 23, [70, 46, 30]);
    p.line(ex, 21, ex + 4, 21, skS); // upper lid
    p.line(ex, 20, ex + 4, 20, [40, 30, 22]); // brow
    p.set(ex + 4, 21, [40, 30, 22]); // brow angles down to the nose
  }
  p.set(61, 22, [200, 190, 170]); p.set(67, 22, [200, 190, 170]);
  // nose
  p.line(64, 21, 64, 27, skL);
  p.set(62, 28, skS); p.set(66, 28, skS); // nostrils
  p.rect(63, 29, 65, 29, skS);
  p.line(65, 21, 65, 27, skS); // side shadow
  // mouth
  for (let x = 61; x <= 67; x++) p.set(x, 31, [94, 52, 44]);
  for (let x = 62; x <= 66; x++) p.set(x, 32, skL);
  p.set(60, 31, skS); p.set(68, 31, skS);
  p.set(63, 34, skL); // chin
  p.rect(60, 35, 68, 35, skS); // jaw shadow
  p.dither(58, 30, 70, 36, skS); // stubble

  // Kettle helm — broad brim over a dome.
  p.shadedEllipse(64, 13, 16, 4, helm);
  for (let x = 48; x <= 80; x += 4) p.set(x, 15, helm[3]); // rivet row
  p.shadedEllipse(64, 8, 10, 8, helm);
  p.rect(56, 3, 60, 4, helm[3]);

  p.outline();
  return p.toTex();
}

// ---------------------------------------------------------------------------
// figurePix — every human figure authored on the 128 grid. Five heads tall,
// feet on y=120, centred x=64. Light top-left. All data comes from the shared
// character sheet in figures.ts.

import type {
  Outfit, Stance, PropKind, HeadKind, HairStyle, RGB as FRGB,
} from "./figures";

type F = Pix;

// Two-pixel anti-aliased-free "soft" tone: pick ramp index helpers.
function handPix(p: F, x: number, y: number, sk: Ramp, side: -1 | 1, grip = false): void {
  p.ellipse(x, y, 2.5, 3, sk[1]);
  p.set(x - side * 1.5, y + 1, sk[2]); // thumb toward the body
  p.rect(x - 2, y - 2, x + 1, y - 1, sk[0]); // knuckle shadow row
  p.set(x, y - 3, sk[0]); // wrist shadow
  if (grip) p.line(x - 2, y, x + 2, y + 1, sk[0]);
}

function hairBackPix(p: F, fx: number, headY: number, sY: number, style: HairStyle | undefined, col: FRGB | undefined): void {
  if (!style || !col) return;
  const h = ramp(col);
  if (style === "bald") {
    // fringe tufts at the skull sides only
    p.ellipse(fx - 8, headY + 1, 2.5, 4, h[1]);
    p.ellipse(fx + 8, headY + 1, 2.5, 4, h[1]);
    return;
  }
  p.ellipse(fx, headY - 7, 10, 7, h[1]); // cap over the skull top
  if (style === "shoulder") {
    p.rect(fx - 11, headY - 2, fx - 6, sY, h[1]);
    p.rect(fx + 6, headY - 2, fx + 11, sY, h[1]);
    p.line(fx - 10, headY, fx - 10, sY - 2, h[0]);
    p.line(fx + 10, headY, fx + 10, sY - 2, h[0]);
  } else if (style === "bun") {
    p.ellipse(fx - 2, headY - 12, 4, 4, h[1]);
    p.set(fx - 3, headY - 13, h[2]);
  }
}

function hairFrontPix(p: F, fx: number, headY: number, style: HairStyle | undefined, col: FRGB | undefined): void {
  if (!style || !col || style === "bald") return;
  const h = ramp(col);
  p.rect(fx - 7, headY - 6, fx + 7, headY - 4, h[1]); // fringe over the brow
  p.set(fx - 4, headY - 9, h[3]); p.set(fx - 3, headY - 10, h[3]); p.set(fx - 5, headY - 8, h[3]); // highlight run
}

// The face — hand-placed pixels on a 18×22 head. Eyes at headY+2..+3.
function facePix(
  p: F, fx: number, headY: number, skin: FRGB,
  opts: { beard?: boolean; hair?: FRGB; age?: "young" | "mid" | "old"; gaunt?: boolean }
): void {
  const sk = ramp(skin);
  const b = sk[1], sh = sk[0], lt = sk[2], hi = sk[3];
  // Skull and the narrower jaw — an egg, not a circle.
  p.ellipse(fx, headY, 9, 11, b);
  p.ellipse(fx, headY + 5, 7.5, 6, b);
  for (let y = Math.floor(headY - 11); y <= headY + 11; y++) {
    // light down the left of the face, shadow on the right
    p.set(fx - 8, y, lt);
    if (y > headY - 4) p.set(fx + 8, y, sh);
  }
  p.set(fx - 5, headY + 2, hi); // cheekbone light
  if (opts.gaunt || opts.age === "old") {
    p.rect(fx - 6, headY + 6, fx - 5, headY + 9, sh);
    p.rect(fx + 5, headY + 6, fx + 6, headY + 9, sh);
  }
  // Brow ridge and the forehead light.
  p.rect(fx - 6, headY, fx + 6, headY + 1, sh);
  p.set(fx - 3, headY - 5, hi);
  // Eyes — two rows: whites flanking the iris over the dark pupil.
  const hairL = opts.hair ? (opts.hair[0] + opts.hair[1] + opts.hair[2]) / 3 : 60;
  const iris: FRGB = hairL < 60 ? [70, 46, 30] : hairL > 95 ? [92, 98, 104] : [96, 78, 40];
  for (const ex of [fx - 4, fx + 4]) {
    p.set(ex - 1, headY + 2, [200, 190, 170]);
    p.set(ex, headY + 2, iris);
    p.set(ex + 1, headY + 2, [200, 190, 170]);
    p.set(ex - 1, headY + 3, iris);
    p.set(ex, headY + 3, [10, 8, 8]);
    p.set(ex + 1, headY + 3, iris);
    p.line(ex - 2, headY + 1, ex + 2, headY + 1, sh); // upper lid
    p.set(ex - 2, headY + 4, lt); // lower lid light
    // Brows — a 1px stroke angled down toward the nose.
    const bc: FRGB = opts.hair ? [opts.hair[0] * 0.8, opts.hair[1] * 0.8, opts.hair[2] * 0.8] as FRGB : sh;
    p.line(ex - 3 < fx ? ex - 3 : ex + 3, headY - 1, ex - 1 < fx ? ex - 1 : ex + 1, headY, bc);
    p.set(ex + (ex < fx ? -3 : 3), headY + 1, sh); // socket shadow at the inner corner
  }
  // Nose — lit bridge, nostrils, shadow beneath and on the right.
  p.line(fx, headY + 1, fx, headY + 7, lt);
  p.set(fx + 1, headY + 1, sh); // side shadow
  p.line(fx + 1, headY + 2, fx + 1, headY + 7, sh);
  p.set(fx - 2, headY + 8, sh); p.set(fx + 2, headY + 8, sh); // nostrils
  p.rect(fx - 1, headY + 9, fx + 1, headY + 9, sh);
  // Mouth — upper lip in a warm shade of the skin, lit lower lip, shadowed
  // corners. A fixed dark lip reads as a goatee on clean-shaven faces.
  const lip: FRGB = [b[0] * 0.62, b[1] * 0.46, b[2] * 0.44];
  for (let x = fx - 2; x <= fx + 2; x++) p.set(x, headY + 10, lip);
  for (let x = fx - 2; x <= fx + 2; x++) p.set(x, headY + 11, lt);
  p.set(fx - 3, headY + 10, sh); p.set(fx + 3, headY + 10, sh);
  p.set(fx - 1, headY + 12, lt); // chin light
  // Jaw shadow only where there's stubble or hollow to justify it.
  if (opts.beard || opts.gaunt) p.rect(fx - 3, headY + 12, fx + 3, headY + 12, sh);
  // Ears at the skull sides.
  for (const sd of [-1, 1] as const) {
    p.ellipse(fx + sd * 9, headY + 1, 1.5, 2.5, [b[0] * 0.9, b[1] * 0.9, b[2] * 0.9]);
    p.set(fx + sd * 9, headY + 1, sh);
  }
  // Age lines.
  const age = opts.age ?? "mid";
  if (age !== "young") {
    p.line(fx - 2, headY + 8, fx - 4, headY + 12, sh);
    p.line(fx + 2, headY + 8, fx + 4, headY + 12, sh);
    if (age === "old") {
      p.line(fx - 4, headY - 4, fx + 4, headY - 4, sh); // forehead crease
      // Crow's feet — below the eye line, outside the lids, so they don't
      // join the lid into a spectacle rim.
      p.set(fx - 8, headY + 5, sh); p.set(fx - 7, headY + 6, sh);
      p.set(fx + 8, headY + 5, sh); p.set(fx + 7, headY + 6, sh);
    }
  }
  // Beard — hair-coloured mass under the mouth, then the lips back on top.
  if (opts.beard) {
    const hc = opts.hair ?? [b[0] * 0.55, b[1] * 0.52, b[2] * 0.5];
    const hr = ramp(hc as FRGB);
    p.ellipse(fx, headY + 9, 4, 3, hr[0]);
    for (let x = fx - 3; x <= fx + 3; x++) p.set(x, headY + 9, hr[0]); // moustache
    for (let x = fx - 3; x <= fx + 3; x++) p.set(x, headY + 10, [94, 52, 44]);
    for (let x = fx - 2; x <= fx + 2; x++) p.set(x, headY + 11, lt);
  }
}

function headgearPix(p: F, kind: HeadKind, fx: number, headY: number, sY: number, color: FRGB | undefined, skin: FRGB): void {
  const c: FRGB = color ?? [60, 50, 40];
  const R = ramp(c);
  switch (kind) {
    case "none": break;
    case "hood": {
      p.poly([[fx - 13, headY + 5], [fx - 12, headY - 7], [fx, headY - 16], [fx + 12, headY - 7], [fx + 13, headY + 5]], R[1]);
      p.poly([[fx - 14, headY + 3], [fx + 14, headY + 3], [fx + 16, sY + 12], [fx - 16, sY + 12]], R[0]);
      p.ellipse(fx, headY + 2, 7, 8, [skin[0] * 0.75, skin[1] * 0.75, skin[2] * 0.75]);
      p.set(fx - 3, headY + 2, [skin[0] * 0.45, skin[1] * 0.45, skin[2] * 0.45]);
      p.set(fx + 3, headY + 2, [skin[0] * 0.45, skin[1] * 0.45, skin[2] * 0.45]);
      break;
    }
    case "deepHood": {
      p.poly([[fx - 14, headY + 8], [fx - 13, headY - 8], [fx, headY - 18], [fx + 13, headY - 8], [fx + 14, headY + 8]], R[1]);
      p.poly([[fx - 15, headY + 5], [fx + 15, headY + 5], [fx + 17, sY + 14], [fx - 17, sY + 14]], R[0]);
      p.ellipse(fx, headY + 2, 8, 9, [skin[0] * 0.25, skin[1] * 0.25, skin[2] * 0.25]);
      p.set(fx - 3, headY + 1, [skin[0] * 0.55, skin[1] * 0.55, skin[2] * 0.55]);
      p.set(fx + 3, headY + 1, [skin[0] * 0.55, skin[1] * 0.55, skin[2] * 0.55]);
      break;
    }
    case "cap":
      p.ellipse(fx, headY - 9, 9, 4.5, R[1]);
      p.ellipse(fx, headY - 6, 9.5, 2, R[0]);
      break;
    case "flatcap":
      p.ellipse(fx, headY - 10, 8, 4.5, R[2]);
      p.ellipse(fx, headY - 7, 13, 3, R[1]);
      break;
    case "wimple": {
      // Dark veil behind, white band across the brow, frames down the cheeks.
      p.poly([[fx - 15, sY + 10], [fx - 11, headY - 10], [fx, headY - 15], [fx + 11, headY - 10], [fx + 15, sY + 10]], ramp([40, 38, 48] as FRGB)[1]);
      const w = ramp([212, 206, 190] as FRGB);
      p.rect(fx - 7, headY - 10, fx + 7, headY - 6, w[1]);
      p.rect(fx - 7, headY - 6, fx - 5, headY + 8, w[1]);
      p.rect(fx + 5, headY - 6, fx + 7, headY + 8, w[1]);
      p.rect(fx - 7, headY + 8, fx + 7, headY + 10, w[0]);
      break;
    }
    case "kettlehelm": {
      // Mail coif showing the face through its opening.
      p.rect(fx - 11, headY - 4, fx - 7, sY + 10, MAIL_R[1]);
      p.rect(fx + 7, headY - 4, fx + 11, sY + 10, MAIL_R[1]);
      p.rect(fx - 11, headY + 10, fx + 11, sY + 10, MAIL_R[1]);
      p.dither(fx - 11, headY + 10, fx + 11, sY + 10, MAIL_R[0]);
      const h = ramp(color ?? [120, 124, 132] as FRGB);
      p.shadedEllipse(fx, headY - 7, 16, 4, h);
      for (let x = fx - 15; x <= fx + 15; x += 4) p.set(x, headY - 5, h[3]); // rivets
      p.shadedEllipse(fx, headY - 12, 10, 7, h);
      p.rect(fx - 8, headY - 17, fx - 4, headY - 16, h[3]);
      break;
    }
    case "strawhat": {
      const st = ramp(color ?? [170, 140, 70] as FRGB);
      p.ellipse(fx, headY - 7, 19, 3, st[1]);
      p.ellipse(fx, headY - 11, 8, 4.5, st[0]);
      p.rect(fx - 8, headY - 9, fx + 8, headY - 8, st[0]);
      break;
    }
    case "kerchief":
      p.ellipse(fx, headY - 8, 10, 4, R[1]);
      p.rect(fx - 9, headY - 8, fx - 7, headY - 4, R[0]); // cloth edge over the ears
      p.rect(fx + 7, headY - 8, fx + 9, headY - 4, R[0]);
      p.set(fx + 10, headY - 8, R[1]); p.set(fx + 11, headY - 5, R[0]); // knot + tail
      break;
    case "coif": {
      const ln = ramp(color ?? [214, 206, 190] as FRGB);
      p.ellipse(fx, headY - 3, 9.5, 10, ln[1]);
      p.rect(fx - 5, headY - 5, fx + 5, headY + 8, skin); // face opening
      p.line(fx - 4, headY + 9, fx + 4, headY + 9, ln[0]); // chin tie
      break;
    }
    case "bakercap": {
      const cl = ramp(color ?? [222, 216, 200] as FRGB);
      p.ellipse(fx, headY - 9, 11, 5, cl[1]);
      p.ellipse(fx, headY - 12, 7, 4, cl[2]);
      break;
    }
    case "widowveil": {
      // Black veil over the crown falling past the shoulders, pale-edged.
      p.ellipse(fx, headY - 6, 12, 8, [34, 30, 38]);
      p.rect(fx - 11, headY - 2, fx - 8, sY + 8, [30, 26, 34]);
      p.rect(fx + 8, headY - 2, fx + 11, sY + 8, [30, 26, 34]);
      p.rect(fx - 9, headY - 8, fx + 9, headY - 6, [30, 26, 34]); // over the crown
      p.line(fx - 11, headY - 2, fx - 11, sY + 8, [70, 66, 74]);
      p.line(fx + 11, headY - 2, fx + 11, sY + 8, [70, 66, 74]);
      break;
    }
  }
}
const MAIL_R: Ramp = ramp([96, 100, 108]);

// Hand props, pixel-authored at the solved hand points.
function propPix(p: F, kind: PropKind, hx: number, hy: number): void {
  const wood = ramp([92, 64, 36]);
  switch (kind) {
    case "staff":
      break; // shaft drawn behind the body
    case "lantern": {
      p.line(hx, hy, hx, hy + 3, ramp([40, 38, 44])[0]);
      p.rect(hx - 4, hy + 3, hx + 4, hy + 13, ramp([40, 38, 44])[1]); // cage
      p.rect(hx - 2, hy + 6, hx + 2, hy + 10, [240, 170, 60]); // amber glass
      p.set(hx - 1, hy + 7, [255, 220, 140]);
      p.line(hx - 4, hy + 3, hx + 4, hy + 3, ramp([40, 38, 44])[2]);
      break;
    }
    case "basket": {
      const wk = ramp([140, 104, 60]);
      p.ellipse(hx, hy + 3, 7, 5, wk[1]);
      p.dither(hx - 6, hy - 1, hx + 6, hy + 7, wk[0]);
      p.ellipse(hx, hy - 1, 7, 2, wk[2]); // rim
      break;
    }
    case "halberd": break; // shaft behind the body
    case "ledger": {
      const bk = ramp([52, 38, 30]);
      p.rect(hx - 5, hy - 5, hx + 5, hy + 5, bk[1]);
      p.rect(hx - 5, hy - 5, hx - 3, hy + 5, bk[0]); // spine
      p.set(hx + 2, hy - 2, bk[2]);
      break;
    }
    case "tray": {
      const wd = ramp([120, 90, 55]);
      p.rect(64 - 15, hy - 1, 64 + 15, hy + 3, wd[1]);
      p.line(64 - 15, hy - 1, 64 + 15, hy - 1, wd[2]);
      const lf = ramp([186, 136, 70]);
      for (const lx of [55, 61, 67, 73]) {
        p.ellipse(lx, hy - 3, 3, 2.5, lf[1]);
        p.set(lx - 1, hy - 4, lf[3]);
      }
      break;
    }
    case "bundle": {
      const bd = ramp([150, 138, 116]);
      p.ellipse(hx - 2, hy + 3, 7, 6, bd[1]);
      p.ellipse(hx - 3, hy + 2, 4, 3, bd[2]);
      p.set(hx - 2, hy - 3, bd[0]); // the tie
      break;
    }
    case "bowl": {
      const bw = ramp([118, 96, 64]);
      p.ellipse(hx, hy + 1, 5, 3.5, bw[1]);
      p.ellipse(hx, hy, 4, 1.5, bw[0]); // hollow
      break;
    }
    case "spade": case "spadeShoulder": break; // behind the body
    case "peel": {
      p.thickLine(hx, hy, hx + 6, hy - 34, 3, wood[1]);
      p.ellipse(hx + 8, hy - 42, 7, 8, wood[1]);
      p.ellipse(hx + 7, hy - 43, 4, 5, wood[2]);
      break;
    }
    case "rake": break; // shaft behind
    case "tankard": {
      const tn = ramp([140, 134, 122]);
      p.rect(hx - 3, hy - 2, hx + 3, hy + 5, tn[1]);
      p.line(hx - 3, hy - 2, hx - 3, hy + 5, tn[2]);
      p.rect(hx + 3, hy, hx + 5, hy + 4, tn[0]); // handle
      break;
    }
    case "vial": {
      const gl = ramp([120, 130, 118]);
      p.rect(hx - 2, hy - 2, hx + 2, hy + 5, gl[1]);
      p.rect(hx - 1, hy + 1, hx + 1, hy + 4, [60, 200, 90]);
      p.set(hx - 1, hy + 2, [140, 255, 160]);
      p.set(hx, hy - 3, gl[0]); // cork
      break;
    }
    case "clothbolt": {
      const ln = ramp([196, 184, 152]);
      p.rect(hx - 4, hy - 2, hx + 3, hy + 12, ln[1]);
      p.rect(hx - 8, hy + 2, hx - 4, hy + 10, ln[0]);
      p.line(hx - 4, hy - 2, hx + 3, hy - 2, ln[2]);
      break;
    }
    case "rue": {
      const rg = ramp([100, 126, 78]);
      p.line(hx, hy, hx + 1, hy - 10, rg[0]);
      for (const [ox, oy] of [[-2, -8], [2, -10], [-3, -13], [3, -15], [0, -17]] as const)
        p.ellipse(hx + ox, hy + oy, 1.5, 2, rg[1]);
      p.set(hx + 1, hy - 18, rg[2]);
      break;
    }
    case "satchel": {
      const lt = ramp([96, 66, 40]);
      p.line(hx, hy - 30, hx + 4, hy + 2, lt[0]); // strap over the shoulder
      p.rect(hx - 5, hy + 8, hx + 5, hy + 18, lt[1]);
      p.line(hx - 5, hy + 10, hx + 5, hy + 10, lt[0]); // flap
      p.set(hx, hy + 12, lt[2]);
      break;
    }
    case "whip": {
      const wh = ramp([88, 60, 38]);
      p.line(hx, hy, hx + 6, hy + 16, wh[0]);
      p.line(hx + 6, hy + 16, hx + 2, 116, wh[0]);
      p.line(hx + 2, 116, hx + 10, 119, wh[0]); // the trailing coil
      break;
    }
  }
}

export function figurePix(o: Outfit, stance: Stance, phase: number): SpriteTex {
  const p = new Pix();
  const hunch = Math.max(o.hunch ?? 0, stance === "shamble" ? 0.5 : 0);
  const st = Math.sin(phase * Math.PI * 2);
  const bob = stance === "walk" ? -Math.abs(Math.cos(phase * Math.PI * 2))
    : stance === "stand" ? Math.round(Math.sin(phase * Math.PI * 2) * 0.5)
    : 0;
  const headY = Math.round(19 + hunch * 10 + bob * 0.5);
  const sY = Math.round(34 + hunch * 5 + bob * 0.5);
  const hipY = Math.round(70 + bob * 0.4);
  const kneeY = 95;
  const hemY = Math.round(o.over.hem * 2 + bob);
  const fx = 64 + (stance === "shamble" ? 2 : 0);
  const swing = stance === "walk" ? Math.round(st * 7) : 0;

  const sk = ramp(o.skin);
  const un = ramp(o.under);
  const ov = ramp(o.over.color);
  const hs = ramp(o.hose);
  let bootBase: FRGB = o.boots;
  { // boots a band lighter than the hose
    const hl = o.hose[0] * 0.3 + o.hose[1] * 0.59 + o.hose[2] * 0.11;
    const bl = o.boots[0] * 0.3 + o.boots[1] * 0.59 + o.boots[2] * 0.11;
    if (bl < hl + 25) bootBase = [Math.min(255, o.boots[0] * 1.35), Math.min(255, o.boots[1] * 1.35), Math.min(255, o.boots[2] * 1.35)] as FRGB;
  }
  const bt = ramp(bootBase);

  // Arm pose — solved first so back props and sleeves agree on the hands.
  let elbL: [number, number], elbR: [number, number], handL: [number, number], hndR: [number, number];
  switch (stance === "shamble" ? "shamble" : o.arms) {
    case "fold": elbL = [44, 58]; handL = [58, 72]; elbR = [84, 58]; hndR = [70, 72]; break;
    case "raiseR": elbL = [44, 58]; handL = [38 - swing, 82]; elbR = [84, 58]; hndR = [90, 40]; break;
    case "hug": elbL = [44, 58]; handL = [70, 62]; elbR = [84, 58]; hndR = [58, 64]; break;
    case "staffR": elbL = [44, 58]; handL = [38 - swing, 82]; elbR = [84, 58]; hndR = [92, 74]; break;
    case "trayBoth": elbL = [44, 58]; handL = [54, 70]; elbR = [84, 58]; hndR = [74, 70]; break;
    case "carryL": elbL = [44, 58]; handL = [46, 80]; elbR = [84, 58]; hndR = [90 + swing, 82]; break;
    case "holdOutR": elbL = [44, 58]; handL = [38 - swing, 82]; elbR = [84, 58]; hndR = [94, 64]; break;
    case "shamble": elbL = [46, 58]; handL = [56, 84]; elbR = [82, 58]; hndR = [72, 84]; break;
    default: elbL = [44, 58]; handL = [38 - swing, 82]; elbR = [84, 58]; hndR = [90 + swing, 82]; break;
  }

  // Back props — long shafts behind the body.
  for (const pr of o.props ?? []) {
    const hx = pr.hand === "L" ? handL[0] : hndR[0];
    const hy = pr.hand === "L" ? handL[1] : hndR[1];
    if (pr.kind === "staff") {
      p.thickLine(hx, 4, hx, 120, 3, ramp([92, 64, 36])[1]);
      p.ellipse(hx, 4, 3, 3, ramp([92, 64, 36])[2]); // knob
    } else if (pr.kind === "halberd") {
      const sx = hx + 2;
      p.tube(sx, 0, sx, 120, 3, ramp([92, 64, 36]));
      p.poly([[sx - 6, 26], [sx - 6, 8], [sx, 6], [sx + 8, 12], [sx + 6, 22], [sx, 26]], ramp([150, 156, 170])[1]);
      p.line(sx - 5, 24, sx - 5, 10, ramp([150, 156, 170])[3]);
      p.rect(sx - 1, 0, sx + 1, 6, ramp([150, 156, 170])[1]);
    } else if (pr.kind === "spadeShoulder") {
      p.thickLine(hx, hy, hx + 6, 14, 3, ramp([92, 64, 36])[1]);
      const st2 = ramp([104, 108, 114]);
      p.rect(hx + 2, 6, hx + 10, 16, st2[1]);
      p.line(hx + 3, 8, hx + 3, 14, st2[2]);
    } else if (pr.kind === "spade") {
      p.thickLine(hx, hy - 30, hx, 118, 3, ramp([92, 64, 36])[1]);
      const st2 = ramp([104, 108, 114]);
      p.rect(hx - 4, 110, hx + 4, 122, st2[1]);
    } else if (pr.kind === "rake") {
      p.thickLine(hx, hy - 36, hx - 2, 118, 3, ramp([92, 64, 36])[1]);
      p.rect(hx - 8, hy - 40, hx + 6, hy - 36, ramp([96, 70, 42])[1]); // head
      for (let tx = hx - 7; tx <= hx + 5; tx += 3) p.line(tx, hy - 36, tx, hy - 32, ramp([96, 70, 42])[0]); // tines
    }
  }

  // Back hair, then legs — hose tubes with real knees.
  hairBackPix(p, fx, headY, sY, o.hair, o.hairColor);
  const kneeL: [number, number] = [56 + Math.round(Math.max(0, st) * 6), kneeY];
  const kneeR: [number, number] = [72 - Math.round(Math.max(0, -st) * 6), stance === "shamble" ? 100 : kneeY];
  const ankL: [number, number] = stance === "walk" ? [55 + Math.round(Math.max(0, st) * 9), 118 - Math.round(Math.max(0, st) * 3)] : [55, 118];
  const ankR: [number, number] = stance === "shamble" ? [80, 116]
    : stance === "walk" ? [73 - Math.round(Math.max(0, -st) * 9), 118 - Math.round(Math.max(0, -st) * 3)]
    : [73, 118];
  p.tube(56, hipY, kneeL[0], kneeL[1], 9, hs);
  p.tube(72, hipY, kneeR[0], kneeR[1], 9, hs);
  p.tube(kneeL[0], kneeL[1], ankL[0], ankL[1], 8, hs);
  p.tube(kneeR[0], kneeR[1], ankR[0], ankR[1], 8, hs);
  p.rect(kneeL[0] - 1, kneeL[1] - 1, kneeL[0] + 1, kneeL[1] + 1, hs[0]);
  p.rect(kneeR[0] - 1, kneeR[1] - 1, kneeR[0] + 1, kneeR[1] + 1, hs[0]);

  // Boots — a shaft, a turned cuff for the high ones, or bare feet.
  for (const [ax, ay] of [ankL, ankR]) {
    if (o.barefoot) {
      p.ellipse(ax, ay + 1, 6, 3, sk[1]);
      p.set(ax - 3, ay + 2, sk[0]); p.set(ax - 1, ay + 2, sk[0]); // toes
    } else {
      p.rect(ax - 4, o.bootHigh ? 98 : 108, ax + 4, ay, bt[1]);
      if (o.bootHigh) p.rect(ax - 5, 97, ax + 5, 100, bt[2]); // turned cuff
      p.ellipse(ax, ay + 1, 7, 4, bt[1]);
      p.ellipse(ax - 2, ay, 4, 3, bt[2]);
    }
  }

  // The chemise under everything — sloped shoulders, shows at throat/cuffs.
  p.poly([[46, sY + 4], [52, sY], [76, sY], [82, sY + 4], [82, hipY], [46, hipY]], un[1]);

  // The over-garment — each cut its own silhouette.
  const ovr = o.over;
  const shoulderPts = (x0: number, x1: number): [number, number][] =>
    [[x0, sY + 4], [56, sY], [72, sY], [x1, sY + 4]];
  switch (ovr.kind) {
    case "tunic":
      p.shadedPoly([...shoulderPts(44, 84), [84, hemY], [76, hemY - 4], [52, hemY - 4], [44, hemY]], ov, 4);
      break;
    case "robe":
      p.shadedPoly([...shoulderPts(44, 84), [92, hemY], [36, hemY]], ov, 4);
      break;
    case "gown":
      p.shadedPoly([...shoulderPts(44, 84), [78, 62], [94, hemY], [34, hemY], [50, 62]], ov, 4);
      break;
    case "cloak":
      if (ovr.ragged) {
        p.shadedPoly([[42, sY + 3], [54, sY - 1], [74, sY - 1], [86, sY + 3], [96, hemY], [88, hemY - 4], [78, hemY + 1], [66, hemY - 5], [54, hemY + 1], [44, hemY - 4], [36, hemY], [32, hemY - 2]], ov, 4);
      } else {
        p.shadedPoly([[42, sY + 3], [54, sY - 1], [74, sY - 1], [86, sY + 3], [96, hemY], [32, hemY]], ov, 4);
      }
      p.set(fx, sY + 3, ramp([190, 170, 90])[1]); // the clasp
      break;
    case "tabard":
      p.shadedPoly([[48, sY + 4], [56, sY], [72, sY], [80, sY + 4], [80, hemY], [48, hemY]], ov, 3);
      break;
    case "habit":
      p.shadedPoly([...shoulderPts(44, 84), [92, hemY], [36, hemY]], ov, 4);
      p.poly([[58, sY + 8], [70, sY + 8], [71, hemY - 4], [57, hemY - 4]], ov[0]); // scapular
      break;
    case "rags":
      p.shadedPoly([[44, sY + 4], [52, sY], [76, sY], [84, sY + 4], [92, hemY], [84, hemY - 4], [74, hemY + 1], [64, hemY - 5], [54, hemY + 2], [46, hemY - 3], [38, hemY + 1], [34, hemY], [36, hemY - 3]], ov, 4);
      break;
  }
  if (ovr.trim) {
    const tr = ramp(ovr.trim);
    p.line(38, hemY - 2, 90, hemY - 2, tr[1]); // hem band
    p.line(fx - 6, sY + 1, fx + 6, sY + 1, tr[1]); // neckline
  }
  // Collar V in the under colour.
  p.poly([[fx - 4, sY + 1], [fx + 4, sY + 1], [fx, sY + 6]], un[1]);
  if (ovr.patches) {
    p.rect(56, 82, 62, 88, ov[0]);
    p.rect(70, 70, 74, 74, ov[0]);
    p.line(56, 82, 62, 82, ov[2]);
  }
  if (o.insignia) {
    const ig = ramp(o.insignia);
    p.rect(fx - 2, sY + 8, fx + 2, Math.min(hemY - 6, sY + 56), ig[1]);
    p.rect(fx - 10, sY + 16, fx + 10, sY + 20, ig[1]);
    p.line(fx - 2, sY + 8, fx - 2, Math.min(hemY - 6, sY + 56), ig[2]);
    p.line(fx - 10, sY + 16, fx + 10, sY + 16, ig[2]);
  }
  if (o.shawl) {
    const shc = ramp(o.shawl.color);
    p.shadedPoly([[44, sY + 3], [54, sY], [74, sY], [84, sY + 3], [86, o.shawl.hem * 2], [42, o.shawl.hem * 2]], shc, 2);
  }
  if (o.apron) {
    const ap = ramp(o.apron.color);
    p.poly([[54, 62], [74, 62], [78, o.apron.hem * 2], [50, o.apron.hem * 2]], ap[1]);
    if (o.apron.bib) {
      p.rect(56, sY + 4, 72, 62, ap[1]);
      p.line(54, 62, 46, 66, ap[0]); // ties
      p.line(74, 62, 82, 66, ap[0]);
    }
  }
  if (o.cowl) {
    p.ellipse(fx - 12, sY - 1, 6, 5, ov[0]);
    p.ellipse(fx + 12, sY - 1, 6, 5, ov[0]);
    p.ellipse(fx, sY + 3, 9, 4, ov[0]);
  }
  if (o.belt) {
    const bc = ramp(o.belt.color);
    if (o.belt.rope) {
      p.line(48, 62, 80, 62, bc[1]);
      p.line(48, 63, 80, 63, bc[0]);
      p.ellipse(60, 63, 2, 2, bc[2]); // the knot
    } else {
      p.rect(48, 60, 80, 64, bc[1]);
      p.line(48, 60, 80, 60, bc[2]);
      if (o.belt.buckle) {
        p.rect(61, 59, 67, 65, ramp([170, 140, 70])[1]);
        p.set(62, 60, ramp([170, 140, 70])[3]);
      }
      if (o.belt.pouch) {
        p.rect(72, 66, 79, 74, bc[0]);
        p.line(72, 68, 79, 68, bc[2]);
      }
    }
  }

  // Sleeves and hands over the cloth.
  const sleeve = ramp([o.over.color[0] * 0.85, o.over.color[1] * 0.85, o.over.color[2] * 0.85] as FRGB);
  const bare = ramp([o.skin[0] * 0.92, o.skin[1] * 0.92, o.skin[2] * 0.92] as FRGB);
  for (const [shx, elb, hand, side] of [
    [46, elbL, handL, -1],
    [82, elbR, hndR, 1],
  ] as [number, [number, number], [number, number], -1 | 1][]) {
    p.tube(shx, sY + 2, elb[0], elb[1], 9, sleeve);
    p.tube(elb[0], elb[1], hand[0], hand[1], 8, o.rolledSleeves ? bare : sleeve);
    if (!o.rolledSleeves) p.rect(hand[0] - 4, hand[1] - 5, hand[0] + 4, hand[1] - 3, un[1]); // cuff
    const grips = (o.props ?? []).some(
      (pr) => (pr.hand === "L") === (side === -1) && ["staff", "halberd", "spadeShoulder", "spade", "peel", "rake", "whip"].includes(pr.kind)
    );
    handPix(p, hand[0], hand[1], sk, side, grips);
  }

  // Neck, head, face, front hair, headgear.
  p.rect(fx - 3, headY + 10, fx + 3, sY + 1, sk[0]);
  p.rect(fx - 3, headY + 10, fx, sY + 1, sk[2]);
  facePix(p, fx, headY, o.skin, { beard: o.beard, hair: o.hairColor, age: o.age, gaunt: o.gaunt });
  hairFrontPix(p, fx, headY, o.hair, o.hairColor);
  headgearPix(p, o.head.kind, fx, headY, sY, o.head.color, o.skin);

  // Plague marks — dark stipple on throat, arms and the shift.
  if (o.marks) {
    const mc = o.marks;
    p.set(56, 84, mc); p.set(72, 94, mc); p.set(62, 104, mc); p.set(fx - 3, headY + 11, mc);
    p.set(58, 88, mc); p.set(70, 90, mc);
  }

  // Hand props last — they read on the silhouette.
  for (const pr of o.props ?? []) {
    const [hx, hy] = pr.kind === "tray" ? [64, 70] : pr.hand === "L" ? handL : hndR;
    propPix(p, pr.kind, hx, hy);
    if (["bundle", "basket", "bowl", "tankard"].includes(pr.kind)) {
      handPix(p, hx, hy, sk, pr.hand === "L" ? -1 : 1, false);
    }
  }

  p.outline();
  return p.toTex();
}
