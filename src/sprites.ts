import { TEX_SIZE } from "./config";
import type { SpriteTex, Texture, TextureSet, ModelPart } from "./types";

// Sprite bitmaps, generated procedurally like the textures. Every sprite is a
// SPRITE_PX x SPRITE_PX RGBA bitmap; alpha < 128 is transparent.
//
// Sprite art is authored in logical 64-space — the drawing primitives scale
// coordinates by s.w / TEX_SIZE, so old sprites render unchanged as solid
// blocks while new work can place fractional coordinates for finer detail.

const SPRITE_RES = 4;                          // bitmap resolution vs TEX_SIZE
const SPRITE_PX = TEX_SIZE * SPRITE_RES;       // 256 — the sprite bitmap size

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

const OUTLINE: [number, number, number] = [14, 10, 10];
const LEVELS = 6; // tone bands

// Cel shading — quantise luminance into bands while keeping hue.
function cel(s: SpriteTex): void {
  const { w, h, data } = s;
  const step = 255 / LEVELS;
  for (let i = 0; i < w * h * 4; i += 4) {
    if (data[i + 3] < 128) continue;
    const lum = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
    if (lum < 1) continue;
    const q = Math.max(step * 0.6, Math.round(lum / step) * step);
    const f = q / lum;
    data[i] = Math.min(255, data[i] * f);
    data[i + 1] = Math.min(255, data[i + 1] * f);
    data[i + 2] = Math.min(255, data[i + 2] * f);
  }
}

