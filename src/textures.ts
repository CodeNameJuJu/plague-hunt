import { TEX_SIZE } from "./config";
import type { Texture, TextureSet } from "./types";

// All textures are generated procedurally at boot — there are no image assets.
// Each texture is a TEX_SIZE x TEX_SIZE RGB bitmap.

function makeTex(): Texture {
  return { w: TEX_SIZE, h: TEX_SIZE, data: new Uint8Array(TEX_SIZE * TEX_SIZE * 3) };
}

// Deterministic RNG (mulberry32) so the world looks the same every run.
function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setPx(tex: Texture, x: number, y: number, r: number, g: number, b: number): void {
  const i = (y * tex.w + x) * 3;
  tex.data[i] = r;
  tex.data[i + 1] = g;
  tex.data[i + 2] = b;
}

function addNoise(tex: Texture, rand: () => number, amount: number): void {
  for (let i = 0; i < tex.data.length; i += 3) {
    const n = (rand() * 2 - 1) * amount;
    tex.data[i] = clamp(tex.data[i] + n);
    tex.data[i + 1] = clamp(tex.data[i + 1] + n);
    tex.data[i + 2] = clamp(tex.data[i + 2] + n);
  }
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function rect3(tex: Texture, x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x >= 0 && y >= 0 && x < tex.w && y < tex.h) setPx(tex, x, y, r, g, b);
    }
  }
}

function drawThickLine3(tex: Texture, x0: number, y0: number, x1: number, y1: number, width: number, r: number, g: number, b: number): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.round(x0 + (x1 - x0) * t);
    const cy = Math.round(y0 + (y1 - y0) * t);
    const half = Math.floor(width / 2);
    rect3(tex, cx - half, cy - half, cx + half, cy + half, r, g, b);
  }
}

// --- walls -----------------------------------------------------------------

// Grey stone blocks with dark mortar. The keep's default wall.
function stoneWall(): Texture {
  const tex = makeTex();
  const rand = rng(11);
  const bh = 16;
  const bw = 32;
  for (let y = 0; y < TEX_SIZE; y++) {
    const row = Math.floor(y / bh);
    const offset = (row % 2) * (bw / 2);
    for (let x = 0; x < TEX_SIZE; x++) {
      const mortarY = y % bh < 2;
      const mortarX = (x + offset) % bw < 2;
      if (mortarY || mortarX) {
        setPx(tex, x, y, 38, 36, 34);
      } else {
        const blockSeed = row * 31 + Math.floor((x + offset) / bw) * 7;
        let shade = 88 + ((blockSeed * 2654435761) % 17);
        // Bevel — light catches the top edge, the bottom edge falls to shade.
        if (y % bh === 2) shade += 14;
        else if (y % bh === bh - 1) shade -= 12;
        else if ((x + offset) % bw === 2) shade += 8;
        // Some blocks run warm, some cold — stops the wall reading as one tint.
        const warm = ((blockSeed * 911) % 7) - 3;
        setPx(tex, x, y, shade + warm, shade - 4 + warm * 0.4, shade - 8 - warm * 0.6);
      }
    }
  }
  // Hairline cracks snaking down between the courses.
  for (let i = 0; i < 3; i++) {
    let cx = Math.floor(rand() * TEX_SIZE);
    const cy = Math.floor(rand() * 20);
    const len = 12 + Math.floor(rand() * 28);
    for (let y = 0; y < len; y++) {
      const i3 = (((cy + y) % TEX_SIZE) * TEX_SIZE + (cx % TEX_SIZE)) * 3;
      tex.data[i3] *= 0.55;
      tex.data[i3 + 1] *= 0.55;
      tex.data[i3 + 2] *= 0.55;
      if (rand() < 0.4) cx += rand() < 0.5 ? 1 : -1;
    }
  }
  // Moss and grime creep up from the street.
  for (let y = 54; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const i3 = (y * TEX_SIZE + x) * 3;
      const f = 0.95 - (y - 54) * 0.012;
      tex.data[i3] *= f;
      tex.data[i3 + 1] *= f * 1.03;
      tex.data[i3 + 2] *= f * 0.9;
    }
  }
  addNoise(tex, rand, 14);
  // Damp stains running down the stones.
  for (let i = 0; i < 5; i++) {
    const sx = Math.floor(rand() * TEX_SIZE);
    const len = 8 + Math.floor(rand() * 30);
    for (let y = 0; y < len; y++) {
      const yy = (sx * 3 + y) % TEX_SIZE;
      const i3 = (yy * TEX_SIZE + sx) * 3;
      tex.data[i3] *= 0.82;
      tex.data[i3 + 1] *= 0.82;
      tex.data[i3 + 2] *= 0.85;
    }
  }
  return tex;
}

// Small dark bricks for the crypt and chapel-of-darkness.
function darkBrickWall(): Texture {
  const tex = makeTex();
  const rand = rng(23);
  const bh = 8;
  const bw = 16;
  for (let y = 0; y < TEX_SIZE; y++) {
    const row = Math.floor(y / bh);
    const offset = (row % 2) * (bw / 2);
    for (let x = 0; x < TEX_SIZE; x++) {
      if (y % bh < 1 || (x + offset) % bw < 1) {
        setPx(tex, x, y, 22, 21, 20);
      } else {
        const blockSeed = row * 17 + Math.floor((x + offset) / bw) * 5;
        let shade = 52 + ((blockSeed * 40503) % 13);
        if ((blockSeed * 37) % 11 === 0) shade -= 15; // a brick fired too long
        // Bevel — each brick catches a little light along its top edge.
        if (y % bh === 1) shade += 10;
        else if (y % bh === bh - 1) shade -= 9;
        setPx(tex, x, y, shade, shade - 3, shade - 5);
      }
    }
  }
  addNoise(tex, rand, 10);
  return tex;
}

// Vertical wooden planks for panelled rooms.
function woodWall(): Texture {
  const tex = makeTex();
  const rand = rng(37);
  const pw = 16;
  for (let x = 0; x < TEX_SIZE; x++) {
    const plank = Math.floor(x / pw);
    const plankShade = 78 + ((plank * 53) % 18);
    for (let y = 0; y < TEX_SIZE; y++) {
      if (x % pw < 1) {
        setPx(tex, x, y, 34, 24, 16);
      } else {
        const grain = Math.sin(y * 0.55 + plank * 9 + Math.sin(x * 1.7)) * 8;
        setPx(tex, x, y, plankShade + grain, plankShade * 0.66 + grain * 0.6, plankShade * 0.42);
      }
    }
  }
  // Knots — dark ovals buried in the boards.
  for (let i = 0; i < 5; i++) {
    const kx = Math.floor(rand() * TEX_SIZE);
    const ky = Math.floor(rand() * TEX_SIZE);
    if (kx % pw < 3) continue;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) * 0.5 > 2.6) continue;
        const x = kx + dx, y = ky + dy;
        if (x >= 0 && x < TEX_SIZE && y >= 0 && y < TEX_SIZE) {
          const i3 = (y * TEX_SIZE + x) * 3;
          tex.data[i3] = 30 + Math.abs(dy) * 8;
          tex.data[i3 + 1] = 20 + Math.abs(dy) * 5;
          tex.data[i3 + 2] = 13;
        }
      }
    }
  }
  addNoise(tex, rand, 9);
  return tex;
}

