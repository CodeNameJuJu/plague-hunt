// The character sheet — pure data for the figure builders. `sprites.ts`
// (smooth pipeline) and `pixelart.ts` (native-pixel pipeline) both dress
// from these outfits. Hem values are in 64-space (feet at 60); the pixel
// builder maps them onto its 128 grid (feet at 120).

export type RGB = [number, number, number];
export type Stance = "walk" | "stand" | "shamble";
export type ArmPose = "hang" | "fold" | "raiseR" | "hug" | "staffR" | "trayBoth" | "carryL" | "holdOutR";
export type HeadKind =
  | "none" | "hood" | "deepHood" | "cap" | "flatcap" | "wimple"
  | "kettlehelm" | "strawhat" | "kerchief" | "coif" | "bakercap" | "widowveil";
export type OverKind = "tunic" | "robe" | "gown" | "cloak" | "tabard" | "habit" | "rags";
export type PropKind =
  | "staff" | "lantern" | "basket" | "halberd" | "ledger" | "tray" | "bundle" | "bowl"
  | "spade" | "peel" | "rake" | "tankard" | "vial" | "clothbolt" | "rue" | "satchel" | "whip" | "spadeShoulder";
export type HairStyle = "crop" | "shoulder" | "bald" | "bun";

export interface Outfit {
  skin: RGB; hair?: HairStyle; hairColor?: RGB; beard?: boolean;
  age?: "young" | "mid" | "old";
  gaunt?: boolean;
  under: RGB;                   // chemise/mail showing at throat and cuffs
  hose: RGB; boots: RGB; bootHigh?: boolean; barefoot?: boolean;
  over: { kind: OverKind; color: RGB; hem: number; trim?: RGB; ragged?: boolean; patches?: boolean };
  rolledSleeves?: boolean;      // sleeves stop at the elbow, forearm bare
  cowl?: boolean;               // a hood worn down, bunched at the shoulders
  shawl?: { color: RGB; hem: number }; // a second cloth layer over the shoulders
  insignia?: RGB;               // a badge on the chest (the cordon cross)
  marks?: RGB;                  // plague marks — dark stipple on skin and cloth
  belt?: { color: RGB; buckle?: boolean; pouch?: boolean; rope?: boolean };
  apron?: { color: RGB; bib?: boolean; hem: number };
  head: { kind: HeadKind; color?: RGB };
  arms: ArmPose;
  props?: { kind: PropKind; hand: "L" | "R" }[];
  hunch?: number; // 0..0.7
}

export const HAIR_COLORS: RGB[] = [
  [38, 30, 24],    // black
  [62, 44, 30],    // dark brown
  [90, 70, 44],    // brown
  [110, 104, 96],  // iron grey
  [150, 146, 138], // white-grey
];

export const BONE: RGB = [176, 166, 146];
export const MAIL: RGB = [96, 100, 108];

