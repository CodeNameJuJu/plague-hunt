import { BARRICADE_COST, BARRICADE_WALL_ID, INTERACT_RANGE } from "./config";
import { addPickup, count } from "./inventory";
import type { Inventory } from "./inventory";
import { ITEMS } from "./items";
import { drinkWell } from "./needs";
import type { Needs } from "./needs";
import type { Player } from "./player";
import { endDialog, log, readLetter, say, talk } from "./quests";
import type { QuestNPC, QuestState } from "./quests";
import { grantClue, CLUES, SEARCHES } from "./clues";
import type { GameMap, PropDef, SpriteRuntime } from "./types";

// Whatever the player is looking at and could use right now.
export interface Interaction {
  prompt: string;
  apply(): void;
}

export interface QuestCtx {
  npcs: QuestNPC[];
  state: QuestState;
}

// Services the world interactions can trigger — overlays and day mechanics
// live in main.ts; interact.ts only asks for them.
export interface InteractHooks {
  openAutopsy(): void;
  openJournal(): void;
  sleep(): void;
}

// Where each story beat sits in order — the sewer grate only opens once the
// alchemist has told you what's down there.
const STAGE_ORDER = [
  "arrival",
  "commission",
  "work",
  "shadow",
  "lair",
  "reckoning",
  "descent",
  "brew",
  "cure",
  "done",
];