// A heavy studded door set in a stone surround.
function doorWall(): Texture {
  const tex = makeTex();
  const rand = rng(51);
  // Stone surround — jambs and a stepped lintel framing the door.
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const jamb = x < 8 || x > 55;
      const lintel = y < 8;
      if (jamb || lintel) {
        const blockSeed = Math.floor(y / 14) * 13 + Math.floor(x / 14) * 7;
        const shade = 74 + ((blockSeed * 40503) % 12);
        setPx(tex, x, y, shade, shade - 4, shade - 8);
      }
    }
  }
  // Mortar lines in the surround.
  for (let x = 0; x < TEX_SIZE; x++) for (const y of [14, 28, 42, 56]) setPx(tex, x, y, 40, 38, 35);
  // The door itself — oak planks filling the opening.
  const pw = 10;
  for (let x = 8; x <= 55; x++) {
    const plank = Math.floor(x / pw);
    const plankShade = 58 + ((plank * 41) % 14);
    for (let y = 8; y < TEX_SIZE; y++) {
      if (x % pw < 1) {
        setPx(tex, x, y, 24, 17, 12);
      } else if ((y >= 16 && y < 21) || (y >= 44 && y < 49)) {
        // Iron strap bands with studs
        const stud = x % 8 === 4 ? 30 : 0;
        setPx(tex, x, y, 38 + stud, 38 + stud, 44 + stud);
      } else {
        const grain = Math.sin(y * 0.4 + plank * 7) * 6;
        setPx(tex, x, y, plankShade + grain, plankShade * 0.68 + grain * 0.6, plankShade * 0.44);
      }
    }
  }
  // Hinge straps on the left, a ring handle on the right.
  for (const hy of [18, 46]) rect3(tex, 8, hy, 20, hy + 2, 30, 30, 36);
  rect3(tex, 46, 32, 50, 40, 34, 34, 40);
  for (let y = 33; y < 40; y++) for (let x = 47; x < 50; x++) setPx(tex, x, y, 90, 92, 100); // ring
  // Worn threshold.
  rect3(tex, 8, 60, 55, 63, 56, 52, 46);
  addNoise(tex, rand, 8);
  return tex;
}

// A swinging door leaf — oak planks, strap hinges and a ring handle, edge to
// edge (no surround; the doorway supplies that). Drawn on a prop quad.
function doorLeaf(): Texture {
  const tex = makeTex();
  const rand = rng(57);
  const pw = 13;
  for (let x = 0; x < TEX_SIZE; x++) {
    const plank = Math.floor(x / pw);
    const plankShade = 62 + ((plank * 41) % 15);
    for (let y = 0; y < TEX_SIZE; y++) {
      if (x % pw < 1) {
        setPx(tex, x, y, 26, 18, 12);
      } else if ((y >= 14 && y < 20) || (y >= 44 && y < 50)) {
        // Iron strap bands with studs
        const stud = x % 9 === 4 ? 34 : 0;
        setPx(tex, x, y, 40 + stud, 40 + stud, 46 + stud);
      } else {
        const grain = Math.sin(y * 0.4 + plank * 7 + Math.sin(x * 0.9)) * 6;
        setPx(tex, x, y, plankShade + grain, plankShade * 0.68 + grain * 0.6, plankShade * 0.44);
      }
    }
  }
  // Hinge leaves on the left edge — the side the leaf hangs from.
  for (const hy of [14, 44]) rect3(tex, 0, hy, 7, hy + 5, 32, 32, 38);
  // A pull ring right of centre.
  rect3(tex, 42, 30, 48, 38, 36, 36, 42);
  for (let y = 31; y < 38; y++) for (let x = 43; x < 47; x++) setPx(tex, x, y, 96, 98, 106);
  // Weathered heel — the bottom edge drinks the street.
  for (let y = 58; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const i3 = (y * TEX_SIZE + x) * 3;
      const f = 0.9 - (y - 58) * 0.03;
      tex.data[i3] *= f;
      tex.data[i3 + 1] *= f;
      tex.data[i3 + 2] *= f;
    }
  }
  addNoise(tex, rand, 7);
  return tex;
}

// The quarantine quarter's walls — a facade thrown up and patched in a
// hurry. Grey filthy plaster, thin crooked studs, a window boarded over,
// and the whitewash X daubed beside the door bay: this house is marked.
function quarantineWall(): Texture {
  const tex = makeTex();
  const rand = rng(97);
  // Plaster gone grey — no warmth left in it.
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const bay = Math.floor(x / 21);
      const tint = ((bay * 37) % 10) - 5;
      setPx(tex, x, y, 88 + tint, 82 + tint * 0.7, 70 + tint * 0.5);
    }
  }
  // Cheap studs — thinner and fewer than the free quarter's honest oak.
  const oak = { r: 46, g: 33, b: 22 };
  for (const sx of [2, 22, 43, 62]) rect3(tex, sx, 0, sx + 2, TEX_SIZE - 1, oak.r, oak.g, oak.b);
  rect3(tex, 0, 15, TEX_SIZE - 1, 18, oak.r, oak.g, oak.b);
  rect3(tex, 0, 47, TEX_SIZE - 1, 50, oak.r, oak.g, oak.b);
  // A window boarded over — planks nailed across at angry angles.
  rect3(tex, 26, 22, 38, 40, 26, 21, 15);
  const board = (x0: number, y0: number, x1: number, y1: number) => {
    const shade = 52 + Math.floor(rand() * 16);
    drawThickLine3(tex, x0, y0, x1, y1, 3, shade, shade * 0.7, shade * 0.45);
  };
  board(24, 24, 40, 34);
  board(24, 37, 40, 26);
  board(25, 21, 29, 41);
  board(37, 21, 34, 41);
  // The mark — a rough whitewash X, painted fast, still dripping.
  drawThickLine3(tex, 8, 24, 18, 38, 2, 170, 164, 148);
  drawThickLine3(tex, 18, 24, 8, 38, 2, 170, 164, 148);
  for (let i = 0; i < 3; i++) {
    const dx = 9 + Math.floor(rand() * 9);
    const len = 3 + Math.floor(rand() * 7);
    for (let y = 39; y < 39 + len && y < TEX_SIZE; y++) setPx(tex, dx, y, 152, 146, 132);
  }
  // Soot streaks where they burned the dead men's bedding.
  for (let i = 0; i < 6; i++) {
    const sx = Math.floor(rand() * TEX_SIZE);
    const len = 10 + Math.floor(rand() * 26);
    for (let y = 0; y < len; y++) {
      const yy = (sx * 3 + y + 30) % TEX_SIZE;
      const i3 = (yy * TEX_SIZE + sx) * 3;
      tex.data[i3] *= 0.78;
      tex.data[i3 + 1] *= 0.78;
      tex.data[i3 + 2] *= 0.8;
    }
  }
  // Filth wicking up from the lane.
  for (let y = 52; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const i3 = (y * TEX_SIZE + x) * 3;
      const f = 0.88 - (y - 52) * 0.02;
      tex.data[i3] *= f;
      tex.data[i3 + 1] *= f;
      tex.data[i3 + 2] *= f * 0.94;
    }
  }
  addNoise(tex, rand, 11);
  return tex;
}

// The quarter's upper storeys — windows boarded across, so nothing inside
// ever glows. No lit variant: a nailed-shut window is dark forever.
function quarantineUpperWall(): Texture {
  const tex = makeTex();
  const rand = rng(103);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) setPx(tex, x, y, 84, 78, 66);
  }
  const oak = { r: 44, g: 32, b: 21 };
  for (const sx of [2, 22, 42, 62]) rect3(tex, sx, 0, sx + 2, TEX_SIZE - 1, oak.r, oak.g, oak.b);
  rect3(tex, 0, 50, TEX_SIZE - 1, 53, oak.r, oak.g, oak.b);
  for (const [x0, x1] of [[9, 18], [44, 53]] as const) {
    // The opening, then planks nailed haphazard across it.
    rect3(tex, x0, 18, x1, 40, 24, 20, 14);
    for (let i = 0; i < 3; i++) {
      const by = 20 + i * 7 + Math.floor(rand() * 3);
      const shade = 52 + Math.floor(rand() * 14);
      drawThickLine3(tex, x0 - 2, by, x1 + 2, by + 3 + Math.floor(rand() * 2), 3, shade, shade * 0.7, shade * 0.45);
    }
  }
  addNoise(tex, rand, 10);
  return tex;
}

