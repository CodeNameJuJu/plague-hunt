// The shop counter — opened by talking to a shopkeeper. Releases the mouse
// (the panel is .nolock) so wares can be clicked; the purse lives in sous.
// Shops keep the free quarter's economy: bread, skins, linen, remedies.

import { ITEMS, SHOPS } from "./items";
import { count } from "./inventory";
import type { Inventory } from "./inventory";
import type { SpriteTex } from "./types";

const SHOP_NAMES: Record<string, string> = {
  baker: "baker colin's stall",
  innkeep: "the inn — mistress hélène",
  aubert: "maître aubert's counter",
};

export interface ShopPanel {
  open(shopId: string, inv: Inventory): void;
  close(): void;
  isOpen(): boolean;
}

export function initShop(
  icons: Record<string, SpriteTex>,
  texToCanvas: (tex: SpriteTex) => HTMLCanvasElement,
  onChange: () => void
): ShopPanel {
  const el = document.getElementById("shop")!;
  let open = false;
  let inv: Inventory | null = null;
  let shopId = "";

  function texCanvas(tex: SpriteTex): HTMLCanvasElement {
    return texToCanvas(tex);
  }

  function render(): void {
    if (!inv) return;
    el.innerHTML = "";
    const box = document.createElement("div");
    box.className = "shoppanel";
    el.appendChild(box);

    const head = document.createElement("h2");
    head.textContent = SHOP_NAMES[shopId] ?? "the counter";
    box.appendChild(head);

    const purse = document.createElement("p");
    purse.className = "purse";
    purse.textContent = `your purse — ${inv.sous} sous`;
    box.appendChild(purse);

    const list = document.createElement("div");
    list.className = "wares";
    for (const ware of SHOPS[shopId] ?? []) {
      const def = ITEMS[ware.item];
      const row = document.createElement("div");
      row.className = "ware";
      row.appendChild(texCanvas(icons[def.icon]));
      const txt = document.createElement("div");
      const name = document.createElement("b");
      name.textContent = def.name;
      const price = document.createElement("span");
      price.textContent = `${ware.price} sous · you carry ${count(inv, ware.item)}`;
      txt.append(name, price);
      row.appendChild(txt);
      const btn = document.createElement("button");
      btn.textContent = "buy";
      btn.disabled = inv.sous < ware.price;
      btn.addEventListener("click", () => {
        if (!inv || inv.sous < ware.price) return;
        inv.sous -= ware.price;
        inv.items[ware.item] = count(inv, ware.item) + 1;
        onChange();
        render();
      });
      row.appendChild(btn);
      list.appendChild(row);
    }
    box.appendChild(list);

    const close = document.createElement("button");
    close.className = "shopclose";
    close.textContent = "leave";
    close.addEventListener("click", () => api.close());
    box.appendChild(close);
  }

  const api: ShopPanel = {
    open(id, inventory) {
      shopId = id;
      inv = inventory;
      open = true;
      el.classList.add("open");
      render();
      document.exitPointerLock();
    },
    close() {
      open = false;
      el.classList.remove("open");
      const canvas = document.getElementById("game") as HTMLCanvasElement;
      canvas.requestPointerLock();
    },
    isOpen() {
      return open;
    },
  };
  return api;
}
