import { BARRICADE_WALL_ID } from "./config";
import type { DoorDef, GameMap, LightDef, PropDef, PropFace, SpriteDef } from "./types";

// Paris, 1348. The city is laid out programmatically — a grid of cobbled
// streets lined with half-timbered houses that tower two or three storeys
// over the lanes. East of the old city, a stake palisade seals the quarantine
// quarter: the pesthouse, the sick tenements, and the alchemist's shuttered
// shop. Below everything, the sewers.
//
// Texture ids (see textures.ts):
//   walls:  1 stone, 2 dark brick, 3 wood panelling, 4 door, 5 timber,
//           6 barricade, 7 timber upper, 9 stone upper, 11 brick upper,
//           13 interior plaster
//   floors: 1 flagstone, 2 carpet, 3 dirt, 4 cobble, 5 wood, 6 sewer water
//   ceils:  1 beams, 2 sky, 4 vaulted brick (sewers)
//
// Multi-floor trick: buildings render 2-3 storeys tall via wallUp/wallH, and
// two sealed strips live below the city on the grid — the lofts (y >= LOFT_Y)
// and the sewers (y >= SEWER_Y) — reachable only by stair/grate teleports.
// To anything walking the streets the strips are solid rock; to the player
// they're the upstairs and the undercity.

const W_STONE = 1;
const W_BRICK = 2;
const W_WOOD = 3;
const W_TIMBER = 5;
const W_PALISADE = 23; // the cordon — sharpened stakes, lashed together
const W_CANVAS = 24; // tent canvas — the camp's walls
const W_LAMP = 26; // lantern glass — the lamp posts' glowing heads
const W_FOLIAGE = 27; // clipped leaf mass — trees, shrubs, planters
const W_ROCK = 28; // uncoursed crag — the mountain pass
const W_PEAK = 29; // snow-capped crag — the ridge's tallest cells
const W_LEAF = 19; // door leaf texture — drawn on the swinging prop
const W_QUAR = 20; // quarantine quarter — patched, boarded, marked
const W_LEAF_MARK = 22; // quarter door leaf — daubed with the whitewash X

const F_FLAG = 1;
const F_DIRT = 3;
const F_COBBLE = 4;
const F_WOOD = 5;
const F_WATER = 6;
const F_GRASS = 7; // trampled meadow — the camp's park ground

const C_BEAMS = 1;
const C_SKY = 2;
const C_VAULT = 4;

const MAP_W = 90;
const MAP_H = 90;
const LOFT_Y = 45; // first row of the loft strip
const SEWER_Y = 60; // first row of the sewer strip

// ---------------------------------------------------------------------------
// Solid props — real textured geometry, not billboards or wall cells. Faces
// are vertical quads in world space (castProps in renderer.ts draws them,
// occlusion-correct); heights are in storeys, radii in cells. Faces bake a
// directional shade so prisms read as round.

// Sun comes from the southwest — faces turned that way are lit.
const SUN_AZ = 2.4;
const sunShade = (mid: number) => 0.62 + 0.38 * Math.max(0, Math.cos(mid - SUN_AZ));

function prismFaces(
  cx: number, cy: number, r: number, sides: number, h: number,
  tex: number, rot = 0, base = 0, dark = false
): PropFace[] {
  const faces: PropFace[] = [];
  for (let i = 0; i < sides; i++) {
    const a0 = rot + (i / sides) * Math.PI * 2;
    const a1 = rot + ((i + 1) / sides) * Math.PI * 2;
    faces.push({
      x0: cx + Math.cos(a0) * r, y0: cy + Math.sin(a0) * r,
      x1: cx + Math.cos(a1) * r, y1: cy + Math.sin(a1) * r,
      base, top: base + h, tex,
      shade: dark ? 0.3 : sunShade((a0 + a1) / 2),
      az: dark ? undefined : (a0 + a1) / 2,
      dark,
    });
  }
  return faces;
}

function boxFaces(
  cx: number, cy: number, w: number, d: number, h: number,
  tex: number, rot = 0, base = 0
): PropFace[] {
  const hw = w / 2, hd = d / 2, c = Math.cos(rot), s = Math.sin(rot);
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(
    ([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]
  );
  const faces: PropFace[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    const mid = Math.atan2((a[1] + b[1]) / 2 - cy, (a[0] + b[0]) / 2 - cx);
    faces.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1], base, top: base + h, tex, shade: sunShade(mid), az: mid });
  }
  return faces;
}

// A horizontal lid — the top a vertical quad can never show. Stored as a
// rect in its own frame; rot turns it about its centre. Only lids below
// eye level render — anything higher is an underside, never a top.
function topFace(cx: number, cy: number, w: number, d: number, z: number, tex: number, rot = 0): PropFace {
  return { x0: cx - w / 2, y0: cy - d / 2, x1: cx + w / 2, y1: cy + d / 2, base: z, top: z, tex, shade: 0.95, flat: true, rot };
}

// Two intersecting vertical quads — the old cross-tree trick, for roofs and
// branch stubs where a flat billboard would be wrong.
function crossFaces(cx: number, cy: number, w: number, h: number, base: number, tex: number, rot = 0): PropFace[] {
  const r = w / 2, c = Math.cos(rot), s = Math.sin(rot);
  const pt = (dx: number, dy: number) => ({ x: cx + dx * c - dy * s, y: cy + dx * s + dy * c });
  const a = pt(-r, 0), b = pt(r, 0), e = pt(0, -r), f = pt(0, r);
  return [
    { x0: a.x, y0: a.y, x1: b.x, y1: b.y, base, top: base + h, tex, shade: 0.92 },
    { x0: e.x, y0: e.y, x1: f.x, y1: f.y, base, top: base + h, tex, shade: 0.74 },
  ];
}

// An offset rotated around a prop's centre — furniture turns to its wall.
function rotOff(x: number, y: number, rot: number, dx: number, dy: number): [number, number] {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [x + dx * c - dy * s, y + dx * s + dy * c];
}

// A bed — low frame, a thin canvas mattress, a bolster and a headboard
// slab at the head end (local -x).
function bedFaces(x: number, y: number, rot: number): PropFace[] {
  const [hx, hy] = rotOff(x, y, rot, -0.44, 0);
  const [px, py] = rotOff(x, y, rot, -0.3, 0);
  return [
    ...boxFaces(x, y, 0.85, 0.5, 0.16, W_WOOD, rot),
    ...boxFaces(x, y, 0.78, 0.42, 0.09, W_CANVAS, rot, 0.16),
    topFace(x, y, 0.82, 0.46, 0.25, W_CANVAS, rot), // the mattress lid
    ...boxFaces(hx, hy, 0.04, 0.5, 0.34, W_WOOD, rot),
    ...boxFaces(px, py, 0.18, 0.36, 0.05, W_CANVAS, rot, 0.25),
  ];
}

// A table or desk — four legs and a top slab.
function tableFaces(x: number, y: number, rot: number, w: number, d: number, h: number): PropFace[] {
  const faces: PropFace[] = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const [lx, ly] = rotOff(x, y, rot, sx * (w / 2 - 0.05), sy * (d / 2 - 0.05));
    faces.push(...boxFaces(lx, ly, 0.05, 0.05, h, W_WOOD, rot));
  }
  faces.push(...boxFaces(x, y, w, d, 0.045, W_WOOD, rot, h));
  faces.push(topFace(x, y, w, d, h + 0.045, W_WOOD, rot));
  return faces;
}

// Stall geometry — shared by the plaza's stalls (stocked) and the
// quarter's (stripped). The awning is two stepped bands so it reads as
// canvas sloped back off the street, with a valance hanging at the lip.
function stallFaces(x: number, y: number, rot: number, stocked: boolean): PropFace[] {
  const [cx, cy] = rotOff(x, y, rot, 0, -0.24); // the boards, toward the customer
  const faces: PropFace[] = [
    ...boxFaces(cx, cy, 1.02, 0.3, 0.26, W_WOOD, rot),
    topFace(cx, cy, 1.02, 0.3, 0.26, W_WOOD, rot),
  ];
  if (stocked) {
    // Goods heaped on the boards — the stall's spot picks its wares:
    // produce, sacked grain or stacked crates.
    const mix = Math.abs(Math.floor(x * 13 + y * 7)) % 3;
    const heapTex = mix === 0 ? W_FOLIAGE : mix === 1 ? W_CANVAS : W_TIMBER;
    const [g1x, g1y] = rotOff(x, y, rot, -0.28, -0.24);
    const [g2x, g2y] = rotOff(x, y, rot, 0.12, -0.26);
    const [g3x, g3y] = rotOff(x, y, rot, 0.36, -0.2);
    faces.push(
      ...prismFaces(g1x, g1y, 0.13, 6, 0.11, heapTex, 0, 0.26),
      ...boxFaces(g2x, g2y, 0.22, 0.17, 0.09, mix === 2 ? W_WOOD : heapTex, rot, 0.26),
      ...prismFaces(g3x, g3y, 0.09, 6, 0.07, mix === 0 ? W_CANVAS : W_FOLIAGE, 0, 0.26)
    );
  }
  // Four poles — the front pair lower, so the canvas slopes off the street.
  // The awning rides well above eye height so it reads as shelter, not ceiling.
  for (const [px, py, ph] of [[-0.48, -0.44, 0.74], [0.48, -0.44, 0.74], [-0.48, 0.36, 0.9], [0.48, 0.36, 0.9]] as const) {
    const [ox, oy] = rotOff(x, y, rot, px, py);
    faces.push(...boxFaces(ox, oy, 0.05, 0.05, ph, W_WOOD, rot));
  }
  const [t1x, t1y] = rotOff(x, y, rot, 0, -0.28);
  const [t2x, t2y] = rotOff(x, y, rot, 0, 0.2);
  faces.push(
    ...boxFaces(t1x, t1y, 1.14, 0.5, 0.05, W_CANVAS, rot, stocked ? 0.72 : 0.66), // front band
    ...boxFaces(t2x, t2y, 1.14, 0.56, 0.05, W_CANVAS, rot, stocked ? 0.84 : 0.74) // back band — sags when stripped
  );
  // The valance — a hanging strip at the awning's front lip.
  const [vx, vy] = rotOff(x, y, rot, 0, -0.5);
  faces.push(...boxFaces(vx, vy, 1.14, 0.04, 0.11, W_CANVAS, rot, 0.62));
  return faces;
}

