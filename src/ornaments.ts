// Procedural gothic ornament for the interface — rose windows, lancet glass
// and tracery drawn onto canvases at runtime so the UI stays asset-free like
// everything else. Stained glass gets the same indigo/ruby/amber palette the
// world was graded to.

const GLASS: [number, number, number][] = [
  [150, 42, 52],   // ruby
  [58, 74, 148],   // cobalt
  [198, 138, 52],  // amber
  [116, 52, 120],  // violet
  [56, 110, 84],   // verdigris
];

const LEAD = "#14100c";
const STONE = "#3a3024";
const STONE_LIT = "#5a4c34";

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

// The cathedral rose — concentric bands of petal panes in leaded stone.
// Deterministic glass colours so every rose in the interface is the same one.
export function roseWindow(px: number, seed = 7): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const ctx = c.getContext("2d")!;
  const cx = px / 2, cy = px / 2;
  const R = px / 2 - px * 0.02;
  const rand = rng(seed);
  const pick = (): [number, number, number] => GLASS[Math.floor(rand() * GLASS.length)];

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

  // Petal bands — outer ring of narrow lancets, a middle ring of wider
  // petals, then the rosette around the oculus.
  const bands: [number, number, number][] = [
    [R * 0.58, R * 0.9, 24],
    [R * 0.34, R * 0.54, 12],
    [R * 0.12, R * 0.3, 8],
  ];
  for (const [rIn, rOut, n] of bands) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + Math.PI / n * 0.5;
      const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / n * 0.5;
      const [r, g, b] = pick();
      const jit = 0.85 + rand() * 0.4;
      petal(ctx, cx, cy, rIn, rOut, a0, a1);
      ctx.fillStyle = `rgb(${r * jit | 0},${g * jit | 0},${b * jit | 0})`;
      ctx.fill();
      ctx.strokeStyle = LEAD;
      ctx.lineWidth = Math.max(1, px * 0.008);
      ctx.stroke();
    }
    // Stone ring separating the bands.
    ctx.strokeStyle = STONE;
    ctx.lineWidth = Math.max(1.5, px * 0.016);
    ctx.beginPath();
    ctx.arc(cx, cy, rIn - ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The oculus — a hot amber eye at the heart.
  ctx.fillStyle = "#d8a040";
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = LEAD;
  ctx.lineWidth = Math.max(1, px * 0.01);
  ctx.stroke();

  // Light through glass — hot core falling off to a leaded rim.
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  glow.addColorStop(0, "rgba(255, 226, 160, 0.28)");
  glow.addColorStop(0.55, "rgba(0, 0, 0, 0)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  return c;
}

// A pointed-arch lancet window — three lights of stained glass under a stone
// arch, like the long windows either side of the west facade. Drawn dim: it
// lives behind the title, not in front of it.
export function lancet(w: number, h: number, seed = 11): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const rand = rng(seed);
  const apex = w * 0.5;
  const spring = w * 0.5; // arch springs from half width up the sides

  // Stone frame — two arcs meeting at the apex.
  ctx.strokeStyle = STONE;
  ctx.lineWidth = Math.max(2, w * 0.05);
  ctx.beginPath();
  ctx.moveTo(ctx.lineWidth, h);
  ctx.lineTo(ctx.lineWidth, spring);
  ctx.quadraticCurveTo(ctx.lineWidth, ctx.lineWidth, apex, ctx.lineWidth);
  ctx.quadraticCurveTo(w - ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth, spring);
  ctx.lineTo(w - ctx.lineWidth, h);
  ctx.stroke();

  // Glass lights inside the arch — clipped to the pointed shape.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h);
  ctx.lineTo(w * 0.08, spring);
  ctx.quadraticCurveTo(w * 0.08, w * 0.08, apex, w * 0.08);
  ctx.quadraticCurveTo(w * 0.92, w * 0.08, w * 0.92, spring);
  ctx.lineTo(w * 0.92, h);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = "#0c0a10";
  ctx.fillRect(0, 0, w, h);
  const cols = 3;
  const rows = Math.floor(h / (w * 0.42));
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const [r, g, b] = GLASS[Math.floor(rand() * GLASS.length)];
      const jit = 0.9 + rand() * 0.7;
      ctx.fillStyle = `rgb(${r * jit | 0},${g * jit | 0},${b * jit | 0})`;
      const px0 = w * 0.1 + col * (w * 0.8 / cols);
      const py0 = w * 0.14 + row * (w * 0.42);
      ctx.fillRect(px0 + 1, py0 + 1, w * 0.8 / cols - 2, w * 0.42 - 2);
    }
  }
  // Mullions between the lights.
  ctx.fillStyle = STONE;
  for (let col = 1; col < cols; col++) {
    ctx.fillRect(w * 0.1 + col * (w * 0.8 / cols) - w * 0.02, w * 0.06, w * 0.04, h);
  }
  ctx.restore();

  // A little quatrefoil oculus up in the arch head.
  ctx.fillStyle = "#d8a040";
  ctx.beginPath();
  ctx.arc(apex, w * 0.24, w * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = LEAD;
  ctx.lineWidth = Math.max(1, w * 0.02);
  ctx.stroke();

  // Dim it — the window reads through smoke.
  ctx.fillStyle = "rgba(4, 2, 8, 0.3)";
  ctx.fillRect(0, 0, w, h);
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