// A door leaf daubed with the plague mark — whitewash X, paint still
// running. Every door in the sealed quarter wears one.
function doorLeafMarked(): Texture {
  const tex = doorLeaf();
  const rand = rng(67);
  drawThickLine3(tex, 14, 16, 50, 44, 3, 172, 166, 150);
  drawThickLine3(tex, 50, 16, 14, 44, 3, 172, 166, 150);
  for (let i = 0; i < 4; i++) {
    const dx = 16 + Math.floor(rand() * 32);
    const len = 4 + Math.floor(rand() * 9);
    for (let y = 45; y < Math.min(45 + len, TEX_SIZE); y++) {
      const i3 = (y * TEX_SIZE + dx) * 3;
      tex.data[i3] = tex.data[i3] * 0.4 + 92;
      tex.data[i3 + 1] = tex.data[i3 + 1] * 0.4 + 88;
      tex.data[i3 + 2] = tex.data[i3 + 2] * 0.4 + 78;
    }
  }
  return tex;
}

// Half-timbered plaster — the classic Parisian facade. Warm plaster bays with
// per-bay tint, dark oak studs and rails, and X-braces in the middle bays.
function timberWall(): Texture {
  const tex = makeTex();
  const rand = rng(61);
  // Plaster bays — each bay gets its own weathered tint.
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const bay = Math.floor(x / 20);
      const tint = ((bay * 41) % 14) - 7;
      setPx(tex, x, y, 122 + tint, 110 + tint * 0.7, 92 + tint * 0.5);
    }
  }
  // Damp blotches — centuries-old plaster weathers in patches.
  for (let i = 0; i < 11; i++) {
    const bx = rand() * TEX_SIZE, by = rand() * TEX_SIZE, br = 3 + rand() * 8;
    const dk = 0.9 + rand() * 0.06;
    for (let y = Math.max(0, Math.floor(by - br)); y < Math.min(TEX_SIZE, by + br); y++) {
      for (let x = Math.max(0, Math.floor(bx - br)); x < Math.min(TEX_SIZE, bx + br); x++) {
        const dx = x - bx, dy = (y - by) * 1.3;
        if (dx * dx + dy * dy <= br * br && rand() < 0.45) {
          const i3 = (y * TEX_SIZE + x) * 3;
          tex.data[i3] *= dk;
          tex.data[i3 + 1] *= dk * 0.98;
          tex.data[i3 + 2] *= dk * 0.94;
        }
      }
    }
  }
  const oak = { r: 54, g: 38, b: 24 };
  const oakLight = { r: 72, g: 52, b: 32 };
  const beam = (x0: number, y0: number, x1: number, y1: number) => {
    rect3(tex, x0, y0, x1, y1, oak.r, oak.g, oak.b);
    // A lighter grain line along the top of horizontal beams.
    if (y1 - y0 < x1 - x0) rect3(tex, x0, y0, x1, y0, oakLight.r, oakLight.g, oakLight.b);
    else rect3(tex, x0, y0, x0, y1, oakLight.r, oakLight.g, oakLight.b);
  };
  // Vertical studs and the mid/sole rails.
  for (const sx of [2, 22, 42, 62]) beam(sx, 0, sx + 3, TEX_SIZE - 1);
  beam(0, 14, TEX_SIZE - 1, 18);
  beam(0, 46, TEX_SIZE - 1, 50);
  // X-braces in the middle bays between the rails.
  for (const [bx0, dir] of [[6, 1], [26, -1]] as const) {
    for (let i = 0; i < 13; i++) {
      const x = bx0 + (dir === 1 ? i : 13 - i);
      const y = 20 + i * 2;
      for (let t = 0; t < 3; t++) setPx(tex, Math.min(63, x + t), y, oak.r, oak.g, oak.b);
      for (let t = 0; t < 3; t++) setPx(tex, Math.min(63, x + t), y + 1, oakLight.r, oakLight.g, oakLight.b);
    }
  }
  // A shut window in the first bay — leaded panes behind warped shutters.
  rect3(tex, 8, 22, 18, 40, 44, 32, 20);
  rect3(tex, 10, 24, 16, 38, 18, 20, 28);
  rect3(tex, 12, 24, 13, 38, 44, 32, 20);
  rect3(tex, 10, 30, 16, 31, 44, 32, 20);
  rect3(tex, 8, 22, 18, 23, 64, 48, 30); // lintel
  rect3(tex, 8, 40, 18, 42, 60, 44, 28); // sill
  // Nail heads where the studs cross the rails.
  for (const nx of [3, 23, 43]) {
    for (const ny of [16, 48]) rect3(tex, nx, ny, nx + 1, ny + 1, 20, 16, 12);
  }
  // Plaster grime rising from the street.
  for (let y = 56; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const i3 = (y * TEX_SIZE + x) * 3;
      const f = 0.94 - (y - 56) * 0.014;
      tex.data[i3] *= f;
      tex.data[i3 + 1] *= f;
      tex.data[i3 + 2] *= f * 0.92;
    }
  }
  addNoise(tex, rand, 9);
  return tex;
}

// Rough planks nailed across a doorway — built and torn down in play.
function barricadeWall(): Texture {
  const tex = makeTex();
  const rand = rng(71);
  // The gaps behind the planks are darkness — boarded tight.
  for (let i = 0; i < tex.data.length; i += 3) {
    tex.data[i] = 16;
    tex.data[i + 1] = 12;
    tex.data[i + 2] = 9;
  }
  // Crossed planks at ragged angles
  const planks: [number, number, number, number][] = [
    [-4, 12, 68, 22],
    [-4, 34, 68, 26],
    [-4, 52, 68, 46],
    [8, -4, 20, 68],
    [44, -4, 56, 68],
  ];
  for (const [x0, y0, x1, y1] of planks) {
    const shade = 66 + Math.floor(rand() * 16);
    drawThickLine3(tex, x0, y0, x1, y1, 4, shade, shade * 0.68, shade * 0.44);
  }
  addNoise(tex, rand, 8);
  return tex;
}

// Tent canvas — undyed buff linen, not masonry. Wide panels belly between
// the seam cords; every other thread row catches the light so the cloth
// reads woven, patched where it tore, mud wicking up from the ground. The
// walls of the camp's tents and the pesthouse marquee.
function canvasWall(): Texture {
  const tex = makeTex();
  const rand = rng(97);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const panel = x % 16;
      // Cloth swells between the seam cords; the weave shows as alternating
      // thread rows.
      const belly = Math.sin((panel / 16) * Math.PI) * 20;
      const weave = y % 2 === 0 ? 6 : -5;
      const v = 148 + belly + weave - y * 0.45;
      if (panel === 0) {
        setPx(tex, x, y, 104, 90, 62); // seam cord — darker buff, not mortar
      } else {
        setPx(tex, x, y, v, v * 0.88, v * 0.62);
      }
    }
  }
  // Stitched thread — pale dashes running down the seams.
  for (let x = 16; x < TEX_SIZE; x += 16) {
    for (let y = 2; y < TEX_SIZE - 2; y += 3) setPx(tex, x, y, 178, 162, 120);
  }
  // Repair patches — paler squares sewn over the tears.
  for (const [px, py, pw, ph] of [[6, 18, 10, 9], [38, 34, 11, 10], [26, 48, 8, 8]] as const) {
    rect3(tex, px, py, px + pw, py + ph, 118, 104, 74);
    for (let i = 0; i <= pw; i += 2) setPx(tex, px + i, py, 88, 76, 52);
    for (let i = 0; i <= ph; i += 2) setPx(tex, px, py + i, 88, 76, 52);
  }
  // Guy ropes — thin lines dropping from the top corners toward the stakes.
  for (let i = 0; i < 22; i++) {
    setPx(tex, Math.floor(i * 0.45), 6 + i, 86, 72, 48);
    setPx(tex, TEX_SIZE - 1 - Math.floor(i * 0.45), 6 + i, 86, 72, 48);
  }
  // Mud wicks up the hem.
  for (let y = 56; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const i3 = (y * TEX_SIZE + x) * 3;
      const f = 0.82 - (y - 56) * 0.05 - (rand() - 0.5) * 0.1;
      tex.data[i3] *= f;
      tex.data[i3 + 1] *= f;
      tex.data[i3 + 2] *= f * 0.9;
    }
  }
  addNoise(tex, rand, 7);
  return tex;
}