// kind → geometry. The well is a hollow octagonal drum (you can see over the
// rim into its dark throat), a post-and-lintel frame, and a crossed gable
// roof. Carts get a bed, wheel slabs and shafts; graves are leaning slabs.
// rot turns a prop's run — stairs use it to climb toward the nearest wall.
const PROP_BUILDERS: Record<string, (x: number, y: number, rot?: number) => PropDef> = {
  well: (x, y) => ({
    x, y, block: 0.24,
    faces: [
      ...prismFaces(x, y, 0.22, 8, 0.26, W_STONE, Math.PI / 8),
      // The inner ring — dark, so the mouth reads as depth, not paint.
      ...prismFaces(x, y, 0.15, 8, 0.23, W_STONE, Math.PI / 8, 0, true),
      // Uprights either side of the drum and a spindle across them.
      ...boxFaces(x - 0.19, y, 0.04, 0.04, 0.54, W_WOOD),
      ...boxFaces(x + 0.19, y, 0.04, 0.04, 0.54, W_WOOD),
      ...boxFaces(x, y, 0.42, 0.03, 0.03, W_WOOD, 0, 0.51),
      // Crossed gable roof.
      ...crossFaces(x, y, 0.5, 0.16, 0.54, W_WOOD, Math.PI / 4),
    ],
  }),
  cart: (x, y) => ({
    x, y, block: 0.28,
    faces: [
      ...boxFaces(x, y, 0.58, 0.32, 0.22, W_WOOD, 0, 0.09), // bed, raised on its axle
      topFace(x, y, 0.58, 0.32, 0.31, W_WOOD),
      ...boxFaces(x - 0.15, y + 0.19, 0.26, 0.03, 0.26, W_WOOD), // near wheel slab
      ...boxFaces(x - 0.15, y - 0.19, 0.26, 0.03, 0.26, W_WOOD), // far wheel slab
      ...boxFaces(x + 0.42, y + 0.1, 0.35, 0.03, 0.03, W_WOOD, 0.35), // shafts
      ...boxFaces(x + 0.42, y - 0.1, 0.35, 0.03, 0.03, W_WOOD, -0.35),
    ],
  }),
  barrel: (x, y) => ({ x, y, block: 0.24, faces: prismFaces(x, y, 0.23, 8, 0.55, W_WOOD) }),
  crate: (x, y) => ({
    x, y, block: 0.3,
    faces: [...boxFaces(x, y, 0.5, 0.5, 0.42, W_WOOD, 0.2), topFace(x, y, 0.5, 0.5, 0.42, W_WOOD, 0.2)],
  }),
  // Searchable containers — real furniture now. The sack is a squat belly
  // with a cinched neck; the chest a box with an overhanging darker lid.
  // Both kept small — they're clutter you kneel to, not furniture.
  sack: (x, y) => ({
    x, y, block: 0.12,
    faces: [
      ...prismFaces(x, y, 0.12, 8, 0.16, W_WOOD, Math.PI / 8),
      ...prismFaces(x, y, 0.05, 6, 0.06, W_WOOD, 0, 0.16),
    ],
  }),
  chest: (x, y) => ({
    x, y, block: 0.15,
    faces: [
      ...boxFaces(x, y, 0.26, 0.18, 0.14, W_WOOD),
      ...boxFaces(x, y, 0.28, 0.2, 0.035, W_TIMBER, 0, 0.14), // the lid, overhanging
      topFace(x, y, 0.28, 0.2, 0.175, W_TIMBER),
    ],
  }),
  bed: (x, y, rot = 0) => ({ x, y, block: 0.32, faces: bedFaces(x, y, rot) }),
  // The autopsy slab — two stone trestles under a thick mortuary top, and
  // today's body laid out on it under its winding sheet: a low tapered
  // mound of linen with a rise where the head lies.
  slab: (x, y, rot = 0) => {
    const [ax, ay] = rotOff(x, y, rot, -0.26, 0);
    const [bx, by] = rotOff(x, y, rot, 0.26, 0);
    const [hx, hy] = rotOff(x, y, rot, -0.22, 0); // the head end
    return {
      x, y, block: 0.22,
      faces: [
        ...boxFaces(ax, ay, 0.09, 0.26, 0.22, W_STONE, rot),
        ...boxFaces(bx, by, 0.09, 0.26, 0.22, W_STONE, rot),
        ...boxFaces(x, y, 0.74, 0.32, 0.05, W_STONE, rot, 0.22), // the top
        topFace(x, y, 0.74, 0.32, 0.27, W_STONE, rot),
        // The corpse — a shrouded form lying on the slab.
        ...boxFaces(x, y, 0.6, 0.2, 0.07, W_CANVAS, rot, 0.27),
        topFace(x, y, 0.6, 0.2, 0.34, W_CANVAS, rot),
        ...boxFaces(hx, hy, 0.12, 0.15, 0.05, W_CANVAS, rot, 0.34), // the head's rise
        topFace(hx, hy, 0.12, 0.15, 0.39, W_CANVAS, rot),
      ],
    };
  },
  homebed: (x, y, rot = 0) => ({ x, y, block: 0.32, faces: bedFaces(x, y, rot) }),
  desk: (x, y, rot = 0) => ({ x, y, block: 0.24, faces: tableFaces(x, y, rot, 0.5, 0.32, 0.27) }),
  table: (x, y, rot = 0) => ({ x, y, block: 0.26, faces: tableFaces(x, y, rot, 0.58, 0.36, 0.25) }),
  grave: (x, y) => ({
    x, y, block: 0.22,
    faces: boxFaces(x, y, 0.55, 0.13, 0.55, W_STONE, ((x * 31 + y * 17) % 10) / 60 - 0.08),
  }),
  deadTree: (x, y) => ({
    x, y, block: 0.16,
    faces: [
      ...prismFaces(x, y, 0.11, 6, 1.3, W_WOOD),
      ...crossFaces(x, y, 0.55, 0.3, 0.95, W_WOOD, 0.5), // branch stubs near the crown
    ],
  }),
  // A plane tree — a slim trunk under a dense clipped crown. The one thing
  // still green in the city: pollarded by habit, leafed all the same.
  tree: (x, y) => {
    const lean = ((x * 31 + y * 17) % 10) / 25; // slight per-tree variance
    return {
      x, y, block: 0.13,
      faces: [
        ...prismFaces(x, y, 0.09, 6, 0.8, W_WOOD),
        ...boxFaces(x, y, 0.62, 0.62, 0.5, W_FOLIAGE, lean, 0.62),
        ...boxFaces(x, y, 0.44, 0.44, 0.34, W_FOLIAGE, lean + 0.4, 1.05),
        topFace(x, y, 0.44, 0.44, 1.39, W_FOLIAGE, lean + 0.4),
      ],
    };
  },
  // A door-side planter — a stone trough of greenery by a threshold.
  planter: (x, y, rot = 0) => ({
    x, y, block: 0.2,
    faces: [
      ...boxFaces(x, y, 0.5, 0.22, 0.15, W_STONE, rot),
      topFace(x, y, 0.5, 0.22, 0.15, W_STONE, rot),
      ...boxFaces(x, y, 0.42, 0.16, 0.14, W_FOLIAGE, rot, 0.15),
      topFace(x, y, 0.42, 0.16, 0.29, W_FOLIAGE, rot),
    ],
  }),
  // A weed tuft — uninvited green in the cracks, walk-through.
  tuft: (x, y) => ({
    x, y, block: 0,
    faces: boxFaces(x, y, 0.28, 0.28, 0.12, W_FOLIAGE, ((x * 31 + y * 17) % 10) / 20),
  }),
  // A market stall — boards on trestles, goods heaped, canvas stretched
  // over poles overhead. rot fronts the counter toward the customer (0
  // faces -y); the seller works the other side. `deadStall` is the same
  // bones stripped bare — the quarter's stalls stand empty.
  stall: (x, y, rot = 0) => ({ x, y, block: 0.46, faces: stallFaces(x, y, rot, true) }),
  deadStall: (x, y, rot = 0) => ({ x, y, block: 0.46, faces: stallFaces(x, y, rot, false) }),
  // A lantern post — a wood upright carrying a glass-paned lantern head,
  // for open ground where a sconce has no wall to hang on.
  lamp: (x, y) => ({
    x, y, block: 0.08,
    faces: [
      ...prismFaces(x, y, 0.045, 6, 0.56, W_WOOD),
      ...boxFaces(x, y, 0.17, 0.17, 0.16, W_LAMP, 0.785, 0.56), // the glowing head, turned to catch the eye
    ],
  }),
  // A flight of stairs — six treads climbing toward the wall, the top ones
  // vanishing into the storey above. The prop is centred a third of a cell
  // up the flight so the bottom treads start at the sprite spot — which is
  // also the teleport landing, so the flight stays walk-through (block 0).
  stairs: (x, y, rot = 0) => {
    const dx = Math.sin(rot);
    const dy = -Math.cos(rot);
    const px = x + dx * 0.35;
    const py = y + dy * 0.35;
    const faces: PropFace[] = [];
    for (let i = 0; i < 6; i++) {
      const tx = px + dx * (i - 2.5) * 0.14;
      const ty = py + dy * (i - 2.5) * 0.14;
      const th = 0.1 + i * 0.13;
      faces.push(...boxFaces(tx, ty, 0.6, 0.18, th, W_WOOD, rot));
      faces.push(topFace(tx, ty, 0.6, 0.18, th, W_WOOD, rot)); // the tread
    }
    return { x: px, y: py, block: 0, faces };
  },
};

// A door leaf — one textured quad hung on a jamb, swinging on its hinge.
// All leaves are near full width (the doorway's frame is the wall opening),
// hinged west or east by cell parity so the street doesn't read uniform.
function makeDoor(idx: number, cx: number, cy: number, swing: number): DoorDef {
  const dir = cx % 2 === 0 ? 1 : -1;
  const hx = cx + (dir === 1 ? 0.01 : 0.99);
  const hy = cy + 0.5;
  const len = 0.98;
  const prop: PropDef = {
    x: cx + 0.5,
    y: hy,
    block: 0.07,
    seg: [hx, hy, hx + dir * len, hy],
    faces: [
      {
        x0: hx,
        y0: hy,
        x1: hx + dir * len,
        y1: hy,
        base: 0,
        top: 0.96,
        // East of the cordon every door wears the whitewash X.
        tex: cx > CORDON_X ? W_LEAF_MARK : W_LEAF,
        shade: sunShade(dir * (Math.PI / 2)),
        az: dir * (Math.PI / 2),
      },
    ],
  };
  return { idx, hx, hy, dir, len, swing, t: 0, open: false, prop };
}

// How far the leaf travels — just past square into the room, and how fast.
const DOOR_SWING = 1.35; // radians
const DOOR_SPEED = 2.1; // t per second — a heavy oak swing

// Advance every leaf toward its open/shut target. A closing door waits
// rather than sweep through whoever stands in the doorway.
export function updateDoors(map: GameMap, dt: number, px: number, py: number): void {
  for (const d of map.doors) {
    const target = d.open ? 1 : 0;
    if (d.t === target) continue;
    const nt = d.t + Math.sign(target - d.t) * Math.min(DOOR_SPEED * dt, Math.abs(target - d.t));
    const a = nt * d.swing * d.dir * DOOR_SWING;
    const ex = d.hx + d.dir * Math.cos(a) * d.len;
    const ey = d.hy + d.dir * Math.sin(a) * d.len;
    if (target === 0 && segDist(px, py, d.hx, d.hy, ex, ey) < 0.3) continue;
    d.t = nt;
    const f = d.prop.faces[0];
    f.x1 = ex;
    f.y1 = ey;
    // The leaf's face swings toward and away from the sun — keep shade honest.
    f.shade = sunShade(a + d.dir * (Math.PI / 2));
    f.az = a + d.dir * (Math.PI / 2);
    d.prop.seg![2] = ex;
    d.prop.seg![3] = ey;
  }
}

