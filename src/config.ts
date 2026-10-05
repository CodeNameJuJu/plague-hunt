// Internal render resolution. The framebuffer is drawn at this size and then
// upscaled with nearest-neighbour — this is where the pixel look comes from.
export const INTERNAL_WIDTH = 480;
export const INTERNAL_HEIGHT = 270;

export const TEX_SIZE = 64;

// Camera
export const FOV = Math.PI / 2.6; // ~69 degrees
export const PITCH_LIMIT = 81; // max pixels the horizon can shift up/down

// Movement (tiles per second / radians per second)
export const MOVE_SPEED = 2.6;
export const RUN_MULTIPLIER = 1.7;
export const TURN_SPEED = 2.2;
export const MOUSE_SENSITIVITY = 0.0022;
export const PLAYER_RADIUS = 0.22;

// View bob
export const BOB_FREQUENCY = 7.5;
export const BOB_AMPLITUDE = 2.4; // pixels of horizon shift

// Lighting
export const LIGHT_BANDS = 8; // brightness is quantised into bands — retro banding
export const AMBIENT_NIGHT = 0.02; // the streets at night are near pitch black
export const AMBIENT_DAY = 0.62; // a brighter day — grey skies but the sun gets through
export const INDOOR_AMBIENT = 0.55; // daylight spills well inside
export const HEARTH_GLOW = 0.22; // indoor ambient floor — houses stay lit at night
export const HEARTH_WARM = 0.62; // the indoor glow reads as warm firelight
export const PLAYER_LIGHT_RADIUS = 4.6;
export const PLAYER_LIGHT_INTENSITY = 0.5;

// Fog: distances in tiles beyond which the world fades to black.
// Night closes in tight; day lets you see down a street.
export const FOG_NIGHT_NEAR = 5.5;
export const FOG_NIGHT_FAR = 12.0;
export const FOG_DAY_NEAR = 11.0;
export const FOG_DAY_FAR = 30.0;

// Post-processing
export const GRAIN_AMOUNT = 2; // ± luminance noise per pixel, per frame

// Time: one full day/night cycle, in real seconds.
// tday is a fraction: 0 dawn, 0.25 midday, 0.5 dusk, 0.75 midnight.
export const DAY_LENGTH = 560;
export const START_TDAY = 0.14; // morning — time to scavenge before dark

// Survival needs — points lost per second, and what happens at zero.
export const HUNGER_RATE = 100 / 300; // empty in ~5 minutes
export const THIRST_RATE = 100 / 220; // thirst hits faster
export const STARVE_DAMAGE = 2.5; // health/s while a need is empty
export const REGEN_RATE = 1.5; // health/s while fed and watered
export const BREAD_RESTORE = 40;
export const SKIN_RESTORE = 45; // waterskin
export const WELL_RESTORE = 100;
// Fatigue — the Zomboid need. A waking day spends most of a bar; running
// spends it faster. Below EXHAUSTED the legs slow; at zero it starts to cost
// health. Only sleep at the inn restores it.
export const FATIGUE_RATE = 100 / (DAY_LENGTH * 1.3);
export const FATIGUE_RUN_MULT = 2.4;
export const EXHAUSTED = 22; // below this the doctor drags
export const EXHAUST_DAMAGE = 1.2; // health/s at zero fatigue

// Interaction
export const INTERACT_RANGE = 1.8;
export const BARRICADE_COST = 1; // planks per barricade
export const PLANK_PICKUP = 3; // planks per timber found
export const BARRICADE_WALL_ID = 6;

// The wights in the sewers — the alchemist's dumped failures, walking again.
export const WIGHT_DAMAGE = 9; // health/s on contact — keep your distance
