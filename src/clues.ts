// The casebook — the detective spine of the game. Evidence is gathered from
// the world (examine marks), from documents, from autopsies and from pressing
// the right people on the right subjects. When the right pieces of evidence
// sit together, a deduction resolves itself and the story moves — the player
// finds the truth by gathering it, not by walking a script.

import type { ItemId } from "./types";
import { log } from "./quests";
import type { QuestState } from "./quests";

// ---------------------------------------------------------------------------
// Evidence — everything the casebook can hold.

export interface ClueDef {
  id: string;
  name: string; // casebook label
  text: string; // what the doctor makes of it
}

export const CLUES: Record<string, ClueDef> = {
  thin_blood: {
    id: "thin_blood",
    name: "the thin blood",
    text: "a plague corpse with black tongue and hard buboes — but the blood ran thin and bright, and the nails were stained grey. plague does not stain nails.",
  },
  formula_blood: {
    id: "formula_blood",
    name: "the wrong blood",
    text: "no buboes. a metal sheen on the tongue, skin smelling of the still. this man did not die of the pestilence — he died of something fed to him.",
  },
  gleaming_cup: {
    id: "gleaming_cup",
    name: "the gleaming cup",
    text: "the sick are dosed at night from cups that gleam like coins. whatever it is, it is not medicine.",
  },
  grey_man: {
    id: "grey_man",
    name: "the grey man",
    text: "a man in grey works the ward after dark, cup in hand. they call him that and stop asking questions after they drink.",
  },
  carts_east: {
    id: "carts_east",
    name: "the dead go east",
    text: "the dead carts no longer come to the graveyard. they go east at night — and a man with a sword rides with them.",
  },
  well_foul: {
    id: "well_foul",
    name: "the fouled well",
    text: "the well water smells faintly of the grave — filth on the rope, murk in the bucket. the quarter's water is not clean.",
  },
  drag_marks: {
    id: "drag_marks",
    name: "the drag marks",
    text: "the alley mud is raked flat by something heavy, again and again — all the way to the sewer grate.",
  },
  shallow_graves: {
    id: "shallow_graves",
    name: "the shallow graves",
    text: "the newest graves sit half-deep, dug in haste or abandoned. foulques' spade did not dig these.",
  },
  restraints: {
    id: "restraints",
    name: "straps and stains",
    text: "leather straps bolted to a worktable; the floor stained in rings. the alchemist does not treat people here — he holds them.",
  },
  patron: {
    id: "patron",
    name: "a patron in the dark",
    text: "the ledger speaks of a patron who pays in gold for an 'obedient instrument'. his name is nowhere written.",
  },
  provost_paid: {
    id: "provost_paid",
    name: "silence, bought",
    text: "a provost's man rides with the dead carts and looks away. silence like that is bought at the top.",
  },
  sewer_dead: {
    id: "sewer_dead",
    name: "the dead below",
    text: "the dumped bodies in the sewers do not rest. the water down there is poison, and it is walking.",
  },
};

// ---------------------------------------------------------------------------
// Deductions — when the evidence fits, the conclusion lands on its own page.

export interface Deduction {
  id: string;
  name: string;
  needs: string[]; // clue ids required
  text: string; // the conclusion, as the doctor writes it
}

export const DEDUCTIONS: Deduction[] = [
  {
    id: "d_poison",
    name: "fed, not healed",
    needs: ["gleaming_cup", "thin_blood"],
    text: "the cups that gleam and the blood that runs thin are the same sickness — the ward is being fed, not healed.",
  },
  {
    id: "d_night",
    name: "he works by night",
    needs: ["grey_man", "carts_east"],
    text: "the grey man's rounds and the east-bound carts are one errand. someone works this quarter after dark.",
  },
  {
    id: "d_sewers",
    name: "the sewers take the evidence",
    needs: ["carts_east", "drag_marks"],
    text: "the dead are dragged through the alley and dumped below the streets. the sewers hold the evidence.",
  },
  {
    id: "d_formula",
    name: "a formula, not a fever",
    needs: ["formula_blood", "restraints"],
    text: "this is no pestilence being fought — it is a formula being tested. the dying are his subjects.",
  },
  {
    id: "d_patron",
    name: "he answers to a patron",
    needs: ["patron", "provost_paid"],
    text: "the alchemist answers to a patron whose coin reaches even the provost's men. whoever he is, he buys silence at the top.",
  },
  {
    id: "d_water",
    name: "the water carries it",
    needs: ["well_foul", "sewer_dead"],
    text: "what he dumps below seeps up into the wells — the quarter is drinking its own dead.",
  },
];