// A tent mouth — the dark interior glimpsed past flaps tied back. Nearly
// black; the buff edges are the canvas folded open.
function tentMouth(): Texture {
  const tex = makeTex();
  const rand = rng(113);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      // Utter dark inside, a faint warm floor smudge at the base.
      const v = 14 + (y > 50 ? (y - 50) * 0.8 : 0) + Math.sin(x * 0.9) * 2;
      setPx(tex, x, y, v * 1.1, v * 0.95, v * 0.75);
    }
  }
  // The flaps — buff cloth folding back along both edges, narrowing upward.
  for (let y = 0; y < TEX_SIZE; y++) {
    const inset = Math.floor(2 + (y / TEX_SIZE) * 7);
    for (let i = 0; i < inset; i++) {
      const v = 128 - i * 14 - y * 0.4;
      setPx(tex, i, y, v, v * 0.88, v * 0.62);
      setPx(tex, TEX_SIZE - 1 - i, y, v * 0.85, v * 0.75, v * 0.53); // shade side
    }
  }
  // Tie cords dangling off each flap.
  for (let i = 0; i < 14; i++) {
    setPx(tex, 8 - Math.floor(i * 0.22), 30 + i, 96, 82, 56);
    setPx(tex, 56 + Math.floor(i * 0.22), 30 + i, 88, 74, 50);
  }
  addNoise(tex, rand, 6);
  return tex;
}

// A lantern head — iron frame, cap and ring, four glass panes glowing
// amber. Maps onto the lamp post's head box.
function lanternGlow(): Texture {
  const tex = makeTex();
  const rand = rng(127);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      setPx(tex, x, y, 24, 20, 16); // iron
    }
  }
  // Panes — warm glass, brightest at the flame's heart.
  for (let y = 14; y < 52; y++) {
    for (let x = 10; x < TEX_SIZE - 10; x++) {
      const dx = Math.abs(x - 32) / 22;
      const dy = Math.abs(y - 33) / 20;
      const glow = Math.max(0, 1 - dx * dx - dy * dy);
      setPx(tex, x, y, 120 + glow * 130, 60 + glow * 105, 18 + glow * 40);
    }
  }
  // Frame — the cap, base and corner ribs.
  rect3(tex, 0, 0, TEX_SIZE - 1, 8, 30, 26, 20);
  rect3(tex, 0, 52, TEX_SIZE - 1, TEX_SIZE - 1, 28, 24, 18);
  rect3(tex, 0, 0, 9, TEX_SIZE - 1, 30, 26, 20);
  rect3(tex, TEX_SIZE - 10, 0, TEX_SIZE - 1, TEX_SIZE - 1, 30, 26, 20);
  addNoise(tex, rand, 5);
  return tex;
}

// A clipped leaf mass — plane trees, shrubs, window-box greenery. Dark at
// the heart, sun-caught highlights where the light lands.
function foliageWall(): Texture {
  const tex = makeTex();
  const rand = rng(59);
  // Undergrowth — the shadowed mass behind the leaf surface.
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      setPx(tex, x, y, 26, 40, 20);
    }
  }
  // Leaf clusters — layered blobs in sapling and olive greens.
  for (let i = 0; i < 60; i++) {
    const cx = rand() * TEX_SIZE;
    const cy = rand() * TEX_SIZE;
    const r = 2 + rand() * 5;
    const lit = rand();
    const g = lit < 0.3 ? 120 + rand() * 40 : 62 + rand() * 40;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(TEX_SIZE, cy + r); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(TEX_SIZE, cx + r); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r * r && rand() < 0.8) {
          setPx(tex, x, y, g * 0.45, g, g * 0.35);
        }
      }
    }
  }
  // Twiggy gaps near the foot — the mass thins where it meets the branch.
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rand() * TEX_SIZE);
    const y = TEX_SIZE - 1 - Math.floor(rand() * 14);
    setPx(tex, x, y, 18, 14, 10);
  }
  addNoise(tex, rand, 9);
  return tex;
}

// Trampled meadow — the old park under the camp. Dull olive grass worn to
// mud where feet and carts have passed, straw and filth scattered through.
function grassFloor(): Texture {
  const tex = makeTex();
  const rand = rng(101);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const patchSeed = Math.floor(y / 12) * 19 + Math.floor(x / 12) * 7;
      const g = 64 + ((patchSeed * 40503) % 16) + Math.sin(x * 1.7 + y * 0.8) * 5;
      setPx(tex, x, y, g * 0.82, g, g * 0.5);
    }
  }
  // Mud patches — the grass is dead where the camp walks.
  for (let i = 0; i < 14; i++) {
    const cx = rand() * TEX_SIZE;
    const cy = rand() * TEX_SIZE;
    const r = 3 + rand() * 6;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(TEX_SIZE, cy + r); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(TEX_SIZE, cx + r); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r * r && rand() < 0.75) {
          const m = 52 + rand() * 16;
          setPx(tex, x, y, m, m * 0.8, m * 0.55);
        }
      }
    }
  }
  // Straw and strewn filth.
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rand() * TEX_SIZE);
    const y = Math.floor(rand() * TEX_SIZE);
    setPx(tex, x, y, 120 + rand() * 40, 100 + rand() * 30, 55);
  }
  addNoise(tex, rand, 8);
  return tex;
}

// A thrown-together palisade — rough-hewn stakes of uneven height sharpened
// to points and bound with rope. The whole length of the cordon.
function palisadeWall(): Texture {
  const tex = makeTex();
  const rand = rng(83);
  // The slits between the stakes and the air above their points are dark —
  // shadow and wattle, not open sky. The cordon reads as a solid wall.
  for (let i = 0; i < tex.data.length; i += 3) {
    tex.data[i] = 23;
    tex.data[i + 1] = 17;
    tex.data[i + 2] = 11;
  }
  // Stakes — each a wobbling column tapering to its own ragged point.
  let x = -1;
  while (x < TEX_SIZE) {
    const sw = 6 + Math.floor(rand() * 3);
    const cx = x + sw / 2 + (rand() - 0.5) * 2;
    const tip = 6 + Math.floor(rand() * 10); // the tallest reach of the point
    const shade = 48 + Math.floor(rand() * 20);
    for (let y = 0; y < TEX_SIZE; y++) {
      const hw = y < tip ? 0 : Math.min(sw / 2 - 0.5, (y - tip) * 0.45);
      const sx0 = Math.max(0, Math.floor(cx - hw));
      const sx1 = Math.min(TEX_SIZE - 1, Math.ceil(cx + hw));
      for (let sx = sx0; sx <= sx1; sx++) {
        const edge = Math.abs(sx - cx) > hw - 1;
        const grain = Math.sin(y * 0.5 + x * 7 + Math.sin(sx * 3)) * 5;
        const s = edge ? shade * 0.55 : shade + grain;
        setPx(tex, sx, y, s, s * 0.7, s * 0.45);
      }
    }
    x += sw + 1; // a slit of open air between stakes
  }
  // Cap the gaps at shin height — below the lashing the slits are mudded
  // shut with wattle and daub, only the upper slits stay open.
  for (let y = 46; y < TEX_SIZE; y++) {
    for (let mx = 0; mx < TEX_SIZE; mx++) {
      const i3 = (y * TEX_SIZE + mx) * 3;
      if (tex.data[i3] === 23 && tex.data[i3 + 1] === 17) {
        const m = 42 + ((mx * 13 + y * 7) % 10);
        setPx(tex, mx, y, m, m * 0.78, m * 0.5);
      }
    }
  }
  // Two rope lashings binding the line — dark rails with a twisted weave.
  for (const ly of [30, 52]) {
    rect3(tex, 0, ly, TEX_SIZE - 1, ly + 2, 32, 24, 15);
    for (let rx = 0; rx < TEX_SIZE; rx += 4) rect3(tex, rx, ly, rx + 1, ly + 2, 46, 34, 21);
  }
  // Rot and street mud climbing the foot of the stakes.
  for (let y = 57; y < TEX_SIZE; y++) {
    for (let bx = 0; bx < TEX_SIZE; bx++) {
      const i3 = (y * TEX_SIZE + bx) * 3;
      const f = 0.88 - (y - 57) * 0.05;
      tex.data[i3] *= f;
      tex.data[i3 + 1] *= f * 0.95;
      tex.data[i3 + 2] *= f;
    }
  }
  addNoise(tex, rand, 7);
  return tex;
}

