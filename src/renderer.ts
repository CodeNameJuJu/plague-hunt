import {
  EYE_H,
  GRAIN_AMOUNT,
  HEARTH_GLOW,
  HEARTH_WARM,
  INDOOR_AMBIENT,
  INTERNAL_HEIGHT as H,
  INTERNAL_WIDTH as W,
  LIGHT_BANDS,
  TEX_SIZE,
} from "./config";
import { computeFlicker, lightAtGrid, LightGrid, splatLights } from "./lighting";
import { settings } from "./settings";
import type { LightSample } from "./lighting";
import type { GameMap, LightDef, PropDef, PropFace, SpriteRuntime, Texture, TextureSet } from "./types";
import type { Player } from "./player";

// Colour of the dark. Everything fades toward this with distance — a deep
// indigo, so the dark itself is a colour rather than an absence.
const FOG_R = 10;
const FOG_G = 8;
const FOG_B = 24;

// Height of a window sill in storeys — the open slit sits above it.
const SILL_H = 0.42;

// Light tints: cold indigo darkness vs hot amber firelight — the Warlock
// split, shadow and lamplight as opposing hues.
const COOL = { r: 0.56, g: 0.68, b: 1.0 };
const WARM = { r: 1.18, g: 0.78, b: 0.4 };

// Ordered dithering — a 4×4 Bayer matrix (values 0–1). Quake's colormap
// shading is the reference: band boundaries dissolve into stipple instead
// of reading as clean contour lines.
const BAYER: number[] = (() => {
  const m = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  return m.map((v) => (v + 0.5) / 16);
})();

// How far the dither can push a pixel across its band boundary — a bit more
// than one band so transitions stipple rather than just jitter.
const DITHER_AMP = 1.3 / (LIGHT_BANDS - 1);

// Palette crunch — final colours are posterised to this many steps per
// channel, with the Bayer matrix dithering the boundary. The 8-bit soul.
const POSTER_STEP = 255 / 24;

// The sky dome wheels very slowly — texture u is compass bearing, so the
// whole sky turns once in about eleven minutes.
const SKY_SCROLL = 0.0015;

// The sun arcs east to west through the day (dayFrac 0 → 0.55), its light
// read directionally on wall faces. Below the horizon it is gone.
const SUN_ARC_END = 0.55; // the dayFrac of sundown
const SUN_PEAK_EL = 0.36; // noon height, as a fraction of screen height

