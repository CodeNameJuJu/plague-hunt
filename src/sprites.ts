import { TEX_SIZE } from "./config";
import type { SpriteTex, Texture, TextureSet, ModelPart } from "./types";

// Sprite bitmaps, generated procedurally like the textures. Every sprite is a
// SPRITE_PX x SPRITE_PX RGBA bitmap; alpha < 128 is transparent.
//
// Sprite art is authored in logical 64-space — the drawing primitives scale
// coordinates by s.w / TEX_SIZE, so old sprites render unchanged as solid
// blocks while new work can place fractional coordinates for finer detail.

const SPRITE_RES = 2;                          // bitmap resolution vs TEX_SIZE
const SPRITE_PX = TEX_SIZE * SPRITE_RES;       // 128 — the sprite bitmap size

function makeSprite(px = SPRITE_PX): SpriteTex {
  return { w: px, h: px, data: new Uint8Array(px * px * 4) };
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

// Raw pixel write — for code that already works in bitmap space (the
// rasterizer's poly scanlines). Everything else draws in logical 64-space.
function rawPx(s: SpriteTex, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return;
  const i = (y * s.w + x) * 4;
  s.data[i] = r;
  s.data[i + 1] = g;
  s.data[i + 2] = b;
  s.data[i + 3] = a;
}

function px(s: SpriteTex, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  const k = s.w / TEX_SIZE;
  const x0 = Math.round(x * k);
  const y0 = Math.round(y * k);
  for (let dy = 0; dy < k; dy++)
    for (let dx = 0; dx < k; dx++) rawPx(s, x0 + dx, y0 + dy, r, g, b, a);
}

function rect(s: SpriteTex, x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a = 255): void {
  const k = s.w / TEX_SIZE;
  for (let y = Math.round(y0 * k); y <= Math.round(y1 * k + k - 1); y++)
    for (let x = Math.round(x0 * k); x <= Math.round(x1 * k + k - 1); x++) rawPx(s, x, y, r, g, b, a);
}

function ellipse(s: SpriteTex, cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a = 255): void {
  const k = s.w / TEX_SIZE;
  cx *= k; cy *= k; rx *= k; ry *= k;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) rawPx(s, x, y, r, g, b, a);
    }
  }
}

function line(s: SpriteTex, x0: number, y0: number, x1: number, y1: number, width: number, r: number, g: number, b: number, a = 255): void {
  const k = s.w / TEX_SIZE;
  x0 *= k; y0 *= k; x1 *= k; y1 *= k; width *= k;
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    const half = width / 2;
    for (let wy = -Math.ceil(half); wy <= Math.ceil(half); wy++) {
      for (let wx = -Math.ceil(half); wx <= Math.ceil(half); wx++) {
        if (wx * wx + wy * wy <= half * half) rawPx(s, Math.round(x + wx), Math.round(y + wy), r, g, b, a);
      }
    }
  }
}

