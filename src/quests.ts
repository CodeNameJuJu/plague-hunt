import type { Inventory } from "./inventory";
import { count } from "./inventory";
import { STIPEND } from "./items";
import type { Deduction } from "./clues";
import { deduced, grantClue, hasClue } from "./clues";

// The commission. Paris, 1348 — the east quarter is sealed behind the cordon,
// and the provost has sent for a plague doctor. The story moves in beats:
//
//   arrival    — report to Provost Gérard at the gate
//   commission — the gate opens; find Sister Marguerite in the pesthouse
//   work       — the daily routine: examine the patients, then the dead
//   shadow     — at night, tail the hooded figure through the quarter
//   lair       — search the shuttered shop for proof of what he does
//   reckoning  — confront the alchemist with it
//   descent    — the sewers: fetch a specimen, seal the way behind you
//   brew       — Maître Aubert brews the cure overnight
//   cure       — administer it to the pesthouse's sick
//   done       — the quarter breathes again
export type Stage =
  | "arrival"
  | "commission"
  | "work"
  | "shadow"
  | "lair"
  | "reckoning"
  | "descent"
  | "brew"
  | "cure"
  | "done";

export interface QuestNPC {
  id: string;
  name: string;
  sprite: string;
  x: number;
  y: number;
}

export interface JournalEntry {
  day: number;
  text: string;
}

export interface QuestState {
  stage: Stage;
  // Dialogue box state
  dialogOpen: boolean;
  speaker: string;
  lines: string[];
  lineIdx: number;
  topics: Topic[] | null; // interrogation menu after the lines run out
  // The casebook — evidence gathered, conclusions reached
  clues: Set<string>;
  deductions: Set<string>;
  pendingDeductions: Deduction[]; // appended to the next dialog page
  // Story flags
  gateOpen: boolean; // set when the provost lets you through — main opens it
  brewDay: number; // the day the cure will be ready (0 = not brewing)
  stipendDay: number; // last day the stipend was collected
  examined: Set<string>; // patient npc ids examined today
  cured: Set<string>; // patient npc ids given the cure
  autopsies: number; // bodies opened on the slab
  widowGifted: boolean; // the widow's bread, once only
  ledgerRead: boolean; // found the alchemist's ledger
  grateSealed: boolean; // the way below is shut
  shop: string | null; // set by talk() — main opens the named shop
  journal: JournalEntry[];
}

// An interrogation subject — listed after an NPC's lines end. Locked topics
// show as ??? with a nudge toward the evidence that would unlock them.
export interface Topic {
  label: string;
  needs?: string[]; // clue ids the player must hold
  needsDed?: string[]; // deductions the player must have reached
  hint?: string; // shown while locked — which way to look
  show?: (q: QuestState) => boolean; // hidden entirely until this holds
  run: (q: QuestState, inv: Inventory, day: number) => void;
}

export function topicAvailable(q: QuestState, t: Topic): boolean {
  return (
    (t.needs ?? []).every((n) => hasClue(q, n)) &&
    (t.needsDed ?? []).every((n) => deduced(q, n))
  );
}

export const QUEST_NPCS: QuestNPC[] = [
  { id: "provost", name: "provost gérard", sprite: "guard", x: 59.5, y: 21.5 },
  { id: "innkeep", name: "mistress hélène", sprite: "innkeep", x: 20.5, y: 4.5 },
  { id: "baker", name: "baker colin", sprite: "baker", x: 4.5, y: 4 },
  { id: "aubert", name: "maître aubert", sprite: "aubert", x: 34.5, y: 3.2 },
  { id: "nun", name: "sister marguerite", sprite: "nun", x: 66.5, y: 15.5 },
  { id: "digger", name: "foulques", sprite: "digger", x: 49.5, y: 38.5 },
  { id: "widow", name: "widow lambert", sprite: "widow", x: 19.5, y: 15 },
  { id: "alchemist", name: "the alchemist", sprite: "alchemist", x: 71.5, y: 26.5 },
  { id: "patient1", name: "the mason", sprite: "patient", x: 65.6, y: 14.6 },
  { id: "patient2", name: "the wheelwright", sprite: "patient", x: 69.5, y: 14.6 },
  { id: "patient3", name: "the candlemaker", sprite: "patient", x: 69.6, y: 16.7 },
  // The market — vendors behind the plaza's stalls while the sun is up.
  // At dusk they pack the boards and go home; the positions updateMarket
  // moves them to are inside shuttered houses, out of the streets' reach.
  { id: "herbwife", name: "the herbwife", sprite: "herbwife", x: 30.3, y: 19.3 },
  { id: "clothier", name: "the clothier", sprite: "clothier", x: 30.7, y: 24.47 },
  { id: "anette", name: "mother anette", sprite: "anette", x: 32.4, y: 24.53 },
  { id: "monger", name: "the costermonger", sprite: "monger", x: 34.62, y: 23.5 },
];

