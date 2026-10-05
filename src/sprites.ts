import { TEX_SIZE } from "./config";
import type { SpriteTex } from "./types";

// Sprite bitmaps, generated procedurally like the textures. Every sprite is a
// TEX_SIZE x TEX_SIZE RGBA bitmap; alpha < 128 is transparent.

function makeSprite(): SpriteTex {
  return { w: TEX_SIZE, h: TEX_SIZE, data: new Uint8Array(TEX_SIZE * TEX_SIZE * 4) };
}

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function px(s: SpriteTex, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return;
  const i = (y * s.w + x) * 4;
  s.data[i] = r;
  s.data[i + 1] = g;
  s.data[i + 2] = b;
  s.data[i + 3] = a;
}

function rect(s: SpriteTex, x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a = 255): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(s, x, y, r, g, b, a);
}

function ellipse(s: SpriteTex, cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a = 255): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) px(s, x, y, r, g, b, a);
    }
  }
}

function line(s: SpriteTex, x0: number, y0: number, x1: number, y1: number, width: number, r: number, g: number, b: number, a = 255): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    const half = width / 2;
    for (let wy = -Math.ceil(half); wy <= Math.ceil(half); wy++) {
      for (let wx = -Math.ceil(half); wx <= Math.ceil(half); wx++) {
        if (wx * wx + wy * wy <= half * half) px(s, Math.round(x + wx), Math.round(y + wy), r, g, b, a);
      }
    }
  }
}

// A soft outline around the silhouette — opaque pixels that touch
// transparency get darkened. The top rim only darkens a little: a hard cap
// there reads as a black line hovering over every head.
function edge(s: SpriteTex): void {
  const { w, h, data } = s;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;
      const rimTop = y === 0 || data[i - w * 4 + 3] < 128;
      const rimSide =
        x === 0 || data[i - 4 + 3] < 128 ||
        x === w - 1 || data[i + 4 + 3] < 128 ||
        y === h - 1 || data[i + w * 4 + 3] < 128;
      if (!rimTop && !rimSide) continue;
      const lum = data[i] * 0.5 + data[i + 1] * 0.4 + data[i + 2] * 0.1;
      if (lum < 42) continue; // already dark — don't blacken further
      const f = rimSide ? 0.55 : 0.82;
      data[i] *= f;
      data[i + 1] *= f;
      data[i + 2] *= f;
    }
  }
}

// A soft directional light inside the sprite — brighter high and left,
// darker low and right. Cheap volume for flat shapes.
function form(s: SpriteTex): void {
  const { w, h, data } = s;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;
      const f = 0.88 + (1 - y / h) * 0.16 + (x / w - 0.5) * 0.1;
      data[i] = Math.min(255, data[i] * f);
      data[i + 1] = Math.min(255, data[i + 1] * f);
      data[i + 2] = Math.min(255, data[i + 2] * f);
    }
  }
}

// The finishing pass applied to every solid sprite — volume, then outline.
// Flame and glow sprites skip it: dark rims would kill the bloom.
function finish(s: SpriteTex): SpriteTex {
  form(s);
  edge(s);
  return s;
}

// ---------------------------------------------------------------------------
// The rasterizer — art drawn at 4× in logical 64-space, then box-downsampled.
// Smooth shapes land as anti-aliased pixel art; limbs can be posed at any
// angle per frame, which is what makes real walk cycles possible. Pure JS —
// no canvas, deterministic.

const RAS = 4;

class Ras {
  readonly tex: SpriteTex = {
    w: TEX_SIZE * RAS,
    h: TEX_SIZE * RAS,
    data: new Uint8Array(TEX_SIZE * RAS * TEX_SIZE * RAS * 4),
  };
  px(x: number, y: number, r: number, g: number, b: number, a = 255): void {
    rect(this.tex, x * RAS, y * RAS, x * RAS + RAS - 1, y * RAS + RAS - 1, r, g, b, a);
  }
  rect(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a = 255): void {
    rect(this.tex, x0 * RAS, y0 * RAS, x1 * RAS + RAS - 1, y1 * RAS + RAS - 1, r, g, b, a);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a = 255): void {
    ellipse(this.tex, cx * RAS, cy * RAS, rx * RAS, ry * RAS, r, g, b, a);
  }
  line(x0: number, y0: number, x1: number, y1: number, width: number, r: number, g: number, b: number, a = 255): void {
    line(this.tex, x0 * RAS, y0 * RAS, x1 * RAS, y1 * RAS, width * RAS, r, g, b, a);
  }
  // A capsule — a limb segment, rounded at both ends.
  limb(x0: number, y0: number, x1: number, y1: number, width: number, r: number, g: number, b: number): void {
    this.line(x0, y0, x1, y1, width, r, g, b);
  }
  poly(pts: [number, number][], r: number, g: number, b: number, a = 255): void {
    const s = this.tex;
    const P = pts.map(([x, y]) => [x * RAS, y * RAS]);
    const yMin = Math.floor(Math.min(...P.map((p) => p[1])));
    const yMax = Math.ceil(Math.max(...P.map((p) => p[1])));
    for (let y = yMin; y <= yMax; y++) {
      const xs: number[] = [];
      for (let i = 0; i < P.length; i++) {
        const [x1, y1] = P[i];
        const [x2, y2] = P[(i + 1) % P.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      xs.sort((m, n) => m - n);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) px(s, x, y, r, g, b, a);
      }
    }
  }
  // Box-downsample to the real sprite size. Colors are weighted by coverage
  // so partial-coverage edges keep their hue instead of darkening into a
  // fringe; the renderer's <128 alpha cut decides the silhouette.
  down(): SpriteTex {
    const s = this.tex;
    const out = makeSprite();
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        let rs = 0, gs = 0, bs = 0, as = 0, cov = 0;
        for (let dy = 0; dy < RAS; dy++) {
          for (let dx = 0; dx < RAS; dx++) {
            const i = ((y * RAS + dy) * s.w + x * RAS + dx) * 4;
            const w8 = s.data[i + 3] / 255;
            cov += w8;
            as += s.data[i + 3];
            rs += s.data[i] * w8;
            gs += s.data[i + 1] * w8;
            bs += s.data[i + 2] * w8;
          }
        }
        const o = (y * TEX_SIZE + x) * 4;
        if (cov > 0) {
          out.data[o] = rs / cov;
          out.data[o + 1] = gs / cov;
          out.data[o + 2] = bs / cov;
        }
        out.data[o + 3] = as / (RAS * RAS);
      }
    }
    return out;
  }
}

// A shared figure builder — a shaded robe with folds, a face with eyes and
// brow, hands and feet. Every citizen is this body plus distinguishing
// extras drawn on top, so they all read at the same level of detail.
interface PersonOpts {
  robe: [number, number, number];
  skin?: [number, number, number];
  hunch?: number; // 0 upright … 0.7 stooped
  sway?: number; // walk-cycle lean in px
  belt?: [number, number, number] | null;
  barefoot?: boolean;
  ragHem?: boolean; // tattered hem for shamblers and the sick
  armsDown?: boolean; // hanging arms vs the default tucked pose
}

