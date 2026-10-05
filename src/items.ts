import type { ItemId } from "./types";

// The item registry — every carryable thing, its display name, the sprite
// used for its icon and world pickup, and what kind of thing it is.
export interface ItemDef {
  id: ItemId;
  name: string;
  icon: string; // sprite kind used for icon + pickup
  type: "food" | "drink" | "material" | "heal" | "quest";
  // For usable types — what they restore.
  restore?: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  bread: { id: "bread", name: "dark bread", icon: "bread", type: "food", restore: 34 },
  skin: { id: "skin", name: "waterskin", icon: "skin", type: "drink", restore: 40 },
  planks: { id: "planks", name: "planks", icon: "planks", type: "material" },
  cloth: { id: "cloth", name: "linen cloth", icon: "cloth", type: "material" },
  bandage: { id: "bandage", name: "bandage", icon: "bandage", type: "heal", restore: 32 },
  rue: { id: "rue", name: "rue sprig", icon: "rue", type: "material" },
  leeches: { id: "leeches", name: "leech jar", icon: "leeches", type: "material" },
  specimen: { id: "specimen", name: "the specimen", icon: "specimen", type: "quest" },
  cure: { id: "cure", name: "the cure", icon: "cure", type: "quest" },
};

// What the shops stock — seller id → wares with prices in sous.
export interface ShopWare {
  item: ItemId;
  price: number;
}

export const SHOPS: Record<string, ShopWare[]> = {
  baker: [{ item: "bread", price: 3 }],
  innkeep: [
    { item: "bread", price: 4 },
    { item: "skin", price: 3 },
    { item: "planks", price: 3 },
  ],
  aubert: [
    { item: "bandage", price: 4 },
    { item: "cloth", price: 2 },
    { item: "skin", price: 3 },
  ],
  // The market stalls — daylight hours only, the sellers pack up at dusk.
  herb: [
    { item: "rue", price: 5 },
    { item: "leeches", price: 6 },
    { item: "bandage", price: 5 },
  ],
  cloth: [
    { item: "cloth", price: 2 },
    { item: "bandage", price: 5 },
  ],
  monger: [
    { item: "bread", price: 4 },
    { item: "skin", price: 3 },
  ],
};

// The provost pays the doctor's stipend — collected at the gate, once a day.
export const STIPEND = 10;