// Ink — a hard outline round the silhouette and a dark line where two
// materials meet (the darker side takes the line).
function ink(s: SpriteTex): void {
  const { w, h, data } = s;
  const k = s.w / TEX_SIZE; // one logical pixel in bitmap pixels
  const mark = new Uint8Array(w * h); // 1 = silhouette outline, 2 = material edge
  const lumAt = (x: number, y: number) => { const i = (y * w + x) * 4; return data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11; };
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] >= 128;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid(x, y)) continue;
    if (!solid(x - k, y) || !solid(x + k, y) || !solid(x, y - k) || !solid(x, y + k)) { mark[y * w + x] = 1; continue; }
    const l = lumAt(x, y);
    for (const [dx, dy] of [[k, 0], [0, k], [-k, 0], [0, -k]] as const) {
      const nl = lumAt(x + dx, y + dy);
      if (nl - l > 46) { mark[y * w + x] = 2; break; } // I'm the dark side of a strong edge
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const m = mark[y * w + x]; if (!m) continue;
    const i = (y * w + x) * 4;
    if (m === 1) { data[i] = OUTLINE[0]; data[i + 1] = OUTLINE[1]; data[i + 2] = OUTLINE[2]; }
    else { data[i] *= 0.42; data[i + 1] *= 0.42; data[i + 2] *= 0.42; }
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

// The finishing pass applied to every solid sprite — volume, cel-shaded
// tone bands, ink outlines. Flame and glow sprites skip it.
function finish(s: SpriteTex): SpriteTex {
  form(s);
  cel(s);
  ink(s);
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
  // A limb shaded as a cylinder — a lit band toward the top-left light, a
  // core shadow on the far side, a rim highlight along the lit edge.
  tube(x0: number, y0: number, x1: number, y1: number, width: number, r: number, g: number, b: number): void {
    this.limb(x0, y0, x1, y1, width, r, g, b);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if (nx + ny > 0) { nx = -nx; ny = -ny; } // face the upper-left light
    const off = width * 0.3;
    const bw = width * 0.5;
    this.line(x0 + nx * off, y0 + ny * off, x1 + nx * off, y1 + ny * off, bw, r * 1.22, g * 1.22, b * 1.22);
    this.line(x0 - nx * off, y0 - ny * off, x1 - nx * off, y1 - ny * off, bw, r * 0.68, g * 0.68, b * 0.68);
    this.line(x0 + nx * off * 1.5, y0 + ny * off * 1.5, x1 + nx * off * 1.5, y1 + ny * off * 1.5, 0.4, r * 1.4, g * 1.4, b * 1.4);
  }
  // Scanline fill like poly, but lit left→dark right with vertical fold
  // ridges and a shadowed hem — draped cloth instead of a flat shape.
  shadedPoly(pts: [number, number][], r: number, g: number, b: number, folds = 3, seed = 0): void {
    const s = this.tex;
    const K = s.w / TEX_SIZE;
    const P = pts.map(([x, y]) => [x * K, y * K]);
    const yMin = Math.floor(Math.min(...P.map((p) => p[1])));
    const yMax = Math.ceil(Math.max(...P.map((p) => p[1])));
    const hemLine = yMin + (yMax - yMin) * 0.88;
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
        const xL = xs[i];
        const xR = xs[i + 1];
        const w = Math.max(1, xR - xL);
        for (let x = Math.ceil(xL); x <= Math.floor(xR); x++) {
          const t = (x - xL) / w;
          let shade = 1.06 - 0.28 * t + Math.sin(((x - xL) * folds * Math.PI) / w + seed) * 0.07;
          if (y > hemLine) shade *= 0.8;
          rawPx(s, x, y, r * shade, g * shade, b * shade);
        }
      }
    }
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

// Sallow skin — the quarter's diet and dread washed out of the flesh:
// desaturated toward wax, darkened, cooled. Applied everywhere a Dress
// hands out skin so every citizen carries the same pallor.
function wan(c: [number, number, number]): [number, number, number] {
  const l = (c[0] + c[1] + c[2]) / 3;
  return [(c[0] * 0.8 + l * 0.2) * 1.0, (c[1] * 0.8 + l * 0.2) * 0.98, (c[2] * 0.8 + l * 0.2) * 0.96];
}

// Somber cloth — dyestuff cut with grey: hue kept so robes stay
// identifiable, saturation and value both dragged down.
function dour(c: [number, number, number]): [number, number, number] {
  const l = (c[0] + c[1] + c[2]) / 3;
  const cl = (v: number) => Math.min(255, Math.max(0, (l + (v - l) * 1.3) * 0.9));
  return [cl(c[0]), cl(c[1]), cl(c[2])];
}

// The quarter's face — a narrower skull, the brow sunk in shadow, eyes
// dark sockets, a downturned line of a mouth. Worn, not cute.
function faceR(
  r: Ras, fx: number, headY: number, skin: [number, number, number],
  beard = false, hair: [number, number, number] | null = null
): void {
  r.ellipse(fx, headY, 3.4, 4.3, skin[0], skin[1], skin[2]);
  // Ears — pinned to the skull sides.
  r.ellipse(fx - 3.5, headY + 0.3, 0.7, 1.1, skin[0] * 0.9, skin[1] * 0.9, skin[2] * 0.9);
  r.ellipse(fx + 3.5, headY + 0.3, 0.7, 1.1, skin[0] * 0.9, skin[1] * 0.9, skin[2] * 0.9);
  // Brow shadow — lit forehead above it.
  r.ellipse(fx, headY - 1.4, 3.0, 1.6, skin[0] * 0.85, skin[1] * 0.85, skin[2] * 0.85);
  r.px(fx - 1.2, headY - 2.4, skin[0] * 1.12, skin[1] * 1.12, skin[2] * 1.12);
  // Brows — strokes angled down toward the nose.
  r.line(fx - 2.4, headY - 1.3, fx - 0.9, headY - 1.0, 0.45, skin[0] * 0.45, skin[1] * 0.45, skin[2] * 0.45);
  r.line(fx + 2.4, headY - 1.3, fx + 0.9, headY - 1.0, 0.45, skin[0] * 0.45, skin[1] * 0.45, skin[2] * 0.45);
  // Eyes — one dark pixel each.
  r.px(fx - 1.5, headY - 0.2, skin[0] * 0.3, skin[1] * 0.3, skin[2] * 0.3);
  r.px(fx + 1.5, headY - 0.2, skin[0] * 0.3, skin[1] * 0.3, skin[2] * 0.3);
  // Nose — lit ridge, shadowed base.
  r.line(fx, headY - 0.8, fx, headY + 1.0, 0.45, skin[0] * 1.08, skin[1] * 1.08, skin[2] * 1.08);
  r.px(fx + 0.5, headY + 1.2, skin[0] * 0.65, skin[1] * 0.65, skin[2] * 0.65);
  // Mouth and jaw shadow.
  r.line(fx - 0.9, headY + 2.3, fx + 0.9, headY + 2.3, 0.45, skin[0] * 0.5, skin[1] * 0.5, skin[2] * 0.5);
  r.rect(fx - 1.8, headY + 3.0, fx + 1.8, headY + 3.8, skin[0] * 0.8, skin[1] * 0.8, skin[2] * 0.8);
  if (beard) {
    const bc = hair ?? [skin[0] * 0.55, skin[1] * 0.52, skin[2] * 0.5];
    r.ellipse(fx, headY + 2.6, 2.6, 1.9, bc[0] * 0.9, bc[1] * 0.9, bc[2] * 0.9);
    r.line(fx - 0.9, headY + 2.3, fx + 0.9, headY + 2.3, 0.45, skin[0] * 0.5, skin[1] * 0.5, skin[2] * 0.5);
  }
}

// Hair, drawn in two passes around the face: `hairR` lays the cap and
// falls behind the skull so the face ellipse cuts their lower edge;
// `hairFrontR` then lays the fringe over the brow, with strand lines and
// a couple of top-left highlights.
type HairStyle = "crop" | "shoulder" | "bald" | "bun";
const HAIR_COLORS: [number, number, number][] = [
  [38, 30, 24],    // black
  [62, 44, 30],    // dark brown
  [90, 70, 44],    // brown
  [110, 104, 96],  // iron grey
  [150, 146, 138], // white-grey
];

function hairR(r: Ras, fx: number, headY: number, shoulderY: number, style: HairStyle | undefined, color: [number, number, number] | undefined, scale = 1): void {
  if (!style || !color) return;
  const [hr, hg, hb] = color;
  const S = scale;
  if (style === "bald") {
    // Just a fringe ring at the back — bare crown, tufts at the sides.
    r.ellipse(fx - 3.8 * S, headY + 1.4 * S, 1.4 * S, 2 * S, hr, hg, hb);
    r.ellipse(fx + 3.8 * S, headY + 1.4 * S, 1.4 * S, 2 * S, hr, hg, hb);
    r.ellipse(fx, headY - 3.6 * S, 4.2 * S, 1.6 * S, hr * 0.9, hg * 0.9, hb * 0.9);
    return;
  }
  // The cap — over the top of the skull, cut by the face drawn after it.
  r.ellipse(fx, headY - 3.4 * S, 4.6 * S, 3.2 * S, hr, hg, hb);
  if (style === "shoulder") {
    // Two falls beside the neck down to the shoulders.
    r.rect(fx - 4.9 * S, headY - 1.5 * S, fx - 2.7 * S, shoulderY, hr, hg, hb);
    r.rect(fx + 2.7 * S, headY - 1.5 * S, fx + 4.9 * S, shoulderY, hr, hg, hb);
    r.line(fx - 3.4 * S, headY - 1 * S, fx - 3.6 * S, shoulderY - 1, 0.4, hr * 0.7, hg * 0.7, hb * 0.7);
    r.line(fx + 3.4 * S, headY - 1 * S, fx + 3.6 * S, shoulderY - 1, 0.4, hr * 0.7, hg * 0.7, hb * 0.7);
  } else if (style === "bun") {
    r.ellipse(fx - 3.9 * S, headY - 4.6 * S, 2.4 * S, 2.4 * S, hr, hg, hb);
    r.px(fx - 4.6 * S, headY - 5.6 * S, hr * 1.4, hg * 1.4, hb * 1.4);
  }
}

function hairFrontR(r: Ras, fx: number, headY: number, style: HairStyle | undefined, color: [number, number, number] | undefined, scale = 1): void {
  if (!style || !color || style === "bald") return;
  const [hr, hg, hb] = color;
  const S = scale;
  // The fringe — hair crossing the brow over the face.
  r.line(fx - 3.4 * S, headY - 3.6 * S, fx + 3.4 * S, headY - 3.6 * S, 0.8, hr * 0.85, hg * 0.85, hb * 0.85);
  r.px(fx - 2.2 * S, headY - 5 * S, Math.min(255, hr * 1.5), Math.min(255, hg * 1.5), Math.min(255, hb * 1.5));
  r.px(fx - 1 * S, headY - 5.6 * S, Math.min(255, hr * 1.5), Math.min(255, hg * 1.5), Math.min(255, hb * 1.5));
}

// A hand — palm, a thumb toward the body, knuckle shadows, a wrist shadow
// where it leaves the sleeve. `side` is which side of the body the hand is
// on (-1 = screen left); `grip` adds the crease of a closed fist.
function handR(r: Ras, x: number, y: number, skin: [number, number, number], side: -1 | 1 = 1, grip = false): void {
  r.ellipse(x, y, 2.0, 2.3, skin[0], skin[1], skin[2]);
  r.ellipse(x - side * 0.6, y + 0.4, 0.8, 1.1, skin[0] * 0.94, skin[1] * 0.94, skin[2] * 0.94);
  r.px(x - 0.8, y - 1.4, skin[0] * 0.72, skin[1] * 0.72, skin[2] * 0.72);
  r.px(x + 0.6, y - 1.4, skin[0] * 0.72, skin[1] * 0.72, skin[2] * 0.72);
  r.px(x, y - 2.4, skin[0] * 0.6, skin[1] * 0.6, skin[2] * 0.6); // wrist shadow
  if (grip) r.line(x - 1, y + 0.2, x + 1, y + 0.6, 0.5, skin[0] * 0.6, skin[1] * 0.6, skin[2] * 0.6);
}

// A shared figure builder — a shaded robe with folds, a face with eyes and
// brow, hands and feet. Every citizen is this body plus distinguishing
// extras drawn on top, so they all read at the same level of detail.
// A filled polygon on a raw sprite — same scanline fill as Ras.poly.
function s_poly(s: SpriteTex, pts: [number, number][], r: number, g: number, b: number, a = 255): void {
  const k = s.w / TEX_SIZE;
  const P = pts.map(([x, y]) => [x * k, y * k]);
  const yMin = Math.floor(Math.min(...P.map((p) => p[1])));
  const yMax = Math.ceil(Math.max(...P.map((p) => p[1])));
  for (let y = yMin; y <= yMax; y++) {
    const xs: number[] = [];
    for (let i = 0; i < P.length; i++) {
      const [x1, y1] = P[i];
      const [x2, y2] = P[(i + 1) % P.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2)
      for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) rawPx(s, x, y, r, g, b, a);
  }
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
  // Iron bracket — a curled arm off the wall.
  rect(s, 26, 12, 38, 15, 44, 42, 50);
  line(s, 32, 15, 32, 34, 2.4, 44, 42, 50);
  line(s, 32, 30, 26, 36, 2, 44, 42, 50);
  // The torch head — a bound bundle tilted up.
  line(s, 30, 34, 34, 22, 3.4, 74, 52, 30);
  line(s, 30, 28, 35, 25, 3.8, 52, 38, 24); // the binding
  const t = finish(s);
  // Flame after finish — it must stay a glow, not a cel band.
  flame(t, 32.5, 18, 8, jit * 0.1);
  return t;
}
function barrelSprite(): SpriteTex {
  const s = makeSprite();
  // Bulged body — taller than wide, staves shaded left to right.
  ellipse(s, 32, 40, 15, 18, 96, 66, 40);
  for (let x = 20; x <= 44; x += 4) line(s, x, 26, x, 54, 0.8, 66, 44, 26); // stave seams
  line(s, 22, 28, 20, 50, 2.4, 128, 90, 56); // the lit left stave
  ellipse(s, 32, 24, 11, 3.4, 74, 50, 30); // stave ends on top
  ellipse(s, 32, 24, 8, 2.2, 58, 40, 24);
  // Three iron hoops, lit on the left edge.
  for (const y of [28, 40, 52]) {
    line(s, 17.5, y, 46.5, y, 2.4, 36, 36, 40);
    line(s, 18, y - 1, 24, y - 1, 0.8, 64, 64, 70);
  }
  px(s, 36, 38, 30, 24, 18); // bung hole
  return finish(s);
}
function crateSprite(): SpriteTex {
  const s = makeSprite();
  rect(s, 15, 27, 49, 57, 92, 66, 38);
  // Plank gaps — dark lines between the boards.
  for (const y of [34, 42, 50]) line(s, 15, y, 49, y, 1.2, 52, 36, 20);
  // Corner braces — a darker frame over the planks.
  rect(s, 15, 27, 19, 57, 60, 42, 24);
  rect(s, 45, 27, 49, 57, 60, 42, 24);
  rect(s, 15, 27, 49, 31, 60, 42, 24);
  rect(s, 15, 53, 49, 57, 60, 42, 24);
  // Diagonal brace and nail heads — high contrast so the bands survive.
  line(s, 19, 53, 45, 31, 2.4, 52, 36, 20);
  for (const [nx, ny] of [[17, 29], [47, 29], [17, 55], [47, 55], [32, 42]]) px(s, nx, ny, 30, 30, 34);
  return finish(s);
}
function graveSprite(): SpriteTex {
  const s = makeSprite();
  // A leaning headstone — slightly off plumb.
  s_poly(s, [[24, 58], [25, 34], [27, 27], [37, 25], [43, 30], [44, 58]], 84, 82, 80);
  s_poly(s, [[25, 58], [26, 35], [28, 28], [30, 26.6], [30, 58]], 96, 94, 92); // lit edge
  // Weathering pits.
  const rand = rng(7);
  for (let i = 0; i < 14; i++) px(s, 27 + rand() * 14, 30 + rand() * 24, 66, 64, 62);
  // Carved cross.
  rect(s, 32, 33, 35, 47, 52, 51, 49);
  rect(s, 28, 36, 39, 39, 52, 51, 49);
  // Grass tufts at the base.
  for (const gx of [22, 26, 40, 44]) {
    line(s, gx, 58, gx - 1, 53, 0.9, 74, 92, 52);
    line(s, gx, 58, gx + 1.5, 54, 0.9, 84, 104, 60);
  }
  return finish(s);
}
function deadTreeSprite(): SpriteTex {
  const s = makeSprite();
  const bark = { r: 44, g: 34, b: 26 };
  // Gnarled trunk — tapering up, flaring at the root.
  line(s, 32, 62, 30, 26, 5, bark.r, bark.g, bark.b);
  line(s, 32, 62, 24, 64, 3.4, bark.r, bark.g, bark.b);
  line(s, 32, 62, 40, 64, 3.4, bark.r, bark.g, bark.b);
  // Four reaching branches with twigs.
  line(s, 30, 40, 16, 26, 2.4, bark.r, bark.g, bark.b);
  line(s, 16, 26, 12, 14, 1.2, bark.r, bark.g, bark.b);
  line(s, 31, 34, 46, 20, 2.4, bark.r, bark.g, bark.b);
  line(s, 46, 20, 52, 10, 1.2, bark.r, bark.g, bark.b);
  line(s, 30, 26, 36, 10, 2, bark.r, bark.g, bark.b);
  line(s, 30, 48, 18, 40, 1.8, bark.r, bark.g, bark.b);
  line(s, 22, 33, 18, 24, 1.2, bark.r, bark.g, bark.b);
  line(s, 40, 30, 46, 22, 1.2, bark.r, bark.g, bark.b);
  // Bark fissures down the trunk.
  line(s, 31, 32, 30, 50, 0.7, 30, 22, 16);
  line(s, 33.5, 40, 33, 58, 0.7, 30, 22, 16);
  // A crow watching from the bare branches.
  ellipse(s, 36, 8, 2.5, 1.8, 18, 16, 20);
  px(s, 38, 7.5, 30, 26, 30);
  px(s, 35, 9, 40, 36, 40);
  return finish(s);
}
// A stone well — the reliable water source in the plaza.
function wellSprite(): SpriteTex {
  const s = makeSprite();
  // Stone ring — seven mortared blocks around a dark shaft.
  ellipse(s, 32, 44, 16, 10, 78, 76, 74);
  for (const x of [19, 24, 29, 34, 39, 44]) line(s, x, 40, x - 0.5, 47, 1, 56, 54, 52); // block seams
  ellipse(s, 32, 41.5, 13.5, 6.5, 16, 15, 16); // black water far below
  line(s, 17, 40, 47, 40, 1.2, 98, 96, 94); // coping highlight
  // Posts, windlass, rope and bucket.
  rect(s, 18, 14, 21, 44, 66, 46, 28);
  rect(s, 43, 14, 46, 44, 66, 46, 28);
  rect(s, 19, 14, 20, 44, 88, 64, 40);
  rect(s, 18, 12, 46, 15, 58, 40, 24); // crossbeam
  rect(s, 26, 15, 38, 18, 78, 56, 34); // the windlass
  line(s, 32, 18, 32, 36, 1, 110, 88, 54); // the rope
  rect(s, 29, 36, 35, 41, 62, 46, 30); // the bucket
  rect(s, 29, 36, 35, 37, 82, 62, 40);
  // Shingled roof — three overlapping rows.
  for (let i = 0; i < 3; i++) {
    const shade = 56 - i * 8;
    line(s, 15 - i, 16 - i, 32, 4 + i, 3.2, shade, shade * 0.72, shade * 0.48);
    line(s, 49 + i, 16 - i, 32, 4 + i, 3.2, shade, shade * 0.72, shade * 0.48);
  }
  line(s, 28, 4, 36, 4, 2, 60, 44, 30); // ridge cap
  return finish(s);
}
// A wooden hand-cart, abandoned in the street.
function cartSprite(): SpriteTex {
  const s = makeSprite();
  // Slanted shafts reaching forward and up.
  line(s, 50, 42, 62, 32, 2, 66, 46, 28);
  line(s, 52, 44, 62, 36, 1.6, 78, 56, 36);
  // Plank bed with side rails.
  rect(s, 12, 34, 52, 42, 74, 52, 32);
  rect(s, 12, 34, 52, 36, 92, 66, 40);
  line(s, 14, 39, 50, 39, 1, 56, 40, 24);
  rect(s, 12, 26, 15, 34, 60, 42, 26); // headboard
  // A sack load slumped in the bed.
  ellipse(s, 32, 32, 12, 5.5, 110, 100, 78);
  line(s, 24, 31, 42, 33, 1, 86, 78, 60);
  px(s, 36, 29, 88, 80, 62); // the tie
  // Two spoked wheels — iron rim, wooden spokes, bright hub.
  for (const wx of [20, 44]) {
    ellipse(s, wx, 51, 7.5, 7.5, 36, 34, 38); // iron rim
    ellipse(s, wx, 51, 6, 6, 58, 42, 28);
    line(s, wx - 5, 51, wx + 5, 51, 1, 34, 24, 16);
    line(s, wx, 46, wx, 56, 1, 34, 24, 16);
    line(s, wx - 3.5, 47.5, wx + 3.5, 54.5, 1, 34, 24, 16);
    line(s, wx + 3.5, 47.5, wx - 3.5, 54.5, 1, 34, 24, 16);
    ellipse(s, wx, 51, 1.6, 1.6, 96, 98, 104); // the hub
  }
  return finish(s);
}
// A pile of planks — collect for barricades.
function planksSprite(): SpriteTex {
  const s = makeSprite();
  // Three stacked boards, each a shade apart, grain and a nail.
  const boards: [number, number, number, number, number][] = [
    [14, 52, 50, 56, 84],
    [18, 46, 52, 50, 74],
    [12, 40, 48, 44, 92],
  ];
  for (const [x0, y0, x1, y1, sh_] of boards) {
    rect(s, x0, y0, x1, y1, sh_, sh_ * 0.66, sh_ * 0.42);
    line(s, x0 + 2, y0 + 1.6, x1 - 3, y0 + 1.8, 0.5, sh_ * 0.5, sh_ * 0.34, sh_ * 0.2); // grain
    line(s, x0 + 4, y1 - 1.4, x1 - 2, y1 - 1.2, 0.5, sh_ * 0.5, sh_ * 0.34, sh_ * 0.2);
    px(s, x0 + 1.5, y0 + 1.5, 34, 34, 40); // a nail
  }
  return finish(s);
}
// A loaf of bread.
function breadSprite(): SpriteTex {
  const s = makeSprite();
  // A round loaf, scored across the crust.
  ellipse(s, 32, 46, 13, 8.5, 158, 112, 56);
  ellipse(s, 32, 44, 11, 6.5, 186, 136, 70);
  line(s, 24, 42, 28, 48, 1.2, 118, 80, 38);
  line(s, 31, 40, 34, 47, 1.2, 118, 80, 38);
  line(s, 38, 41, 41, 46, 1.2, 118, 80, 38);
  return finish(s);
}
// A waterskin.
function skinSprite(): SpriteTex {
  const s = makeSprite();
  // A waterskin — bulging hide body, tied neck, strap.
  ellipse(s, 32, 46, 11, 13, 104, 68, 38);
  ellipse(s, 29, 44, 7, 9, 122, 82, 48); // lit flank
  rect(s, 29, 30, 35, 34, 72, 48, 28); // the neck
  line(s, 28, 31, 36, 31, 1.4, 48, 32, 18); // tied band
  rect(s, 29, 27, 35, 29, 44, 32, 22); // the stopper
  line(s, 30, 33, 22, 42, 1.2, 52, 36, 20); // the strap
  return finish(s);
}
// A plague victim that got back up. Hooded, hunched, grey-green.
function shamblerFrame(step: number): SpriteTex {
  const r = new Ras();
  figureRig(r, SHAMBLER, "shamble", step * 0.5, 15);
  return finish(r.down());
}

const SHAMBLER: Outfit = { skin: [96, 108, 88], under: [60, 66, 60], hose: [40, 46, 42], boots: [96, 108, 88], barefoot: true, over: { kind: "rags", color: [34, 38, 36], hem: 54, ragged: true }, head: { kind: "deepHood", color: [27, 31, 29] }, arms: "hang", marks: [52, 62, 46] };
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
  hair?: HairStyle;                 // crop, shoulder falls, bald fringe, bun
  hairColor?: [number, number, number];
  beard?: boolean;                  // stubble over the jaw
}

