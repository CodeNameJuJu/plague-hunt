import { isBlocked, streetCells, villagerSpots } from "./map";
import type { Spot } from "./map";
import type { Player } from "./player";
import type { GameMap, LightDef, SpriteRuntime } from "./types";
import type { QuestNPC } from "./quests";

// Villagers — hooded citizens with a home, errands and a routine. Each one
// steps out of their own doorway in the morning, drifts between the well,
// the shops' stoops and the tavern through the day, and walks home at dusk —
// nobody simply vanishes in the street any more. They are the inversion of
// the shamblers: day means life, night means the dead.

const VILLAGER_MAX = 22;
const VILLAGER_RADIUS = 0.24;
const SPAWN_INTERVAL = 0.85;

export interface Villager {
  x: number;
  y: number;
  tx: number;
  ty: number;
  progress: number; // distance made toward target; re-target when it stalls
  variant: number; // 0..1 — picks a dressing from the variant frames
  speed: number; // everyone walks their own pace
  scale: number; // a little height variety
  wait: number; // dawdling — buying bread, hailing a neighbour
  home: Spot; // the doorway they live behind
  homeward: boolean; // dusk — walking back to their own door
}

export interface VillagerState {
  list: Villager[];
  cells: number[]; // open street cell indices — strolling ground
  homes: Spot[]; // every house's front step on the free side
  haunts: Spot[]; // the well, the plaza, the named stoops
  tavern: Spot; // the inn's door — where the evening leads
  spawnTimer: number;
  rand: () => number;
}

function mulberry(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeVillagers(map: GameMap): VillagerState {
  const { homes, haunts, tavern } = villagerSpots();
  return {
    list: [],
    cells: streetCells(map),
    homes,
    haunts,
    tavern,
    spawnTimer: 0,
    rand: mulberry(Math.floor(Math.random() * 1e9) + 7),
  };
}

function cellCenter(cells: number[], i: number, w: number): Spot {
  const c = cells[i];
  return { x: (c % w) + 0.5, y: Math.floor(c / w) + 0.5 };
}

// Where a day's errand leads: the evening draws folk to the tavern, the rest
// of the day splits between the named stoops and plain strolling.
function pickErrand(state: VillagerState, tday: number, w: number): Spot {
  const r = state.rand();
  if (tday > 0.34 && tday < 0.52 && r < 0.45) return state.tavern;
  if (r < 0.55) return state.haunts[Math.floor(state.rand() * state.haunts.length)];
  return cellCenter(state.cells, Math.floor(state.rand() * state.cells.length), w);
}

export function updateVillagers(
  state: VillagerState,
  dt: number,
  daylight: number,
  tday: number,
  map: GameMap,
  player: Player
): void {
  const day = daylight > 0.25;
  const dusk = daylight < 0.42; // the light failing — time to turn for home
  if (daylight < 0.1) {
    // Full dark — anyone still out has slipped indoors.
    state.list.length = 0;
    state.spawnTimer = 0;
    return;
  }

  state.spawnTimer -= dt;
  if (day && state.list.length < VILLAGER_MAX && state.spawnTimer <= 0) {
    state.spawnTimer = SPAWN_INTERVAL;
    // Step out of a doorway — everyone's day starts at their own doorstep.
    const homes = state.homes.filter((h) => {
      const dx = h.x - player.x;
      const dy = h.y - player.y;
      return dx * dx + dy * dy > 4;
    });
    if (homes.length > 0) {
      const home = homes[Math.floor(state.rand() * homes.length)];
      const errand = pickErrand(state, tday, map.w);
      state.list.push({
        x: home.x,
        y: home.y,
        tx: errand.x,
        ty: errand.y,
        progress: 0,
        variant: state.rand(),
        speed: 0.55 + state.rand() * 0.4,
        scale: 0.86 + state.rand() * 0.12,
        wait: 0,
        home,
        homeward: false,
      });
    }
  }

  for (let i = state.list.length - 1; i >= 0; i--) {
    const v = state.list[i];
    // The light is going — turn for your own doorstep, whatever the errand.
    if (dusk && !v.homeward) {
      v.homeward = true;
      v.tx = v.home.x;
      v.ty = v.home.y;
      v.wait = 0;
      v.progress = 0;
    }
    if (v.wait > 0) {
      v.wait -= dt;
      if (v.wait <= 0 && !v.homeward) {
        // Done dawdling — off on the next errand.
        const t = pickErrand(state, tday, map.w);
        v.tx = t.x;
        v.ty = t.y;
        v.progress = 0;
      }
      continue;
    }
    const dx = v.tx - v.x;
    const dy = v.ty - v.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5 || v.progress > 30) {
      if (v.homeward) {
        // Reached the doorstep — gone inside until morning. A stalled
        // homeward walk ends the same way: they found another way in.
        state.list.splice(i, 1);
        continue;
      }
      // Arrived, or wandered too long — stand a while, then move on.
      v.wait = 0.6 + state.rand() * 4;
      continue;
    }
    const nx = v.x + (dx / d) * v.speed * dt;
    const ny = v.y + (dy / d) * v.speed * dt;
    const ox = v.x;
    const oy = v.y;
    if (!isBlocked(map, nx, v.y, VILLAGER_RADIUS)) v.x = nx;
    if (!isBlocked(map, v.x, ny, VILLAGER_RADIUS)) v.y = ny;
    v.progress += Math.hypot(v.x - ox, v.y - oy) > 0.0001 ? 0 : dt; // stall timer
    if (Math.hypot(v.x - ox, v.y - oy) < 0.0001) v.progress += dt * 8; // stuck — re-target soon
  }
}