function person(s: SpriteTex, o: PersonOpts): void {
  const [r, g, b] = o.robe;
  const skin = o.skin ?? [172, 134, 98];
  const hunch = o.hunch ?? 0;
  const sway = o.sway ?? 0;
  const headY = 20 + hunch * 5;
  const shoulderY = 29 + hunch * 3;
  // Feet under the hem — dark shoes unless barefoot.
  const foot = o.barefoot ? skin : [30, 26, 22];
  ellipse(s, 28, 60, 3.5, 2, foot[0], foot[1], foot[2]);
  ellipse(s, 36, 60, 3.5, 2, foot[0], foot[1], foot[2]);
  // Robe — a trapezoid with vertical fold shading and a darker hem.
  for (let y = Math.floor(shoulderY); y <= 60; y++) {
    const t = (y - shoulderY) / (60 - shoulderY);
    const w = 6.5 + t * 10.5;
    const x0 = Math.round(32 - w + sway * (1 - t) * 0.5);
    const x1 = Math.round(32 + w + sway * (1 - t) * 0.5);
    for (let x = x0; x <= x1; x++) {
      const fold = Math.sin((x - x0) * 1.35) * 8;
      const lit = (x - x0) / Math.max(1, x1 - x0);
      const shade = 1.02 - lit * 0.24 + fold / 55;
      px(s, x, y, r * shade, g * shade, b * shade);
    }
  }
  if (o.ragHem) {
    const rand = rng(5);
    for (let x = 18; x <= 46; x++) {
      if (rand() < 0.45) {
        px(s, x, 59, r * 0.55, g * 0.55, b * 0.55);
        px(s, x, 60, 0, 0, 0, 0); // notches torn out of the hem
      }
    }
  }
  if (o.belt) rect(s, 26, 44, 38, 46, o.belt[0], o.belt[1], o.belt[2]);
  // Sleeves and hands — tucked unless asked to hang.
  const robeD = [r * 0.82, g * 0.82, b * 0.82];
  if (o.armsDown) {
    line(s, 26 + sway * 0.5, shoulderY + 4, 23 + sway * 0.5, 50, 3, robeD[0], robeD[1], robeD[2]);
    line(s, 38 + sway * 0.5, shoulderY + 4, 41 + sway * 0.5, 50, 3, robeD[0], robeD[1], robeD[2]);
    ellipse(s, 23 + sway * 0.5, 51, 2, 2.5, skin[0], skin[1], skin[2]);
    ellipse(s, 41 + sway * 0.5, 51, 2, 2.5, skin[0], skin[1], skin[2]);
  } else {
    line(s, 26 + sway * 0.5, shoulderY + 4, 28 + sway * 0.5, 44, 3, robeD[0], robeD[1], robeD[2]);
    line(s, 38 + sway * 0.5, shoulderY + 4, 36 + sway * 0.5, 44, 3, robeD[0], robeD[1], robeD[2]);
    ellipse(s, 32 + sway * 0.4, 45, 3, 3, skin[0], skin[1], skin[2]); // clasped hands
  }
  // Neck shadow and head.
  rect(s, 30 + sway * 0.7, headY + 5, 34 + sway * 0.7, headY + 8, skin[0] * 0.55, skin[1] * 0.55, skin[2] * 0.55);
  ellipse(s, 32 + sway * 0.8, headY, 5, 6, skin[0], skin[1], skin[2]);
  // Brow, eyes, nose and mouth — a face, not a blob.
  const fx = 32 + sway * 0.8;
  rect(s, fx - 3, headY - 2, fx + 3, headY - 1, skin[0] * 0.72, skin[1] * 0.72, skin[2] * 0.72);
  px(s, fx - 2, headY, 26, 20, 16);
  px(s, fx + 2, headY, 26, 20, 16);
  px(s, fx, headY + 1, skin[0] * 0.7, skin[1] * 0.7, skin[2] * 0.7);
  rect(s, fx - 1, headY + 3, fx + 1, headY + 3, skin[0] * 0.58, skin[1] * 0.58, skin[2] * 0.58);
}

// A flame built from layered ellipses — outer red, mid orange, core yellow.
// `jit` shifts the shape per animation frame so it flickers.
function flame(s: SpriteTex, cx: number, cy: number, size: number, jit: number): void {
  ellipse(s, cx + jit * 0.5, cy, size * 0.55 + jit * 0.15, size * 0.75 + jit * 0.2, 178, 52, 12, 190);
  ellipse(s, cx - jit * 0.4, cy + size * 0.08, size * 0.36, size * 0.52 - jit * 0.1, 236, 128, 20, 215);
  ellipse(s, cx, cy + size * 0.16, size * 0.18, size * 0.3, 255, 214, 110, 240);
  // Sparks drifting off the top
  px(s, cx + jit * 2, cy - size * 0.85, 255, 190, 80, 200);
  px(s, cx - jit, cy - size * 0.7, 240, 140, 50, 160);
}

// A wall-mounted candle lantern — iron bracket, glass panes glowing amber.
function sconceFrame(frame: number): SpriteTex {
  const s = makeSprite();
  const jit = [0, 10, -8, 5][frame % 4];
  // Bracket arm and hanging hook
  rect(s, 26, 8, 38, 11, 44, 42, 50);
  rect(s, 30, 11, 34, 17, 44, 42, 50);
  // Lantern frame — cap and body
  rect(s, 25, 17, 39, 20, 52, 50, 60);
  rect(s, 24, 20, 40, 46, 34, 32, 40);
  // Glass panes — warm glow with a subtle flicker
  const g = Math.min(255, 186 + jit);
  rect(s, 26, 22, 38, 44, 255, g, 92, 235);
  rect(s, 28, 24, 31, 42, 255, Math.min(255, g + 34), 132, 235);
  // Frame bars over the glass
  rect(s, 32, 22, 33, 44, 30, 28, 36);
  rect(s, 24, 32, 40, 34, 30, 28, 36);
  // Base
  rect(s, 27, 46, 37, 49, 40, 38, 46);
  return s;
}

function barrelSprite(): SpriteTex {
  const s = makeSprite();
  // Body with a slight bulge
  for (let y = 20; y <= 58; y++) {
    const bulge = Math.sin(((y - 20) / 38) * Math.PI) * 4;
    const x0 = Math.round(20 - bulge);
    const x1 = Math.round(44 + bulge);
    for (let x = x0; x <= x1; x++) {
      const stave = Math.floor(x / 6);
      const shade = 86 + ((stave * 37) % 14);
      px(s, x, y, shade, shade * 0.62, shade * 0.38);
    }
  }
  // Stave seams
  for (let x = 22; x <= 44; x += 6) line(s, x, 21, x, 57, 1, 40, 26, 16);
  // Iron bands with lit edges
  rect(s, 15, 25, 49, 28, 36, 36, 40);
  rect(s, 15, 25, 49, 26, 62, 62, 68);
  rect(s, 14, 48, 50, 51, 36, 36, 40);
  rect(s, 14, 48, 50, 49, 62, 62, 68);
  // Top — stave ends and a bung
  ellipse(s, 32, 20, 12, 3, 84, 60, 38);
  ellipse(s, 32, 20, 9, 2, 60, 42, 26);
  px(s, 36, 20, 40, 30, 20); // bung hole
  return finish(s);
}

function crateSprite(): SpriteTex {
  const s = makeSprite();
  rect(s, 14, 26, 50, 58, 84, 60, 36);
  // Frame
  rect(s, 14, 26, 50, 29, 52, 36, 20);
  rect(s, 14, 55, 50, 58, 52, 36, 20);
  rect(s, 14, 26, 17, 58, 52, 36, 20);
  rect(s, 47, 26, 50, 58, 52, 36, 20);
  // Diagonal brace
  line(s, 17, 55, 47, 29, 3, 60, 42, 24);
  // Slat seams and nail heads
  line(s, 18, 38, 46, 38, 1, 66, 46, 28);
  line(s, 18, 47, 46, 47, 1, 66, 46, 28);
  px(s, 16, 28, 30, 30, 34);
  px(s, 48, 28, 30, 30, 34);
  px(s, 16, 56, 30, 30, 34);
  px(s, 48, 56, 30, 30, 34);
  return finish(s);
}

function graveSprite(): SpriteTex {
  const s = makeSprite();
  // Slab with rounded top
  rect(s, 22, 34, 42, 58, 78, 76, 74);
  ellipse(s, 32, 34, 10, 8, 78, 76, 74);
  // Weathering
  const rand = rng(7);
  for (let i = 0; i < 30; i++) {
    const x = 23 + Math.floor(rand() * 18);
    const y = 30 + Math.floor(rand() * 27);
    px(s, x, y, 58, 56, 55);
  }
  // Crack
  line(s, 34, 30, 29, 52, 1, 40, 39, 38);
  // Inscription hint
  rect(s, 27, 38, 37, 39, 56, 55, 54);
  rect(s, 28, 43, 36, 44, 56, 55, 54);
  return finish(s);
}

function deadTreeSprite(): SpriteTex {
  const s = makeSprite();
  const bark = { r: 40, g: 30, b: 22 };
  // Trunk
  line(s, 32, 62, 30, 26, 4, bark.r, bark.g, bark.b);
  // Branches
  line(s, 30, 40, 16, 26, 2, bark.r, bark.g, bark.b);
  line(s, 16, 26, 12, 14, 1, bark.r, bark.g, bark.b);
  line(s, 31, 34, 46, 20, 2, bark.r, bark.g, bark.b);
  line(s, 46, 20, 52, 10, 1, bark.r, bark.g, bark.b);
  line(s, 30, 26, 36, 10, 2, bark.r, bark.g, bark.b);
  line(s, 30, 48, 20, 40, 1, bark.r, bark.g, bark.b);
  line(s, 31, 44, 44, 36, 1, bark.r, bark.g, bark.b);
  // Finer twigs and a root flare
  line(s, 22, 33, 18, 24, 1, bark.r, bark.g, bark.b);
  line(s, 40, 30, 46, 22, 1, bark.r, bark.g, bark.b);
  line(s, 36, 14, 42, 6, 1, bark.r, bark.g, bark.b);
  line(s, 32, 62, 24, 64, 3, bark.r, bark.g, bark.b);
  line(s, 32, 62, 40, 64, 3, bark.r, bark.g, bark.b);
  // A crow watching from the bare branches
  ellipse(s, 36, 8, 2.5, 1.8, 18, 16, 20);
  px(s, 38, 7.5, 30, 26, 30);
  px(s, 35, 9, 40, 36, 40); // wing sheen
  return finish(s);
}