const DRESSES: Dress[] = [
  // hooded pilgrim — mud-brown wool, rope belt, satchel, hem to the shin
  { robe: [74, 58, 42], skin: [166, 128, 94], hose: [44, 38, 30], shoe: [30, 26, 22], belt: [58, 44, 28], hemY: 52, ragged: true, patches: true, hair: "crop", hairColor: HAIR_COLORS[1], beard: true },
  // housewife — warm wool kirtle, bone kerchief, apron, basket
  { robe: [92, 64, 48], skin: [172, 134, 98], hose: [52, 46, 38], shoe: [34, 28, 22], belt: [60, 50, 36], hemY: 50, hair: "shoulder", hairColor: HAIR_COLORS[2] },
  // tradesman — russet doublet over hose, flat cap, a bundle under the arm
  { robe: [96, 52, 40], skin: [174, 136, 100], hose: [46, 40, 32], shoe: [30, 26, 22], belt: [52, 38, 24], hemY: 44, hair: "crop", hairColor: HAIR_COLORS[2], beard: true },
  // beggar — layered grey rags, head shawl, bowl held out, barefoot
  { robe: [64, 60, 54], skin: [152, 118, 88], hose: [56, 50, 44], shoe: [140, 106, 78], hemY: 51, hunch: 0.55, ragged: true, patches: true, hair: "shoulder", hairColor: HAIR_COLORS[3] },
  // clerk — ink-blue gown cut at the knee, soft cap, ledger to the chest
  { robe: [48, 54, 78], skin: [168, 132, 98], hose: [38, 34, 30], shoe: [30, 26, 22], belt: [36, 32, 24], hemY: 47, hair: "crop", hairColor: HAIR_COLORS[0] },
  // fieldhand — moss tunic cut short, rolled sleeves, straw hat, rake
  { robe: [62, 68, 44], skin: [180, 142, 102], hose: [50, 44, 34], shoe: [34, 28, 20], hemY: 44, bareArms: true, hair: "crop", hairColor: HAIR_COLORS[2], beard: true },
  // mourner — charcoal cloak to the ground and a deep hood, hands folded
  { robe: [46, 44, 48], skin: [160, 124, 94], hose: [36, 32, 32], shoe: [24, 22, 20], hemY: 56, hunch: 0.3, ragged: true, arms: "folded", hair: "shoulder", hairColor: HAIR_COLORS[0] },
  // carter — oxblood coat, hood down, whip trailing
  { robe: [84, 42, 36], skin: [170, 130, 96], hose: [42, 36, 30], shoe: [30, 26, 22], belt: [48, 34, 22], hemY: 45, patches: true, hair: "crop", hairColor: HAIR_COLORS[1], beard: true },
  // patrolman — the provost's blue-grey tabard over hose, kettle helm,
  // lantern swinging. Crowd villagers never wear this one.
  { robe: [62, 76, 96], skin: [168, 130, 96], hose: [40, 44, 50], shoe: [30, 26, 22], belt: [46, 36, 24], hemY: 46, hair: "crop", hairColor: HAIR_COLORS[1] },
];

type Stance = "walk" | "stand" | "shamble";
type ArmPose = "hang" | "fold" | "raiseR" | "hug" | "staffR" | "trayBoth" | "carryL" | "holdOutR";
type HeadKind =
  | "none" | "hood" | "deepHood" | "cap" | "flatcap" | "wimple"
  | "kettlehelm" | "strawhat" | "kerchief" | "coif" | "bakercap" | "widowveil";
type OverKind = "tunic" | "robe" | "gown" | "cloak" | "tabard" | "habit" | "rags";
type PropKind =
  | "staff" | "lantern" | "basket" | "halberd" | "ledger" | "tray" | "bundle" | "bowl"
  | "spade" | "peel" | "rake" | "tankard" | "vial" | "clothbolt" | "rue" | "satchel" | "whip" | "spadeShoulder";
interface Outfit {
  skin: RGB; hair?: HairStyle; hairColor?: RGB; beard?: boolean;
  under: RGB;                   // chemise/mail showing at throat and cuffs
  hose: RGB; boots: RGB; bootHigh?: boolean; barefoot?: boolean;
  over: { kind: OverKind; color: RGB; hem: number; trim?: RGB; ragged?: boolean; patches?: boolean };
  rolledSleeves?: boolean;      // sleeves stop at the elbow, forearm bare
  cowl?: boolean;               // a hood worn down, bunched at the shoulders
  shawl?: { color: RGB; hem: number }; // a second cloth layer over the shoulders
  insignia?: RGB;               // a badge on the chest (the cordon cross)
  marks?: RGB;                  // plague marks — dark stipple on skin and cloth
  belt?: { color: RGB; buckle?: boolean; pouch?: boolean; rope?: boolean };
  apron?: { color: RGB; bib?: boolean; hem: number };
  head: { kind: HeadKind; color?: RGB };
  arms: ArmPose;
  props?: { kind: PropKind; hand: "L" | "R" }[];
  hunch?: number; // 0..0.7
}

// Headgear drawn over the face — each takes the face centre and crown.
function headgearR(r: Ras, kind: HeadKind, fx: number, headY: number, shoulderY: number, color: RGB | undefined, skin: RGB): void {
  const c: RGB = color ?? [60, 50, 40];
  switch (kind) {
    case "none": break;
    case "hood": {
      // Peaked hood with a cape over the shoulders; the face sits in shade.
      r.poly(
        [[fx - 6.4, headY + 2], [fx - 5.8, headY - 3.5], [fx, headY - 8], [fx + 5.8, headY - 3.5], [fx + 6.4, headY + 2]],
        c[0], c[1], c[2]
      );
      r.poly(
        [[fx - 6.6, headY + 1], [fx + 6.6, headY + 1], [fx + 7.2, shoulderY + 6], [fx - 7.2, shoulderY + 6]],
        c[0] * 0.85, c[1] * 0.85, c[2] * 0.85
      );
      r.ellipse(fx, headY + 0.9, 3.1, 3.3, skin[0] * 0.75, skin[1] * 0.75, skin[2] * 0.75);
      r.px(fx - 1.4, headY + 0.4, skin[0] * 0.45, skin[1] * 0.45, skin[2] * 0.45);
      r.px(fx + 1.4, headY + 0.4, skin[0] * 0.45, skin[1] * 0.45, skin[2] * 0.45);
      break;
    }
    case "deepHood": {
      // A deeper cowl — the face is swallowed; two dim eyes only.
      r.poly(
        [[fx - 6.8, headY + 3.5], [fx - 6.2, headY - 4], [fx, headY - 9], [fx + 6.2, headY - 4], [fx + 6.8, headY + 3.5]],
        c[0], c[1], c[2]
      );
      r.poly(
        [[fx - 7, headY + 2], [fx + 7, headY + 2], [fx + 8, shoulderY + 7], [fx - 8, shoulderY + 7]],
        c[0] * 0.8, c[1] * 0.8, c[2] * 0.85
      );
      r.ellipse(fx, headY + 0.9, 3.4, 3.5, skin[0] * 0.25, skin[1] * 0.25, skin[2] * 0.25);
      r.px(fx - 1.4, headY - 0.2, skin[0] * 0.55, skin[1] * 0.55, skin[2] * 0.55);
      r.px(fx + 1.4, headY - 0.2, skin[0] * 0.55, skin[1] * 0.55, skin[2] * 0.55);
      break;
    }
    case "cap": {
      r.ellipse(fx, headY - 4.4, 4.2, 2.2, c[0], c[1], c[2]);
      r.ellipse(fx, headY - 3.0, 4.6, 0.8, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8);
      break;
    }
    case "flatcap": {
      r.ellipse(fx, headY - 4.6, 3.9, 2.2, c[0] * 1.05, c[1] * 1.05, c[2] * 1.05); // low crown
      r.ellipse(fx, headY - 3.6, 6.4, 1.4, c[0], c[1], c[2]); // wide brim
      break;
    }
    case "wimple": {
      // Dark veil falling to the shoulders behind the white linen frame.
      r.poly(
        [[fx - 7.5, shoulderY + 5], [fx - 5.5, headY - 5], [fx, headY - 7.5], [fx + 5.5, headY - 5], [fx + 7.5, shoulderY + 5]],
        40, 38, 48
      );
      r.rect(fx - 3.6, headY - 4.2, fx + 3.6, headY - 2.4, 212, 206, 190); // the brow band
      r.rect(fx - 3.6, headY - 2.4, fx - 2.5, headY + 3, 212, 206, 190); // the frame — left cheek
      r.rect(fx + 2.5, headY - 2.4, fx + 3.6, headY + 3, 212, 206, 190); // right cheek
      r.rect(fx - 3.6, headY + 3, fx + 3.6, headY + 4.4, 212, 206, 190); // under the chin
      r.rect(fx - 2.5, headY - 2.4, fx + 2.5, headY + 3, skin[0], skin[1], skin[2]); // face in its opening
      r.px(fx - 1.5, headY - 0.2, 26, 20, 16);
      r.px(fx + 1.5, headY - 0.2, 26, 20, 16);
      r.rect(fx - 1, headY + 2.2, fx + 1, headY + 2.4, skin[0] * 0.55, skin[1] * 0.55, skin[2] * 0.55);
      break;
    }
    case "kettlehelm": {
      // Mail coif under a wide-brimmed helm; the face sits in the opening.
      r.ellipse(fx, headY + 3.5, 5.4, 6, 96, 100, 108);
      r.rect(fx - 4.5, headY + 5, fx + 4.5, shoulderY + 5, 96, 100, 108);
      r.rect(fx - 2.4, headY + 1.8, fx + 2.4, headY + 7.5, skin[0] * 0.85, skin[1] * 0.85, skin[2] * 0.85);
      r.px(fx - 1.3, headY + 4, 16, 12, 10);
      r.px(fx + 1.3, headY + 4, 16, 12, 10);
      const helm: RGB = color ?? [112, 116, 124];
      r.ellipse(fx, headY - 3.4, 9, 2.4, helm[0], helm[1], helm[2]);
      r.ellipse(fx, headY - 5.4, 5, 3.6, helm[0] * 1.08, helm[1] * 1.08, helm[2] * 1.08);
      r.px(fx, headY - 7.9, helm[0] * 1.3, helm[1] * 1.3, helm[2] * 1.3);
      break;
    }
    case "strawhat": {
      const straw: RGB = color ?? [170, 140, 70];
      r.ellipse(fx, headY - 3.4, 10, 1.2, straw[0], straw[1], straw[2]);
      r.ellipse(fx, headY - 5, 4.2, 2.4, straw[0] * 0.9, straw[1] * 0.9, straw[2] * 0.9);
      r.line(fx - 4.2, headY - 4.2, fx + 4.2, headY - 4.2, 0.7, straw[0] * 0.6, straw[1] * 0.6, straw[2] * 0.6); // hat band
      break;
    }
    case "kerchief": {
      r.ellipse(fx, headY - 4, 5, 1.8, c[0], c[1], c[2]);
      r.px(fx + 5, headY - 3.8, c[0], c[1], c[2]); // the knot
      r.px(fx + 5.8, headY - 1, c[0] * 0.9, c[1] * 0.9, c[2] * 0.9); // its tail
      break;
    }
    case "coif": {
      const linen: RGB = color ?? [214, 206, 190];
      r.ellipse(fx, headY - 1.4, 4.6, 4.4, linen[0], linen[1], linen[2]);
      r.rect(fx - 2.4, headY - 2.2, fx + 2.4, headY + 3.2, skin[0], skin[1], skin[2]); // face opening
      r.px(fx - 1.4, headY - 0.2, 26, 20, 16);
      r.px(fx + 1.4, headY - 0.2, 26, 20, 16);
      r.line(fx - 2, headY + 4.2, fx + 2, headY + 4.2, 0.6, linen[0] * 0.7, linen[1] * 0.7, linen[2] * 0.7); // chin tie
      break;
    }
    case "bakercap": {
      const cloth: RGB = color ?? [222, 216, 200];
      r.ellipse(fx, headY - 4.4, 5.4, 2.2, cloth[0], cloth[1], cloth[2]);
      r.ellipse(fx, headY - 6, 3.6, 2.2, cloth[0] * 1.02, cloth[1] * 1.02, cloth[2] * 1.02);
      break;
    }
    case "widowveil": {
      // Sheer black veil over the head, falling to the shoulders, pale-edged.
      r.ellipse(fx, headY - 3, 6, 4, 34, 30, 38);
      r.rect(fx - 5, headY - 0.5, fx + 5, shoulderY + 4, 30, 26, 34);
      r.line(fx - 5, headY - 0.5, fx - 5, shoulderY + 4, 0.8, 70, 66, 74); // pale edge
      r.line(fx + 5, headY - 0.5, fx + 5, shoulderY + 4, 0.8, 70, 66, 74);
      r.rect(fx - 2.6, headY + 0.6, fx + 2.6, headY + 5.5, skin[0] * 0.5, skin[1] * 0.5, skin[2] * 0.5); // dimmed face
      r.px(fx - 1.4, headY + 2, 20, 16, 14);
      r.px(fx + 1.4, headY + 2, 20, 16, 14);
      break;
    }
  }
}