// A window on an upper-storey facade. Lit windows glow amber at night.
function upperWindow(tex: Texture, x0: number, x1: number, lit: boolean): void {
  // Lintel and frame
  rect3(tex, x0 - 5, 15, x1 + 5, 17, 62, 46, 30);
  rect3(tex, x0, 18, x1, 40, 48, 34, 22);
  // Shutters to the sides — slatted
  for (const [sx0, sx1] of [[x0 - 4, x0 - 1], [x1 + 1, x1 + 4]] as const) {
    rect3(tex, sx0, 18, sx1, 40, 52, 38, 24);
    for (let y = 20; y < 40; y += 4) rect3(tex, sx0, y, sx1, y, 38, 27, 17);
  }
  // Panes — leaded glass, lit ones bloom toward the centre
  for (let y = 20; y < 39; y++) {
    for (let x = x0 + 2; x < x1 - 1; x++) {
      if (lit) {
        const cx = (x0 + x1) / 2, cy = 29;
        const d = Math.hypot(x - cx, y - cy) / 14;
        setPx(tex, x, y, Math.min(255, 208 + (1 - d) * 40), 148 + (1 - d) * 50, 66 + (1 - d) * 30);
      } else {
        setPx(tex, x, y, 14 + (x % 3), 16 + (x % 3), 24);
      }
    }
  }
  // Mullions
  const mx = Math.floor((x0 + x1) / 2);
  rect3(tex, mx, 20, mx + 1, 38, 40, 30, 20);
  rect3(tex, x0 + 2, 28, x1 - 1, 29, 40, 30, 20);
  // Sill with a shadowed underside
  rect3(tex, x0 - 3, 41, x1 + 3, 42, 66, 50, 32);
  rect3(tex, x0 - 2, 43, x1 + 2, 44, 34, 25, 16);
}

// Upper storey of a half-timbered house — plaster, studs, shuttered windows.
function timberUpperWall(lit: boolean): Texture {
  const tex = makeTex();
  const rand = rng(lit ? 63 : 61);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const bay = Math.floor(x / 20);
      const tint = ((bay * 29) % 12) - 6;
      setPx(tex, x, y, 114 + tint, 102 + tint * 0.7, 84 + tint * 0.5);
    }
  }
  for (const sx of [2, 22, 42, 62]) rect3(tex, sx, 0, sx + 3, TEX_SIZE - 1, 56, 40, 26);
  rect3(tex, 0, 50, TEX_SIZE - 1, 54, 56, 40, 26);
  // Braces under the eaves rail.
  for (let i = 0; i < 10; i++) {
    const y = 2 + i;
    for (let t = 0; t < 3; t++) {
      setPx(tex, 26 + i + t, y, 56, 40, 26);
      setPx(tex, 36 - i - t, y, 56, 40, 26);
    }
  }
  upperWindow(tex, 9, 18, lit);
  upperWindow(tex, 44, 53, lit);
  addNoise(tex, rand, 9);
  return tex;
}

// Upper storey of a stone building — coursed stone with narrow windows.
function stoneUpperWall(lit: boolean): Texture {
  const tex = makeTex();
  const rand = rng(lit ? 73 : 71);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const mortar = y % 16 < 2 || (x + Math.floor(y / 16) * 16) % 32 < 2;
      if (mortar) setPx(tex, x, y, 40, 38, 36);
      else setPx(tex, x, y, 92, 88, 84);
    }
  }
  for (const [x0, x1] of [[10, 19], [42, 51]] as const) {
    rect3(tex, x0 - 1, 13, x1 + 1, 15, 58, 55, 52); // lintel
    rect3(tex, x0, 16, x1, 44, 52, 50, 48);
    for (let y = 18; y < 43; y++) {
      for (let x = x0 + 2; x < x1 - 1; x++) {
        if (lit) setPx(tex, x, y, 196, 138, 60);
        else setPx(tex, x, y, 12, 14, 20);
      }
    }
    rect3(tex, Math.floor((x0 + x1) / 2), 18, Math.floor((x0 + x1) / 2) + 1, 43, 44, 42, 40);
    rect3(tex, x0 - 1, 44, x1 + 1, 46, 66, 62, 58); // sill
  }
  addNoise(tex, rand, 10);
  return tex;
}

// Upper storey of a brick building — dark brick with slit windows.
function brickUpperWall(lit: boolean): Texture {
  const tex = makeTex();
  const rand = rng(lit ? 77 : 75);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const mortar = y % 8 < 1 || (x + Math.floor(y / 8) * 8) % 16 < 1;
      if (mortar) setPx(tex, x, y, 24, 22, 21);
      else {
        const blockSeed = Math.floor(y / 8) * 17 + Math.floor((x + Math.floor(y / 8) * 8) / 16) * 5;
        const shade = 50 + ((blockSeed * 40503) % 14);
        setPx(tex, x, y, shade + 8, shade - 2, shade - 6);
      }
    }
  }
  for (const [x0, x1] of [[12, 20], [44, 52]] as const) {
    // Lintel above, sill below — windows sit in the wall, not on it.
    rect3(tex, x0 - 1, 12, x1 + 1, 14, 34, 32, 30);
    rect3(tex, x0, 14, x1, 46, 40, 38, 36);
    for (let y = 16; y < 45; y++) {
      for (let x = x0 + 2; x < x1 - 1; x++) {
        if (lit) setPx(tex, x, y, 210, 150, 64);
        else setPx(tex, x, y, 10, 12, 18);
      }
    }
    rect3(tex, x0 - 1, 46, x1 + 1, 48, 62, 58, 54); // sill
  }
  addNoise(tex, rand, 9);
  return tex;
}

// A roofline — the top band of every exterior wall. Blue-grey slate courses
// under a black ridge, with the eaves shadow at the bottom of the band.
function roofSlate(): Texture {
  const tex = makeTex();
  const rand = rng(211);
  // Ridge cap — the silhouette edge against the sky.
  for (let y = 0; y < 6; y++) for (let x = 0; x < TEX_SIZE; x++) setPx(tex, x, y, 14, 14, 18);
  // Slate courses — overlapping rows, alternating offsets.
  const ch = 7;
  for (let y = 6; y < 54; y++) {
    const row = Math.floor((y - 6) / ch);
    const off = (row % 2) * 5;
    for (let x = 0; x < TEX_SIZE; x++) {
      const seam = (x + off) % 10 < 1 || (y - 6) % ch < 1;
      const tileSeed = row * 23 + Math.floor((x + off) / 10) * 11;
      let shade = 42 + ((tileSeed * 2654435761) % 16);
      // The odd replacement slate stands out paler, or goes moss-dark.
      if ((tileSeed * 131) % 29 === 0) shade += 16;
      else if ((tileSeed * 173) % 31 === 0) shade -= 14;
      if (seam) setPx(tex, x, y, 20, 22, 28);
      else setPx(tex, x, y, shade - 4, shade, shade + 10);
    }
  }
  // The eaves — a deep shadow where the roof overhangs the wall.
  for (let y = 54; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const f = 0.5 - (y - 54) * 0.03;
      setPx(tex, x, y, 26 * f + 10, 26 * f + 10, 30 * f + 12);
    }
  }
  addNoise(tex, rand, 7);
  return tex;
}

