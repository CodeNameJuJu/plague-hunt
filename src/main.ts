import "./style.css";
import {
  AMBIENT_DAY,
  AMBIENT_NIGHT,
  DAY_LENGTH,
  EXHAUSTED,
  FOG_DAY_FAR,
  FOG_DAY_NEAR,
  FOG_NIGHT_FAR,
  FOG_NIGHT_NEAR,
  INTERNAL_HEIGHT as H,
  INTERNAL_WIDTH as W,
  PLAYER_LIGHT_INTENSITY,
  PLAYER_LIGHT_RADIUS,
  START_TDAY,
} from "./config";
import { describeTime, initHud } from "./hud";
import { consumePress, initInput, isDown, isLocked } from "./input";
import { initCityMap } from "./citymap";
import { findInteraction } from "./interact";
import { craft, makeInventory, RECIPES, useItem } from "./inventory";
import { ITEMS } from "./items";
import { initAutopsy } from "./autopsy";
import { initJournal } from "./journal";
import { initShop } from "./shop";
import { buildIntroMaps, buildMap, isBlocked, openGate, updateDoors } from "./map";
import { makeNeeds, updateNeeds } from "./needs";
import {
  makeVillagers,
  updateVillagers,
  villagerSprites,
  makePatrols,
  updatePatrols,
  patrolSprites,
  patrolLanterns,
  makeMarket,
  updateMarket,
} from "./npcs";
import { makePlayer, updatePlayer } from "./player";
import {
  AUTOPSY_FINDINGS,
  endDialog,
  initQuest,
  log,
  QUEST_NPCS,
  questText,
  topicAvailable,
} from "./quests";
import { grantClue } from "./clues";
import { Renderer } from "./renderer";
import { buildLantern, buildSpriteKinds, buildSpriteModels, texCanvas, villagerVariants } from "./sprites";
import { initMenu } from "./menu";
import {
  attractShamblerSprites,
  beginIntro,
  introLight,
  introScene,
  introShamblerSprites,
  isIntroActive,
  updateAttract,
  updateIntro,
} from "./intro";
import { binds, keyName, settings } from "./settings";
import { buildTextures } from "./textures";
import type { SpriteRuntime } from "./types";

const map = buildMap();
const introMaps = buildIntroMaps(); // the road scenes — intro shots only
const textures = buildTextures();
buildSpriteModels(textures); // people as voxel figures — faces join the wall table
const spriteKinds = buildSpriteKinds();
const villagerFrames = villagerVariants();
const sprites: SpriteRuntime[] = map.sprites.map((s) => {
  const kind = spriteKinds[s.kind];
  if (!kind) throw new Error(`unknown sprite kind: ${s.kind}`);
  return {
    kind: s.kind,
    x: s.x,
    y: s.y,
    pickup: s.pickup,
    letter: s.letter,
    stairLink: s.stairLink,
    examine: s.examine,
    clue: s.clue,
    search: s.search,
    ...kind,
  };
});

// The player carries a lantern — it's the last light in the list and follows
// them with a little sway so it doesn't feel glued to the camera.
const playerLight = {
  x: 0,
  y: 0,
  radius: PLAYER_LIGHT_RADIUS,
  intensity: PLAYER_LIGHT_INTENSITY,
  warm: 0.85,
  phase: 8.8,
};
const lights = [...map.lights, playerLight];
// Each road scene carries its own lamps; the carried light rides along.
const introSceneLights: Record<string, typeof lights> = {};
for (const [name, m] of Object.entries(introMaps)) introSceneLights[name] = [...m.lights, playerLight];

const player = makePlayer(map);
const needs = makeNeeds();
const inv = makeInventory();
// The quest characters stand in the world like any other sprite.
for (const n of QUEST_NPCS) {
  const kind = spriteKinds[n.sprite];
  sprites.push({ kind: n.sprite, x: n.x, y: n.y, ...kind });
}
const quest = { npcs: QUEST_NPCS, state: initQuest() };
const villagers = makeVillagers(map);
// The watch and the market — patrols beat their rounds day and night;
// vendors hold the plaza stalls while the sun is up.
const patrols = makePatrols();
const market = makeMarket(quest.npcs, sprites);

