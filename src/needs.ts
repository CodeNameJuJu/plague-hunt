import {
  BREAD_RESTORE,
  EXHAUST_DAMAGE,
  FATIGUE_RATE,
  FATIGUE_RUN_MULT,
  HUNGER_RATE,
  REGEN_RATE,
  SKIN_RESTORE,
  STARVE_DAMAGE,
  THIRST_RATE,
  WELL_RESTORE,
} from "./config";

// Basic human needs. Hunger and thirst drain over time; when either hits zero
// health bleeds away. Fed and watered, health creeps back. Fatigue is the
// fourth need — a waking day spends most of it, running spends it faster, and
// only sleep at the inn puts it back.
export interface Needs {
  health: number;
  hunger: number;
  thirst: number;
  fatigue: number;
}

export function makeNeeds(): Needs {
  return { health: 100, hunger: 90, thirst: 85, fatigue: 100 };
}

export function updateNeeds(n: Needs, dt: number, running: boolean): void {
  n.hunger = Math.max(0, n.hunger - HUNGER_RATE * dt);
  n.thirst = Math.max(0, n.thirst - THIRST_RATE * dt);
  n.fatigue = Math.max(0, n.fatigue - FATIGUE_RATE * (running ? FATIGUE_RUN_MULT : 1) * dt);

  const starving = n.hunger === 0 ? STARVE_DAMAGE : 0;
  const parched = n.thirst === 0 ? STARVE_DAMAGE : 0;
  const collapsed = n.fatigue === 0 ? EXHAUST_DAMAGE : 0;
  if (starving + parched + collapsed > 0) {
    n.health = Math.max(0, n.health - (starving + parched + collapsed) * dt);
  } else if (n.hunger > 55 && n.thirst > 55) {
    n.health = Math.min(100, n.health + REGEN_RATE * dt);
  }
}

export function eat(n: Needs): void {
  n.hunger = Math.min(100, n.hunger + BREAD_RESTORE);
}

export function drinkSkin(n: Needs): void {
  n.thirst = Math.min(100, n.thirst + SKIN_RESTORE);
}

export function drinkWell(n: Needs): void {
  n.thirst = Math.min(100, n.thirst + WELL_RESTORE);
}

export function heal(n: Needs, amount: number): void {
  n.health = Math.min(100, n.health + amount);
}
