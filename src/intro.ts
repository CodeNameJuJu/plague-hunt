// The opening sequence — the physician's journey. A letter read under
// black, then the road west to the city: woods by day, a shuttered town at
// night, farmland, the high pass, another city's canyon, the last bare
// countryside — then the west end at nightfall: the plaza, the inn, shapes
// crossing the street, and the cordon gate where the escort leaves you.
// The road scenes are their own little maps (buildIntroMaps); `scene` names
// which one a shot films in, `day`/`sunT` carry its light. Hard cuts, a
// slow dolly in each, a title drop at the end. No pointer lock; any click
// or key skips to the game, which locks on that gesture.

import type { Player } from "./player";
import type { SpriteRuntime } from "./types";

interface Shot {
  x: number;   // camera
  y: number;
  tx: number;  // look-at target
  ty: number;
  pitch: number;   // + looks up
  dolly: number;   // tiles drifted toward the target across the shot
  dur: number;
  card?: string;
  title?: boolean; // final shot — black screen, big title
  veil?: boolean;  // camera parked under black — letter shots
  bob?: number;    // head-bob amplitude — walking shots
  sway?: number;   // slow angle drift — looking around while walking
  scene?: string;  // a buildIntroMaps key — the road scenes' maps
  day?: number;    // daylight 0..1 for this shot (defaults to night)
  sunT?: number;   // day fraction — drives the sun's bearing
}

const SHOTS: Shot[] = [
  // The commission — a letter read under black.
  { x: 0, y: 0, tx: 0, ty: 0, pitch: 0, dolly: 0, dur: 5.4, veil: true,
    card: "master physician —\n\nby decree of the provost of paris you are\ncommanded to this city. the pestilence\nin the east quarter does not abate.\n\nmake haste." },
  // The road west — woods by day.
  { x: 1.6, y: 8.5, tx: 26, ty: 8.5, pitch: 0, dolly: 8.5, dur: 5.8, bob: 1.5, sway: 0.05, scene: "woods", day: 0.9, sunT: 0.3,
    card: "west, to paris. the road runs under the trees —\nfirst light through the leaves, dew on the ruts." },
  // A town passed by night — doors barred, lamps lit, no one out.
  { x: 1.5, y: 7.5, tx: 30, ty: 7.5, pitch: 1, dolly: 9, dur: 5.4, bob: 1.5, sway: 0.04, scene: "town", day: 0.09, sunT: 0.92,
    card: "the villages bar their doors after dark —\nyou ride through with the escort's lantern, ungreeted." },
  // Farmland in daylight — fields half-gathered, one farmhouse.
  { x: 1.5, y: 9.5, tx: 32, ty: 10, pitch: -1, dolly: 9.5, dur: 6.0, bob: 1.5, sway: 0.04, scene: "farmland", day: 1, sunT: 0.45,
    card: "the fields stand half-gathered — the hands\nthat should cut them are dying somewhere east." },
  // The woods again — night this time, the lamp ahead the only promise.
  { x: 4.5, y: 8.5, tx: 33.6, ty: 7.4, pitch: 1, dolly: 7.5, dur: 5.4, bob: 1.5, sway: 0.05, scene: "woods", day: 0.1, sunT: 0.95,
    card: "the wood at night is another country —\nthe lantern stays low, the pace stays up." },
  // Over the mountain — the pass by day…
  { x: 1.5, y: 9.7, tx: 30, ty: 10.5, pitch: 4, dolly: 8.5, dur: 5.8, bob: 1.5, sway: 0.04, scene: "mountain", day: 0.85, sunT: 0.55,
    card: "the high pass — thin air, crows,\nand the road ribboning down." },
  // …and by night, the crest.
  { x: 24.5, y: 11.5, tx: 38, ty: 12.5, pitch: 3, dolly: 5.5, dur: 4.8, bob: 1.5, sway: 0.04, scene: "mountain", day: 0.12, sunT: 0.94,
    card: "you crest in the dark — wind and frost.\nsomewhere below, a smudge of lamps." },
  // Another city, by day — taller and tighter, and still quiet.
  { x: 1.5, y: 7.5, tx: 30, ty: 7.5, pitch: 2, dolly: 9, dur: 5.6, bob: 1.5, sway: 0.03, scene: "city", day: 1, sunT: 0.5,
    card: "towns pass like fever dreams — senlis,\nthen louvres. each quieter than the last." },
  // The last countryside — empty roads, empty fields.
  { x: 1.5, y: 8.5, tx: 30, ty: 8.5, pitch: 0, dolly: 9, dur: 5.6, bob: 1.5, sway: 0.04, scene: "countryside", day: 0.95, sunT: 0.6,
    card: "the last day. the nearer paris, the emptier the\nroads — carts coming out, and none going in." },
  // The treeline breaks — first roofs, the gate's lamp. Night falls.
  { x: 18.5, y: 8.5, tx: 34, ty: 8.5, pitch: 1, dolly: 6.0, dur: 5.4, bob: 1.5, sway: 0.03, scene: "woods", day: 0.12, sunT: 0.9,
    card: "then lamps, and a gate kept shut.\nparis does not open its doors for anyone." },
  // The road in — walking the west end of the main street at nightfall,
  // facades leaning into the fog.
  { x: 1.5, y: 21.7, tx: 32, ty: 21.7, pitch: 1, dolly: 9.5, dur: 6.2, bob: 1.5, sway: 0.03,
    card: "paris · anno domini 1348\n\nyou reach the west end as the lamps come on." },
  // Deeper in — shutters closing ahead of the stranger.
  { x: 12, y: 21.8, tx: 42, ty: 21.7, pitch: 2, dolly: 7.5, dur: 5.6, bob: 1.5, sway: 0.04,
    card: "nobody looks up. nobody lingers.\nthe shutters close as you pass." },
  // The plaza crossing — the well, dead centre of town.
  { x: 26.6, y: 22.9, tx: 31.5, ty: 21.6, pitch: -2, dolly: 1.0, dur: 4.6,
    card: "the well at the crossing is watched now,\nlike everything that still keeps men alive." },
  // Looking up the inn front — your lodging on the free side.
  { x: 19.4, y: 9.7, tx: 20.2, ty: 7.6, pitch: 22, dolly: 0.5, dur: 4.4,
    card: "a room at the inn waits — a desk,\na journal, a bed you will not keep." },
  // Something crossing the main street, close to the lens.
  { x: 47.2, y: 22.6, tx: 41, ty: 21.6, pitch: 0, dolly: 0.6, dur: 4.8,
    card: "they carry the bodies out by night\nand say little about where." },
  // The cordon and its gate — the escort leaves you at the brazier.
  { x: 56.6, y: 21.6, tx: 61.4, ty: 21.5, pitch: 6, dolly: 0.8, dur: 5.2,
    card: "the east quarter is sealed by decree.\nthe sick go in. nothing comes out." },
  // Title drop.
  { x: 0, y: 0, tx: 0, ty: 0, pitch: 0, dolly: 0, dur: 2.8, title: true },
];