// A stone well — the reliable water source in the plaza.
function wellSprite(): SpriteTex {
  const s = makeSprite();
  // Coursed stone ring with a pale coping
  ellipse(s, 32, 44, 16, 10, 74, 72, 70);
  for (let x = 19; x <= 45; x += 5) line(s, x, 40, x, 47, 1, 54, 52, 50); // block seams
  ellipse(s, 32, 41.5, 13, 6, 20, 19, 18); // dark water within
  line(s, 17, 40, 47, 40, 1, 94, 92, 90); // coping highlight
  // Posts, crossbeam, rope and bucket
  rect(s, 18, 15, 21, 44, 66, 46, 28);
  rect(s, 43, 15, 46, 44, 66, 46, 28);
  rect(s, 19, 15, 20, 44, 84, 62, 40); // post highlight
  rect(s, 18, 14, 46, 17, 58, 40, 24); // crossbeam
  line(s, 32, 17, 32, 33, 1, 108, 86, 54); // rope
  rect(s, 29, 33, 35, 38, 62, 46, 30); // bucket
  rect(s, 29, 33, 35, 34, 80, 60, 40);
  // Little shingled roof
  for (let i = 0; i < 3; i++) {
    const shade = 54 - i * 7;
    line(s, 15 - i, 18 - i, 32, 5 + i, 3, shade, shade * 0.72, shade * 0.48);
    line(s, 49 + i, 18 - i, 32, 5 + i, 3, shade, shade * 0.72, shade * 0.48);
  }
  line(s, 28, 5, 36, 5, 2, 60, 44, 30); // ridge cap
  return finish(s);
}

// A wooden hand-cart, abandoned in the street.
function cartSprite(): SpriteTex {
  const s = makeSprite();
  // Bed with side rails
  rect(s, 12, 34, 52, 42, 74, 52, 32);
  rect(s, 12, 34, 52, 36, 92, 66, 40);
  line(s, 14, 39, 50, 39, 1, 56, 40, 24); // plank seam
  rect(s, 12, 26, 15, 34, 60, 42, 26);
  rect(s, 49, 26, 52, 34, 60, 42, 26);
  rect(s, 12, 26, 15, 27, 78, 56, 36);
  // A tarpaulin heap left in the bed
  ellipse(s, 32, 32, 12, 5, 88, 84, 70);
  line(s, 22, 31, 42, 33, 1, 70, 66, 54);
  // Wheels — spoked, iron-rimmed
  for (const wx of [20, 44] as const) {
    ellipse(s, wx, 50, 7, 7, 40, 30, 20);
    ellipse(s, wx, 50, 5.5, 5.5, 56, 40, 26);
    line(s, wx - 5, 50, wx + 5, 50, 1, 30, 22, 14);
    line(s, wx, 45, wx, 55, 1, 30, 22, 14);
    line(s, wx - 3, 46.5, wx + 3, 53.5, 1, 30, 22, 14);
    line(s, wx + 3, 46.5, wx - 3, 53.5, 1, 30, 22, 14);
    ellipse(s, wx, 50, 1.5, 1.5, 70, 72, 78); // iron hub
  }
  // Shaft sticking forward, its handle worn pale
  line(s, 52, 38, 62, 30, 2, 66, 46, 28);
  line(s, 61, 31, 63, 29, 2, 96, 72, 46);
  return finish(s);
}

// A pile of planks — collect for barricades.
function planksSprite(): SpriteTex {
  const s = makeSprite();
  const boards: [number, number, number, number, number][] = [
    [14, 52, 50, 56, 78],
    [18, 46, 54, 50, 70],
    [12, 40, 46, 44, 84],
    [22, 34, 52, 38, 64],
    [16, 56, 48, 60, 72],
  ];
  for (const [x0, y0, x1, y1, shade] of boards) {
    rect(s, x0, y0, x1, y1, shade, shade * 0.66, shade * 0.42);
    px(s, x0, y0, shade * 0.5, shade * 0.34, shade * 0.2);
    px(s, x1, y1, shade * 0.5, shade * 0.34, shade * 0.2);
  }
  return finish(s);
}

// A loaf of bread.
function breadSprite(): SpriteTex {
  const s = makeSprite();
  ellipse(s, 32, 46, 14, 9, 148, 104, 52);
  ellipse(s, 32, 44, 12, 7, 176, 128, 66);
  // Scoring on the crust
  line(s, 24, 42, 28, 48, 1, 120, 82, 40);
  line(s, 32, 40, 36, 47, 1, 120, 82, 40);
  line(s, 40, 42, 43, 47, 1, 120, 82, 40);
  return finish(s);
}

// A waterskin.
function skinSprite(): SpriteTex {
  const s = makeSprite();
  ellipse(s, 32, 46, 11, 13, 96, 62, 34);
  ellipse(s, 30, 44, 8, 10, 116, 78, 44);
  rect(s, 29, 30, 35, 34, 70, 46, 26); // neck
  rect(s, 28, 28, 36, 30, 44, 32, 22); // cap
  line(s, 30, 33, 24, 40, 1, 52, 36, 20); // strap
  return finish(s);
}

// A plague victim that got back up. Hooded, hunched, grey-green.
function shamblerFrame(step: number): SpriteTex {
  const s = makeSprite();
  const sway = step === 0 ? 2 : -2;
  person(s, {
    robe: [34, 38, 36],
    skin: [96, 108, 88],
    hunch: 0.55,
    sway,
    ragHem: true,
    barefoot: true,
    armsDown: true,
  });
  const fx = 32 + sway * 0.8;
  // Hood drawn low over the face
  ellipse(s, fx, 18, 7, 6, 27, 31, 29);
  rect(s, fx - 3, 21, fx + 3, 24, 96, 108, 88);
  // Sunken eyes — darker than the face's own
  px(s, fx - 2, 22, 8, 8, 8);
  px(s, fx + 2, 22, 8, 8, 8);
  // Plague marks down the front
  px(s, 26, 40, 52, 62, 46);
  px(s, 38, 33, 52, 62, 46);
  px(s, 31, 52, 46, 54, 40);
  px(s, 24, 47, 46, 54, 40);
  return finish(s);
}

