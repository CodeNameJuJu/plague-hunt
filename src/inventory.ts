import { PLANK_PICKUP } from "./config";
import { ITEMS } from "./items";
import type { ItemDef } from "./items";
import { drinkSkin, eat, heal } from "./needs";
import type { Needs } from "./needs";
import type { ItemId, PickupKind } from "./types";

// What the player carries: item stacks and a purse of sous. No weapons, no
// armour — the doctor's work is done with hands, eyes and a journal.
export interface Inventory {
  items: Partial<Record<ItemId, number>>;
  sous: number;
}

export function makeInventory(): Inventory {
  return { items: { bread: 1, skin: 1 }, sous: 5 };
}

export function count(inv: Inventory, id: ItemId): number {
  return inv.items[id] ?? 0;
}

export function addPickup(inv: Inventory, kind: PickupKind): void {
  inv.items[kind] = count(inv, kind) + (kind === "planks" ? PLANK_PICKUP : 1);
}

// Carried stacks, for the panel list — skips empties.
export function carried(inv: Inventory): { def: ItemDef; n: number }[] {
  return (Object.keys(ITEMS) as ItemId[])
    .filter((id) => count(inv, id) > 0)
    .map((id) => ({ def: ITEMS[id], n: count(inv, id) }));
}

// eat / drink / heal — false when there's none in the pack.
export function useItem(inv: Inventory, n: Needs, id: ItemId): boolean {
  if (count(inv, id) <= 0) return false;
  const def = ITEMS[id];
  if (def.type === "food") eat(n);
  else if (def.type === "drink") drinkSkin(n);
  else if (def.type === "heal") heal(n, def.restore ?? 0);
  else return false;
  inv.items[id] = count(inv, id) - 1;
  return true;
}

// Simple remedies the doctor can still make himself.
export interface Recipe {
  out: ItemId;
  n: number;
  needs: [ItemId, number][];
}

export const RECIPES: Recipe[] = [
  { out: "bandage", n: 1, needs: [["cloth", 2]] },
];

export function canCraft(inv: Inventory, r: Recipe): boolean {
  return r.needs.every(([id, n]) => count(inv, id) >= n);
}

export function craft(inv: Inventory, r: Recipe): boolean {
  if (!canCraft(inv, r)) return false;
  for (const [id, n] of r.needs) inv.items[id] = count(inv, id) - n;
  inv.items[r.out] = count(inv, r.out) + r.n;
  return true;
}