export function initQuest(): QuestState {
  return {
    stage: "arrival",
    dialogOpen: false,
    speaker: "",
    lines: [],
    lineIdx: 0,
    gateOpen: false,
    brewDay: 0,
    stipendDay: 0,
    examined: new Set(),
    cured: new Set(),
    autopsies: 0,
    widowGifted: false,
    ledgerRead: false,
    grateSealed: false,
    topics: null,
    clues: new Set(),
    deductions: new Set(),
    pendingDeductions: [],
    shop: null,
    journal: [{ day: 1, text: "arrived at the cordon. the east quarter is sealed — they have sent for a plague doctor. me." }],
  };
}

// Write a line in the quest journal, stamped with the day it happened.
export function log(q: QuestState, day: number, text: string): void {
  q.journal.push({ day, text });
}

// ---------------------------------------------------------------------------
// Found documents — readable scraps scattered through the city (see map.ts).

const LETTERS: string[][] = [
  // A mother's letter, left in a north-street house.
  [
    "henri —",
    "they sealed the quarter on thursday. your aunt was on the wrong side of it.",
    "the provost's men say a doctor has come. pray for him — and for her.",
    "— your mother",
  ],
  // The cordon order, pinned up in the church.
  [
    "by decree of the provost of paris —",
    "the east quarter is sealed. none pass the gate save the licensed physician.",
    "the sick are to be brought to the pesthouse. the dead to the carts.",
    "disorder will be answered with the rope.",
  ],
  // The gravedigger's tally, in a house by the graveyard.
  [
    "the carts go east now. they do not bring the dead to me any more.",
    "i asked the driver where they go. he put a hand on his sword.",
    "thirty years i have buried this city, and now the dead go somewhere else.",
  ],
  // A dying patient's note, on a pesthouse cot.
  [
    "they give us medicine that is not medicine.",
    "it gleams like coins in the cup and tastes of the forge.",
    "marguerite pours it away when the grey man is not watching. i saw her.",
  ],
  // The alchemist's ledger, open on his table.
  [
    "the formula still resists me. the mind is the last thing to die —",
    "and without the mind, there is no loyalty. only appetite.",
    "subject fourteen walked again after the dump. i do not go down there now.",
    "the patron grows impatient. an obedient instrument, he said, for the long road to arras. he did not say it twice.",
  ],
  // A dumped page, drifting in the cistern.
  [
    "…paid the provost's man to look away. twice now the bodies have moved after the dumping.",
    "i do not go down after the third bell.",
    "if you are reading this — do not drink the water down there. do not touch them.",
  ],
];

// Read a found letter as a dialogue page. Several letters are evidence —
// they land in the casebook as clues as they're read.
export function readLetter(q: QuestState, letter: number, day: number): void {
  const lines = LETTERS[letter];
  if (!lines) return;
  if (letter === 2) grantClue(q, day, "carts_east");
  if (letter === 3) {
    grantClue(q, day, "gleaming_cup");
    grantClue(q, day, "grey_man");
  }
  if (letter === 4 && !q.ledgerRead) {
    q.ledgerRead = true;
    log(q, day, "found the alchemist's ledger — he is making something obedient for a 'patron', and burying his failures below the streets.");
    grantClue(q, day, "patron");
  }
  if (letter === 5) {
    grantClue(q, day, "provost_paid");
    grantClue(q, day, "sewer_dead");
  }
  open(q, "a letter", lines);
}