// Villagers — drawn on the rasterizer: an articulated body (scissoring legs
// under the hem, counter-swinging arms, a robe that swings with the stride)
// in five different dressings, so the streets read as a crowd and not one
// figure copied fifteen times. `phase` is 0..1 across the walk cycle.
function villagerRig(r: Ras, phase: number, variant: number): void {
  const st = Math.sin(phase * Math.PI * 2);
  const bob = Math.abs(Math.cos(phase * Math.PI * 2)) * -0.4;
  const hunch = variant === 3 ? 0.55 : 0;
  const robes: [number, number, number][] = [
    [74, 58, 42],  // errand-runner — hooded brown
    [88, 74, 58],  // housewife — warm wool
    [96, 52, 40],  // tradesman — russet
    [64, 60, 54],  // beggar — grey rags
    [48, 54, 78],  // clerk — dark blue
  ];
  const [R, G, B] = robes[variant] ?? robes[0];
  const skin: [number, number, number] = variant === 3 ? [152, 118, 88] : [172, 134, 98];
  const shoe: [number, number, number] = variant === 3 ? skin : [30, 26, 22];
  const headY = 17 + hunch * 5 + bob;
  const shoulderY = 28 + hunch * 3 + bob;
  const hipY = 50 + bob * 0.7;
  const hemY = 54.5 + bob;
  const sway = st * 1.5;
  const fx = 32 + sway * 0.6;

  // Legs — dark hose under the hem, scissoring with the stride.
  const footAX = 32 - st * 4.4;
  const footAY = 59.5 - Math.max(0, st) * 1.6 + bob * 0.3;
  const footBX = 32 + st * 4.4;
  const footBY = 59.5 - Math.max(0, -st) * 1.6 + bob * 0.3;
  r.limb(30 - st * 0.6, hipY, footAX, footAY, 3.1, shoe[0], shoe[1], shoe[2]);
  r.limb(34 + st * 0.6, hipY, footBX, footBY, 3.1, shoe[0], shoe[1], shoe[2]);
  r.ellipse(footAX, footAY + 0.6, 3, 1.8, shoe[0], shoe[1], shoe[2]);
  r.ellipse(footBX, footBY + 0.6, 3, 1.8, shoe[0], shoe[1], shoe[2]);

  // Arms — hanging at the sides, swinging against the stride.
  const sleeve: [number, number, number] = [R * 0.8, G * 0.8, B * 0.8];
  const handAX = 25.5 + st * 3;
  const handBX = 38.5 - st * 3;
  const handY = 46 + bob;
  r.limb(26.5 + sway * 0.4, shoulderY + 2, handAX, handY, 3, sleeve[0], sleeve[1], sleeve[2]);
  r.limb(37.5 + sway * 0.4, shoulderY + 2, handBX, handY, 3, sleeve[0], sleeve[1], sleeve[2]);

  // Robe — a trapezoid whose hem swings with the stride, with fold shading.
  r.poly(
    [
      [26.5 + sway * 0.3, shoulderY],
      [37.5 + sway * 0.3, shoulderY],
      [44 + sway * 0.5, hemY - st * 0.6],
      [20 + sway * 0.5, hemY + st * 0.6],
    ],
    R, G, B
  );
  // Folds and the darker hem band.
  r.line(30 + sway * 0.4, shoulderY + 4, 28.5 + sway * 0.5, hemY - 0.5, 0.8, R * 0.8, G * 0.8, B * 0.8);
  r.line(34 + sway * 0.4, shoulderY + 4, 35.5 + sway * 0.5, hemY - 0.5, 0.8, R * 0.8, G * 0.8, B * 0.8);
  r.line(22 + sway * 0.5, hemY - 1 + st * 0.4, 42 + sway * 0.5, hemY - 1 - st * 0.4, 1.4, R * 0.6, G * 0.6, B * 0.6);
  if (variant !== 3) {
    const belt: [number, number, number][] = [[52, 38, 24], [60, 50, 36], [56, 40, 26], [0, 0, 0], [36, 32, 24]];
    const [br, bg, bb] = belt[variant];
    r.rect(26 + sway * 0.4, 43 + bob, 38 + sway * 0.4, 45 + bob, br, bg, bb);
  }

  // Hands after the robe so they read on the silhouette.
  r.ellipse(handAX, handY + 1, 2, 2.4, skin[0], skin[1], skin[2]);
  r.ellipse(handBX, handY + 1, 2, 2.4, skin[0], skin[1], skin[2]);

  // Neck and head — a face, not a blob.
  r.rect(30 + sway * 0.5, headY + 4, 34 + sway * 0.5, headY + 8, skin[0] * 0.55, skin[1] * 0.55, skin[2] * 0.55);
  r.ellipse(fx, headY, 4.8, 5.8, skin[0], skin[1], skin[2]);
  r.rect(fx - 3, headY - 2, fx + 3, headY - 1, skin[0] * 0.72, skin[1] * 0.72, skin[2] * 0.72);
  r.px(fx - 2, headY, 26, 20, 16);
  r.px(fx + 2, headY, 26, 20, 16);
  r.rect(fx - 1, headY + 3, fx + 1, headY + 3, skin[0] * 0.58, skin[1] * 0.58, skin[2] * 0.58);

  // The dressing.
  if (variant === 1) {
    // Housewife — a linen kerchief knotted at the crown, basket on the arm.
    r.ellipse(fx, headY - 4, 6.3, 5, 190, 178, 158);
    r.px(fx + 4, headY - 6, 190, 178, 158); // the knot's tail
    r.rect(22, 42 + bob, 28, 48 + bob, 96, 72, 40); // the basket
    r.line(24, 42 + bob, 30, 36 + bob, 1, 76, 56, 30);
  } else if (variant === 2) {
    // Tradesman — russet robe, flat cap, a bundle under one arm.
    r.rect(fx - 6, headY - 5, fx + 6, headY - 2, 44, 34, 24);
    r.rect(fx - 7, headY - 2, fx + 7, headY - 1, 34, 26, 18); // the brim
    r.ellipse(40, 42 + bob, 4, 5, 118, 96, 64); // cloth bundle
  } else if (variant === 3) {
    // Beggar — a shawl over the head, a bowl held out ahead.
    r.ellipse(fx, headY - 1, 7, 6.5, 56, 52, 46);
    r.rect(fx - 3, headY + 1, fx + 3, headY + 6, skin[0] * 0.82, skin[1] * 0.82, skin[2] * 0.82); // gaunter
    r.ellipse(41, 47 + bob, 3.5, 2.5, 90, 78, 58); // the begging bowl, held out
  } else if (variant === 4) {
    // Clerk — soft cap, a ledger held to the chest.
    r.ellipse(fx, headY - 4, 6, 4.5, 40, 36, 30);
    r.rect(27, 38 + bob, 33, 45 + bob, 96, 80, 52); // the ledger
  } else {
    // Errand-runner — hood drawn up against the weather, satchel at the hip.
    r.ellipse(fx, headY - 1, 6.2, 5.8, 60, 46, 33);
    r.rect(38, 46 + bob, 42, 51 + bob, 70, 48, 30);
    r.line(30, 34 + bob, 40, 46 + bob, 1, 46, 34, 20);
  }
}

// A villager frame — `phase` 0..1 across the walk cycle.
function villagerFrame(phase: number, variant: number): SpriteTex {
  const r = new Ras();
  villagerRig(r, phase, variant);
  return finish(r.down());
}

const WALK_PHASES = [0, 0.25, 0.5, 0.75];

// Sister Marguerite — dark habit, white wimple, hands folded.
function nunFrame(): SpriteTex {
  const s = makeSprite();
  person(s, { robe: [44, 42, 54] });
  // Scapular — a darker panel down the front of the habit
  rect(s, 30, 30, 34, 57, 36, 34, 44);
  // White wimple framing the face
  ellipse(s, 32, 19, 7.5, 8, 212, 206, 190);
  rect(s, 29, 21, 35, 27, 172, 134, 98); // face in the opening
  px(s, 30, 23, 26, 20, 16);
  px(s, 34, 23, 26, 20, 16);
  // Dark veil over the crown, falling past the shoulders
  ellipse(s, 32, 13, 8.5, 4.5, 38, 36, 46);
  line(s, 25, 15, 24, 30, 2, 38, 36, 46);
  line(s, 39, 15, 40, 30, 2, 38, 36, 46);
  return finish(s);
}

// Maître Aubert — olive robe, flat apothecary's cap, beard.
function aubertFrame(): SpriteTex {
  const s = makeSprite();
  person(s, { robe: [78, 66, 40], belt: [52, 38, 24] });
  // Satchel on a shoulder strap
  line(s, 28, 32, 40, 45, 1, 46, 34, 20);
  rect(s, 38, 44, 43, 51, 74, 52, 32);
  rect(s, 38, 44, 43, 45, 88, 64, 40);
  // Beard and flat cap
  ellipse(s, 32, 27, 4.5, 4, 130, 108, 84);
  px(s, 30, 25, 110, 92, 72);
  px(s, 34, 25, 110, 92, 72);
  rect(s, 26, 13, 38, 17, 52, 42, 30);
  rect(s, 25, 17, 39, 18, 40, 32, 22); // brim
  return finish(s);
}

// Foulques the gravedigger — drab brown, a spade over one shoulder.
function diggerFrame(): SpriteTex {
  const s = makeSprite();
  person(s, { robe: [62, 52, 38], belt: [44, 34, 22] });
  // Soil-stained apron
  rect(s, 27, 36, 37, 57, 50, 41, 31);
  rect(s, 27, 36, 37, 38, 42, 34, 26);
  px(s, 30, 48, 38, 30, 24); // a grave's worth of dirt
  px(s, 34, 52, 36, 28, 22);
  // Flat field cap and greying beard
  rect(s, 26, 13, 38, 18, 40, 34, 26);
  rect(s, 26, 17, 38, 18, 30, 25, 20); // brim shadow
  ellipse(s, 32, 27, 4.5, 3.5, 120, 100, 76);
  // Spade resting against the shoulder
  line(s, 40, 16, 44, 52, 2, 96, 70, 42);
  rect(s, 37, 10, 43, 17, 104, 108, 114); // blade
  px(s, 38, 12, 150, 154, 160); // worn edge
  return finish(s);
}