// The top band of every exterior wall is drawn from a roof texture — a slim
// slice of storeys so the skyline reads as eaves and tiles, not flat boxes.
const ROOF_BAND = 0.3;
const ROOF_SLATE = 16;
const ROOF_TILE = 17;
const ROOF_PARAPET = 18;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private buf: Uint8ClampedArray;
  private zbuf: Float64Array;
  private sample: LightSample = { bright: 0, warm: 0 };
  private grainRand = 1234;
  // Set per frame from the day/night cycle.
  private ambient = 0;
  private daylight = 0;
  // The sun's bearing and height for this frame — the directional light
  // reads them, and the sky pass draws the disc at their crossing.
  private sunAz = 0;
  private sunElPx = 0;
  private sunX = 0;
  private sunY = 0;
  private sunElev = 0; // 0 at the horizon, 1 at noon — shadow and term strength
  // Per-pixel depth for prop lids and each column's nearest lid — the
  // rasterisers share them. colTop records the highest row a column's
  // walls drew — rows above it are open, whatever the z-buffer holds.
  private readonly flatDepth = new Float32Array(W * H);
  private readonly colTop = new Int16Array(W);
  private fogNear = 0;
  private fogFar = 1;
  private time = 0;
  private mapRef: GameMap | null = null;
  // The frame's baked light field — lamps splat into it once, then every
  // pixel samples the grid instead of walking the lamp list.
  private grid: LightGrid | null = null;

  // Warmth of the ambient light at the last ambientAt() call site — indoors
  // the gloom reads as hearth embers rather than cold moonlight. Set before
  // each lightAt() call (ambientAt is always invoked for its argument first).
  private ambWarm = 0;
  private dbgOpen = /[?&]dbg=open/.test(location.search);

  // Interiors catch only a fraction of daylight through doors and windows,
  // but they never fall fully dark — embers glow in the hearth.
  private ambientAt(x: number, y: number): number {
    const map = this.mapRef!;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const indoor =
      cx >= 0 && cy >= 0 && cx < map.w && cy < map.h && map.ceilTex[cy * map.w + cx] !== 2;
    this.ambWarm = indoor ? HEARTH_WARM : 0;
    return indoor ? Math.max(this.ambient * INDOOR_AMBIENT, HEARTH_GLOW) : this.ambient;
  }

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d")!;
    this.img = this.ctx.createImageData(W, H);
    this.buf = this.img.data;
    this.zbuf = new Float64Array(W);
  }

  render(
    map: GameMap,
    tex: TextureSet,
    sprites: SpriteRuntime[],
    lights: LightDef[],
    player: Player,
    t: number,
    ambient: number,
    daylight: number,
    dayFrac: number,
    fogNear: number,
    fogFar: number
  ): void {
    const buf = this.buf;
    const flick = computeFlicker(lights, t);
    this.ambient = ambient;
    this.daylight = daylight;
    // The sun's bearing sweeps east to west through the day; its height
    // follows a sine arc. Both hold for every pass this frame.
    this.sunAz = Math.PI * (dayFrac / SUN_ARC_END);
    this.sunElev = Math.max(0, Math.sin(Math.PI * (dayFrac / SUN_ARC_END)));
    this.sunElPx = this.sunElev * SUN_PEAK_EL * H;
    this.sunX = Math.cos(this.sunAz);
    this.sunY = Math.sin(this.sunAz);
    this.fogNear = fogNear;
    this.fogFar = fogFar;
    this.time = t;
    this.mapRef = map;
    if (!this.grid || this.grid.w !== map.w || this.grid.h !== map.h) {
      this.grid = new LightGrid(map.w, map.h);
    }
    splatLights(this.grid, lights, flick);

    const dirX = Math.cos(player.angle);
    const dirY = Math.sin(player.angle);
    const planeLen = Math.tan(settings.fov / 2);
    const planeX = -dirY * planeLen;
    const planeY = dirX * planeLen;
    const horizon = H / 2 + player.pitch + player.bob;

    // Per-pixel prop depth, cleared here because the wall pass's opening
    // overlay stamps it — lintels and sills are real surfaces at the
    // facade's depth, and roofs must lose to them just like to a wall.
    this.flatDepth.fill(Infinity);

    this.castFloorCeiling(map, tex, player, horizon, dirX, dirY, planeX, planeY);
    this.castWalls(map, tex, player, horizon, dirX, dirY, planeX, planeY);
    this.castProps(map, tex, player, horizon, dirX, dirY, planeX, planeY);
    this.castSprites(sprites, player, horizon, dirX, dirY, planeX, planeY, t);

    // Post pass: film grain + palette posterisation, one sweep.
    // Each channel snaps to POSTER_STEP levels with Bayer dither on the
    // boundary — the whole frame settles into that chunky palette feel.
    let i = 0;
    let p = 0;
    for (let y = 0; y < H; y++) {
      const brow = (y & 3) << 2;
      for (let x = 0; x < W; x++, i++, p += 4) {
        // Cheap LCG grain — decorrelated enough for a screen-sized noise field.
        this.grainRand = (this.grainRand * 1103515245 + 12345) & 0x7fffffff;
        const grain = settings.grain ? ((this.grainRand % 256) / 255 - 0.5) * 2 * GRAIN_AMOUNT : 0;
        const dth = (BAYER[brow | (x & 3)] - 0.5) * POSTER_STEP;
        buf[p] = poster(buf[p] + grain + dth);
        buf[p + 1] = poster(buf[p + 1] + grain + dth);
        buf[p + 2] = poster(buf[p + 2] + grain + dth);
        buf[p + 3] = 255;
      }
    }

    this.ctx.putImageData(this.img, 0, 0);
  }

  // Textured floor and ceiling via per-row scanline casting.
  private castFloorCeiling(
    map: GameMap,
    tex: TextureSet,
    player: Player,
    horizon: number,
    dirX: number,
    dirY: number,
    planeX: number,
    planeY: number
  ): void {
    const buf = this.buf;
    const rlX = dirX - planeX;
    const rlY = dirY - planeY;
    const rrX = dirX + planeX;
    const rrY = dirY + planeY;
    // Camera-plane units per radian ≈ radians of azimuth per screen pixel.
    const pxPerRad = W / Math.hypot(rrX - rlX, rrY - rlY);
    const mw = map.w;
    const facade = (nx: number, ny: number): boolean =>
      nx >= 0 &&
      ny >= 0 &&
      nx < mw &&
      ny < map.h &&
      (map.walls[ny * mw + nx] !== 0 || map.openSkin[ny * mw + nx] !== 0);

    for (let y = 0; y < H; y++) {
      const p = y - horizon;
      if (Math.abs(p) < 0.6) continue; // horizon line itself
      const isFloor = p > 0;
      // The floor is EYE_H below the eye, the storey ceiling (1 - EYE_H) above.
      const rowDist = ((isFloor ? EYE_H : 1 - EYE_H) * H) / Math.abs(p);

      const stepX = (rowDist * (rrX - rlX)) / W;
      const stepY = (rowDist * (rrY - rlY)) / W;
      let fx = player.x + rowDist * rlX;
      let fy = player.y + rowDist * rlY;

      const brow = (y & 3) << 2;
      for (let x = 0; x < W; x++) {
        // sx/sy is the actual sample point — a low-ceiling refinement below
        // can pull it closer without disturbing the column stepper (fx/fy).
        let sx = fx;
        let sy = fy;
        let cx = Math.floor(sx);
        let cy = Math.floor(sy);
        let r = FOG_R;
        let g = FOG_G;
        let b = FOG_B;
        if (cx >= 0 && cy >= 0 && cx < map.w && cy < map.h) {
          let cell = cy * map.w + cx;
          let texId = isFloor ? map.floorTex[cell] : map.ceilTex[cell];
          if (!isFloor && texId === 1 && Math.abs(map.ceilH[cell] - 1) > 0.01) {
            // An interior's ceiling rarely sits exactly on the storey
            // plane — a marquee's canvas hangs below it, a house's beams
            // above. The default z=1 crossing lands off the real plane,
            // so resample the landing at the room's own height. Over a
            // marquee's walls this pulls the hit back inside and the
            // roofline seals shut.
            const k = (map.ceilH[cell] - EYE_H) / (1 - EYE_H);
            sx = player.x + (fx - player.x) * k;
            sy = player.y + (fy - player.y) * k;
            cx = Math.floor(sx);
            cy = Math.floor(sy);
            if (cx >= 0 && cy >= 0 && cx < map.w && cy < map.h) {
              cell = cy * map.w + cx;
              texId = map.ceilTex[cell];
            } else {
              texId = 0;
            }
          }
          // A ray that crosses the ceiling plane on a wall or bare cell
          // has sailed over whatever stands there — the dome is behind it.
          // (Low walls can't hide this: their faces end below the pixel.)
          if (!isFloor && texId === 0) texId = 2;
          if (texId !== 0) {
            let uu = sx - cx;
            let vv = sy - cy;
            let skyAz = 0;
            if (!isFloor && texId === 2) {
              // The dome — one continuous sky. u is compass bearing (the
              // texture wraps once around the horizon and wheels slowly),
              // v is altitude: horizon at the texture's foot, zenith atop.
              skyAz = Math.atan2(sy - player.y, sx - player.x);
              uu = skyAz / (Math.PI * 2) + this.time * SKY_SCROLL;
              uu -= Math.floor(uu);
              const elev = Math.min(0.999, Math.max(0, (horizon - y) / (H * 0.55)));
              vv = 1 - elev;
            } else if (isFloor && texId === 6) {
              // Liquid surfaces warp — Quake's signature turbulent water.
              uu += Math.sin(sy * 7 + this.time * 2.8) * 0.035;
              vv += Math.cos(sx * 6 + this.time * 2.2) * 0.035;
              uu -= Math.floor(uu);
              vv -= Math.floor(vv);
            }
            // Flagstone kerb — a sidewalk strip where a facade meets the
            // street. Only open-air cobbles; interior floors keep their
            // own edges, and openSkin covers doorways cut from the facade.
            if (isFloor && texId === 4 && map.ceilTex[cell] === 2) {
              if (
                (vv < 0.32 && facade(cx, cy - 1)) ||
                (vv > 0.68 && facade(cx, cy + 1)) ||
                (uu < 0.32 && facade(cx - 1, cy)) ||
                (uu > 0.68 && facade(cx + 1, cy))
              ) {
                texId = 1; // flagstone paving
              }
            }
            const u = Math.min(TEX_SIZE - 1, Math.floor(uu * TEX_SIZE));
            const v = Math.min(TEX_SIZE - 1, Math.floor(vv * TEX_SIZE));
            const ti = (v * TEX_SIZE + u) * 3;
            if (!isFloor && texId === 2) {
              const tn = tex.ceils[2];
              const td = tex.ceils[3];
              const d = this.daylight;
              const sb = 0.2 + d * 1.05;
              r = (tn.data[ti] * (1 - d) + td.data[ti] * d) * sb;
              g = (tn.data[ti + 1] * (1 - d) + td.data[ti + 1] * d) * sb;
              b = (tn.data[ti + 2] * (1 - d) + td.data[ti + 2] * d) * sb;
              // The sun — a bright disc in a wide glow, tracking its arc
              // east to west across the day; below the horizon it is gone.
              if (d > 0.05 && this.sunElPx > 0) {
                let da = skyAz - this.sunAz;
                da -= Math.round(da / (Math.PI * 2)) * Math.PI * 2;
                const dsun = Math.hypot(da * pxPerRad, horizon - y - this.sunElPx);
                const glow = Math.max(0, 1 - dsun / 32) * d;
                r = Math.min(255, r + 200 * glow * glow);
                g = Math.min(255, g + 175 * glow * glow);
                b = Math.min(255, b + 100 * glow * glow);
                if (dsun < 5.5) {
                  r = Math.max(r, 250 * sb);
                  g = Math.max(g, 236 * sb);
                  b = Math.max(b, 190 * sb);
                }
              }
            } else {
              const t = (isFloor ? tex.floors : tex.ceils)[texId];
              lightAtGrid(this.grid!, sx, sy, this.ambientAt(sx, sy), this.ambWarm, this.sample);
              // Ceilings hang above the flames — dim them.
              const dim = isFloor ? 1 : 0.55;
              // Cast shadows — step sunward from the ground point; a wall
              // tall enough in the way puts the pixel in shade. The reach
              // stretches when the sun rides low, so mornings and evenings
              // throw long shadows. Open sky only — interiors stay gloom.
              let sunlit = 1;
              if (isFloor && this.sunElev > 0.05 && map.ceilTex[cell] === 2) {
                const reach = 2.2 + (1 - this.sunElev) * 5.5;
                for (let sd = 0.5; sd < reach; sd += 0.5) {
                  const wx = Math.floor(sx + this.sunX * sd);
                  const wy = Math.floor(sy + this.sunY * sd);
                  if (wx < 0 || wy < 0 || wx >= map.w || wy >= map.h) break;
                  if (map.walls[wy * map.w + wx] !== 0 && map.wallH[wy * map.w + wx] >= 0.6) {
                    sunlit = 0.5;
                    break;
                  }
                }
              }
              // Direct sun on open ground — lit turf and cobbles flare
              // against the shadowed side of the street.
              const sunBoost = sunlit === 1 && isFloor ? 1 + this.daylight * 0.65 * this.sunElev : 1;
              const dth = (BAYER[brow | (x & 3)] - 0.5) * DITHER_AMP;
              const s = shade(
                this.sample.bright * dim * sunlit * sunBoost + dth,
                this.sample.warm,
                rowDist,
                this.fogNear,
                this.fogFar
              );
              r = t.data[ti] * s.r;
              g = t.data[ti + 1] * s.g;
              b = t.data[ti + 2] * s.b;
            }
          }
        }
        const o = (y * W + x) * 4;
        buf[o] = r;
        buf[o + 1] = g;
        buf[o + 2] = b;
        buf[o + 3] = 255;
        fx += stepX;
        fy += stepY;
      }
    }
  }

  // Classic DDA: one ray per screen column.
  private castWalls(
    map: GameMap,
    tex: TextureSet,
    player: Player,
    horizon: number,
    dirX: number,
    dirY: number,
    planeX: number,
    planeY: number
  ): void {
    const buf = this.buf;
    const bandNorm = LIGHT_BANDS - 1;

    for (let x = 0; x < W; x++) {
      const camX = (2 * x) / W - 1;
      const rx = dirX + planeX * camX;
      const ry = dirY + planeY * camX;

      let mapX = Math.floor(player.x);
      let mapY = Math.floor(player.y);
      const ddx = Math.abs(1 / rx);
      const ddy = Math.abs(1 / ry);
      let stepX: number, stepY: number, sideX: number, sideY: number;
      if (rx < 0) {
        stepX = -1;
        sideX = (player.x - mapX) * ddx;
      } else {
        stepX = 1;
        sideX = (mapX + 1 - player.x) * ddx;
      }
      if (ry < 0) {
        stepY = -1;
        sideY = (player.y - mapY) * ddy;
      } else {
        stepY = 1;
        sideY = (mapY + 1 - player.y) * ddy;
      }

      let side = 0;
      // The first open doorway/window the ray crosses, for the lintel overlay.
      let openIdx = -1;
      let openPerp = 0;
      let openSide = 0;
      // The ray keeps marching past a wall that doesn't fill the column —
      // whatever stands behind shows over its top, so the old town rooftops
      // peek over the palisade stakes. clipTop is the first row already
      // owned by a nearer wall.
      let clipTop = H;
      for (let depth = 0; depth < 3; depth++) {
        let wallId = 0;
        for (let i = 0; i < 64; i++) {
          if (sideX < sideY) {
            sideX += ddx;
            mapX += stepX;
            side = 0;
          } else {
            sideY += ddy;
            mapY += stepY;
            side = 1;
          }
          if (mapX < 0 || mapY < 0 || mapX >= map.w || mapY >= map.h) {
            wallId = -1;
            break;
          }
          const ci = mapY * map.w + mapX;
          wallId = map.walls[ci];
          if (wallId !== 0) break;
          if (depth === 0 && openIdx < 0 && (map.doorways.has(ci) || map.windows.has(ci))) {
            openIdx = ci;
            openPerp = side === 0 ? sideX - ddx : sideY - ddy; // entry distance
            openSide = side;
          }
        }
        if (wallId <= 0) {
          if (depth === 0) this.zbuf[x] = this.fogFar * 2;
          break;
        }

        const perp = side === 0 ? sideX - ddx : sideY - ddy;
        if (depth === 0) this.zbuf[x] = perp;
        if (perp > this.fogFar) break; // swallowed by the murk anyway

        const cellIdx = mapY * map.w + mapX;
        const cellH = map.wallH[cellIdx]; // height in storeys — buildings tower

        // Texture column from the exact hit position.
        const wallX = side === 0 ? player.y + perp * ry : player.x + perp * rx;
        let texX = Math.floor((wallX - Math.floor(wallX)) * TEX_SIZE);
        if ((side === 0 && rx > 0) || (side === 1 && ry < 0)) texX = TEX_SIZE - 1 - texX;

        // Wall bottom sits on the floor plane; the column rises `cellH` storeys.
        const perpH = H / Math.max(perp, 0.001);
        const wallBottom = horizon + perpH * EYE_H;
        const y1 = Math.min(H - 1, Math.floor(wallBottom));

        // The air cell in front of this face tells us whether we're looking at
        // an interior wall (plaster, one storey) or an exterior facade.
        const hx = player.x + perp * rx;
        const hy = player.y + perp * ry;
        const ax = Math.floor(hx - rx * 0.04);
        const ay = Math.floor(hy - ry * 0.04);
        const indoor =
          ax >= 0 && ay >= 0 && ax < map.w && ay < map.h && map.ceilTex[ay * map.w + ax] === 1;

        // A barricaded opening always shows planks at ground level — even on
        // the indoor face — with the facade rising above it. A shut door shows
        // its oak from both sides the same way.
        let baseId =
          wallId === 6 || wallId === 4 ? wallId : indoor && map.wallIn[cellIdx] !== 0 ? map.wallIn[cellIdx] : wallId;
        let upId = indoor ? 0 : map.wallUp[cellIdx];
        // Facade cells pick from the material's alternates by a cell hash —
        // neighbouring windows land in different bays, not a stamped row.
        // The lit-window swap follows, so alternates light up too.
        if (!indoor) {
          const bvars = tex.wallVariants[baseId];
          if (bvars) baseId = bvars[(cellIdx * 7 + side * 3) % bvars.length];
          const uvars = tex.wallVariants[upId];
          if (uvars) upId = uvars[(cellIdx * 11 + side * 5) % uvars.length];
        }
        // Windows light up at night — someone is home.
        if (upId !== 0 && this.daylight < 0.4 && tex.wallsLit[upId] !== 0) {
          upId = tex.wallsLit[upId];
        }
        // Interior faces rise to the room's own ceiling — the facade
        // height belongs to the street side. Anything higher would hang
        // plaster into the air above the beams; anything lower leaves a
        // band of sky between the wall top and the ceiling plane.
        const effH = indoor
          ? Math.min(map.ceilH[ay * map.w + ax] || 1, cellH)
          : cellH;
        const y0 = Math.max(0, Math.ceil(wallBottom - perpH * effH));

        // Light sampled once at the hit point — per-column lighting is enough
        // at this resolution and keeps the banding coherent.
        lightAtGrid(this.grid!, hx, hy, this.ambientAt(hx - rx * 0.04, hy - ry * 0.04), this.ambWarm, this.sample);
        let bright = Math.min(1, this.sample.bright);
        bright = Math.floor(bright * bandNorm) / bandNorm;
        if (side === 1) bright *= 0.72; // N/S faces darker — depth cue
        // Sunlight — faces turned toward the sun catch it by day, the lee
        // side falls into shade. The term is stronger when the sun rides
        // high; at night there's no sun to read.
        const sunDot =
          (side === 0 ? -Math.sign(rx) : 0) * this.sunX + (side === 1 ? -Math.sign(ry) : 0) * this.sunY;
        bright *= 1 + this.daylight * 0.8 * (0.35 + 0.65 * this.sunElev) * sunDot;
        const fog = fogFactor(perp, this.fogNear, this.fogFar);
        // Tint is per column; brightness dithers per pixel so the band edges
        // stipple like a colormap gradient.
        const trC = lerp(COOL.r, WARM.r, this.sample.warm);
        const tgC = lerp(COOL.g, WARM.g, this.sample.warm);
        const tbC = lerp(COOL.b, WARM.b, this.sample.warm);

        const base = tex.walls[baseId];
        const upper = upId !== 0 ? tex.walls[upId] : base;
        const xb = x & 3;

        // Later legs only own the rows above every wall drawn before them.
        const drawBot = Math.min(y1, clipTop - 1);
        for (let y = y0; y <= drawBot; y++) {
          // u = storeys up from the floor. frac(u) tiles the facade texture
          // per storey; walls without an upper band stretch their base.
          const u = (wallBottom - y) / perpH;
          let texY: number;
          let t: typeof base;
          if (!indoor && map.wallCap[cellIdx] !== 0 && effH > 1.5 && u >= effH - ROOF_BAND) {
            // Roofline — slate or terracotta for houses, stone parapet for
            // walls. Painted caps only where there's no real roof above.
            const roofId = upId !== 0 ? ((mapX + mapY) & 1 ? ROOF_TILE : ROOF_SLATE) : ROOF_PARAPET;
            t = tex.walls[roofId];
            texY = Math.floor(((effH - u) / ROOF_BAND) * TEX_SIZE);
          } else if (u < 1) {
            t = base;
            texY = Math.floor((1 - u) * TEX_SIZE);
          } else if (upId !== 0) {
            t = upper;
            texY = Math.floor((1 - (u - Math.floor(u))) * TEX_SIZE);
          } else if (indoor) {
            // Interior faces tile per storey — the seam at the storey
            // line reads as a rail, not a smear.
            t = base;
            texY = Math.floor((1 - (u - Math.floor(u))) * TEX_SIZE);
          } else {
            t = base;
            texY = Math.floor((1 - Math.min(u / effH, 0.999)) * TEX_SIZE);
          }
          texY = Math.min(TEX_SIZE - 1, Math.max(0, texY));
          const ti = (texY * TEX_SIZE + texX) * 3;
          const dth = (BAYER[((y & 3) << 2) | xb] - 0.5) * DITHER_AMP;
          const bp = Math.min(1, Math.max(0, bright + dth));
          const o = (y * W + x) * 4;
          buf[o] = lerp(t.data[ti] * trC * bp, FOG_R, fog);
          buf[o + 1] = lerp(t.data[ti + 1] * tgC * bp, FOG_G, fog);
          buf[o + 2] = lerp(t.data[ti + 2] * tbC * bp, FOG_B, fog);
          buf[o + 3] = 255;
        }
        if (y0 < clipTop) clipTop = y0;
        // An interior face caps its own room — nothing exists beyond it to
        // see, and marching on would stack the street outside over the wall.
        if (indoor || clipTop <= 0) break; // column owned or filled
      }
      this.colTop[x] = clipTop;

      // Lintel/sill overlay for the nearest opening the ray passed through —
      // drawn last so it sits on top of every wall leg beyond it.
      if (openIdx >= 0) {
        this.renderOpening(map, tex, player, horizon, rx, ry, x, openIdx, openPerp, openSide);
      }
    }
  }

  // Open doorways and windows are floor cells — the ray sails through — but
  // the facade's upper storeys still span them. This draws the lintel band
  // (and the sill under a window) at the opening's own distance, on top of
  // whatever the ray hit beyond. Texture rows match the neighbouring wall
  // exactly, so the seam is invisible.
  private renderOpening(
    map: GameMap,
    tex: TextureSet,
    player: Player,
    horizon: number,
    rx: number,
    ry: number,
    x: number,
    openIdx: number,
    openPerp: number,
    openSide: number
  ): void {
    const buf = this.buf;
    const bandNorm = LIGHT_BANDS - 1;
    const cellH = map.wallH[openIdx];
    if (cellH <= 1) return; // nothing spans a one-storey opening
    const perpH = H / openPerp;
    const bottom = horizon + perpH * EYE_H;

    const hx = player.x + openPerp * rx;
    const hy = player.y + openPerp * ry;
    // The face we see belongs to the cell the player is standing side of —
    // from indoors the lintel is interior wall, not facade.
    const ax = Math.floor(hx - rx * 0.04);
    const ay = Math.floor(hy - ry * 0.04);
    const indoor =
      ax >= 0 && ay >= 0 && ax < map.w && ay < map.h && map.ceilTex[ay * map.w + ax] === 1;
    // Indoors the lintel ends at the ceiling — the beams own every row
    // above it. Outdoors it runs to the eave and meets the roof slope.
    const effH = indoor ? Math.min(map.ceilH[ay * map.w + ax] || 1, cellH) : cellH;

    const top = bottom - perpH * effH;
    const yTop = Math.max(0, Math.ceil(top));
    const yBot = Math.min(H - 1, Math.floor(bottom));
    if (yBot < 0 || yTop >= H) return;

    const texX =
      ((((openSide === 0 ? hy : hx) * TEX_SIZE) | 0) % TEX_SIZE + TEX_SIZE) % TEX_SIZE;
    const innerId = map.wallIn[openIdx] !== 0 ? map.wallIn[openIdx] : 13;
    let lintelId = indoor
      ? innerId
      : map.wallUp[openIdx] !== 0
        ? map.wallUp[openIdx]
        : map.openSkin[openIdx];
    let sillId = indoor
      ? innerId
      : map.openSkin[openIdx] !== 0
        ? map.openSkin[openIdx]
        : innerId;
    // Same cell-hash alternates the solid facade picks — the lintel and
    // sill belong to the same stamped-out row.
    if (!indoor) {
      const lvars = tex.wallVariants[lintelId];
      if (lvars) lintelId = lvars[(openIdx * 11 + openSide * 5) % lvars.length];
      const svars = tex.wallVariants[sillId];
      if (svars) sillId = svars[(openIdx * 7 + openSide * 3) % svars.length];
      if (this.daylight < 0.4 && tex.wallsLit[lintelId] !== 0) {
        lintelId = tex.wallsLit[lintelId];
      }
    }
    const isWindow = map.windows.has(openIdx);

    lightAtGrid(this.grid!, hx, hy, this.ambientAt(hx - rx * 0.04, hy - ry * 0.04), this.ambWarm, this.sample);
    let bright = Math.min(1, this.sample.bright);
    bright = Math.floor(bright * bandNorm) / bandNorm;
    if (openSide === 1) bright *= 0.72;
    const fog = fogFactor(openPerp, this.fogNear, this.fogFar);
    const trC = lerp(COOL.r, WARM.r, this.sample.warm);
    const tgC = lerp(COOL.g, WARM.g, this.sample.warm);
    const tbC = lerp(COOL.b, WARM.b, this.sample.warm);

    const lintel = tex.walls[lintelId];
    const sill = tex.walls[sillId];
    const xb = x & 3;

    for (let y = yTop; y <= yBot; y++) {
      const u = (bottom - y) / perpH;
      let t: Texture;
      let texY: number;
      if (!indoor && map.wallCap[openIdx] !== 0 && cellH > 1.5 && u >= cellH - ROOF_BAND) {
        const roofId =
          map.wallUp[openIdx] !== 0
            ? ((openIdx % map.w + Math.floor(openIdx / map.w)) & 1 ? ROOF_TILE : ROOF_SLATE)
            : ROOF_PARAPET;
        t = tex.walls[roofId];
        texY = Math.floor(((cellH - u) / ROOF_BAND) * TEX_SIZE);
      } else if (u >= 1) {
        t = lintel;
        texY = Math.floor((1 - (u - Math.floor(u))) * TEX_SIZE);
      } else if (!isWindow) {
        if (this.dbgOpen) {
          const o = (y * W + x) * 4;
          buf[o] = 128; buf[o + 1] = 0; buf[o + 2] = 0; buf[o + 3] = 255;
        }
        continue; // door: the whole ground storey is open
      } else if (u >= SILL_H) {
        if (this.dbgOpen) {
          const o = (y * W + x) * 4;
          buf[o] = 0; buf[o + 1] = 128; buf[o + 2] = 0; buf[o + 3] = 255;
        }
        continue; // the window opening itself
      } else {
        t = sill;
        texY = Math.floor((1 - u) * TEX_SIZE); // bottom rows — matches the wall beside it
      }
      texY = Math.min(TEX_SIZE - 1, Math.max(0, texY));
      const ti = (texY * TEX_SIZE + texX) * 3;
      const dth = (BAYER[((y & 3) << 2) | xb] - 0.5) * DITHER_AMP;
      const bp = Math.min(1, Math.max(0, bright + dth));
      const o = (y * W + x) * 4;
      if (this.dbgOpen) {
        buf[o] = t === lintel ? 255 : 0;
        buf[o + 1] = 0;
        buf[o + 2] = t === lintel ? 255 : 255;
        buf[o + 3] = 255;
        continue;
      }
      buf[o] = lerp(t.data[ti] * trC * bp, FOG_R, fog);
      buf[o + 1] = lerp(t.data[ti + 1] * tgC * bp, FOG_G, fog);
      buf[o + 2] = lerp(t.data[ti + 2] * tbC * bp, FOG_B, fog);
      buf[o + 3] = 255;
      // The lintel is real facade — prop faces beyond it (the roof slope's
      // projection can reach below the eave line) must lose these pixels.
      this.flatDepth[y * W + x] = openPerp;
    }
  }

  // Solid props — textured quads in world space (wells, carts, headstones).
  // Each column's ray is tested against every face of every nearby prop; the
  // hits paint far-to-near like a tiny BSP, and the nearest updates the
  // z-buffer so sprites still occlude correctly.
  private castProps(
    map: GameMap,
    tex: TextureSet,
    player: Player,
    horizon: number,
    dirX: number,
    dirY: number,
    planeX: number,
    planeY: number
  ): void {
    const buf = this.buf;
    const bandNorm = LIGHT_BANDS - 1;
    // flatDepth was cleared in render() — the wall pass's opening overlay
    // already stamped it with lintel/sill depths.
    // Broad reject — props behind the viewer or beyond the fog can't hit.
    // The margin is the prop's own reach: a building roof's faces spread
    // far from its centre, so small fixed margins pop them at the edges.
    const near = map.props.filter((p) => {
      const dx = p.x - player.x;
      const dy = p.y - player.y;
      const reach = (p.radius ??= propReach(p)) + 0.5;
      if (dx * dx + dy * dy > (this.fogFar + reach) * (this.fogFar + reach)) return false;
      return dx * dirX + dy * dirY > -reach;
    });
    if (near.length === 0) return;

    // Horizontal lids first — the plane a vertical quad can never show.
    // Same projection the floor uses: each screen row maps to one distance
    // on the plane, then it's a point-in-rect test. Lids above eye level
    // only ever show an underside, so they're skipped. Depth is tracked
    // per-pixel (flatDepth) so lids, faces and sprites occlude each other
    // exactly where they cover a pixel.
    const rlX = dirX - planeX;
    const rlY = dirY - planeY;
    const stX = (dirX + planeX - rlX) / W;
    const stY = (dirY + planeY - rlY) / W;
    for (const p of near) {
      for (const f of p.faces) {
        if (!f.flat) continue;
        const dz = EYE_H - f.top; // the eye rides EYE_H of a storey up
        if (Math.abs(dz) <= 0.02) continue; // a plane at eye level is a line
        const adz = Math.abs(dz);
        const below = dz > 0; // lids vs undersides — a marquee roof is the latter
        const cx = (f.x0 + f.x1) / 2;
        const cy = (f.y0 + f.y1) / 2;
        const hw = (f.x1 - f.x0) / 2;
        const hd = (f.y1 - f.y0) / 2;
        const cosr = Math.cos(f.rot ?? 0);
        const sinr = Math.sin(f.rot ?? 0);
        // Distance from the eye to the nearest point of the rect bounds
        // the near rows; the fog bounds the far ones.
        const pdx = player.x - cx;
        const pdy = player.y - cy;
        const plx = pdx * cosr + pdy * sinr;
        const ply = -pdx * sinr + pdy * cosr;
        const minD = Math.max(0.05, Math.hypot(Math.max(Math.abs(plx) - hw, 0), Math.max(Math.abs(ply) - hd, 0)));
        const yLo = below
          ? Math.max(Math.floor(horizon) + 1, Math.ceil(horizon + (adz * H) / this.fogFar))
          : Math.max(0, Math.ceil(horizon - (adz * H) / minD));
        const yHi = below
          ? Math.min(H - 1, Math.floor(horizon + (adz * H) / minD))
          : Math.min(Math.ceil(horizon) - 1, Math.floor(horizon - (adz * H) / this.fogFar));
        const t = tex.walls[f.tex];
        for (let y = yLo; y <= yHi; y++) {
          const dist = (adz * H) / (below ? y - horizon : horizon - y);
          const sX = dist * stX;
          const sY = dist * stY;
          let fx = player.x + dist * rlX - sX;
          let fy = player.y + dist * rlY - sY;
          const brow = (y & 3) << 2;
          const row = y * W;
          for (let x = 0; x < W; x++) {
            fx += sX;
            fy += sY;
            const dx = fx - cx;
            const dy = fy - cy;
            const lx = dx * cosr + dy * sinr;
            const ly = -dx * sinr + dy * cosr;
            if (Math.abs(lx) > hw || Math.abs(ly) > hd) continue;
            // A wall covers its column from its top edge down — a pixel in
            // the open band above it can never be occluded, whatever the
            // z-buffer says. That's how a roof's underside shows itself.
            if (y >= this.colTop[x] && dist >= this.zbuf[x]) continue;
            if (dist >= this.flatDepth[row + x]) continue;
            this.flatDepth[row + x] = dist;
            const u = (lx + hw) / (2 * hw);
            const v = (ly + hd) / (2 * hd);
            const ti =
              (Math.min(TEX_SIZE - 1, Math.floor(v * TEX_SIZE)) * TEX_SIZE +
                Math.min(TEX_SIZE - 1, Math.floor(u * TEX_SIZE))) * 3;
            lightAtGrid(this.grid!, fx, fy, this.ambientAt(fx, fy), this.ambWarm, this.sample);
            // Upward lids take the sun full-on; undersides never do.
            let bright = Math.min(1, this.sample.bright) * f.shade * (below ? 1 + this.daylight * 0.75 * this.sunElev : 1);
            bright = Math.floor(Math.min(1, bright) * bandNorm) / bandNorm;
            const fog = fogFactor(dist, this.fogNear, this.fogFar);
            const trC = lerp(COOL.r, WARM.r, this.sample.warm);
            const tgC = lerp(COOL.g, WARM.g, this.sample.warm);
            const tbC = lerp(COOL.b, WARM.b, this.sample.warm);
            const dth = (BAYER[brow | (x & 3)] - 0.5) * DITHER_AMP;
            const bp = Math.min(1, Math.max(0, bright + dth));
            const o = (row + x) * 4;
            buf[o] = lerp(t.data[ti] * trC * bp, FOG_R, fog);
            buf[o + 1] = lerp(t.data[ti + 1] * tgC * bp, FOG_G, fog);
            buf[o + 2] = lerp(t.data[ti + 2] * tbC * bp, FOG_B, fog);
          }
        }
      }
    }
    // Column-span culling, once per frame: each drawable face's XY extent
    // projects to a range of screen columns, so the per-column loop below
    // costs one bounds check per face instead of a segment intersection.
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    const culled: {
      f: PropFace;
      lo: number;
      hi: number;
      chain?: { s: number; z: number }[];
      pl?: number[][]; // z,u,v as affine planes over world (x,y)
    }[] = [];
    for (const p of near) {
      for (const f of p.faces) {
        if (f.flat) continue; // lids drew in the first pass
        const n = f.pts ? f.pts.length : 2;
        let lo = Infinity;
        let hi = -Infinity;
        let straddle = false;
        for (let i = 0; i < n; i++) {
          const cx = (f.pts ? f.pts[i][0] : i === 0 ? f.x0 : f.x1) - player.x;
          const cy = (f.pts ? f.pts[i][1] : i === 0 ? f.y0 : f.y1) - player.y;
          const txv = invDet * (dirY * cx - dirX * cy);
          const tyv = invDet * (-planeY * cx + planeX * cy);
          if (tyv < 0.15) {
            straddle = true;
            break;
          }
          const sxv = (W / 2) * (1 + txv / tyv);
          if (sxv < lo) lo = sxv;
          if (sxv > hi) hi = sxv;
        }
        let lo_i = 0;
        let hi_i = W - 1;
        if (!straddle && !(hi >= 0 && lo < W && lo <= hi)) continue;
        if (!straddle) {
          lo_i = Math.max(0, Math.floor(lo));
          hi_i = Math.min(W - 1, Math.ceil(hi));
        }
        // A tilted face whose corners are all collinear in plan view is a
        // vertical silhouette — a gable end, not a slope. The ray crosses
        // it once, like a wall; its top edge follows the corner polyline.
        let chain: { s: number; z: number }[] | undefined;
        let pl: number[][] | undefined;
        if (f.pts) {
          const p = f.pts;
          const dxs = p[1][0] - p[0][0];
          const dys = p[1][1] - p[0][1];
          const dd = dxs * dxs + dys * dys;
          if (dd > 1e-8) {
            let col = true;
            for (const q of p) {
              if (Math.abs(dxs * (q[1] - p[0][1]) - dys * (q[0] - p[0][0])) > 1e-6) {
                col = false;
                break;
              }
            }
            if (col) {
              // Upper edge, ordered along the base: corner 0, then the top
              // chain back to corner 1 — a gable's eave-ridge-eave slope.
              chain = [];
              const idx = [0];
              for (let k = p.length - 1; k >= 1; k--) idx.push(k);
              for (const k of idx) {
                const q = p[k];
                chain.push({
                  s: ((q[0] - p[0][0]) * dxs + (q[1] - p[0][1]) * dys) / dd,
                  z: q[2],
                });
              }
              chain.sort((a, b) => a.s - b.s);
            }
          }
          if (!chain) {
            // The plane's z, u and v are affine over (x,y) — three corners
            // fit all three coefficients. Then every screen row solves its
            // own exact depth: no near-plane pops, no warped texture.
            for (let j = 2; j < p.length && !pl; j++) {
              const x0 = p[0][0], y0 = p[0][1];
              const x1 = p[1][0], y1 = p[1][1];
              const x2 = p[j][0], y2 = p[j][1];
              const D = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
              if (Math.abs(D) < 1e-6) continue;
              pl = [];
              for (const k of [2, 3, 4]) {
                const v0 = p[0][k], v1 = p[1][k], v2 = p[j][k];
                const A = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / D;
                const B = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / D;
                pl.push([A, B, v0 - A * x0 - B * y0]);
              }
            }
          }
        }
        culled.push({ f, lo: lo_i, hi: hi_i, chain, pl });
      }
    }

    // The ceiling is a real occluder: a prop pixel behind the ceiling
    // plane can never be seen — whether it's "behind the wall" or not.
    // The plane's own depth at this row decides; where the crossing lands
    // says whether a ceiling exists there at all (beams, vault) or sky.
    const ceilOccludes = (y: number, rx: number, ry: number, t: number): boolean => {
      if (y >= horizon - 0.5) return false;
      let rd = ((1 - EYE_H) * H) / (horizon - y);
      let cx = Math.floor(player.x + rd * rx);
      let cy = Math.floor(player.y + rd * ry);
      if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return false;
      let cell = cy * map.w + cx;
      // The real ceiling plane sits at the room's own height — low in a
      // marquee, above the storey in a house — so resample the crossing
      // at it, like the ceiling pass does.
      if (map.ceilTex[cell] === 1 && Math.abs(map.ceilH[cell] - 1) > 0.01) {
        rd *= (map.ceilH[cell] - EYE_H) / (1 - EYE_H);
        cx = Math.floor(player.x + rd * rx);
        cy = Math.floor(player.y + rd * ry);
        if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return false;
        cell = cy * map.w + cx;
      }
      const ct = map.ceilTex[cell];
      if (ct !== 1 && ct !== 4) return false; // open sky, not a room
      return t > rd; // the face is beyond the ceiling surface
    };

    const hits: { t: number; u: number; f: PropFace }[] = [];
    // Vertical silhouettes — a single crossing, the top edge from the chain.
    const vsil: { t: number; u: number; f: PropFace; chain: { s: number; z: number }[] }[] = [];
    // A tilted quad's crossings: the ray enters and exits its XY footprint —
    // two edge hits, or one when the eye is inside the footprint already.
    const tilts: { tA: number; tB: number; f: PropFace; pl: number[][] }[] = [];
    for (let x = 0; x < W; x++) {
      const camX = (2 * x) / W - 1;
      const rx = dirX + planeX * camX;
      const ry = dirY + planeY * camX;
      hits.length = 0;
      vsil.length = 0;
      tilts.length = 0;
      for (const c of culled) {
        if (x < c.lo || x > c.hi) continue;
        const f = c.f;
        if (f.pts && c.pl) {
          const p = f.pts;
          let tA = Infinity;
          let tB = -Infinity;
          for (let i = 0; i < p.length; i++) {
            const a = p[i];
            const b = p[(i + 1) % p.length];
            const ex = b[0] - a[0];
            const ey = b[1] - a[1];
            const den = ex * ry - rx * ey;
            if (den > -1e-9 && den < 1e-9) continue;
            const ax = a[0] - player.x;
            const ay = a[1] - player.y;
            const t = (-ax * ey + ex * ay) / den;
            const u = (rx * ay - ry * ax) / den;
            if (t <= 0 || u < 0 || u > 1) continue;
            if (t < tA) tA = t;
            if (t > tB) tB = t;
          }
          if (tB <= 0.05 || tA === Infinity) continue;
          // One crossing means the eye is inside the footprint — under an
          // eave, say — so the near end clamps to just ahead of the eye.
          tA = Math.max(tA, 0.05);
          tilts.push({ tA, tB, f, pl: c.pl });
          continue;
        }
        const px0 = c.chain ? f.pts![0][0] : f.x0;
        const py0 = c.chain ? f.pts![0][1] : f.y0;
        const px1 = c.chain ? f.pts![1][0] : f.x1;
        const py1 = c.chain ? f.pts![1][1] : f.y1;
        const sx = px1 - px0;
        const sy = py1 - py0;
        const den = sx * ry - rx * sy;
        if (den > -1e-9 && den < 1e-9) continue;
        const ax = px0 - player.x;
        const ay = py0 - player.y;
        const t = (-ax * sy + sx * ay) / den;
        const u = (rx * ay - ry * ax) / den;
        if (t < 0.05 || u < 0 || u > 1) continue;
        if (c.chain) vsil.push({ t, u, f, chain: c.chain });
        else hits.push({ t, u, f });
      }
      if (hits.length === 0 && vsil.length === 0 && tilts.length === 0) continue;
      hits.sort((a, b) => b.t - a.t); // far to near — nearer faces overpaint
      vsil.sort((a, b) => b.t - a.t);
      tilts.sort((a, b) => b.tA - a.tA);

      const xb = x & 3;
      for (const hit of hits) {
        const f = hit.f;
        const perpH = H / hit.t;
        const floorY = horizon + perpH * EYE_H;
        const yTop = Math.max(0, Math.ceil(floorY - perpH * f.top));
        let yBot = Math.min(H - 1, Math.floor(floorY - perpH * f.base));
        // Behind the wall depth a face only owns the rows above the wall's
        // top edge — that's how roof tiers peek over the marquee walls.
        if (hit.t >= this.zbuf[x]) yBot = Math.min(yBot, this.colTop[x] - 1);
        if (yTop > yBot) continue;
        const texX = Math.min(TEX_SIZE - 1, Math.floor(hit.u * TEX_SIZE));
        const hx = player.x + hit.t * rx;
        const hy = player.y + hit.t * ry;
        lightAtGrid(this.grid!, hx, hy, this.ambientAt(hx, hy), this.ambWarm, this.sample);
        let bright = Math.min(1, this.sample.bright) * f.shade;
        // Live sunlight — faces with a bearing turned toward the sun catch
        // it, the lee dims. Faces without one (tent mouths, dark throats)
        // keep their baked shade only.
        if (f.az !== undefined) {
          bright *= 1 + this.daylight * 0.7 * Math.cos(f.az - this.sunAz);
          bright = Math.min(1, Math.max(0, bright));
        }
        bright = Math.floor(bright * bandNorm) / bandNorm;
        const fog = fogFactor(hit.t, this.fogNear, this.fogFar);
        const trC = lerp(COOL.r, WARM.r, this.sample.warm);
        const tgC = lerp(COOL.g, WARM.g, this.sample.warm);
        const tbC = lerp(COOL.b, WARM.b, this.sample.warm);
        const t = tex.walls[f.tex];
        const span = f.top - f.base;
        for (let y = yTop; y <= yBot; y++) {
          const uh = (floorY - y) / perpH; // storeys up from the floor
          const texY = Math.min(
            TEX_SIZE - 1,
            Math.max(0, Math.floor(((f.top - uh) / span) * TEX_SIZE))
          );
          const ti = (texY * TEX_SIZE + texX) * 3;
          const dth = (BAYER[((y & 3) << 2) | xb] - 0.5) * DITHER_AMP;
          const bp = Math.min(1, Math.max(0, bright + dth));
          const o = (y * W + x) * 4;
          // A nearer lid pixel owns this dot — the row spans differ, so the
          // test has to be per-pixel, not per-column.
          if (hit.t >= this.flatDepth[o >> 2]) continue;
          // Behind the ceiling plane — ceiling pixels are the room's,
          // not the face's, whether a wall clipped it or not.
          if (ceilOccludes(y, rx, ry, hit.t)) continue;
          // The face owns this pixel's depth so sprites clip against the
          // exact prop silhouette, not just the column's nearest face.
          this.flatDepth[o >> 2] = hit.t;
          buf[o] = lerp(t.data[ti] * trC * bp, FOG_R, fog);
          buf[o + 1] = lerp(t.data[ti + 1] * tgC * bp, FOG_G, fog);
          buf[o + 2] = lerp(t.data[ti + 2] * tbC * bp, FOG_B, fog);
        }
      }

      // Vertical silhouettes — gable ends. One crossing like a wall face,
      // but the top edge follows the corner chain: eave up to the ridge
      // and down, so the column shows a triangle of masonry, not a box.
      for (const v of vsil) {
        const f = v.f;
        const p = f.pts!;
        const zLo = p[0][2] + (p[1][2] - p[0][2]) * v.u;
        let zHi = v.chain[v.chain.length - 1].z;
        for (let i = 0; i + 1 < v.chain.length; i++) {
          if (v.u <= v.chain[i + 1].s + 1e-9) {
            const d = v.chain[i + 1].s - v.chain[i].s;
            zHi = d < 1e-9 ? v.chain[i + 1].z : v.chain[i].z + ((v.chain[i + 1].z - v.chain[i].z) * (v.u - v.chain[i].s)) / d;
            break;
          }
        }
        const perpH = H / v.t;
        const floorY = horizon + perpH * EYE_H;
        const yTop = Math.max(0, Math.ceil(floorY - perpH * zHi));
        let yBot = Math.min(H - 1, Math.floor(floorY - perpH * zLo));
        if (v.t >= this.zbuf[x]) yBot = Math.min(yBot, this.colTop[x] - 1);
        if (yTop > yBot) continue;
        const texXu = p[0][3] + (p[1][3] - p[0][3]) * v.u;
        const hx = player.x + v.t * rx;
        const hy = player.y + v.t * ry;
        lightAtGrid(this.grid!, hx, hy, this.ambientAt(hx, hy), this.ambWarm, this.sample);
        let bright = Math.min(1, this.sample.bright) * f.shade;
        if (f.az !== undefined) {
          bright *= 1 + this.daylight * 0.7 * Math.cos(f.az - this.sunAz);
          bright = Math.min(1, Math.max(0, bright));
        }
        bright = Math.floor(bright * bandNorm) / bandNorm;
        const fog = fogFactor(v.t, this.fogNear, this.fogFar);
        const trC = lerp(COOL.r, WARM.r, this.sample.warm);
        const tgC = lerp(COOL.g, WARM.g, this.sample.warm);
        const tbC = lerp(COOL.b, WARM.b, this.sample.warm);
        const t = tex.walls[f.tex];
        const texX = Math.floor((((texXu % 1) + 1) % 1) * TEX_SIZE);
        for (let y = yTop; y <= yBot; y++) {
          const zRow = (floorY - y) / perpH;
          // v runs up from the base edge like a new wall storey — the
          // gable's masonry tiles continuous with the facade below it.
          const zf = zRow - zLo;
          const texY = Math.floor((1 - (zf - Math.floor(zf))) * TEX_SIZE) % TEX_SIZE;
          const ti = (texY * TEX_SIZE + texX) * 3;
          const o = (y * W + x) * 4;
          if (v.t >= this.flatDepth[o >> 2]) continue;
          if (ceilOccludes(y, rx, ry, v.t)) continue;
          this.flatDepth[o >> 2] = v.t;
          const dth = (BAYER[((y & 3) << 2) | xb] - 0.5) * DITHER_AMP;
          const bp = Math.min(1, Math.max(0, bright + dth));
          buf[o] = lerp(t.data[ti] * trC * bp, FOG_R, fog);
          buf[o + 1] = lerp(t.data[ti + 1] * tgC * bp, FOG_G, fog);
          buf[o + 2] = lerp(t.data[ti + 2] * tbC * bp, FOG_B, fog);
        }
      }

      // Tilted quads — pitched roofs, tent slopes, awnings, gable ends.
      // Along the column's ray the plane's height is affine in depth, so
      // the projected height is a/b+c·t in t: invert it and every row gets
      // its own exact depth — flatDepth and the texture stay honest.
      for (const tilt of tilts) {
        const f = tilt.f;
        const [pz, pu, pv] = tilt.pl;
        const za = pz[0] * player.x + pz[1] * player.y + pz[2];
        const zb = pz[0] * rx + pz[1] * ry;
        // screen row of the point at t: horizon + (EYE_H - z(t))·H/t
        const ha = (EYE_H - za) * H;
        const hb = zb * H;
        if (Math.abs(ha) < 1e-6) continue; // the plane runs through the eye
        const yA = horizon + ha / tilt.tA - hb;
        const yB = horizon + ha / tilt.tB - hb;
        const yTop = Math.max(0, Math.ceil(Math.min(yA, yB)));
        let yBot = Math.min(H - 1, Math.floor(Math.max(yA, yB)));
        if (tilt.tA >= this.zbuf[x]) yBot = Math.min(yBot, this.colTop[x] - 1);
        if (yTop > yBot) continue;
        const tMid = (tilt.tA + tilt.tB) * 0.5;
        const hx = player.x + tMid * rx;
        const hy = player.y + tMid * ry;
        lightAtGrid(this.grid!, hx, hy, this.ambientAt(hx, hy), this.ambWarm, this.sample);
        let bright = Math.min(1, this.sample.bright) * f.shade;
        if (f.az !== undefined) {
          bright *= 1 + this.daylight * 0.7 * Math.cos(f.az - this.sunAz);
          bright = Math.min(1, Math.max(0, bright));
        }
        bright = Math.floor(bright * bandNorm) / bandNorm;
        const trC = lerp(COOL.r, WARM.r, this.sample.warm);
        const tgC = lerp(COOL.g, WARM.g, this.sample.warm);
        const tbC = lerp(COOL.b, WARM.b, this.sample.warm);
        const t = tex.walls[f.tex];
        for (let y = yTop; y <= yBot; y++) {
          const trow = ha / (y - horizon + hb);
          if (trow < tilt.tA || trow > tilt.tB) continue;
          const o = (y * W + x) * 4;
          if (trow >= this.flatDepth[o >> 2]) continue;
          // A nearer wall owns the rows below its top edge — and above
          // it, the room's ceiling owns the beams rows.
          if (trow >= this.zbuf[x] && y >= this.colTop[x]) continue;
          if (ceilOccludes(y, rx, ry, trow)) continue;
          this.flatDepth[o >> 2] = trow;
          const fx = player.x + trow * rx;
          const fy = player.y + trow * ry;
          const texX = Math.floor(((pu[0] * fx + pu[1] * fy + pu[2]) % 1 + 1) % 1 * TEX_SIZE);
          const texY = Math.floor(((pv[0] * fx + pv[1] * fy + pv[2]) % 1 + 1) % 1 * TEX_SIZE);
          const ti = (texY * TEX_SIZE + texX) * 3;
          const fog = fogFactor(trow, this.fogNear, this.fogFar);
          const dth = (BAYER[((y & 3) << 2) | xb] - 0.5) * DITHER_AMP;
          const bp = Math.min(1, Math.max(0, bright + dth));
          buf[o] = lerp(t.data[ti] * trC * bp, FOG_R, fog);
          buf[o + 1] = lerp(t.data[ti + 1] * tgC * bp, FOG_G, fog);
          buf[o + 2] = lerp(t.data[ti + 2] * tbC * bp, FOG_B, fog);
        }
      }
    }
  }

  // Billboard sprites, far-to-near, clipped per column by the wall z-buffer.
  private castSprites(
    sprites: SpriteRuntime[],
    player: Player,
    horizon: number,
    dirX: number,
    dirY: number,
    planeX: number,
    planeY: number,
    t: number
  ): void {
    const buf = this.buf;
    const bandNorm = LIGHT_BANDS - 1;
    // The caller builds this list fresh each frame — sort it in place
    // (far to near) rather than allocating a wrapper object per sprite.
    const order = sprites;
    order.sort((a, b) => (b.x - player.x) ** 2 + (b.y - player.y) ** 2 - ((a.x - player.x) ** 2 + (a.y - player.y) ** 2));

    const invDet = 1 / (planeX * dirY - dirX * planeY);
    // Billboards draw as world-space segments perpendicular to the view axis
    // — camera-facing by construction. Each sprite is ray-tested per column
    // like a prop face, so a figure half a step off-centre clips into the
    // screen edge instead of vanishing when its centre passes the near plane.
    const plen = Math.hypot(planeX, planeY);
    const rgtX = planeX / plen;
    const rgtY = planeY / plen;

    for (const s of order) {
      if (s.taken) continue;
      const frame =
        s.frames[
          s.animFps > 0
            ? ((Math.floor(t * s.animFps) % s.frames.length) + s.frames.length) % s.frames.length
            : 0
        ];

      const halfW = (s.scale * (frame.w / frame.h)) / 2;
      const x0 = s.x - rgtX * halfW;
      const y0 = s.y - rgtY * halfW;
      const x1 = s.x + rgtX * halfW;
      const y1 = s.y + rgtY * halfW;
      const sx = x1 - x0;
      const sy = y1 - y0;

      // Screen column span from the segment's ends — an end at or behind the
      // camera plane means the sprite straddles the view and any column may
      // catch it.
      let colLo = 0;
      let colHi = W - 1;
      {
        let lo = Infinity;
        let hi = -Infinity;
        let behind = false;
        for (let e = 0; e < 2; e++) {
          const rx = (e === 0 ? x0 : x1) - player.x;
          const ry = (e === 0 ? y0 : y1) - player.y;
          const txv = invDet * (dirY * rx - dirX * ry);
          const tyv = invDet * (-planeY * rx + planeX * ry);
          if (tyv < 0.15) { behind = true; break; }
          const sxv = (W / 2) * (1 + txv / tyv);
          if (sxv < lo) lo = sxv;
          if (sxv > hi) hi = sxv;
        }
        if (!behind) {
          colLo = Math.max(0, Math.floor(lo));
          colHi = Math.min(W - 1, Math.ceil(hi));
          if (colLo > colHi) continue; // wholly off-screen
        }
      }

      lightAtGrid(this.grid!, s.x, s.y, this.ambientAt(s.x, s.y), this.ambWarm, this.sample);
      let bright = Math.min(1, this.sample.bright);
      bright = Math.floor(bright * bandNorm) / bandNorm;
      const trC = lerp(COOL.r, WARM.r, this.sample.warm);
      const tgC = lerp(COOL.g, WARM.g, this.sample.warm);
      const tbC = lerp(COOL.b, WARM.b, this.sample.warm);

      for (let x = colLo; x <= colHi; x++) {
        const camX = (2 * x) / W - 1;
        const rdx = dirX + planeX * camX;
        const rdy = dirY + planeY * camX;
        const den = sx * rdy - rdx * sy;
        if (den > -1e-9 && den < 1e-9) continue;
        const ax = x0 - player.x;
        const ay = y0 - player.y;
        const hit = (-ax * sy + sx * ay) / den;
        const hu = (rdx * ay - rdy * ax) / den;
        if (hit < 0.05 || hu < 0 || hu > 1) continue;

        const perpH = H / hit;
        // Anchor the sprite's feet on the floor at its depth.
        const groundY = horizon + perpH * EYE_H;
        const sprH = perpH * s.scale;
        const yTop = Math.max(0, Math.ceil(groundY - sprH));
        let yBot = Math.min(H - 1, Math.floor(groundY));
        // Behind the wall depth only the rows above the wall's top edge are
        // the sprite's — a figure behind a low wall keeps its head.
        if (hit >= this.zbuf[x]) yBot = Math.min(yBot, this.colTop[x] - 1);
        if (yTop > yBot) continue;

        const u = Math.min(frame.w - 1, Math.floor(hu * frame.w));
        const fog = fogFactor(hit, this.fogNear, this.fogFar);
        const xb = x & 3;
        for (let y = yTop; y <= yBot; y++) {
          const v = Math.min(frame.h - 1, Math.floor(((y - groundY + sprH) / sprH) * frame.h));
          const ti = (v * frame.w + u) * 4;
          const a = frame.data[ti + 3];
          if (a < 128) continue;
          const o = (y * W + x) * 4;
          // A prop pixel in front owns this dot — the figure shows through
          // the open bands of a stall instead of hiding as a whole.
          if (hit >= this.flatDepth[o >> 2]) continue;
          const dth = (BAYER[((y & 3) << 2) | xb] - 0.5) * DITHER_AMP;
          const bp = Math.min(1, Math.max(0, bright + dth));
          buf[o] = lerp(frame.data[ti] * trC * bp, FOG_R, fog);
          buf[o + 1] = lerp(frame.data[ti + 1] * tgC * bp, FOG_G, fog);
          buf[o + 2] = lerp(frame.data[ti + 2] * tbC * bp, FOG_B, fog);
        }
      }
    }
  }

  // The player's lantern, carried in the left hand when it's out. The right
  // hand stays empty — a doctor's tools are his eyes and his journal.
  drawViewmodels(
    lantern: HTMLCanvasElement | null,
    swayX: number,
    swayY: number
  ): void {
    this.ctx.imageSmoothingEnabled = false;
    if (!lantern) return;
    // Size in screen pixels regardless of the bitmap's resolution — the
    // lantern should fill about half of the view's height.
    const dh = H * 0.52;
    const dw = dh * (lantern.width / lantern.height);
    const x0 = W * 0.3 - swayX - dw / 2;
    const y0 = H - dh * 0.82 + swayY;
    this.ctx.drawImage(lantern, Math.round(x0), Math.round(y0), Math.round(dw), Math.round(dh));
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Snap a channel to the posterised palette — the display's 8-bit soul.
function poster(v: number): number {
  const q = Math.round(v / POSTER_STEP) * POSTER_STEP;
  return q < 0 ? 0 : q > 255 ? 255 : q;
}

function fogFactor(dist: number, near: number, far: number): number {
  const f = (dist - near) / (far - near);
  const c = f < 0 ? 0 : f > 1 ? 1 : f;
  return c * c * (3 - 2 * c);
}

// How far a prop's geometry reaches from its anchor — the cull margin.
// Computed lazily for props the map builder didn't pre-measure.
function propReach(p: PropDef): number {
  let r = 0;
  for (const f of p.faces) {
    if (f.pts) {
      for (const q of f.pts) r = Math.max(r, Math.hypot(q[0] - p.x, q[1] - p.y));
    } else {
      r = Math.max(r, Math.hypot(f.x0 - p.x, f.y0 - p.y), Math.hypot(f.x1 - p.x, f.y1 - p.y));
    }
  }
  return r;
}

// Band-quantised brightness + warm/cool tint, precomputed per surface.
function shade(
  bright: number,
  warm: number,
  dist: number,
  near: number,
  far: number
): { r: number; g: number; b: number } {
  const bandNorm = LIGHT_BANDS - 1;
  const bq = Math.floor(Math.min(1, bright) * bandNorm) / bandNorm;
  const fog = fogFactor(dist, near, far);
  return {
    r: lerp(lerp(COOL.r, WARM.r, warm) * bq, FOG_R / 255, fog),
    g: lerp(lerp(COOL.g, WARM.g, warm) * bq, FOG_G / 255, fog),
    b: lerp(lerp(COOL.b, WARM.b, warm) * bq, FOG_B / 255, fog),
  };
}