// The autopsy — findings per body, shown hotspot by hotspot by autopsy.ts.
// Each inner array is one body's four findings (head, chest, hands, belly).
export const AUTOPSY_FINDINGS: string[][] = [
  [
    "the tongue is black — the plague's mark, as expected",
    "buboes at the neck, gone hard as plumstones",
    "the nails are stained grey — the city's dye, or something worse",
    "the blood runs thin and bright, like wine left out. odd.",
  ],
  [
    "a metallic sheen on the tongue — like coins held in the mouth",
    "no buboes at all. this was not the pestilence.",
    "the skin smells of the still — of alchemy, not fever",
    "the blood is wrong. someone has been feeding them a formula.",
  ],
];

// Open a dialog page. Any deductions that resolved since the last page are
// appended as the doctor's own conclusions — the "it falls into place" line.
function open(q: QuestState, speaker: string, lines: string[]): void {
  q.dialogOpen = true;
  q.speaker = speaker;
  q.lines = [...lines];
  for (const d of q.pendingDeductions) {
    q.lines.push(`It falls into place — ${d.name}: ${d.text}`);
  }
  q.pendingDeductions.length = 0;
  q.lineIdx = 0;
}

// The public face of open() — evidence marks and searches in interact.ts
// speak through it so pending deductions always land on the page.
export function say(q: QuestState, speaker: string, lines: string[]): void {
  open(q, speaker, lines);
}

// Conversation over — clears both the lines and any interrogation menu.
export function endDialog(q: QuestState): void {
  q.dialogOpen = false;
  q.topics = null;
}

// Tracker line for the current stage.
export function questText(q: QuestState): string {
  switch (q.stage) {
    case "arrival":
      return "report to provost gérard at the gate";
    case "commission":
      return "enter the quarter — find sister marguerite at the pesthouse";
    case "work":
      return `the day's work — examine the sick (${q.examined.size}/3) and the dead (${Math.min(q.autopsies, 1)}/1)`;
    case "shadow":
      return "at night, tail whoever walks the quarter";
    case "lair":
      return "search the shuttered shop — find out what he does";
    case "reckoning":
      return "confront the alchemist with what you know";
    case "descent":
      return "below the streets — fetch a specimen, then seal the way";
    case "brew":
      return "the specimen to aubert — he brews through the night";
    case "cure":
      return "administer the cure to the pesthouse's sick";
    case "done":
      return "the quarter breathes again — paris may yet live";
  }
}

// What an NPC says when spoken to, and any stage changes it causes. After
// the greeting lines the interrogation topics attach — the detective's real
// instrument. Evidence-gated questions sit locked until the casebook has
// what they need.
export function talk(q: QuestState, npc: QuestNPC, inv: Inventory, day: number): void {
  switch (npc.id) {
    case "provost": talkProvost(q, inv, day); break;
    case "innkeep": talkKeeper(q, "mistress hélène", "innkeep"); break;
    case "baker": talkKeeper(q, "baker colin", "baker"); break;
    case "nun": talkNun(q, day); break;
    case "aubert": talkAubert(q, inv, day); break;
    case "digger": talkDigger(q, day); break;
    case "widow": talkWidow(q, inv); break;
    case "alchemist": talkAlchemist(q, day); break;
    case "herbwife": talkKeeper(q, "the herbwife", "herb"); break;
    case "clothier": talkKeeper(q, "the clothier", "cloth"); break;
    case "monger": talkKeeper(q, "the costermonger", "monger"); break;
    case "anette": talkAnette(q); break;
    default: talkPatient(q, npc, inv, day);
  }
  const topics = topicsFor(npc.id, q);
  if (topics.length > 0) q.topics = topics;
}

function talkProvost(q: QuestState, inv: Inventory, day: number): void {
  if (q.stage === "arrival") {
    q.stage = "commission";
    q.gateOpen = true;
    inv.sous += STIPEND;
    q.stipendDay = day;
    log(q, day, "the provost opened the gate. 'the quarter is yours, doctor. do not let it out.' the stipend is paid daily at the gate.");
    open(q, "provost gérard", [
      "The beak. Good — they actually sent one.",
      "The east quarter is sealed by decree: nothing goes in, nothing comes out. The sick go to the pesthouse, the dead go to the carts, and anyone who argues goes to the rope.",
      "You're licensed — the gate is yours. Sister Marguerite runs the pesthouse; she'll show you the work. Mistress Hélène keeps a room for you at the inn, west end of the north street.",
      "Your stipend is paid here, once a day. Ten sous — spend it in the free quarter; the sealed side has nothing but trouble.",
      "One rule, doctor. Whatever you see in there — it stays in there.",
    ]);
  } else if (day > q.stipendDay) {
    q.stipendDay = day;
    inv.sous += STIPEND;
    open(q, "provost gérard", [
      `The day's stipend — ${STIPEND} sous. The crown pays for a doctor, not a holiday.`,
    ]);
  } else if (q.stage === "done") {
    open(q, "provost gérard", [
      "The ward's quiet and the carts aren't running. Whatever you did, the decree stands — the quarter stays sealed until the king's men say otherwise.",
      "But between you and me, doctor — the city owes you.",
    ]);
  } else {
    open(q, "provost gérard", [
      "Already paid today, doctor. Spend it on bread, not trouble.",
    ]);
  }
}