// Distance from a point to a segment — the leaf's collision.
function segDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

// The cordon — a palisade sealing the quarantine quarter, and its one gap.
// The gap starts blocked by a timber hurdle the guard watches, opened in play.
const CORDON_X = 61;
export const GATE_POS: [number, number][] = [
  [CORDON_X, 21],
  [CORDON_X, 22],
];

// ---------------------------------------------------------------------------
// Streets. Rects of cobble + open sky.

const STREETS = [
  { x0: 1, y0: 9, x1: 60, y1: 9 }, // north street — runs to the cordon
  { x0: 1, y0: 21, x1: 60, y1: 22 }, // main street — ends at the gate
  { x0: 1, y0: 34, x1: 60, y1: 34 }, // south street
  { x0: 15, y0: 1, x1: 16, y1: 42 }, // west lane
  { x0: 29, y0: 1, x1: 30, y1: 42 }, // center street
  { x0: 45, y0: 1, x1: 46, y1: 42 }, // east lane
  // The plaza — a widened crossing on the main street, with the well.
  { x0: 29, y0: 19, x1: 34, y1: 24 },
  // The quarantine quarter — same streets, other side of the wall.
  { x0: 62, y0: 9, x1: 88, y1: 10 }, // qz north street
  { x0: 62, y0: 21, x1: 88, y1: 22 }, // gate street
  { x0: 62, y0: 33, x1: 88, y1: 34 }, // qz south street
  { x0: 68, y0: 31, x1: 73, y1: 32 }, // the dead-end alley behind the alchemist's
];

// The camp's ground — the old park in the quarter's north where the tents
// stand. Grass where the houses were pulled down.
const CAMP_RECTS = [
  { x0: 62, y0: 1, x1: 88, y1: 8 },
  { x0: 62, y0: 11, x1: 88, y1: 20 },
];

// ---------------------------------------------------------------------------
// Buildings. Rects are inclusive outer walls; interiors are one cell in.
// `door` is the wall cell opened onto the street (barricadable).
// `up` (facade texture) and `h` (height in storeys) come from the material.

interface BuildingDef {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  wall: number;
  floor: number;
  door: { side: "N" | "S"; at: number };
  // Open windows in the facade — breachable like doors until barricaded.
  win?: { side: "N" | "S" | "E" | "W"; at: number }[];
  name?: string; // landmark name, shown on the city map
  sign?: string; // hanging sign sprite, e.g. "tavern" → sign_tavern
}

const BUILDINGS: BuildingDef[] = [
  // North band — facades on the north street
  { x0: 1, y0: 1, x1: 7, y1: 8, wall: W_TIMBER, floor: F_WOOD, door: { side: "S", at: 4 }, win: [{ side: "E", at: 4 }], name: "bakery", sign: "bakery" },
  { x0: 9, y0: 1, x1: 14, y1: 8, wall: W_TIMBER, floor: F_WOOD, door: { side: "S", at: 11 } },
  { x0: 17, y0: 1, x1: 24, y1: 8, wall: W_TIMBER, floor: F_WOOD, door: { side: "S", at: 20 }, win: [{ side: "W", at: 4 }], name: "the inn", sign: "tavern" },
  { x0: 25, y0: 1, x1: 28, y1: 8, wall: W_STONE, floor: F_WOOD, door: { side: "S", at: 26 } },
  { x0: 31, y0: 1, x1: 37, y1: 8, wall: W_TIMBER, floor: F_FLAG, door: { side: "S", at: 34 }, win: [{ side: "W", at: 4 }], name: "apothecary", sign: "apothecary" },
  { x0: 38, y0: 1, x1: 44, y1: 8, wall: W_TIMBER, floor: F_WOOD, door: { side: "S", at: 41 } },
  { x0: 47, y0: 1, x1: 52, y1: 8, wall: W_BRICK, floor: F_FLAG, door: { side: "S", at: 49 } },
  { x0: 53, y0: 1, x1: 58, y1: 8, wall: W_TIMBER, floor: F_WOOD, door: { side: "S", at: 56 } },
  // Middle band — between north street and main street
  { x0: 1, y0: 10, x1: 7, y1: 20, wall: W_TIMBER, floor: F_WOOD, door: { side: "S", at: 3 }, win: [{ side: "E", at: 15 }] },
  { x0: 9, y0: 10, x1: 14, y1: 20, wall: W_TIMBER, floor: F_WOOD, door: { side: "N", at: 11 } },
  { x0: 17, y0: 10, x1: 22, y1: 20, wall: W_STONE, floor: F_FLAG, door: { side: "S", at: 19 }, win: [{ side: "E", at: 14 }] },
  { x0: 24, y0: 10, x1: 28, y1: 20, wall: W_TIMBER, floor: F_WOOD, door: { side: "N", at: 26 }, win: [{ side: "E", at: 15 }] },
  { x0: 31, y0: 10, x1: 37, y1: 20, wall: W_TIMBER, floor: F_FLAG, door: { side: "N", at: 34 } },
  { x0: 38, y0: 10, x1: 44, y1: 20, wall: W_TIMBER, floor: F_WOOD, door: { side: "S", at: 41 } },
  { x0: 47, y0: 10, x1: 52, y1: 20, wall: W_STONE, floor: F_FLAG, door: { side: "S", at: 49 } },
  { x0: 54, y0: 10, x1: 58, y1: 20, wall: W_TIMBER, floor: F_WOOD, door: { side: "N", at: 56 }, win: [{ side: "W", at: 15 }] },
  // South band — between main street and south street
  { x0: 1, y0: 23, x1: 7, y1: 33, wall: W_TIMBER, floor: F_WOOD, door: { side: "N", at: 4 }, win: [{ side: "E", at: 28 }] },
  { x0: 9, y0: 23, x1: 14, y1: 33, wall: W_TIMBER, floor: F_WOOD, door: { side: "S", at: 11 } },
  { x0: 17, y0: 23, x1: 23, y1: 33, wall: W_TIMBER, floor: F_WOOD, door: { side: "N", at: 20 } },
  { x0: 24, y0: 23, x1: 28, y1: 33, wall: W_STONE, floor: F_FLAG, door: { side: "S", at: 26 }, win: [{ side: "E", at: 28 }] },
  { x0: 35, y0: 23, x1: 38, y1: 33, wall: W_TIMBER, floor: F_WOOD, door: { side: "N", at: 36 } },
  { x0: 39, y0: 23, x1: 44, y1: 33, wall: W_TIMBER, floor: F_WOOD, door: { side: "S", at: 42 } },
  { x0: 47, y0: 23, x1: 52, y1: 33, wall: W_TIMBER, floor: F_WOOD, door: { side: "N", at: 49 } },
  { x0: 54, y0: 23, x1: 58, y1: 33, wall: W_TIMBER, floor: F_WOOD, door: { side: "S", at: 56 }, win: [{ side: "W", at: 28 }] },
  // Bottom band — below the south street
  { x0: 1, y0: 35, x1: 7, y1: 42, wall: W_TIMBER, floor: F_WOOD, door: { side: "N", at: 4 } },
  { x0: 9, y0: 35, x1: 14, y1: 42, wall: W_TIMBER, floor: F_WOOD, door: { side: "N", at: 11 } },
  { x0: 17, y0: 35, x1: 23, y1: 42, wall: W_STONE, floor: F_FLAG, door: { side: "N", at: 20 }, win: [{ side: "W", at: 38 }] },
  { x0: 24, y0: 35, x1: 28, y1: 42, wall: W_TIMBER, floor: F_WOOD, door: { side: "N", at: 26 } },
  { x0: 31, y0: 35, x1: 37, y1: 42, wall: W_TIMBER, floor: F_WOOD, door: { side: "N", at: 34 } },
  { x0: 38, y0: 35, x1: 44, y1: 42, wall: W_TIMBER, floor: F_WOOD, door: { side: "N", at: 41 }, win: [{ side: "E", at: 38 }] },
  { x0: 52, y0: 35, x1: 58, y1: 42, wall: W_BRICK, floor: F_FLAG, door: { side: "N", at: 55 }, win: [{ side: "W", at: 38 }], name: "the church", sign: "church" },
  // x47-51, y35-42 is left open — the graveyard.

  // The camp — north of the gate street the quarter's houses were pulled
  // down when the cordon went up; tents stand in the old park instead.
  // The marquee is the pesthouse — a canvas ward, its flap tied open.
  // x62-63 is kept clear: a dead strip along the stakes the guards hold.
  { x0: 64, y0: 12, x1: 71, y1: 18, wall: W_CANVAS, floor: F_GRASS, door: { side: "S", at: 68 }, name: "the pesthouse" },
  // The lesser marquees — canvas wards pitched over the park's ground,
  // smaller and lower than the pesthouse, flaps standing open.
  { x0: 64, y0: 2, x1: 67, y1: 5, wall: W_CANVAS, floor: F_GRASS, door: { side: "S", at: 66 } },
  { x0: 71, y0: 2, x1: 74, y1: 5, wall: W_CANVAS, floor: F_GRASS, door: { side: "S", at: 73 } },
  { x0: 79, y0: 1, x1: 82, y1: 4, wall: W_CANVAS, floor: F_GRASS, door: { side: "S", at: 81 } },
  { x0: 85, y0: 4, x1: 88, y1: 7, wall: W_CANVAS, floor: F_GRASS, door: { side: "N", at: 86 } },
  { x0: 76, y0: 12, x1: 79, y1: 15, wall: W_CANVAS, floor: F_GRASS, door: { side: "S", at: 78 } },
  { x0: 83, y0: 14, x1: 86, y1: 17, wall: W_CANVAS, floor: F_GRASS, door: { side: "N", at: 84 } },

  // The old town — south of the gate street the quarter's original streets
  // still stand: shuttered, marked, condemned. This is where the sickness
  // began, and where the case work happens. The dead strip along the
  // palisade (x62-63) is bare ground — nobody is let near the stakes.
  { x0: 64, y0: 23, x1: 66, y1: 32, wall: W_QUAR, floor: F_WOOD, door: { side: "N", at: 65 } },
  { x0: 68, y0: 23, x1: 73, y1: 30, wall: W_QUAR, floor: F_WOOD, door: { side: "N", at: 70 }, name: "the shuttered shop", sign: "alchemist" },
  { x0: 75, y0: 23, x1: 80, y1: 32, wall: W_QUAR, floor: F_WOOD, door: { side: "N", at: 77 } },
  { x0: 82, y0: 23, x1: 88, y1: 32, wall: W_QUAR, floor: F_WOOD, door: { side: "N", at: 85 } },
  // Below the qz south street
  { x0: 64, y0: 35, x1: 70, y1: 42, wall: W_QUAR, floor: F_WOOD, door: { side: "N", at: 66 } },
  { x0: 72, y0: 35, x1: 80, y1: 42, wall: W_QUAR, floor: F_FLAG, door: { side: "N", at: 76 } },
  { x0: 82, y0: 35, x1: 88, y1: 42, wall: W_QUAR, floor: F_WOOD, door: { side: "N", at: 85 } },
];

