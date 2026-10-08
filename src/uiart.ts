// Procedural pixel UI art — frames, bar tiles, icons and the title-screen
// doctor silhouette, all drawn on the same native-pixel grid as the figures.

import { Pix, ramp } from "./pixelart";
import type { Ramp } from "./pixelart";
import type { SpriteTex } from "./types";

type RGB = [number, number, number];

const BRONZE: Ramp = ramp([96, 70, 40]);
const IRON: Ramp = ramp([74, 74, 82]);

function texToCanvasEl(tex: SpriteTex): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = tex.w;
  c.height = tex.h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(tex.w, tex.h);
  img.data.set(tex.data);
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------------------
// A 9-slice frame tile — 2px black outer line, a 3px bevel (light top/left,
// dark bottom/right), a 1px inner dark line, rivets in the corners, the
// interior left transparent for `border-image-slice: 8`.
export function frame9Pix(tone: "bronze" | "iron" = "bronze", size = 24): SpriteTex {
  const p = new Pix(size, size);
  const R = tone === "bronze" ? BRONZE : IRON;
  const ink: RGB = [10, 8, 10];
  const m = size - 1;
  // outer black line
  for (let i = 0; i < size; i++) {
    p.set(i, 0, ink); p.set(i, 1, ink); p.set(i, m, ink); p.set(i, m - 1, ink);
    p.set(0, i, ink); p.set(1, i, ink); p.set(m, i, ink); p.set(m - 1, i, ink);
  }
  // bevel: light top/left, dark bottom/right
  for (let i = 2; i < size - 2; i++) {
    p.set(i, 2, R[2]); p.set(2, i, R[2]);
    p.set(i, 3, R[1]); p.set(3, i, R[1]);
    p.set(i, 4, R[0]); p.set(4, i, R[0]);
    p.set(i, m - 2, R[0]); p.set(m - 2, i, R[0]);
    p.set(i, m - 3, R[1]); p.set(m - 3, i, R[1]);
    p.set(i, m - 4, R[2]); p.set(m - 4, i, R[2]);
  }
  // inner dark line
  for (let i = 5; i < size - 5; i++) {
    p.set(i, 5, ink); p.set(i, m - 5, ink);
    p.set(5, i, ink); p.set(m - 5, i, ink);
  }
  // corner rivets
  for (const [rx, ry] of [[3, 3], [m - 3, 3], [3, m - 3], [m - 3, m - 3]] as const) {
    p.set(rx, ry, R[3]);
  }
  return { w: size, h: size, data: new Uint8Array(p.data) };
}

export function frame9(tone: "bronze" | "iron" = "bronze", size = 24): string {
  return texToCanvasEl(frame9Pix(tone, size)).toDataURL();
}

// Apply a frame9 as the element's border-image.
export function applyFrame(el: HTMLElement, tone: "bronze" | "iron" = "bronze"): void {
  el.classList.add(tone === "bronze" ? "f9" : "f9i");
  el.style.borderImageSource = `url("${frame9(tone)}")`;
}

// ---------------------------------------------------------------------------
// An 8×8 bar segment — bright top row, base fill, dark bottom row, a dark
// right column so repeating tiles read as segments.
export function barTilePix(color: RGB): SpriteTex {
  const p = new Pix(8, 8);
  const R = ramp(color);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 7; x++)
      p.set(x, y, y === 0 ? R[2] : y >= 6 ? R[0] : R[1]);
  for (let y = 0; y < 8; y++) p.set(7, y, R[0]); // segment gap
  return { w: 8, h: 8, data: new Uint8Array(p.data) };
}

export function barTile(color: RGB): string {
  return texToCanvasEl(barTilePix(color)).toDataURL();
}

// ---------------------------------------------------------------------------
// 12×12 need-bar icons.
export function iconPix(kind: "heart" | "bread" | "drop" | "moon"): HTMLCanvasElement {
  const p = new Pix(12, 12);
  const set = (x: number, y: number, c: RGB): void => p.set(x, y, c);
  if (kind === "heart") {
    const r = ramp([150, 40, 40]);
    for (const [x, y] of [[2, 2], [3, 1], [4, 1], [5, 2], [7, 2], [8, 1], [9, 1], [10, 2], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [5, 6], [6, 6], [7, 6], [5, 7], [6, 7], [6, 8]] as const) set(x, y, r[1]);
    set(3, 2, r[3]); set(4, 2, r[3]);
  } else if (kind === "bread") {
    const r = ramp([170, 120, 40]);
    p.ellipse(6, 6, 5, 3.5, r[1]);
    p.line(3, 4, 4, 7, r[0]); p.line(6, 3, 7, 6, r[0]); p.line(9, 4, 9, 6, r[0]);
  } else if (kind === "drop") {
    const r = ramp([60, 110, 170]);
    for (const [x, y] of [[6, 1], [5, 2], [6, 2], [4, 3], [5, 3], [6, 3], [7, 3], [4, 4], [5, 4], [6, 4], [7, 4], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [4, 8], [5, 8], [6, 8], [7, 8], [5, 9], [6, 9], [7, 9]] as const) set(x, y, r[1]);
    set(5, 4, r[3]); set(4, 5, r[3]);
  } else {
    const r = ramp([110, 80, 150]);
    p.ellipse(6, 6, 4.5, 4.5, r[1]);
    p.ellipse(8, 5, 4, 4, [12, 9, 10]); // bitten crescent
    set(4, 4, r[3]); set(4, 7, r[2]);
  }
  const c = texToCanvasEl({ w: 12, h: 12, data: new Uint8Array(p.data) });
  c.style.imageRendering = "pixelated";
  return c;
}