// Hand props — placed at the solved hand points. Long tools (staff,
// halberd, spadeShoulder) draw their shafts behind the body instead, in
// figureRig's first pass.
function propR(r: Ras, kind: PropKind, hx: number, hy: number, shoulderY: number): void {
  switch (kind) {
    case "lantern": {
      r.line(hx, hy, hx - 1, hy + 4, 0.7, 40, 38, 44); // the cord
      r.rect(hx - 3.6, hy + 4, hx + 1.4, hy + 9, 44, 42, 48); // the cage
      r.rect(hx - 2.6, hy + 5, hx + 0.4, hy + 8, 240, 170, 60); // amber glass
      r.px(hx - 1.1, hy + 6.5, 255, 224, 150);
      break;
    }
    case "basket": {
      r.ellipse(hx - 1, hy - 1.5, 3.8, 3, 140, 100, 58);
      r.ellipse(hx - 1, hy - 2.6, 4.2, 1.6, 160, 118, 72); // the rim
      r.line(hx - 4, hy - 2.5, hx - 4, hy + 1, 0.6, 110, 80, 46);
      break;
    }
    case "ledger": {
      r.rect(hx - 3.2, hy - 3.2, hx + 3, hy + 3.2, 96, 80, 52);
      r.line(hx - 3.2, hy - 3.2, hx - 3.2, hy + 3.2, 0.8, 60, 48, 32); // the spine
      break;
    }
    case "tray": {
      r.rect(hx - 7, hy - 1.5, hx + 7, hy + 1.5, 110, 80, 48);
      r.ellipse(hx - 3.5, hy - 1.4, 2.4, 1.6, 168, 124, 72);
      r.ellipse(hx + 0.5, hy - 1.8, 2.4, 1.6, 178, 134, 80);
      r.ellipse(hx + 4, hy - 1.2, 2.4, 1.6, 160, 118, 68);
      break;
    }
    case "bundle": {
      r.ellipse(hx - 2, hy - 2, 3.8, 3.6, 118, 96, 64);
      r.line(hx - 4.5, hy - 3.5, hx + 0.5, hy - 0.5, 0.7, 90, 72, 46); // the tie
      break;
    }
    case "bowl": {
      r.ellipse(hx, hy, 3.2, 2.2, 96, 82, 60);
      r.ellipse(hx, hy - 0.8, 2.6, 1, 70, 58, 40); // the hollow
      break;
    }
    case "spade": {
      r.line(hx, hy, hx + 1, hy + 8, 1.4, 96, 70, 42);
      r.rect(hx - 1.5, hy + 7, hx + 3.5, hy + 13, 104, 108, 114);
      r.px(hx, hy + 8.5, 150, 154, 160); // worn edge
      break;
    }
    case "peel": {
      r.line(hx, hy, hx + 4, hy - 16, 1.6, 120, 92, 56);
      r.ellipse(hx + 5, hy - 18, 3.6, 3, 138, 106, 66); // the blade
      r.px(hx + 5, hy - 18, 90, 68, 40); // a loaf on it
      break;
    }
    case "rake": {
      r.line(hx, hy, hx + 5, hy - 14, 1.4, 96, 70, 42);
      for (let i = 0; i < 4; i++) r.line(hx + 2.5 + i * 1.3, hy - 12 + i * 0, hx + 3.5 + i * 1.3, hy - 15, 0.7, 96, 70, 42);
      break;
    }
    case "tankard": {
      r.rect(hx - 1.8, hy - 1, hx + 1.8, hy + 3.5, 128, 122, 110);
      r.rect(hx - 1.8, hy - 1, hx + 1.8, hy + 0.5, 150, 144, 130); // the rim
      r.line(hx + 1.8, hy, hx + 3.4, hy + 1.6, 0.8, 118, 112, 100); // handle
      break;
    }
    case "vial": {
      r.rect(hx - 1.2, hy - 2, hx + 1.2, hy + 2.5, 60, 200, 90);
      r.px(hx, hy - 0.5, 150, 255, 170);
      break;
    }
    case "clothbolt": {
      // Pale linen over the forearm, hanging in two falls.
      r.poly([[hx - 4, hy - 3], [hx + 2, hy - 3], [hx + 3.5, hy + 9], [hx + 0.5, hy + 9.5], [hx - 1, hy + 4], [hx - 3, hy + 9]], 190, 182, 158);
      r.line(hx - 0.5, hy - 2, hx + 0.5, hy + 8, 0.7, 150, 142, 120);
      break;
    }
    case "rue": {
      r.line(hx, hy, hx - 1.5, hy - 7, 0.8, 84, 110, 52);
      r.line(hx, hy, hx + 2, hy - 8, 0.8, 92, 120, 58);
      r.px(hx - 1.5, hy - 7.5, 100, 132, 64);
      r.px(hx + 2, hy - 8.5, 110, 142, 70);
      r.px(hx + 0.5, hy - 7, 100, 132, 64);
      break;
    }
    case "satchel": {
      // Leather bag at the hip on a shoulder strap.
      r.line(26, shoulderY + 2, 40, 40, 1, 46, 34, 20); // the strap
      r.rect(36, 40, 42, 46, 74, 52, 32);
      r.rect(36, 40, 42, 41.5, 88, 64, 40); // flap
      break;
    }
    case "whip": {
      r.line(hx, hy, hx + 4, hy + 8, 0.8, 40, 30, 20);
      r.line(hx + 4, hy + 8, hx + 6.5, 57, 0.7, 40, 30, 20); // trailing coil
      break;
    }
    default: break; // staff / halberd / spadeShoulder draw behind the body
  }
}

