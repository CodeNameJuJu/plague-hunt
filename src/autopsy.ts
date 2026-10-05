// The autopsy — a two-stage minigame on the pesthouse slab. First read the
// body: the marks hide in the skin (buboes, puncture tracks, stains) and you
// probe them by eye — no glowing guides. Then cut: the scalpel sweeps the
// wound line and only a click on the true mark makes a clean incision.
// Botched work frays the doctor's nerve; lose it all and the work is
// abandoned — what was already cut and recorded still stands.
// What the doctor sees changes with the body — the first corpse is plague;
// the second is something else entirely.

import { AUTOPSY_FINDINGS } from "./quests";

const SITES = [
  { name: "the head", x: 100, y: 38 },
  { name: "the chest", x: 100, y: 96 },
  { name: "the hands", x: 66, y: 142 },
  { name: "the belly", x: 100, y: 158 },
];

// Incision tuning — the cut zone is a few pixels either side of the mark,
// the blade sweeps faster the deeper into the body you go.
const CUT_HALF = 7;
const PROBE_RADIUS = 13;
const MISS_PROBE = 7;
const MISS_CUT = 18;
const NERVE_MAX = 100;

export interface AutopsyPanel {
  open(bodyIndex: number): void;
  close(): void;
  isOpen(): boolean;
}

