// Keyboard state + pointer-lock mouse look.

import { binds } from "./settings";

const keys = new Set<string>();
const justPressed = new Set<string>();
let mouseDX = 0;
let mouseDY = 0;
let locked = false;

export function initInput(canvas: HTMLCanvasElement, onLockChange: (locked: boolean) => void): void {
  window.addEventListener("keydown", (e) => {
    if (e.code === "Tab" || e.code === binds.pack) e.preventDefault();
    if (!e.repeat) justPressed.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());

  document.addEventListener("mousemove", (e) => {
    if (!locked) return;
    mouseDX += e.movementX;
    mouseDY += e.movementY;
  });

  document.addEventListener("pointerlockchange", () => {
    locked = document.pointerLockElement === canvas;
    onLockChange(locked);
  });

  // The overlay covers the canvas, so listen for clicks anywhere — except on
  // .nolock UI like the inventory panel, which needs its own mouse.
  document.addEventListener("click", (e) => {
    if (locked || (e.target as HTMLElement).closest?.(".nolock")) return;
    canvas.requestPointerLock();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  });
}

export function isDown(code: string): boolean {
  return keys.has(code);
}

// Accumulated mouse movement since last call; reading clears it.
export function consumeMouse(): { dx: number; dy: number } {
  const out = { dx: mouseDX, dy: mouseDY };
  mouseDX = 0;
  mouseDY = 0;
  return out;
}

export function isLocked(): boolean {
  return locked;
}

// Edge-triggered key query — true once per physical press.
export function consumePress(code: string): boolean {
  const had = justPressed.has(code);
  justPressed.delete(code);
  return had;
}