// ---------------------------------------------------------------------------
// The plague doctor, chest up, three-quarter view — a black mass against the
// moon with two interior highlight tones. w×h at pixel scale (192×256).
export function silhouettePix(w = 192, h = 256): SpriteTex {
  const p = new Pix(w, h);
  const black: RGB = [6, 5, 8];
  const dim: RGB = [22, 18, 24];
  const warm: RGB = [60, 48, 30];
  const cx = w * 0.52; // chest-up centre, face turned left
  const headY = h * 0.36;

  // Cloak shoulders — a broad black mass filling the bottom.
  p.poly(
    [[cx - w * 0.46, h], [cx - w * 0.4, h * 0.62], [cx - w * 0.22, h * 0.5], [cx + w * 0.18, h * 0.5], [cx + w * 0.42, h * 0.62], [cx + w * 0.46, h]],
    black
  );
  // High collar.
  p.poly([[cx - w * 0.14, h * 0.52], [cx - w * 0.1, h * 0.42], [cx + w * 0.12, h * 0.42], [cx + w * 0.16, h * 0.52]], black);

  // Head mass — the masked face in profile-ish three-quarter.
  p.ellipse(cx - w * 0.02, headY, w * 0.075, h * 0.062, black);
  // The beak — a long taper pointing left-down.
  p.poly(
    [[cx - w * 0.09, headY - h * 0.01], [cx - w * 0.30, headY + h * 0.06], [cx - w * 0.32, headY + h * 0.075], [cx - w * 0.08, headY + h * 0.045]],
    black
  );
  // Wide-brimmed hat — brim 150px wide, low crown.
  const brimY = headY - h * 0.085;
  p.ellipse(cx, brimY, w * 0.39, h * 0.028, black); // 150px brim
  p.ellipse(cx, brimY - h * 0.045, w * 0.13, h * 0.05, black); // crown
  p.rect(cx - w * 0.12, brimY - h * 0.02, cx + w * 0.12, brimY - h * 0.008, black); // hat band zone

  // Interior highlights — barely-there tones along edges.
  // hat brim top edge
  for (let x = Math.round(cx - w * 0.3); x < cx + w * 0.1; x++) {
    const dx = (x - cx) / (w * 0.39);
    if (dx * dx < 0.8) p.set(x, Math.round(brimY - h * 0.028 * Math.sqrt(1 - dx * dx)), dim);
  }
  // beak ridge
  p.thickLine(cx - w * 0.28, headY + h * 0.052, cx - w * 0.1, headY - h * 0.005, 2, dim);
  // collar fold
  p.thickLine(cx - w * 0.1, h * 0.44, cx - w * 0.13, h * 0.52, 2, dim);
  p.thickLine(cx + w * 0.3, h * 0.58, cx + w * 0.4, h * 0.62, 2, dim); // shoulder edge

  // The goggle lens — one amber disc with a dark rim and a catch-light.
  const lx = Math.round(cx - w * 0.03), ly = Math.round(headY - h * 0.005);
  p.ellipse(lx, ly, 5, 5, [40, 28, 16]); // dark rim
  p.ellipse(lx, ly, 3.5, 3.5, [200, 140, 50]); // amber glass
  p.rect(lx - 2, ly - 2, lx - 1, ly - 1, warm); // catch-light
  p.set(lx - 2, ly - 2, [240, 200, 120]);

  return { w, h, data: new Uint8Array(p.data) };
}

export function doctorSilhouette(w = 192, h = 256): HTMLCanvasElement {
  const c = texToCanvasEl(silhouettePix(w, h));
  c.style.imageRendering = "pixelated";
  return c;
}

// ---------------------------------------------------------------------------
// The HUD centre emblem — the doctor's mask in a bronze frame, 48×48.
export function emblemPix(mask: SpriteTex): SpriteTex {
  const S = 48;
  const p = new Pix(S, S);
  // leather interior
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, [16, 13, 15]);
  // bronze frame
  for (let i = 0; i < S; i++) {
    p.set(i, 0, [10, 8, 10]); p.set(i, S - 1, [10, 8, 10]);
    p.set(0, i, [10, 8, 10]); p.set(S - 1, i, [10, 8, 10]);
    p.set(i, 1, BRONZE[2]); p.set(1, i, BRONZE[2]);
    p.set(i, S - 2, BRONZE[0]); p.set(S - 2, i, BRONZE[0]);
    p.set(i, 2, BRONZE[1]); p.set(2, i, BRONZE[1]);
    p.set(i, S - 3, BRONZE[1]); p.set(S - 3, i, BRONZE[1]);
  }
  for (const [rx, ry] of [[2, 2], [S - 3, 2], [2, S - 3], [S - 3, S - 3]] as const) p.set(rx, ry, BRONZE[3]);
  // the mask, nearest-sampled into the middle 40×40
  const inner = 40, off = 4;
  for (let y = 0; y < inner; y++)
    for (let x = 0; x < inner; x++) {
      const sx = Math.floor((x / inner) * mask.w);
      const sy = Math.floor((y / inner) * mask.h);
      const i = (sy * mask.w + sx) * 4;
      if (mask.data[i + 3] >= 128) p.set(off + x, off + y, [mask.data[i], mask.data[i + 1], mask.data[i + 2]]);
    }
  return { w: S, h: S, data: new Uint8Array(p.data) };
}

export function maskEmblem(mask: SpriteTex): HTMLCanvasElement {
  const c = texToCanvasEl(emblemPix(mask));
  c.style.imageRendering = "pixelated";
  return c;
}