export function villagerSprites(
  state: VillagerState,
  variants: SpriteRuntime["frames"][],
  scale: number
): SpriteRuntime[] {
  return state.list.map((v) => ({
    kind: "villager",
    x: v.x,
    y: v.y,
    frames: variants[Math.min(variants.length - 1, Math.floor(v.variant * variants.length))],
    scale: scale * v.scale,
    block: 0,
    animFps: 2.2 + v.speed, // faster walkers swing their arms faster
  }));
}

// ---------------------------------------------------------------------------
// The watch — pairs of men-at-arms beating fixed rounds through the free
// quarter, day and night. A patrol rides a polyline by arc length: no
// steering, no wandering, just the steady tramp from one end of the beat
// to the other and back. The second man walks a stride behind and a pace
// to the side. After dark each carries a lantern — the light pool is what
// actually moves down the street.
//
// The routes hug the street centrelines and are checked against the props;
// they stay west of the cordon — nobody patrols the sealed side.

const PATROL_SPEED = 0.75;

interface PatrolRoute {
  pts: Spot[];
  cum: number[]; // cumulative arc length at each waypoint
  len: number;
}

interface PatrolGuard {
  route: number;
  s: number; // arc-length position along the route
  dir: 1 | -1; // beats are walked out and back
  lat: number; // lateral offset — the pair marches two abreast
}

export interface PatrolState {
  routes: PatrolRoute[];
  guards: PatrolGuard[];
  // Written by patrolPositions — the world positions each frame.
  pos: { x: number; y: number }[];
}

function makeRoute(pts: Spot[]): PatrolRoute {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return { pts, cum, len: cum[cum.length - 1] };
}

export function makePatrols(): PatrolState {
  const routes = [
    // The main street — west end to the gate, ducking south of the dead cart.
    makeRoute([
      { x: 4.5, y: 21.35 },
      { x: 22.0, y: 21.35 },
      { x: 24.0, y: 22.6 },
      { x: 57.0, y: 22.5 },
    ]),
    // The north street — bakery to the cordon's north end, hugging the
    // south side where the door planters stand.
    makeRoute([{ x: 4.5, y: 9.62 }, { x: 58.5, y: 9.62 }]),
    // The south street — the long way to the graveyard steps.
    makeRoute([{ x: 4.5, y: 34.45 }, { x: 48.5, y: 34.45 }]),
    // The centre lane — north street down to the plaza's north-west corner,
    // turning back where the market crowds the way.
    makeRoute([{ x: 29.72, y: 9.5 }, { x: 29.6, y: 18.9 }]),
  ];
  const guards: PatrolGuard[] = [];
  for (let r = 0; r < routes.length; r++) {
    guards.push({ route: r, s: routes[r].len * (0.15 + r * 0.22), dir: 1, lat: -0.14 });
    guards.push({ route: r, s: routes[r].len * (0.15 + r * 0.22) - 0.9, dir: 1, lat: 0.14 });
  }
  return { routes, guards, pos: guards.map(() => ({ x: 0, y: 0 })) };
}