// Widow Lambert — dark shawl over a worn dress, hair pinned grey.
function widowFrame(): SpriteTex {
  const s = makeSprite();
  person(s, { robe: [58, 46, 52], belt: [40, 34, 38] });
  // Mourning shawl across the shoulders, its tails hanging forward
  rect(s, 24, 29, 40, 34, 38, 32, 40);
  line(s, 25, 34, 27, 45, 2, 38, 32, 40);
  line(s, 39, 34, 37, 45, 2, 38, 32, 40);
  px(s, 26, 39, 46, 38, 46); // worn fold
  // Grey hair pinned in a bun
  ellipse(s, 32, 15, 6, 4, 118, 112, 108);
  ellipse(s, 32, 11, 2.5, 2.5, 104, 98, 94);
  px(s, 31, 10, 140, 134, 130); // pin glint
  return finish(s);
}

// Evidence marks — a stain and scratches on the ground, examined not taken.
// Soft-edged and dim: they read as something on the floor, not an object.
function marksSprite(): SpriteTex {
  const s = makeSprite();
  const r = rng(90617);
  // A dark pool, irregular.
  for (let i = 0; i < 3; i++) {
    ellipse(s, 28 + r() * 10, 40 + r() * 8, 5 + r() * 4, 3 + r() * 3, 38, 26, 20, 150);
  }
  // Scratches raked through it.
  for (let i = 0; i < 4; i++) {
    const x = 24 + r() * 14;
    line(s, x, 36 + r() * 4, x + 6 + r() * 5, 46 + r() * 5, 1, 30, 20, 14, 170);
  }
  // And the drag-line leading off.
  line(s, 22, 52, 44, 56, 2, 44, 30, 22, 130);
  return s; // no outline — stains shouldn't get one
}

// A folded letter — parchment with a wax seal.
function letterSprite(): SpriteTex {
  const s = makeSprite();
  rect(s, 20, 30, 44, 50, 196, 178, 138); // paper
  rect(s, 20, 30, 44, 32, 168, 150, 112); // top fold
  line(s, 20, 30, 32, 40, 1, 150, 132, 96); // fold creases
  line(s, 44, 30, 32, 40, 1, 150, 132, 96);
  ellipse(s, 32, 42, 4, 4, 140, 40, 36); // wax seal
  px(s, 31, 41, 190, 70, 60);
  return finish(s);
}

// A sprig of rue — grey-green leaves on a stem.
function rueSprite(): SpriteTex {
  const s = makeSprite();
  line(s, 32, 56, 32, 30, 1, 74, 96, 52);
  for (const [ox, oy] of [
    [-5, -12], [5, -16], [-6, -22], [6, -26], [-4, -30], [4, -33], [0, -36],
  ]) {
    ellipse(s, 32 + ox, 56 + oy, 3.5, 4.5, 96, 120, 74);
  }
  ellipse(s, 32, 18, 2, 2.5, 130, 150, 96); // bud at the top
  return finish(s);
}

// A small jar of leeches — murky glass, dark shapes inside.
function leechesSprite(): SpriteTex {
  const s = makeSprite();
  rect(s, 24, 28, 40, 54, 96, 110, 96, 200); // glass
  rect(s, 25, 44, 39, 52, 40, 52, 40, 220); // murky water
  ellipse(s, 29, 48, 2.5, 1.5, 16, 12, 10);
  ellipse(s, 35, 50, 2.5, 1.5, 16, 12, 10);
  ellipse(s, 32, 46, 2, 1.5, 20, 16, 12);
  rect(s, 23, 25, 41, 29, 96, 66, 36); // cork lid
  return finish(s);
}

// The cure — a small vial glowing pale gold.
function cureSprite(): SpriteTex {
  const s = makeSprite();
  // Glow halo
  ellipse(s, 32, 38, 14, 16, 255, 220, 120, 60);
  // Vial
  rect(s, 28, 30, 36, 52, 140, 150, 140, 210);
  rect(s, 29, 40, 35, 50, 235, 200, 96, 240); // the golden physic
  rect(s, 29, 25, 35, 30, 96, 66, 36); // neck + cork
  px(s, 30, 42, 255, 240, 180);
  return finish(s);
}

// Provost's man-at-arms — blue-grey tabard, kettle helm, a halberd.
// The provost's guard at the cordon — the same articulated body, but a
// posted man's idle: feet planted wide, weight shifting side to side, the
// halberd held upright and leaning with him.
function guardRig(r: Ras, phase: number): void {
  const st = Math.sin(phase * Math.PI * 2);
  const sway = st * 0.9; // weight drifting foot to foot
  const bob = Math.abs(st) * -0.15;
  const tabard: [number, number, number] = [62, 76, 96];
  const skin: [number, number, number] = [168, 130, 96];
  const headY = 17 + bob;
  const shoulderY = 28 + bob;
  const hemY = 55 + bob;
  const fx = 32 + sway * 0.5;

  // Feet planted wide — posted, not walking.
  r.limb(30, 51 + bob, 29.5 + sway * 0.4, 59.5, 3.1, 40, 44, 50);
  r.limb(34, 51 + bob, 34.5 + sway * 0.4, 59.5, 3.1, 40, 44, 50);
  r.ellipse(29 + sway * 0.4, 60, 3.4, 1.9, 30, 26, 22);
  r.ellipse(35 + sway * 0.4, 60, 3.4, 1.9, 30, 26, 22);

  // Sleeves — the right hand grips the halberd shaft.
  const sleeve: [number, number, number] = [tabard[0] * 0.8, tabard[1] * 0.8, tabard[2] * 0.8];
  r.limb(26.5 + sway * 0.3, shoulderY + 2, 25 + sway * 0.5, 46 + bob, 3, sleeve[0], sleeve[1], sleeve[2]);
  r.limb(37.5 + sway * 0.3, shoulderY + 2, 42.5 + sway * 0.5, 42 + bob, 3, sleeve[0], sleeve[1], sleeve[2]);

  // Tabard — squared shoulders, a straighter cut than the citizens' robes.
  r.poly(
    [
      [26 + sway * 0.3, shoulderY],
      [38 + sway * 0.3, shoulderY],
      [42.5 + sway * 0.5, hemY],
      [21.5 + sway * 0.5, hemY],
    ],
    tabard[0], tabard[1], tabard[2]
  );
  r.line(30 + sway * 0.4, shoulderY + 4, 28.5 + sway * 0.5, hemY - 1, 0.8, tabard[0] * 0.8, tabard[1] * 0.8, tabard[2] * 0.8);
  r.line(34 + sway * 0.4, shoulderY + 4, 35.5 + sway * 0.5, hemY - 1, 0.8, tabard[0] * 0.8, tabard[1] * 0.8, tabard[2] * 0.8);
  r.line(22 + sway * 0.5, hemY - 1.4, 42 + sway * 0.5, hemY - 1.4, 1.4, tabard[0] * 0.6, tabard[1] * 0.6, tabard[2] * 0.6);
  r.rect(26 + sway * 0.4, 43 + bob, 38 + sway * 0.4, 45 + bob, 46, 36, 24); // the belt
  // Brass badge on the tabard.
  r.ellipse(32 + sway * 0.5, 36 + bob, 2.4, 2.8, 190, 160, 80);
  r.px(32 + sway * 0.5, 36 + bob, 230, 200, 120);

  // Hands.
  r.ellipse(25 + sway * 0.5, 47 + bob, 2, 2.4, skin[0], skin[1], skin[2]);
  r.ellipse(42.5 + sway * 0.5, 43 + bob, 2.2, 2.4, skin[0], skin[1], skin[2]);

  // Neck shadow, then the helm instead of a bare head — mail first, the
  // face set into its opening.
  r.rect(30 + sway * 0.4, headY + 4, 34 + sway * 0.4, headY + 8, skin[0] * 0.55, skin[1] * 0.55, skin[2] * 0.55);
  // Mail coif over the whole head.
  r.ellipse(fx, headY + 3, 6, 6.5, 96, 100, 108);
  r.rect(fx - 5, headY + 5, fx + 5, headY + 10, 96, 100, 108);
  // Face in the coif's opening, shaded by the helm brim.
  r.rect(fx - 2.6, headY + 5, fx + 2.6, headY + 9.5, skin[0] * 0.8, skin[1] * 0.8, skin[2] * 0.8);
  r.px(fx - 1.6, headY + 7, 26, 20, 16);
  r.px(fx + 1.6, headY + 7, 26, 20, 16);
  // Kettle helm — wide brim, domed crown.
  r.ellipse(fx, headY - 3, 9.5, 3, 104, 108, 116);
  r.ellipse(fx, headY - 5.5, 5.5, 4.5, 116, 120, 128);
  r.px(fx, headY - 9, 140, 144, 152); // crown ridge

  // The halberd — shaft held upright beside him, leaning with his sway.
  const hx = 45 + sway * 0.8;
  r.line(hx, 8, 42 + sway * 0.5, 59, 2, 90, 64, 36);
  r.rect(hx - 2, 5, hx + 4, 12, 170, 174, 182); // axe head
  r.line(hx + 2, 1, hx + 2, 5, 2, 185, 189, 197); // spike
  r.px(hx - 1, 13, 150, 154, 162); // edge
}