// One articulated body for every person in the quarter — a solved pose,
// then the garments in a fixed order so layers always agree.
function figureRig(r: Ras, o: Outfit, stance: Stance, phase: number, seed = 0): void {
  const hunch = Math.max(o.hunch ?? 0, stance === "shamble" ? 0.5 : 0);
  const st = Math.sin(phase * Math.PI * 2);
  const skin = wan(o.skin);
  const under = dour(o.under);
  const over = dour(o.over.color);
  const hoseC = dour(o.hose);
  let bootC = dour(o.boots);
  { // boots read a band lighter than the hose
    const hl = hoseC[0] * 0.3 + hoseC[1] * 0.59 + hoseC[2] * 0.11;
    const bl = bootC[0] * 0.3 + bootC[1] * 0.59 + bootC[2] * 0.11;
    if (bl < hl + 25) bootC = [Math.min(255, bootC[0] * 1.35), Math.min(255, bootC[1] * 1.35), Math.min(255, bootC[2] * 1.35)];
  }
  const bob =
    stance === "walk" ? -0.5 * Math.abs(Math.cos(phase * Math.PI * 2))
    : stance === "stand" ? Math.sin(phase * Math.PI * 2) * 0.3
    : -0.15;
  const headY = 8.5 + hunch * 5 + bob * 0.5;
  const shoulderY = 14.5 + hunch * 2.5 + bob * 0.5;
  const hipY = 32 + bob * 0.4;
  const kneeY = 46 + bob * 0.3;
  const hemY = o.over.hem + bob * 0.4;
  const fx = 32 + (stance === "shamble" ? 0.8 : 0);
  const sw = stance === "walk" ? st * 2.6 : 0; // arm counter-swing

  // Arm pose — solved first so back props and sleeves agree on the hands.
  let elbL: [number, number], elbR: [number, number], handL: [number, number], hndR: [number, number];
  switch (stance === "shamble" ? "shamble" : o.arms) {
    case "fold": elbL = [24, 26]; handL = [30, 33.5]; elbR = [40, 26]; hndR = [34, 33.5]; break;
    case "raiseR": elbL = [24.5, 27]; handL = [24 - sw, 38]; elbR = [40.5, 27]; hndR = [41, 20]; break;
    case "hug": elbL = [24, 26]; handL = [35, 29.5]; elbR = [40, 26]; hndR = [29, 30.5]; break;
    case "staffR": elbL = [24.5, 27]; handL = [24 - sw, 38]; elbR = [40.5, 27]; hndR = [42, 37]; break;
    case "trayBoth": elbL = [24, 27]; handL = [28.5, 33]; elbR = [40, 27]; hndR = [35.5, 33]; break;
    case "carryL": elbL = [24, 27]; handL = [25.5, 37]; elbR = [39.5, 27]; hndR = [40 + sw, 38]; break;
    case "holdOutR": elbL = [24.5, 27]; handL = [24 - sw, 38]; elbR = [40, 27]; hndR = [42.5, 31]; break;
    case "shamble": elbL = [25, 26]; handL = [27, 39.5]; elbR = [39, 26]; hndR = [37, 39.5]; break;
    default: elbL = [24.5, 27]; handL = [24 - sw, 38]; elbR = [39.5, 27]; hndR = [40 + sw, 38]; break;
  }

  // Back props — long shafts behind the body.
  for (const p of o.props ?? []) {
    const hx = p.hand === "L" ? handL[0] : hndR[0];
    const hy = p.hand === "L" ? handL[1] : hndR[1];
    if (p.kind === "staff") {
      r.line(hx, 2, hx, 60, 1.6, 96, 70, 42);
      r.ellipse(hx, 2.5, 1.6, 1.6, 110, 80, 50); // the knob
    } else if (p.kind === "halberd") {
      const sx = hx + 3;
      r.line(sx, 2, sx - 1, 60, 1.8, 90, 64, 36);
      r.rect(sx - 2.5, 2, sx + 3.5, 9, 170, 174, 182); // axe head
      r.line(sx + 1, 0.3, sx + 1, 2.5, 1.6, 185, 189, 197); // spike
      r.px(sx - 1, 10, 150, 154, 162); // edge
    } else if (p.kind === "spadeShoulder") {
      r.line(hx, hy, 45, 7, 1.8, 96, 70, 42);
      r.rect(42, 3, 48, 10, 104, 108, 114); // the blade
      r.px(43, 5.5, 150, 154, 160);
    }
  }

  // Back hair, then the legs — hose tubes with real knee joints.
  hairR(r, fx, headY, shoulderY, o.hair, o.hairColor, 0.76);
  const legL: [number, number] = [30, hipY], legR: [number, number] = [34, hipY];
  let kneeL: [number, number], kneeR: [number, number], ankL: [number, number], ankR: [number, number];
  if (stance === "walk") {
    kneeL = [30 - st * 2.4, kneeY]; kneeR = [34 + st * 2.4, kneeY];
    ankL = [30 - st * 4.2, 59.5 - Math.max(0, st) * 1.5];
    ankR = [34 + st * 4.2, 59.5 - Math.max(0, -st) * 1.5];
  } else if (stance === "shamble") {
    kneeL = [29.8, kneeY]; ankL = [29.5, 59.5];
    kneeR = [36, 50]; ankR = [36.5, 59.2]; // the dragging leg, bent and trailing
  } else {
    kneeL = [30, kneeY]; kneeR = [34, kneeY];
    ankL = [29.5 + st * 0.2, 59.5]; ankR = [34.5 + st * 0.2, 59.5];
  }
  r.tube(legL[0], legL[1], kneeL[0], kneeL[1], 4.0, hoseC[0], hoseC[1], hoseC[2]);
  r.tube(kneeL[0], kneeL[1], ankL[0], ankL[1], 3.4, hoseC[0] * 0.92, hoseC[1] * 0.92, hoseC[2] * 0.92);
  r.tube(legR[0], legR[1], kneeR[0], kneeR[1], 4.0, hoseC[0], hoseC[1], hoseC[2]);
  r.tube(kneeR[0], kneeR[1], ankR[0], ankR[1], 3.4, hoseC[0] * 0.92, hoseC[1] * 0.92, hoseC[2] * 0.92);
  r.ellipse(kneeL[0], kneeL[1], 1.8, 1.7, hoseC[0] * 0.8, hoseC[1] * 0.8, hoseC[2] * 0.8);
  r.ellipse(kneeR[0], kneeR[1], 1.8, 1.7, hoseC[0] * 0.8, hoseC[1] * 0.8, hoseC[2] * 0.8);

  // Boots — ankle boot with a shaft, taller with a turned cuff, or bare feet.
  for (const [ax, ay] of [ankL, ankR]) {
    if (o.barefoot) {
      r.ellipse(ax, ay + 0.3, 3.4, 2, skin[0] * 0.95, skin[1] * 0.95, skin[2] * 0.95);
      r.line(ax - 2.4, ay + 1, ax + 2.4, ay + 1, 0.5, skin[0] * 0.7, skin[1] * 0.7, skin[2] * 0.7); // toes
    } else {
      r.rect(ax - 1.3, o.bootHigh ? 50 : 55, ax + 1.3, ay, bootC[0], bootC[1], bootC[2]);
      if (o.bootHigh) r.ellipse(ax, 50.6, 1.9, 1.2, bootC[0] * 0.7, bootC[1] * 0.7, bootC[2] * 0.7); // turned cuff
      r.ellipse(ax, ay + 0.4, 3.6, 2.4, bootC[0], bootC[1], bootC[2]);
    }
  }

  // The chemise under everything — shows at the throat and the cuffs.
  r.poly(
    [[24.5, shoulderY + 1.6], [27.5, shoulderY], [36.5, shoulderY], [39.5, shoulderY + 1.6], [39.5, hipY], [24.5, hipY]],
    under[0], under[1], under[2]
  );

  // The over-garment — each cut has its own silhouette.
  const ov = o.over;
  switch (ov.kind) {
    case "tunic":
      r.shadedPoly(
        [[23.5, shoulderY + 1.8], [27, shoulderY], [37, shoulderY], [40.5, shoulderY + 1.8], [40.5, hemY], [35.5, hemY - 2], [28.5, hemY - 2], [23.5, hemY]],
        over[0], over[1], over[2], 3, seed
      );
      break;
    case "robe":
      r.shadedPoly([[23.5, shoulderY + 1.8], [27, shoulderY], [37, shoulderY], [40.5, shoulderY + 1.8], [43, hemY], [21, hemY]], over[0], over[1], over[2], 3, seed);
      break;
    case "gown":
      r.shadedPoly(
        [[23.5, shoulderY + 1.8], [27, shoulderY], [37, shoulderY], [40.5, shoulderY + 1.8], [38.5, 27], [42.5, hemY], [21.5, hemY], [25.5, 27]],
        over[0], over[1], over[2], 3, seed
      );
      break;
    case "cloak":
      if (ov.ragged) {
        r.shadedPoly(
          [[22, shoulderY + 1.3], [26.5, shoulderY - 0.5], [37.5, shoulderY - 0.5], [42, shoulderY + 1.3], [45, hemY], [41, hemY - 1.8], [36, hemY + 0.4], [30, hemY - 2], [24, hemY + 0.5], [21.5, hemY]],
          over[0], over[1], over[2], 3, seed
        );
      } else {
        r.shadedPoly([[22, shoulderY + 1.3], [26.5, shoulderY - 0.5], [37.5, shoulderY - 0.5], [42, shoulderY + 1.3], [45, hemY], [19, hemY]], over[0], over[1], over[2], 3, seed);
      }
      r.px(fx, shoulderY + 1.2, 190, 170, 90); // the clasp
      break;
    case "tabard":
      r.shadedPoly([[24, shoulderY + 1.8], [27.5, shoulderY], [36.5, shoulderY], [40, shoulderY + 1.8], [40, hemY], [24, hemY]], over[0], over[1], over[2], 2, seed);
      break;
    case "habit":
      r.shadedPoly([[23.5, shoulderY + 1.8], [27, shoulderY], [37, shoulderY], [40.5, shoulderY + 1.8], [43, hemY], [21, hemY]], over[0], over[1], over[2], 3, seed);
      r.poly([[29, shoulderY + 5], [35, shoulderY + 5], [36, hemY - 2], [28, hemY - 2]], over[0] * 0.78, over[1] * 0.78, over[2] * 0.82); // scapular
      break;
    case "rags":
      r.shadedPoly(
        [[23.5, shoulderY + 1.8], [27, shoulderY], [37, shoulderY], [40.5, shoulderY + 1.8], [43, hemY], [39, hemY - 1.8], [34, hemY + 0.5], [28, hemY - 2.2], [23, hemY + 0.7], [21, hemY]],
        over[0], over[1], over[2], 3, seed
      );
      break;
  }
  r.poly(
    [[fx - 2.2, shoulderY + 0.7], [fx + 2.2, shoulderY + 0.7], [fx, shoulderY + 3.1]],
    under[0], under[1], under[2]
  ); // the collar V
  if (ov.trim) {
    r.line(22, hemY - 0.8, 42, hemY - 0.8, 0.9, ov.trim[0], ov.trim[1], ov.trim[2]); // hem band
    r.line(fx - 3, shoulderY + 0.7, fx + 3, shoulderY + 0.7, 0.7, ov.trim[0], ov.trim[1], ov.trim[2]); // collar
  }
  if (ov.patches) {
    r.rect(28, 40, 31.5, 43.5, over[0] * 0.72, over[1] * 0.72, over[2] * 0.78);
    r.rect(35, 33, 37, 36, over[0] * 0.62, over[1] * 0.62, over[2] * 0.68);
  }
  if (o.insignia) {
    r.rect(fx - 0.8, shoulderY + 4, fx + 0.8, shoulderY + 11, o.insignia[0], o.insignia[1], o.insignia[2]);
    r.rect(fx - 3, shoulderY + 6, fx + 3, shoulderY + 7.6, o.insignia[0], o.insignia[1], o.insignia[2]);
  }
  if (o.shawl) {
    const shc = dour(o.shawl.color);
    r.poly([[23, shoulderY + 1.4], [27, shoulderY], [37, shoulderY], [41, shoulderY + 1.4], [42.5, o.shawl.hem], [21.5, o.shawl.hem]], shc[0], shc[1], shc[2]);
  }
  if (o.apron) {
    const ap = dour(o.apron.color);
    r.poly([[27, 31], [37, 31], [39, o.apron.hem], [25, o.apron.hem]], ap[0], ap[1], ap[2]);
    if (o.apron.bib) {
      r.rect(28, shoulderY + 2, 36, 31, ap[0], ap[1], ap[2]);
      r.line(27, 31, 23.5, 33, 0.9, ap[0], ap[1], ap[2]); // strings
      r.line(37, 31, 40.5, 33, 0.9, ap[0], ap[1], ap[2]);
    }
  }
  if (o.cowl) {
    // A hood worn down — slack cloth bunched on the shoulders.
    r.ellipse(fx - 6, shoulderY - 1, 3.4, 2.8, over[0] * 0.6, over[1] * 0.6, over[2] * 0.6);
    r.ellipse(fx + 6, shoulderY - 1, 3.4, 2.8, over[0] * 0.6, over[1] * 0.6, over[2] * 0.6);
    r.ellipse(fx, shoulderY + 1.5, 4.5, 2, over[0] * 0.55, over[1] * 0.55, over[2] * 0.55);
  }
  if (o.belt) {
    const bc = dour(o.belt.color);
    if (o.belt.rope) {
      r.line(24, 30, 40, 30, 1.1, bc[0], bc[1], bc[2]);
      r.ellipse(30, 30.6, 1.2, 1.4, bc[0] * 1.3, bc[1] * 1.3, bc[2] * 1.3); // the knot
    } else {
      r.rect(24.5, 29, 39.5, 31.6, bc[0], bc[1], bc[2]);
      if (o.belt.buckle) {
        r.rect(30.8, 29.4, 33.2, 31.2, bc[0] * 1.7, bc[1] * 1.7, bc[2] * 1.7);
        r.px(31.4, 30, bc[0] * 2.1, bc[1] * 2.1, bc[2] * 2.1);
      }
      if (o.belt.pouch) {
        r.rect(34, 30.4, 37, 33.8, bc[0] * 0.8, bc[1] * 0.8, bc[2] * 0.8);
        r.line(34, 31.4, 37, 31.4, 0.5, bc[0] * 1.3, bc[1] * 1.3, bc[2] * 1.3);
      }
    }
  }

  // Sleeves and hands over the cloth.
  const sleeveC: RGB = [over[0] * 0.85, over[1] * 0.85, over[2] * 0.85];
  const bare: RGB = [skin[0] * 0.92, skin[1] * 0.92, skin[2] * 0.92];
  for (const [shx, elb, hand, side] of [
    [24.5, elbL, handL, -1],
    [39.5, elbR, hndR, 1],
  ] as [number, [number, number], [number, number], -1 | 1][]) {
    r.tube(shx, shoulderY + 1.2, elb[0], elb[1], 3.0, sleeveC[0], sleeveC[1], sleeveC[2]);
    r.tube(elb[0], elb[1], hand[0], hand[1], 2.6, (o.rolledSleeves ? bare : sleeveC)[0], (o.rolledSleeves ? bare : sleeveC)[1], (o.rolledSleeves ? bare : sleeveC)[2]);
    if (!o.rolledSleeves) r.line(hand[0], hand[1] - 2.4, hand[0], hand[1] - 1.2, 2.8, under[0], under[1], under[2]); // cuff
    const grips = (o.props ?? []).some(
      (p) => (p.hand === "L") === (side === -1) && ["staff", "halberd", "spadeShoulder", "spade", "peel", "rake", "whip"].includes(p.kind)
    );
    handR(r, hand[0], hand[1], skin, side, grips);
  }

  // Neck, head, face, front hair, headgear.
  r.rect(fx - 1.5, headY + 3.8, fx + 1.5, shoulderY + 0.5, skin[0] * 0.55, skin[1] * 0.55, skin[2] * 0.55);
  r.rect(fx - 1.5, headY + 3.8, fx, shoulderY + 0.5, skin[0] * 0.8, skin[1] * 0.8, skin[2] * 0.8);
  faceR(r, fx, headY, skin, o.beard ?? false, o.hairColor ?? null);
  hairFrontR(r, fx, headY, o.hair, o.hairColor, 0.76);
  headgearR(r, o.head.kind, fx, headY, shoulderY, o.head.color, skin);

  // Plague marks — dark stipple on the shift, throat and arms.
  if (o.marks) {
    const mc = o.marks;
    r.px(28, 40 + bob, mc[0], mc[1], mc[2]);
    r.px(36, 45 + bob, mc[0], mc[1], mc[2]);
    r.px(31, 50 + bob, mc[0], mc[1], mc[2]);
    r.px(fx - 1.5, headY + 5, mc[0], mc[1], mc[2]);
  }

  // Hand props, last — they read on the silhouette.
  for (const p of o.props ?? []) {
    const [hx, hy] = p.kind === "tray" ? [32, 33] : p.hand === "L" ? handL : hndR;
    propR(r, p.kind, hx, hy, shoulderY);
    // Carried props tuck under the palm — the hand stays visible on top.
    if (["bundle", "basket", "bowl", "tankard"].includes(p.kind)) {
      handR(r, hx, hy, skin, p.hand === "L" ? -1 : 1, false);
    }
  }
}

