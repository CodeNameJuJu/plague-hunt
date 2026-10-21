// Procedural audio — every sound is synthesized; there are no audio files.
// The AudioContext is created lazily inside the first user gesture (browsers
// refuse it earlier), so resume() rides the pointer-lock click path.
//
// The bed is a looped noise buffer: wind through a lowpass, fire pops sliced
// from the same buffer near warm lights, footsteps shaped by the floor under
// the player. Bells are a little additive synth; the dread drone is two
// detuned low oscillators that swell near the grey man and below the grate.

import { settings } from "./settings";

export interface Ambience {
  daylight: number; // 0 night → 1 day
  inSewer: boolean;
  fireNear: number; // 0..1 — warm-light falloff at the player's feet
  dread: number; // 0..1 — the grey man close, or the dead below
}

export interface GameAudio {
  resume(): void;
  update(dt: number, a: Ambience): void;
  step(surface: number): void; // map.floorTex id underfoot
  bell(): void;
  tick(): void; // a casebook page turning
  coin(): void;
  sting(): void; // death — the floor coming up to meet you
}

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(0x1348);

export function initAudio(): GameAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let noiseBuf: AudioBuffer;
  let windGain: GainNode;
  let windFilt: BiquadFilterNode;
  let dreadGain: GainNode;
  let windLevel = 0;
  let windTarget = 0.06;
  let gustT = 0;
  let crackleAcc = 0;
  let dripAcc = 0;
  let nextDrip = 2;

  function build(): void {
    if (!ctx) return;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // The wind — noise pinned under a wandering lowpass.
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    windFilt = ctx.createBiquadFilter();
    windFilt.type = "lowpass";
    windFilt.frequency.value = 480;
    windFilt.Q.value = 0.4;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    src.connect(windFilt).connect(windGain).connect(master);
    src.start();

    // The drone — two sines a beat apart, sub-bass dread.
    dreadGain = ctx.createGain();
    dreadGain.gain.value = 0;
    const droneFilt = ctx.createBiquadFilter();
    droneFilt.type = "lowpass";
    droneFilt.frequency.value = 160;
    for (const f of [48, 48.6]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(droneFilt);
      o.start();
    }
    droneFilt.connect(dreadGain).connect(master);
  }

  // A short slice of the noise buffer through a filter — pops and steps.
  function burst(dur: number, type: BiquadFilterType, freq: number, gain: number, Q = 0.8): void {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.6 + rand() * 0.8;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = Q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0, rand() * 1.5);
    src.stop(t0 + dur + 0.02);
  }

  // A pitched blip that slides to another frequency — drips and coin pings.
  function plip(f0: number, f1: number, dur: number, gain: number, when = 0): void {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  return {
    resume() {
      if (!ctx) {
        ctx = new AudioContext();
        build();
      } else if (ctx.state === "suspended") {
        void ctx.resume();
      }
    },

    update(dt, a) {
      if (!ctx) return;
      const now = ctx.currentTime;
      master.gain.setTargetAtTime(settings.sound ? 0.55 : 0, now, 0.15);

      // Wind breathes on a slow random walk — a touch wilder after dark,
      // muffled to almost nothing below the streets.
      gustT -= dt;
      if (gustT <= 0) {
        gustT = 1.6 + rand() * 3;
        const base = a.inSewer ? 0.012 : 0.03 + (1 - a.daylight) * 0.03;
        windTarget = base + rand() * base;
      }
      windLevel += (windTarget - windLevel) * Math.min(1, dt * 0.8);
      windGain.gain.setTargetAtTime(windLevel, now, 0.1);
      windFilt.frequency.setTargetAtTime(420 + windLevel * 3600, now, 0.2);

      // Fire — proximity meters out the pop rate; each pop is a noise flick.
      crackleAcc += dt * a.fireNear * 26;
      while (crackleAcc > 1) {
        crackleAcc -= 1;
        burst(0.015 + rand() * 0.03, "bandpass", 1200 + rand() * 2200, 0.04 + rand() * 0.09, 1.4);
      }

      // Sewer water — sparse drips off the vault.
      if (a.inSewer) {
        dripAcc += dt;
        if (dripAcc >= nextDrip) {
          dripAcc = 0;
          nextDrip = 1.2 + rand() * 3;
          plip(1200 + rand() * 500, 480, 0.09, 0.05 + rand() * 0.04);
        }
      }

      // Dread — swells toward whoever shouldn't be this close.
      dreadGain.gain.setTargetAtTime(a.dread * 0.13, now, 0.4);
    },

    step(surface) {
      if (!ctx) return;
      switch (surface) {
        case 3: // dirt
        case 7: // grass — a soft press, no report
          burst(0.07, "lowpass", 260, 0.07);
          break;
        case 2: // carpet — softer still
          burst(0.06, "lowpass", 190, 0.045);
          break;
        case 5: // wood — a knock on boards
          burst(0.05, "bandpass", 380, 0.09);
          break;
        case 6: // sewer water — a step and a small splash
          burst(0.06, "bandpass", 480, 0.07);
          plip(900 + rand() * 300, 420, 0.07, 0.02);
          break;
        case 4: // cobble
        case 1: // flagstone — the hard city click
        default:
          burst(0.045, "bandpass", 680 + rand() * 160, 0.08);
          break;
      }
    },

    bell() {
      if (!ctx) return;
      // A distant toll — inharmonic partials under a far-away lowpass.
      const base = 196;
      const partials = [0.5, 1, 1.19, 1.5, 2.02];
      const amps = [0.5, 0.42, 0.3, 0.22, 0.4];
      const t0 = ctx.currentTime;
      const dist = ctx.createBiquadFilter();
      dist.type = "lowpass";
      dist.frequency.value = 1300;
      dist.connect(master);
      for (let i = 0; i < partials.length; i++) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = base * partials[i];
        const g = ctx.createGain();
        g.gain.setValueAtTime(amps[i] * 0.09, t0);
        g.gain.exponentialRampToValueAtTime(0.0004, t0 + 3.5 + i * 0.4);
        o.connect(g).connect(dist);
        o.start(t0);
        o.stop(t0 + 4.2);
      }
    },

    tick() {
      burst(0.025, "bandpass", 2600, 0.028, 1.2);
    },

    coin() {
      plip(3400, 3300, 0.05, 0.05);
      plip(4300, 4100, 0.05, 0.04, 0.035);
    },

    sting() {
      if (!ctx) return;
      plip(140, 38, 0.5, 0.22);
      burst(0.3, "lowpass", 110, 0.18);
    },
  };
}
