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
  // One continuous contour, filled once — a silhouette is a single shape,
  // not a stack of parts. Clockwise from the top of the crown; the figure
  // faces left in three-quarter, chest up, cloak running off the bottom.
  const P = (x: number, y: number): [number, number] => [Math.round(x * w), Math.round(y * h)];
  const contour: [number, number][] = [
    // crown — a soft dome, slightly dented
    P(0.40, 0.13), P(0.47, 0.11), P(0.55, 0.12), P(0.61, 0.15), P(0.63, 0.21), P(0.63, 0.245),
    // brim, right wing — a long shallow sweep with a lifted tip
    P(0.74, 0.25), P(0.84, 0.25), P(0.91, 0.248), P(0.93, 0.258), P(0.93, 0.272), P(0.89, 0.285), P(0.80, 0.295), P(0.70, 0.30),
    // down the back of the head and neck into the collar
    P(0.665, 0.31), P(0.67, 0.37), P(0.65, 0.42), P(0.70, 0.44),
    // right shoulder and cloak edge sweeping out of frame
    P(0.80, 0.49), P(0.89, 0.57), P(0.95, 0.70), P(0.98, 0.86), P(0.99, 1.0),
    P(0.01, 1.0),
    // left cloak edge up to the shoulder
    P(0.03, 0.84), P(0.06, 0.70), P(0.12, 0.58), P(0.19, 0.51),
    // collar front, raised against the jaw
    P(0.29, 0.465), P(0.35, 0.445), P(0.40, 0.445),
    // under the beak back to its tip
    P(0.38, 0.425), P(0.26, 0.45), P(0.14, 0.475), P(0.08, 0.485), P(0.07, 0.47),
    // beak upper edge rising to the brow
    P(0.16, 0.44), P(0.27, 0.395), P(0.36, 0.345), P(0.405, 0.315),
    // brim, left wing — underside then tip then top edge back to the crown
    P(0.30, 0.31), P(0.18, 0.30), P(0.09, 0.285), P(0.06, 0.272), P(0.06, 0.258), P(0.09, 0.248), P(0.18, 0.25), P(0.30, 0.25), P(0.37, 0.245),
    P(0.37, 0.21), P(0.38, 0.16),
  ];
  p.poly(contour, black);

  // Interior tones — the barest rim of light where the moon catches an edge.
  // A 2px line just inside the contour along the lit (upper-left) edges.
  const edge = (a: [number, number], b: [number, number], c: RGB = dim): void => p.thickLine(a[0], a[1], b[0], b[1], 2, c);
  edge(P(0.41, 0.145), P(0.54, 0.13)); // crown top
  edge(P(0.09, 0.26), P(0.36, 0.258)); // brim top, left wing
  edge(P(0.64, 0.258), P(0.90, 0.26)); // brim top, right wing
  edge(P(0.10, 0.472), P(0.39, 0.33)); // beak ridge
  edge(P(0.30, 0.475), P(0.40, 0.455)); // collar lip
  edge(P(0.20, 0.52), P(0.13, 0.59)); // left shoulder fold
  edge(P(0.07, 0.72), P(0.045, 0.86), [14, 12, 16]); // cloak edge, barely
  // Hat band — a darker-than-black line where the band sits.
  p.thickLine(P(0.38, 0.235)[0], P(0.38, 0.235)[1], P(0.63, 0.235)[0], P(0.63, 0.235)[1], 2, [2, 2, 3]);

  // The goggle lens — one amber disc with a dark rim and a catch-light.
  const [lx, ly] = P(0.47, 0.345);
  p.ellipse(lx, ly, 6, 6, [40, 28, 16]); // dark rim
  p.ellipse(lx, ly, 4, 4, [200, 140, 50]); // amber glass
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
