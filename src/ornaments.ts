// Procedural gothic ornament for the interface — carved limestone, blind
// arcades and tracery drawn onto canvases at runtime so the UI stays
// asset-free like everything else. The Notre Dame look is masonry, not
// glass: warm ashlar blocks, deep recessed openings, worn relief.

const STONE = "#3a3024";
const STONE_LIT = "#5a4c34";
const RECESS = "#0e0b09";
const MORTAR = "rgba(14, 11, 9, 0.55)";

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// An annular sector — the petal-shaped pane a rose window is built from.
function petal(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  rIn: number, rOut: number,
  a0: number, a1: number
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, rOut, a0, a1);
  ctx.lineTo(cx + Math.cos(a1) * rIn, cy + Math.sin(a1) * rIn);
  ctx.arc(cx, cy, rIn, a1, a0, true);
  ctx.closePath();
}

// A wall of ashlar — limestone courses with staggered joints and mortar
// shadows. Drawn into the current fill context over the given rect.
function ashlar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed = 3): void {
  const rand = rng(seed);
  const course = Math.max(6, h / 8);
  ctx.fillStyle = STONE;
  ctx.fillRect(x, y, w, h);
  for (let cy = y; cy < y + h; cy += course) {
    const row = Math.round((cy - y) / course);
    // Per-block tint — weathered courses, no two alike.
    for (let cx0 = x - ((row % 2) * course); cx0 < x + w; cx0 += course * 2) {
      const jit = 0.9 + rand() * 0.22;
      ctx.fillStyle = `rgb(${58 * jit | 0},${48 * jit | 0},${36 * jit | 0})`;
      ctx.fillRect(cx0 + 1, cy + 1, course * 2 - 2, course - 2);
    }
    // Mortar bed between courses.
    ctx.fillStyle = MORTAR;
    ctx.fillRect(x, cy, w, 1);
  }
}

// The carved rose — a stone boss: concentric bands of petal-shaped openings
// sunk into the block. Recesses go black at the back with a sliver of light
// on the upper lip, the way a deep carving catches ambient.
export function roseWindow(px: number, seed = 7): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const ctx = c.getContext("2d")!;
  const cx = px / 2, cy = px / 2;
  const R = px / 2 - px * 0.02;
  const rand = rng(seed);

  // Stone disc and its carved rim — lit on top like the world's light.
  ctx.fillStyle = STONE;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = STONE_LIT;
  ctx.lineWidth = Math.max(1, px * 0.012);
  ctx.beginPath();
  ctx.arc(cx, cy, R - ctx.lineWidth, -Math.PI * 0.75, Math.PI * 0.1);
  ctx.stroke();

  // Small trefoil cusps around the rim.
  ctx.fillStyle = STONE;
  const cusps = 16;
  for (let i = 0; i < cusps; i++) {
    const a = (i / cusps) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * R * 0.985, cy + Math.sin(a) * R * 0.985, R * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }

  // Petal bands — narrow lancets outside, wider petals in the middle ring,
  // then the rosette. Each petal is a recess: dark opening, lit upper lip.
  const bands: [number, number, number][] = [
    [R * 0.58, R * 0.9, 24],
    [R * 0.34, R * 0.54, 12],
    [R * 0.12, R * 0.3, 8],
  ];
  for (const [rIn, rOut, n] of bands) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + Math.PI / n * 0.5;
      const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / n * 0.5;
      petal(ctx, cx, cy, rIn, rOut, a0, a1);
      ctx.fillStyle = RECESS;
      ctx.fill();
      ctx.strokeStyle = "#241c12";
      ctx.lineWidth = Math.max(1, px * 0.008);
      ctx.stroke();
      // The lip: stone catching light along the petal's inward edge.
      petal(ctx, cx, cy, rIn + px * 0.006, rIn + rOut * 0.06, a0, a1);
      const jit = 0.85 + rand() * 0.3;
      ctx.fillStyle = `rgb(${90 * jit | 0},${76 * jit | 0},${54 * jit | 0})`;
      ctx.fill();
    }
    // Stone ring separating the bands.
    ctx.strokeStyle = STONE;
    ctx.lineWidth = Math.max(1.5, px * 0.016);
    ctx.beginPath();
    ctx.arc(cx, cy, rIn - ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = STONE_LIT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, rIn - ctx.lineWidth - 1, -Math.PI * 0.7, Math.PI * 0.15);
    ctx.stroke();
  }

  // The oculus — a carved boss, lit crown over a dark foot.
  ctx.fillStyle = STONE;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#241c12";
  ctx.lineWidth = Math.max(1, px * 0.01);
  ctx.stroke();
  ctx.fillStyle = STONE_LIT;
  ctx.beginPath();
  ctx.arc(cx, cy - R * 0.03, R * 0.06, Math.PI, 0);
  ctx.fill();

  // Ambient over the relief — warm light from above, cool falloff at the rim.
  const glow = ctx.createRadialGradient(cx, cy - R * 0.2, 0, cx, cy, R);
  glow.addColorStop(0, "rgba(232, 200, 150, 0.14)");
  glow.addColorStop(0.55, "rgba(0, 0, 0, 0)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0.45)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  return c;
}