// People dot the road scenes — folk in the fields and on the lane make the
// journey feel travelled, and they're what the quarter lacks. Each stands on
// a single walk frame; the key is the Shot.scene the shot films in.
const introSceneSprites: Record<string, SpriteRuntime[]> = {};
{
  const vScale = spriteKinds.villager.scale;
  const folk = (v: number, fr: number, x: number, y: number): SpriteRuntime => ({
    kind: "villager",
    x,
    y,
    frames: [villagerFrames[v % villagerFrames.length][fr % villagerFrames[0].length]],
    scale: vScale,
    block: 0,
    animFps: 0,
    model: `villager${v % 8}`,
  });
  introSceneSprites.farmland = [
    folk(5, 0, 7.8, 8.3),   // a fieldhand in the field gate, hoeing by the road
    folk(5, 2, 6.0, 4.5),   // another deeper in the furrows, seen through the gap
    folk(1, 1, 19.6, 7.1),  // the farmer's wife below the farmhouse door
    folk(0, 3, 25.5, 10.3), // a pilgrim on the road ahead
    folk(6, 0, 16.0, 10.8), // a mourner at the south verge
  ];
  introSceneSprites.countryside = [
    folk(7, 1, 27.0, 9.3),  // the carter beside his emptied cart
    folk(0, 2, 16.0, 8.6),  // a lone walker on the lane
    folk(0, 1, 9.0, 8.7),   // another traveller nearer the camera
    folk(3, 0, 16.5, 10.3), // a beggar sitting in the hedge gap
    folk(1, 3, 24.3, 7.0),  // a woman watching from the field gate
  ];
}
// Icons for the hotbar and pack — every item's sprite bitmap, keyed by name,
// plus the sous piece for the purse slot.
const icons = Object.fromEntries(
  Object.values(ITEMS).map((d) => [d.icon, spriteKinds[d.icon].frames[0]])
);
icons.coin = spriteKinds.coin.frames[0];
const hud = initHud(icons, {
  use: (id) => {
    useItem(inv, needs, id);
    hud.setInventory(inv);
    hud.refreshPanel(inv);
  },
  craft: (i) => {
    craft(inv, RECIPES[i]);
    hud.setInventory(inv);
    hud.refreshPanel(inv);
  },
});
const renderer = new Renderer();

const lanternCanvas = texCanvas(buildLantern());
// The lantern starts stowed — it stays out of the intro, and the first night
// begins dark until the player chooses to carry light.
let lanternOut = false;

// --- day/night cycle -------------------------------------------------------

let tday = START_TDAY;
let day = 1;
let dead = false;
let gateOpened = false;

function smooth01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

// 0 = pitch night, 1 = overcast day.
function daylightAt(t: number): number {
  if (t < 0.06) return smooth01(t / 0.06);
  if (t < 0.45) return 1;
  if (t < 0.55) return 1 - smooth01((t - 0.45) / 0.1);
  return 0;
}

// Dawn housekeeping — fresh salvage, a new round of patients to examine.
// Shared by the midnight rollover and sleeping at the inn.
function newDay(): void {
  for (const s of sprites) s.taken = false;
  for (const p of map.props) p.looted = false; // containers restock
  quest.state.examined.clear();
}

// --- story actors ------------------------------------------------------------

// The grey man — after dusk during the shadow beat he crosses the quarter
// to the alley grate. Follow him close enough and you learn where he goes.
const figure = { active: false, x: 0, y: 0, wp: 0 };
// Down the gate street, then the narrow gap between the shop and the next
// tenement, then west along the alley to the grate.
const FIGURE_PATH = [
  { x: 64.5, y: 21.5 },
  { x: 74.5, y: 21.5 },
  { x: 74.5, y: 31.6 },
  { x: 71.8, y: 31.6 },
];

