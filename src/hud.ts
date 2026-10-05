// DOM HUD — bars for needs, a clock, the hotbar, a Tab inventory panel
// with crafting, a centre reticle, prompts, damage flash.

import { canCraft, carried, count, RECIPES } from "./inventory";
import { binds, keyName } from "./settings";
import { ITEMS } from "./items";
import type { Inventory } from "./inventory";
import type { ItemId } from "./types";
import type { SpriteTex } from "./types";

export interface Hud {
  setNeeds(health: number, hunger: number, thirst: number, fatigue: number): void;
  setClock(text: string): void;
  setInventory(inv: Inventory): void;
  flashSlot(id: string, ok: boolean): void;
  flashReticle(): void;
  togglePanel(open: boolean, inv: Inventory): void;
  refreshPanel(inv: Inventory): void;
  setPrompt(text: string | null): void;
  setQuest(text: string): void;
  setDialog(
    speaker: string | null,
    text?: string,
    more?: boolean,
    topics?: TopicView[]
  ): void;
  setDamage(active: boolean): void;
  setCompass(px: number, py: number, angle: number, landmarks: { name: string; x: number; y: number }[]): void;
}

// One row of the interrogation menu — number to press, what you'd ask.
export interface TopicView {
  key: number;
  label: string;
  locked: boolean;
  hint?: string;
}

export interface PanelHandlers {
  use(id: ItemId): void;
  craft(index: number): void;
}

// Hotbar slots: consumables with hotkeys, planks as a count, and the purse.
const SLOTS: { id: string; key: string }[] = [
  { id: "bread", key: "1" },
  { id: "skin", key: "2" },
  { id: "bandage", key: "3" },
  { id: "planks", key: "" },
  { id: "sous", key: "" },
];