// Facade material → upper-storey texture id.
const UPPER_FOR_WALL: Record<number, number> = {
  [W_TIMBER]: 7, // timber + shuttered windows
  [W_STONE]: 9, // stone + narrow windows
  [W_BRICK]: 11, // dark brick + slit windows
  [W_QUAR]: 21, // boarded windows — nothing lit behind them
};

// Facade material → interior texture id.
const INNER_FOR_WALL: Record<number, number> = {
  [W_TIMBER]: 14, // timber framing through the plaster
  [W_STONE]: 15, // wainscot panelling
  [W_BRICK]: 2, // dark brick, same as outside
  [W_QUAR]: 13, // aged plaster — patched, spalled, run-down
};
const INNER_WALL = 15; // lofts get wainscot

// Height in storeys per material — varied by index so the skyline steps.
// The quarter was raised in a panic: nothing there climbs like a real house.
function buildingHeight(wall: number, i: number): number {
  // Canvas stays under a storey — a marquee is a roof of cloth, not a
  // house, and there is no upper storey for its walls to rise into.
  if (wall === W_CANVAS) return 0.62 + (i % 4) * 0.08;
  const base = wall === W_TIMBER ? 2.3 : wall === W_BRICK ? 2.9 : wall === W_QUAR ? 1.8 : 1.9;
  return base + (i % 3) * 0.25;
}

// ---------------------------------------------------------------------------
// Loft rooms — the "upstairs". A sealed strip below the city on the grid,
// entered only through stair sprites. Each links back to its building.

