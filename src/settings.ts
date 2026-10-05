// Player settings and keybinds — one mutable object each, persisted to
// localStorage. Systems read them live, so menu changes apply instantly.

export interface Settings {
  sensitivity: number; // mouse-look multiplier
  fov: number; // radians
  brightness: number; // css filter on the display canvas
  grain: boolean; // film grain post effect
}

const SETTING_KEY = "plaguehunt.settings";
const BIND_KEY = "plaguehunt.binds";

export const settings: Settings = {
  sensitivity: 1,
  fov: Math.PI / 2.6,
  brightness: 1,
  grain: true,
};

export type Action =
  | "forward" | "back" | "left" | "right" | "run"
  | "interact" | "pack" | "map" | "journal" | "lantern"
  | "use1" | "use2" | "use3";

export const ACTION_LABELS: Record<Action, string> = {
  forward: "move forward",
  back: "move back",
  left: "strafe left",
  right: "strafe right",
  run: "run",
  interact: "interact",
  pack: "open pack",
  map: "city map",
  journal: "journal",
  lantern: "lantern",
  use1: "use slot 1",
  use2: "use slot 2",
  use3: "use slot 3",
};

const DEFAULT_BINDS: Record<Action, string> = {
  forward: "KeyW",
  back: "KeyS",
  left: "KeyA",
  right: "KeyD",
  run: "ShiftLeft",
  interact: "KeyE",
  pack: "Tab",
  map: "KeyM",
  journal: "KeyJ",
  lantern: "KeyL",
  use1: "Digit1",
  use2: "Digit2",
  use3: "Digit3",
};

export const binds: Record<Action, string> = { ...DEFAULT_BINDS };

try {
  Object.assign(settings, JSON.parse(localStorage.getItem(SETTING_KEY) ?? "{}"));
} catch { /* corrupted storage — fall back to defaults */ }
try {
  const saved = JSON.parse(localStorage.getItem(BIND_KEY) ?? "{}");
  for (const a of Object.keys(binds) as Action[]) {
    if (typeof saved[a] === "string") binds[a] = saved[a];
  }
} catch { /* as above */ }

export function saveSettings(): void {
  localStorage.setItem(SETTING_KEY, JSON.stringify(settings));
}

export function saveBinds(): void {
  localStorage.setItem(BIND_KEY, JSON.stringify(binds));
}

// Human-readable key name for the controls list.
export function keyName(code: string): string {
  const names: Record<string, string> = {
    Space: "space",
    ShiftLeft: "l shift",
    ShiftRight: "r shift",
    ControlLeft: "l ctrl",
    AltLeft: "l alt",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Tab: "tab",
  };
  if (names[code]) return names[code];
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return code.slice(5);
  return code.toLowerCase();
}