// ---------------------------------------------------------------------------
// The crowd — eight dressings plus the patrolman (index 8, never spawned as
// a citizen).
export const VILLAGER_OUTFITS: Outfit[] = [
  // 0 pilgrim — mud-brown ragged robe, rope belt, hood, satchel
  { skin: [166, 128, 94], hair: "crop", hairColor: HAIR_COLORS[1], beard: true, gaunt: true, under: BONE, hose: [44, 38, 30], boots: [30, 26, 22], over: { kind: "robe", color: [74, 58, 42], hem: 52, ragged: true, patches: true }, belt: { color: [58, 44, 28], rope: true }, head: { kind: "hood", color: [54, 42, 30] }, arms: "hang", props: [{ kind: "satchel", hand: "L" }] },
  // 1 housewife — wool gown, bone kerchief, bibbed apron, basket
  { skin: [172, 134, 98], hair: "shoulder", hairColor: HAIR_COLORS[2], age: "young", under: BONE, hose: [52, 46, 38], boots: [34, 28, 22], over: { kind: "gown", color: [92, 64, 48], hem: 54 }, belt: { color: [60, 50, 36] }, apron: { color: BONE, bib: true, hem: 50 }, head: { kind: "kerchief", color: [190, 180, 160] }, arms: "carryL", props: [{ kind: "basket", hand: "L" }] },
  // 2 tradesman — russet tunic, flat cap, a bundle under the arm
  { skin: [174, 136, 100], hair: "crop", hairColor: HAIR_COLORS[2], beard: true, under: BONE, hose: [46, 40, 32], boots: [30, 26, 22], bootHigh: true, over: { kind: "tunic", color: [96, 52, 40], hem: 41, trim: [60, 34, 24] }, belt: { color: [52, 38, 24], buckle: true, pouch: true }, head: { kind: "flatcap", color: [50, 36, 28] }, arms: "carryL", props: [{ kind: "bundle", hand: "L" }] },
  // 3 beggar — grey rags, barefoot, bowl held out
  { skin: [152, 118, 88], hair: "shoulder", hairColor: HAIR_COLORS[3], age: "old", gaunt: true, under: [120, 114, 104], hose: [56, 50, 44], boots: [56, 50, 44], barefoot: true, over: { kind: "rags", color: [64, 60, 54], hem: 51, patches: true }, head: { kind: "kerchief", color: [56, 52, 46] }, arms: "holdOutR", props: [{ kind: "bowl", hand: "R" }], hunch: 0.55 },
  // 4 clerk — ink-blue gown, soft cap, ledger to the chest
  { skin: [168, 132, 98], hair: "crop", hairColor: HAIR_COLORS[0], age: "young", under: BONE, hose: [38, 34, 30], boots: [30, 26, 22], over: { kind: "gown", color: [48, 54, 78], hem: 46 }, belt: { color: [36, 32, 24] }, head: { kind: "cap", color: [40, 36, 48] }, arms: "fold", props: [{ kind: "ledger", hand: "R" }] },
  // 5 fieldhand — moss tunic, rolled sleeves, straw hat, rake
  { skin: [180, 142, 102], hair: "crop", hairColor: HAIR_COLORS[2], beard: true, under: BONE, hose: [50, 44, 34], boots: [34, 28, 20], over: { kind: "tunic", color: [62, 68, 44], hem: 41 }, rolledSleeves: true, head: { kind: "strawhat" }, arms: "staffR", props: [{ kind: "rake", hand: "R" }] },
  // 6 mourner — charcoal cloak and a hood that swallows the face
  { skin: [160, 124, 94], age: "old", gaunt: true, under: [120, 116, 118], hose: [36, 32, 32], boots: [24, 22, 20], over: { kind: "cloak", color: [46, 44, 48], hem: 56, ragged: true }, head: { kind: "deepHood", color: [38, 36, 42] }, arms: "fold", hunch: 0.3 },
  // 7 carter — oxblood tunic, hood down, whip trailing
  { skin: [170, 130, 96], hair: "crop", hairColor: HAIR_COLORS[1], beard: true, under: BONE, hose: [42, 36, 30], boots: [30, 26, 22], bootHigh: true, over: { kind: "tunic", color: [84, 42, 36], hem: 44, patches: true }, cowl: true, belt: { color: [48, 34, 22], buckle: true }, head: { kind: "none" }, arms: "hang", props: [{ kind: "whip", hand: "R" }] },
  // 8 patrolman — blue-grey tabard over mail, kettle helm, lantern
  { skin: [168, 130, 96], hair: "crop", hairColor: HAIR_COLORS[1], under: MAIL, hose: [40, 44, 50], boots: [30, 26, 22], bootHigh: true, over: { kind: "tabard", color: [62, 76, 96], hem: 45 }, belt: { color: [46, 36, 24], buckle: true }, head: { kind: "kettlehelm" }, arms: "carryL", props: [{ kind: "lantern", hand: "L" }] },
];

// ---------------------------------------------------------------------------
// The named quarter.

// Sister Marguerite — dark habit, the white wimple that makes her the
// brightest head in the quarter, hands folded. Unmistakable at distance.
export const NUN: Outfit = { skin: [170, 132, 98], under: BONE, hose: [40, 38, 46], boots: [26, 24, 30], over: { kind: "habit", color: [44, 42, 54], hem: 58 }, head: { kind: "wimple" }, arms: "fold" };