export function findInteraction(
  map: GameMap,
  sprites: SpriteRuntime[],
  player: Player,
  needs: Needs,
  inv: Inventory,
  quest: QuestCtx,
  day: number,
  tday: number,
  hooks: InteractHooks
): Interaction | null {
  const dirX = Math.cos(player.angle);
  const dirY = Math.sin(player.angle);
  // The outbreak gate — timber and barricades only matter once the dead
  // walk. That's the descent: the alchemist's failures, moving below.
  const outbreak = STAGE_ORDER.indexOf(quest.state.stage) >= STAGE_ORDER.indexOf("descent");

  // A quest NPC within reach, roughly ahead — talk to them.
  for (const n of quest.npcs) {
    const dx = n.x - player.x;
    const dy = n.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d > 1.9 || d < 0.01) continue;
    if ((dx * dirX + dy * dirY) / d < 0.3) continue;
    const npc = n;
    return {
      prompt: `speak to ${npc.name}`,
      apply: () => talk(quest.state, npc, inv, day),
    };
  }

  // Nearest usable sprite within reach, roughly ahead.
  let best: SpriteRuntime | null = null;
  let bestD = 1.6;
  for (const s of sprites) {
    if (s.taken) continue;
    const isUseful =
      s.pickup !== undefined ||
      s.letter !== undefined ||
      s.search !== undefined ||
      s.clue !== undefined ||
      s.kind === "stairs" ||
      s.kind === "grate" ||
      s.kind === "corpse" ||
      s.kind === "alembic";
    if (!isUseful) continue;
    const dx = s.x - player.x;
    const dy = s.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d > bestD || d < 0.01) continue;
    // Must be broadly in front — no grabbing things behind you.
    if ((dx * dirX + dy * dirY) / d < 0.25) continue;
    best = s;
    bestD = d;
  }
  // Searchable/evidence props — solid geometry that opens, not pictures.
  let bestP: PropDef | null = null;
  let bestPD = 1.6;
  for (const p of map.props) {
    if (p.looted || (p.search === undefined && p.clue === undefined && !p.stairLink && !p.use)) continue;
    const dx = p.x - player.x;
    const dy = p.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d > bestPD || d < 0.01) continue;
    if ((dx * dirX + dy * dirY) / d < 0.25) continue;
    bestP = p;
    bestPD = d;
  }
  if (bestP && (!best || bestPD < bestD)) {
    const p = bestP;
    // Furniture verbs — the desk is where the journal happens, the doctor's
    // own bed is the only place sleep is allowed.
    if (p.use === "desk") {
      return { prompt: "write in your journal", apply: () => hooks.openJournal() };
    }
    if (p.use === "slab") {
      return { prompt: "examine the body", apply: () => hooks.openAutopsy() };
    }
    if (p.use === "homebed") {
      if (quest.state.stage === "shadow") {
        return { prompt: "sleep can wait — tonight you watch the streets", apply: () => {} };
      }
      if (tday < 0.45) return { prompt: "too early to sleep — the day's work isn't done", apply: () => {} };
      return { prompt: "sleep until dawn", apply: () => hooks.sleep() };
    }
    if (p.stairLink) {
      const link = p.stairLink;
      return {
        prompt: "climb the stairs",
        apply: () => {
          player.x = link.x;
          player.y = link.y;
        },
      };
    }
    if (p.search !== undefined) {
      const spot = SEARCHES[p.search];
      const label = p.examine ?? "the container";
      return {
        prompt: `search ${label}`,
        apply: () => {
          p.looted = true;
          for (const [id, n] of spot.items) {
            for (let i = 0; i < n; i++) addPickup(inv, id);
          }
          if (spot.clue) grantClue(quest.state, day, spot.clue);
          say(quest.state, label, spot.text);
        },
      };
    }
    const clueId = p.clue!;
    const label = p.examine ?? "the marks";
    return {
      prompt: `examine ${label}`,
      apply: () => {
        const already = quest.state.clues.has(clueId);
        grantClue(quest.state, day, clueId);
        say(quest.state, label, [
          CLUES[clueId].text,
          already ? "You've already noted this in the casebook." : "You note it in the casebook.",
        ]);
      },
    };
  }
  if (best) {
    const s = best;
    if ((s.kind === "stairs" || s.kind === "grate") && s.stairLink) {
      const link = s.stairLink;
      if (s.kind === "grate") {
        // The way below — and, once the specimen's in hand, the way to seal it.
        const above = player.y < 50;
        if (above && STAGE_ORDER.indexOf(quest.state.stage) < STAGE_ORDER.indexOf("descent")) {
          return {
            prompt: "a rusted grate — shut fast, the dark below breathing",
            apply: () => {},
          };
        }
        if (quest.state.grateSealed) {
          return { prompt: "the grate is sealed — the way below is shut", apply: () => {} };
        }
        if (above && quest.state.stage === "descent" && count(inv, "specimen") > 0) {
          if (count(inv, "planks") >= BARRICADE_COST) {
            return {
              prompt: "seal the grate with planks",
              apply: () => {
                inv.items.planks = count(inv, "planks") - BARRICADE_COST;
                quest.state.grateSealed = true;
                quest.state.stage = "brew";
                log(quest.state, day, "sealed the grate. whatever walked below stays below — and the specimen is bound for aubert's bench.");
              },
            };
          }
          return { prompt: "need planks to seal the grate", apply: () => {} };
        }
        const down = link.y > 50;
        return {
          prompt: down ? "descend into the sewers" : "climb back to the streets",
          apply: () => {
            player.x = link.x;
            player.y = link.y;
          },
        };
      }
      return {
        prompt: "climb the stairs",
        apply: () => {
          player.x = link.x;
          player.y = link.y;
        },
      };
    }
    if (s.kind === "corpse") {
      return { prompt: "examine the body", apply: () => hooks.openAutopsy() };
    }
    if (s.kind === "alembic") {
      return {
        prompt: "examine the still",
        apply: () => {
          grantClue(quest.state, day, "gleaming_cup");
          say(quest.state, "the still", [
            "Green glass over a low flame — someone's kept it fed. The dregs in the cucurbit gleam faintly, like coins at the bottom of a well.",
            "Whatever he's been feeding the quarter, it was born here.",
          ]);
        },
      };
    }
    if (s.search !== undefined) {
      // A searchable container — opens once, restocks at dawn.
      const spot = SEARCHES[s.search];
      const label = s.examine ?? "container";
      return {
        prompt: `search ${label}`,
        apply: () => {
          s.taken = true;
          for (const [id, n] of spot.items) {
            for (let i = 0; i < n; i++) addPickup(inv, id);
          }
          if (spot.clue) grantClue(quest.state, day, spot.clue);
          say(quest.state, label, spot.text);
        },
      };
    }
    if (s.clue !== undefined) {
      // An evidence mark — examined, noted in the casebook, left in place.
      const clueId = s.clue;
      const label = s.examine ?? "the marks";
      return {
        prompt: `examine ${label}`,
        apply: () => {
          const already = quest.state.clues.has(clueId);
          grantClue(quest.state, day, clueId);
          say(quest.state, label, [
            CLUES[clueId].text,
            already ? "You've already noted this in the casebook." : "You note it in the casebook.",
          ]);
        },
      };
    }
    if (s.letter !== undefined) {
      const letter = s.letter;
      return {
        prompt: "read the letter",
        apply: () => readLetter(quest.state, letter, day),
      };
    }
    const kind = s.pickup!;
    // Timber only matters once the dead walk — before that a physician has
    // no use for a plank, and the game shouldn't pretend he does.
    if (kind === "planks" && !outbreak) {
      return { prompt: "splintered boards — of no use to a physician", apply: () => {} };
    }
    return {
      prompt: `take ${ITEMS[kind].name}`,
      apply: () => {
        s.taken = true;
        addPickup(inv, kind);
      },
    };
  }

  // The well is solid geometry — drink at its landmark. Checked after the
  // close-in scan so a nearby evidence mark still wins when you face it.
  const well = map.landmarks.find((l) => l.name === "the well");
  if (well) {
    const dx = well.x - player.x;
    const dy = well.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d <= 1.9 && d > 0.01 && (dx * dirX + dy * dirY) / d > 0.15) {
      return { prompt: "drink from the well", apply: () => drinkWell(needs) };
    }
  }

  // Doors and windows ahead. Doors hang shut and swing both ways; once the
  // dead walk, a shut door can be planked fast — that's the barricade game.
  for (let t = 0.5; t <= INTERACT_RANGE; t += 0.15) {
    const cx = Math.floor(player.x + dirX * t);
    const cy = Math.floor(player.y + dirY * t);
    if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return null;
    const idx = cy * map.w + cx;
    const isDoor = map.doorways.has(idx);
    const isWindow = map.windows.has(idx);
    if (!isDoor && !isWindow) {
      // A solid wall blocks sight — stop scanning.
      if (map.walls[idx] !== 0) return null;
      continue;
    }
    const wall = map.walls[idx];
    if (wall === BARRICADE_WALL_ID) {
      return {
        prompt: "tear down the barricade",
        apply: () => {
          // Planks come off; the door leaf behind stays where it hung.
          map.walls[idx] = 0;
          inv.items.planks = count(inv, "planks") + BARRICADE_COST;
        },
      };
    }
    if (isDoor) {
      const door = map.doors.find((d) => d.idx === idx);
      // Some openings hang no leaf — the marquee's flap stands tied open.
      // There's nothing to swing here; once the dead walk it can only be
      // planked over, like a window.
      if (!door) {
        if (!outbreak) return null;
        if (count(inv, "planks") < BARRICADE_COST) {
          return { prompt: "need a plank to barricade the opening", apply: () => {} };
        }
        return {
          prompt: "barricade the opening",
          apply: () => {
            map.walls[idx] = BARRICADE_WALL_ID;
            inv.items.planks = count(inv, "planks") - BARRICADE_COST;
          },
        };
      }
      if (!door.open && door.t < 0.05) {
        // Shut fast — swing it, or (once the dead walk) plank it.
        if (!outbreak) {
          return {
            prompt: "open the door",
            apply: () => {
              door.open = true;
            },
          };
        }
        // The dead walk — a shut door is worth a choice, not just a hand.
        return {
          prompt: "the door — shut fast",
          apply: () => {
            say(quest.state, "the door", []);
            quest.state.topics = [
              {
                label: "open the door",
                run: (q) => {
                  door.open = true;
                  endDialog(q);
                },
              },
              {
                label: "barricade the door",
                run: (q, inv2) => {
                  if (count(inv2, "planks") < BARRICADE_COST) {
                    say(q, "the door", ["You'd need a plank of timber — the dead carts shed them all over the quarter."]);
                    return;
                  }
                  inv2.items.planks = count(inv2, "planks") - BARRICADE_COST;
                  map.walls[idx] = BARRICADE_WALL_ID;
                  endDialog(q);
                },
              },
            ];
          },
        };
      }
      // The leaf stands open — swing it shut, but not onto yourself.
      if (Math.floor(player.x) === cx && Math.floor(player.y) === cy) return null;
      return {
        prompt: "close the door",
        apply: () => {
          door.open = false;
        },
      };
    }
    // An open window — boardable once the dead walk, a slit the rest of the time.
    if (!outbreak) return null;
    if (count(inv, "planks") < BARRICADE_COST) {
      return { prompt: "need a plank to barricade the window", apply: () => {} };
    }
    return {
      prompt: "barricade window",
      apply: () => {
        map.walls[idx] = BARRICADE_WALL_ID;
        inv.items.planks = count(inv, "planks") - BARRICADE_COST;
      },
    };
  }

  return null;
}
