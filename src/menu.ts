// The menu — title screen and pause menu in one. Three pages: main
// (descend/settings/controls), settings sliders, and a controls list with
// click-to-rebind. Whole overlay is .nolock so menu clicks never grab the
// mouse; only the descend button re-locks.

import {
  ACTION_LABELS,
  binds,
  keyName,
  saveBinds,
  saveSettings,
  settings,
} from "./settings";
import type { Action } from "./settings";
import { maskTex, texCanvas } from "./sprites";

export interface Menu {
  setDead(dead: boolean): void;
}

export function initMenu(display: HTMLCanvasElement, onDescend: () => void): Menu {
  const root = document.getElementById("overlay")!;
  root.classList.add("nolock");

  // Drifting embers and ash behind the title card — the city's own weather.
  const motes = document.createElement("canvas");
  motes.className = "motes";
  const mctx = motes.getContext("2d")!;
  interface Mote { x: number; y: number; vx: number; vy: number; r: number; shade: number; kind: number }
  const parts: Mote[] = [];
  for (let i = 0; i < 70; i++) {
    parts.push({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.012,
      vy: i < 40 ? -(0.008 + Math.random() * 0.02) : (Math.random() - 0.4) * 0.008,
      r: i < 40 ? 0.8 + Math.random() * 1.8 : 0.5 + Math.random() * 1.2,
      shade: Math.random(),
      kind: i < 40 ? 0 : i < 58 ? 1 : 2, // embers, ash, miasma
    });
  }
  let mLast = 0;
  function moteTick(now: number): void {
    requestAnimationFrame(moteTick);
    if (root.classList.contains("hidden")) { mLast = now; return; }
    const dt = Math.min(0.05, (now - mLast) / 1000);
    mLast = now;
    const w = (motes.width = innerWidth);
    const h = (motes.height = innerHeight);
    mctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.x += p.vx * dt * 60 + Math.sin(now * 0.0004 + p.shade * 9) * 0.0003;
      p.y += p.vy * dt * 60;
      if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
      if (p.y > 1.02) p.y = -0.02;
      if (p.x < -0.02) p.x = 1.02;
      if (p.x > 1.02) p.x = -0.02;
      const flick = 0.5 + Math.sin(now * 0.003 + p.shade * 20) * 0.4;
      if (p.kind === 0) mctx.fillStyle = `rgba(255,${140 + p.shade * 80},50,${0.35 * flick})`;
      else if (p.kind === 1) mctx.fillStyle = `rgba(160,150,130,${0.16 * flick})`;
      else mctx.fillStyle = `rgba(110,150,110,${0.10 * flick})`;
      mctx.fillRect(p.x * w, p.y * h, p.r, p.r);
    }
  }
  requestAnimationFrame(moteTick);

  const panel = document.createElement("div");
  panel.className = "panel";
  const emblem = texCanvas(maskTex());
  emblem.className = "emblem";
  const title = document.createElement("h1");
  const rule = document.createElement("div");
  rule.className = "rule";
  rule.textContent = "⸻";
  const sub = document.createElement("p");
  sub.className = "sub";
  panel.append(emblem, title, rule, sub);
  const pages = document.createElement("div");
  panel.appendChild(pages);
  root.innerHTML = "";
  root.appendChild(motes);
  root.appendChild(panel);

  // --- main page ------------------------------------------------------------

  const main = document.createElement("div");
  main.className = "menu";
  const btnResume = menuBtn("descend");
  const btnSettings = menuBtn("settings");
  const btnControls = menuBtn("controls");
  main.append(btnResume, btnSettings, btnControls);
  pages.appendChild(main);

  // --- settings page ----------------------------------------------------------

  const settingsPage = document.createElement("div");
  settingsPage.className = "menu hidden";

  function slider(label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void): HTMLElement {
    const row = document.createElement("div");
    row.className = "setrow";
    const l = document.createElement("span");
    l.textContent = label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = `${min}`;
    input.max = `${max}`;
    input.step = `${step}`;
    input.value = `${get()}`;
    const val = document.createElement("b");
    const show = (): void => {
      val.textContent = label === "field of view" ? `${Math.round(get() * 180 / Math.PI)}°` : `${Math.round(get() * 100)}%`;
    };
    input.addEventListener("input", () => {
      set(parseFloat(input.value));
      saveSettings();
      show();
    });
    show();
    row.append(l, input, val);
    return row;
  }

  settingsPage.append(
    slider("mouse sensitivity", 0.3, 2, 0.05, () => settings.sensitivity, (v) => (settings.sensitivity = v)),
    slider("field of view", Math.PI / 3.6, Math.PI / 1.8, Math.PI / 180, () => settings.fov, (v) => (settings.fov = v)),
    slider("brightness", 0.6, 1.5, 0.05, () => settings.brightness, (v) => {
      settings.brightness = v;
      display.style.filter = v === 1 ? "" : `brightness(${v})`;
    })
  );

  const grainRow = document.createElement("div");
  grainRow.className = "setrow";
  const grainLabel = document.createElement("span");
  grainLabel.textContent = "film grain";
  const grainBox = document.createElement("input");
  grainBox.type = "checkbox";
  grainBox.checked = settings.grain;
  grainBox.addEventListener("change", () => {
    settings.grain = grainBox.checked;
    saveSettings();
  });
  grainRow.append(grainLabel, grainBox, document.createElement("b"));
  settingsPage.appendChild(grainRow);
  settingsPage.appendChild(backBtn());
  pages.appendChild(settingsPage);

  // --- controls page ----------------------------------------------------------

  const controlsPage = document.createElement("div");
  controlsPage.className = "menu hidden";

  let waiting: Action | null = null;
  const bindBtns: Partial<Record<Action, HTMLButtonElement>> = {};

  function refreshBinds(): void {
    for (const [a, btn] of Object.entries(bindBtns) as [Action, HTMLButtonElement][]) {
      btn.textContent = a === waiting ? "press a key…" : keyName(binds[a]);
      btn.classList.toggle("waiting", a === waiting);
    }
  }

  for (const action of Object.keys(ACTION_LABELS) as Action[]) {
    const row = document.createElement("div");
    row.className = "bindrow";
    const l = document.createElement("span");
    l.textContent = ACTION_LABELS[action];
    const btn = document.createElement("button");
    btn.className = "bindkey";
    bindBtns[action] = btn;
    btn.addEventListener("click", () => {
      waiting = action;
      refreshBinds();
    });
    row.append(l, btn);
    controlsPage.appendChild(row);
  }
  refreshBinds();

  // Capture the next keypress for the waiting bind. Esc cancels.
  window.addEventListener("keydown", (e) => {
    if (!waiting) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code !== "Escape") {
      // Swap with whichever action already holds this key, if any.
      for (const a of Object.keys(binds) as Action[]) {
        if (a !== waiting && binds[a] === e.code) binds[a] = binds[waiting];
      }
      binds[waiting] = e.code;
      saveBinds();
    }
    waiting = null;
    refreshBinds();
  }, true);

  const fixed = document.createElement("p");
  fixed.className = "dim bindnote";
  fixed.textContent = "mouse — look · esc — menu";
  controlsPage.appendChild(fixed);
  controlsPage.appendChild(backBtn());
  pages.appendChild(controlsPage);

  // --- plumbing -----------------------------------------------------------------

  function menuBtn(text: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "menubtn";
    b.textContent = text;
    return b;
  }

  function backBtn(): HTMLButtonElement {
    const b = menuBtn("back");
    b.classList.add("small");
    b.addEventListener("click", () => show("main"));
    return b;
  }

  const allPages = [main, settingsPage, controlsPage];
  function show(page: "main" | "settings" | "controls"): void {
    allPages.forEach((p) => p.classList.add("hidden"));
    (page === "main" ? main : page === "settings" ? settingsPage : controlsPage).classList.remove("hidden");
  }

  btnResume.addEventListener("click", onDescend);
  btnSettings.addEventListener("click", () => show("settings"));
  btnControls.addEventListener("click", () => show("controls"));

  // Clicking the backdrop (outside the panel) also descends.
  root.addEventListener("click", (e) => {
    if (e.target === root) btnResume.click();
  });

  return {
    setDead(dead) {
      title.textContent = dead ? "YOU DIED" : "PLAGUE HUNT";
      sub.textContent = dead
        ? "the plague takes another"
        : "paris · anno domini 1348 · you are the plague doctor";
      btnResume.textContent = dead ? "rise again" : "descend";
      if (dead) show("main");
    },
  };
}