// Maître Aubert — olive robe, a full grey beard, the wide flat cap of an
// apothecary, his satchel of physick slung over one shoulder.
export const AUBERT: Outfit = { skin: [170, 132, 96], hair: "bald", hairColor: HAIR_COLORS[3], beard: true, age: "old", under: BONE, hose: [46, 40, 30], boots: [28, 24, 20], over: { kind: "robe", color: [78, 66, 40], hem: 54 }, belt: { color: [52, 38, 24] }, head: { kind: "flatcap", color: [52, 46, 30] }, arms: "hang", props: [{ kind: "satchel", hand: "L" }] };

// Foulques the gravedigger — drab and broad, soil-stained apron, a spade
// carried over the shoulder like a man who never puts it down.
export const DIGGER: Outfit = { skin: [176, 136, 98], hair: "crop", hairColor: HAIR_COLORS[1], beard: true, under: BONE, hose: [44, 38, 30], boots: [28, 24, 18], bootHigh: true, over: { kind: "tunic", color: [62, 52, 38], hem: 45 }, apron: { color: [70, 58, 44], hem: 50 }, belt: { color: [44, 34, 22] }, head: { kind: "flatcap", color: [40, 34, 26] }, arms: "staffR", props: [{ kind: "spadeShoulder", hand: "R" }] };

// Widow Lambert — black mourning veil over the face, grey bun pinned up.
export const WIDOW: Outfit = { skin: [162, 126, 96], hair: "bun", hairColor: HAIR_COLORS[3], age: "old", under: BONE, hose: [38, 34, 36], boots: [26, 24, 24], over: { kind: "gown", color: [56, 44, 50], hem: 56 }, belt: { color: [40, 34, 38] }, head: { kind: "widowveil" }, arms: "fold" };

// Provost's cordon guard — drab tabard with a red cross over mail, kettle
// helm, the halberd shouldered. Reads as a different unit from the patrol.
export const GUARD: Outfit = { skin: [166, 128, 94], hair: "crop", hairColor: HAIR_COLORS[1], under: MAIL, hose: [38, 42, 48], boots: [28, 24, 20], bootHigh: true, over: { kind: "tabard", color: [70, 64, 52], hem: 45 }, insignia: [120, 40, 36], belt: { color: [44, 34, 22], buckle: true }, head: { kind: "kettlehelm" }, arms: "staffR", props: [{ kind: "halberd", hand: "R" }] };

// The innkeep — russet gown, bibbed white apron, a tankard always in hand.
export const INNKEEP: Outfit = { skin: [172, 134, 98], hair: "shoulder", hairColor: HAIR_COLORS[2], age: "young", under: BONE, hose: [52, 44, 36], boots: [32, 26, 20], over: { kind: "gown", color: [96, 52, 40], hem: 54 }, belt: { color: [60, 40, 28] }, apron: { color: [196, 188, 168], bib: true, hem: 52 }, head: { kind: "kerchief", color: [210, 204, 190] }, arms: "carryL", props: [{ kind: "tankard", hand: "R" }] };

// The baker — flour-white apron over tan, the peel raised.
export const BAKER: Outfit = { skin: [178, 140, 104], hair: "crop", hairColor: HAIR_COLORS[2], age: "young", under: BONE, hose: [50, 44, 34], boots: [30, 26, 22], over: { kind: "tunic", color: [92, 78, 60], hem: 47 }, rolledSleeves: true, belt: { color: [64, 48, 32] }, apron: { color: [202, 196, 180], hem: 52 }, head: { kind: "bakercap" }, arms: "raiseR", props: [{ kind: "peel", hand: "R" }] };