// The wights below — the alchemist's failures, walking again in the pit.
// No fighting them: keep out of reach, take the specimen, seal the way.
const wights = [
  { x: 83.5, y: 79.5, stagger: 1.1 },
  { x: 81.5, y: 82.5, stagger: 4.4 },
  { x: 86, y: 81, stagger: 7.2 },
];
let wightsWoken = false;
let wightTouch = false;

// --- display canvas --------------------------------------------------------

const display = document.getElementById("game") as HTMLCanvasElement;
const displayCtx = display.getContext("2d")!;

function resize(): void {
  display.width = window.innerWidth;
  display.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// --- overlays ---------------------------------------------------------------

const journal = initJournal();
const shop = initShop(icons, texCanvas, () => hud.setInventory(inv));
const autopsy = initAutopsy(() => {
  const q = quest.state;
  q.autopsies += 1;
  // The slab is the best evidence in the game — each body is a clue.
  if (q.autopsies === 1) grantClue(q, day, "thin_blood");
  if (q.autopsies === 2) grantClue(q, day, "formula_blood");
  log(
    q,
    day,
    q.autopsies === 1
      ? "opened the body on the pesthouse slab — black tongue, buboes, plague as expected. but the blood ran thin and bright, and the nails were stained grey."
      : "a second body on the slab — a metallic sheen on the tongue, no buboes, skin smelling of the still. this was not the pestilence. someone fed him a formula."
  );
});

// What the world interactions can trigger.
const hooks = {
  openAutopsy() {
    const q = quest.state;
    if (q.autopsies >= AUTOPSY_FINDINGS.length) {
      q.dialogOpen = true;
      q.speaker = "the slab";
      q.lines = [
        "The same black tongue, the same thin blood — you know this death by heart now. The pattern is the point.",
      ];
      q.lineIdx = 0;
      return;
    }
    autopsy.open(q.autopsies);
  },
  openJournal() {
    if (!journal.isOpen()) journal.toggle(quest.state);
  },
  sleep() {
    day += 1;
    tday = START_TDAY;
    newDay();
    needs.health = Math.min(100, needs.health + 25);
    needs.hunger = Math.max(0, needs.hunger - 10);
    needs.thirst = Math.max(0, needs.thirst - 10);
    needs.fatigue = 100;
  },
};

// --- menu -------------------------------------------------------------------

const overlay = document.getElementById("overlay")!;
if (settings.brightness !== 1) display.style.filter = `brightness(${settings.brightness})`;

// The opening sequence plays once per session — "descend" runs it, everything
// after (re-lock, rising from the dead) drops straight in.
let introSeen = false;

function lockIn(): void {
  display.requestPointerLock();
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
}

const menu = initMenu(display, () => {
  if (!introSeen && !dead) {
    introSeen = true;
    overlay.classList.add("hidden");
    // Fullscreen while the click gesture is still live — the intro plays
    // big, then the pointer locks when it ends.
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    tday = 0.86; // the dead hours before dawn
    beginIntro(() => {
      tday = START_TDAY; // dawn — your first day begins
      player.x = map.spawnX;
      player.y = map.spawnY;
      player.angle = map.spawnAngle;
      player.pitch = 0;
      lockIn();
    });
  } else {
    lockIn();
  }
});

// The city map — M toggles it. It stays mouse-locked (keyboard only), so the
// night keeps moving while you read it. Read fast.
let mapOpen = false;
const mapEl = document.getElementById("citymap")!;
const citymap = initCityMap(map);
mapEl.appendChild(citymap.canvas);

// The pack — Tab opens it, releasing the mouse so items can be clicked.
// Toggled in a real keydown so closing can re-acquire pointer lock.
let invOpen = false;
window.addEventListener("keydown", (e) => {
  if (e.code !== binds.pack || dead) return;
  e.preventDefault();
  invOpen = !invOpen;
  hud.togglePanel(invOpen, inv);
  if (invOpen) document.exitPointerLock();
  else display.requestPointerLock();
});

initInput(display, (locked) => {
  overlay.classList.toggle(
    "hidden",
    locked || invOpen || shop.isOpen() || autopsy.isOpen() || isIntroActive()
  );
  if (locked && dead) {
    // Risen again — back at the gate, morning of the next day.
    dead = false;
    player.x = map.spawnX;
    player.y = map.spawnY;
    player.angle = map.spawnAngle;
    needs.health = 100;
    needs.hunger = 90;
    needs.thirst = 85;
    needs.fatigue = 100;
    tday = 0.05;
    day += 1;
    newDay();
  }
  if (!locked) {
    journal.close();
    menu.setDead(dead);
  }
});

// --- game loop -------------------------------------------------------------

let last = performance.now();
let time = 0;
// Strafe lean — the view shears a touch when sidestepping, like Quake's roll.
let viewRoll = 0;
// The player's real pose while the menu's attract camera is borrowed.
let menuPose: { x: number; y: number; angle: number; pitch: number } | null = null;

function frame(now: number): void {
  // Firefox's RAF timestamp can precede a performance.now() taken at module
  // load — never let dt go negative, it poisons animation indexing.
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  time += dt;

  if (isLocked() && !dead) {
    // Advance the clock.
    const prevDay = tday;
    tday = (tday + dt / DAY_LENGTH) % 1;
    if (tday < prevDay) {
      day += 1;
      newDay();
    }
    const daylight = daylightAt(tday);

    // Exhaustion drags the legs and forbids running — sleep is the only fix.
    const exhausted = needs.fatigue <= EXHAUSTED;
    updatePlayer(player, dt, map, sprites, exhausted ? 0.62 : 1);
    updateDoors(map, dt, player.x, player.y);
    updateNeeds(needs, dt, player.running);
    updateVillagers(villagers, dt, daylight, tday, map, player);
    updatePatrols(patrols, dt);

    // The provost's decree made real — the gate opens once, and stays open.
    if (quest.state.gateOpen && !gateOpened) {
      gateOpened = true;
      openGate(map);
    }

    // The grey man walks the quarter after dusk during the shadow beat.
    if (quest.state.stage === "shadow" && daylight < 0.2) {
      if (!figure.active) {
        figure.active = true;
        figure.x = FIGURE_PATH[0].x;
        figure.y = FIGURE_PATH[0].y;
        figure.wp = 1;
      }
      const t = FIGURE_PATH[figure.wp];
      const dx = t.x - figure.x;
      const dy = t.y - figure.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.2) {
        figure.wp += 1;
        if (figure.wp >= FIGURE_PATH.length) {
          figure.active = false;
          if (Math.hypot(player.x - figure.x, player.y - figure.y) < 9) {
            quest.state.stage = "lair";
            log(
              quest.state,
              day,
              "followed the grey man through the dark — he slipped down the alley behind the shuttered shop. something still burns in there."
            );
          }
        }
      } else {
        figure.x += (dx / d) * 0.85 * dt;
        figure.y += (dy / d) * 0.85 * dt;
      }
    } else if (figure.active && daylight > 0.35) {
      figure.active = false;
    }

    // Down in the dark, the dumped dead wake as you descend.
    if (quest.state.stage === "descent" && player.y >= 60 && !wightsWoken) {
      wightsWoken = true;
      grantClue(quest.state, day, "sewer_dead");
    }
    if (wightsWoken && !quest.state.grateSealed) {
      wightTouch = false;
      for (const w of wights) {
        const dx = player.x - w.x;
        const dy = player.y - w.y;
        const d = Math.hypot(dx, dy);
        if (player.y >= 60 && d < 14 && d > 0.01) {
          const wobble = Math.sin(time * 1.1 + w.stagger) * 0.4;
          const mx = dx / d - (dy / d) * wobble;
          const my = dy / d + (dx / d) * wobble;
          const ml = Math.hypot(mx, my) || 1;
          const nx = w.x + (mx / ml) * 0.45 * dt;
          const ny = w.y + (my / ml) * 0.45 * dt;
          if (!isBlocked(map, nx, w.y, 0.26)) w.x = nx;
          if (!isBlocked(map, w.x, ny, 0.26)) w.y = ny;
        }
        if (player.y >= 60 && d < 0.8) {
          needs.health = Math.max(0, needs.health - 9 * dt);
          wightTouch = true;
        }
      }
    } else {
      wightTouch = false;
    }

    // Dialogue runs ahead of world interactions while it's open — first the
    // spoken lines, then the interrogation menu if the speaker has one.
    const dlg = quest.state;
    if (dlg.dialogOpen) {
      hud.setPrompt(null);
      if (dlg.lineIdx < dlg.lines.length) {
        hud.setDialog(dlg.speaker, dlg.lines[dlg.lineIdx], true);
        if (consumePress(binds.interact)) dlg.lineIdx++;
      } else if (dlg.topics && dlg.topics.length > 0) {
        hud.setDialog(
          dlg.speaker,
          undefined,
          false,
          dlg.topics.map((t, i) => ({
            key: i + 1,
            label: t.label,
            locked: !topicAvailable(dlg, t),
            hint: t.hint,
          }))
        );
        let pick = -1;
        for (let i = 0; i < 9; i++) {
          if (consumePress(`Digit${i + 1}`)) pick = i;
        }
        if (pick >= 0) {
          const t = dlg.topics[pick];
          if (t && topicAvailable(dlg, t)) t.run(dlg, inv, day);
        } else if (consumePress(binds.interact)) {
          endDialog(dlg);
        }
      } else if (consumePress(binds.interact)) {
        endDialog(dlg);
      }
      if (!dlg.dialogOpen) {
        hud.setDialog(null);
        // A shopkeeper's greeting ends with the counter opening.
        if (dlg.shop) {
          shop.open(dlg.shop, inv);
          dlg.shop = null;
        }
      }
    } else {
      hud.setDialog(null);
      const interaction = findInteraction(map, sprites, player, needs, inv, quest, day, tday, hooks);
      // In the dark with nothing to use and no lantern — remind the player it exists.
      hud.setPrompt(
        interaction
          ? interaction.prompt
          : !lanternOut && daylight < 0.25
            ? `lantern — press [${keyName(binds.lantern)}]`
            : null
      );
      if (interaction && consumePress(binds.interact)) interaction.apply();
    }

    // The city map — M while locked.
    if (consumePress(binds.map)) {
      mapOpen = !mapOpen;
      mapEl.classList.toggle("open", mapOpen);
    }
    if (mapOpen) citymap.draw(player);

    // The journal — J, or written at the inn desk.
    if (consumePress(binds.journal)) journal.toggle(quest.state);

    // Inventory hotkeys — eat, drink, bandage.
    if (consumePress(binds.use1)) hud.flashSlot("bread", useItem(inv, needs, "bread"));
    if (consumePress(binds.use2)) hud.flashSlot("skin", useItem(inv, needs, "skin"));
    if (consumePress(binds.use3)) hud.flashSlot("bandage", useItem(inv, needs, "bandage"));

    // Lantern in the left hand — stow it for stealth at the cost of light.
    if (consumePress(binds.lantern)) lanternOut = !lanternOut;

    if (needs.health <= 0) {
      dead = true;
      document.exitPointerLock();
    }
    hud.setDamage(wightTouch);
    hud.setNeeds(needs.health, needs.hunger, needs.thirst, needs.fatigue);
    hud.setInventory(inv);
    hud.setClock(describeTime(tday, day));
    hud.setQuest(questText(quest.state));
    hud.setCompass(player.x, player.y, player.angle, map.landmarks);
  } else {
    // don't let presses queue up while paused
    consumePress(binds.interact);
    consumePress(binds.map);
    consumePress(binds.journal);
    consumePress(binds.use1);
    consumePress(binds.use2);
    consumePress(binds.use3);
    consumePress(binds.lantern);
    if (mapOpen) {
      mapOpen = false;
      mapEl.classList.remove("open");
    }
  }

  // The intro pans the camera over the night city; the villagers take
  // themselves home while it plays.
  if (isIntroActive()) {
    updateIntro(dt, player);
    updateVillagers(villagers, dt, 0, tday, map, player);
    updatePatrols(patrols, dt);
  }

  // The menu's living title backdrop — while the title card is up the camera
  // drifts the city at night; the player's real pose is kept and restored.
  const menuUp = !overlay.classList.contains("hidden") && !isIntroActive() && !dead;
  if (menuUp) {
    if (!menuPose) {
      menuPose = { x: player.x, y: player.y, angle: player.angle, pitch: player.pitch };
    }
    updateAttract(dt, player);
    updateVillagers(villagers, dt, 0, tday, map, player);
    updatePatrols(patrols, dt);
  } else if (menuPose) {
    player.x = menuPose.x;
    player.y = menuPose.y;
    player.angle = menuPose.angle;
    player.pitch = menuPose.pitch;
    menuPose = null;
  }

  // The title backdrop plays at night whatever the hour — lit windows, fog.
  // Intro road shots carry their own daylight — the journey runs day and night.
  const iLight = introLight();
  const daylight = menuUp ? 0.12 : iLight ? iLight.day : daylightAt(tday);
  const ambient = AMBIENT_NIGHT + (AMBIENT_DAY - AMBIENT_NIGHT) * daylight;
  const fogNear = FOG_NIGHT_NEAR + (FOG_DAY_NEAR - FOG_NIGHT_NEAR) * daylight;
  const fogFar = FOG_NIGHT_FAR + (FOG_DAY_FAR - FOG_NIGHT_FAR) * daylight;

  // The market keeps sun hours — vendors pack the boards at dusk (and the
  // night backdrop leaves them home).
  updateMarket(market, daylight);

  // The lantern light trails the player's facing slightly, like it's swinging.
  // It dies when the lantern is stowed — darkness is the price of stealth.
  // Intro night shots carry it lit — the card says the escort's lantern —
  // while day shots keep only a faint glow so they stay readable.
  const dayScene = iLight && iLight.day > 0.4;
  const introNight = iLight ? iLight.day < 0.4 : daylight < 0.4;
  playerLight.intensity = isIntroActive()
    ? PLAYER_LIGHT_INTENSITY * (dayScene ? 0.25 : 1)
    : menuUp
      ? PLAYER_LIGHT_INTENSITY * 0.6
      : lanternOut
        ? PLAYER_LIGHT_INTENSITY
        : 0;
  const sway = Math.sin(player.bobPhase) * 0.05;
  playerLight.x = player.x + Math.cos(player.angle) * 0.4 - Math.sin(player.angle) * sway;
  playerLight.y = player.y + Math.sin(player.angle) * 0.4 + Math.cos(player.angle) * sway;

  const extras: SpriteRuntime[] = [];
  if (figure.active) extras.push({ kind: "hooded", x: figure.x, y: figure.y, ...spriteKinds.hooded });
  if (wightsWoken && !quest.state.grateSealed) {
    for (const w of wights) {
      extras.push({
        kind: "shambler",
        x: w.x,
        y: w.y,
        frames: spriteKinds.shambler.frames,
        scale: spriteKinds.shambler.scale,
        block: 0,
        animFps: 2.4,
        model: "shambler",
      });
    }
  }
  // Road scenes film their own little maps — no city sprites on the road.
  // The lantern is the only light that follows you between them.
  const roadScene = introScene();
  const sceneMap = roadScene ? introMaps[roadScene] : map;
  // At night the watch's lanterns join the lamp list — pools of firelight
  // moving down the dark streets with the patrols.
  const sceneLights = roadScene
    ? introSceneLights[roadScene]
    : daylight < 0.35
      ? lights.concat(patrolLanterns(patrols))
      : lights;
  const allSprites = roadScene
    ? introSceneSprites[roadScene] ?? []
    : sprites.concat(
        villagerSprites(villagers, villagerFrames, spriteKinds.villager.scale),
        patrolSprites(patrols, spriteKinds.patrol.frames, spriteKinds.patrol.scale),
        isIntroActive() ? introShamblerSprites(spriteKinds.shambler.frames, spriteKinds.shambler.scale) : [],
        menuUp ? attractShamblerSprites(spriteKinds.shambler.frames, spriteKinds.shambler.scale) : [],
        extras
      );
  renderer.render(sceneMap, textures, allSprites, sceneLights, player, time, ambient, daylight, menuUp ? 0.8 : iLight ? iLight.sunT : tday, fogNear, fogFar);

  // The lantern in the left hand — hidden in menus, but out for the intro's
  // night shots: the escort walks you in by its light (the pointer isn't
  // locked until the intro hands off, so the gate opens for it too). The
  // intro drives player.bob rather than bobPhase, so its sway runs off the clock.
  const introLantern = isIntroActive() && introNight;
  if ((isLocked() && !dead) || introLantern) {
    const lanternShown = lanternOut || introLantern;
    const ph = isIntroActive() ? time * 7.2 : player.bobPhase;
    const swayX = Math.sin(ph * 0.5) * 4.5;
    const swayY = Math.abs(Math.sin(ph)) * 3.75;
    renderer.drawViewmodels(lanternShown ? lanternCanvas : null, swayX, swayY);
  }

  // Upscale the framebuffer to fill the window, preserving aspect ratio.
  const scale = Math.min(display.width / W, display.height / H);
  const dw = W * scale;
  const dh = H * scale;
  const dx = (display.width - dw) / 2;
  const dy = (display.height - dh) / 2;
  displayCtx.imageSmoothingEnabled = false;
  displayCtx.fillStyle = "#000";
  displayCtx.fillRect(0, 0, display.width, display.height);

  // Strafe lean — ease toward a small shear while sidestepping.
  const strafe = isLocked() && !dead
    ? (isDown(binds.right) ? 1 : 0) - (isDown(binds.left) ? 1 : 0)
    : 0;
  viewRoll += (strafe * 0.018 - viewRoll) * Math.min(1, dt * 7);

  // Standing in the sewer channel warps the whole view — r_waterwarp.
  const pCell = Math.floor(player.y) * map.w + Math.floor(player.x);
  const inWater = isLocked() && !dead && map.floorTex[pCell] === 6;

  if (inWater || Math.abs(viewRoll) > 0.002) {
    // Row-sliced blit: each scanline shifts horizontally — sine warp in the
    // water, plus the roll shear that reads as a lean.
    const margin = 5 * scale;
    for (let y = 0; y < H; y++) {
      const off =
        (inWater ? Math.sin(y * 0.22 + time * 4.4) * 2.2 : 0) +
        (y - H / 2) * viewRoll;
      displayCtx.drawImage(
        renderer.canvas, 0, y, W, 1,
        dx - margin + off * scale, dy + y * scale, dw + margin * 2, scale + 1
      );
    }
    if (inWater) {
      displayCtx.fillStyle = "rgba(16, 30, 24, 0.18)";
      displayCtx.fillRect(dx, dy, dw, dh);
    }
  } else {
    displayCtx.drawImage(renderer.canvas, dx, dy, dw, dh);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