// Decorative figures drifting west down the main street during the intro —
// the sick, the displaced, or worse. They never touch the game state.
const zoms: { x: number; y: number; stagger: number }[] = [];

let el: HTMLElement | null = null;
let card: HTMLElement | null = null;
let veil: HTMLElement | null = null;
let titleEl: HTMLElement | null = null;
let idx = 0;
let t = 0;
let active = false;
let shotAngle = 0;
let onDone: () => void = () => {};

function enter(): void {
  const s = SHOTS[idx];
  t = 0;
  shotAngle = Math.atan2(s.ty - s.y, s.tx - s.x);
  if (card) card.textContent = s.card ?? "";
  if (titleEl) titleEl.classList.toggle("show", !!s.title);
  if (veil) veil.style.opacity = s.title || s.veil ? "1" : "0";
}

function finish(): void {
  if (!active) return;
  active = false;
  window.removeEventListener("keydown", skip, true);
  window.removeEventListener("mousedown", skip, true);
  zoms.length = 0;
  onDone();
  // Let the black veil breathe a moment, then drop the overlay entirely.
  if (veil) veil.style.opacity = "0";
  if (titleEl) titleEl.classList.remove("show");
  setTimeout(() => el?.classList.remove("open"), 650);
}

function skip(): void {
  finish();
}

export function isIntroActive(): boolean {
  return active;
}

// The scene the current shot films in — a buildIntroMaps key, or null for
// the city itself (arrival shots and anything under the veil).
export function introScene(): string | null {
  return active ? SHOTS[idx]?.scene ?? null : null;
}

// The shot's light — daylight level and sun bearing. City/veiled shots fall
// back to the game's own night.
export function introLight(): { day: number; sunT: number } | null {
  if (!active) return null;
  const s = SHOTS[idx];
  if (!s || s.scene === undefined) return null;
  return { day: s.day ?? 0.05, sunT: s.sunT ?? 0.9 };
}

export function beginIntro(done: () => void): void {
  el = document.getElementById("intro")!;
  card = el.querySelector(".card")!;
  veil = el.querySelector(".veil")!;
  titleEl = el.querySelector(".title")!;
  onDone = done;
  idx = 0;
  active = true;
  // Fade in from black on the first frame.
  if (veil) veil.style.opacity = "1";
  el.classList.add("open");
  // The dead are already out.
  zoms.push(
    { x: 40.5, y: 20.8, stagger: 1.7 },
    { x: 42.8, y: 22.1, stagger: 4.2 },
    { x: 44.6, y: 21.2, stagger: 7.9 }
  );
  setTimeout(() => {
    if (!active) return;
    // enter() sets the veil per shot — the letter stays under black until
    // the first road shot drops it on the cut.
    enter();
  }, 60);
  setTimeout(() => {
    window.addEventListener("keydown", skip, true);
    window.addEventListener("mousedown", skip, true);
  }, 150);
}