// Shopkeepers — a line of greeting, then the shop opens.
function talkKeeper(q: QuestState, name: string, shop: string): void {
  const hello: Record<string, string[]> = {
    innkeep: [
      "Doctor! Your room's ready — up the stairs, first door of the loft. The desk's yours for your journal; the bed's yours whenever you want dawn to come quicker.",
      "Bread and skins are four and three sous if you're short of either.",
    ],
    baker: [
      "Fresh batch just out — three sous a loaf, and worth double that in a week like this.",
      "Buy what you need, doctor. Somebody has to feed this city.",
    ],
    aubert: ["Remedies and linen, doctor. Take what the work calls for."],
    // The market stalls — cheaper than the shops, but only while the sun's up.
    herb: [
      "Rue for the smoke-fires, leeches for the barber's bowl, bandages for whatever the quarter sends you home with.",
      "The graveyard grows rue free, mind — I'd be a poor tradeswoman if I didn't say it. But you'll dig it yourself, over the graves.",
    ],
    cloth: [
      "Clean linen, twice-boiled — bandage-weight, doctor. Aubert boils his the same and charges you for the privilege.",
    ],
    monger: [
      "Bread's fresher than Colin's queue and the skins don't leak. Four sous the loaf, three the skin — market prices, no fuss.",
    ],
  };
  open(q, name, hello[shop]);
  q.shop = shop;
}

// Mother Anette — no counter, just the rags stall and everything the quarter
// whispers about. Her gossip is free; some of it is even true.
function talkAnette(q: QuestState): void {
  open(q, "mother anette", [
    "Sit a moment, doctor — the boards don't mind. Everyone comes past Anette's sooner or later.",
    "East side? Sealed like a coffin, dear. They say the sick wail at the pesthouse till the sisters dose them quiet. My own boy was in there when the stakes went up — they'll not let me to him.",
    "The watch walks all night now, lanterns and all. They keep the cordon, not the peace — a body can be robbed blind two streets over and the patrols won't look twice.",
    "You watch that plaza well, doctor. The fouling on its rope isn't God's work — someone hauled that bucket up heavy and in a hurry.",
  ]);
}