function rigFrame(o: Outfit, stance: Stance, phase: number, seed = 0): SpriteTex {
  const r = new Ras();
  figureRig(r, o, stance, phase, seed);
  return finish(r.down());
}

// ---------------------------------------------------------------------------
// The crowd — eight dressings plus the patrolman (index 8, never spawned as
// a citizen). `villagerVariants` turns each into a four-phase walk cycle.
const BONE: RGB = [176, 166, 146];
const MAIL: RGB = [96, 100, 108];
const VILLAGER_OUTFITS: Outfit[] = [
  // 0 pilgrim — mud-brown ragged robe, rope belt, hood, satchel
  { skin: [166, 128, 94], hair: "crop", hairColor: HAIR_COLORS[1], beard: true, under: BONE, hose: [44, 38, 30], boots: [30, 26, 22], over: { kind: "robe", color: [74, 58, 42], hem: 52, ragged: true, patches: true }, belt: { color: [58, 44, 28], rope: true }, head: { kind: "hood", color: [54, 42, 30] }, arms: "hang", props: [{ kind: "satchel", hand: "L" }] },
  // 1 housewife — wool gown, bone kerchief, bibbed apron, basket
  { skin: [172, 134, 98], hair: "shoulder", hairColor: HAIR_COLORS[2], under: BONE, hose: [52, 46, 38], boots: [34, 28, 22], over: { kind: "gown", color: [92, 64, 48], hem: 54 }, belt: { color: [60, 50, 36] }, apron: { color: BONE, bib: true, hem: 50 }, head: { kind: "kerchief", color: [190, 180, 160] }, arms: "carryL", props: [{ kind: "basket", hand: "L" }] },
  // 2 tradesman — russet tunic, flat cap, a bundle under the arm
  { skin: [174, 136, 100], hair: "crop", hairColor: HAIR_COLORS[2], beard: true, under: BONE, hose: [46, 40, 32], boots: [30, 26, 22], bootHigh: true, over: { kind: "tunic", color: [96, 52, 40], hem: 42, trim: [60, 34, 24] }, belt: { color: [52, 38, 24], buckle: true, pouch: true }, head: { kind: "flatcap", color: [50, 36, 28] }, arms: "carryL", props: [{ kind: "bundle", hand: "L" }] },
  // 3 beggar — grey rags, barefoot, bowl held out
  { skin: [152, 118, 88], hair: "shoulder", hairColor: HAIR_COLORS[3], under: [120, 114, 104], hose: [56, 50, 44], boots: [56, 50, 44], barefoot: true, over: { kind: "rags", color: [64, 60, 54], hem: 51, patches: true }, head: { kind: "kerchief", color: [56, 52, 46] }, arms: "holdOutR", props: [{ kind: "bowl", hand: "R" }], hunch: 0.55 },
  // 4 clerk — ink-blue gown, soft cap, ledger to the chest
  { skin: [168, 132, 98], hair: "crop", hairColor: HAIR_COLORS[0], under: BONE, hose: [38, 34, 30], boots: [30, 26, 22], over: { kind: "gown", color: [48, 54, 78], hem: 47 }, belt: { color: [36, 32, 24] }, head: { kind: "cap", color: [40, 36, 48] }, arms: "fold", props: [{ kind: "ledger", hand: "R" }] },
  // 5 fieldhand — moss tunic, rolled sleeves, straw hat, rake
  { skin: [180, 142, 102], hair: "crop", hairColor: HAIR_COLORS[2], beard: true, under: BONE, hose: [50, 44, 34], boots: [34, 28, 20], over: { kind: "tunic", color: [62, 68, 44], hem: 42 }, rolledSleeves: true, head: { kind: "strawhat" }, arms: "staffR", props: [{ kind: "rake", hand: "R" }] },
  // 6 mourner — charcoal cloak and a hood that swallows the face
  { skin: [160, 124, 94], under: [120, 116, 118], hose: [36, 32, 32], boots: [24, 22, 20], over: { kind: "cloak", color: [46, 44, 48], hem: 56, ragged: true }, head: { kind: "deepHood", color: [38, 36, 42] }, arms: "fold", hunch: 0.3 },
  // 7 carter — oxblood tunic, hood down, whip trailing
  { skin: [170, 130, 96], hair: "crop", hairColor: HAIR_COLORS[1], beard: true, under: BONE, hose: [42, 36, 30], boots: [30, 26, 22], bootHigh: true, over: { kind: "tunic", color: [84, 42, 36], hem: 45, patches: true }, cowl: true, belt: { color: [48, 34, 22], buckle: true }, head: { kind: "none" }, arms: "hang", props: [{ kind: "whip", hand: "R" }] },
  // 8 patrolman — blue-grey tabard over mail, kettle helm, lantern
  { skin: [168, 130, 96], hair: "crop", hairColor: HAIR_COLORS[1], under: MAIL, hose: [40, 44, 50], boots: [30, 26, 22], bootHigh: true, over: { kind: "tabard", color: [62, 76, 96], hem: 46 }, belt: { color: [46, 36, 24], buckle: true }, head: { kind: "kettlehelm" }, arms: "carryL", props: [{ kind: "lantern", hand: "L" }] },
];

// A villager frame — `phase` 0..1 across the walk cycle.
function villagerFrame(phase: number, variant: number): SpriteTex {
  return rigFrame(VILLAGER_OUTFITS[variant % VILLAGER_OUTFITS.length], "walk", phase, variant * 17 + 3);
}

const WALK_PHASES = [0, 0.25, 0.5, 0.75];

// ---------------------------------------------------------------------------
// A standing figure — the named NPCs idle, two breathing frames each.
const IDLE_PHASES = [0, 0.5];

// Sister Marguerite — dark habit, the white wimple that makes her the
// brightest head in the quarter, hands folded. Unmistakable at distance.
const NUN: Outfit = { skin: [170, 132, 98], under: BONE, hose: [40, 38, 46], boots: [26, 24, 30], over: { kind: "habit", color: [44, 42, 54], hem: 58 }, head: { kind: "wimple" }, arms: "fold" };
function nunFrame(p: number): SpriteTex {
  return rigFrame(NUN, "stand", p, 1);
}

// Maître Aubert — olive robe, a full grey beard, the wide flat cap of an
// apothecary, his satchel of physick slung over one shoulder.
const AUBERT: Outfit = { skin: [170, 132, 96], hair: "bald", hairColor: HAIR_COLORS[3], beard: true, under: BONE, hose: [46, 40, 30], boots: [28, 24, 20], over: { kind: "robe", color: [78, 66, 40], hem: 54 }, belt: { color: [52, 38, 24] }, head: { kind: "flatcap", color: [52, 46, 30] }, arms: "hang", props: [{ kind: "satchel", hand: "L" }] };
function aubertFrame(p: number): SpriteTex {
  return rigFrame(AUBERT, "stand", p, 2);
}

// Foulques the gravedigger — drab and broad, soil-stained apron, a spade
// carried over the shoulder like a man who never puts it down.
const DIGGER: Outfit = { skin: [176, 136, 98], hair: "crop", hairColor: HAIR_COLORS[1], beard: true, under: BONE, hose: [44, 38, 30], boots: [28, 24, 18], bootHigh: true, over: { kind: "tunic", color: [62, 52, 38], hem: 46 }, apron: { color: [70, 58, 44], hem: 50 }, belt: { color: [44, 34, 22] }, head: { kind: "flatcap", color: [40, 34, 26] }, arms: "staffR", props: [{ kind: "spadeShoulder", hand: "R" }] };
function diggerFrame(p: number): SpriteTex {
  return rigFrame(DIGGER, "stand", p, 3);
}

// Widow Lambert — black mourning veil over the face, grey bun pinned up.
const WIDOW: Outfit = { skin: [162, 126, 96], hair: "bun", hairColor: HAIR_COLORS[3], under: BONE, hose: [38, 34, 36], boots: [26, 24, 24], over: { kind: "gown", color: [56, 44, 50], hem: 56 }, belt: { color: [40, 34, 38] }, head: { kind: "widowveil" }, arms: "fold" };
function widowFrame(p: number): SpriteTex {
  return rigFrame(WIDOW, "stand", p, 4);
}