// ---------------------------------------------------------------------------
// The machinery — grantClue lands evidence and resolves any deduction it
// completes. Deductions queue onto pendingDeductions; the next dialog page
// (opened by quests.say) appends them, so the conclusion always lands right
// after the evidence that sealed it.

export function hasClue(q: QuestState, id: string): boolean {
  return q.clues.has(id);
}

export function deduced(q: QuestState, id: string): boolean {
  return q.deductions.has(id);
}

export function grantClue(q: QuestState, day: number, id: string): void {
  if (q.clues.has(id)) return;
  const c = CLUES[id];
  if (!c) return;
  q.clues.add(id);
  log(q, day, `evidence — ${c.name}: ${c.text}`);
  for (const d of DEDUCTIONS) {
    if (q.deductions.has(d.id)) continue;
    if (!d.needs.every((n) => q.clues.has(n))) continue;
    q.deductions.add(d.id);
    log(q, day, `it falls into place — ${d.name}: ${d.text}`);
    q.pendingDeductions.push(d);
  }
}

// ---------------------------------------------------------------------------
// Searchable containers — the scavenging half of the survival loop. Searched
// once, restocked at dawn; what you find is narrated like evidence.

export interface SearchSpot {
  text: string[]; // what the doctor finds, told as it happens
  items: [ItemId, number][];
  clue?: string; // some searches turn up evidence too
}

export const SEARCHES: Record<string, SearchSpot> = {
  flour_sack: {
    text: ["You dig into the flour sack — a hard crust wrapped in cloth, still good."],
    items: [["bread", 1]],
  },
  inn_chest: {
    text: ["The inn's chest — spare linen, and a waterskin patched with pitch."],
    items: [["cloth", 1], ["skin", 1]],
  },
  remedy_chest: {
    text: ["Aubert's stores — clean linen, a rolled bandage, the smell of rue."],
    items: [["cloth", 1], ["bandage", 1]],
  },
  home_chest: {
    text: ["A family's chest — folded linen, a heel of bread gone hard."],
    items: [["cloth", 1], ["bread", 1]],
  },
  ward_sack: {
    text: ["The ward's supply sack — lint and linen for the dressing of wounds."],
    items: [["cloth", 2]],
  },
  gate_sack: {
    text: ["The provost's ration sack — dark bread and a soldier's skin."],
    items: [["bread", 1], ["skin", 1]],
  },
  grey_chest: {
    text: [
      "The grey man's stores — jarred leeches, folded linen, vials too dark to open.",
      "Among the jars: one that gleams faintly even in this light. Evidence — or a warning.",
    ],
    items: [["leeches", 1], ["bandage", 1]],
    clue: "gleaming_cup",
  },
  // Timber — boards pried from carts and crates, for barricading at night.
  cart_timber: {
    text: ["The cart's bed sheds its boards — you work the soundest ones free."],
    items: [["planks", 1]],
  },
  timber_crate: {
    text: ["Splitting the crate's lid — sawn planks, still stacked and dry."],
    items: [["planks", 1]],
  },
  // The cure's makings — forage and jars, where the old texts say they live.
  rue_bed: {
    text: ["Rue rooted in the grave dirt — you strip the bitter leaves."],
    items: [["rue", 1]],
  },
  leech_jar: {
    text: ["A baited jar sunk at the well's rim — the leeches inside are fat and black."],
    items: [["leeches", 1]],
  },
  specimen_jar: {
    text: [
      "A sealed jar among the dumped dead — the thing inside still gleams faintly.",
      "This is what he fed them, before the body ruined it. The specimen.",
    ],
    items: [["specimen", 1]],
  },
};