function talkNun(q: QuestState, day: number): void {
  if (q.stage === "commission") {
    q.stage = "work";
    log(q, day, "sister marguerite runs the pesthouse alone — three cots of the sick and one slab for the dead. the work: examine the living, then the dead.");
    open(q, "sister marguerite", [
      "So you're the one they sent. God keep you, doctor — you'll need Him in here.",
      "The ward is simple work: the sick on the cots, the dead on the slab. Examine them all — the living and the dead — and note everything. The plague has patterns.",
      "Your journal at the inn is where the truth lives. Write it down as you find it.",
      "Begin when you're ready. The mason, the wheelwright, the candlemaker — and the poor soul on the slab who can no longer tell me his name.",
    ]);
  } else if (q.stage === "work") {
    const worked = q.examined.size >= 3 && q.autopsies >= 1;
    // The shadow beat is earned by deduction — the casebook has to hold a
    // conclusion about the ward before Marguerite names the grey man. Given
    // long enough she tells you anyway; the evidence just gets you there
    // sooner, and knowing why.
    const suspicious =
      deduced(q, "d_poison") || deduced(q, "d_night") || day >= 5;
    if (worked && day >= 3 && suspicious) {
      q.stage = "shadow";
      grantClue(q, day, "grey_man");
      log(q, day, "the dead man on the slab bled bright and thin — not right. and the patients' medicine 'gleams like coins'. marguerite sees it too: someone walks the quarter at night.");
      open(q, "sister marguerite", [
        "You've seen it then — the blood that runs thin, the medicine that gleams. I have poured enough of it into the gutter to know.",
        "There is a man in grey who comes through the quarter at night. The patients call him the grey man — he brings the 'medicine', and they stop asking questions after they take it.",
        "Tonight, after dusk, watch the gate street. See where he goes. I would follow him myself but the ward cannot lose me.",
      ]);
    } else if (worked) {
      open(q, "sister marguerite", [
        day >= 3
          ? "You've done the work — but has it told you anything yet? Write down what doesn't fit, doctor. The cups, the blood, the graves, the carts. The pieces want putting together."
          : "Good eyes today — but a pattern needs more than a day, doctor. The same rounds tomorrow, and the day after. Watch for what doesn't fit.",
      ]);
    } else {
      open(q, "sister marguerite", [
        `The work isn't done, doctor — ${3 - q.examined.size} of the sick and ${1 - q.autopsies} of the dead still wait for your eyes.`,
        "The living are on the cots. The dead are on the slab. Note everything.",
      ]);
    }
  } else if (q.stage === "shadow") {
    open(q, "sister marguerite", [
      "Dusk, doctor — he walks after dark. Follow him, but do not let him see the beak.",
    ]);
  } else if (q.stage === "cure") {
    open(q, "sister marguerite", [
      "Give it to them — all three. If this physic is true, we will know by morning.",
    ]);
  } else if (q.stage === "done") {
    open(q, "sister marguerite", [
      "The fever broke in all three before matins. I have buried too many to call this anything but grace.",
      "Rest now, doctor. Your journal will remember what the city forgets.",
    ]);
  } else {
    open(q, "sister marguerite", [
      "God keep you in the dark places, doctor. Someone in this city has to go where the truth is.",
    ]);
  }
}

function talkPatient(q: QuestState, npc: QuestNPC, inv: Inventory, day: number): void {
  // Administering the cure — one dose per patient, all three for the win.
  if (q.stage === "cure" && count(inv, "cure") > 0) {
    if (q.cured.has(npc.id)) {
      open(q, npc.name, ["He has his dose. Now we wait for morning."]);
      return;
    }
    q.cured.add(npc.id);
    open(q, npc.name, [
      "You lift his head and tip the physic past his lips — the colour of sunrise, and it smells of nothing at all.",
      "He swallows. For the first time in days, his eyes follow the beak instead of the wall.",
      q.cured.size >= 3
        ? "That was the last of them. Now — pray it holds."
        : `${3 - q.cured.size} still wait for theirs.`,
    ]);
    if (q.cured.size >= 3) {
      q.stage = "done";
      log(q, day, "gave the cure to all three patients. by morning the fever broke in every one of them. the quarter breathes again.");
    }
    return;
  }
  const lines: Record<string, string[]> = {
    patient1: [
      "The mason coughs wetly. Buboes at his neck, hard as plumstones — plague, plainly.",
      "\"They bring me a cup at night, doctor. Shines like coins in the dark. Then the dreams come — walking dreams.\"",
    ],
    patient2: [
      "The wheelwright's skin is waxy, his pulse thin and quick.",
      "\"Grey man comes when the bells stop. Puts the cup to your lips himself. Tastes of the forge, doctor — metal, not medicine.\"",
    ],
    patient3: [
      "The candlemaker is fevered but watches you with clear eyes.",
      "\"Sister pours my cup away when he isn't watching. I pretend to sleep. I'm the only one who still asks questions.\"",
    ],
  };
  if (q.examined.has(npc.id)) {
    open(q, npc.name, ["He is too weak for more talk today."]);
    return;
  }
  q.examined.add(npc.id);
  // Their testimony is evidence — the cup that gleams, the man who brings it.
  if (npc.id === "patient1" || npc.id === "patient3") grantClue(q, day, "gleaming_cup");
  if (npc.id === "patient2") grantClue(q, day, "grey_man");
  open(q, npc.name, lines[npc.id] ?? ["The patient coughs weakly."]);
}