export function updateIntro(dt: number, player: Player): boolean {
  if (!active) return false;
  t += dt;
  const s = SHOTS[idx];
  if (t >= s.dur) {
    idx += 1;
    if (idx >= SHOTS.length) {
      finish();
      return false;
    }
    enter();
  }
  const cur = SHOTS[idx];
  if (cur.title || cur.veil) return true; // camera parked; veil is up

  const prog = Math.min(1, t / cur.dur);
  // Slow push toward the look target.
  player.x = cur.x + Math.cos(shotAngle) * cur.dolly * prog;
  player.y = cur.y + Math.sin(shotAngle) * cur.dolly * prog;
  player.angle = shotAngle + Math.sin(t * 0.45) * (cur.sway ?? 0);
  player.pitch = cur.pitch + Math.sin(t * 0.45) * 2.5;
  // Walking shots carry a head-bob, ramped in so it doesn't pop on the cut.
  player.bob = cur.bob ? Math.sin(t * 7.2) * cur.bob * Math.min(1, prog * 4) : 0;

  // The shamblers drift west with a stumbling wobble.
  for (const z of zoms) {
    z.x -= dt * (0.28 + Math.sin(z.stagger) * 0.08);
    z.y += Math.sin(t * 1.1 + z.stagger) * dt * 0.12;
    z.y = Math.max(20.4, Math.min(23.4, z.y));
  }

  // Card fade: in over 0.8s, out over the last 0.6s.
  if (card && cur.card) {
    const fade = Math.min(t / 0.8, (cur.dur - t) / 0.6, 1);
    card.style.opacity = `${Math.max(0, fade)}`;
  }
  return true;
}

// Sprites for the decorative shamblers — same frames as the real thing.
export function introShamblerSprites(frames: SpriteRuntime["frames"], scale: number): SpriteRuntime[] {
  return zoms.map((z) => ({
    kind: "shambler",
    x: z.x,
    y: z.y,
    frames,
    scale,
    block: 0,
    animFps: 2.4,
    crossed: true,
  }));
}

// --- attract mode ------------------------------------------------------------
// The menu's living title backdrop — the same scripted-shot machinery, looping
// forever through a handful of safe street vantages while the title card sits
// on top. A couple of decorative figures drift the main street behind it.

const ATTRACT: Shot[] = [
  // Long drift down the main street toward the cordon gate and its brazier.
  { x: 44.5, y: 21.7, tx: 61, ty: 21.5, pitch: 2, dolly: 3.4, dur: 10 },
  // The plaza well, dead centre.
  { x: 26.6, y: 22.9, tx: 31.5, ty: 21.6, pitch: -2, dolly: 1.2, dur: 8 },
  // The inn front — looking up at the lit garret windows.
  { x: 19.4, y: 9.7, tx: 20.2, ty: 7.6, pitch: 18, dolly: 0.6, dur: 8 },
  // The south street toward the church and graveyard.
  { x: 40, y: 34.3, tx: 52, ty: 34.3, pitch: 4, dolly: 2.2, dur: 9 },
];

const azoms: { x: number; y: number; stagger: number }[] = [
  { x: 38.5, y: 20.9, stagger: 2.1 },
  { x: 41.2, y: 22.4, stagger: 5.6 },
];

let aIdx = 0;
let aT = 0;
let aAngle = 0;

export function updateAttract(dt: number, player: Player): void {
  aT += dt;
  if (aT >= ATTRACT[aIdx].dur) {
    aT = 0;
    aIdx = (aIdx + 1) % ATTRACT.length;
  }
  const s = ATTRACT[aIdx];
  aAngle = Math.atan2(s.ty - s.y, s.tx - s.x);
  const prog = Math.min(1, aT / s.dur);
  player.x = s.x + Math.cos(aAngle) * s.dolly * prog;
  player.y = s.y + Math.sin(aAngle) * s.dolly * prog;
  player.angle = aAngle + Math.sin(aT * 0.3) * 0.05; // breathing sway
  player.pitch = s.pitch + Math.sin(aT * 0.4) * 1.6;
  player.bob = 0;
  // The dead drift west down the main street, always.
  for (const z of azoms) {
    z.x -= dt * (0.26 + Math.sin(z.stagger) * 0.07);
    if (z.x < 33) z.x = 58 + z.stagger * 0.5; // wrap back through the fog
    z.y += Math.sin(aT * 1.1 + z.stagger) * dt * 0.1;
    z.y = Math.max(20.4, Math.min(23.4, z.y));
  }
}

export function attractShamblerSprites(frames: SpriteRuntime["frames"], scale: number): SpriteRuntime[] {
  return azoms.map((z) => ({
    kind: "shambler",
    x: z.x,
    y: z.y,
    frames,
    scale,
    block: 0,
    animFps: 2.4,
    crossed: true,
  }));
}
