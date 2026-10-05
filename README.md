# Plague Hunt

A retro first-person narrative game set in the streets of Paris, anno domini
1348. Wolfenstein-style raycasting engine, procedural pixel-art textures,
torchlight and darkness. TypeScript + Vite, zero runtime dependencies.

## Run

```bash
npm install
npm run dev
```

Open the printed URL and hit **descend** to enter. **WASD** move, **mouse**
look, **shift** run, **E** interact, **L** lantern, **tab** open your pack,
**M** city map, **J** journal, **1/2/3** eat / drink / bandage, **esc**
pause menu. All keys rebindable from the menu, with settings for mouse
sensitivity, field of view, brightness and film grain — everything persists.

## The story

The east quarter of Paris is sealed behind the cordon — the sick go in,
nothing comes out. The provost has commissioned you, a plague doctor, to
work inside it. You lodge at the inn on the north street; your room has a
bed to sleep the nights away and a desk where your casebook records each
day's work (**J** to read it).

Your days have a shape: collect your stipend at the gate, walk the pesthouse
ward — examine the three sick on their cots, then open the dead on the slab.
But the work is detective work: testimony, documents, autopsy findings and
physical marks all land in the casebook as evidence, and when the right
pieces sit together the deduction resolves itself — that is what moves the
story on, not a script. Press the quarter's people: after their greeting,
numbered topics let you interrogate them, and the questions worth asking
stay locked until the evidence is in hand.

Once the casebook says someone walks the quarter at night, Sister Marguerite
points you at the grey man. Tail him and the truth surfaces: an alchemist
dosing the sick with a formula meant to hollow a man into an obedient
assassin — and dumping his failures in the sewers. Convince him to stop,
then go below for the specimen Maître Aubert needs to brew the cure. What
was thrown down there does not lie still. Seal it in, brew the cure, and
give it to all three patients.

## The routine

Hunger, thirst and fatigue drain — eat bread, take waterskins, drink from
the plaza well, and sleep the nights away in your room or the exhaustion
will slow your legs and then worse. The stipend (10 sous a day, from the
provost) buys supplies in the free quarter: the baker's stall, the inn
counter, Aubert's remedies. Sacks and chests in kitchens and sickrooms are
searchable — they restock at dawn, and some hold more than supplies. Planks
pried from carts and timber crates barricade doors and windows, and are what
you seal the sewer grate with. The dead on the pesthouse slab are examined through a
small autopsy — four sites, four findings, one truth.

## Status

Narrative investigation, no combat: a 90×90 city with a walled quarantine
quarter (pesthouse, sick tenements, the alchemist's shuttered shop), sewer
tunnels below, an inn room base with casebook and bed, shops and currency,
searchable containers, evidence marks, and a story gated by deduction —
clues combine into conclusions, and conclusions open the way forward.
A tailing sequence, autopsy minigame, and a sewer finale carry it home.
Named landmarks hang painted signs and appear on the city map (M) and
compass.

## Layout

```
src/
  config.ts     constants: resolution, FOV, speeds, lighting, fog, needs
  types.ts      shared types
  map.ts        the city: street grid, quarantine quarter, sewers, props
  textures.ts   procedural wall/floor/ceiling texture generation
  sprites.ts    procedural sprite bitmaps (props, people, signs, lantern)
  lighting.ts   point-light sampling with flicker
  needs.ts      hunger / thirst / fatigue / health
  npcs.ts       daytime villagers wandering the free streets
  clues.ts      the casebook: evidence registry, deductions, loot tables
  quests.ts     the story: stages, dialogue, interrogation topics, letters
  interact.ts   E-interactions: talk, search, examine, beds, the grate
  journal.ts    the casebook panel (J): evidence, deductions, journal
  shop.ts       shop counters — wares priced in sous
  autopsy.ts    the slab minigame — four sites, four findings
  hud.ts        DOM HUD: bars, clock, prompts, compass, dialogue, pack
  input.ts      keyboard + pointer-lock mouse
  player.ts     movement, collision, head bob
  renderer.ts   raycaster: walls, floor/ceiling casting, sprites, post fx
  main.ts       game loop, day/night cycle, story actors, upscale
```