// Terracotta barrel tiles — the warmer roof, alternating with the slate.
function roofTile(): Texture {
  const tex = makeTex();
  const rand = rng(223);
  for (let y = 0; y < 6; y++) for (let x = 0; x < TEX_SIZE; x++) setPx(tex, x, y, 20, 12, 10);
  // Rounded tile rows — scalloped shading reads as barrel tiles.
  const ch = 8;
  for (let y = 6; y < 54; y++) {
    const row = Math.floor((y - 6) / ch);
    for (let x = 0; x < TEX_SIZE; x++) {
      const within = (y - 6) % ch;
      const scallop = Math.sin((x / 8) * Math.PI);
      const shade = 66 + scallop * 22 + ((row * 13 + Math.floor(x / 8) * 7) % 10);
      if (within < 1) setPx(tex, x, y, 34, 20, 14);
      else setPx(tex, x, y, shade + 18, shade * 0.62, shade * 0.42);
    }
  }
  for (let y = 54; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const f = 0.5 - (y - 54) * 0.03;
      setPx(tex, x, y, 24 * f + 9, 22 * f + 8, 24 * f + 10);
    }
  }
  addNoise(tex, rand, 8);
  return tex;
}

// Stone parapet — the cap for city walls and the cordon.
function roofParapet(): Texture {
  const tex = makeTex();
  const rand = rng(233);
  // Coping stones — a lighter row that catches the sky.
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const seam = x % 16 < 1;
      setPx(tex, x, y, seam ? 52 : 78, seam ? 50 : 74, seam ? 46 : 68);
    }
  }
  // Weathered face below the coping.
  const bh = 12;
  for (let y = 8; y < TEX_SIZE; y++) {
    const row = Math.floor(y / bh);
    const off = (row % 2) * 10;
    for (let x = 0; x < TEX_SIZE; x++) {
      const mortar = (x + off) % 20 < 2 || y % bh < 1;
      const blockSeed = row * 19 + Math.floor((x + off) / 20) * 9;
      const shade = 46 + ((blockSeed * 40503) % 12);
      if (mortar) setPx(tex, x, y, 26, 25, 23);
      else setPx(tex, x, y, shade, shade - 2, shade - 5);
    }
  }
  addNoise(tex, rand, 9);
  return tex;
}

// Plain aged plaster — the inner face of every building.
function plasterInnerWall(): Texture {
  const tex = makeTex();
  const rand = rng(89);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      setPx(tex, x, y, 100, 88, 72);
    }
  }
  // Vertical damp streaks
  for (let i = 0; i < 6; i++) {
    const sx = Math.floor(rand() * TEX_SIZE);
    const len = 10 + Math.floor(rand() * 40);
    for (let y = 0; y < len; y++) {
      const yy = Math.floor(rand() * 20) + y;
      if (yy < TEX_SIZE) {
        const i3 = (yy * TEX_SIZE + sx) * 3;
        tex.data[i3] *= 0.86;
        tex.data[i3 + 1] *= 0.86;
        tex.data[i3 + 2] *= 0.88;
      }
    }
  }
  // A spalled patch — plaster fallen away, rubble stone behind, ragged rim.
  {
    const cx = 47, cy = 28, cr = 8;
    for (let y = cy - cr; y < cy + cr; y++) {
      for (let x = cx - cr; x < cx + cr; x++) {
        const dx = x - cx, dy = (y - cy) * 1.5;
        const d = dx * dx + dy * dy;
        if (d < cr * cr) {
          if (d > (cr - 2) * (cr - 2)) {
            setPx(tex, x, y, 72, 62, 50);
          } else {
            const stone = 54 + ((x * 7 + y * 13) % 15);
            setPx(tex, x, y, stone, stone - 5, stone - 9);
          }
        }
      }
    }
  }
  // Hairline cracks working down from the ceiling line.
  for (let i = 0; i < 2; i++) {
    let cx = Math.floor(rand() * TEX_SIZE);
    const len = 10 + Math.floor(rand() * 24);
    for (let y = 0; y < len && y < TEX_SIZE; y++) {
      const i3 = (y * TEX_SIZE + (cx % TEX_SIZE)) * 3;
      tex.data[i3] *= 0.6;
      tex.data[i3 + 1] *= 0.6;
      tex.data[i3 + 2] *= 0.6;
      if (rand() < 0.35) cx += rand() < 0.5 ? 1 : -1;
    }
  }
  // Grime along the bottom
  for (let y = 56; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const i3 = (y * TEX_SIZE + x) * 3;
      const f = 0.9 - (y - 56) * 0.02;
      tex.data[i3] *= f;
      tex.data[i3 + 1] *= f;
      tex.data[i3 + 2] *= f;
    }
  }
  addNoise(tex, rand, 10);
  return tex;
}

// Interior of a timber house — the framing shows through the plaster.
function timberInnerWall(): Texture {
  const tex = makeTex();
  const rand = rng(91);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) setPx(tex, x, y, 108, 96, 78);
  }
  for (const sx of [1, 22, 43]) rect3(tex, sx, 0, sx + 3, TEX_SIZE - 1, 62, 46, 30);
  rect3(tex, 0, 30, TEX_SIZE - 1, 33, 62, 46, 30); // mid rail
  rect3(tex, 0, 58, TEX_SIZE - 1, 62, 54, 40, 26); // baseboard
  addNoise(tex, rand, 9);
  return tex;
}

// Wainscot interior — plaster above, wood panelling below a chair rail.
function wainscotWall(): Texture {
  const tex = makeTex();
  const rand = rng(101);
  // Plaster upper two-thirds
  for (let y = 0; y < 38; y++) {
    for (let x = 0; x < TEX_SIZE; x++) setPx(tex, x, y, 106, 94, 78);
  }
  // Chair rail
  rect3(tex, 0, 38, TEX_SIZE - 1, 41, 60, 44, 28);
  // Wainscot boards
  for (let x = 0; x < TEX_SIZE; x++) {
    const board = Math.floor(x / 8);
    const shade = 72 + ((board * 31) % 12);
    for (let y = 42; y < TEX_SIZE; y++) {
      if (x % 8 < 1) setPx(tex, x, y, 44, 32, 20);
      else setPx(tex, x, y, shade, shade * 0.68, shade * 0.44);
    }
  }
  // Baseboard
  rect3(tex, 0, 59, TEX_SIZE - 1, 63, 40, 30, 19);
  addNoise(tex, rand, 8);
  return tex;
}

// --- floors ----------------------------------------------------------------

// Flagstone floor for halls and corridors — worn slabs with chipped edges.
function flagstoneFloor(): Texture {
  const tex = makeTex();
  const rand = rng(67);
  const ts = 16;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const tileSeed = Math.floor(y / ts) * 13 + Math.floor(x / ts) * 29;
      if (x % ts < 1 || y % ts < 1) {
        setPx(tex, x, y, 30, 29, 27);
      } else {
        let shade = 66 + ((tileSeed * 2246822519) % 15);
        // Worn bevel — lighter near each slab's lit edge, darker opposite.
        if (x % ts === 1 || y % ts === 1) shade += 10;
        if (x % ts === ts - 1 || y % ts === ts - 1) shade -= 10;
        // The centre of each slab wears smooth and pale.
        const d = Math.hypot((x % ts) - 8, (y % ts) - 8);
        if (d < 4) shade += 6;
        setPx(tex, x, y, shade, shade - 2, shade - 5);
      }
    }
  }
  // A crack wandering diagonally across the slabs.
  {
    let cx = 8 + Math.floor(rand() * 20);
    for (let y = 0; y < TEX_SIZE; y++) {
      const i3 = (y * TEX_SIZE + (cx % TEX_SIZE)) * 3;
      tex.data[i3] *= 0.5;
      tex.data[i3 + 1] *= 0.5;
      tex.data[i3 + 2] *= 0.5;
      if (rand() < 0.45) cx += rand() < 0.5 ? 1 : -1;
    }
  }
  addNoise(tex, rand, 12);
  return tex;
}