interface LoftDef {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const LOFTS: LoftDef[] = [
  { x0: 1, y0: LOFT_Y, x1: 9, y1: LOFT_Y + 7 },
  { x0: 11, y0: LOFT_Y, x1: 19, y1: LOFT_Y + 7 },
  { x0: 21, y0: LOFT_Y, x1: 29, y1: LOFT_Y + 7 },
  { x0: 31, y0: LOFT_Y, x1: 39, y1: LOFT_Y + 7 },
  { x0: 41, y0: LOFT_Y, x1: 49, y1: LOFT_Y + 7 },
  { x0: 51, y0: LOFT_Y, x1: 58, y1: LOFT_Y + 7 },
];

// Stair links live on the `stairs` sprites below — each carries a stairLink
// to the other end of the climb. Buildings with stairs: bakery, the inn,
// apothecary, middle-west house, south-west house, church tower.

// ---------------------------------------------------------------------------
// The sewers — open rects carved out of the rock, joined where they overlap.
// Fully dark down here; the vault closes overhead.

const SEWER_OPEN = [
  { x0: 73, y0: 64, x1: 78, y1: 69 }, // landing chamber under the grate
  { x0: 74, y0: 69, x1: 75, y1: 77 }, // the shaft
  { x0: 55, y0: 76, x1: 79, y1: 78 }, // the main gallery
  { x0: 55, y0: 72, x1: 61, y1: 80 }, // the cistern, west end
  { x0: 79, y0: 72, x1: 88, y1: 84 }, // the pit — where the bodies go
];
// The channel of foul water down the gallery's middle.
const WATER_ROW_Y = 77;

// ---------------------------------------------------------------------------
// Props and containers. Nothing lies loose on the ground — supplies come
// from the shops, or from searchable sacks, chests, carts and jars that
// restock each dawn.

const SPRITES: SpriteDef[] = [
  // The plaza — the well ringed by market stalls; canvas and goods on every
  // side, vendors behind the boards while the sun is up.
  { kind: "well", x: 31.5, y: 21.7 },
  { kind: "brazier", x: 29.7, y: 23.4 },
  { kind: "brazier", x: 33.4, y: 19.7 },
  { kind: "cart", x: 24.5, y: 21.6, search: "cart_timber", examine: "the cart's bed" },
  { kind: "stall", x: 30.3, y: 20.05, rot: 3.1416 },  // the herbwife's — fronts south at the well
  { kind: "stall", x: 30.7, y: 23.72 },              // the clothier's — fronts north
  { kind: "stall", x: 32.4, y: 23.78 },              // mother anette's rags
  { kind: "stall", x: 33.9, y: 23.5, rot: -1.5708 }, // the costermonger — fronts west at the well

  // Street flames — sparse; nights stay dark between them
  { kind: "torch", x: 5.5, y: 21.4 },
  { kind: "torch", x: 21.5, y: 21.4 },
  { kind: "torch", x: 39.5, y: 22.6 },
  { kind: "torch", x: 55.5, y: 21.4 },
  { kind: "torch", x: 10.5, y: 9.5 },
  { kind: "torch", x: 40.5, y: 9.5 },
  { kind: "torch", x: 12.5, y: 34.5 },
  { kind: "torch", x: 40.5, y: 34.4 },
  { kind: "torch", x: 15.5, y: 14.5 },
  { kind: "torch", x: 45.5, y: 28.5 },
  { kind: "cart", x: 45.6, y: 15.5, search: "cart_timber", examine: "the cart's bed" },
  { kind: "cart", x: 49.5, y: 37.3, search: "cart_timber", examine: "the burial cart" },

  // By the gate — the provost's fire, and the corpse cart waiting to go east
  { kind: "brazier", x: 59.5, y: 22.6 },
  { kind: "cart", x: 58.5, y: 22.4, search: "cart_timber", examine: "the corpse cart" },

  // Green among the stone — planted where it makes sense: the plaza's
  // corners, the graveyard, the dirt gaps between buildings where alleys
  // run, and the camp's old park ground. Nothing stands in the roadway.
  { kind: "tree", x: 29.4, y: 19.3 },  // the plaza's west corner
  { kind: "tree", x: 34.55, y: 24.35 }, // and its east corner
  { kind: "tree", x: 47.6, y: 36.4 },  // the graveyard — one living tree
  { kind: "tree", x: 8.5, y: 5.5 },    // the alleys — trees in the gaps
  { kind: "tree", x: 8.5, y: 15.5 },   // between the houses
  { kind: "tree", x: 8.5, y: 26.5 },
  { kind: "tree", x: 53.5, y: 14.5 },
  { kind: "tree", x: 53.5, y: 28.5 },
  { kind: "tree", x: 76.5, y: 9.5 },   // the camp's old park — still alive
  { kind: "tree", x: 83.5, y: 8.7 },   // where the dead trees stand
  { kind: "planter", x: 3.35, y: 9.06 },  // the bakery's threshold — tucked to the facade
  { kind: "planter", x: 5.65, y: 9.06 },
  { kind: "planter", x: 19.35, y: 9.06 }, // the inn's threshold
  { kind: "planter", x: 21.65, y: 9.06 },
  { kind: "planter", x: 33.35, y: 9.06 }, // the apothecary's threshold
  { kind: "planter", x: 35.65, y: 9.06 },
  { kind: "planter", x: 54.3, y: 34.72 }, // the church porch
  { kind: "planter", x: 57.0, y: 34.8 },
  { kind: "tuft", x: 49.8, y: 36.9 },  // the graveyard gone to weed
  { kind: "tuft", x: 50.7, y: 41.0 },
  { kind: "tuft", x: 8.5, y: 31.5 },   // weeds in the alley dirt
  { kind: "tuft", x: 53.5, y: 30.6 },
  { kind: "tuft", x: 78.5, y: 9.4 },   // the park gone shaggy

  // Bakery — fire in the hearth, bread on the shelf, stairs to the loft
  { kind: "torch", x: 4.5, y: 4.5 },
  { kind: "stairs", x: 2.5, y: 2.5, stairLink: { x: 4.5, y: 50.5 } },
  // Tenement — a brazier keeps the dark off
  { kind: "brazier", x: 11.5, y: 2.6 },
  { kind: "table", x: 11.5, y: 4.5 },
  // The inn — the warmest room in the city, and your lodgings upstairs
  { kind: "torch", x: 20.5, y: 4.5 },
  { kind: "brazier", x: 22.5, y: 6.4 },
  { kind: "stairs", x: 18.5, y: 2.5, stairLink: { x: 14.5, y: 50.5 } },
  { kind: "table", x: 20.5, y: 6.5 },
  { kind: "table", x: 23.4, y: 5.5 },
  { kind: "barrel", x: 18.5, y: 6.5 },
  { kind: "barrel", x: 23.4, y: 2.5 },
  // Stone house
  { kind: "torch", x: 26.5, y: 4.5 },
  { kind: "bed", x: 26.5, y: 2.6, rot: 1.5708 },
  // Apothecary
  { kind: "torch", x: 34.5, y: 4.5 },
  { kind: "stairs", x: 36.4, y: 6.4, rot: 1.5708, stairLink: { x: 24.5, y: 50.5 } },
  { kind: "table", x: 32.5, y: 3.5 },
  // Dark house
  { kind: "brazier", x: 41.5, y: 2.6 },
  { kind: "bed", x: 39.5, y: 2.6, rot: 1.5708 },
  // Chapel house
  { kind: "brazier", x: 49.5, y: 4.5 },
  // North-east house
  { kind: "torch", x: 56, y: 4.5 },
  { kind: "barrel", x: 57.4, y: 6.5 },
  { kind: "bed", x: 54.6, y: 2.6, rot: 1.5708 },
  // Middle band
  { kind: "torch", x: 3.5, y: 15.5 },
  { kind: "stairs", x: 2.5, y: 19.3, rot: 3.1416, stairLink: { x: 33.5, y: 50.5 } },
  { kind: "crate", x: 4.5, y: 12.5, search: "timber_crate", examine: "the timber crate" },
  { kind: "table", x: 4.5, y: 16.5 },
  { kind: "brazier", x: 12.5, y: 16.5 },
  { kind: "torch", x: 19.5, y: 13.5 },
  { kind: "crate", x: 18.5, y: 18.5 },
  { kind: "barrel", x: 21.5, y: 18.5 },
  { kind: "bed", x: 21.4, y: 11.6, rot: 3.1416 },
  { kind: "torch", x: 26, y: 14.5 },
  // Middle east
  { kind: "crate", x: 32.5, y: 13.5, search: "timber_crate", examine: "the timber crate" },
  { kind: "crate", x: 35.5, y: 14.5, search: "timber_crate", examine: "the timber crate" },
  { kind: "brazier", x: 40.5, y: 13.5 },
  { kind: "bed", x: 43.4, y: 11.6, rot: 3.1416 },
  { kind: "torch", x: 49.5, y: 13.5 },
  { kind: "barrel", x: 51.4, y: 18.4 },
  { kind: "torch", x: 56, y: 15 },
  // South band
  { kind: "torch", x: 4, y: 28 },
  { kind: "stairs", x: 6.4, y: 32.4, rot: 3.1416, stairLink: { x: 43.5, y: 50.5 } },
  { kind: "barrel", x: 6.4, y: 25.4 },
  { kind: "torch", x: 11.5, y: 28 },
  { kind: "table", x: 12.5, y: 26.5 },
  { kind: "brazier", x: 21.5, y: 28.5 },
  { kind: "bed", x: 18.5, y: 24.6, rot: 1.5708 },
  { kind: "torch", x: 26, y: 25.5 },
  { kind: "crate", x: 25.5, y: 31.4 },
  { kind: "torch", x: 36.5, y: 25.5 },
  { kind: "brazier", x: 41.5, y: 27.5 },
  { kind: "barrel", x: 40.5, y: 25.5 },
  { kind: "torch", x: 49.5, y: 28 },
  { kind: "bed", x: 48.5, y: 24.6, rot: 1.5708 },
  { kind: "torch", x: 56, y: 28 },
  // Bottom band
  { kind: "torch", x: 4, y: 38.5 },
  { kind: "barrel", x: 2.5, y: 40.5 },
  { kind: "bed", x: 5.5, y: 36.6, rot: 1.5708 },
  { kind: "brazier", x: 11.5, y: 38.6 },
  { kind: "torch", x: 20, y: 38.5 },
  { kind: "table", x: 21.5, y: 40.5 },
  { kind: "torch", x: 26, y: 38.5 },
  { kind: "crate", x: 25.5, y: 40.5, search: "timber_crate", examine: "the timber crate" },
  { kind: "brazier", x: 34.5, y: 38.8 },
  { kind: "bed", x: 36.4, y: 36.6, rot: 1.5708 },
  { kind: "torch", x: 41, y: 38.5 },
  // The church — candlelit, and its tower climbs to the last loft
  { kind: "brazier", x: 53.5, y: 37.5 },
  { kind: "brazier", x: 56.5, y: 37.5 },
  { kind: "stairs", x: 57.4, y: 36.5, stairLink: { x: 54.5, y: 50.5 } },
  // The graveyard — open dirt, graves and a dead tree
  { kind: "grave", x: 48.5, y: 37.5 },
  { kind: "grave", x: 50.5, y: 39.5 },
  { kind: "grave", x: 48.5, y: 41.3 },
  { kind: "deadTree", x: 51.2, y: 40.5 },

  // The quarantine quarter — quieter, meaner, watched.
  // Gate street — a brazier by the cordon, bodies' cart by the pesthouse.
  // The market that was: stalls stand stripped and sagging along the street
  // where the quarter used to trade — nobody left to sell to.
  { kind: "brazier", x: 63.5, y: 21.6 },
  { kind: "torch", x: 74.5, y: 21.4 },
  { kind: "torch", x: 86.5, y: 22.6 },
  { kind: "cart", x: 66.5, y: 22.6, search: "cart_timber", examine: "the bodies' cart" },
  { kind: "deadStall", x: 70.5, y: 22.5 },
  { kind: "deadStall", x: 82.5, y: 22.4 },
  // The marquee — cots under canvas, the slab, Marguerite's vigil
  { kind: "bed", x: 65.6, y: 13.5, rot: 1.5708 },
  { kind: "bed", x: 69.5, y: 13.5, rot: 1.5708 },
  { kind: "bed", x: 70.4, y: 16.6, rot: 3.1416 },
  { kind: "slab", x: 66.5, y: 16.8 }, // the mortuary slab, today's body on it
  { kind: "brazier", x: 72.3, y: 19.4 },
  { kind: "table", x: 65.4, y: 15.7 },
  // The camp — tents pitched across the old park where the houses stood.
  // Cots dragged into the open, fires burning night and day.
  { kind: "deadTree", x: 76, y: 6.8 },
  { kind: "deadTree", x: 87.3, y: 13 },
  { kind: "brazier", x: 70.5, y: 5.8 },
  { kind: "brazier", x: 81.5, y: 15.2 },
  { kind: "bed", x: 77.5, y: 13.6, rot: 1.5708 }, // a cot inside a marquee
  // The alchemist's shuttered shop — the alembic still warm, his ledger out
  { kind: "alembic", x: 72.4, y: 25.5 },
  { kind: "table", x: 69.5, y: 26.5 },
  { kind: "letter", x: 70.5, y: 28.5, letter: 4 },
  // The grate in the dead-end alley — his way down
  { kind: "grate", x: 71.5, y: 31.6, stairLink: { x: 75.5, y: 66.5 } },
  // The old town — condemned tenements, sparse candles, a little salvage
  // left in houses nobody lives in any more.
  { kind: "brazier", x: 86.5, y: 25.5 },
  { kind: "crate", x: 77.5, y: 30.5, search: "timber_crate", examine: "a scavenge crate" },
  { kind: "bed", x: 78.5, y: 24.6, rot: 1.5708 },
  { kind: "torch", x: 66, y: 38.5 },
  { kind: "bed", x: 69.5, y: 36.6, rot: 1.5708 },
  { kind: "brazier", x: 76.5, y: 38.5 },
  { kind: "barrel", x: 84.5, y: 40.5 },

  // The lofts — a bed, a flame, a little loot in each
  { kind: "stairs", x: 4.5, y: 50.5, rot: 3.1416, stairLink: { x: 2.5, y: 2.5 } },
  { kind: "bed", x: 7.5, y: 47.5, rot: 1.5708 },
  { kind: "torch", x: 6.5, y: 50.5 },
  { kind: "stairs", x: 14.5, y: 50.5, rot: 3.1416, stairLink: { x: 18.5, y: 2.5 } },
  { kind: "homebed", x: 17.5, y: 47.5, rot: 1.5708 }, // the doctor's room — sleep here
  { kind: "desk", x: 13.4, y: 49.2 },
  { kind: "torch", x: 16, y: 50.5 },
  { kind: "stairs", x: 24.5, y: 50.5, rot: 3.1416, stairLink: { x: 36.4, y: 6.4 } },
  { kind: "bed", x: 27.5, y: 47.5, rot: 1.5708 },
  { kind: "torch", x: 25, y: 50.5 },
  { kind: "stairs", x: 33.5, y: 50.5, rot: 3.1416, stairLink: { x: 2.5, y: 19.3 } },
  { kind: "bed", x: 37.5, y: 47.5, rot: 1.5708 },
  { kind: "torch", x: 35, y: 50.5 },
  { kind: "stairs", x: 43.5, y: 50.5, rot: 3.1416, stairLink: { x: 6.4, y: 32.4 } },
  { kind: "bed", x: 47.5, y: 47.5, rot: 1.5708 },
  { kind: "torch", x: 45, y: 50.5 },
  { kind: "stairs", x: 54.5, y: 50.5, rot: 3.1416, stairLink: { x: 57.4, y: 36.5 } },
  { kind: "bed", x: 56.5, y: 47.5, rot: 1.5708 },
  { kind: "brazier", x: 52.5, y: 50.5 },

  // The sewers — a lamp at the landing, a brazier someone keeps lit in the pit
  { kind: "grate", x: 76.5, y: 66.5, stairLink: { x: 71.5, y: 32.4 } },
  { kind: "torch", x: 74.5, y: 65.5 },
  { kind: "torch", x: 58.5, y: 76.5 },
  { kind: "brazier", x: 86.5, y: 82.5 },
  { kind: "corpsepile", x: 83.5, y: 78.5 },
  { kind: "corpsepile", x: 80.5, y: 81.5 },
  { kind: "specimen", x: 82.5, y: 76.5, search: "specimen_jar", examine: "the sealed jar" },
  { kind: "letter", x: 58.5, y: 74.5, letter: 5 },

  // Searchable containers — the scavenging game. Each holds a loot table
  // (see clues.ts) and restocks at dawn. Sacks and chests in kitchens,
  // sickrooms and stores.
  { kind: "sack", x: 2.6, y: 6.4, search: "flour_sack", examine: "flour sack" }, // the bakery
  { kind: "chest", x: 22.5, y: 2.6, search: "inn_chest", examine: "the inn's chest" },
  { kind: "chest", x: 32.5, y: 6.5, search: "remedy_chest", examine: "aubert's stores" },
  { kind: "chest", x: 18.6, y: 12.4, search: "home_chest", examine: "a family's chest" }, // the widow's house
  { kind: "sack", x: 39.5, y: 6.5, search: "home_chest", examine: "a linen sack" },
  { kind: "chest", x: 25.5, y: 31.4, search: "home_chest", examine: "a family's chest" },
  { kind: "sack", x: 57.6, y: 22.6, search: "gate_sack", examine: "the provost's ration sack" },
  { kind: "sack", x: 70.6, y: 17.4, search: "ward_sack", examine: "the ward's supply sack" },
  { kind: "sack", x: 65.5, y: 30.4, search: "home_chest", examine: "a meagre sack" }, // qz tenement
  { kind: "chest", x: 69.4, y: 29.3, search: "grey_chest", examine: "a locked chest" }, // the grey man's stores

  // Evidence marks — physical traces, examined not taken. They sit flat on
  // the floor and read as stains, tracks and scratches.
  { kind: "marks", x: 30.7, y: 21.3, examine: "the fouled rope", clue: "well_foul" },
  { kind: "marks", x: 72.3, y: 31.8, examine: "the drag marks", clue: "drag_marks" },
  { kind: "marks", x: 50.6, y: 40.9, examine: "the shallow graves", clue: "shallow_graves" },
  { kind: "marks", x: 65.4, y: 13.7, examine: "the gleaming cups", clue: "gleaming_cup" },
  { kind: "marks", x: 70.2, y: 27.6, examine: "the straps and stains", clue: "restraints" },
  { kind: "marks", x: 84.5, y: 80.5, examine: "the bones that stir", clue: "sewer_dead" },

  // The cure's makings — rue grows over the graves, leeches by the well.
  { kind: "rue", x: 47.5, y: 40.4, search: "rue_bed", examine: "the rue bed" },
  { kind: "rue", x: 49.6, y: 37.2, search: "rue_bed", examine: "the rue bed" },
  { kind: "rue", x: 50.8, y: 41.6, search: "rue_bed", examine: "the rue bed" },
  { kind: "leeches", x: 30.4, y: 23.4, search: "leech_jar", examine: "the leech jar" },
  { kind: "leeches", x: 33.2, y: 22.6, search: "leech_jar", examine: "the leech jar" },
  // Letters left behind — readable scraps of the plague's story.
  { kind: "letter", x: 12.3, y: 5.2, letter: 0 }, // a mother's letter, north-street house
  { kind: "letter", x: 55.5, y: 38.5, letter: 1 }, // the cordon order, in the church
  { kind: "letter", x: 50.6, y: 30.4, letter: 2 }, // the gravedigger's tally, south-street house
  { kind: "letter", x: 70.4, y: 14.3, letter: 3 }, // a dying patient's note, the pesthouse
];

// ---------------------------------------------------------------------------

export function buildMap(): GameMap {
  const w = MAP_W;
  const h = MAP_H;
  const walls = new Uint8Array(w * h);
  const wallUp = new Uint8Array(w * h);
  const wallIn = new Uint8Array(w * h);
  const wallH = new Float32Array(w * h).fill(1);
  const openSkin = new Uint8Array(w * h);
  const floorTex = new Uint8Array(w * h);
  const ceilTex = new Uint8Array(w * h);
  const ceilH = new Float32Array(w * h);
  const doorways = new Set<number>();
  const windows = new Set<number>();
  const doors: DoorDef[] = [];

  // Default: open ground — dirt under the sky. Streets and interiors
  // overwrite this; what remains becomes alleys and empty lots.
  floorTex.fill(F_DIRT);
  ceilTex.fill(C_SKY);
  ceilH.fill(1);

  // Everything at and below the loft line is solid rock until carved —
  // nothing walks there. The lofts and sewers open rooms inside it.
  for (let y = LOFT_Y - 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      walls[i] = W_STONE;
      floorTex[i] = 0;
      ceilTex[i] = 0;
    }
  }