export function initAutopsy(onDone: () => void): AutopsyPanel {
  const el = document.getElementById("autopsy")!;
  let open = false;
  let findings: string[] = [];
  let bodyIndex = 0;
  // Cut sites persist across openings — stepping back doesn't unwrite
  // what the scalpel already found.
  const doneSites = new Set<number>();
  const foundSites = new Set<number>();
  const scars: { x: number; y: number }[] = [];
  let doneBody = -1; // which corpse the recorded cuts belong to
  let cutting = -1; // site index in the incision phase, -1 = probing
  let nerve = NERVE_MAX;
  let t = 0;

  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 240;
  const ctx = canvas.getContext("2d")!;

  // Where each mark sits — the same body always carries the same signs, but
  // no two bodies mark the same places.
  function markAt(i: number): { x: number; y: number } {
    const h = (bodyIndex + 1) * 37 + i * 53;
    return {
      x: SITES[i].x + ((h * 13) % 11) - 5,
      y: SITES[i].y + ((h * 29) % 9) - 4,
    };
  }

  function drawBody(): void {
    ctx.clearRect(0, 0, 200, 240);
    // The slab — cold stone under him.
    ctx.fillStyle = "#2a2624";
    ctx.fillRect(30, 10, 140, 222);
    ctx.fillStyle = "#211d1b";
    ctx.fillRect(30, 10, 140, 4);
    // The body — grey skin gone waxy, a shroud pulled to the waist.
    const skin = "#5d564c";
    const skinDark = "#4a443c";
    const shroud = "#7a7264";
    ctx.fillStyle = skin;
    ctx.fillRect(90, 20, 20, 24); // head
    ctx.fillRect(88, 46, 24, 6); // neck
    ctx.fillRect(80, 52, 40, 62); // torso
    ctx.fillRect(60, 56, 16, 74); // left arm
    ctx.fillRect(124, 56, 16, 74); // right arm
    ctx.fillRect(58, 130, 18, 16); // left hand
    ctx.fillRect(124, 130, 18, 16); // right hand
    ctx.fillStyle = skinDark;
    ctx.fillRect(90, 20, 20, 3); // brow shadow
    ctx.fillRect(80, 100, 40, 3); // rib shadow
    ctx.fillStyle = shroud;
    ctx.fillRect(78, 114, 44, 110); // shroud over the legs
    ctx.fillStyle = "#6a6255";
    ctx.fillRect(78, 114, 44, 4); // fold
    ctx.fillStyle = "#5c544a";
    ctx.fillRect(78, 180, 44, 3); // crease
  }

  function drawMarks(): void {
    for (let i = 0; i < SITES.length; i++) {
      const s = SITES[i];
      const m = markAt(i);
      if (doneSites.has(i)) {
        // Done — a stitched mark where the incision was made.
        ctx.strokeStyle = "#8a7a58";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x - 5, s.y - 5);
        ctx.lineTo(s.x + 5, s.y + 5);
        ctx.moveTo(s.x + 5, s.y - 5);
        ctx.lineTo(s.x - 5, s.y + 5);
        ctx.stroke();
        continue;
      }
      // The anomaly — a quiet disturbance in the skin, never pointed at.
      ctx.fillStyle = "#37282b";
      ctx.fillRect(m.x - 1, m.y - 1, 3, 3);
      ctx.fillRect(m.x + 3, m.y, 2, 2);
      ctx.fillStyle = "#443235";
      ctx.fillRect(m.x - 2, m.y + 2, 2, 2);
      if (foundSites.has(i)) {
        // Found — a thin ring where the scalpel should fall.
        ctx.strokeStyle = "rgba(216, 178, 96, 0.75)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (cutting === i) {
        // The incision — a guide line, the true cut between the ticks, and
        // the blade sweeping across. Click when the blade crosses the mark.
        const span = 16;
        const bx = m.x + Math.sin(t * (2.1 + i * 0.35)) * span;
        ctx.strokeStyle = "rgba(200, 180, 140, 0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(m.x - span - 4, m.y);
        ctx.lineTo(m.x + span + 4, m.y);
        ctx.stroke();
        ctx.strokeStyle = "rgba(216, 178, 96, 0.9)";
        ctx.beginPath();
        ctx.moveTo(m.x - CUT_HALF, m.y - 3);
        ctx.lineTo(m.x - CUT_HALF, m.y + 3);
        ctx.moveTo(m.x + CUT_HALF, m.y - 3);
        ctx.lineTo(m.x + CUT_HALF, m.y + 3);
        ctx.stroke();
        ctx.fillStyle = "#d8c092";
        ctx.fillRect(Math.round(bx), m.y - 5, 1, 10);
        ctx.fillStyle = "#e8dcc0";
        ctx.fillRect(Math.round(bx) - 1, m.y - 7, 3, 3);
      }
    }
    // Botched work — dark gashes that never close.
    ctx.strokeStyle = "#4a1f1c";
    ctx.lineWidth = 2;
    for (const g of scars) {
      ctx.beginPath();
      ctx.moveTo(g.x - 4, g.y - 3);
      ctx.lineTo(g.x + 4, g.y + 3);
      ctx.stroke();
    }
  }

  function drawNerve(): void {
    // Composure — the bottom of the canvas is a steady-hand meter.
    ctx.fillStyle = "#14100c";
    ctx.fillRect(30, 226, 140, 8);
    const frac = nerve / NERVE_MAX;
    ctx.fillStyle = frac > 0.5 ? "#7a8a50" : frac > 0.25 ? "#9a7030" : "#8a3030";
    ctx.fillRect(31, 227, Math.round(138 * frac), 6);
    ctx.strokeStyle = "rgba(90, 78, 55, 0.6)";
    ctx.strokeRect(30, 226, 140, 8);
  }

  let box: HTMLElement | null = null;
  let findingEl: HTMLElement | null = null;
  let doneBtn: HTMLButtonElement | null = null;

  function say(html: string): void {
    if (findingEl) findingEl.textContent = html;
  }

  function sayFinding(i: number): void {
    if (!findingEl) return;
    findingEl.innerHTML = "";
    const site = document.createElement("b");
    site.textContent = `${SITES[i].name} — `;
    findingEl.append(site, findings[i] ?? "nothing to note.");
  }

  function breakNerve(): void {
    nerve = 0;
    cutting = -1;
    say("your hands will not steady — you have to step back from the slab.");
    if (doneBtn) {
      doneBtn.disabled = false;
      doneBtn.textContent = "step back";
    }
  }

  function render(): void {
    el.innerHTML = "";
    box = document.createElement("div");
    box.className = "autopsypanel";
    el.appendChild(box);

    const head = document.createElement("h2");
    head.textContent = "the autopsy";
    box.appendChild(head);

    const sub = document.createElement("p");
    sub.className = "dim";
    sub.textContent =
      "read the body — the marks are there if you look. then cut on the line, not beside it";
    box.appendChild(sub);

    box.appendChild(canvas);
    findingEl = document.createElement("p");
    findingEl.className = "finding";
    findingEl.textContent = "…";
    box.appendChild(findingEl);

    doneBtn = document.createElement("button");
    doneBtn.className = "shopclose";
    doneBtn.textContent = "finish the record";
    doneBtn.disabled = true;
    doneBtn.addEventListener("click", () => {
      const finished = nerve > 0;
      api.close();
      if (finished) onDone();
    });
    box.appendChild(doneBtn);
    if (doneSites.size === SITES.length) doneBtn.disabled = false;
  }

  canvas.addEventListener("click", (e) => {
    if (!open || nerve <= 0) return;
    const r = canvas.getBoundingClientRect();
    const cx = ((e.clientX - r.left) / r.width) * 200;
    const cy = ((e.clientY - r.top) / r.height) * 240;

    if (cutting >= 0) {
      // The incision — a click drops the blade where it sweeps. Clicking
      // well away from the wound line lifts the blade instead of cutting.
      const m = markAt(cutting);
      const i = cutting;
      const bx = m.x + Math.sin(t * (2.1 + i * 0.35)) * 16;
      cutting = -1;
      if (Math.abs(cy - m.y) > 10 || Math.abs(cx - m.x) > 24) {
        say("you lift the blade — not there.");
        return;
      }
      if (Math.abs(cx - bx) <= 4 && Math.abs(bx - m.x) <= CUT_HALF) {
        doneSites.add(i);
        foundSites.delete(i);
        sayFinding(i);
        if (doneSites.size === SITES.length && doneBtn) doneBtn.disabled = false;
      } else {
        // The blade slipped — a useless gash, and nerve spent on it.
        scars.push({ x: Math.max(40, Math.min(160, cx)), y: Math.max(20, Math.min(220, cy)) });
        nerve -= MISS_CUT;
        if (nerve <= 0) return breakNerve();
        say("the blade slips — a useless gash. again, steadier.");
      }
      return;
    }

    // Probing — the marks are small and quiet; guesswork costs nerve.
    for (let i = 0; i < SITES.length; i++) {
      if (doneSites.has(i)) continue;
      const m = markAt(i);
      const s = SITES[i];
      if (Math.hypot(cx - m.x, cy - m.y) > PROBE_RADIUS) continue;
      if (foundSites.has(i)) {
        cutting = i; // take up the scalpel on a mark you've read
      } else {
        foundSites.add(i);
        say(`there — under ${s.name}. something the skin was hiding. cut it open.`);
      }
      return;
    }
    nerve -= MISS_PROBE;
    if (nerve <= 0) return breakNerve();
    say("you prod where nothing answers — only cold flesh.");
  });

  let raf = 0;
  function tick(): void {
    if (!open) return;
    t += 1 / 30;
    drawBody();
    drawMarks();
    drawNerve();
    raf = requestAnimationFrame(tick);
  }

  const api: AutopsyPanel = {
    open(idx) {
      open = true;
      bodyIndex = idx;
      if (idx !== doneBody) {
        // A fresh body — the old scars and stitch marks belong to another.
        doneSites.clear();
        scars.length = 0;
        doneBody = idx;
      }
      foundSites.clear();
      cutting = -1;
      nerve = NERVE_MAX;
      findings = AUTOPSY_FINDINGS[Math.min(idx, AUTOPSY_FINDINGS.length - 1)];
      el.classList.add("open");
      render();
      t = 0;
      tick();
      document.exitPointerLock();
    },
    close() {
      open = false;
      cancelAnimationFrame(raf);
      el.classList.remove("open");
      const c = document.getElementById("game") as HTMLCanvasElement;
      c.requestPointerLock();
    },
    isOpen() {
      return open;
    },
  };
  return api;
}
