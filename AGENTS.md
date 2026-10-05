# AGENTS.md

Context for AI agents working in this repo.

## What this is

**Plague Hunt** — a retro first-person survival and detective game set in
the streets of Paris, 1348. No combat: the story is driven by evidence —
clues land in the casebook (`clues.ts`), clue sets resolve into deductions,
and deductions gate the story beats. Scavenge containers by day, interrogate
the quarter's people, sleep the nights away. Browser-based raycasting
engine, TypeScript + Vite, no runtime dependencies. All art is procedural —
there are no image assets.

## Conventions

- **The look is the point.** Internal render resolution is 320×180, upscaled
  with nearest-neighbour. Never add smoothing, anti-aliasing, or high-res
  rendering paths. Lighting is quantised into bands (`LIGHT_BANDS`) — keep it.
- **All art is procedural.** Textures in `textures.ts`, sprite bitmaps in
  `sprites.ts`. Seeded RNG (mulberry32) so output is deterministic — don't
  introduce unseeded randomness into asset generation.
- **The city is built in code** in `map.ts` — a street grid, declarative
  building rects with a door each, and a sprite/light list. Cells not claimed
  by streets or buildings become dirt alleys. Any cell can be open sky
  (`C_SKY`) or beamed interior (`C_BEAMS`).
- **Lighting is the atmosphere.** Ambient follows the day/night cycle;
  `AMBIENT_NIGHT` is deliberately near zero. Don't brighten it to "fix"
  visibility — darkness is the game.
- **Doorways are barricadable.** Every building door cell index lives in
  `map.doorways`; interact.ts turns them into `BARRICADE_WALL_ID` walls and
  back. Shamblers collide with walls only, so barricades genuinely stop them.
- Sprites in `castSprites` are clipped by the wall z-buffer column-wise.
  Anything drawn as a billboard should stay a billboard.
- No dependencies without a clear reason. The stack is deliberately minimal.

## Build / verify

```bash
npm run dev          # vite dev server
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + production bundle
```

Verify with `npm run typecheck` and `npm run build`. There are no tests yet;
checking the game renders correctly means running `npm run dev` and looking.