function talkAubert(q: QuestState, inv: Inventory, day: number): void {
  // Brewing check first — if the cure's ready, hand it over.
  if (q.brewDay > 0 && day >= q.brewDay && q.stage === "brew") {
    inv.items.cure = count(inv, "cure") + 1;
    q.stage = "cure";
    log(q, day, "aubert's cure is ready — the colour of sunrise. administer it to the three patients in the pesthouse.");
    open(q, "maître aubert", [
      "It held — the colour of sunrise, and I half expected it to turn to tar.",
      "Take it to the pesthouse and get it into all three of them. If their bodies remember how to fight, this will teach them what to fight.",
    ]);
    return;
  }
  if (q.brewDay > 0 && q.stage === "brew") {
    open(q, "maître aubert", [
      "Not yet — the tincture still steeps. Come back when the sun is up on a new day.",
    ]);
    return;
  }
  if (q.stage === "brew") {
    const spec = count(inv, "specimen");
    const rue = count(inv, "rue");
    const leech = count(inv, "leeches");
    if (spec >= 1 && rue >= 3 && leech >= 2) {
      inv.items.specimen = spec - 1;
      inv.items.rue = rue - 3;
      inv.items.leeches = leech - 2;
      q.brewDay = day + 1;
      log(q, day, "gave aubert the specimen, rue and leeches. he brews through the night — cure ready at dawn.");
      open(q, "maître aubert", [
        "Bring it here — carefully. That murk in the jar is the whole answer, whatever it is.",
        "Rue over the graves, leeches from the well — you found them, good. Now stand back from the alembic. The tincture steeps a full night; pull it early and it's poison.",
        "Return at first light. If this formula undoes what he's been feeding them, you'll hold the cure for an entire quarter.",
      ]);
      return;
    }
    open(q, "maître aubert", [
      `I need the specimen — you carry ${spec} — plus 3 rue sprigs (${rue} carried) and 2 leech jars (${leech} carried).`,
      "Rue grows over the graveyard graves. The leech jars are beside the plaza well.",
    ]);
    return;
  }
  if (q.stage === "cure") {
    open(q, "maître aubert", [
      "The cure went with you — get it into them before the fever takes what remains.",
    ]);
    return;
  }
  // No quest business — he's a shopkeeper.
  q.shop = "aubert";
  open(q, "maître aubert", [
    "Remedies and linen, doctor. Take what the work calls for.",
  ]);
}

function talkDigger(q: QuestState, day: number): void {
  if (q.stage === "lair" || q.stage === "reckoning") {
    grantClue(q, day, "carts_east");
    open(q, "foulques", [
      "The carts, you mean? Aye — I see them at night, going east. They do not bring the dead to me any more.",
      "Thirty years I've buried this city. Now the dead go somewhere else — down, if the rumour's true. Down where the water is.",
      "I do not ask. Men with swords do the asking in this city now.",
    ]);
  } else if (q.stage === "done") {
    open(q, "foulques", [
      "The carts are coming back to me again. Real graves, real dead — I never thought I'd be glad of it.",
    ]);
  } else {
    grantClue(q, day, "carts_east");
    open(q, "foulques", [
      "You're the beak-man they let through the gate. I'd keep my distance — I bury what the city throws away.",
      "Seventy a day, some weeks. But the dead stopped coming to me — the carts go east now, and a man with a sword rides with them.",
    ]);
  }
}

function talkWidow(q: QuestState, inv: Inventory): void {
  if (!q.widowGifted) {
    q.widowGifted = true;
    inv.items.bread = count(inv, "bread") + 2;
    open(q, "widow lambert", [
      "A doctor — oh, thank God. Sit, sit. My Henri is in the quarter. Was in the quarter. They took him to the pesthouse on thursday.",
      "They will not let me through the gate. Ten sous of bread I have baked him, and it rots on my table.",
      "Take it — take it to him if you can. If he's on the slab, doctor, do not tell me. Let me keep the knocking at my door a while longer.",
    ]);
  } else if (q.stage === "done") {
    open(q, "widow lambert", [
      "Henri sent word through the provost's man — he's walking again. Whatever you did in there, it reached him. Bless you, doctor.",
    ]);
  } else {
    open(q, "widow lambert", [
      "Any word of Henri? No — you would have told me. The bread's still on the table, doctor. It keeps.",
    ]);
  }
}