// A deep red carpet with a gold border, for the great hall aisle.
function carpetFloor(): Texture {
  const tex = makeTex();
  const rand = rng(83);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const border = x < 5 || x >= TEX_SIZE - 5;
      if (border) {
        const stripe = (x + y) % 8 < 4;
        if (stripe) setPx(tex, x, y, 128, 94, 40);
        else setPx(tex, x, y, 96, 66, 30);
      } else {
        const weave = (x + y) % 2 === 0 ? 6 : 0;
        // A worn diamond motif woven down the carpet's length.
        const dm = (Math.abs(x - 32) + Math.abs((y % 24) - 12)) === 8;
        const dr = 118 + weave, dg = 24, db = 30;
        if (dm) setPx(tex, x, y, 150, 110, 52);
        else setPx(tex, x, y, dr, dg, db);
      }
    }
  }
  // Ground-in wear along the middle — a thousand feet have passed here.
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 26; x < 38; x++) {
      const i3 = (y * TEX_SIZE + x) * 3;
      tex.data[i3] *= 0.88;
      tex.data[i3 + 1] *= 0.9;
      tex.data[i3 + 2] *= 0.9;
    }
  }
  addNoise(tex, rand, 8);
  return tex;
}

// Packed dirt for the courtyard.
function dirtFloor(): Texture {
  const tex = makeTex();
  const rand = rng(97);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      setPx(tex, x, y, 56, 44, 32);
    }
  }
  for (let i = 0; i < 220; i++) {
    const x = Math.floor(rand() * TEX_SIZE);
    const y = Math.floor(rand() * TEX_SIZE);
    const i3 = (y * TEX_SIZE + x) * 3;
    if (rand() < 0.35) {
      // Pebble
      const s = 20 + rand() * 30;
      tex.data[i3] += s;
      tex.data[i3 + 1] += s;
      tex.data[i3 + 2] += s;
    } else if (rand() < 0.25) {
      // Dead grass tuft
      tex.data[i3] = 34 + rand() * 14;
      tex.data[i3 + 1] = 48 + rand() * 14;
      tex.data[i3 + 2] = 24;
    } else {
      tex.data[i3] *= 0.7;
      tex.data[i3 + 1] *= 0.7;
      tex.data[i3 + 2] *= 0.7;
    }
  }
  // Cart ruts — two worn troughs crossing the packed earth.
  for (const rx of [18, 46]) {
    for (let y = 0; y < TEX_SIZE; y++) {
      const wob = Math.floor(Math.sin(y * 0.28 + rx) * 2);
      const x = rx + wob;
      if (x >= 0 && x < TEX_SIZE) {
        const i3 = (y * TEX_SIZE + x) * 3;
        tex.data[i3] *= 0.72;
        tex.data[i3 + 1] *= 0.72;
        tex.data[i3 + 2] *= 0.72;
      }
    }
  }
  addNoise(tex, rand, 10);
  return tex;
}

// Cobblestone street — domed stones with wet dark joints.
function cobbleFloor(): Texture {
  const tex = makeTex();
  const rand = rng(139);
  for (let i = 0; i < tex.data.length; i += 3) {
    tex.data[i] = 26;
    tex.data[i + 1] = 25;
    tex.data[i + 2] = 24;
  }
  const cs = 10;
  for (let cy = -cs; cy < TEX_SIZE + cs; cy += cs) {
    for (let cx = -cs; cx < TEX_SIZE + cs; cx += cs) {
      // Offset alternate rows — true cobble courses.
      const off = (Math.floor(cy / cs) % 2) * (cs / 2);
      const ox = Math.floor(rand() * 3) - 1;
      const oy = Math.floor(rand() * 3) - 1;
      const shade = 56 + Math.floor(rand() * 26);
      const r = cs / 2 - 0.5;
      const cxx = cx + cs / 2 + ox + off;
      const cyy = cy + cs / 2 + oy;
      for (let y = 0; y < TEX_SIZE; y++) {
        for (let x = 0; x < TEX_SIZE; x++) {
          const dx = x - cxx;
          const dy = y - cyy;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r * r) {
            // Domed shading — brighter toward the stone's crown, with a faint
            // cool sheen on top so the street reads rain-wet.
            const dome = Math.sqrt(Math.max(0, 1 - d2 / (r * r))) * 22;
            setPx(tex, x, y, shade + dome, shade - 2 + dome, shade - 4 + dome * 1.15);
          }
        }
      }
    }
  }
  // Moss flecks taking hold in the wet joints between stones.
  for (let i = 0; i < 160; i++) {
    const x = Math.floor(rand() * TEX_SIZE);
    const y = Math.floor(rand() * TEX_SIZE);
    const i3 = (y * TEX_SIZE + x) * 3;
    if (tex.data[i3] < 34) {
      tex.data[i3] = 26 + rand() * 12;
      tex.data[i3 + 1] = 38 + rand() * 16;
      tex.data[i3 + 2] = 20;
    }
  }
  addNoise(tex, rand, 9);
  return tex;
}

// Wooden plank floor for house interiors.
function woodFloor(): Texture {
  const tex = makeTex();
  const rand = rng(149);
  const ph = 8;
  for (let y = 0; y < TEX_SIZE; y++) {
    const plank = Math.floor(y / ph);
    const shade = 70 + ((plank * 37) % 16);
    for (let x = 0; x < TEX_SIZE; x++) {
      if (y % ph < 1) {
        setPx(tex, x, y, 30, 22, 15);
      } else {
        const joint = (x + (plank % 2) * 20) % 40 < 1;
        const grain = Math.sin(x * 0.6 + plank * 8) * 6;
        if (joint) setPx(tex, x, y, 34, 24, 16);
        else setPx(tex, x, y, shade + grain, shade * 0.66 + grain * 0.5, shade * 0.42);
      }
    }
  }
  // Nail heads flanking each plank's butt joint.
  for (let plank = 0; plank < TEX_SIZE / ph; plank++) {
    const off = (plank % 2) * 20;
    for (let jx = (40 - off) % 40; jx < TEX_SIZE; jx += 40) {
      const y = plank * ph + 4;
      for (const nx of [jx + 3, jx + 36]) {
        if (nx < TEX_SIZE && y < TEX_SIZE) setPx(tex, nx, y, 20, 15, 10);
      }
    }
  }
  // The odd knot in a board.
  for (let i = 0; i < 4; i++) {
    const kx = Math.floor(rand() * TEX_SIZE);
    const ky = Math.floor(rand() * TEX_SIZE);
    if (ky % ph < 3) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) * 0.6 + Math.abs(dy) > 2.2) continue;
        const x = kx + dx, y = ky + dy;
        if (x >= 0 && x < TEX_SIZE && y >= 0 && y < TEX_SIZE && y % ph >= 1) {
          const i3 = (y * TEX_SIZE + x) * 3;
          tex.data[i3] = 28;
          tex.data[i3 + 1] = 19;
          tex.data[i3 + 2] = 12;
        }
      }
    }
  }
  addNoise(tex, rand, 9);
  return tex;
}

// Stagnant sewer water — black-green with faint ripple highlights.
function sewerFloor(): Texture {
  const tex = makeTex();
  const rand = rng(173);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      setPx(tex, x, y, 16, 26, 20);
    }
  }
  // Horizontal ripple bands
  for (let i = 0; i < 14; i++) {
    const y = Math.floor(rand() * TEX_SIZE);
    const x0 = Math.floor(rand() * TEX_SIZE * 0.6);
    const len = 6 + Math.floor(rand() * 20);
    for (let x = x0; x < x0 + len && x < TEX_SIZE; x++) {
      setPx(tex, x, y, 38, 56, 44);
    }
  }
  // Oily slicks — slow iridescent scum riding the current.
  for (let i = 0; i < 6; i++) {
    const cx = rand() * TEX_SIZE, cy = rand() * TEX_SIZE, r = 3 + rand() * 6;
    for (let y = Math.max(0, Math.floor(cy - r / 2)); y < Math.min(TEX_SIZE, cy + r / 2); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(TEX_SIZE, cx + r); x++) {
        const dx = (x - cx) / 1.8, dy = y - cy;
        if (dx * dx + dy * dy < r * r && rand() < 0.5) {
          const i3 = (y * TEX_SIZE + x) * 3;
          tex.data[i3] = tex.data[i3] * 0.6 + 20;
          tex.data[i3 + 1] = tex.data[i3 + 1] * 0.6 + 34;
          tex.data[i3 + 2] = tex.data[i3 + 2] * 0.6 + 30;
        }
      }
    }
  }
  addNoise(tex, rand, 8);
  return tex;
}