  // City wall around the edge — a storey and a half of rampart.
  const setBorder = (i: number) => {
    walls[i] = W_STONE;
    wallH[i] = 1.35;
  };
  for (let x = 0; x < w; x++) {
    setBorder(x);
    setBorder((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    setBorder(y * w);
    setBorder(y * w + w - 1);
  }

  // The cordon — a stake palisade sealing the quarantine quarter, top to
  // bottom. The height wanders a little: cut and raised in a hurry.
  for (let y = 0; y < LOFT_Y - 1; y++) {
    const i = y * w + CORDON_X;
    walls[i] = W_PALISADE;
    wallH[i] = 0.92 + ((y * 7 + 3) % 5) * 0.02;
    floorTex[i] = 0;
    ceilTex[i] = C_SKY; // open air above the stakes — sky shows through
  }
  // The one gap — waist-high timber hurdles the provost's man stands over.
  // Low enough to see the dead streets beyond; still a wall, so it holds.
  for (const [gx, gy] of GATE_POS) {
    const i = gy * w + gx;
    walls[i] = BARRICADE_WALL_ID;
    wallH[i] = 0.45;
    floorTex[i] = F_COBBLE;
    ceilTex[i] = C_SKY;
  }

  // Streets.
  for (const s of STREETS) {
    for (let y = s.y0; y <= s.y1; y++) {
      for (let x = s.x0; x <= s.x1; x++) {
        floorTex[y * w + x] = F_COBBLE;
      }
    }
  }

  // The camp ground — the old park where the quarter's houses stood, gone
  // to trampled meadow since the tents went up.
  for (const g of CAMP_RECTS) {
    for (let y = g.y0; y <= g.y1; y++) {
      for (let x = g.x0; x <= g.x1; x++) {
        const i = y * w + x;
        if (floorTex[i] !== F_COBBLE) floorTex[i] = F_GRASS;
      }
    }
  }

  // Buildings — walls with height + facade, interior floor, beams, door,
  // and any open windows.
  for (let bi = 0; bi < BUILDINGS.length; bi++) {
    const b = BUILDINGS[bi];
    const up = UPPER_FOR_WALL[b.wall] ?? 0;
    const inner = INNER_FOR_WALL[b.wall] ?? 0;
    const bh = buildingHeight(b.wall, bi);
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const i = y * w + x;
        const edge = x === b.x0 || x === b.x1 || y === b.y0 || y === b.y1;
        if (edge) {
          walls[i] = b.wall;
          wallUp[i] = up;
          wallIn[i] = inner;
          wallH[i] = bh;
          floorTex[i] = 0;
          ceilTex[i] = 0;
        } else {
          floorTex[i] = b.floor;
          ceilTex[i] = C_BEAMS;
          // The ceiling hangs at the building's own height — a marquee's
          // canvas roof is low, and sampling it at a full storey would
          // float a phantom ceiling over the walls from outside.
          ceilH[i] = Math.min(1, bh);
        }
      }
    }
    // Door on a north or south wall. The cell stays open — a swinging leaf
    // prop hinged at a jamb supplies the door itself (doors.ts via makeDoor).
    const di = (b.door.side === "N" ? b.y0 : b.y1) * w + b.door.at;
    openCell(di, b, up, inner, bh, doorways);
    // Canvas buildings have no leaf — the marquee's flap stands tied open.
    if (b.wall !== W_CANVAS) {
      doors.push(makeDoor(di, b.door.at, b.door.side === "N" ? b.y0 : b.y1, b.door.side === "N" ? 1 : -1));
    }
    // Windows on any side — an open slit in the wall.
    for (const win of b.win ?? []) {
      const wi =
        win.side === "N"
          ? b.y0 * w + win.at
          : win.side === "S"
            ? b.y1 * w + win.at
            : win.side === "W"
              ? win.at * w + b.x0
              : win.at * w + b.x1;
      openCell(wi, b, up, inner, bh, windows);
    }
  }

  // An opening keeps its facade data (height, upper band, base wall id) so the
  // renderer can draw the lintel and sill across it.
  function openCell(i: number, b: BuildingDef, up: number, inner: number, bh: number, set: Set<number>): void {
    walls[i] = 0;
    wallUp[i] = up;
    wallIn[i] = inner;
    wallH[i] = bh;
    openSkin[i] = b.wall;
    floorTex[i] = b.floor;
    ceilTex[i] = C_BEAMS;
    ceilH[i] = Math.min(1, bh);
    set.add(i);
  }

  // Loft rooms in the strip: plaster walls, wood floor, beam ceiling.
  for (const l of LOFTS) {
    for (let y = l.y0; y <= l.y1; y++) {
      for (let x = l.x0; x <= l.x1; x++) {
        const i = y * w + x;
        const edge = x === l.x0 || x === l.x1 || y === l.y0 || y === l.y1;
        if (edge) {
          walls[i] = W_TIMBER;
          wallIn[i] = INNER_WALL;
          wallH[i] = 1;
          floorTex[i] = 0;
          ceilTex[i] = 0;
        } else {
          walls[i] = 0;
          floorTex[i] = F_WOOD;
          ceilTex[i] = C_BEAMS;
        }
      }
    }
  }

  // The sewers — open rects under the rock. Where two rects overlap the
  // tunnels join; walls are the rock cells that border open ground.
  const isOpenCell = (x: number, y: number) =>
    SEWER_OPEN.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  for (let y = SEWER_Y; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (isOpenCell(x, y)) {
        walls[i] = 0;
        floorTex[i] = y === WATER_ROW_Y && x <= 78 ? F_WATER : F_FLAG;
        ceilTex[i] = C_VAULT;
        wallH[i] = 1;
      } else {
        // Rock that touches a tunnel becomes dressed brick.
        const touchesTunnel =
          isOpenCell(x - 1, y) || isOpenCell(x + 1, y) || isOpenCell(x, y - 1) || isOpenCell(x, y + 1);
        if (touchesTunnel) {
          walls[i] = W_BRICK;
          wallIn[i] = W_BRICK;
          wallH[i] = 1;
        }
      }
    }
  }

  // Wall lanterns in every home — one opposite the door and one on each
  // side wall, so every room is ringed with candlelight.
  const sconces: SpriteDef[] = [];
  for (const b of BUILDINGS) {
    const cx = (b.x0 + b.x1) / 2 + 0.5;
    const cy = (b.y0 + b.y1) / 2 + 0.5;
    sconces.push(
      { kind: "sconce", x: cx, y: b.door.side === "N" ? b.y1 - 0.35 : b.y0 + 1.35 },
      { kind: "sconce", x: b.x0 + 1.35, y: cy },
      { kind: "sconce", x: b.x1 - 0.35, y: cy }
    );
  }
  // Hanging shop signs beside the door — hung over the wall face a full cell
  // along, never inside the doorway itself.
  const signs: SpriteDef[] = [];
  for (const b of BUILDINGS) {
    if (!b.sign) continue;
    const sx = b.door.at + 1.6 <= b.x1 - 0.4 ? b.door.at + 1.6 : b.door.at - 0.6;
    signs.push({
      kind: `sign_${b.sign}`,
      x: sx,
      y: b.door.side === "S" ? b.y1 + 1.05 : b.y0 - 0.05,
    });
  }
  // Lumps of stone and timber become solid props — quads in world space,
  // not cells. The rest stay billboards. Scatter loot is stripped — shops
  // carry supplies now.
  const props: PropDef[] = [];
  const lights: LightDef[] = [];
  // Canvas roofs — a marquee needs a pitched cap: a flat lid at wall
  // height is geometrically invisible from the ground (you only ever see
  // its underside), so the roof steps up in gable tiers to a ridge pole
  // along the long axis, while a flat face at wall height seals the gap
  // between wall top and ceiling when you're inside.
  for (let bi = 0; bi < BUILDINGS.length; bi++) {
    const b = BUILDINGS[bi];
    if (b.wall !== W_CANVAS) continue;
    const bh = buildingHeight(b.wall, bi);
    const rcx = (b.x0 + b.x1 + 1) / 2;
    const rcy = (b.y0 + b.y1 + 1) / 2;
    const alongX = b.x1 - b.x0 >= b.y1 - b.y0; // the ridge runs the long way
    const bwd = b.x1 - b.x0 + 1.02;
    const bdp = b.y1 - b.y0 + 1.02;
    const faces: PropFace[] = [
      // The ceiling lid — only ever seen from below, dim like a tent roof.
      { ...topFace(rcx, rcy, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, bh, W_CANVAS), shade: 0.72 },
    ];
    // Four tiers climbing toward the ridge, shrinking on the cross axis
    // only so the end profile reads as a pitch rather than a ziggurat.
    for (let i = 0; i < 4; i++) {
      const tw = alongX ? bwd : bwd - i * 0.9;
      const td = alongX ? bdp - i * 0.9 : bdp;
      faces.push(...boxFaces(rcx, rcy, Math.max(0.2, tw), Math.max(0.2, td), 0.075, W_CANVAS, 0, bh + i * 0.075));
    }
    // The ridge pole runs the peak, poking past the gable ends.
    const rw = alongX ? bwd * 0.55 : 0.07;
    const rd = alongX ? 0.07 : bdp * 0.55;
    faces.push(...boxFaces(rcx, rcy, rw, rd, 0.05, W_WOOD, 0, bh + 0.3));
    props.push({ x: rcx, y: rcy, block: 0, faces });
  }
  // A wall lantern hangs just off the nearest wall face; where no wall
  // stands within reach the flame becomes a lantern post instead.
  const sconceMount = (x: number, y: number): { x: number; y: number } | null => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (walls[ny * w + nx] !== 0) {
        return { x: cx + dx + 0.5 - dx * 0.68, y: cy + dy + 0.5 - dy * 0.68 };
      }
    }
    return null;
  };
  const keptSprites = SPRITES.filter((s) => {
    if (s.kind === "torch" || s.kind === "brazier") {
      const m = sconceMount(s.x, s.y);
      if (m) {
        sconces.push({ kind: "sconce", x: m.x, y: m.y });
      } else {
        props.push(PROP_BUILDERS.lamp(s.x, s.y));
        lights.push({ x: s.x, y: s.y, radius: 5.5, intensity: 0.9, warm: 1, phase: lights.length * 1.618 });
      }
      return false;
    }
    const build = PROP_BUILDERS[s.kind];
    if (build) {
      const prop = build(s.x, s.y, s.rot);
      // Interaction metadata survives the sprite→prop conversion — a
      // searchable chest is geometry you can open, not a picture of one.
      prop.search = s.search;
      prop.examine = s.examine;
      prop.clue = s.clue;
      prop.stairLink = s.stairLink;
      // The desk writes the journal; the doctor's bed is the day's end;
      // the slab is where the dead are opened.
      if (s.kind === "desk" || s.kind === "homebed" || s.kind === "slab") prop.use = s.kind;
      props.push(prop);
      return false;
    }
    return true;
  });
  const allSprites = [...keptSprites, ...sconces, ...signs];
  // Door leaves join the props — every doorway has one, all start shut.
  for (const d of doors) props.push(d.prop);

  // Named places for the city map — buildings carry a `name`, plus the well,
  // the graveyard, the gate and the pesthouse.
  const landmarks = [
    ...BUILDINGS.filter((b) => b.name).map((b) => ({
      name: b.name!,
      x: (b.x0 + b.x1) / 2 + 0.5,
      y: (b.y0 + b.y1) / 2 + 0.5,
    })),
    { name: "the well", x: 31.5, y: 21.8 },
    { name: "graveyard", x: 49.5, y: 39.5 },
    { name: "the gate", x: 61, y: 21.5 },
    { name: "the old town", x: 75, y: 33.5 },
  ];

  // Lights follow flame sprites automatically — no double bookkeeping.
  // (Lamp posts pushed theirs during the sprite conversion above.)
  for (const s of allSprites) {
    if (s.kind === "sconce") {
      lights.push({ x: s.x, y: s.y, radius: 4.2, intensity: 0.75, warm: 1, phase: lights.length * 1.618 });
    } else if (s.kind === "alembic") {
      lights.push({ x: s.x, y: s.y, radius: 3.4, intensity: 0.6, warm: 0.45, phase: lights.length * 1.618 });
    }
  }

  return {
    w,
    h,
    walls,
    wallUp,
    wallIn,
    wallH,
    openSkin,
    floorTex,
    ceilTex,
    ceilH,
    doorways,
    windows,
    doors,
    sprites: allSprites,
    props,
    lights,
    landmarks,
    // Spawned on the main street by the gate — the cordon dead ahead.
    spawnX: 55.5,
    spawnY: 21.5,
    spawnAngle: 0,
  };
}