function guardFrame(phase: number): SpriteTex {
  const r = new Ras();
  guardRig(r, phase);
  return finish(r.down());
}

// Mistress Hélène, the innkeeper — russet dress, clean apron, kerchief.
function innkeepFrame(): SpriteTex {
  const s = makeSprite();
  person(s, { robe: [96, 52, 40], belt: [60, 40, 28] });
  // Clean apron, bib to hem, strings tied at the waist
  rect(s, 27, 33, 37, 57, 190, 180, 160);
  rect(s, 27, 33, 37, 35, 168, 158, 138);
  line(s, 27, 45, 23, 47, 1, 190, 180, 160);
  line(s, 37, 45, 41, 47, 1, 190, 180, 160);
  px(s, 30, 50, 170, 160, 142); // a mended patch
  px(s, 34, 42, 175, 165, 148);
  // Kerchief over the hair, knotted at the side
  ellipse(s, 32, 15, 7.5, 4.5, 210, 204, 190);
  px(s, 39, 13, 210, 204, 190);
  px(s, 40, 16, 200, 194, 180);
  return finish(s);
}

// Baker Colin — flour-dusted apron, cap, rolled sleeves.
function bakerFrame(): SpriteTex {
  const s = makeSprite();
  person(s, { robe: [92, 78, 60], belt: [64, 48, 32] });
  // Flour apron — pale, dusted white in patches
  rect(s, 26, 33, 38, 57, 202, 196, 180);
  px(s, 29, 40, 228, 224, 212);
  px(s, 35, 47, 228, 224, 212);
  px(s, 31, 52, 228, 224, 212);
  px(s, 33, 38, 220, 216, 204);
  // Rolled sleeves — bare forearms
  line(s, 27, 37, 29, 43, 2, 174, 134, 100);
  line(s, 37, 37, 35, 43, 2, 174, 134, 100);
  // Round baker's cap
  ellipse(s, 32, 14, 8, 4.5, 216, 210, 196);
  ellipse(s, 32, 12, 5, 3, 224, 218, 206);
  // Jovial ruddy face
  px(s, 30, 23, 190, 120, 90);
  px(s, 34, 23, 190, 120, 90);
  return finish(s);
}

// The alchemist — midnight robe, wild grey hair, something green at his belt.
function alchemistFrame(): SpriteTex {
  const s = makeSprite();
  person(s, { robe: [36, 38, 52], belt: [44, 36, 28], hunch: 0.2 });
  // Wild grey hair — tufts escaping in every direction
  ellipse(s, 32, 14, 8.5, 5.5, 150, 148, 144);
  px(s, 23, 12, 150, 148, 144);
  px(s, 41, 11, 150, 148, 144);
  px(s, 25, 8, 140, 138, 134);
  px(s, 39, 8, 140, 138, 134);
  px(s, 32, 6, 148, 146, 142);
  px(s, 27, 10, 160, 158, 154);
  // Gaunt face — sunken eyes with a feverish glint
  px(s, 30, 22, 30, 22, 18);
  px(s, 34, 22, 30, 22, 18);
  px(s, 30, 21, 120, 200, 130);
  px(s, 34, 21, 120, 200, 130);
  // A vial of something wrong, glowing at his belt
  ellipse(s, 39.5, 48, 5, 5.5, 70, 160, 95, 150); // its glow on the robe
  rect(s, 38, 45, 41, 52, 90, 200, 120, 235);
  px(s, 39, 47, 150, 255, 170);
  px(s, 40, 50, 60, 160, 80);
  return finish(s);
}

// A patient of the pesthouse — rough grey shift, hunched and pale.
function patientFrame(): SpriteTex {
  const s = makeSprite();
  person(s, {
    robe: [116, 110, 100],
    skin: [186, 172, 152],
    hunch: 0.45,
    barefoot: true,
    ragHem: true,
  });
  // Arms hugging himself against the fever
  line(s, 26, 40, 36, 42, 2, 182, 168, 148);
  line(s, 38, 41, 30, 44, 2, 182, 168, 148);
  ellipse(s, 36, 42, 2, 2, 182, 168, 148); // a hand
  // Thin hair and the dark marks of the pestilence
  ellipse(s, 33, 14, 5, 3, 120, 112, 104);
  px(s, 27, 46, 72, 62, 54);
  px(s, 37, 50, 72, 62, 54);
  px(s, 31, 56, 66, 56, 48);
  return finish(s);
}

// A hooded figure — all cloak and shadow. The shape you tail through the dark.
function hoodedFrame(): SpriteTex {
  const s = makeSprite();
  person(s, { robe: [30, 28, 34], armsDown: true, skin: [24, 22, 28] });
  // Deep hood — just darkness inside
  ellipse(s, 32, 16, 8, 7, 40, 38, 48);
  rect(s, 28, 19, 36, 25, 8, 7, 10);
  ellipse(s, 32, 21, 4.5, 4, 6, 5, 8);
  // Hem drags the ground, ragged with use
  rect(s, 24, 57, 40, 60, 22, 20, 26);
  px(s, 27, 60, 0, 0, 0, 0);
  px(s, 33, 60, 0, 0, 0, 0);
  px(s, 38, 60, 0, 0, 0, 0);
  return finish(s);
}

// A shrouded corpse laid out for autopsy on a stone slab.
function corpseSprite(): SpriteTex {
  const s = makeSprite();
  // Slab — heavy stone with iron rings
  rect(s, 10, 44, 54, 50, 74, 72, 76);
  rect(s, 10, 44, 54, 45, 98, 96, 100);
  rect(s, 14, 50, 18, 58, 60, 58, 62);
  rect(s, 46, 50, 50, 58, 60, 58, 62);
  rect(s, 15, 52, 17, 55, 36, 34, 38); // ring
  rect(s, 47, 52, 49, 55, 36, 34, 38);
  // The body — sheet pulled back past the chest
  rect(s, 21, 36, 48, 43, 158, 150, 138); // sheet over the legs
  ellipse(s, 37, 39, 11, 4.5, 158, 150, 138);
  line(s, 28, 36, 46, 36, 1, 128, 120, 110); // sheet fold
  // Exposed head and chest — pale, the ribs showing
  ellipse(s, 17, 40, 4.5, 4, 178, 168, 152);
  px(s, 16, 39, 40, 34, 30);
  px(s, 19, 39, 40, 34, 30); // closed eyes
  rect(s, 22, 37, 30, 42, 176, 166, 150);
  for (let x = 23; x < 30; x += 2) px(s, x, 39, 150, 140, 128); // ribs
  line(s, 30, 38, 38, 43, 2, 172, 162, 148); // arm across the slab
  ellipse(s, 49, 41, 3, 2.5, 150, 138, 124); // a foot escaping the sheet
  // Toe tag
  rect(s, 50, 37, 53, 40, 192, 182, 152);
  px(s, 51, 38, 70, 58, 44);
  return finish(s);
}

// A heap of the dead — what the alchemist dumps below.
function corpsepileSprite(): SpriteTex {
  const s = makeSprite();
  // Mound of limbs and shrouds — pale shapes over a dark heap
  ellipse(s, 32, 48, 16, 9, 46, 40, 38);
  ellipse(s, 26, 44, 9, 6, 150, 138, 124);
  ellipse(s, 38, 45, 8, 5, 138, 126, 112);
  ellipse(s, 32, 42, 7, 5, 160, 150, 136);
  // A face staring out of the pile — hollow eyes
  ellipse(s, 24, 41, 4, 4, 162, 150, 134);
  px(s, 22.5, 40, 28, 24, 22);
  px(s, 26, 40, 28, 24, 22);
  px(s, 24, 42.5, 50, 44, 40); // mouth slack
  // Limbs jutting at angles
  line(s, 22, 40, 16, 32, 2, 150, 138, 124);
  ellipse(s, 15.5, 31, 2, 2, 152, 140, 126); // fingers
  line(s, 42, 42, 48, 34, 2, 140, 128, 112);
  ellipse(s, 48.5, 33, 2.5, 2, 138, 126, 110);
  line(s, 34, 46, 40, 53, 2, 146, 134, 118);
  ellipse(s, 40.5, 54, 2.5, 2, 148, 136, 120);
  // A shroud slipping off the heap
  line(s, 28, 44, 22, 54, 3, 120, 112, 100);
  px(s, 28, 43, 60, 50, 44);
  px(s, 36, 46, 60, 50, 44);
  return finish(s);
}

