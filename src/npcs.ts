import { isBlocked, streetCells, villagerSpots } from "./map";
import type { Spot } from "./map";
import type { Player } from "./player";
import type { GameMap, SpriteRuntime } from "./types";

// Villagers — hooded citizens with a home, errands and a routine. Each one
// steps out of their own doorway in the morning, drifts between the well,
// the shops' stoops and the tavern through the day, and walks home at dusk —
// nobody simply vanishes in the street any more. They are the inversion of
// the shamblers: day means life, night means the dead.

const VILLAGER_MAX = 15;
const VILLAGER_RADIUS = 0.24;
const SPAWN_INTERVAL = 1.4;

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