// The alchemist — midnight robe with gold trim, iron-grey hair, a vial
// of something green held out for inspection.
export const ALCHEMIST: Outfit = { skin: [158, 128, 98], hair: "shoulder", hairColor: HAIR_COLORS[3], beard: true, age: "old", gaunt: true, under: [140, 130, 120], hose: [30, 28, 34], boots: [22, 20, 26], over: { kind: "robe", color: [36, 38, 52], hem: 57, trim: [150, 120, 60] }, belt: { color: [44, 36, 28], pouch: true }, head: { kind: "cap", color: [30, 30, 40] }, arms: "holdOutR", props: [{ kind: "vial", hand: "R" }], hunch: 0.15 };

// A plague patient — grey-pale, barefoot in rags, hugging the buboes.
export const PATIENT: Outfit = { skin: [186, 172, 152], hair: "crop", hairColor: HAIR_COLORS[1], gaunt: true, under: [200, 194, 180], hose: [100, 96, 88], boots: [168, 156, 138], barefoot: true, over: { kind: "rags", color: [116, 110, 100], hem: 52 }, head: { kind: "none" }, arms: "hug", hunch: 0.45, marks: [90, 40, 50] };

// The grey man — barely a person, two dim eyes inside a deep hood.
export const HOODED: Outfit = { skin: [24, 22, 28], under: [50, 48, 56], hose: [40, 38, 44], boots: [30, 28, 34], over: { kind: "cloak", color: [58, 56, 64], hem: 58, ragged: true }, head: { kind: "deepHood", color: [66, 64, 74] }, arms: "hang" };

// The herbwife — moss gown and darker apron, a sprig of rue held out.
export const HERBWIFE: Outfit = { skin: [172, 136, 98], hair: "bun", hairColor: HAIR_COLORS[3], age: "old", under: BONE, hose: [44, 40, 34], boots: [30, 26, 20], over: { kind: "gown", color: [58, 70, 46], hem: 52 }, belt: { color: [50, 40, 26] }, apron: { color: [62, 58, 40], hem: 48 }, head: { kind: "kerchief", color: [84, 94, 70] }, arms: "holdOutR", props: [{ kind: "rue", hand: "R" }] };

// The clothier — madder tunic with pale trim, a bolt of linen on the arm.
export const CLOTHIER: Outfit = { skin: [174, 134, 98], hair: "crop", hairColor: HAIR_COLORS[0], age: "young", under: BONE, hose: [44, 38, 34], boots: [30, 26, 22], over: { kind: "tunic", color: [88, 44, 42], hem: 47, trim: [160, 140, 110] }, belt: { color: [56, 40, 26], buckle: true, pouch: true }, head: { kind: "flatcap", color: [52, 40, 34] }, arms: "carryL", props: [{ kind: "clothbolt", hand: "L" }] };

// The monger — brown tunic under a leather apron, tray of goods held up.
export const MONGER: Outfit = { skin: [176, 138, 100], hair: "crop", hairColor: HAIR_COLORS[2], beard: true, under: BONE, hose: [46, 40, 32], boots: [32, 26, 20], over: { kind: "tunic", color: [78, 60, 40], hem: 46 }, apron: { color: [74, 52, 34], hem: 50 }, head: { kind: "flatcap", color: [52, 40, 30] }, arms: "trayBoth", props: [{ kind: "tray", hand: "R" }] };

// Dame Anette — patched mauve gown under a shawl, white-grey bun.
export const ANETTE: Outfit = { skin: [168, 130, 96], hair: "bun", hairColor: HAIR_COLORS[4], age: "old", under: BONE, hose: [46, 42, 40], boots: [30, 26, 22], over: { kind: "gown", color: [72, 60, 64], hem: 52, patches: true }, shawl: { color: [60, 50, 54], hem: 36 }, head: { kind: "none" }, arms: "fold" };

// A plague victim that got back up. Hooded, hunched, grey-green.
export const SHAMBLER: Outfit = { skin: [96, 108, 88], under: [60, 66, 60], hose: [40, 46, 42], boots: [96, 108, 88], barefoot: true, over: { kind: "rags", color: [34, 38, 36], hem: 54, ragged: true }, head: { kind: "deepHood", color: [27, 31, 29] }, arms: "hang", marks: [52, 62, 46] };