// The provost opens the way: the hurdles are dragged aside and the gap
// stands open — a bare gap in the stakes, the guard beside it.
export function openGate(map: GameMap): void {
  for (const [gx, gy] of GATE_POS) {
    const i = gy * map.w + gx;
    map.walls[i] = 0;
    map.openSkin[i] = W_PALISADE;
    map.floorTex[i] = F_COBBLE;
    map.ceilTex[i] = C_SKY;
  }
}

// Open street cells — villager waypoints. The cordon keeps them out of the
// quarantine quarter: citizens wander the free side only.
export function streetCells(map: GameMap): number[] {
  const out: number[] = [];
  for (let i = 0; i < map.w * map.h; i++) {
    if (map.floorTex[i] === F_COBBLE && map.ceilTex[i] === C_SKY && i % map.w < CORDON_X) out.push(i);
  }
  return out;
}

export interface Spot {
  x: number;
  y: number;
}

// Doorway stoops on the free side — where villagers live and where their
// days are spent. Homes are every house's front step; haunts are the well,
// the plaza and the named establishments; the tavern is the inn's door.
export function villagerSpots(): { homes: Spot[]; haunts: Spot[]; tavern: Spot } {
  const stoop = (b: (typeof BUILDINGS)[number]): Spot => ({
    x: b.door.at + 0.5,
    y: b.door.side === "N" ? b.y0 - 0.5 : b.y1 + 1.5,
  });
  const homes: Spot[] = [];
  const haunts: Spot[] = [
    { x: 30.6, y: 21.9 }, // drawing water at the well
    { x: 32.6, y: 22.6 }, // crossing the plaza
    // The market — browsing the stall fronts is half the city's day.
    { x: 30.3, y: 21.1 },  // haggling at the herb stall
    { x: 30.7, y: 22.8 },  // fingering cloth
    { x: 32.4, y: 23.0 },  // the rags stall
    { x: 33.25, y: 22.7 }, // the costermonger's boards
  ];
  let tavern: Spot = { x: 20.5, y: 9.5 }; // the inn's door, if the list moves
  for (const b of BUILDINGS) {
    if (b.x0 > CORDON_X) continue; // the quarter is sealed — nobody lives there now
    homes.push(stoop(b));
    if (b.name) {
      const s = stoop(b);
      haunts.push(s);
      if (b.name === "the inn") tavern = s;
    }
  }
  return { homes, haunts, tavern };
}

export function isWall(map: GameMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return true;
  return map.walls[Math.floor(y) * map.w + Math.floor(x)] !== 0;
}

// Circle collision against walls only (used by player, villagers, shamblers).
// An open window has a waist-high sill: it blocks people, but shamblers
// clamber through unless it's been boarded up.
export function isBlocked(map: GameMap, x: number, y: number, r: number, throughWindows = false): boolean {
  const x0 = Math.floor(x - r);
  const x1 = Math.floor(x + r);
  const y0 = Math.floor(y - r);
  const y1 = Math.floor(y + r);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const idx = cy * map.w + cx;
      const solid = map.walls[idx] !== 0 || (!throughWindows && map.windows.has(idx));
      if (!solid) continue;
      if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return true;
      const nx = Math.max(cx, Math.min(x, cx + 1));
      const ny = Math.max(cy, Math.min(y, cy + 1));
      const ddx = x - nx;
      const ddy = y - ny;
      if (ddx * ddx + ddy * ddy < r * r) return true;
    }
  }
  // Props collide as circles — wells and carts are solid from every side —
  // except the ones carrying a segment: a door leaf is its own collision.
  for (const p of map.props) {
    if (p.seg) {
      if (segDist(x, y, p.seg[0], p.seg[1], p.seg[2], p.seg[3]) < p.block + r) return true;
      continue;
    }
    const rr = p.block + r;
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx * dx + dy * dy < rr * rr) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The intro's journey — standalone little scenes that only the opening shots
// film, never walked by the player. Each is a small corridor or open field
// built from the same vocabulary as the city: dirt tracks, leaf-mass walls
// as treeline and hedges, stone and timber facades, prop scatter.

// An empty open-air scene — grass, sky, no walls. Scenes fill from here.
function introShell(w: number, h: number, floor = F_GRASS): GameMap {
  return {
    w,
    h,
    walls: new Uint8Array(w * h),
    wallUp: new Uint8Array(w * h),
    wallIn: new Uint8Array(w * h),
    wallH: new Float32Array(w * h).fill(1),
    openSkin: new Uint8Array(w * h),
    floorTex: new Uint8Array(w * h).fill(floor),
    ceilTex: new Uint8Array(w * h).fill(C_SKY),
    ceilH: new Float32Array(w * h).fill(1),
    doorways: new Set(),
    windows: new Set(),
    doors: [],
    sprites: [],
    props: [],
    lights: [],
    landmarks: [],
    spawnX: 1.6,
    spawnY: 8.5,
    spawnAngle: 0,
  };
}

// A solid wall run along a row — the scene builders' one shared tool.
function wallRun(m: GameMap, y: number, x0: number, x1: number, tex: number, hh = 1): void {
  for (let x = x0; x <= x1; x++) {
    const i = y * m.w + x;
    m.walls[i] = tex;
    m.wallH[i] = hh;
  }
}
function wallCol(m: GameMap, x: number, y0: number, y1: number, tex: number, hh = 1): void {
  for (let y = y0; y <= y1; y++) {
    const i = y * m.w + x;
    m.walls[i] = tex;
    m.wallH[i] = hh;
  }
}
function floorRect(m: GameMap, x0: number, y0: number, x1: number, y1: number, f: number): void {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) m.floorTex[y * m.w + x] = f;
}

// The forest road — a dirt track east under a ragged leaf-mass treeline,
// ending at the city's wall and its one lit gate lamp.
function woodsMap(): GameMap {
  const m = introShell(36, 18);
  // The wood itself — solid foliage walls either side, the inner edge
  // ragged per column so it reads as grown trees rather than a hedge.
  for (let x = 0; x < m.w; x++) {
    const j = (x * 7 + 3) % 3;
    for (let y = 0; y < 4 + j; y++) {
      m.walls[y * m.w + x] = W_FOLIAGE;
      m.wallH[y * m.w + x] = 1.6;
    }
    for (let y = m.h - 1; y > 13 - j; y--) {
      m.walls[y * m.w + x] = W_FOLIAGE;
      m.wallH[y * m.w + x] = 1.6;
    }
  }
  wallCol(m, 0, 0, m.h - 1, W_FOLIAGE, 1.6);
  wallCol(m, 35, 0, m.h - 1, W_STONE, 1.5);
  // The road — a dirt track east, cobbles where the faubourg begins.
  for (let x = 0; x < 35; x++) {
    const f = x > 30 ? F_COBBLE : F_DIRT;
    m.floorTex[8 * m.w + x] = f;
    m.floorTex[9 * m.w + x] = f;
  }
  // The gate — a stone face across the road's end, open at the gap.
  wallCol(m, 34, 0, m.h - 1, W_STONE, 1.6);
  m.walls[8 * m.w + 34] = 0;
  m.walls[9 * m.w + 34] = 0;

  // Trees crowding both verges — some dead, the odd one pushed deeper into
  // the leaf wall for silhouette depth. Deterministic scatter.
  for (let i = 0; i < 13; i++) {
    const x = 2 + i * 2.4;
    m.props.push(PROP_BUILDERS[i % 4 === 1 ? "deadTree" : "tree"](x + (i % 3) * 0.25, 6.0 + (i % 2) * 1.1));
    m.props.push(PROP_BUILDERS[i % 5 === 3 ? "deadTree" : "tree"](x + ((i + 2) % 3) * 0.3, 12.1 - (i % 2) * 1.2));
    if (i % 4 === 2) m.props.push(PROP_BUILDERS.tree(x + 1.1, i % 8 === 2 ? 5.0 : 13.3));
  }
  // A wayside grave and an abandoned cart — someone else took this road.
  m.props.push(PROP_BUILDERS.grave(12.4, 10.3));
  m.props.push(PROP_BUILDERS.grave(12.9, 10.6));
  m.props.push(PROP_BUILDERS.cart(26.5, 9.7));
  m.props.push(PROP_BUILDERS.tuft(7.4, 9.8));
  m.props.push(PROP_BUILDERS.tuft(18.8, 7.2));
  m.props.push(PROP_BUILDERS.tuft(29.5, 10.4));
  // The gate's lamp — the only lit thing in the wood.
  m.props.push(PROP_BUILDERS.lamp(33.6, 7.4));
  m.lights.push({ x: 33.6, y: 7.4, radius: 5.5, intensity: 0.9, warm: 1, phase: 1.4 });
  return m;
}

