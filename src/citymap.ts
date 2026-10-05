import type { GameMap } from "./types";
import type { Player } from "./player";

// The city map — a parchment-style overlay of the streets, drawn once from the
// map data and re-blitted each frame with the player's position and facing.
// The loft strip (y >= 45) lives off the edge of the parchment on purpose.

const SCALE = 6;
const ROWS = 45;

// Colours keyed by floor texture id (see textures.ts / map.ts).
const FLOOR_INK: Record<number, string> = {
  1: "#4a423c", // flagstone
  2: "#3c2a28", // carpet
  3: "#3a3024", // dirt
  4: "#4e4a44", // cobblestone
  5: "#5a4630", // wood boards
};

export function initCityMap(map: GameMap): { canvas: HTMLCanvasElement; draw: (p: Player) => void } {
  const w = map.w * SCALE;
  const h = ROWS * SCALE;

  // The static base — streets, footprints, openings, landmark names.
  const base = document.createElement("canvas");
  base.width = w;
  base.height = h;
  const bctx = base.getContext("2d")!;
  bctx.fillStyle = "#14100c";
  bctx.fillRect(0, 0, w, h);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      let ink: string;
      if (map.walls[i] !== 0) ink = "#241f1b"; // solid wall
      else if (map.doorways.has(i) || map.windows.has(i)) ink = "#7a6242"; // openings read as gaps
      else ink = FLOOR_INK[map.floorTex[i]] ?? "#2e2a26";
      // Interiors get a warm wash so homes read as shelter, streets as stone.
      if (map.ceilTex[i] === 1 && map.walls[i] === 0) ink = "#5c4936";
      bctx.fillStyle = ink;
      bctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
    }
  }

  // Landmark pins and names.
  bctx.font = `${SCALE + 3}px Georgia, serif`;
  bctx.textAlign = "center";
  for (const lm of map.landmarks) {
    const lx = lm.x * SCALE;
    const ly = lm.y * SCALE;
    bctx.fillStyle = "#c9a860";
    bctx.beginPath();
    bctx.arc(lx, ly - SCALE, 2.2, 0, Math.PI * 2);
    bctx.fill();
    bctx.fillStyle = "#d8c49a";
    bctx.fillText(lm.name, lx, ly + SCALE * 1.6);
  }

  // The composited frame — base + a live arrow for the player.
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  function draw(player: Player): void {
    ctx.drawImage(base, 0, 0);
    const px = player.x * SCALE;
    const py = player.y * SCALE;
    if (py >= h) return; // up in a loft — the arrow slides off the parchment
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.angle);
    ctx.fillStyle = "#e8d8a8";
    ctx.strokeStyle = "#1a120a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-4, -4.5);
    ctx.lineTo(-4, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  return { canvas, draw };
}