function texToCanvas(tex: SpriteTex): HTMLCanvasElement {
  // World sprites are bottom-anchored inside a full frame — crop to the
  // opaque bounds so an icon fills its slot instead of spilling over it.
  const src = document.createElement("canvas");
  src.width = tex.w;
  src.height = tex.h;
  const sctx = src.getContext("2d")!;
  const img = sctx.createImageData(tex.w, tex.h);
  img.data.set(tex.data);
  sctx.putImageData(img, 0, 0);
  let minX = tex.w,
    minY = tex.h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < tex.h; y++) {
    for (let x = 0; x < tex.w; x++) {
      if (tex.data[(y * tex.w + x) * 4 + 3] <= 16) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const c = document.createElement("canvas");
  c.width = Math.max(1, maxX - minX + 1);
  c.height = Math.max(1, maxY - minY + 1);
  if (maxX >= 0) c.getContext("2d")!.drawImage(src, minX, minY, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

const USE_VERB: Record<string, string> = { food: "eat", drink: "drink", heal: "use" };

// The paper doll — a plague doctor in profile, beak and brimmed hat, drawn at
// 36×64 and upscaled. A portrait of the man himself, not a gear board.
function drawDoll(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 36;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const px = (x: number, y: number, w: number, h: number, col: string): void => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  };
  const stroke = (x0: number, y0: number, x1: number, y1: number, w: number, col: string): void => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };

  const robe = "#241d18";
  const leather = "#7a5c38";

  // Wide-brimmed hat
  px(15, 4, 9, 5, "#161210");
  px(8, 9, 24, 3, "#161210");
  px(8, 11, 24, 1, "#0d0a08");
  // Leather mask and the long beak, pointing left
  px(16, 12, 8, 8, leather);
  px(10, 14, 6, 3, leather);
  px(8, 15, 3, 2, "#5c422a");
  px(20, 14, 2, 2, "#39291a"); // goggle lens
  // Robe — fitted shoulders flaring to a hem
  px(14, 20, 12, 14, robe);
  px(12, 34, 16, 16, robe);
  px(14, 20, 12, 2, "#1a1410");
  px(25, 20, 1, 30, "#181310"); // back edge shading
  // Belt and buckle
  px(14, 33, 12, 2, "#4a3826");
  px(19, 33, 2, 2, "#8a744a");
  // Left arm reaching down, hand out
  px(12, 23, 3, 13, robe);
  px(12, 36, 3, 3, leather);
  // Legs and boots under the hem
  px(15, 50, 4, 11, "#14100d");
  px(22, 50, 4, 11, "#14100d");
  px(13, 60, 6, 3, "#0d0a08");
  px(21, 60, 6, 3, "#0d0a08");

  // The satchel he carries his tools in — strap over the shoulder.
  stroke(14, 21, 25, 40, 2, "#4a3826");
  px(24, 38, 6, 8, "#5c4228");
  px(24, 38, 6, 1, "#75543a");

  return c;
}

export function initHud(icons: Record<string, SpriteTex>, handlers: PanelHandlers): Hud {
  const health = document.getElementById("bar-health")!;
  const hunger = document.getElementById("bar-hunger")!;
  const thirst = document.getElementById("bar-thirst")!;
  const fatigue = document.getElementById("bar-fatigue")!;
  const clock = document.getElementById("clock")!;
  const invBar = document.getElementById("inv")!;
  const prompt = document.getElementById("prompt")!;
  const questEl = document.getElementById("quest")!;
  const dialog = document.getElementById("dialog")!;
  const damage = document.getElementById("damage")!;
  const reticle = document.getElementById("reticle")!;
  const panel = document.getElementById("inventory")!;
  const compass = document.getElementById("compass") as HTMLCanvasElement;
  const cctx = compass.getContext("2d")!;

  const counts: Record<string, HTMLElement> = {};
  const slots: Record<string, HTMLElement> = {};

  for (const def of SLOTS) {
    const slot = document.createElement("div");
    slot.className = "slot" + (def.id === "sous" ? " equip" : "");
    slot.title = def.id === "sous" ? "sous" : ITEMS[def.id as ItemId].name;
    const iconHolder = document.createElement("div");
    iconHolder.className = "icon";
    const count = document.createElement("b");
    count.className = "count";
    const key = document.createElement("span");
    key.className = "key";
    key.textContent = def.key;
    slot.append(iconHolder, count, key);
    invBar.appendChild(slot);
    slots[def.id] = slot;
    counts[def.id] = count;
    const iconName = def.id === "sous" ? "coin" : def.id;
    if (icons[iconName]) iconHolder.appendChild(texToCanvas(icons[iconName]));
  }

  // --- inventory panel ------------------------------------------------------

  function itemCell(def: (typeof ITEMS)[ItemId], n: number): HTMLElement {
    const cell = document.createElement("div");
    cell.className = "item";
    cell.appendChild(texToCanvas(icons[def.icon]));
    const txt = document.createElement("div");
    const t = document.createElement("b");
    t.textContent = def.name;
    const s = document.createElement("span");
    const verb = USE_VERB[def.type] ?? "";
    s.textContent = verb ? `${verb} · ×${n}` : `×${n}`;
    txt.append(t, s);
    cell.append(txt);
    cell.addEventListener("click", () => handlers.use(def.id));
    return cell;
  }

  function refreshPanel(inv: Inventory): void {
    panel.innerHTML = "";
    const box = document.createElement("div");
    box.className = "invpanel";
    panel.appendChild(box);

    const head = document.createElement("h2");
    head.textContent = "your pack";
    box.appendChild(head);

    // The paper doll — the doctor himself, satchel and all.
    const dollrow = document.createElement("div");
    dollrow.className = "dollrow";
    const doll = document.createElement("div");
    doll.className = "doll";
    doll.appendChild(drawDoll());
    const dollinfo = document.createElement("div");
    dollinfo.className = "dollslots";
    const purse = document.createElement("div");
    purse.className = "eqrow";
    const purseTxt = document.createElement("div");
    purseTxt.className = "eqtxt";
    const purseName = document.createElement("b");
    purseName.textContent = `${inv.sous} sous`;
    const purseSub = document.createElement("span");
    purseSub.textContent = "the crown's coin, for bread and remedies";
    purseTxt.append(purseName, purseSub);
    purse.appendChild(purseTxt);
    const journalHint = document.createElement("div");
    journalHint.className = "eqrow";
    const jTxt = document.createElement("div");
    jTxt.className = "eqtxt";
    const jName = document.createElement("b");
    jName.textContent = "the journal";
    const jSub = document.createElement("span");
    jSub.textContent = `press ${keyName(binds.journal)} · or write at the inn desk`;
    jTxt.append(jName, jSub);
    journalHint.appendChild(jTxt);
    dollinfo.append(purse, journalHint);
    dollrow.append(doll, dollinfo);
    box.appendChild(dollrow);

    // Carried items — click to eat/drink/use.
    const grid = document.createElement("div");
    grid.className = "items";
    const things = carried(inv);
    if (things.length === 0) {
      const empty = document.createElement("p");
      empty.className = "dim";
      empty.textContent = "nothing but the clothes on your back";
      grid.appendChild(empty);
    }
    for (const { def, n } of things) {
      grid.appendChild(itemCell(def, n));
    }
    box.appendChild(grid);

    // Crafting
    const cHead = document.createElement("h3");
    cHead.textContent = "crafting";
    box.appendChild(cHead);
    const rec = document.createElement("div");
    rec.className = "recipes";
    RECIPES.forEach((r, i) => {
      const row = document.createElement("div");
      row.className = "recipe" + (canCraft(inv, r) ? "" : " short");
      const mats = r.needs.map(([id, n]) => `${ITEMS[id].name} ${count(inv, id)}/${n}`).join(" · ");
      const out = ITEMS[r.out];
      row.appendChild(texToCanvas(icons[out.icon]));
      const txt = document.createElement("div");
      txt.append(
        Object.assign(document.createElement("b"), { textContent: `${out.name} ×${r.n}` }),
        Object.assign(document.createElement("span"), { textContent: mats })
      );
      row.appendChild(txt);
      const btn = document.createElement("button");
      btn.textContent = "craft";
      btn.disabled = !canCraft(inv, r);
      btn.addEventListener("click", () => handlers.craft(i));
      row.appendChild(btn);
      rec.appendChild(row);
    });
    box.appendChild(rec);

    const hint = document.createElement("p");
    hint.className = "dim hintline";
    hint.textContent = "tab to close · click to use";
    box.appendChild(hint);
  }

  return {
    setNeeds(h, hu, t, f) {
      health.style.width = `${h}%`;
      hunger.style.width = `${hu}%`;
      thirst.style.width = `${t}%`;
      fatigue.style.width = `${f}%`;
      hunger.parentElement!.classList.toggle("empty", hu === 0);
      thirst.parentElement!.classList.toggle("empty", t === 0);
      fatigue.parentElement!.classList.toggle("empty", f < 22);
    },
    setClock(text) {
      clock.textContent = text;
    },
    setInventory(inv) {
      for (const def of SLOTS) {
        if (def.id === "sous") {
          counts.sous.textContent = `${inv.sous}`;
          slots.sous.classList.toggle("empty", inv.sous === 0);
        } else {
          const n = count(inv, def.id as ItemId);
          counts[def.id].textContent = `${n}`;
          slots[def.id].classList.toggle("empty", n === 0);
        }
      }
    },
    flashSlot(id, ok) {
      const slot = slots[id];
      if (!slot) return;
      slot.classList.remove("pulse", "deny");
      void slot.offsetWidth;
      slot.classList.add(ok ? "pulse" : "deny");
    },
    flashReticle() {
      reticle.classList.remove("hit");
      void reticle.offsetWidth;
      reticle.classList.add("hit");
    },
    togglePanel(open, inv) {
      panel.classList.toggle("open", open);
      if (open) refreshPanel(inv);
    },
    refreshPanel,
    setPrompt(text) {
      prompt.textContent = text ? `[${keyName(binds.interact)}] ${text}` : "";
    },
    setQuest(text) {
      questEl.textContent = text;
    },
    setDialog(speaker, text, more = true, topics) {
      if (!speaker) {
        dialog.classList.remove("open");
        return;
      }
      dialog.classList.add("open");
      dialog.innerHTML = "";
      const name = document.createElement("b");
      name.textContent = speaker;
      dialog.appendChild(name);
      if (topics) {
        // Interrogation — numbered subjects, locked ones shown as hints.
        const list = document.createElement("div");
        list.className = "topics";
        for (const t of topics) {
          const row = document.createElement("div");
          row.className = "topic" + (t.locked ? " locked" : "");
          const key = document.createElement("span");
          key.className = "tkey";
          key.textContent = `${t.key}`;
          const label = document.createElement("span");
          label.textContent = t.locked ? `??? — ${t.hint ?? "something is missing"}` : t.label;
          row.append(key, label);
          list.appendChild(row);
        }
        dialog.appendChild(list);
        const hint = document.createElement("span");
        hint.className = "cont";
        hint.textContent = `[1-${topics.length}] ask · [${keyName(binds.interact)}] leave`;
        dialog.appendChild(hint);
      } else {
        const line = document.createElement("p");
        line.textContent = text ?? "";
        const hint = document.createElement("span");
        hint.className = "cont";
        hint.textContent = more ? `[${keyName(binds.interact)}] ›` : `[${keyName(binds.interact)}] end`;
        dialog.append(line, hint);
      }
    },
    setDamage(active) {
      damage.classList.toggle("on", active);
    },
    setCompass(px, py, angle, landmarks) {
      const cw = compass.width;
      const ch = compass.height;
      cctx.clearRect(0, 0, cw, ch);

      // Map axes: +x is east, +y is south — so facing north is (0, -1).
      const heading = Math.atan2(Math.cos(angle), -Math.sin(angle));
      const pxPerRad = 120;
      const range = cw / 2 / pxPerRad; // half-width of the visible arc
      const wrap = (b: number): number => {
        const d = (b - heading) % (Math.PI * 2);
        return d > Math.PI ? d - Math.PI * 2 : d < -Math.PI ? d + Math.PI * 2 : d;
      };
      const fade = (d: number): number => 1 - (Math.abs(d) / range) ** 2;

      // Degree ticks every 15°.
      cctx.strokeStyle = "rgba(160, 140, 100, 0.5)";
      cctx.lineWidth = 1;
      for (let deg = 0; deg < 360; deg += 15) {
        const d = wrap((deg * Math.PI) / 180);
        if (Math.abs(d) > range) continue;
        const x = cw / 2 + d * pxPerRad;
        cctx.globalAlpha = fade(d) * 0.6;
        cctx.beginPath();
        cctx.moveTo(x, 4);
        cctx.lineTo(x, deg % 45 === 0 ? 10 : 7);
        cctx.stroke();
      }
      cctx.globalAlpha = 1;

      // Cardinal letters.
      cctx.font = "11px Georgia, serif";
      cctx.textAlign = "center";
      const cardinals: [string, number][] = [
        ["N", 0],
        ["E", Math.PI / 2],
        ["S", Math.PI],
        ["W", (3 * Math.PI) / 2],
      ];
      for (const [letter, b] of cardinals) {
        const d = wrap(b);
        if (Math.abs(d) > range) continue;
        cctx.fillStyle = `rgba(216, 192, 146, ${0.35 + 0.65 * fade(d)})`;
        cctx.fillText(letter, cw / 2 + d * pxPerRad, 10);
      }

      // Landmark bearings — gold diamonds with names when near the centre.
      for (const lm of landmarks) {
        const d = wrap(Math.atan2(lm.x - px, -(lm.y - py)));
        if (Math.abs(d) > range) continue;
        const x = cw / 2 + d * pxPerRad;
        cctx.globalAlpha = 0.4 + 0.6 * fade(d);
        cctx.fillStyle = "#c9a860";
        cctx.beginPath();
        cctx.moveTo(x, ch - 10);
        cctx.lineTo(x + 3, ch - 6);
        cctx.lineTo(x, ch - 2);
        cctx.lineTo(x - 3, ch - 6);
        cctx.closePath();
        cctx.fill();
        if (Math.abs(d) < 0.5) {
          cctx.font = "8px Georgia, serif";
          cctx.fillStyle = "rgba(216, 196, 154, 0.9)";
          cctx.fillText(lm.name, x, ch - 13);
          cctx.font = "11px Georgia, serif";
        }
      }
      cctx.globalAlpha = 1;

      // Centre needle.
      cctx.strokeStyle = "#e8d8a8";
      cctx.beginPath();
      cctx.moveTo(cw / 2, 2);
      cctx.lineTo(cw / 2, 14);
      cctx.stroke();
    },
  };
}

export function describeTime(tday: number, day: number): string {
  const phase =
    tday < 0.06 ? "dawn" : tday < 0.45 ? "day" : tday < 0.55 ? "dusk" : "night";
  return `day ${day} — ${phase}`;
}