function talkAlchemist(q: QuestState, day: number): void {
  if (q.stage === "lair") {
    if (!q.ledgerRead) {
      open(q, "the alchemist", [
        "A doctor. In my shop. How the quarter climbs.",
        "I am an apothecary, same as your friend on the north street — remedies for the sick, tonics for the dying. Nothing here that should interest you.",
        "Unless you have already been through my things, of course. In which case — well. Doors are hard to find in the dark, aren't they.",
      ]);
    } else {
      q.stage = "reckoning";
      grantClue(q, day, "patron");
      log(q, day, "confronted the alchemist with his ledger. the truth, at last: a formula to hollow a man out — a loyal instrument for a patron — and the failures dumped in the sewers.");
      open(q, "the alchemist", [
        "You read the ledger. Then you know the shape of it — a draught that takes everything but obedience. A man you can aim at a king.",
        "The patron pays in gold and patience, and I am out of both. Every batch fails the same way: the mind dies last, and what is left has no loyalty — only appetite.",
        "So I give it to the sick. The dying are free subjects, doctor — they take the cup gladly, and when they die, the bodies go down. Below. Where the water carries the evidence.",
        "You think me a murderer. I think of myself as almost brilliant. We are both wrong, lately.",
      ]);
    }
  } else if (q.stage === "reckoning") {
    q.stage = "descent";
    log(q, day, "he confessed — and stopped. the failed subjects went into the sewers; the specimen for the cure is down there with them. and the dead do not stay still down there.");
    open(q, "the alchemist", [
      "You want me to stop. You, a stranger in a mask — you want me to stop.",
      "…I have already stopped. Fourteen subjects, and the last one looked at me with his mother's eyes before he died. I am done. The patron can hang me, or you can cure them — I cannot do both.",
      "If you truly mean to brew a physic for the quarter, you'll need a specimen of what I gave them — the pure stuff, the formula before the body ruins it.",
      "It's below. In the pit, with the rest of my mistakes. Take a lantern, doctor — and do not touch anything that moves down there. Some of them move.",
      "If the streets turn bad while you're gone — timber holds a shut door. The dead carts shed planks all over the quarter.",
    ]);
  } else if (q.stage === "descent") {
    open(q, "the alchemist", [
      "The grate in the alley behind my shop. Down the shaft, follow the gallery west — the pit is where the water pools.",
      "Seal it behind you when you leave. Whatever is down there — do not let it reach the streets.",
    ]);
  } else if (q.stage === "done") {
    open(q, "the alchemist", [
      "You did what my formula never could — you gave them back their fight. The patron will look for another instrument; he always does.",
      "I keep the shop shuttered now. Some doors, once opened, are hard to close. You would know.",
    ]);
  } else {
    // Before the player knows what he is — cold and dismissive.
    open(q, "the alchemist", [
      "The shop is closed. The quarter is closed. Everything worthwhile is closed.",
      "Buy your remedies from the man on the north street like everyone else.",
    ]);
  }
}

// ---------------------------------------------------------------------------
// Interrogation — what you can press each soul about, once you hold the
// evidence that makes the question worth asking. Locked topics tell the
// player which way the missing piece lies; that's the detective loop.

const past = (stage: Stage) => (q: QuestState) =>
  STAGE_ORDER_FOR_TOPICS.indexOf(q.stage) >= STAGE_ORDER_FOR_TOPICS.indexOf(stage);
const STAGE_ORDER_FOR_TOPICS = [
  "arrival", "commission", "work", "shadow", "lair",
  "reckoning", "descent", "brew", "cure", "done",
];