// An iron grate set into the cobbles — the way below.
function grateSprite(): SpriteTex {
  const s = makeSprite();
  // Stone surround bedded in the street
  ellipse(s, 32, 42, 15, 9, 72, 70, 68);
  ellipse(s, 32, 42, 13.5, 7.5, 52, 50, 54);
  // The opening — a pit of darkness
  ellipse(s, 32, 42, 12, 6.5, 6, 6, 8);
  // Iron bars, slightly askew with age
  for (const off of [-9, -5, -1, 3, 7]) {
    line(s, 32 + off, 38, 31 + off, 46, 1, 72, 70, 76);
  }
  line(s, 20, 41, 44, 41, 1, 72, 70, 76);
  line(s, 22, 44.5, 42, 44.5, 1, 62, 60, 66);
  // Rust and the green stain leaking below
  px(s, 26, 39, 96, 60, 36);
  px(s, 38, 44, 96, 60, 36);
  px(s, 30, 47, 40, 60, 40);
  px(s, 34, 47.5, 36, 54, 36);
  return finish(s);
}

// An alembic — the alchemist's still, green glass over a low flame.
function alembicSprite(): SpriteTex {
  const s = makeSprite();
  // Stand and flame
  line(s, 26, 52, 22, 60, 1, 60, 58, 66);
  line(s, 38, 52, 42, 60, 1, 60, 58, 66);
  flame(s, 32, 54, 5, 0.5);
  // The cucurbit — round flask of cloudy green glass
  ellipse(s, 32, 38, 11, 11, 80, 150, 100, 220);
  ellipse(s, 32, 42, 9, 7, 50, 120, 70, 235); // the tincture
  px(s, 28, 34, 180, 240, 190); // glass glint
  px(s, 30, 40, 140, 255, 160);
  // Long neck curving down to the receiver
  line(s, 36, 30, 44, 20, 2, 80, 150, 100, 220);
  line(s, 44, 20, 48, 34, 2, 80, 150, 100, 220);
  ellipse(s, 48, 38, 4, 5, 80, 150, 100, 220);
  return s;
}

// A specimen jar — grey flesh sealed in murky glass.
function specimenSprite(): SpriteTex {
  const s = makeSprite();
  rect(s, 24, 28, 40, 54, 96, 110, 96, 200); // glass
  rect(s, 25, 38, 39, 52, 52, 66, 48, 225); // murk
  ellipse(s, 32, 45, 6, 5, 96, 112, 84); // the flesh
  px(s, 29, 43, 210, 202, 180); // bone glint
  px(s, 35, 47, 60, 70, 50);
  rect(s, 23, 25, 41, 29, 96, 66, 36); // cork lid
  return finish(s);
}

// A silver sou — the purse icon.
function coinSprite(): SpriteTex {
  const s = makeSprite();
  ellipse(s, 32, 38, 11, 11, 176, 180, 190);
  ellipse(s, 32, 38, 8.5, 8.5, 208, 212, 222);
  // Fleur-de-lis stamp, abstracted to a triangle of pixels
  px(s, 32, 34, 120, 124, 136);
  px(s, 32, 36, 120, 124, 136);
  px(s, 30, 38, 120, 124, 136);
  px(s, 34, 38, 120, 124, 136);
  px(s, 32, 40, 120, 124, 136);
  px(s, 28, 42, 140, 144, 156); // rim glint
  px(s, 30, 44, 140, 144, 156);
  return finish(s);
}

// A hanging shop sign — iron bracket, chain-hung board, a painted emblem.
function signFrame(icon: "mug" | "loaf" | "mortar" | "cross" | "flask"): SpriteTex {
  const s = makeSprite();
  // Bracket arm and chains
  line(s, 18, 10, 48, 10, 2, 46, 44, 52);
  line(s, 24, 10, 24, 22, 1, 46, 44, 52);
  line(s, 44, 10, 44, 22, 1, 46, 44, 52);
  // Wooden board — grain showing through the paint
  rect(s, 18, 22, 50, 46, 96, 68, 40);
  for (let y = 26; y < 44; y += 5) line(s, 20, y, 48, y + 1, 1, 78, 54, 32);
  rect(s, 18, 22, 50, 24, 64, 44, 26);
  rect(s, 18, 44, 50, 46, 64, 44, 26);
  rect(s, 18, 22, 20, 46, 64, 44, 26);
  rect(s, 48, 22, 50, 46, 64, 44, 26);
  px(s, 20, 11, 84, 82, 90); // bracket bolts
  px(s, 47, 11, 84, 82, 90);
  if (icon === "mug") {
    // Tankard of ale
    rect(s, 29, 27, 38, 39, 208, 190, 150);
    rect(s, 30, 28, 37, 37, 172, 140, 90);
    rect(s, 39, 29, 43, 31, 208, 190, 150);
    rect(s, 39, 36, 43, 38, 208, 190, 150);
    rect(s, 41, 30, 43, 37, 208, 190, 150);
  } else if (icon === "loaf") {
    ellipse(s, 34, 33, 9, 5.5, 190, 134, 70);
    line(s, 28, 30, 31, 27, 1, 140, 96, 48);
    line(s, 33, 29, 36, 26, 1, 140, 96, 48);
    line(s, 38, 30, 41, 27, 1, 140, 96, 48);
  } else if (icon === "mortar") {
    rect(s, 28, 34, 40, 40, 180, 182, 190);
    ellipse(s, 34, 34, 6, 2, 200, 202, 210);
    line(s, 36, 30, 43, 23, 2, 160, 162, 170);
  } else if (icon === "flask") {
    // A green flask — the alchemist's mark
    rect(s, 32, 25, 35, 30, 96, 170, 110);
    ellipse(s, 33.5, 36, 6.5, 6, 80, 150, 96);
    px(s, 31, 33, 190, 255, 200);
  } else {
    // Gilded cross
    rect(s, 32, 24, 36, 44, 214, 178, 90);
    rect(s, 25, 30, 43, 34, 214, 178, 90);
  }
  return finish(s);
}

// The player's lantern — drawn as a viewmodel overlay, not a world sprite.
function lanternSprite(): SpriteTex {
  const s = makeSprite();
  // Handle
  line(s, 24, 18, 40, 18, 2, 44, 42, 48);
  line(s, 24, 18, 27, 24, 2, 44, 42, 48);
  line(s, 40, 18, 37, 24, 2, 44, 42, 48);
  // Cap and base
  rect(s, 24, 24, 40, 27, 50, 48, 54);
  rect(s, 22, 54, 42, 58, 50, 48, 54);
  // Glass panes with the candle glow inside
  rect(s, 24, 28, 40, 53, 26, 24, 30);
  ellipse(s, 32, 42, 7, 10, 255, 196, 90, 255);
  ellipse(s, 32, 40, 4, 6, 255, 232, 160, 255);
  // Cage bars
  for (const x of [24, 29, 35, 40]) rect(s, x, 28, x, 53, 44, 42, 48);
  rect(s, 24, 40, 40, 41, 44, 42, 48);
  // Hanging chain above the handle
  for (let y = 4; y <= 14; y += 3) px(s, 32, y, 56, 54, 60);
  return finish(s);
}

// A folded bolt of pale linen.
function clothSprite(): SpriteTex {
  const s = makeSprite();
  rect(s, 16, 34, 48, 50, 168, 158, 132);
  rect(s, 16, 34, 48, 37, 190, 178, 148); // folded top edge
  rect(s, 16, 47, 48, 50, 140, 130, 106); // under-shadow
  line(s, 22, 36, 22, 48, 1, 150, 140, 114);
  line(s, 42, 36, 42, 48, 1, 150, 140, 114);
  return finish(s);
}