// A village street — squat timber and brick facades crowding a dirt lane,
// two lamps lit against the night. Filmed only in the dark.
function townMap(): GameMap {
  const m = introShell(34, 14, F_DIRT);
  // Facades either side of the street — heights vary, a few doors cut in.
  for (let x = 1; x < 33; x++) {
    const tex = x % 5 === 0 ? W_BRICK : x % 3 === 0 ? W_STONE : W_TIMBER;
    const hh = 1.3 + ((x * 11) % 4) * 0.22;
    wallRun(m, 6, x, x, x % 7 === 0 ? 4 : tex, hh);           // north row, the odd door
    wallRun(m, 9, x, x, x % 6 === 0 ? 4 : tex, hh * 0.94);     // south row
    // The odd lit window — lamp glass let into the facade.
    if ((x * 7 + 2) % 13 === 0) m.walls[6 * m.w + x] = W_LAMP;
    if ((x * 5 + 1) % 11 === 0) m.walls[9 * m.w + x] = W_LAMP;
  }
  wallCol(m, 0, 0, m.h - 1, W_TIMBER, 1.5);
  wallCol(m, 33, 0, m.h - 1, W_BRICK, 1.7);
  // Street furniture — a cart, barrels at a door, a wayside cross of sorts.
  m.props.push(PROP_BUILDERS.cart(20.5, 8.9));
  m.props.push(PROP_BUILDERS.barrel(9.5, 6.8));
  m.props.push(PROP_BUILDERS.barrel(10.3, 6.8));
  m.props.push(PROP_BUILDERS.crate(15.5, 9.4));
  m.props.push(PROP_BUILDERS.lamp(8.4, 7.4));
  m.props.push(PROP_BUILDERS.lamp(25.6, 8.6));
  m.lights.push(
    { x: 8.4, y: 7.4, radius: 5.5, intensity: 0.9, warm: 1, phase: 0.7 },
    { x: 25.6, y: 8.6, radius: 5.5, intensity: 0.9, warm: 1, phase: 2.3 }
  );
  return m;
}

// Farmland — open fields either side of a bending dirt road. Ploughed
// furrows north, pasture south, hedgerows at the field edges, a farmhouse
// and hayricks. The horizon just runs out into sky.
function farmlandMap(): GameMap {
  const m = introShell(40, 20);
  // The road — a dirt track that bends south near the far end.
  for (let x = 0; x < m.w; x++) {
    const ry = x > 24 ? 10 : 9;
    m.floorTex[ry * m.w + x] = F_DIRT;
    m.floorTex[(ry + 1) * m.w + x] = F_DIRT;
  }
  // North field — ploughed furrows striped into the grass, hedged.
  floorRect(m, 3, 2, 15, 7, F_DIRT);
  for (let y = 3; y < 7; y += 2) floorRect(m, 3, y, 15, y, F_GRASS); // crop rows left standing
  wallRun(m, 1, 2, 16, W_FOLIAGE, 0.5);
  wallRun(m, 8, 2, 2, W_FOLIAGE, 0.5);
  wallRun(m, 8, 10, 16, W_FOLIAGE, 0.5); // a gap in the hedge at x 3-9 — the gate
  wallCol(m, 2, 1, 8, W_FOLIAGE, 0.5);
  wallCol(m, 16, 1, 8, W_FOLIAGE, 0.5);
  // North-east meadow — pasture with a shallow pond.
  wallRun(m, 1, 19, 34, W_FOLIAGE, 0.5);
  wallCol(m, 34, 1, 7, W_FOLIAGE, 0.5);
  floorRect(m, 26, 3, 29, 5, F_WATER);
  m.props.push(PROP_BUILDERS.tuft(22.5, 4.4));
  m.props.push(PROP_BUILDERS.tuft(31.6, 5.8));
  m.props.push(PROP_BUILDERS.tree(20.4, 3.6));
  m.props.push(PROP_BUILDERS.tree(33.0, 6.9));
  // The farmhouse — a timber box above the road, its barn beside.
  for (let x = 18; x <= 21; x++) {
    for (let y = 4; y <= 6; y++) m.walls[y * m.w + x] = W_TIMBER;
  }
  m.walls[6 * m.w + 19] = 4; // the farmhouse door
  for (let x = 22; x <= 24; x++) {
    for (let y = 4; y <= 5; y++) m.walls[y * m.w + x] = W_WOOD;
  }
  m.wallH[4 * m.w + 21] = 1.15;
  // South pasture — hayricks and sheep-worn grass to the horizon.
  for (const [hx, hy] of [[6, 13], [10, 15], [14, 13.6]]) {
    m.props.push({
      x: hx, y: hy, block: 0.3,
      faces: prismFaces(hx, hy, 0.34, 8, 0.42, W_CANVAS),
    });
  }
  m.props.push(PROP_BUILDERS.tuft(8.3, 16.2));
  m.props.push(PROP_BUILDERS.tuft(17.7, 14.1));
  m.props.push(PROP_BUILDERS.deadTree(30.5, 14.6));
  // Hedgerow along the road's south edge, broken for field gates.
  wallRun(m, 12, 2, 9, W_FOLIAGE, 0.45);
  wallRun(m, 12, 12, 22, W_FOLIAGE, 0.45);
  wallRun(m, 12, 27, 33, W_FOLIAGE, 0.45);
  return m;
}

// The high pass — tall stone walls closing a winding track over the ridge.
// Filmed both in daylight and at night.
function mountainMap(): GameMap {
  const m = introShell(40, 20, F_DIRT);
  // The pass walls — bare granite, the kink mid-run making the road read as
  // a switchback. Scattered cells rise higher and wear the snow texture, so
  // the skyline crests white like a ridgeline of peaks.
  for (let x = 0; x < m.w; x++) {
    const top = x < 19 ? 6 : 8;
    const bot = x < 19 ? 13 : 15;
    for (let y = 0; y <= top; y++) {
      const peak = (x * 13 + y * 5) % 11 === 0;
      m.walls[y * m.w + x] = peak ? W_PEAK : W_ROCK;
      m.wallH[y * m.w + x] = peak ? 4.4 + ((x * 3 + y) % 3) * 0.5 : 2.3 + ((x * 7 + y * 3) % 3) * 0.3;
    }
    for (let y = bot; y < m.h; y++) {
      const peak = (x * 11 + y * 7) % 13 === 0;
      m.walls[y * m.w + x] = peak ? W_PEAK : W_ROCK;
      m.wallH[y * m.w + x] = peak ? 4.2 + ((x * 5 + y) % 3) * 0.5 : 2.3 + ((x * 5 + y * 11) % 3) * 0.3;
    }
  }
  // Scree and scrub — boulder prisms and the odd dead pine at the margins.
  for (let i = 0; i < 8; i++) {
    const px = 3 + i * 4.4;
    const py = i % 2 ? 12.4 : 7.2;
    m.props.push({
      x: px, y: py, block: 0.22,
      faces: prismFaces(px, py, 0.16 + (i % 3) * 0.05, 6, 0.2 + (i % 3) * 0.08, W_ROCK, i * 0.6),
    });
  }
  m.props.push(PROP_BUILDERS.deadTree(9.5, 7.6));
  m.props.push(PROP_BUILDERS.deadTree(28.5, 13.8));
  // A cairn at the crest — travellers' stones.
  m.props.push(PROP_BUILDERS.grave(19.6, 8.2));
  m.props.push(PROP_BUILDERS.grave(20.2, 8.6));
  return m;
}

// A city's canyon — taller, tighter than the village: flagstone street,
// mixed facades three storeys up, more lit windows. Daylight only.
function cityMap(): GameMap {
  const m = introShell(34, 14, F_FLAG);
  for (let x = 1; x < 33; x++) {
    const tex = x % 6 === 0 ? W_STONE : x % 4 === 0 ? W_BRICK : W_TIMBER;
    const hh = 1.9 + ((x * 9) % 4) * 0.28;
    wallRun(m, 5, x, x, x % 8 === 0 ? 4 : tex, hh);
    wallRun(m, 10, x, x, x % 7 === 0 ? 4 : tex, hh * 0.9);
    if ((x * 7 + 3) % 9 === 0) m.walls[5 * m.w + x] = W_LAMP;
    if ((x * 5 + 4) % 10 === 0) m.walls[10 * m.w + x] = W_LAMP;
  }
  wallCol(m, 0, 0, m.h - 1, W_BRICK, 2.0);
  wallCol(m, 33, 0, m.h - 1, W_STONE, 2.2);
  m.props.push(PROP_BUILDERS.cart(12.4, 9.3));
  m.props.push(PROP_BUILDERS.barrel(22.5, 6.6));
  m.props.push(PROP_BUILDERS.sack(23.2, 6.6));
  m.props.push(PROP_BUILDERS.lamp(17.5, 7.2));
  m.lights.push({ x: 17.5, y: 7.2, radius: 5, intensity: 0.85, warm: 1, phase: 3.1 });
  return m;
}

// The last countryside — a bare lane between hedgerows, fields running out
// to open sky, a lone farmhouse far off. Emptier the closer you get.
function countrysideMap(): GameMap {
  const m = introShell(40, 18);
  for (let x = 0; x < m.w; x++) {
    m.floorTex[8 * m.w + x] = F_DIRT;
    m.floorTex[9 * m.w + x] = F_DIRT;
  }
  // Hedgerows flanking the lane, broken by field gates.
  wallRun(m, 6, 1, 8, W_FOLIAGE, 0.55);
  wallRun(m, 6, 11, 22, W_FOLIAGE, 0.55);
  wallRun(m, 6, 26, 36, W_FOLIAGE, 0.55);
  wallRun(m, 11, 3, 14, W_FOLIAGE, 0.55);
  wallRun(m, 11, 18, 30, W_FOLIAGE, 0.55);
  wallRun(m, 11, 34, 38, W_FOLIAGE, 0.55);
  // A pond south, in the meadow.
  floorRect(m, 20, 13, 25, 15, F_WATER);
  m.props.push(PROP_BUILDERS.tuft(19.2, 12.6));
  m.props.push(PROP_BUILDERS.tuft(26.8, 15.6));
  // Scattered trees, thinner as the road runs on.
  m.props.push(PROP_BUILDERS.tree(5.5, 4.4));
  m.props.push(PROP_BUILDERS.tree(13.8, 13.4));
  m.props.push(PROP_BUILDERS.deadTree(24.4, 4.8));
  m.props.push(PROP_BUILDERS.tree(33.5, 13.0));
  // The last farmhouse — a dark box far north of the road.
  for (let x = 30; x <= 32; x++) {
    for (let y = 2; y <= 3; y++) m.walls[y * m.w + x] = W_TIMBER;
  }
  // An emptied cart left at the roadside — heading out, not in.
  m.props.push(PROP_BUILDERS.cart(27.4, 9.6));
  m.props.push(PROP_BUILDERS.grave(27.9, 10.4));
  return m;
}

// The scenes the intro's shots film, keyed by Shot.scene.
export function buildIntroMaps(): Record<string, GameMap> {
  return {
    woods: woodsMap(),
    town: townMap(),
    farmland: farmlandMap(),
    mountain: mountainMap(),
    city: cityMap(),
    countryside: countrysideMap(),
  };
}
