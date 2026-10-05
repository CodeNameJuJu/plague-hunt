import {
  BOB_AMPLITUDE,
  BOB_FREQUENCY,
  MOUSE_SENSITIVITY,
  MOVE_SPEED,
  PITCH_LIMIT,
  PLAYER_RADIUS,
  RUN_MULTIPLIER,
  TURN_SPEED,
} from "./config";
import { consumeMouse, isDown, isLocked } from "./input";
import { binds, settings } from "./settings";
import { isBlocked } from "./map";
import type { GameMap, SpriteRuntime } from "./types";

export interface Player {
  x: number;
  y: number;
  angle: number; // facing, radians
  pitch: number; // horizon shift in pixels (mouse Y)
  bobPhase: number;
  bob: number; // current bob offset applied to the horizon, pixels
  moving: boolean;
  running: boolean; // sprinting this frame — drains fatigue faster
}

export function makePlayer(map: GameMap): Player {
  return {
    x: map.spawnX,
    y: map.spawnY,
    angle: map.spawnAngle,
    pitch: 0,
    bobPhase: 0,
    bob: 0,
    moving: false,
    running: false,
  };
}

// Circle-vs-grid collision, plus round blocking sprites (braziers, barrels).
function blocked(map: GameMap, sprites: SpriteRuntime[], x: number, y: number): boolean {
  if (isBlocked(map, x, y, PLAYER_RADIUS)) return true;
  for (const s of sprites) {
    if (s.block === 0 || s.taken) continue;
    const rr = s.block + PLAYER_RADIUS;
    const dx = x - s.x;
    const dy = y - s.y;
    if (dx * dx + dy * dy < rr * rr) return true;
  }
  return false;
}

export function updatePlayer(
  p: Player,
  dt: number,
  map: GameMap,
  sprites: SpriteRuntime[],
  speedMul = 1 // exhaustion drags the legs below 1
): void {
  if (!isLocked()) {
    p.moving = false;
    p.running = false;
    return;
  }

  // Mouse look
  const mouse = consumeMouse();
  p.angle += mouse.dx * MOUSE_SENSITIVITY * settings.sensitivity;
  p.pitch -= mouse.dy * 0.23;
  p.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p.pitch));

  // Arrow keys turn as a fallback
  if (isDown("ArrowLeft")) p.angle -= TURN_SPEED * dt;
  if (isDown("ArrowRight")) p.angle += TURN_SPEED * dt;
  if (isDown("ArrowUp")) p.pitch = Math.max(-PITCH_LIMIT, p.pitch - 90 * dt);
  if (isDown("ArrowDown")) p.pitch = Math.min(PITCH_LIMIT, p.pitch + 90 * dt);

  // Movement relative to facing
  let mx = 0;
  let my = 0;
  if (isDown(binds.forward)) mx += 1;
  if (isDown(binds.back)) mx -= 1;
  if (isDown(binds.right)) my += 1;
  if (isDown(binds.left)) my -= 1;

  const len = Math.hypot(mx, my);
  p.moving = len > 0;
  p.running = false;
  if (len === 0) {
    p.bob += (0 - p.bob) * Math.min(1, dt * 8);
    return;
  }
  mx /= len;
  my /= len;

  p.running = (isDown(binds.run) || isDown("ShiftRight")) && speedMul === 1;
  const run = p.running ? RUN_MULTIPLIER : 1;
  const speed = MOVE_SPEED * run * speedMul * dt;
  const cos = Math.cos(p.angle);
  const sin = Math.sin(p.angle);
  // Forward is (cos, sin); strafe is perpendicular
  const nx = p.x + (cos * mx - sin * my) * speed;
  const ny = p.y + (sin * mx + cos * my) * speed;

  // Slide along walls: try each axis independently
  if (!blocked(map, sprites, nx, p.y)) p.x = nx;
  if (!blocked(map, sprites, p.x, ny)) p.y = ny;

  // Head bob — faster when running
  p.bobPhase += dt * BOB_FREQUENCY * run;
  p.bob = Math.sin(p.bobPhase) * BOB_AMPLITUDE;
}