// A blind arch — a niche carved into an ashlar wall holding a weathered
// figure, like the gallery of kings across the west facade. Drawn dim: it
// lives behind the title, not in front of it.
export function lancet(w: number, h: number, seed = 11): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const rand = rng(seed);
  const apex = w * 0.5;
  const spring = w * 0.5; // arch springs from half width up the sides

  // The wall — ashlar courses behind everything.
  ashlar(ctx, 0, 0, w, h, seed);

  // The arch moulding — two curves meeting at the apex, lit along the outer
  // edge like a chamfer catching daylight.
  const lw = Math.max(2, w * 0.05);
  ctx.strokeStyle = STONE;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(lw, h);
  ctx.lineTo(lw, spring);
  ctx.quadraticCurveTo(lw, lw, apex, lw);
  ctx.quadraticCurveTo(w - lw, lw, w - lw, spring);
  ctx.lineTo(w - lw, h);
  ctx.stroke();
  ctx.strokeStyle = STONE_LIT;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(lw * 2, h);
  ctx.lineTo(lw * 2, spring);
  ctx.quadraticCurveTo(lw * 2, lw * 2, apex, lw * 2);
  ctx.quadraticCurveTo(w - lw * 2, lw * 2, w - lw * 2, spring);
  ctx.lineTo(w - lw * 2, h);
  ctx.stroke();

  // The recessed niche — deep shadow inside the arch.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(w * 0.16, h);
  ctx.lineTo(w * 0.16, spring);
  ctx.quadraticCurveTo(w * 0.16, w * 0.16, apex, w * 0.16);
  ctx.quadraticCurveTo(w * 0.84, w * 0.16, w * 0.84, spring);
  ctx.lineTo(w * 0.84, h);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = RECESS;
  ctx.fillRect(0, 0, w, h);
  // Depth falloff — darker toward the back top of the niche.
  const depth = ctx.createLinearGradient(0, 0, 0, h);
  depth.addColorStop(0, "rgba(0, 0, 0, 0.55)");
  depth.addColorStop(0.5, "rgba(0, 0, 0, 0.15)");
  depth.addColorStop(1, "rgba(0, 0, 0, 0.4)");
  ctx.fillStyle = depth;
  ctx.fillRect(0, 0, w, h);

  // The figure — a weathered saint on a plinth: cowled head, robed shoulders
  // tapering to the base, fold lines worn nearly smooth.
  const fx = apex;
  const headY = h * 0.34;
  const baseY = h * 0.88;
  const stoneJit = 0.9 + rand() * 0.2;
  const fig = `rgb(${92 * stoneJit | 0},${78 * stoneJit | 0},${56 * stoneJit | 0})`;
  const figDark = `rgb(${60 * stoneJit | 0},${50 * stoneJit | 0},${38 * stoneJit | 0})`;
  // Plinth and halo disc behind the head.
  ctx.fillStyle = figDark;
  ctx.fillRect(fx - w * 0.2, baseY, w * 0.4, h * 0.05);
  ctx.beginPath();
  ctx.arc(fx, headY, w * 0.17, 0, Math.PI * 2);
  ctx.fill();
  // Robed body — a long taper.
  ctx.fillStyle = fig;
  ctx.beginPath();
  ctx.moveTo(fx - w * 0.1, headY + w * 0.06);
  ctx.lineTo(fx - w * 0.19, baseY);
  ctx.lineTo(fx + w * 0.19, baseY);
  ctx.lineTo(fx + w * 0.1, headY + w * 0.06);
  ctx.closePath();
  ctx.fill();
  // Shoulder mantle.
  ctx.fillStyle = figDark;
  ctx.beginPath();
  ctx.moveTo(fx - w * 0.12, headY + w * 0.1);
  ctx.quadraticCurveTo(fx, headY + w * 0.02, fx + w * 0.12, headY + w * 0.1);
  ctx.lineTo(fx + w * 0.15, headY + w * 0.22);
  ctx.lineTo(fx - w * 0.15, headY + w * 0.22);
  ctx.closePath();
  ctx.fill();
  // Worn fold lines down the robe.
  ctx.strokeStyle = figDark;
  ctx.lineWidth = Math.max(1, w * 0.015);
  for (const off of [-0.08, -0.02, 0.05, 0.11]) {
    ctx.beginPath();
    ctx.moveTo(fx + w * off, headY + w * 0.24);
    ctx.lineTo(fx + w * off * 1.6, baseY - 2);
    ctx.stroke();
  }
  // The cowled head — a hood over a shadowed face.
  ctx.fillStyle = fig;
  ctx.beginPath();
  ctx.arc(fx, headY, w * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#181310";
  ctx.beginPath();
  ctx.ellipse(fx, headY + w * 0.01, w * 0.055, w * 0.065, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // A shadowed ledge at the foot — the sill the kings stand on.
  ctx.fillStyle = "#241c12";
  ctx.fillRect(0, h * 0.93, w, h * 0.07);
  ctx.fillStyle = STONE_LIT;
  ctx.fillRect(0, h * 0.93, w, 1.5);

  return c;
}

// A tracery band — the repeating pointed-arch gallery that runs under the
// towers. Tiled lancet arches with a dark recess inside each.
export function tracery(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const unit = h * 0.9;
  const n = Math.ceil(w / unit);
  for (let i = 0; i < n; i++) {
    const x0 = i * unit;
    const cx = x0 + unit / 2;
    // Dark recess inside the arch.
    ctx.fillStyle = "rgba(6, 4, 8, 0.85)";
    ctx.beginPath();
    ctx.moveTo(x0 + unit * 0.16, h);
    ctx.lineTo(x0 + unit * 0.16, h * 0.5);
    ctx.quadraticCurveTo(x0 + unit * 0.16, h * 0.14, cx, h * 0.12);
    ctx.quadraticCurveTo(x0 + unit * 0.84, h * 0.14, x0 + unit * 0.84, h * 0.5);
    ctx.lineTo(x0 + unit * 0.84, h);
    ctx.closePath();
    ctx.fill();
    // Stone arch over it, lit along the top edge.
    ctx.strokeStyle = STONE;
    ctx.lineWidth = Math.max(1.5, h * 0.07);
    ctx.beginPath();
    ctx.moveTo(x0 + unit * 0.1, h);
    ctx.lineTo(x0 + unit * 0.1, h * 0.5);
    ctx.quadraticCurveTo(x0 + unit * 0.1, h * 0.04, cx, h * 0.04);
    ctx.quadraticCurveTo(x0 + unit * 0.9, h * 0.04, x0 + unit * 0.9, h * 0.5);
    ctx.lineTo(x0 + unit * 0.9, h);
    ctx.stroke();
    ctx.strokeStyle = "rgba(140, 118, 78, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + unit * 0.1, h * 0.5);
    ctx.quadraticCurveTo(x0 + unit * 0.1, h * 0.02, cx, h * 0.02);
    ctx.quadraticCurveTo(x0 + unit * 0.9, h * 0.02, x0 + unit * 0.9, h * 0.5);
    ctx.stroke();
  }
  return c;
}

// Dress a panel like a chapel: a tracery band along the top edge and a rose
// at its centre point. Call once after the panel element is built.
export function adornPanel(el: HTMLElement): void {
  // An in-flow header band — a tracery gallery with a rose at its centre —
  // so the trim survives inside scrollable panels.
  const head = document.createElement("div");
  head.className = "orn-head";
  const band = tracery(220, 15);
  band.className = "orn-tracery";
  const rose = roseWindow(30);
  rose.className = "orn-rose";
  head.append(band, rose);
  el.prepend(head);
}
