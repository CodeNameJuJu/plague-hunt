// Shared types for the engine.

// An RGB texture (walls, floor, ceiling). data is w*h*3 bytes.
export interface Texture {
  w: number;
  h: number;
  data: Uint8Array;
}

// An RGBA bitmap (sprites). Alpha < 128 is treated as transparent.
export interface SpriteTex {
  w: number;
  h: number;
  data: Uint8Array;
}

// A point light in the world. warm is 0 (cold, e.g. moonlight) to 1 (fire).
export interface LightDef {
  x: number;
  y: number;
  radius: number;
  intensity: number;
  warm: number;
  phase: number; // flicker phase offset so no two flames dance together
}

// Every carryable item — the registry lives in items.ts. This is a
// narrative game now: provisions, supplies and quest objects, no weapons.
export type ItemId =
  | "bread"
  | "skin"
  | "planks"
  | "cloth"
  | "bandage"
  | "rue"
  | "leeches"
  | "specimen"
  | "cure";

// What a pickup sprite gives when taken.
export type PickupKind = ItemId;

// A sprite placed on the map. kind resolves to bitmaps in sprites.ts.
export interface SpriteDef {
  kind: string;
  x: number;
  y: number;
  pickup?: PickupKind;
  letter?: number; // index into the found-document texts in quests.ts
  stairLink?: { x: number; y: number }; // where these stairs lead
  examine?: string; // prompt label for an evidence point ("examine the well")
  clue?: string; // evidence id granted on examine — see clues.ts
  search?: string; // loot table id — searchable container, restocks at dawn
  rot?: number; // facing for props built from this def (e.g. stair direction)
}

// A vertical quad in world space — the unit solid props are built from
// (prisms, slabs, crossed planes). Rendered by castProps in renderer.ts.
export interface PropFace {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  base: number; // bottom height in storeys
  top: number; // top height in storeys
  tex: number; // wall texture id
  shade: number; // baked directional light, 0..1
  az?: number; // outward bearing — set so the live sun can light this face
  dark?: boolean; // interior face — the well's throat stays in shadow
  flat?: boolean; // a horizontal lid — x0..x1/y0..y1 is a rect, top is its height
  rot?: number; // local rotation for flat rects, about their centre
}

// A free-standing piece of world geometry, unbound by the grid.
export interface PropDef {
  x: number;
  y: number;
  block: number; // collision radius/thickness, 0 = walk through
  seg?: number[]; // [x0,y0,x1,y1] — collide against a segment (door leaves)
  faces: PropFace[];
  // Searchable props carry their interaction metadata onto the geometry.
  search?: string; // loot table id — see clues.ts
  examine?: string; // prompt label ("the family's chest")
  clue?: string; // evidence id granted on examine
  looted?: boolean; // searched today — restocks at dawn
  stairLink?: { x: number; y: number }; // flights of stairs teleport here
  use?: string; // furniture verbs — "desk" opens the journal, "homebed" sleeps
}

// A swinging door leaf. The leaf is a prop quad hinged at one jamb; t runs
// 0 (shut across the doorway) to 1 (open into the room). The prop's seg
// tracks the leaf line so collision is the door itself.
export interface DoorDef {
  idx: number; // doorway cell index
  hx: number;
  hy: number; // hinge point
  dir: number; // +1 leaf runs +x when shut (west hinge), -1 runs -x
  len: number; // leaf length
  swing: number; // +1 opens toward +y, -1 toward -y (into the building)
  t: number; // 0 shut → 1 open
  open: boolean;
  prop: PropDef;
}

export interface GameMap {
  w: number;
  h: number;
  walls: Uint8Array; // wall texture id per cell, 0 = open
  wallUp: Uint8Array; // upper-storey facade texture id, 0 = no upper band
  wallIn: Uint8Array; // inner-face texture id, 0 = same as outer
  wallH: Float32Array; // wall height in storeys (1 = one floor)
  openSkin: Uint8Array; // on doorway/window cells: the wall id they were cut from
  floorTex: Uint8Array; // floor texture id per cell
  ceilTex: Uint8Array; // ceiling texture id per cell
  ceilH: Float32Array; // ceiling height in storeys on interior cells (default 1 — a marquee's canvas roof hangs lower)
  doorways: Set<number>; // cell indices that can be barricaded
  windows: Set<number>; // open window cells — barricadable too
  doors: DoorDef[]; // swinging leaves, one per doorway cell
  sprites: SpriteDef[];
  props: PropDef[]; // solid off-grid geometry — wells, carts, headstones
  lights: LightDef[];
  landmarks: { name: string; x: number; y: number }[]; // named places for the city map
  spawnX: number;
  spawnY: number;
  spawnAngle: number;
}

// Texture lookup tables, indexed by the ids assigned in map.ts.
export interface TextureSet {
  walls: Texture[]; // 1 stone, 2 darkBrick, 3 wood, 4 door, 5 timber, 6 barricade, 7+ facades, 19 door leaf, 20+ quarantine, 23 palisade, 24 canvas, 25 tent mouth
  wallsLit: Uint8Array; // facade id -> lit-window variant id, 0 = none
  floors: Texture[]; // 1 flagstone, 2 carpet, 3 dirt, 4 cobble, 5 wood, 6 sewer, 7 grass
  ceils: Texture[]; // 1 beams, 2 nightSky, 3 daySky
}

// Runtime sprite: a placed sprite plus its resolved frames.
export interface SpriteRuntime {
  kind: string;
  x: number;
  y: number;
  frames: SpriteTex[];
  scale: number; // world height multiplier (1 = one tile tall)
  block: number; // collision radius, 0 = walk through
  animFps: number;
  pickup?: PickupKind;
  letter?: number;
  taken?: boolean;
  stairLink?: { x: number; y: number };
  examine?: string;
  clue?: string;
  search?: string;
}
