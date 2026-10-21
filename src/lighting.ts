import type { LightDef } from "./types";

// Lighting is a handful of flickering point lights over a near-black ambient.
// `warm` blends between cold darkness (blue moonlight) and firelight.

export interface LightSample {
  bright: number;
  warm: number;
}

// Per-frame flicker multipliers — computed once per frame, not per pixel.
export function computeFlicker(lights: LightDef[], t: number): Float64Array {
  const out = new Float64Array(lights.length);
  for (let i = 0; i < lights.length; i++) {
    const p = lights[i].phase;
    out[i] =
      1 +
      0.16 * Math.sin(t * 11 + p) +
      0.09 * Math.sin(t * 27.3 + p * 2.7) +
      0.05 * Math.sin(t * 53 + p * 1.3);
  }
  return out;
}

// The light field baked into a per-cell grid once per frame. Every lamp
// splats its contribution into the cells inside its radius, so the
// renderer's per-pixel inner loops read a bilinear lookup instead of
// walking the whole lamp list for every dot of the screen — ~130k pixels
// times ~40 lamps was the frame's whole cost.
export class LightGrid {
  readonly bright: Float32Array; // total light, ambient excluded
  readonly warm: Float32Array; // warm share of that light, weighted
  constructor(
    readonly w: number,
    readonly h: number
  ) {
    this.bright = new Float32Array(w * h);
    this.warm = new Float32Array(w * h);
  }
}

export function splatLights(grid: LightGrid, lights: LightDef[], flick: Float64Array): void {
  grid.bright.fill(0);
  grid.warm.fill(0);
  for (let i = 0; i < lights.length; i++) {
    const l = lights[i];
    if (l.radius <= 0 || l.intensity <= 0) continue;
    const x0 = Math.max(0, Math.floor(l.x - l.radius));
    const x1 = Math.min(grid.w - 1, Math.floor(l.x + l.radius));
    const y0 = Math.max(0, Math.floor(l.y - l.radius));
    const y1 = Math.min(grid.h - 1, Math.floor(l.y + l.radius));
    const r2 = l.radius * l.radius;
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * grid.w;
      const dy = cy + 0.5 - l.y;
      for (let cx = x0; cx <= x1; cx++) {
        const dx = cx + 0.5 - l.x;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const att = 1 - Math.sqrt(d2) / l.radius;
        const c = l.intensity * flick[i] * att * att;
        grid.bright[row + cx] += c;
        grid.warm[row + cx] += c * l.warm;
      }
    }
  }
}

// Bilinear fetch — the grid holds values at cell centres, so the sample
// sits on a lattice offset half a cell.
function cellSample(a: Float32Array, w: number, h: number, x: number, y: number): number {
  const gx = x - 0.5;
  const gy = y - 0.5;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const s00 = x0 >= 0 && y0 >= 0 && x0 < w && y0 < h ? a[y0 * w + x0] : 0;
  const s10 = x0 + 1 >= 0 && y0 >= 0 && x0 + 1 < w && y0 < h ? a[y0 * w + x0 + 1] : 0;
  const s01 = x0 >= 0 && y0 + 1 >= 0 && x0 < w && y0 + 1 < h ? a[(y0 + 1) * w + x0] : 0;
  const s11 = x0 + 1 >= 0 && y0 + 1 >= 0 && x0 + 1 < w && y0 + 1 < h ? a[(y0 + 1) * w + x0 + 1] : 0;
  const top = s00 + (s10 - s00) * fx;
  return top + (s01 + (s11 - s01) * fx - top) * fy;
}

// Sample total light at a world position from the baked grid. `ambient` is
// the global light level (it follows the day/night cycle) and `ambientWarm`
// is its tint — interiors pass a warm value so the hearth-glow floor reads
// as embers, not moonlight. `out` is reused to avoid allocations in the
// per-pixel inner loop.
export function lightAtGrid(
  grid: LightGrid,
  x: number,
  y: number,
  ambient: number,
  ambientWarm: number,
  out: LightSample
): void {
  const b = cellSample(grid.bright, grid.w, grid.h, x, y);
  const wsum = cellSample(grid.warm, grid.w, grid.h, x, y);
  out.bright = ambient + b;
  // warm = share of the total light that came from a warm source.
  out.warm = out.bright > 0 ? (ambient * ambientWarm + wsum) / Math.max(0.001, out.bright) : 0;
}
