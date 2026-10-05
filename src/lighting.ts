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

// Sample total light at a world position. `ambient` is the global light level
// (it follows the day/night cycle) and `ambientWarm` is its tint — interiors
// pass a warm value so the hearth-glow floor reads as embers, not moonlight.
// `out` is reused to avoid allocations in the per-pixel inner loop.
export function lightAt(
  x: number,
  y: number,
  lights: LightDef[],
  flick: Float64Array,
  ambient: number,
  ambientWarm: number,
  out: LightSample
): void {
  let bright = ambient;
  let warmSum = ambient * ambientWarm;
  for (let i = 0; i < lights.length; i++) {
    const l = lights[i];
    const dx = l.x - x;
    const dy = l.y - y;
    const d2 = dx * dx + dy * dy;
    const r2 = l.radius * l.radius;
    if (d2 >= r2) continue;
    const att = 1 - Math.sqrt(d2) / l.radius;
    const c = l.intensity * flick[i] * att * att;
    bright += c;
    warmSum += c * l.warm;
  }
  out.bright = bright;
  // warm = share of the total light that came from a warm source.
  out.warm = bright > 0 ? warmSum / Math.max(0.001, bright) : 0;
}