// A soft outline around the silhouette — opaque pixels that touch
// transparency get darkened. The top rim only darkens a little: a hard cap
// there reads as a black line hovering over every head.
function edge(s: SpriteTex): void {
  const { w, h, data } = s;
  const k = s.w / TEX_SIZE; // rim band scales with the bitmap
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;
      const rimTop = y < k || data[i - w * 4 * k + 3] < 128 || data[i - w * 4 + 3] < 128;
      const rimSide =
        x < k || data[i - 4 * k + 3] < 128 ||
        x >= w - k || data[i + 4 * k + 3] < 128 ||
        y >= h - k || data[i + w * 4 * k + 3] < 128 ||
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
// The rasterizer — art drawn in logical 64-space onto a SPRITE_PX*RAS buffer,
// then box-downsampled. Smooth shapes land as anti-aliased pixel art; limbs can
// be posed at any angle per frame, which is what makes real walk cycles
// possible. Pure JS — no canvas, deterministic.
// The shared primitives scale by buffer size, so Ras just passes its logical
// coordinates straight through.

const RAS = 4;

class Ras {
  readonly tex: SpriteTex = makeSprite(SPRITE_PX * RAS);
  px(x: number, y: number, r: number, g: number, b: number, a = 255): void {
    px(this.tex, x, y, r, g, b, a);
  }
  rect(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a = 255): void {
    rect(this.tex, x0, y0, x1, y1, r, g, b, a);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a = 255): void {
    ellipse(this.tex, cx, cy, rx, ry, r, g, b, a);
  }
  line(x0: number, y0: number, x1: number, y1: number, width: number, r: number, g: number, b: number, a = 255): void {
    line(this.tex, x0, y0, x1, y1, width, r, g, b, a);
  }
  // A capsule — a limb segment, rounded at both ends.
  limb(x0: number, y0: number, x1: number, y1: number, width: number, r: number, g: number, b: number): void {
    this.line(x0, y0, x1, y1, width, r, g, b);
  }
  poly(pts: [number, number][], r: number, g: number, b: number, a = 255): void {
    const s = this.tex;
    const K = s.w / TEX_SIZE; // scanlines run in real pixels
    const P = pts.map(([x, y]) => [x * K, y * K]);
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
        for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) rawPx(s, x, y, r, g, b, a);
      }
    }
  }
  // Box-downsample to the real sprite size. Colors are weighted by coverage
  // so partial-coverage edges keep their hue instead of darkening into a
  // fringe; the renderer's <128 alpha cut decides the silhouette.
  down(): SpriteTex {
    const s = this.tex;
    const out = makeSprite();
    const k = s.w / out.w; // RAS — buffer pixels per output pixel
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        let rs = 0, gs = 0, bs = 0, as = 0, cov = 0;
        for (let dy = 0; dy < k; dy++) {
          for (let dx = 0; dx < k; dx++) {
            const i = ((y * k + dy) * s.w + x * k + dx) * 4;
            const w8 = s.data[i + 3] / 255;
            cov += w8;
            as += s.data[i + 3];
            rs += s.data[i] * w8;
            gs += s.data[i + 1] * w8;
            bs += s.data[i + 2] * w8;
          }
        }
        const o = (y * out.w + x) * 4;
        if (cov > 0) {
          out.data[o] = rs / cov;
          out.data[o + 1] = gs / cov;
          out.data[o + 2] = bs / cov;
        }
        out.data[o + 3] = as / (k * k);
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

// Villagers — dark-fantasy crowd pieces on the rasterizer: an articulated
// body (scissoring legs under the hem, counter-swinging arms, cloth that
// swings with the stride) in eight dressings, so the streets read as a
// crowd of strangers and not one figure copied fifteen times. `phase` is
// 0..1 across the walk cycle.
interface Dress {
  robe: [number, number, number];   // main cloth — muddy, desaturated
  skin: [number, number, number];
  hose: [number, number, number];   // leg wear under the hem
  shoe: [number, number, number];
  belt?: [number, number, number];  // rope or leather at the waist
  hunch?: number;                   // stooped posture
  hemY?: number;                    // shorter hems show the hose
  ragged?: boolean;                 // torn, notched hem
  bareArms?: boolean;               // sleeves rolled to the elbow
  patches?: boolean;                // mended cloth — contrast squares
  arms?: "folded" | "heldR" | "hug"; // folded at the waist, right hand raised, hugging oneself
}

const DRESSES: Dress[] = [
  // hooded pilgrim — mud-brown wool, rope belt, satchel
  { robe: [74, 58, 42], skin: [166, 128, 94], hose: [44, 38, 30], shoe: [30, 26, 22], belt: [58, 44, 28], ragged: true, patches: true },
  // housewife — warm wool dress, bone kerchief, apron, basket
  { robe: [92, 64, 48], skin: [172, 134, 98], hose: [52, 46, 38], shoe: [34, 28, 22], belt: [60, 50, 36] },
  // tradesman — russet tunic, flat cap, a bundle under the arm
  { robe: [96, 52, 40], skin: [174, 136, 100], hose: [46, 40, 32], shoe: [30, 26, 22], belt: [52, 38, 24] },
  // beggar — layered grey rags, head shawl, bowl held out, barefoot
  { robe: [64, 60, 54], skin: [152, 118, 88], hose: [56, 50, 44], shoe: [140, 106, 78], hunch: 0.55, ragged: true, patches: true },
  // clerk — ink-blue robe, soft cap, ledger to the chest
  { robe: [48, 54, 78], skin: [168, 132, 98], hose: [38, 34, 30], shoe: [30, 26, 22], belt: [36, 32, 24] },
  // fieldhand — moss tunic cut short, rolled sleeves, straw hat, rake
  { robe: [62, 68, 44], skin: [180, 142, 102], hose: [50, 44, 34], shoe: [34, 28, 20], hemY: 47, bareArms: true },
  // mourner — charcoal cloak and a deep hood, hands folded
  { robe: [46, 44, 48], skin: [160, 124, 94], hose: [36, 32, 32], shoe: [24, 22, 20], hunch: 0.3, ragged: true, arms: "folded" },
  // carter — oxblood coat, hood down, whip trailing
  { robe: [84, 42, 36], skin: [170, 130, 96], hose: [42, 36, 30], shoe: [30, 26, 22], belt: [48, 34, 22], patches: true },
  // patrolman — the provost's blue-grey, kettle helm, lantern swinging.
  // Crowd villagers never wear this one (see villagerVariants).
  { robe: [62, 76, 96], skin: [168, 130, 96], hose: [40, 44, 50], shoe: [30, 26, 22], belt: [46, 36, 24] },
];

function villagerRig(r: Ras, phase: number, variant: number): void {
  const st = Math.sin(phase * Math.PI * 2);
  const bob = Math.abs(Math.cos(phase * Math.PI * 2)) * -0.4;
  const d = DRESSES[variant % DRESSES.length];
  const [R, G, B] = d.robe;
  const skin = d.skin;
  const hunch = d.hunch ?? 0;
  const headY = 17 + hunch * 5 + bob;
  const shoulderY = 28 + hunch * 3 + bob;
  const hipY = 50 + bob * 0.7;
  const hemY = (d.hemY ?? 54.5) + bob;
  const sway = st * 1.5;
  const fx = 32 + sway * 0.6;

  // Legs — hose under the hem, scissoring with the stride; short hems let
  // the whole leg show.
  const footAX = 32 - st * 4.4;
  const footAY = 59.5 - Math.max(0, st) * 1.6 + bob * 0.3;
  const footBX = 32 + st * 4.4;
  const footBY = 59.5 - Math.max(0, -st) * 1.6 + bob * 0.3;
  const legTop = Math.min(hipY, hemY - 2);
  r.limb(30 - st * 0.6, legTop, footAX, footAY, 3.1, d.hose[0], d.hose[1], d.hose[2]);
  r.limb(34 + st * 0.6, legTop, footBX, footBY, 3.1, d.hose[0], d.hose[1], d.hose[2]);
  r.ellipse(footAX, footAY + 0.6, 3, 1.8, d.shoe[0], d.shoe[1], d.shoe[2]);
  r.ellipse(footBX, footBY + 0.6, 3, 1.8, d.shoe[0], d.shoe[1], d.shoe[2]);

  // Arms — hanging at the sides, swinging against the stride.
  const sleeve: [number, number, number] = [R * 0.8, G * 0.8, B * 0.8];
  const handAX = 25.5 + st * 3;
  const handBX = 38.5 - st * 3;
  const handY = 46 + bob;
  if (d.arms === "folded") {
    // Hands folded at the waist — no swing.
    r.limb(26.5 + sway * 0.4, shoulderY + 2, 30.5, 44 + bob, 3.2, sleeve[0], sleeve[1], sleeve[2]);
    r.limb(37.5 + sway * 0.4, shoulderY + 2, 33.5, 44 + bob, 3.2, sleeve[0], sleeve[1], sleeve[2]);
    r.ellipse(31, 45 + bob, 2, 2.4, skin[0], skin[1], skin[2]);
    r.ellipse(33, 45 + bob, 2, 2.4, skin[0], skin[1], skin[2]);
  } else if (d.bareArms) {
    // Rolled sleeves — cloth to the elbow, bare forearm below.
    r.limb(26.5 + sway * 0.4, shoulderY + 2, 26 + st * 1.8, 40 + bob, 3.2, sleeve[0], sleeve[1], sleeve[2]);
    r.limb(37.5 + sway * 0.4, shoulderY + 2, 38 - st * 1.8, 40 + bob, 3.2, sleeve[0], sleeve[1], sleeve[2]);
    r.limb(26 + st * 1.8, 40 + bob, handAX, handY, 2.4, skin[0] * 0.92, skin[1] * 0.92, skin[2] * 0.92);
    r.limb(38 - st * 1.8, 40 + bob, handBX, handY, 2.4, skin[0] * 0.92, skin[1] * 0.92, skin[2] * 0.92);
  } else {
    r.limb(26.5 + sway * 0.4, shoulderY + 2, handAX, handY, 3, sleeve[0], sleeve[1], sleeve[2]);
    r.limb(37.5 + sway * 0.4, shoulderY + 2, handBX, handY, 3, sleeve[0], sleeve[1], sleeve[2]);
  }

  // Robe — a trapezoid whose hem swings with the stride. Ragged cloth gets
  // a notched hem instead of a clean line.
  const hemL = 20 + sway * 0.5;
  const hemR = 44 + sway * 0.5;
  if (d.ragged) {
    r.poly(
      [
        [26.5 + sway * 0.3, shoulderY],
        [37.5 + sway * 0.3, shoulderY],
        [hemR, hemY - st * 0.6],
        [hemR - 4, hemY - 1.8 - st * 0.5],
        [hemR - 9, hemY + 0.5 - st * 0.5],
        [hemR - 15, hemY - 2.2 - st * 0.3],
        [hemL + 9, hemY + 0.7 + st * 0.4],
        [hemL + 4, hemY - 1.9 + st * 0.5],
        [hemL, hemY + st * 0.6],
      ],
      R, G, B
    );
  } else {
    r.poly(
      [
        [26.5 + sway * 0.3, shoulderY],
        [37.5 + sway * 0.3, shoulderY],
        [hemR, hemY - st * 0.6],
        [hemL, hemY + st * 0.6],
      ],
      R, G, B
    );
  }
  // Folds and the grime-dark hem band — torn cloth has no clean band.
  r.line(30 + sway * 0.4, shoulderY + 4, 28.5 + sway * 0.5, hemY - 1.5, 0.8, R * 0.8, G * 0.8, B * 0.8);
  r.line(34 + sway * 0.4, shoulderY + 4, 35.5 + sway * 0.5, hemY - 1.5, 0.8, R * 0.8, G * 0.8, B * 0.8);
  if (!d.ragged) {
    r.line(hemL + 2, hemY - 1 + st * 0.4, hemR - 2, hemY - 1 - st * 0.4, 1.4, R * 0.6, G * 0.6, B * 0.6);
  }
  // Mended squares — a servant's cloak is more patch than cloth.
  if (d.patches) {
    r.rect(29 + sway * 0.4, 46 + bob, 32.5 + sway * 0.4, 49.5 + bob, R * 0.72, G * 0.72, B * 0.78);
    r.rect(35.5 + sway * 0.4, 37 + bob, 37.5 + sway * 0.4, 40 + bob, R * 0.62, G * 0.62, B * 0.68);
  }
  if (d.belt) {
    r.rect(26 + sway * 0.4, 43 + bob, 38 + sway * 0.4, 45 + bob, d.belt[0], d.belt[1], d.belt[2]);
    r.px(31.5 + sway * 0.4, 44 + bob, d.belt[0] * 1.5, d.belt[1] * 1.5, d.belt[2] * 1.5); // the knot
  }

  // Hands after the robe so they read on the silhouette (folded arms draw
  // their own).
  if (d.arms !== "folded") {
    r.ellipse(handAX, handY + 1, 2, 2.4, skin[0], skin[1], skin[2]);
    r.ellipse(handBX, handY + 1, 2, 2.4, skin[0], skin[1], skin[2]);
  }

  // Neck and head — brow shadow, eyes, a nose, a mouth line. A face, not
  // a blob.
  r.rect(30 + sway * 0.5, headY + 4, 34 + sway * 0.5, headY + 8, skin[0] * 0.55, skin[1] * 0.55, skin[2] * 0.55);
  r.ellipse(fx, headY, 4.8, 5.8, skin[0], skin[1], skin[2]);
  r.rect(fx - 3, headY - 2, fx + 3, headY - 1, skin[0] * 0.72, skin[1] * 0.72, skin[2] * 0.72);
  r.px(fx - 2, headY, 26, 20, 16);
  r.px(fx + 2, headY, 26, 20, 16);
  r.px(fx, headY + 1.5, skin[0] * 0.7, skin[1] * 0.7, skin[2] * 0.7);
  r.rect(fx - 1, headY + 3.5, fx + 1, headY + 3.5, skin[0] * 0.55, skin[1] * 0.55, skin[2] * 0.55);

  // The dressing — headgear and whatever they're carrying.
  switch (variant) {
    case 0: {
      // Hooded pilgrim — a peaked hood, face sunk in shadow, a shoulder
      // cloak and the traveller's satchel.
      r.poly(
        [
          [fx - 6.6, headY + 3],
          [fx - 6.2, headY - 4],
          [fx, headY - 9.5],
          [fx + 6.2, headY - 4],
          [fx + 6.6, headY + 3],
        ],
        R * 0.62, G * 0.62, B * 0.62
      );
      r.ellipse(fx, headY + 0.5, 3.8, 4.4, skin[0] * 0.5, skin[1] * 0.5, skin[2] * 0.5); // hood-shadow face
      r.px(fx - 1.5, headY, 20, 16, 12);
      r.px(fx + 1.5, headY, 20, 16, 12);
      r.poly(
        [
          [24 + sway * 0.3, shoulderY - 0.5],
          [40 + sway * 0.3, shoulderY - 0.5],
          [43 + sway * 0.5, 41 + bob],
          [21 + sway * 0.5, 41 + bob],
        ],
        R * 0.82, G * 0.82, B * 0.82
      );
      r.line(28, 32 + bob, 41, 46 + bob, 0.9, 46, 34, 20); // satchel strap
      r.rect(38, 46 + bob, 42, 51 + bob, 70, 48, 30);
      break;
    }
    case 1: {
      // Housewife — bone kerchief knotted at the crown, linen apron, a
      // basket hung on the arm.
      r.ellipse(fx, headY - 4, 6.3, 5, 190, 178, 158);
      r.px(fx + 4, headY - 6, 190, 178, 158); // the knot's tail
      r.poly(
        [
          [27 + sway * 0.4, 41 + bob],
          [37 + sway * 0.4, 41 + bob],
          [39 + sway * 0.5, hemY - 2],
          [25 + sway * 0.5, hemY - 2],
        ],
        176, 166, 146
      );
      r.rect(22, 42 + bob, 28, 48 + bob, 96, 72, 40); // the basket
      r.line(24, 42 + bob, 30, 36 + bob, 1, 76, 56, 30);
      break;
    }
    case 2: {
      // Tradesman — flat cap and brim, a cloth bundle under one arm.
      r.rect(fx - 6, headY - 5, fx + 6, headY - 2, 44, 34, 24);
      r.rect(fx - 7, headY - 2, fx + 7, headY - 1, 34, 26, 18); // the brim
      r.ellipse(40, 42 + bob, 4, 5, 118, 96, 64); // cloth bundle
      break;
    }
    case 3: {
      // Beggar — a rag of a shawl, gaunter face, the bowl held out ahead.
      r.ellipse(fx, headY - 1, 7, 6.5, 56, 52, 46);
      r.line(fx - 6, headY - 1, 25, 34 + bob, 1.6, 56, 52, 46); // shawl tails
      r.line(fx + 6, headY - 1, 39, 34 + bob, 1.6, 56, 52, 46);
      r.rect(fx - 3, headY + 1, fx + 3, headY + 6, skin[0] * 0.82, skin[1] * 0.82, skin[2] * 0.82); // gaunter
      r.ellipse(41, 47 + bob, 3.5, 2.5, 90, 78, 58); // the begging bowl
      break;
    }
    case 4: {
      // Clerk — soft round cap, a ledger held to the chest, a quill behind
      // the ear.
      r.ellipse(fx, headY - 4, 6, 4.5, 40, 36, 30);
      r.rect(27, 38 + bob, 33, 45 + bob, 96, 80, 52); // the ledger
      r.line(27, 38 + bob, 27, 45 + bob, 0.8, 60, 48, 32); // its spine
      r.line(fx + 4, headY - 4, fx + 6, headY - 7, 0.6, 190, 184, 170); // quill
      break;
    }
    case 5: {
      // Fieldhand — straw hat over the brow, a rake on the shoulder.
      r.ellipse(fx, headY - 3, 8.2, 2.2, 142, 118, 66); // the brim
      r.ellipse(fx, headY - 6, 4.6, 3.4, 128, 106, 58); // the crown
      r.line(fx - 4.6, headY - 4, fx + 4.6, headY - 4, 0.7, 96, 80, 46); // hat band
      r.line(40, 30 + bob, 46, 12 + bob, 1.4, 96, 70, 42); // rake shaft
      for (let i = 0; i < 4; i++) r.line(43.5 + i * 1.4, 15 + bob, 44.5 + i * 1.4, 12 + bob, 0.7, 96, 70, 42);
      break;
    }
    case 6: {
      // Mourner — a deep hood that swallows the face; only the eyes hint
      // there's anyone inside.
      r.poly(
        [
          [fx - 7, headY + 4],
          [fx - 6.4, headY - 5],
          [fx, headY - 10],
          [fx + 6.4, headY - 5],
          [fx + 7, headY + 4],
        ],
        R * 0.55, G * 0.55, B * 0.6
      );
      r.ellipse(fx, headY, 4.4, 5, 18, 16, 18); // the dark inside the hood
      r.px(fx - 1.5, headY - 0.5, skin[0] * 0.55, skin[1] * 0.55, skin[2] * 0.55);
      r.px(fx + 1.5, headY - 0.5, skin[0] * 0.55, skin[1] * 0.55, skin[2] * 0.55);
      // The cloak sweeps past the shoulders.
      r.poly(
        [
          [23 + sway * 0.3, shoulderY - 0.5],
          [41 + sway * 0.3, shoulderY - 0.5],
          [44 + sway * 0.5, 44 + bob],
          [20 + sway * 0.5, 44 + bob],
        ],
        R * 0.8, G * 0.8, B * 0.85
      );
      break;
    }
    default: {
      // Carter — the hood down and bunched behind the shoulders, a stubble
      // jaw, the whip trailing from his hand.
      r.ellipse(fx - 6, shoulderY - 2 + bob, 3.5, 3, R * 0.6, G * 0.6, B * 0.6);
      r.ellipse(fx + 6, shoulderY - 2 + bob, 3.5, 3, R * 0.6, G * 0.6, B * 0.6);
      r.rect(fx - 2.5, headY + 3, fx + 2.5, headY + 5, skin[0] * 0.66, skin[1] * 0.62, skin[2] * 0.6); // stubble
      r.line(handBX, handY + 1, 46 + st * 2, 58 + bob, 0.8, 40, 30, 20); // the whip
      break;
    }
    case 8: {
      // Patrolman — kettle helm and mail coif over the face, brass badge,
      // the halberd shouldered, and the lantern swinging with his stride.
      // Mail first, then the face set into its opening.
      r.ellipse(fx, headY + 3, 6, 6.5, 96, 100, 108);
      r.rect(fx - 5, headY + 5, fx + 5, headY + 10, 96, 100, 108);
      r.rect(fx - 2.6, headY + 5, fx + 2.6, headY + 9.5, skin[0] * 0.8, skin[1] * 0.8, skin[2] * 0.8);
      r.px(fx - 1.6, headY + 7, 26, 20, 16);
      r.px(fx + 1.6, headY + 7, 26, 20, 16);
      // Kettle helm — wide brim, domed crown, ridged.
      r.ellipse(fx, headY - 3, 9.5, 3, 104, 108, 116);
      r.ellipse(fx, headY - 5.5, 5.5, 4.5, 116, 120, 128);
      r.px(fx, headY - 9, 140, 144, 152);
      // Brass badge on the tabard.
      r.ellipse(32 + sway * 0.5, 36 + bob, 2.4, 2.8, 190, 160, 80);
      r.px(32 + sway * 0.5, 36 + bob, 230, 200, 120);
      // Halberd sloped back over the shoulder.
      r.line(handBX, handY + bob, 34 - st * 2, 7 + bob, 1.6, 90, 64, 36); // shaft
      r.rect(32.5 - st * 2, 4 + bob, 36.5 - st * 2, 10 + bob, 170, 174, 182); // axe head
      r.line(34.5 - st * 2, 0.5 + bob, 34.5 - st * 2, 4 + bob, 1.6, 185, 189, 197); // spike
      // The lantern — dangling from the swinging hand, always lit. By day
      // it reads as glass and brass; at night its own light pool catches it.
      const lx = handAX - 1 + st * 1.2;
      const ly = handY + 7 + Math.abs(st) * 0.8;
      r.line(handAX, handY + bob, lx, ly - 3.5, 0.7, 40, 38, 44); // the cord
      r.rect(lx - 2.6, ly - 3, lx + 2.6, ly + 3, 44, 42, 48); // the cage
      r.rect(lx - 1.6, ly - 2, lx + 1.6, ly + 2, 240, 190, 100); // the panes
      r.px(lx, ly - 0.5, 255, 224, 150);
      r.line(lx - 2.6, ly - 3, lx - 2.6, ly + 3, 0.5, 30, 28, 34); // cage bars
      r.line(lx + 2.6, ly - 3, lx + 2.6, ly + 3, 0.5, 30, 28, 34);
      break;
    }
  }
}

// A villager frame — `phase` 0..1 across the walk cycle.
function villagerFrame(phase: number, variant: number): SpriteTex {
  const r = new Ras();
  villagerRig(r, phase, variant);
  return finish(r.down());
}

const WALK_PHASES = [0, 0.25, 0.5, 0.75];

// ---------------------------------------------------------------------------
// A standing figure — shared anatomy for the named NPCs. `p` is a slow idle
// phase: a breath, not a stride. Each named NPC is this body plus a strong
// identifying silhouette drawn on top.
function standRig(r: Ras, p: number, d: Dress): void {
  const bob = Math.sin(p * Math.PI * 2) * 0.3;
  const hunch = d.hunch ?? 0;
  const [R, G, B] = d.robe;
  const skin = d.skin;
  const headY = 16.5 + hunch * 5 + bob * 0.5;
  const shoulderY = 27.5 + hunch * 3 + bob * 0.5;
  const hipY = 49.5;
  const hemY = (d.hemY ?? 55) + bob * 0.3;
  const fx = 32;

  // Legs planted, hose under the hem.
  const legTop = Math.min(hipY, hemY - 2);
  r.limb(30, legTop, 29.5, 59.5, 3.1, d.hose[0], d.hose[1], d.hose[2]);
  r.limb(34, legTop, 34.5, 59.5, 3.1, d.hose[0], d.hose[1], d.hose[2]);
  r.ellipse(29.5, 60, 3.4, 1.9, d.shoe[0], d.shoe[1], d.shoe[2]);
  r.ellipse(34.5, 60, 3.4, 1.9, d.shoe[0], d.shoe[1], d.shoe[2]);

  // Arms — sleeves drawn now, hands held for after the robe so they read
  // on the silhouette.
  const sleeve: [number, number, number] = [R * 0.8, G * 0.8, B * 0.8];
  const hands: [number, number][] = [];
  if (d.arms === "folded") {
    r.limb(26.5, shoulderY + 2, 30.5, 44 + bob, 3.2, sleeve[0], sleeve[1], sleeve[2]);
    r.limb(37.5, shoulderY + 2, 33.5, 44 + bob, 3.2, sleeve[0], sleeve[1], sleeve[2]);
    hands.push([31, 45 + bob], [33, 45 + bob]);
  } else if (d.arms === "heldR") {
    // Left arm hangs; the right bends up to grip at shoulder height.
    r.limb(26.5, shoulderY + 2, 25.5, 46 + bob, 3, sleeve[0], sleeve[1], sleeve[2]);
    r.limb(37.5, shoulderY + 2, 40.5, 38 + bob, 3, sleeve[0], sleeve[1], sleeve[2]);
    r.limb(40.5, 38 + bob, 41.5, 32 + bob, 2.4, skin[0] * 0.92, skin[1] * 0.92, skin[2] * 0.92);
    hands.push([25.5, 47 + bob], [41.5, 31.5 + bob]);
  } else if (d.arms === "hug") {
    // Hugging oneself — arms crossed over the chest.
    r.limb(26.5, shoulderY + 2, 35, 42 + bob, 2.8, sleeve[0], sleeve[1], sleeve[2]);
    r.limb(37.5, shoulderY + 2, 29, 44 + bob, 2.8, sleeve[0], sleeve[1], sleeve[2]);
    hands.push([35.5, 42.5 + bob], [28.5, 44.5 + bob]);
  } else if (d.bareArms) {
    r.limb(26.5, shoulderY + 2, 26, 40 + bob, 3.2, sleeve[0], sleeve[1], sleeve[2]);
    r.limb(37.5, shoulderY + 2, 38, 40 + bob, 3.2, sleeve[0], sleeve[1], sleeve[2]);
    r.limb(26, 40 + bob, 25.5, 46 + bob, 2.4, skin[0] * 0.92, skin[1] * 0.92, skin[2] * 0.92);
    r.limb(38, 40 + bob, 38.5, 46 + bob, 2.4, skin[0] * 0.92, skin[1] * 0.92, skin[2] * 0.92);
    hands.push([25.5, 47 + bob], [38.5, 47 + bob]);
  } else {
    r.limb(26.5, shoulderY + 2, 25.5, 46 + bob, 3, sleeve[0], sleeve[1], sleeve[2]);
    r.limb(37.5, shoulderY + 2, 38.5, 46 + bob, 3, sleeve[0], sleeve[1], sleeve[2]);
    hands.push([25.5, 47 + bob], [38.5, 47 + bob]);
  }

  // Robe — a settled trapezoid, ragged hems notched.
  const hemL = 20.5;
  const hemR = 43.5;
  if (d.ragged) {
    r.poly(
      [
        [26.5, shoulderY],
        [37.5, shoulderY],
        [hemR, hemY],
        [hemR - 4, hemY - 1.8],
        [hemR - 9, hemY + 0.5],
        [hemR - 15, hemY - 2.2],
        [hemL + 9, hemY + 0.6],
        [hemL + 4, hemY - 1.9],
        [hemL, hemY],
      ],
      R, G, B
    );
  } else {
    r.poly([[26.5, shoulderY], [37.5, shoulderY], [hemR, hemY], [hemL, hemY]], R, G, B);
  }
  r.line(30, shoulderY + 4, 28.5, hemY - 1.5, 0.8, R * 0.8, G * 0.8, B * 0.8);
  r.line(34, shoulderY + 4, 35.5, hemY - 1.5, 0.8, R * 0.8, G * 0.8, B * 0.8);
  if (!d.ragged) r.line(hemL + 2, hemY - 1, hemR - 2, hemY - 1, 1.4, R * 0.6, G * 0.6, B * 0.6);
  if (d.patches) {
    r.rect(29, 46 + bob, 32.5, 49.5 + bob, R * 0.72, G * 0.72, B * 0.78);
    r.rect(35.5, 37 + bob, 37.5, 40 + bob, R * 0.62, G * 0.62, B * 0.68);
  }
  if (d.belt) {
    r.rect(26, 43 + bob, 38, 45 + bob, d.belt[0], d.belt[1], d.belt[2]);
    r.px(31.5, 44 + bob, d.belt[0] * 1.5, d.belt[1] * 1.5, d.belt[2] * 1.5);
  }

  // Hands — over the robe, on the silhouette.
  for (const [hx, hy] of hands) r.ellipse(hx, hy, 2, 2.4, skin[0], skin[1], skin[2]);

  // Neck and head — the same real face the crowd wears.
  r.rect(30, headY + 4, 34, headY + 8, skin[0] * 0.55, skin[1] * 0.55, skin[2] * 0.55);
  r.ellipse(fx, headY, 4.8, 5.8, skin[0], skin[1], skin[2]);
  r.rect(fx - 3, headY - 2, fx + 3, headY - 1, skin[0] * 0.72, skin[1] * 0.72, skin[2] * 0.72);
  r.px(fx - 2, headY, 26, 20, 16);
  r.px(fx + 2, headY, 26, 20, 16);
  r.px(fx, headY + 1.5, skin[0] * 0.7, skin[1] * 0.7, skin[2] * 0.7);
  r.rect(fx - 1, headY + 3.5, fx + 1, headY + 3.5, skin[0] * 0.55, skin[1] * 0.55, skin[2] * 0.55);
}

// Named NPCs idle — two breathing frames each.
const IDLE_PHASES = [0, 0.5];
function standFrame(p: number, d: Dress, dress: (r: Ras, p: number, fx: number, headY: number, shoulderY: number, hemY: number) => void): SpriteTex {
  const r = new Ras();
  standRig(r, p, d);
  const bob = Math.sin(p * Math.PI * 2) * 0.3;
  dress(r, p, 32, 16.5 + (d.hunch ?? 0) * 5 + bob * 0.5, 27.5 + (d.hunch ?? 0) * 3 + bob * 0.5, (d.hemY ?? 55) + bob * 0.3);
  return finish(r.down());
}

// Sister Marguerite — dark habit, the white wimple that makes her the
// brightest head in the quarter, hands folded. Unmistakable at distance.
const NUN: Dress = { robe: [44, 42, 54], skin: [170, 132, 98], hose: [40, 38, 46], shoe: [26, 24, 30], arms: "folded" };
function nunFrame(p: number): SpriteTex {
  return standFrame(p, NUN, (r, _p, fx, headY, shoulderY) => {
    // Scapular — a darker panel down the front of the habit.
    r.poly([[29, shoulderY + 5], [35, shoulderY + 5], [36, 55], [28, 55]], 36, 34, 44);
    // White wimple framing the face, drawn over the head.
    r.ellipse(fx, headY - 1, 7.4, 7.8, 212, 206, 190);
    r.rect(fx - 3.4, headY - 2.5, fx + 3.4, headY + 5.5, 170, 132, 98); // the face in its opening
    r.px(fx - 2, headY + 0.5, 26, 20, 16);
    r.px(fx + 2, headY + 0.5, 26, 20, 16);
    r.rect(fx - 1, headY + 3.5, fx + 1, headY + 3.5, 110, 82, 60);
    // Dark veil over the crown, falling past the shoulders.
    r.poly([[fx - 8, headY - 1.5], [fx, headY - 9.5], [fx + 8, headY - 1.5]], 38, 36, 46);
    r.line(fx - 8, headY - 1.5, fx - 9.5, headY + 14, 2, 38, 36, 46);
    r.line(fx + 8, headY - 1.5, fx + 9.5, headY + 14, 2, 38, 36, 46);
  });
}

// Maître Aubert — olive robe, a full grey beard, the wide flat cap of an
// apothecary, his satchel of physick slung over one shoulder.
const AUBERT: Dress = { robe: [78, 66, 40], skin: [170, 132, 96], hose: [46, 40, 30], shoe: [28, 24, 20], belt: [52, 38, 24] };
function aubertFrame(p: number): SpriteTex {
  return standFrame(p, AUBERT, (r, _p, fx, headY, shoulderY) => {
    const bob = Math.sin(p * Math.PI * 2) * 0.3;
    // Satchel on a shoulder strap, worn on the hip.
    r.line(27, shoulderY + 3, 40, 45 + bob, 1, 46, 34, 20);
    r.rect(38, 44 + bob, 43, 51 + bob, 74, 52, 32);
    r.rect(38, 44 + bob, 43, 45.5 + bob, 88, 64, 40);
    // The beard — grey, full, covering the jaw.
    r.ellipse(fx, headY + 5, 4.6, 3.8, 138, 118, 92);
    r.px(fx - 1.5, headY + 3.5, 112, 94, 72); // moustache
    r.px(fx + 1.5, headY + 3.5, 112, 94, 72);
    // The apothecary's cap — broad and flat, wider than his head.
    r.ellipse(fx, headY - 5.5, 8.6, 3, 52, 42, 30);
    r.ellipse(fx, headY - 7, 5, 2.6, 58, 48, 34);
    r.px(fx, headY - 8.5, 44, 36, 26);
  });
}

// Foulques the gravedigger — drab and broad, soil-stained apron, a spade
// carried over the shoulder like a man who never puts it down.
const DIGGER: Dress = { robe: [62, 52, 38], skin: [176, 136, 98], hose: [44, 38, 30], shoe: [28, 24, 18], belt: [44, 34, 22], arms: "heldR" };
function diggerFrame(p: number): SpriteTex {
  return standFrame(p, DIGGER, (r, _p, fx, headY) => {
    const bob = Math.sin(p * Math.PI * 2) * 0.3;
    // Soil-stained apron, darker where he wipes his hands.
    r.poly([[27, 35 + bob], [37, 35 + bob], [38, 56], [26, 56]], 50, 41, 31);
    r.rect(27, 35 + bob, 37, 37 + bob, 42, 34, 26);
    r.px(30, 48, 38, 30, 24); // a grave's worth of dirt
    r.px(34, 52, 36, 28, 22);
    // Flat field cap, greying beard.
    r.rect(fx - 6, headY - 5, fx + 6, headY - 1.5, 40, 34, 26);
    r.rect(fx - 7, headY - 1.5, fx + 7, headY - 0.5, 30, 25, 20); // brim shadow
    r.ellipse(fx, headY + 5, 4.4, 3.4, 120, 100, 76);
    // The spade — shaft over the shoulder, blade catching light behind him.
    r.line(41.5, 31.5 + bob, 45, 8 + bob * 0.5, 1.8, 96, 70, 42);
    r.rect(42, 4 + bob * 0.5, 48, 11 + bob * 0.5, 104, 108, 114); // blade
    r.px(43, 6.5 + bob * 0.5, 150, 154, 160); // worn edge
  });
}

// Widow Lambert — black mourning veil over the face, grey bun pinned up.
const WIDOW: Dress = { robe: [56, 44, 50], skin: [162, 126, 96], hose: [38, 34, 36], shoe: [26, 24, 24], belt: [40, 34, 38] };
function widowFrame(p: number): SpriteTex {
  return standFrame(p, WIDOW, (r, _p, fx, headY, shoulderY) => {
    const bob = Math.sin(p * Math.PI * 2) * 0.3;
    // Mourning shawl across the shoulders, tails hanging forward.
    r.poly([[23, shoulderY], [41, shoulderY], [39, shoulderY + 6], [25, shoulderY + 6]], 38, 32, 40);
    r.line(25, shoulderY + 5, 26.5, 44 + bob, 2, 38, 32, 40);
    r.line(39, shoulderY + 5, 37.5, 44 + bob, 2, 38, 32, 40);
    // The veil — sheer black over the face, hanging to the collar.
    r.ellipse(fx, headY - 2, 6.6, 5.4, 34, 30, 38); // crown of the veil
    r.rect(fx - 5.5, headY - 1, fx + 5.5, headY + 9, 30, 26, 34); // the fall of it
    r.rect(fx - 3, headY + 0.5, fx + 3, headY + 6, 81, 63, 48); // face, dimmed through the veil
    r.px(fx - 1.5, headY + 2, 20, 16, 14);
    r.px(fx + 1.5, headY + 2, 20, 16, 14);
    // Grey bun pinned high.
    r.ellipse(fx, headY - 7.5, 3, 2.6, 104, 98, 94);
    r.px(fx - 0.5, headY - 8.5, 140, 134, 130); // pin glint
  });
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

// Mistress Hélène, the innkeeper — russet dress, a clean white apron bib
// to hem, kerchief, a tankard never far from her hand.
const INNKEEP: Dress = { robe: [96, 52, 40], skin: [172, 134, 98], hose: [52, 44, 36], shoe: [32, 26, 20], belt: [60, 40, 28] };
function innkeepFrame(p: number): SpriteTex {
  return standFrame(p, INNKEEP, (r, _p, fx, headY, _sy, hemY) => {
    const bob = Math.sin(p * Math.PI * 2) * 0.3;
    // The apron — bib to hem, pale against the russet, strings tied out.
    r.poly([[28, 33 + bob], [36, 33 + bob], [39, hemY - 1], [25, hemY - 1]], 190, 180, 160);
    r.rect(28, 33 + bob, 36, 35 + bob, 168, 158, 138); // bib seam
    r.line(27, 45 + bob, 22.5, 47.5 + bob, 0.9, 190, 180, 160); // strings
    r.line(37, 45 + bob, 41.5, 47.5 + bob, 0.9, 190, 180, 160);
    r.px(30, 50, 172, 162, 144); // a mended patch
    // Kerchief over the hair, knotted at the side.
    r.ellipse(fx, headY - 3.5, 7.4, 4.6, 210, 204, 190);
    r.px(fx + 7, headY - 4, 210, 204, 190);
    r.px(fx + 8, headY - 1.5, 200, 194, 180);
    // The tankard in her right hand — tin, with a handle.
    r.rect(37, 44 + bob, 41, 49 + bob, 128, 122, 110);
    r.rect(37, 44 + bob, 41, 45.5 + bob, 150, 144, 130); // rim
    r.line(41, 45 + bob, 43, 47 + bob, 0.8, 118, 112, 100); // handle
  });
}

// Baker Colin — flour-dusted apron over rolled sleeves, the pale round
// cap, a peel paddle in hand. You can smell the ovens off him.
const BAKER: Dress = { robe: [92, 78, 60], skin: [178, 140, 104], hose: [50, 44, 34], shoe: [30, 26, 22], belt: [64, 48, 32], arms: "heldR" };
function bakerFrame(p: number): SpriteTex {
  return standFrame(p, BAKER, (r, _p, fx, headY, _sy, hemY) => {
    const bob = Math.sin(p * Math.PI * 2) * 0.3;
    // Flour apron — pale, dusted white in patches.
    r.poly([[27, 34 + bob], [37, 34 + bob], [38, hemY - 1], [26, hemY - 1]], 202, 196, 180);
    r.px(29, 40, 228, 224, 212);
    r.px(35, 47, 228, 224, 212);
    r.px(31, 52, 228, 224, 212);
    r.px(33.5, 38, 220, 216, 204);
    // Round baker's cap — the puff of it above the brow.
    r.ellipse(fx, headY - 4.5, 7.8, 4.4, 216, 210, 196);
    r.ellipse(fx, headY - 6.5, 5, 3, 224, 218, 206);
    // A ruddy, oven-flushed face.
    r.px(fx - 2, headY + 2, 190, 120, 90);
    r.px(fx + 2, headY + 2, 190, 120, 90);
    // The peel — a long paddle raised in his right hand.
    r.line(41.5, 31.5 + bob, 45.5, 14 + bob, 1.6, 120, 92, 56);
    r.ellipse(46.5, 11 + bob, 4, 3.4, 138, 106, 66); // the blade
    r.px(46.5, 11 + bob, 90, 68, 40); // a loaf on it
  });
}

// The alchemist — midnight robe and a high collar, wild grey hair, gaunt
// eyes with a feverish green glint, a vial of something wrong at his belt.
const ALCHEMIST: Dress = { robe: [36, 38, 52], skin: [158, 128, 98], hose: [30, 28, 34], shoe: [22, 20, 26], belt: [44, 36, 28], hunch: 0.15 };
function alchemistFrame(p: number): SpriteTex {
  return standFrame(p, ALCHEMIST, (r, _p, fx, headY) => {
    const bob = Math.sin(p * Math.PI * 2) * 0.3;
    // The high collar — a dark wing behind the head.
    r.poly(
      [
        [fx - 8.5, headY + 8],
        [fx - 7, headY - 2],
        [fx, headY - 6],
        [fx + 7, headY - 2],
        [fx + 8.5, headY + 8],
      ],
      26, 28, 40
    );
    // Wild grey hair — tufts escaping in every direction.
    r.ellipse(fx, headY - 4.5, 8, 4.6, 150, 148, 144);
    r.px(fx - 7, headY - 6, 150, 148, 144);
    r.px(fx + 7, headY - 7, 150, 148, 144);
    r.px(fx - 4.5, headY - 8.5, 140, 138, 134);
    r.px(fx + 5, headY - 9, 140, 138, 134);
    r.px(fx, headY - 10, 148, 146, 142);
    r.px(fx - 2, headY - 7.5, 160, 158, 154);
    // Gaunt face — sunken eyes with a feverish green glint.
    r.px(fx - 2, headY, 30, 22, 18);
    r.px(fx + 2, headY, 30, 22, 18);
    r.px(fx - 2, headY - 0.5, 120, 200, 130);
    r.px(fx + 2, headY - 0.5, 120, 200, 130);
    // A vial of something wrong, glowing at his belt.
    r.ellipse(39.5, 48 + bob, 5, 5.5, 70, 160, 95, 150); // its glow on the robe
    r.rect(38, 45 + bob, 41, 52 + bob, 90, 200, 120, 235);
    r.px(39, 47 + bob, 150, 255, 170);
    r.px(40, 50 + bob, 60, 160, 80);
  });
}

// A patient of the pesthouse — a pale shift hanging off him, hunched and
// hugging himself against the fever, the dark marks showing.
const PATIENT: Dress = { robe: [116, 110, 100], skin: [186, 172, 152], hose: [100, 96, 88], shoe: [168, 156, 138], hunch: 0.45, ragged: true, arms: "hug" };
function patientFrame(p: number): SpriteTex {
  return standFrame(p, PATIENT, (r, _p, fx, headY) => {
    const bob = Math.sin(p * Math.PI * 2) * 0.3;
    // Thin hair, a bandage wound around the brow.
    r.ellipse(fx, headY - 5, 5, 3, 120, 112, 104);
    r.rect(fx - 4.5, headY - 3.5, fx + 4.5, headY - 1.5, 196, 190, 172); // the wrap
    r.px(fx + 4, headY - 2.5, 170, 162, 146); // its knot
    // The dark marks of the pestilence — on the shift and the throat.
    r.px(28, 46 + bob, 72, 62, 54);
    r.px(36.5, 50 + bob, 72, 62, 54);
    r.px(31, 55 + bob, 66, 56, 48);
    r.px(fx - 2, headY + 6.5, 96, 84, 72); // on the neck
  });
}

// The grey man — all cloak and shadow, a hood with nothing inside it, the
// hem dragging the ground. The shape you tail through the dark.
const HOODED: Dress = { robe: [58, 56, 64], skin: [24, 22, 28], hose: [40, 38, 44], shoe: [30, 28, 34], hemY: 58, ragged: true };
function hoodedFrame(p: number): SpriteTex {
  return standFrame(p, HOODED, (r, _p, fx, headY, shoulderY) => {
    const bob = Math.sin(p * Math.PI * 2) * 0.3;
    // A cloak that sweeps the whole body — no arms, no hands, just cloth.
    r.poly(
      [
        [fx - 9, shoulderY - 1],
        [fx + 9, shoulderY - 1],
        [fx + 12, 57 + bob],
        [fx - 12, 57 + bob],
      ],
      52, 50, 58
    );
    r.line(fx - 8, shoulderY + 3, fx - 10, 55 + bob, 1, 44, 42, 50); // cloak folds
    r.line(fx + 8, shoulderY + 3, fx + 10, 55 + bob, 1, 44, 42, 50);
    // The deep hood — a pale grey shell, darkness inside.
    r.poly(
      [
        [fx - 7.5, headY + 4],
        [fx - 6.5, headY - 5],
        [fx, headY - 10.5],
        [fx + 6.5, headY - 5],
        [fx + 7.5, headY + 4],
      ],
      66, 64, 74
    );
    r.ellipse(fx, headY + 0.5, 4.6, 5.2, 10, 9, 12); // nothing inside
  });
}

// The herbwife — moss robes and a grey-green kerchief, a darker apron, a
// bunch of rue held up where the customer can see it.
const HERBWIFE: Dress = { robe: [58, 70, 46], skin: [172, 136, 98], hose: [44, 40, 34], shoe: [30, 26, 20], belt: [50, 40, 26], arms: "heldR" };
function herbwifeFrame(p: number): SpriteTex {
  return standFrame(p, HERBWIFE, (r, _p, fx, headY, _sy, hemY) => {
    const bob = Math.sin(p * Math.PI * 2) * 0.3;
    // Apron panel — darker moss, stained low.
    r.poly([[27, 34 + bob], [37, 34 + bob], [38, hemY - 1], [26, hemY - 1]], 62, 58, 40);
    r.rect(26, hemY - 4 + bob, 38, hemY - 1 + bob, 50, 46, 32);
    // The bunch of rue — sprigs fanned out of the raised fist.
    r.line(41.5, 31.5 + bob, 38, 23.5 + bob, 1, 84, 110, 52);
    r.line(41.5, 31.5 + bob, 42, 22.5 + bob, 1, 92, 120, 58);
    r.line(41.5, 31.5 + bob, 46, 24.5 + bob, 1, 84, 110, 52);
    r.px(38, 23 + bob, 100, 132, 64);
    r.px(42, 22 + bob, 110, 142, 70);
    r.px(46, 24 + bob, 100, 132, 64);
    // Kerchief over the hair, knotted at the side.
    r.ellipse(fx, headY - 3.5, 7.2, 4.8, 84, 94, 70);
    r.px(fx + 7, headY - 4, 84, 94, 70);
    r.px(fx + 8, headY - 1, 76, 86, 62);
  });
}

// The clothier — madder-red robe, a merchant's flat cap, a length of pale
// linen draped over his arm so it hangs in two falls.
const CLOTHIER: Dress = { robe: [88, 44, 42], skin: [174, 134, 98], hose: [44, 38, 34], shoe: [30, 26, 22], belt: [56, 40, 26] };
function clothierFrame(p: number): SpriteTex {
  return standFrame(p, CLOTHIER, (r, _p, fx, headY) => {
    const bob = Math.sin(p * Math.PI * 2) * 0.3;
    // The sample cloth over the left forearm — the stall's whole pitch.
    r.poly([[23, 36 + bob], [29, 36 + bob], [30, 50 + bob], [24, 51 + bob]], 190, 182, 158);
    r.line(26.5, 37 + bob, 27.5, 50 + bob, 0.7, 150, 142, 120); // the fold's shadow
    // Merchant's cap — soft, flat, tilted.
    r.rect(fx - 6.5, headY - 6, fx + 6.5, headY - 2.5, 52, 40, 34);
    r.rect(fx - 7.5, headY - 2.5, fx + 7.5, headY - 1.5, 42, 32, 26); // the brim
    // A purse at the belt — he's doing business.
    r.ellipse(37.5, 46 + bob, 2.4, 2.8, 60, 44, 28);
  });
}

// The costermonger — brown robe under a leather apron, flat cap, a tray of
// round loaves held out before him.
const MONGER: Dress = { robe: [78, 60, 40], skin: [176, 138, 100], hose: [46, 40, 32], shoe: [32, 26, 20], arms: "folded" };
function mongerFrame(p: number): SpriteTex {
  return standFrame(p, MONGER, (r, _p, fx, headY, _sy, hemY) => {
    const bob = Math.sin(p * Math.PI * 2) * 0.3;
    // Leather apron — a darker bib over the robe.
    r.poly([[27.5, 33 + bob], [36.5, 33 + bob], [38.5, hemY - 2], [25.5, hemY - 2]], 74, 52, 34);
    // Flat cap, a little crushed.
    r.rect(fx - 6.5, headY - 5.5, fx + 6.5, headY - 2, 52, 40, 30);
    r.rect(fx - 7.5, headY - 2, fx + 7.5, headY - 1, 42, 32, 24);
    // The tray held before him — three loaves in a wicker flat.
    r.ellipse(32, 45.5 + bob, 8.5, 3, 110, 80, 48);
    r.ellipse(28.5, 44.8 + bob, 2.6, 1.8, 168, 124, 72);
    r.ellipse(33, 44.4 + bob, 2.6, 1.8, 178, 134, 80);
    r.ellipse(36.5, 45 + bob, 2.6, 1.8, 160, 118, 68);
  });
}

// Mother Anette — the rag-and-bone woman, faded mauve under a patched
// shawl, grey bun pinned at the back. No shop; she sells gossip.
const ANETTE: Dress = { robe: [72, 60, 64], skin: [168, 130, 96], hose: [46, 42, 40], shoe: [30, 26, 22], patches: true, arms: "folded" };
function anetteFrame(p: number): SpriteTex {
  return standFrame(p, ANETTE, (r, _p, fx, headY, shoulderY) => {
    const bob = Math.sin(p * Math.PI * 2) * 0.3;
    // The shawl — a darker fall of cloth over the shoulders.
    r.poly(
      [
        [24 + 0.3, shoulderY + 1],
        [40 + 0.3, shoulderY + 1],
        [43.5, 46 + bob],
        [20.5, 46 + bob],
      ],
      58, 50, 56
    );
    // Grey hair — thin crown, a bun at the back.
    r.ellipse(fx, headY - 4.5, 6.2, 3.4, 158, 152, 144);
    r.ellipse(fx - 5.4, headY - 1.5, 2.6, 2.4, 150, 146, 140); // the bun
  });
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
  model?: string; // render as a voxel figure from tex.models, not a billboard
}

export function buildSpriteKinds(): Record<string, SpriteKind> {
  const kinds: Record<string, SpriteKind> = {
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
    nun: { frames: IDLE_PHASES.map((p) => nunFrame(p)), scale: 0.9, block: 0.18, animFps: 0.6 },
    aubert: { frames: IDLE_PHASES.map((p) => aubertFrame(p)), scale: 0.9, block: 0.18, animFps: 0.6 },
    digger: { frames: IDLE_PHASES.map((p) => diggerFrame(p)), scale: 0.9, block: 0.18, animFps: 0.6 },
    widow: { frames: IDLE_PHASES.map((p) => widowFrame(p)), scale: 0.9, block: 0.18, animFps: 0.6 },
    guard: { frames: WALK_PHASES.map((p) => guardFrame(p)), scale: 0.92, block: 0.18, animFps: 1.6 },
    innkeep: { frames: IDLE_PHASES.map((p) => innkeepFrame(p)), scale: 0.9, block: 0.18, animFps: 0.6 },
    baker: { frames: IDLE_PHASES.map((p) => bakerFrame(p)), scale: 0.9, block: 0.18, animFps: 0.6 },
    alchemist: { frames: IDLE_PHASES.map((p) => alchemistFrame(p)), scale: 0.9, block: 0.18, animFps: 0.6 },
    patient: { frames: IDLE_PHASES.map((p) => patientFrame(p)), scale: 0.85, block: 0.16, animFps: 0.6 },
    hooded: { frames: IDLE_PHASES.map((p) => hoodedFrame(p)), scale: 0.92, block: 0, animFps: 0.6 },
    // The market — vendors at their boards while the sun is up.
    herbwife: { frames: IDLE_PHASES.map((p) => herbwifeFrame(p)), scale: 0.9, block: 0.18, animFps: 0.6 },
    clothier: { frames: IDLE_PHASES.map((p) => clothierFrame(p)), scale: 0.9, block: 0.18, animFps: 0.6 },
    monger: { frames: IDLE_PHASES.map((p) => mongerFrame(p)), scale: 0.9, block: 0.18, animFps: 0.6 },
    anette: { frames: IDLE_PHASES.map((p) => anetteFrame(p)), scale: 0.9, block: 0.18, animFps: 0.6 },
    // The watch — a walking man-at-arms, lantern swinging on the stride.
    patrol: { frames: WALK_PHASES.map((p) => villagerFrame(p, 8)), scale: 0.92, block: 0.18, animFps: 2.6 },
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
  // People render as voxel figures — a silhouette from every bearing, and no
  // near-plane pop when one walks past your shoulder. The model key is the
  // kind name; villagers get theirs per-variant at spawn.
  for (const k of [
    "patrol", "guard", "shambler", "hooded",
    "nun", "aubert", "digger", "widow", "innkeep", "baker", "alchemist", "patient",
    "herbwife", "clothier", "monger", "anette",
  ]) kinds[k].model = k;
  return kinds;
}

// All villager dressings — a walk-cycle pair per variant. npcs.ts assigns
// each wanderer one of these at spawn. The patrolman dressing (index 8) is
// a guard's kit, not a citizen's — the crowd never draws it.
export function villagerVariants(): SpriteTex[][] {
  return DRESSES.slice(0, 8).map((_, v) => WALK_PHASES.map((p) => villagerFrame(p, v)));
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

// ---------------------------------------------------------------------------
// Voxel people — every person also exists as a box-built figure: legs or a
// skirt, a torso, swinging arms and a head, each face drawn flat from the
// same palettes as the billboard art. Rendered as oriented quads they keep a
// silhouette from every bearing, shade per-face like walls, and never cull
// at the near plane. `dress` wears a skirt box; `noArms` hides the arm boxes
// (folded, hugging, a cloak with nothing inside).

type RGB = [number, number, number];
type Headwear =
  | "hair" | "kerchief" | "cap" | "straw" | "hood" | "deephood"
  | "wimple" | "veil" | "helm" | "bandage" | "wild" | "bun";

interface ModelPal {
  robe: RGB; skin: RGB; hose: RGB; shoe: RGB;
  belt?: RGB; apron?: RGB; front?: RGB; shawl?: RGB;
  head?: Headwear; headCol?: RGB; hair?: RGB; beard?: RGB; eyeCol?: RGB;
  marks?: boolean; ruddy?: boolean; voidFace?: boolean; bareArms?: boolean;
  dress?: boolean; noArms?: boolean; hunch?: boolean;
}

function mt(): Texture {
  return { w: TEX_SIZE, h: TEX_SIZE, data: new Uint8Array(TEX_SIZE * TEX_SIZE * 3) };
}
function mpx(t: Texture, x: number, y: number, c: RGB): void {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= t.w || y >= t.h) return;
  const i = (y * t.w + x) * 3;
  t.data[i] = c[0]; t.data[i + 1] = c[1]; t.data[i + 2] = c[2];
}
function mrect(t: Texture, x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = Math.floor(y0); y <= Math.floor(y1); y++)
    for (let x = Math.floor(x0); x <= Math.floor(x1); x++) mpx(t, x, y, c);
}
function sh(c: RGB, f: number): RGB {
  return [c[0] * f, c[1] * f, c[2] * f];
}
// Base fill — the colour with slight grain and a darker rim on the box's side
// edges, so flat faces still read as having a little body to them.
function mfill(t: Texture, c: RGB, seed: number, rim = true): void {
  const r = rng(seed);
  for (let y = 0; y < t.h; y++) {
    for (let x = 0; x < t.w; x++) {
      const edge = rim ? Math.min(x, t.w - 1 - x) : 4;
      mpx(t, x, y, sh(c, (0.9 + r() * 0.16) * (edge < 2 ? 0.78 : 1)));
    }
  }
}

function legTex(pal: ModelPal, face: number): Texture {
  const t = mt();
  if (pal.dress === false) {
    mfill(t, pal.hose, 711 + face);
    mrect(t, 29, 6, 34, 50, sh(pal.hose, 0.55)); // the cleft between the legs
    mrect(t, 0, 52, TEX_SIZE - 1, TEX_SIZE - 1, sh(pal.shoe, 0.85));
    mrect(t, 0, 52, TEX_SIZE - 1, 54, sh(pal.shoe, 0.6)); // shoe top shadow
  } else {
    mfill(t, pal.robe, 719 + face);
    // hem — a darker band, then the ground shadow
    mrect(t, 0, 54, TEX_SIZE - 1, TEX_SIZE - 1, sh(pal.robe, 0.6));
    if (pal.marks) {
      mpx(t, 14, 40, sh(pal.robe, 0.5));
      mpx(t, 46, 34, sh(pal.robe, 0.55));
      mpx(t, 30, 46, sh(pal.robe, 0.5));
    }
  }
  return t;
}

function torsoTex(pal: ModelPal, face: number): Texture {
  const t = mt();
  mfill(t, pal.robe, 823 + face);
  const mid = TEX_SIZE >> 1;
  if (face === 0) {
    // front — collar notch, belt, apron or a hanging front panel
    mrect(t, mid - 4, 0, mid + 4, 3, sh(pal.robe, 0.55));
    if (pal.belt) mrect(t, 0, 34, TEX_SIZE - 1, 38, pal.belt);
    const panel = pal.apron ?? pal.front;
    if (panel) {
      for (let y = 10; y < 60; y++) {
        const w = 10 + (y - 10) * 0.22;
        mrect(t, mid - w, y, mid + w, y, panel);
      }
      mrect(t, mid - 8, 10, mid + 8, 14, sh(panel, 0.8));
    }
    if (pal.marks) {
      mpx(t, 22, 44, [72, 62, 54]); mpx(t, 40, 36, [72, 62, 54]);
      mpx(t, 31, 50, [66, 56, 48]); mpx(t, 26, 22, [66, 56, 48]);
    }
  } else if (face === 2) {
    if (pal.belt) mrect(t, 0, 34, TEX_SIZE - 1, 38, pal.belt);
    if (pal.shawl) mrect(t, 0, 0, TEX_SIZE - 1, 12, pal.shawl);
    else mrect(t, 0, 0, TEX_SIZE - 1, 4, sh(pal.robe, 0.8)); // shoulder shadow
  } else {
    if (pal.belt) mrect(t, 0, 34, TEX_SIZE - 1, 38, pal.belt);
    if (pal.shawl) mrect(t, 0, 0, TEX_SIZE - 1, 10, pal.shawl);
  }
  return t;
}

function armTex(pal: ModelPal): Texture {
  const t = mt();
  const sleeve = pal.bareArms ? pal.skin : pal.robe;
  mfill(t, sleeve, 937);
  if (pal.bareArms) mrect(t, 0, 0, TEX_SIZE - 1, 14, pal.robe); // rolled sleeve
  mrect(t, 0, 50, TEX_SIZE - 1, TEX_SIZE - 1, pal.skin); // the hand
  mrect(t, 0, 48, TEX_SIZE - 1, 50, sh(pal.skin, 0.7));
  return t;
}

// Headwear drawn over a head face. `face`: 0 front, 1/3 sides, 2 back.
function headwear(t: Texture, pal: ModelPal, face: number): void {
  const mid = TEX_SIZE >> 1;
  const col = pal.headCol ?? pal.robe;
  switch (pal.head ?? "hair") {
    case "hair":
      mrect(t, 0, 0, TEX_SIZE - 1, 20, pal.hair ?? [70, 56, 40]);
      if (face === 2) mrect(t, 0, 0, TEX_SIZE - 1, 34, pal.hair ?? [70, 56, 40]);
      break;
    case "kerchief":
      mrect(t, 0, 0, TEX_SIZE - 1, 24, col);
      if (face !== 0) {
        mrect(t, 0, 0, TEX_SIZE - 1, 34, col);
        mrect(t, face === 2 ? mid - 6 : 4, 30, face === 2 ? mid + 6 : 10, 42, col); // the knot
      }
      break;
    case "cap":
      mrect(t, 0, 0, TEX_SIZE - 1, 20, col);
      mrect(t, 0, 20, TEX_SIZE - 1, 26, sh(col, 0.6)); // brim
      break;
    case "straw":
      mrect(t, 0, 0, TEX_SIZE - 1, 16, col);
      mrect(t, 0, 16, TEX_SIZE - 1, 24, sh(col, 0.75));
      break;
    case "helm":
      mrect(t, 0, 0, TEX_SIZE - 1, 26, col);
      mrect(t, 0, 26, TEX_SIZE - 1, 30, sh(col, 0.55)); // brow band
      if (face === 0) mrect(t, mid - 2, 30, mid + 2, 44, sh(col, 0.8)); // nasal
      break;
    case "hood":
    case "deephood":
      if (face === 0) {
        // hood frame around the face — sides, crown, and a shadow inside
        mrect(t, 0, 0, TEX_SIZE - 1, 16, col);
        mrect(t, 0, 0, 12, TEX_SIZE - 1, col);
        mrect(t, TEX_SIZE - 13, 0, TEX_SIZE - 1, TEX_SIZE - 1, col);
        if (pal.head === "deephood")
          mrect(t, 13, 16, TEX_SIZE - 14, 40, pal.voidFace ? [8, 7, 10] : sh(pal.skin, 0.45));
      } else {
        mfill(t, col, 601 + face);
        mrect(t, 0, 30, TEX_SIZE - 1, 34, sh(col, 0.7)); // cowl fold
      }
      break;
    case "wimple":
      if (face === 0) {
        mrect(t, 0, 0, TEX_SIZE - 1, 12, col);
        mrect(t, 0, 0, 12, TEX_SIZE - 1, col);
        mrect(t, TEX_SIZE - 13, 0, TEX_SIZE - 1, TEX_SIZE - 1, col);
        mrect(t, 0, TEX_SIZE - 10, TEX_SIZE - 1, TEX_SIZE - 1, col); // under the chin
      } else {
        mfill(t, col, 613 + face);
        if (face === 2) mrect(t, 0, 0, TEX_SIZE - 1, 20, sh(pal.robe, 1.4)); // dark veil crown
      }
      break;
    case "veil":
      mfill(t, col, 631 + face); // sheer black over everything
      if (face === 2) mrect(t, mid - 6, 8, mid + 6, 18, [104, 98, 94]); // pinned bun
      break;
    case "bandage":
      mrect(t, 0, 0, TEX_SIZE - 1, 14, pal.hair ?? [120, 112, 104]);
      mrect(t, 0, 14, TEX_SIZE - 1, 24, col); // the wrap
      mpx(t, face === 2 ? mid : 6, 19, sh(col, 0.75)); // knot
      break;
    case "wild":
      mfill(t, col, 647 + face);
      if (face === 0) mrect(t, 14, 26, TEX_SIZE - 15, TEX_SIZE - 1, pal.skin); // face below the fringe
      break;
    case "bun":
      mrect(t, 0, 0, TEX_SIZE - 1, 20, col);
      if (face === 2) mrect(t, mid - 7, 14, mid + 7, 28, sh(col, 0.85)); // the bun
      break;
  }
}

function headTex(pal: ModelPal, face: number): Texture {
  const t = mt();
  const skin = pal.voidFace ? ([10, 9, 12] as RGB) : pal.skin;
  mfill(t, skin, 557 + face);
  const mid = TEX_SIZE >> 1;
  if (face === 0 && !pal.voidFace && pal.head !== "veil") {
    // brow shadow, eyes, nose, mouth
    mrect(t, 16, 26, TEX_SIZE - 17, 28, sh(skin, 0.75));
    const eye = pal.eyeCol ?? [22, 18, 14];
    mrect(t, 20, 29, 24, 33, eye);
    mrect(t, 39, 29, 43, 33, eye);
    mrect(t, mid - 1, 33, mid + 1, 38, sh(skin, 0.8)); // nose
    mrect(t, mid - 4, 42, mid + 4, 44, sh(skin, 0.55)); // mouth
    if (pal.ruddy) {
      mrect(t, 18, 36, 24, 40, [150, 92, 70]);
      mrect(t, 40, 36, 46, 40, [150, 92, 70]);
    }
    if (pal.beard) mrect(t, 16, 40, TEX_SIZE - 17, TEX_SIZE - 1, pal.beard);
    if (pal.marks) {
      mpx(t, 20, 46, [84, 70, 60]); mpx(t, 44, 40, [84, 70, 60]);
    }
  }
  if (face === 2 && pal.beard) mrect(t, 0, 40, TEX_SIZE - 1, TEX_SIZE - 1, sh(pal.beard, 0.9));
  headwear(t, pal, face);
  return t;
}

function pushTex(tex: TextureSet, t: Texture): number {
  tex.walls.push(t);
  return tex.walls.length - 1;
}

// Build the box figure for a palette — five to eight solid parts, each face
// carrying its own texture. Heights are fractions of the sprite's scale.
function buildPerson(tex: TextureSet, pal: ModelPal): ModelPart[] {
  const legF = pushTex(tex, legTex(pal, 0)), legS = pushTex(tex, legTex(pal, 1)), legB = pushTex(tex, legTex(pal, 2));
  const torF = pushTex(tex, torsoTex(pal, 0)), torS = pushTex(tex, torsoTex(pal, 1)), torB = pushTex(tex, torsoTex(pal, 2));
  const arm = pushTex(tex, armTex(pal));
  const headF = pushTex(tex, headTex(pal, 0)), headS = pushTex(tex, headTex(pal, 1)), headB = pushTex(tex, headTex(pal, 2));
  const parts: ModelPart[] = [];
  if (pal.dress === false) {
    parts.push({ ox: -0.09, oy: 0, w: 0.15, d: 0.16, z0: 0, z1: 0.5, tex: [legF, legS, legB, legS], swing: 0.1, phase: 0 });
    parts.push({ ox: 0.09, oy: 0, w: 0.15, d: 0.16, z0: 0, z1: 0.5, tex: [legF, legS, legB, legS], swing: 0.1, phase: Math.PI });
  } else {
    parts.push({ ox: 0, oy: 0, w: 0.34, d: 0.26, z0: 0, z1: 0.52, tex: [legF, legS, legB, legS] });
  }
  parts.push({ ox: 0, oy: 0, w: 0.38, d: 0.26, z0: 0.5, z1: 0.88, tex: [torF, torS, torB, torS] });
  if (!pal.noArms) {
    parts.push({ ox: -0.27, oy: 0, w: 0.1, d: 0.13, z0: 0.56, z1: 0.82, tex: [arm, arm, arm, arm], swing: 0.09, phase: Math.PI });
    parts.push({ ox: 0.27, oy: 0, w: 0.1, d: 0.13, z0: 0.56, z1: 0.82, tex: [arm, arm, arm, arm], swing: 0.09, phase: 0 });
  }
  parts.push({ ox: 0, oy: pal.hunch ? 0.06 : 0, w: 0.25, d: 0.24, z0: 0.88, z1: 1.14, tex: [headF, headS, headB, headS] });
  return parts;
}

// Headwear for the eight villager dressings — the crowd reads as strangers.
const VARIANT_MODEL: { head: Headwear; headCol?: RGB; dress?: boolean; bareArms?: boolean; noArms?: boolean }[] = [
  { head: "hood" },                                        // the pilgrim
  { head: "kerchief", headCol: [210, 204, 190] },          // the housewife
  { head: "cap", headCol: [52, 40, 30], dress: false },    // the tradesman
  { head: "kerchief", headCol: [64, 60, 54] },             // the beggar's shawl
  { head: "cap", headCol: [40, 44, 64] },                  // the clerk
  { head: "straw", headCol: [150, 124, 70], dress: false, bareArms: true }, // fieldhand
  { head: "deephood", headCol: [38, 36, 42], noArms: true }, // the mourner
  { head: "hair", headCol: undefined },                    // the carter — hood down
];

const NAMED_MODELS: Record<string, ModelPal> = {
  patrol: { robe: [62, 76, 96], skin: [168, 130, 96], hose: [40, 44, 50], shoe: [30, 26, 22], belt: [46, 36, 24], head: "helm", headCol: [118, 122, 128], dress: false },
  guard: { robe: [58, 66, 82], skin: [166, 128, 94], hose: [38, 42, 48], shoe: [28, 24, 20], belt: [44, 34, 22], head: "helm", headCol: [110, 114, 120], dress: false },
  nun: { robe: [44, 42, 54], skin: [170, 132, 98], hose: [40, 38, 46], shoe: [26, 24, 30], head: "wimple", headCol: [212, 206, 190], front: [36, 34, 44], noArms: true },
  aubert: { robe: [78, 66, 40], skin: [170, 132, 96], hose: [46, 40, 30], shoe: [28, 24, 20], belt: [52, 38, 24], head: "cap", headCol: [58, 48, 34], beard: [138, 118, 92] },
  digger: { robe: [62, 52, 38], skin: [176, 136, 98], hose: [44, 38, 30], shoe: [28, 24, 18], belt: [44, 34, 22], head: "cap", headCol: [40, 34, 26], beard: [120, 100, 76], apron: [50, 41, 31] },
  widow: { robe: [56, 44, 50], skin: [162, 126, 96], hose: [38, 34, 36], shoe: [26, 24, 24], belt: [40, 34, 38], head: "veil", headCol: [30, 26, 34], shawl: [38, 32, 40] },
  innkeep: { robe: [96, 52, 40], skin: [172, 134, 98], hose: [52, 44, 36], shoe: [32, 26, 20], belt: [60, 40, 28], head: "kerchief", headCol: [210, 204, 190], apron: [190, 180, 160] },
  baker: { robe: [92, 78, 60], skin: [178, 140, 104], hose: [50, 44, 34], shoe: [30, 26, 22], belt: [64, 48, 32], head: "cap", headCol: [216, 210, 196], apron: [202, 196, 180], ruddy: true },
  alchemist: { robe: [36, 38, 52], skin: [158, 128, 98], hose: [30, 28, 34], shoe: [22, 20, 26], belt: [44, 36, 28], head: "wild", headCol: [150, 148, 144], eyeCol: [120, 200, 130], hunch: true },
  patient: { robe: [116, 110, 100], skin: [186, 172, 152], hose: [100, 96, 88], shoe: [168, 156, 138], head: "bandage", headCol: [196, 190, 172], marks: true, hunch: true, noArms: true },
  hooded: { robe: [58, 56, 64], skin: [24, 22, 28], hose: [40, 38, 44], shoe: [30, 28, 34], head: "deephood", headCol: [66, 64, 74], voidFace: true, noArms: true },
  herbwife: { robe: [58, 70, 46], skin: [172, 136, 98], hose: [44, 40, 34], shoe: [30, 26, 20], belt: [50, 40, 26], head: "kerchief", headCol: [84, 94, 70], apron: [62, 58, 40] },
  clothier: { robe: [88, 44, 42], skin: [174, 134, 98], hose: [44, 38, 34], shoe: [30, 26, 22], belt: [56, 40, 26], head: "cap", headCol: [52, 40, 34] },
  monger: { robe: [78, 60, 40], skin: [176, 138, 100], hose: [46, 40, 32], shoe: [32, 26, 20], head: "cap", headCol: [52, 40, 30], apron: [74, 52, 34], noArms: true },
  anette: { robe: [72, 60, 64], skin: [168, 130, 96], hose: [46, 42, 40], shoe: [30, 26, 22], head: "bun", headCol: [158, 152, 144], shawl: [58, 50, 56], noArms: true },
  shambler: { robe: [34, 38, 36], skin: [96, 108, 88], hose: [40, 46, 42], shoe: [96, 108, 88], head: "hood", headCol: [27, 31, 29], marks: true, dress: false, hunch: true },
};

// Registered after buildTextures — the models append their face textures to
// the wall table and record the indices in their parts.
export function buildSpriteModels(tex: TextureSet): void {
  for (let v = 0; v < VARIANT_MODEL.length; v++) {
    const d = DRESSES[v], m = VARIANT_MODEL[v];
    tex.models[`villager${v}`] = buildPerson(tex, {
      robe: d.robe, skin: d.skin, hose: d.hose, shoe: d.shoe,
      belt: d.belt, head: m.head, headCol: m.headCol, hair: [70, 56, 40],
      dress: m.dress, bareArms: m.bareArms, noArms: m.noArms,
    });
  }
  for (const [name, pal] of Object.entries(NAMED_MODELS)) {
    tex.models[name] = buildPerson(tex, pal);
  }
}