// Evidence marks — a stain and scratches on the ground, examined not taken.
// Soft-edged and dim: they read as something on the floor, not an object.
function marksSprite(): SpriteTex {
  const s = makeSprite();
  const r = rng(90617);
  // A dark irregular pool soaked into the dirt.
  for (let i = 0; i < 3; i++) ellipse(s, 28 + r() * 10, 40 + r() * 8, 5 + r() * 4, 3 + r() * 3, 38, 26, 20, 170);
  // Scratches raked through it.
  for (let i = 0; i < 4; i++) line(s, 24 + r() * 14, 36 + r() * 4, 30 + r() * 14, 46 + r() * 5, 1, 28, 18, 12, 190);
  // The drag-line leading off.
  line(s, 22, 52, 44, 56, 2, 44, 30, 22, 150);
  return s; // no outline — stains shouldn't get one
}
// A folded letter — parchment with a wax seal.
function letterSprite(): SpriteTex {
  const s = makeSprite();
  rect(s, 20, 30, 44, 50, 200, 182, 142); // paper
  rect(s, 20, 30, 44, 33, 172, 154, 116); // the fold
  line(s, 20, 30, 32, 41, 1, 152, 134, 98); // fold creases
  line(s, 44, 30, 32, 41, 1, 152, 134, 98);
  ellipse(s, 32, 42, 4, 4, 148, 40, 34); // wax seal
  px(s, 31, 41, 196, 72, 62);
  return finish(s);
}
// A sprig of rue — grey-green leaves on a stem.
function rueSprite(): SpriteTex {
  const s = makeSprite();
  line(s, 32, 56, 32, 30, 1, 74, 96, 52);
  for (const [ox, oy] of [[-5, -12], [5, -16], [-6, -22], [6, -26], [-4, -30], [4, -33], [0, -36]]) {
    ellipse(s, 32 + ox, 56 + oy, 3.5, 4.5, 100, 126, 78);
  }
  ellipse(s, 32, 18, 2, 2.5, 138, 158, 100); // bud at the top
  return finish(s);
}
// A small jar of leeches — murky glass, dark shapes inside.
function leechesSprite(): SpriteTex {
  const s = makeSprite();
  // Murky glass — dark shapes curling inside.
  rect(s, 24, 28, 40, 54, 96, 110, 96, 220);
  rect(s, 25, 44, 39, 52, 40, 52, 40, 235);
  ellipse(s, 29, 48, 2.5, 1.5, 16, 12, 10);
  ellipse(s, 35, 50, 2.5, 1.5, 16, 12, 10);
  ellipse(s, 32, 46, 2, 1.5, 16, 12, 10);
  px(s, 26, 32, 180, 200, 180); // glass glint
  rect(s, 23, 25, 41, 29, 96, 66, 36); // cork lid
  return finish(s);
}
// The cure — a small vial glowing pale gold.
function cureSprite(): SpriteTex {
  const s = makeSprite();
  // A small vial of pale gold.
  rect(s, 28, 30, 36, 52, 140, 150, 140, 235); // the glass
  rect(s, 29, 40, 35, 50, 235, 200, 96); // the golden physic
  px(s, 30, 42, 255, 240, 180);
  rect(s, 29, 25, 35, 30, 96, 66, 36); // neck + cork
  return finish(s);
}
// Provost's cordon guard — drab tabard with a red cross over mail, kettle
// helm, the halberd shouldered. Reads as a different unit from the patrol.
const GUARD: Outfit = { skin: [166, 128, 94], hair: "crop", hairColor: HAIR_COLORS[1], under: MAIL, hose: [38, 42, 48], boots: [28, 24, 20], bootHigh: true, over: { kind: "tabard", color: [70, 64, 52], hem: 46 }, insignia: [120, 40, 36], belt: { color: [44, 34, 22], buckle: true }, head: { kind: "kettlehelm" }, arms: "staffR", props: [{ kind: "halberd", hand: "R" }] };
function guardFrame(phase: number): SpriteTex {
  return rigFrame(GUARD, "stand", phase, 9);
}

// Mistress Hélène, the innkeeper — russet dress, a clean white apron bib
// to hem, kerchief, a tankard never far from her hand.
const INNKEEP: Outfit = { skin: [172, 134, 98], hair: "shoulder", hairColor: HAIR_COLORS[2], under: BONE, hose: [52, 44, 36], boots: [32, 26, 20], over: { kind: "gown", color: [96, 52, 40], hem: 54 }, belt: { color: [60, 40, 28] }, apron: { color: [196, 188, 168], bib: true, hem: 52 }, head: { kind: "kerchief", color: [210, 204, 190] }, arms: "carryL", props: [{ kind: "tankard", hand: "R" }] };
function innkeepFrame(p: number): SpriteTex {
  return rigFrame(INNKEEP, "stand", p, 5);
}

// Baker Colin — flour-dusted apron over rolled sleeves, the pale round
// cap, a peel paddle in hand. You can smell the ovens off him.
const BAKER: Outfit = { skin: [178, 140, 104], hair: "crop", hairColor: HAIR_COLORS[2], under: BONE, hose: [50, 44, 34], boots: [30, 26, 22], over: { kind: "tunic", color: [92, 78, 60], hem: 48 }, rolledSleeves: true, belt: { color: [64, 48, 32] }, apron: { color: [202, 196, 180], hem: 52 }, head: { kind: "bakercap" }, arms: "raiseR", props: [{ kind: "peel", hand: "R" }] };
function bakerFrame(p: number): SpriteTex {
  return rigFrame(BAKER, "stand", p, 6);
}

// The alchemist — midnight robe and a high collar, wild grey hair, gaunt
// eyes with a feverish green glint, a vial of something wrong at his belt.
const ALCHEMIST: Outfit = { skin: [158, 128, 98], hair: "shoulder", hairColor: HAIR_COLORS[3], beard: true, under: [140, 130, 120], hose: [30, 28, 34], boots: [22, 20, 26], over: { kind: "robe", color: [36, 38, 52], hem: 57, trim: [150, 120, 60] }, belt: { color: [44, 36, 28], pouch: true }, head: { kind: "cap", color: [30, 30, 40] }, arms: "holdOutR", props: [{ kind: "vial", hand: "R" }], hunch: 0.15 };
function alchemistFrame(p: number): SpriteTex {
  return rigFrame(ALCHEMIST, "stand", p, 7);
}

// A patient of the pesthouse — a pale shift hanging off him, hunched and
// hugging himself against the fever, the dark marks showing.
const PATIENT: Outfit = { skin: [186, 172, 152], hair: "crop", hairColor: HAIR_COLORS[1], under: [200, 194, 180], hose: [100, 96, 88], boots: [168, 156, 138], barefoot: true, over: { kind: "rags", color: [116, 110, 100], hem: 52 }, head: { kind: "none" }, arms: "hug", hunch: 0.45, marks: [90, 40, 50] };
function patientFrame(p: number): SpriteTex {
  return rigFrame(PATIENT, "stand", p, 8);
}

// The grey man — all cloak and shadow, a hood with nothing inside it, the
// hem dragging the ground. The shape you tail through the dark.
const HOODED: Outfit = { skin: [24, 22, 28], under: [50, 48, 56], hose: [40, 38, 44], boots: [30, 28, 34], over: { kind: "cloak", color: [58, 56, 64], hem: 58, ragged: true }, head: { kind: "deepHood", color: [66, 64, 74] }, arms: "hang" };
function hoodedFrame(p: number): SpriteTex {
  return rigFrame(HOODED, "stand", p, 10);
}

// The herbwife — moss robes and a grey-green kerchief, a darker apron, a
// bunch of rue held up where the customer can see it.
const HERBWIFE: Outfit = { skin: [172, 136, 98], hair: "bun", hairColor: HAIR_COLORS[3], under: BONE, hose: [44, 40, 34], boots: [30, 26, 20], over: { kind: "gown", color: [58, 70, 46], hem: 52 }, belt: { color: [50, 40, 26] }, apron: { color: [62, 58, 40], hem: 48 }, head: { kind: "kerchief", color: [84, 94, 70] }, arms: "holdOutR", props: [{ kind: "rue", hand: "R" }] };
function herbwifeFrame(p: number): SpriteTex {
  return rigFrame(HERBWIFE, "stand", p, 11);
}

// The clothier — madder-red robe, a merchant's flat cap, a length of pale
// linen draped over his arm so it hangs in two falls.
const CLOTHIER: Outfit = { skin: [174, 134, 98], hair: "crop", hairColor: HAIR_COLORS[0], under: BONE, hose: [44, 38, 34], boots: [30, 26, 22], over: { kind: "tunic", color: [88, 44, 42], hem: 48, trim: [160, 140, 110] }, belt: { color: [56, 40, 26], buckle: true, pouch: true }, head: { kind: "flatcap", color: [52, 40, 34] }, arms: "carryL", props: [{ kind: "clothbolt", hand: "L" }] };
function clothierFrame(p: number): SpriteTex {
  return rigFrame(CLOTHIER, "stand", p, 12);
}

// The costermonger — brown robe under a leather apron, flat cap, a tray of
// round loaves held out before him.
const MONGER: Outfit = { skin: [176, 138, 100], hair: "crop", hairColor: HAIR_COLORS[2], beard: true, under: BONE, hose: [46, 40, 32], boots: [32, 26, 20], over: { kind: "tunic", color: [78, 60, 40], hem: 47 }, apron: { color: [74, 52, 34], hem: 50 }, head: { kind: "flatcap", color: [52, 40, 30] }, arms: "trayBoth", props: [{ kind: "tray", hand: "R" }] };
function mongerFrame(p: number): SpriteTex {
  return rigFrame(MONGER, "stand", p, 13);
}

// Mother Anette — the rag-and-bone woman, faded mauve under a patched
// shawl, grey bun pinned at the back. No shop; she sells gossip.
const ANETTE: Outfit = { skin: [168, 130, 96], hair: "bun", hairColor: HAIR_COLORS[4], under: BONE, hose: [46, 42, 40], boots: [30, 26, 22], over: { kind: "gown", color: [72, 60, 64], hem: 52, patches: true }, shawl: { color: [60, 50, 54], hem: 36 }, head: { kind: "none" }, arms: "fold" };
function anetteFrame(p: number): SpriteTex {
  return rigFrame(ANETTE, "stand", p, 14);
}