// --- ceilings --------------------------------------------------------------

// Dark exposed beams overhead.
function beamCeiling(): Texture {
  const tex = makeTex();
  const rand = rng(113);
  const bh = 16;
  for (let y = 0; y < TEX_SIZE; y++) {
    const beam = Math.floor(y / bh);
    const shade = 40 + ((beam * 31) % 10);
    for (let x = 0; x < TEX_SIZE; x++) {
      if (y % bh < 3) {
        setPx(tex, x, y, 14, 12, 10);
      } else {
        const grain = Math.sin(x * 0.5 + beam * 5) * 5;
        setPx(tex, x, y, shade + grain, shade * 0.74 + grain * 0.5, shade * 0.52);
      }
    }
  }
  addNoise(tex, rand, 7);
  return tex;
}

// Open night sky — near-black with stars, cloud masses and a pale moon.
function nightSky(): Texture {
  const tex = makeTex();
  const rand = rng(131);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const g = 6 + (y / TEX_SIZE) * 6;
      setPx(tex, x, y, g * 0.8, g * 0.9, g * 1.8);
    }
  }
  // A waning moon with a halo
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const d = Math.hypot(x - 46, y - 12);
      if (d < 4.5) setPx(tex, x, y, 196, 200, 210);
      else if (d < 8) {
        const i3 = (y * TEX_SIZE + x) * 3;
        tex.data[i3] += (8 - d) * 8;
        tex.data[i3 + 1] += (8 - d) * 8;
        tex.data[i3 + 2] += (8 - d) * 10;
      }
    }
  }
  // Heavy cloud masses drifting low
  for (let i = 0; i < 18; i++) {
    const cx = rand() * TEX_SIZE;
    const cy = 10 + rand() * TEX_SIZE * 0.6;
    const r = 5 + rand() * 10;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(TEX_SIZE, cy + r); y++) {
      for (let x = Math.max(0, Math.floor(cx - r * 1.6)); x < Math.min(TEX_SIZE, cx + r * 1.6); x++) {
        const dx = (x - cx) / 1.6, dy = y - cy;
        if (dx * dx + dy * dy <= r * r && rand() < 0.7) {
          const i3 = (y * TEX_SIZE + x) * 3;
          tex.data[i3] = tex.data[i3] * 0.5 + 14;
          tex.data[i3 + 1] = tex.data[i3 + 1] * 0.5 + 16;
          tex.data[i3 + 2] = tex.data[i3 + 2] * 0.5 + 22;
        }
      }
    }
  }
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rand() * TEX_SIZE);
    const y = Math.floor(rand() * TEX_SIZE);
    const s = 90 + rand() * 140;
    setPx(tex, x, y, s, s, s * 1.05);
  }
  return tex;
}

// A vaulted brick ceiling for the sewers — dark, low, sweating damp.
function vaultCeiling(): Texture {
  const tex = makeTex();
  const rand = rng(163);
  const bh = 8;
  const bw = 16;
  for (let y = 0; y < TEX_SIZE; y++) {
    const row = Math.floor(y / bh);
    const offset = (row % 2) * (bw / 2);
    for (let x = 0; x < TEX_SIZE; x++) {
      if (y % bh < 1 || (x + offset) % bw < 1) {
        setPx(tex, x, y, 12, 12, 12);
      } else {
        const blockSeed = row * 17 + Math.floor((x + offset) / bw) * 5;
        const shade = 34 + ((blockSeed * 40503) % 11);
        setPx(tex, x, y, shade, shade - 2, shade - 4);
      }
    }
  }
  // Water stains bleeding down from the street above
  for (let i = 0; i < 9; i++) {
    const sx = Math.floor(rand() * TEX_SIZE);
    const len = 10 + Math.floor(rand() * 30);
    for (let y = 0; y < len; y++) {
      const yy = (sx * 5 + y) % TEX_SIZE;
      const i3 = (yy * TEX_SIZE + sx) * 3;
      tex.data[i3] *= 0.8;
      tex.data[i3 + 1] *= 0.82;
      tex.data[i3 + 2] *= 0.8;
    }
  }
  addNoise(tex, rand, 9);
  return tex;
}

// An overcast daytime sky — pale grey clouds drifting over the city.
function daySky(): Texture {
  const tex = makeTex();
  const rand = rng(151);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const g = 86 + (y / TEX_SIZE) * 30;
      setPx(tex, x, y, g * 0.85, g * 0.92, g * 1.05);
    }
  }
  // Blotchy cloud cover
  for (let i = 0; i < 26; i++) {
    const cx = rand() * TEX_SIZE;
    const cy = rand() * TEX_SIZE * 0.7;
    const r = 4 + rand() * 9;
    const shade = 70 + rand() * 30;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(TEX_SIZE, cy + r); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(TEX_SIZE, cx + r); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r && rand() < 0.8) {
          const i3 = (y * TEX_SIZE + x) * 3;
          tex.data[i3] = tex.data[i3] * 0.4 + shade * 0.6;
          tex.data[i3 + 1] = tex.data[i3 + 1] * 0.4 + shade * 0.95 * 0.6;
          tex.data[i3 + 2] = tex.data[i3 + 2] * 0.4 + shade * 0.6;
        }
      }
    }
  }
  return tex;
}

export function buildTextures(): TextureSet {
  const walls = [
    makeTex(), // 0 unused
    stoneWall(), // 1
    darkBrickWall(), // 2
    woodWall(), // 3
    doorWall(), // 4
    timberWall(), // 5
    barricadeWall(), // 6
    timberUpperWall(false), // 7
    timberUpperWall(true), // 8 — lit variant
    stoneUpperWall(false), // 9
    stoneUpperWall(true), // 10 — lit variant
    brickUpperWall(false), // 11
    brickUpperWall(true), // 12 — lit variant
    plasterInnerWall(), // 13
    timberInnerWall(), // 14
    wainscotWall(), // 15
    roofSlate(), // 16 — exterior top band
    roofTile(), // 17 — terracotta variant
    roofParapet(), // 18 — stone coping for ramparts
    doorLeaf(), // 19 — swinging door leaf (prop faces)
    quarantineWall(), // 20 — patched, boarded, marked: the sealed quarter
    quarantineUpperWall(), // 21 — boarded upper storey, never lit
    doorLeafMarked(), // 22 — quarter doors daubed with the whitewash X
    palisadeWall(), // 23 — the cordon's stake wall
    canvasWall(), // 24 — tent canvas: the camp and the marquee
    tentMouth(), // 25 — a tent's dark opening, flaps tied back
    lanternGlow(), // 26 — iron-framed lantern, amber panes alight
    foliageWall(), // 27 — clipped leaf mass: trees, shrubs, window boxes
  ];
  // Facade ids that have a candle-lit version for night-time.
  const wallsLit = new Uint8Array(walls.length);
  wallsLit[7] = 8;
  wallsLit[9] = 10;
  wallsLit[11] = 12;
  return {
    walls,
    wallsLit,
    floors: [makeTex(), flagstoneFloor(), carpetFloor(), dirtFloor(), cobbleFloor(), woodFloor(), sewerFloor(), grassFloor()],
    ceils: [makeTex(), beamCeiling(), nightSky(), daySky(), vaultCeiling()],
  };
}