// A rolled bandage with a frayed end.
function bandageSprite(): SpriteTex {
  const s = makeSprite();
  ellipse(s, 32, 40, 13, 11, 205, 200, 182);
  ellipse(s, 32, 40, 8, 7, 168, 160, 140); // the roll's hollow centre
  ellipse(s, 32, 40, 3, 3, 110, 104, 90);
  line(s, 44, 42, 52, 48, 2, 196, 190, 168); // loose end trailing
  px(s, 51, 50, 196, 190, 168);
  return finish(s);
}

export interface SpriteKind {
  frames: SpriteTex[];
  scale: number; // fraction of a tile the sprite occupies vertically
  block: number; // collision radius in tiles, 0 = walk through
  animFps: number; // 0 = static
}

export function buildSpriteKinds(): Record<string, SpriteKind> {
  return {
    sconce: {
      frames: [sconceFrame(0), sconceFrame(1), sconceFrame(2), sconceFrame(3)],
      scale: 0.5,
      block: 0,
      animFps: 7,
    },
    barrel: { frames: [barrelSprite()], scale: 0.58, block: 0.16, animFps: 0 },
    crate: { frames: [crateSprite()], scale: 0.52, block: 0.18, animFps: 0 },
    grave: { frames: [graveSprite()], scale: 0.55, block: 0.15, animFps: 0 },
    deadTree: { frames: [deadTreeSprite()], scale: 1.25, block: 0.18, animFps: 0 },
    well: { frames: [wellSprite()], scale: 0.62, block: 0.34, animFps: 0 },
    cart: { frames: [cartSprite()], scale: 0.62, block: 0.32, animFps: 0 },
    planks: { frames: [planksSprite()], scale: 0.3, block: 0, animFps: 0 },
    bread: { frames: [breadSprite()], scale: 0.28, block: 0, animFps: 0 },
    skin: { frames: [skinSprite()], scale: 0.3, block: 0, animFps: 0 },
    shambler: {
      frames: [shamblerFrame(0), shamblerFrame(1)],
      scale: 0.95,
      block: 0.2,
      animFps: 2.4,
    },
    villager: {
      frames: WALK_PHASES.map((p) => villagerFrame(p, 0)),
      scale: 0.92,
      block: 0.18,
      animFps: 2.6,
    },
    nun: { frames: [nunFrame()], scale: 0.9, block: 0.18, animFps: 0 },
    aubert: { frames: [aubertFrame()], scale: 0.9, block: 0.18, animFps: 0 },
    digger: { frames: [diggerFrame()], scale: 0.9, block: 0.18, animFps: 0 },
    widow: { frames: [widowFrame()], scale: 0.9, block: 0.18, animFps: 0 },
    guard: { frames: WALK_PHASES.map((p) => guardFrame(p)), scale: 0.92, block: 0.18, animFps: 1.6 },
    innkeep: { frames: [innkeepFrame()], scale: 0.9, block: 0.18, animFps: 0 },
    baker: { frames: [bakerFrame()], scale: 0.9, block: 0.18, animFps: 0 },
    alchemist: { frames: [alchemistFrame()], scale: 0.9, block: 0.18, animFps: 0 },
    patient: { frames: [patientFrame()], scale: 0.85, block: 0.16, animFps: 0 },
    hooded: { frames: [hoodedFrame()], scale: 0.92, block: 0, animFps: 0 },
    letter: { frames: [letterSprite()], scale: 0.3, block: 0, animFps: 0 },
    grate: { frames: [grateSprite()], scale: 0.4, block: 0, animFps: 0 },
    // bed, homebed, table and desk are props now — real furniture, not billboards
    corpse: { frames: [corpseSprite()], scale: 0.5, block: 0.26, animFps: 0 },
    corpsepile: { frames: [corpsepileSprite()], scale: 0.55, block: 0.32, animFps: 0 },
    alembic: { frames: [alembicSprite()], scale: 0.55, block: 0.18, animFps: 0 },
    marks: { frames: [marksSprite()], scale: 0.32, block: 0, animFps: 0 },
    // Lootable items — same bitmap serves as world pickup and inventory icon.
    cloth: { frames: [clothSprite()], scale: 0.3, block: 0, animFps: 0 },
    bandage: { frames: [bandageSprite()], scale: 0.3, block: 0, animFps: 0 },
    specimen: { frames: [specimenSprite()], scale: 0.3, block: 0, animFps: 0 },
    coin: { frames: [coinSprite()], scale: 0.3, block: 0, animFps: 0 },
    rue: { frames: [rueSprite()], scale: 0.32, block: 0, animFps: 0 },
    leeches: { frames: [leechesSprite()], scale: 0.3, block: 0, animFps: 0 },
    cure: { frames: [cureSprite()], scale: 0.3, block: 0, animFps: 0 },
    // Shop signs hanging over the street.
    sign_bakery: { frames: [signFrame("loaf")], scale: 0.55, block: 0, animFps: 0 },
    sign_tavern: { frames: [signFrame("mug")], scale: 0.55, block: 0, animFps: 0 },
    sign_apothecary: { frames: [signFrame("mortar")], scale: 0.55, block: 0, animFps: 0 },
    sign_church: { frames: [signFrame("cross")], scale: 0.55, block: 0, animFps: 0 },
    sign_alchemist: { frames: [signFrame("flask")], scale: 0.55, block: 0, animFps: 0 },
  };
}

// All villager dressings — a walk-cycle pair per variant. npcs.ts assigns
// each wanderer one of these at spawn.
export function villagerVariants(): SpriteTex[][] {
  return [0, 1, 2, 3, 4].map((v) => WALK_PHASES.map((p) => villagerFrame(p, v)));
}

export function buildLantern(): SpriteTex {
  return lanternSprite();
}

// The doctor's mask — beak, crystal lenses, brimmed hat. The title emblem.
export function maskTex(): SpriteTex {
  const s = makeSprite();
  // Brimmed hat — the silhouette every citizen learns to dread
  ellipse(s, 32, 15, 20, 5.5, 24, 22, 28);
  ellipse(s, 32, 11, 12, 6.5, 30, 28, 36);
  rect(s, 20, 14, 44, 15, 44, 34, 26); // hat band
  px(s, 26, 10, 44, 42, 52); // crown sheen
  // Mask — pale waxed leather
  ellipse(s, 32, 33, 13, 12, 158, 140, 112);
  ellipse(s, 29, 30, 8, 8, 172, 154, 126); // lit cheek
  // Crystal eye lenses — dark rims, glassy glints
  for (const ex of [25, 39] as const) {
    ellipse(s, ex, 30, 5, 5, 26, 26, 32);
    ellipse(s, ex, 30, 3, 3, 74, 96, 106);
    px(s, ex - 1, 28.5, 190, 215, 220);
  }
  // The beak — a waxed cone curving down, seeded with herbs
  for (let i = 0; i < 22; i++) {
    const y = 37 + i;
    const w = Math.max(1.6, 6.5 - i * 0.22);
    const drift = i * 0.14; // it curves away slightly
    for (let x = Math.floor(30 + drift - w); x <= Math.ceil(30 + drift + w); x++) {
      const shade = 118 - i * 1.6 + (x - 30 - drift) * 3;
      px(s, x, y, shade, shade * 0.82, shade * 0.6);
    }
  }
  // Stitch seam and rivet vents
  line(s, 30, 39, 33.4, 57, 1, 78, 62, 44);
  px(s, 28, 47, 52, 42, 30);
  px(s, 36.5, 47, 52, 42, 30);
  px(s, 29.5, 53, 52, 42, 30);
  px(s, 37.8, 53, 52, 42, 30);
  // Strap around the head
  line(s, 19, 32, 45, 32, 1.6, 58, 42, 28);
  return finish(s);
}

// Blit a generated bitmap into a canvas for overlay drawing — cropped to the
// opaque bounds so world sprites fill their UI box instead of their margins.
export function texCanvas(tex: SpriteTex): HTMLCanvasElement {
  const src = document.createElement("canvas");
  src.width = tex.w;
  src.height = tex.h;
  const sctx = src.getContext("2d")!;
  const img = sctx.createImageData(tex.w, tex.h);
  img.data.set(tex.data);
  sctx.putImageData(img, 0, 0);
  let minX = tex.w,
    minY = tex.h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < tex.h; y++) {
    for (let x = 0; x < tex.w; x++) {
      if (tex.data[(y * tex.w + x) * 4 + 3] <= 16) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const c = document.createElement("canvas");
  c.width = Math.max(1, maxX - minX + 1);
  c.height = Math.max(1, maxY - minY + 1);
  if (maxX >= 0) c.getContext("2d")!.drawImage(src, minX, minY, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}