// A shrouded corpse laid out for autopsy on a stone slab.
function corpseSprite(): SpriteTex {
  const s = makeSprite();
  // The trestle board — dark wood on two legs.
  rect(s, 10, 44, 54, 49, 68, 50, 34);
  rect(s, 10, 44, 54, 45.5, 88, 66, 46);
  rect(s, 14, 49, 17, 58, 52, 40, 28);
  rect(s, 47, 49, 50, 58, 52, 40, 28);
  // The body — shroud over the legs, chest bare.
  rect(s, 21, 37, 48, 43.5, 168, 160, 148);
  ellipse(s, 37, 39.5, 11, 4.5, 168, 160, 148);
  line(s, 28, 37, 46, 37, 1, 134, 126, 116); // sheet fold
  // Exposed head and ribs — pale, waxy.
  ellipse(s, 17, 40, 4.5, 4, 186, 176, 160);
  px(s, 16, 39, 40, 34, 30);
  px(s, 19, 39, 40, 34, 30); // closed eyes
  rect(s, 22, 37.5, 30, 42, 184, 174, 158);
  for (let x = 23; x < 30; x += 2) px(s, x, 39.5, 156, 146, 134); // the ribs
  line(s, 30, 38.5, 38, 43, 2, 180, 170, 156); // arm across the board
  ellipse(s, 49, 41, 3, 2.5, 158, 146, 130); // a foot escaping the sheet
  // Toe tag.
  rect(s, 50, 37, 53, 40, 192, 182, 152);
  px(s, 51, 38, 70, 58, 44);
  return finish(s);
}
// A heap of the dead — what the alchemist dumps below.
function corpsepileSprite(): SpriteTex {
  const s = makeSprite();
  // A heap of the dead — pale shapes over a dark mound.
  ellipse(s, 32, 49, 17, 9, 46, 40, 38);
  ellipse(s, 25, 45, 9, 6, 156, 144, 128);
  ellipse(s, 38, 46, 8, 5, 144, 132, 118);
  ellipse(s, 32, 42.5, 7, 5, 168, 158, 142);
  // A face staring out of the pile — hollow eyes.
  ellipse(s, 24, 41, 4, 4, 170, 158, 140);
  px(s, 22.5, 40, 28, 24, 22);
  px(s, 26, 40, 28, 24, 22);
  px(s, 24, 42.5, 50, 44, 40); // mouth slack
  // Limbs jutting at angles.
  line(s, 22, 40, 15, 32, 2.2, 156, 144, 128);
  ellipse(s, 14.5, 31, 2, 2, 160, 148, 132); // fingers
  line(s, 42, 42, 49, 34, 2.2, 146, 134, 118);
  ellipse(s, 49.5, 33, 2.5, 2, 144, 132, 116);
  line(s, 34, 46, 41, 54, 2.2, 152, 140, 124);
  ellipse(s, 41.5, 55, 2.5, 2, 156, 142, 126);
  // A shroud slipping off the heap.
  line(s, 28, 44, 22, 55, 3.2, 128, 120, 108);
  px(s, 28, 43, 66, 56, 48);
  px(s, 36, 44, 66, 56, 48);
  return finish(s);
}
// An iron grate set into the cobbles — the way below.
function grateSprite(): SpriteTex {
  const s = makeSprite();
  // Stone surround bedded in the cobbles.
  ellipse(s, 32, 42, 15.5, 9.5, 78, 76, 74);
  ellipse(s, 32, 42, 13.5, 7.5, 54, 52, 56);
  // The opening — a pit of darkness.
  ellipse(s, 32, 42, 12, 6.5, 8, 8, 10);
  // Iron bars, slightly askew with age.
  for (const off of [-9, -5, -1, 3, 7]) line(s, 32 + off, 38, 31 + off, 46, 1.2, 74, 72, 78);
  line(s, 20, 41, 44, 41, 1, 96, 94, 100);
  // Rust and the green stain leaking below.
  px(s, 26, 39, 96, 60, 36);
  px(s, 38, 44, 96, 60, 36);
  px(s, 30, 47, 40, 60, 40);
  px(s, 34, 47.5, 36, 54, 36);
  return finish(s);
}
// An alembic — the alchemist's still, green glass over a low flame.
function alembicSprite(): SpriteTex {
  const s = makeSprite();
  // Iron stand over a low flame.
  line(s, 26, 52, 22, 60, 1.2, 60, 58, 66);
  line(s, 38, 52, 42, 60, 1.2, 60, 58, 66);
  flame(s, 32, 54, 5, 0.5);
  // The cucurbit — round flask of cloudy green glass.
  ellipse(s, 32, 38, 11, 11, 80, 150, 100, 235);
  ellipse(s, 32, 42, 9, 7, 50, 120, 70); // the tincture
  px(s, 28, 34, 180, 240, 190); // glass glint
  px(s, 30, 40, 140, 255, 160);
  // Long neck curving down to the receiver.
  line(s, 36, 30, 44, 20, 2.4, 80, 150, 100, 235);
  line(s, 44, 20, 48, 34, 2.4, 80, 150, 100, 235);
  ellipse(s, 48, 38, 4, 5, 80, 150, 100, 235);
  return finish(s);
}
// A specimen jar — grey flesh sealed in murky glass.
function specimenSprite(): SpriteTex {
  const s = makeSprite();
  rect(s, 24, 28, 40, 54, 96, 110, 96, 220); // glass
  rect(s, 25, 38, 39, 52, 52, 66, 48, 235); // murk
  ellipse(s, 32, 45, 6, 5, 96, 112, 84); // the flesh
  px(s, 29, 43, 210, 202, 180); // bone glint
  px(s, 35, 47, 60, 70, 50);
  px(s, 26, 32, 180, 200, 180);
  rect(s, 23, 25, 41, 29, 96, 66, 36); // cork lid
  return finish(s);
}
// A silver sou — the purse icon.
function coinSprite(): SpriteTex {
  const s = makeSprite();
  // A silver sou — stamped disc, fleur-de-lis abstracted.
  ellipse(s, 32, 38, 11, 11, 176, 180, 190);
  ellipse(s, 32, 38, 8.5, 8.5, 208, 212, 222);
  px(s, 32, 34, 120, 124, 136);
  px(s, 32, 36, 120, 124, 136);
  px(s, 30, 38, 120, 124, 136);
  px(s, 34, 38, 120, 124, 136);
  px(s, 32, 40, 120, 124, 136);
  px(s, 28, 42, 140, 144, 156); // rim glint
  px(s, 30, 44, 120, 124, 136);
  return finish(s);
}
// A hanging shop sign — iron bracket, chain-hung board, a painted emblem.
function signFrame(icon: "mug" | "loaf" | "mortar" | "cross" | "flask"): SpriteTex {
  const s = makeSprite();
  // Iron arm and chains.
  line(s, 18, 10, 48, 10, 2.2, 46, 44, 52);
  line(s, 24, 10, 24, 22, 1.2, 46, 44, 52);
  line(s, 44, 10, 44, 22, 1.2, 46, 44, 52);
  px(s, 20, 11, 84, 82, 90); // bolts
  px(s, 47, 11, 84, 82, 90);
  // The board — grain showing through.
  rect(s, 18, 22, 50, 46, 100, 70, 42);
  for (let y = 26; y < 44; y += 5) line(s, 20, y, 48, y + 1, 1, 80, 56, 34);
  rect(s, 18, 22, 50, 25, 66, 46, 28);
  rect(s, 18, 44, 50, 46, 66, 46, 28);
  rect(s, 18, 22, 21, 46, 66, 46, 28);
  rect(s, 47, 22, 50, 46, 66, 46, 28);
  if (icon === "mug") {
    rect(s, 29, 27, 38, 39, 210, 192, 152);
    rect(s, 30, 28, 37, 37, 174, 142, 92);
    rect(s, 39, 29, 43, 31, 210, 192, 152);
    rect(s, 39, 36, 43, 38, 210, 192, 152);
    rect(s, 41, 30, 43, 37, 210, 192, 152);
  } else if (icon === "loaf") {
    ellipse(s, 34, 33, 9, 5.5, 196, 138, 72);
    line(s, 28, 30, 31, 27, 1, 140, 96, 48);
    line(s, 33, 29, 36, 26, 1, 140, 96, 48);
    line(s, 38, 30, 41, 27, 1, 140, 96, 48);
  } else if (icon === "mortar") {
    rect(s, 28, 34, 40, 40, 180, 182, 190);
    ellipse(s, 34, 34, 6.5, 2.5, 200, 202, 210);
    line(s, 36, 30, 43, 23, 2.2, 160, 162, 170);
  } else if (icon === "flask") {
    rect(s, 32, 25, 35, 30, 96, 170, 110);
    ellipse(s, 33.5, 36, 6.5, 6, 80, 150, 96);
    px(s, 31, 33, 190, 255, 200);
  } else {
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
  // A folded bolt of pale linen.
  rect(s, 16, 34, 48, 50, 172, 162, 136);
  rect(s, 16, 34, 48, 37, 196, 184, 152); // folded top edge
  rect(s, 16, 47, 48, 50, 140, 130, 106); // under-shadow
  line(s, 22, 36, 22, 48, 1, 152, 142, 116);
  line(s, 42, 36, 42, 48, 1, 152, 142, 116);
  return finish(s);
}
// A rolled bandage with a frayed end.
function bandageSprite(): SpriteTex {
  const s = makeSprite();
  // A rolled bandage with a frayed end.
  ellipse(s, 32, 40, 13, 11, 208, 202, 186);
  ellipse(s, 32, 40, 8, 7, 172, 164, 144); // the roll's hollow centre
  ellipse(s, 32, 40, 3, 3, 112, 106, 92);
  line(s, 44, 42, 52, 48, 2.2, 198, 192, 170); // loose end trailing
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
      scale: 0.846,
      block: 0.2,
      animFps: 2.4,
    },
    villager: {
      frames: WALK_PHASES.map((p) => villagerFrame(p, 0)),
      scale: 0.819,
      block: 0.18,
      animFps: 2.6,
    },
    nun: { frames: IDLE_PHASES.map((p) => nunFrame(p)), scale: 0.801, block: 0.18, animFps: 0.6 },
    aubert: { frames: IDLE_PHASES.map((p) => aubertFrame(p)), scale: 0.801, block: 0.18, animFps: 0.6 },
    digger: { frames: IDLE_PHASES.map((p) => diggerFrame(p)), scale: 0.801, block: 0.18, animFps: 0.6 },
    widow: { frames: IDLE_PHASES.map((p) => widowFrame(p)), scale: 0.801, block: 0.18, animFps: 0.6 },
    guard: { frames: WALK_PHASES.map((p) => guardFrame(p)), scale: 0.819, block: 0.18, animFps: 1.6 },
    innkeep: { frames: IDLE_PHASES.map((p) => innkeepFrame(p)), scale: 0.801, block: 0.18, animFps: 0.6 },
    baker: { frames: IDLE_PHASES.map((p) => bakerFrame(p)), scale: 0.801, block: 0.18, animFps: 0.6 },
    alchemist: { frames: IDLE_PHASES.map((p) => alchemistFrame(p)), scale: 0.801, block: 0.18, animFps: 0.6 },
    patient: { frames: IDLE_PHASES.map((p) => patientFrame(p)), scale: 0.757, block: 0.16, animFps: 0.6 },
    hooded: { frames: IDLE_PHASES.map((p) => hoodedFrame(p)), scale: 0.819, block: 0, animFps: 0.6 },
    // The market — vendors at their boards while the sun is up.
    herbwife: { frames: IDLE_PHASES.map((p) => herbwifeFrame(p)), scale: 0.801, block: 0.18, animFps: 0.6 },
    clothier: { frames: IDLE_PHASES.map((p) => clothierFrame(p)), scale: 0.801, block: 0.18, animFps: 0.6 },
    monger: { frames: IDLE_PHASES.map((p) => mongerFrame(p)), scale: 0.801, block: 0.18, animFps: 0.6 },
    anette: { frames: IDLE_PHASES.map((p) => anetteFrame(p)), scale: 0.801, block: 0.18, animFps: 0.6 },
    // The watch — a walking man-at-arms, lantern swinging on the stride.
    patrol: { frames: WALK_PHASES.map((p) => villagerFrame(p, 8)), scale: 0.819, block: 0.18, animFps: 2.6 },
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
  return VILLAGER_OUTFITS.slice(0, 8).map((_, v) => WALK_PHASES.map((p) => villagerFrame(p, v)));
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
    parts.push({ ox: -0.075, oy: 0, w: 0.11, d: 0.13, z0: 0, z1: 0.46, tex: [legF, legS, legB, legS], swing: 0.09, phase: 0 });
    parts.push({ ox: 0.075, oy: 0, w: 0.11, d: 0.13, z0: 0, z1: 0.46, tex: [legF, legS, legB, legS], swing: 0.09, phase: Math.PI });
  } else {
    parts.push({ ox: 0, oy: 0, w: 0.29, d: 0.22, z0: 0, z1: 0.48, tex: [legF, legS, legB, legS] });
  }
  parts.push({ ox: 0, oy: 0, w: 0.31, d: 0.21, z0: 0.48, z1: 0.84, tex: [torF, torS, torB, torS] });
  if (!pal.noArms) {
    // Arms tuck a hair into the torso so the shoulder seam never shows.
    parts.push({ ox: -0.19, oy: 0, w: 0.08, d: 0.11, z0: 0.52, z1: 0.78, tex: [arm, arm, arm, arm], swing: 0.07, phase: Math.PI });
    parts.push({ ox: 0.19, oy: 0, w: 0.08, d: 0.11, z0: 0.52, z1: 0.78, tex: [arm, arm, arm, arm], swing: 0.07, phase: 0 });
  }
  parts.push({ ox: 0, oy: pal.hunch ? 0.05 : 0, w: 0.21, d: 0.19, z0: 0.84, z1: 1.04, tex: [headF, headS, headB, headS] });
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
