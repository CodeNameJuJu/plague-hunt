// The casebook — the detective's record. Three sections on one parchment:
// the evidence gathered (clues), the conclusions it adds up to (deductions),
// and the dated journal of the days' work. Opened with the journal key or at
// the inn desk. Keyboard-only like the city map: the world keeps moving
// while you read.

import type { QuestState } from "./quests";
import { CLUES, DEDUCTIONS } from "./clues";
import { binds, keyName } from "./settings";
import { adornPanel } from "./ornaments";

export interface JournalPanel {
  toggle(q: QuestState): void;
  close(): void;
  isOpen(): boolean;
}

export function initJournal(): JournalPanel {
  const el = document.getElementById("journal")!;
  let open = false;

  function render(q: QuestState): void {
    el.innerHTML = "";
    const box = document.createElement("div");
    box.className = "journalpage";
    adornPanel(box);
    el.appendChild(box);

    const head = document.createElement("h2");
    head.textContent = "the casebook";
    box.appendChild(head);

    const list = document.createElement("div");
    list.className = "jentries";

    // --- the evidence -------------------------------------------------------
    const evHead = document.createElement("h3");
    evHead.textContent = "the evidence";
    list.appendChild(evHead);
    if (q.clues.size === 0) {
      const none = document.createElement("p");
      none.className = "jdim";
      none.textContent = "nothing yet — examine what the quarter leaves lying in plain sight, and press the people who live here.";
      list.appendChild(none);
    } else {
      for (const id of q.clues) {
        const c = CLUES[id];
        if (!c) continue;
        const row = document.createElement("div");
        row.className = "jclue";
        const name = document.createElement("b");
        name.textContent = c.name;
        const text = document.createElement("p");
        text.textContent = c.text;
        row.append(name, text);
        list.appendChild(row);
      }
    }

    // --- what it adds up to ---------------------------------------------------
    const ddHead = document.createElement("h3");
    ddHead.textContent = "what it adds up to";
    list.appendChild(ddHead);
    const reached = DEDUCTIONS.filter((d) => q.deductions.has(d.id));
    const pending = DEDUCTIONS.filter((d) => !q.deductions.has(d.id));
    if (reached.length === 0 && pending.length === 0) {
      const none = document.createElement("p");
      none.className = "jdim";
      none.textContent = "no conclusions yet.";
      list.appendChild(none);
    } else {
      for (const d of reached) {
        const row = document.createElement("div");
        row.className = "jdeduction";
        const name = document.createElement("b");
        name.textContent = d.name;
        const text = document.createElement("p");
        text.textContent = d.text;
        row.append(name, text);
        list.appendChild(row);
      }
      // Unresolved threads — the pieces you still lack, shown as a nudge.
      for (const d of pending) {
        const held = d.needs.filter((n) => q.clues.has(n)).length;
        if (held === 0) continue; // no thread at all yet — don't leak it
        const row = document.createElement("div");
        row.className = "jdeduction missing";
        const name = document.createElement("b");
        name.textContent = "? ? ?";
        const text = document.createElement("p");
        text.textContent = `something still missing — ${held}/${d.needs.length} pieces in hand`;
        row.append(name, text);
        list.appendChild(row);
      }
    }

    // --- the journal ----------------------------------------------------------
    const jHead = document.createElement("h3");
    jHead.textContent = "the journal";
    list.appendChild(jHead);
    for (const entry of q.journal) {
      const row = document.createElement("div");
      row.className = "jentry";
      const stamp = document.createElement("b");
      stamp.textContent = `day ${entry.day}`;
      const text = document.createElement("p");
      text.textContent = entry.text;
      row.append(stamp, text);
      list.appendChild(row);
    }
    box.appendChild(list);

    const hint = document.createElement("p");
    hint.className = "jhint";
    hint.textContent = `[${keyName(binds.journal)}] close`;
    box.appendChild(hint);

    // Newest entry at the bottom — scroll it into view.
    list.scrollTop = list.scrollHeight;
  }

  return {
    toggle(q) {
      open = !open;
      el.classList.toggle("open", open);
      if (open) render(q);
    },
    close() {
      open = false;
      el.classList.remove("open");
    },
    isOpen() {
      return open;
    },
  };
}