export function updatePatrols(state: PatrolState, dt: number): void {
  for (let i = 0; i < state.guards.length; i++) {
    const g = state.guards[i];
    const r = state.routes[g.route];
    g.s += g.dir * PATROL_SPEED * dt;
    if (g.s >= r.len) { g.s = r.len; g.dir = -1; }
    else if (g.s <= 0) { g.s = 0; g.dir = 1; }
    // Walk the polyline to the guard's arc length, then step off by the
    // lane offset so pairs don't march in single file.
    let seg = 0;
    while (seg < r.pts.length - 2 && r.cum[seg + 1] < g.s) seg++;
    const a = r.pts[seg];
    const b = r.pts[seg + 1];
    const segLen = r.cum[seg + 1] - r.cum[seg] || 1;
    const t = Math.max(0, Math.min(1, (g.s - r.cum[seg]) / segLen));
    const dx = (b.x - a.x) / segLen;
    const dy = (b.y - a.y) / segLen;
    state.pos[i].x = a.x + (b.x - a.x) * t - dy * g.lat;
    state.pos[i].y = a.y + (b.y - a.y) * t + dx * g.lat;
  }
}

export function patrolSprites(
  state: PatrolState,
  frames: SpriteRuntime["frames"],
  scale: number
): SpriteRuntime[] {
  return state.pos.map((p) => ({
    kind: "patrol",
    x: p.x,
    y: p.y,
    frames,
    scale,
    block: 0,
    animFps: 2.2 + PATROL_SPEED,
  }));
}

// The lanterns — a warm pool walking with each guard. Only added to the
// light list when the streets are dark; by day the lantern in the sprite
// reads as glass and brass on its own.
export function patrolLanterns(state: PatrolState): LightDef[] {
  return state.pos.map((p, i) => ({
    x: p.x,
    y: p.y,
    radius: 6.0,
    intensity: 1.0,
    warm: 1,
    phase: i * 1.618,
  }));
}

// ---------------------------------------------------------------------------
// The market — the vendors hold the plaza's stalls while the sun is up and
// pack the boards at dusk. They're QuestNPCs whose positions live at the
// stall by day and inside their own houses by night, so nothing in the
// streets can be sold after dark and the plaza empties on its own.

interface MarketVendor {
  npc: QuestNPC;
  sprite: SpriteRuntime;
  stall: Spot;
  home: Spot;
}

export interface MarketState {
  vendors: MarketVendor[];
}

// Home lodgings — interior cells of shuttered houses; reachable in principle
// (doors open) but out of everyone's way.
const VENDOR_HOMES: Record<string, Spot> = {
  herbwife: { x: 33.5, y: 13.5 },
  clothier: { x: 26.5, y: 27.5 },
  anette: { x: 5.5, y: 12.5 },
  monger: { x: 42.5, y: 17.5 },
};

export function makeMarket(npcs: QuestNPC[], sprites: SpriteRuntime[]): MarketState {
  const vendors: MarketVendor[] = [];
  for (const [id, home] of Object.entries(VENDOR_HOMES)) {
    const npc = npcs.find((n) => n.id === id);
    const sprite = sprites.find((s) => s.kind === id);
    if (!npc || !sprite) continue;
    vendors.push({ npc, sprite, stall: { x: npc.x, y: npc.y }, home });
  }
  return { vendors };
}

export function updateMarket(state: MarketState, daylight: number): void {
  const open = daylight > 0.3;
  for (const v of state.vendors) {
    const p = open ? v.stall : v.home;
    v.npc.x = p.x;
    v.npc.y = p.y;
    // Packed up and gone — the sprite leaves the street entirely.
    v.sprite.taken = !open;
  }
}