function topicsFor(npcId: string, q: QuestState): Topic[] {
  const all: Record<string, Topic[]> = {
    provost: [
      {
        label: "ask about the dead carts",
        needs: ["carts_east"],
        hint: "you know the carts run east — but not what to say about it",
        run: (qq, _inv, day) => {
          grantClue(qq, day, "provost_paid");
          open(qq, "provost gérard", [
            "Carts? The carts run where the decree sends them, doctor.",
            "His hand finds his purse before it finds his sword. Interesting reflex for a man with nothing to hide.",
            "Best keep your questions for the sick. They're the ones who need your science.",
          ]);
        },
      },
      {
        label: "press him on the patron's coin",
        needsDed: ["d_patron"],
        hint: "you'd need to prove the coin reaches this gate",
        run: (qq) =>
          open(qq, "provost gérard", [
            "The colour drains out of him for half a breath — then the garrison mask slides back on.",
            "\"Careful, doctor. There are names in this city that get men buried in other men's graves. Go cure your sick and forget you heard one.\"",
          ]),
      },
      {
        label: "ask what passes the gate",
        show: past("commission"),
        run: (qq) =>
          open(qq, "provost gérard", [
            "Nothing passes that isn't you, doctor — food carts in at dawn, dead carts out at dusk. Officially.",
            "Anything else that moves through my quarter moves through my ledgers first.",
          ]),
      },
    ],
    nun: [
      {
        label: "the medicine that gleams",
        needs: ["gleaming_cup"],
        hint: "you'd need to have seen what they pour down these throats",
        show: past("work"),
        run: (qq, _inv, day) => {
          grantClue(qq, day, "grey_man");
          open(qq, "sister marguerite", [
            "You've seen it then. It comes in his cup — the grey man's — and it goes down their throats unless I'm standing over them.",
            "I pour it in the gutter when he isn't watching. God forgive me for the nights I slept through.",
          ]);
        },
      },
      {
        label: "the grey man",
        needs: ["grey_man"],
        hint: "a name you haven't heard yet",
        show: past("work"),
        run: (qq) =>
          open(qq, "sister marguerite", [
            "He comes when the bells stop — never by day, never when the provost's men are looking.",
            qq.stage === "shadow"
              ? "Tonight, doctor. Watch the gate street after dusk and follow where he goes."
              : "Ask the patients about his cup. Ask Foulques where the dead go now. Then you'll have something worth following.",
          ]),
      },
      {
        label: "the day's work",
        show: past("work"),
        run: (qq) =>
          open(qq, "sister marguerite", [
            `The sick on the cots — ${qq.cured.size > 0 ? "recovering, God be praised" : `${qq.examined.size} seen today`} — and the dead on the slab.`,
            "Read them like scripture, doctor. What doesn't fit is the verse that matters.",
          ]),
      },
    ],
    digger: [
      {
        label: "the shallow graves",
        needs: ["shallow_graves"],
        hint: "you'd need to have looked at his churchyard closely",
        run: (qq) =>
          open(qq, "foulques", [
            "Aye, you've a graveyard eye. Those aren't my digging — thirty years and I've never left a man half-covered.",
            "Dug in a hurry, in the dark, by someone who wanted them found shallow. Or someone who ran out of night.",
          ]),
      },
      {
        label: "where the dead go now",
        show: past("commission"),
        run: (qq, _inv, day) => {
          grantClue(qq, day, "carts_east");
          open(qq, "foulques", [
            "East, past the wall of shops, down into the wet dark if the rumours are true.",
            "A man with a sword rides with the carts now. Not the provost's colours — plainer, and somehow worse.",
          ]);
        },
      },
    ],
    widow: [
      {
        label: "ask about henri",
        run: (qq) =>
          open(qq, "widow lambert", [
            "Henri mended wheels on the south street — a wheelwright, the best pair of hands in the quarter.",
            qq.cured.size > 0
              ? "They say he's walking in the pesthouse garden. Walking! I'll bake for you both till the flour runs out."
              : "If he's on a cot, tell him I'm still baking. If he's on the slab — don't tell me at all.",
          ]),
      },
    ],
    alchemist: [
      {
        label: "the ledger",
        needs: ["patron"],
        hint: "you'd need to have read what he writes",
        show: past("lair"),
        run: (qq) =>
          open(qq, "the alchemist", [
            "The patron pays in gold and patience — and I am out of both, as I said.",
            "A name? He has none, or a hundred. Men who buy assassins do not sign receipts, doctor.",
          ]),
      },
      {
        label: "the straps on his table",
        needs: ["restraints"],
        hint: "you'd need to have seen his workshop closely",
        show: past("lair"),
        run: (qq) =>
          open(qq, "the alchemist", [
            "For the subjects, yes. The formula takes the legs before the will — the willing still thrash.",
            "Do not look at me like that. They were dying already; I merely gave their dying a direction.",
          ]),
      },
      {
        label: "what waits below",
        needs: ["sewer_dead"],
        hint: "you'd have to have seen the pit yourself",
        show: past("descent"),
        run: (qq) =>
          open(qq, "the alchemist", [
            "Then you know. The failed batches do not rest — the formula keeps the flesh moving when the mind is gone.",
            "Seal it behind you, doctor. I dumped fourteen men into that dark, and I'd rather they stayed there.",
          ]),
      },
    ],
  };
  return (all[npcId] ?? []).filter((t) => !t.show || t.show(q));
}
