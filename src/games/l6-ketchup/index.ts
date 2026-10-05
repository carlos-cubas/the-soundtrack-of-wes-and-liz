/**
 * Level 6 "Ketchup Illustrations": at Stella's, Wes copies five drawings onto
 * a napkin by squeezing a ketchup bottle held high above it. The ketchup
 * lands a moment later and wobbles a little on the way down. Libby rates each
 * drawing 1-5 hearts; a high rating (4+) on all five earns the number 32
 * jersey (flags.allHigh). There is no lose.
 */
import { button } from '../../ui/dom';
import type { GameHost, MiniGame, MiniGameFactory } from '../types';
import { KetchupPen, budgetFor, type Splat } from './pen';
import { propsOf, type Box } from './props';
import { HIGH, Ink, libbySays, rate, type Rating } from './score';
import { DRAWINGS, HALF, sampleStrokes, strokeLength, type Drawing, type Pt } from './shapes';

const IMG = {
  table: 'img/bg/l6-table.webp',
  napkin: 'img/sprites/napkin.png',
  bottle: 'img/sprites/ketchup.png',
  lw: 'img/ui/napkin-lw.png',
  tape: 'img/ui/tape.png',
};
const PORTRAITS = ['img/portraits/liz-mad.webp', 'img/portraits/liz-sad.webp', 'img/portraits/liz.webp', 'img/portraits/liz-happy.webp', 'img/portraits/liz-happy.webp'];

/** Napkin size, and the ketchup layer over it (napkin-local, centred). */
const NAP = 290;
const LAYER = 300;
/** The nozzle hangs this far above the spot the ketchup lands on. */
const NOZ_UP = 44;
/**
 * On touch the bottle sits above the finger so you can see where it lands.
 * A finger is the same size on any screen, so this is in CSS px (about 6 mm),
 * not virtual units (which are twice as big on an iPad as on a phone).
 */
const TOUCH_OFF_PX = 34;
const TAU = Math.PI * 2;
const INK = '#2b2b3a';
/** Book-cover line art: thin ink outlines, flat fills, one flat shadow tone. */
const LINE = '#3a3340';
const SHADOW = 'rgba(58, 51, 64, 0.2)';

type Phase = 'intro' | 'draw' | 'settle' | 'judge' | 'swap' | 'final';

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Glossy ketchup in four layers (shadow, dark edge, bright body, shine), so
 * every highlight sits above every body. The layers are composited into one
 * display canvas, redoing only the region new ketchup landed on.
 */
class KetchupLayers {
  readonly cs: HTMLCanvasElement[] = [];
  readonly xs: CanvasRenderingContext2D[] = [];
  readonly view: HTMLCanvasElement;
  private vx: CanvasRenderingContext2D;
  private dirty = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  constructor(readonly q: number) {
    const make = () => {
      const c = document.createElement('canvas');
      c.width = c.height = Math.ceil(LAYER * q);
      return c;
    };
    for (let i = 0; i < 4; i++) {
      const c = make();
      const x = c.getContext('2d')!;
      x.setTransform(q, 0, 0, q, (LAYER / 2) * q, (LAYER / 2) * q);
      x.lineCap = 'round';
      x.lineJoin = 'round';
      this.cs.push(c);
      this.xs.push(x);
    }
    this.view = make();
    this.vx = this.view.getContext('2d')!;
  }
  clear(): void {
    for (const x of [...this.xs, this.vx]) {
      x.save();
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, x.canvas.width, x.canvas.height);
      x.restore();
    }
    this.dirty.x0 = Infinity;
  }
  splat(s: Splat): void {
    strokeKetchup(this.xs, s.x0, s.y0, s.x1, s.y1, s.r);
    const m = s.r + 4;
    const d = this.dirty;
    d.x0 = Math.min(d.x0, s.x0 - m, s.x1 - m);
    d.y0 = Math.min(d.y0, s.y0 - m, s.y1 - m);
    d.x1 = Math.max(d.x1, s.x0 + m, s.x1 + m);
    d.y1 = Math.max(d.y1, s.y0 + m, s.y1 + m);
  }
  private flush(): void {
    const d = this.dirty;
    if (d.x0 === Infinity) return;
    const q = this.q;
    const size = this.view.width;
    const x = Math.max(0, Math.floor((d.x0 + LAYER / 2) * q));
    const y = Math.max(0, Math.floor((d.y0 + LAYER / 2) * q));
    const w = Math.min(size, Math.ceil((d.x1 + LAYER / 2) * q)) - x;
    const h = Math.min(size, Math.ceil((d.y1 + LAYER / 2) * q)) - y;
    if (w > 0 && h > 0) {
      this.vx.clearRect(x, y, w, h);
      for (const c of this.cs) this.vx.drawImage(c, x, y, w, h, x, y, w, h);
    }
    d.x0 = d.y0 = Infinity;
    d.x1 = d.y1 = -Infinity;
  }
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    this.flush();
    ctx.drawImage(this.view, cx - LAYER / 2, cy - LAYER / 2, LAYER, LAYER);
  }
}

// The four passes of glossy ketchup, each drawn into its own layer so every
// highlight sits above every body: shadow, dark edge, bright body, shine.
const PASSES: Array<(r: number) => [number, number, number, string]> = [
  (r) => [1.3, 2, 2 * r + 2, 'rgba(110, 0, 12, 0.22)'],
  (r) => [0, 0, 2 * r + 1, '#a00d1e'],
  (r) => [0, 0, 2 * r - 1.4, '#d61a2c'],
  (r) => [-r * 0.3, -r * 0.36, Math.max(1, r * 0.42), 'rgba(255, 236, 236, 0.6)'],
];

function ketchupPass(x: CanvasRenderingContext2D, pass: number, x0: number, y0: number, x1: number, y1: number, r: number): void {
  const [ox, oy, w, col] = PASSES[pass](r);
  x.strokeStyle = col;
  x.lineWidth = w;
  x.beginPath();
  x.moveTo(x0 + ox, y0 + oy);
  // a zero-length line draws nothing, so nudge dots
  x.lineTo(x1 + ox + (x0 === x1 && y0 === y1 ? 0.01 : 0), y1 + oy);
  x.stroke();
}

function strokeKetchup(xs: CanvasRenderingContext2D[], x0: number, y0: number, x1: number, y1: number, r: number): void {
  for (let i = 0; i < 4; i++) ketchupPass(xs[i], i, x0, y0, x1, y1, r);
}

function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 0.1, y + s * 0.2, x - s * 0.55, y + s * 0.05, x - s * 0.5, y - s * 0.22);
  ctx.bezierCurveTo(x - s * 0.45, y - s * 0.5, x - s * 0.08, y - s * 0.5, x, y - s * 0.25);
  ctx.bezierCurveTo(x + s * 0.08, y - s * 0.5, x + s * 0.45, y - s * 0.5, x + s * 0.5, y - s * 0.22);
  ctx.bezierCurveTo(x + s * 0.55, y + s * 0.05, x + s * 0.1, y + s * 0.2, x, y + s * 0.35);
  ctx.closePath();
}

function drawHearts(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, filled: number, shown = 5, pop = 1): void {
  for (let i = 0; i < 5; i++) {
    const hx = x + (i - 2) * size * 1.08;
    const on = i < filled && i < shown;
    const k = on && i === shown - 1 ? pop : 1;
    heartPath(ctx, hx, y, size * k);
    if (on) {
      ctx.fillStyle = '#f7768e';
      ctx.fill();
      ctx.strokeStyle = LINE;
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(58, 51, 64, 0.4)';
    }
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function contain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, anchor: 'center' | 'bottom' = 'center'): void {
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  ctx.drawImage(img, x + (w - dw) / 2, anchor === 'bottom' ? y + h - dh : y + (h - dh) / 2, dw, dh);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

interface Result {
  rating: Rating;
  comment: string;
  thumb: HTMLCanvasElement;
}

const factory: MiniGameFactory = () => {
  let host: GameHost;
  let pen: KetchupPen;
  let layers: KetchupLayers;
  const ink = new Ink();
  let index = 0;
  let phase: Phase = 'intro';
  let phaseT = 0;
  let timeLeft = 0;
  let realT = 0;
  let targets: Pt[] = [];
  const results: Result[] = [];
  let doneBtn: HTMLButtonElement;
  /** pointerType of each pointer that went down on the canvas. */
  const pointerTypes = new Map<number, string>();
  /** Touches that are a hand resting on the iPad while drawing with a Pencil. */
  const palms = new Set<number>();
  let lastPenT = -Infinity;
  /** Pointer that held the bottle last frame. */
  let drawId: number | null = null;
  let pointerType = 'mouse';
  let unsubResize = () => {};
  let emptyWarned = false;
  let lastSquirt = -1;
  let lastSplat = -1;
  let lastTick = -1;
  let shownHearts = 0;
  let finished = false;
  const originals: HTMLCanvasElement[] = [];
  const polaroids: HTMLCanvasElement[] = [];
  let bottleCache: HTMLCanvasElement | null = null;
  let napkinCache: HTMLCanvasElement | null = null;
  let tableCache: HTMLCanvasElement | null = null;
  let bottleTilt = -0.22;

  // layout (virtual units), see layout()
  let ncx = 0;
  let ncy = 0;
  let px = 0;
  let py = 0;
  let rx = 0;
  /** Centre of the ketchup meter, and of the Done button. */
  let meterX = 0;
  let doneX = 0;
  let doneY = 0;
  /** Table props (from the art), where they sit now, in virtual units. */
  interface Placed extends Rect {
    src: Box;
    /** Moved down by this much to clear the HUD... */
    dy: number;
    /** ...and shrunk (about its centre) if that's what it takes to fit. */
    k: number;
    /** Couldn't be placed clear of the HUD and controls: painted out. */
    hidden: boolean;
  }
  let placed: Placed[] = [];
  let cream = '#fbf0dc';
  /** Bottom of the HUD bar at the last layout. */
  let hudB = 50;

  const drawing = (): Drawing => DRAWINGS[index];
  // device px per virtual unit, for offscreen caches (about 4 on a 13" iPad)
  const q = () => Math.min(4, Math.max(1, Math.ceil(host.stage.scale * host.stage.dpr)));
  const touchOff = () => TOUCH_OFF_PX / host.stage.scale;

  /**
   * The pointer that holds the bottle: an Apple Pencil wins, a palm resting
   * on the screen never draws, otherwise the first finger or mouse down.
   */
  function drawingPointer() {
    const free = host.input.freePointers().filter((p) => !palms.has(p.id));
    return free.find((p) => pointerTypes.get(p.id) === 'pen') ?? free[0] ?? null;
  }

  /** Palm rejection: touches during (or just after) Pencil use are a hand. */
  const PALM_WINDOW = 2;
  function onPointerDown(e: PointerEvent) {
    const type = e.pointerType || 'mouse';
    pointerTypes.set(e.pointerId, type);
    if (pointerTypes.size > 32) pointerTypes.delete(pointerTypes.keys().next().value!);
    if (type === 'pen') {
      lastPenT = realT;
      // a hand already resting on the screen when the Pencil lands
      for (const p of host.input.freePointers()) if (pointerTypes.get(p.id) === 'touch') palms.add(p.id);
      // ketchup it squeezed in that instant never lands
      if (drawId !== null && palms.has(drawId)) pen.cancelFlying();
    } else if (type === 'touch' && realT - lastPenT < PALM_WINDOW) {
      palms.add(e.pointerId);
    }
  }
  function onPointerUp(e: PointerEvent) {
    if (pointerTypes.get(e.pointerId) === 'pen') lastPenT = realT;
    palms.delete(e.pointerId);
  }

  /** Bottom of the HUD bar (it grows with --frame-zoom on iPad), virtual units. */
  function hudBottom(): number {
    const c = host.stage.canvas.getBoundingClientRect();
    const r = host.hud.root.getBoundingClientRect();
    return Math.max(44, (r.bottom - c.top) / host.stage.scale);
  }

  /**
   * Lay out the napkin, the polaroid and slots (left), the ketchup meter in
   * the clear strip between the napkin and the props on the right, and Done
   * under the slots. Props in the art that run under the HUD move down;
   * any that would still touch a control are painted out.
   */
  function layout() {
    const { W, H, safe } = host.stage;
    const x0 = safe.left + 8;
    const x1 = W - safe.right - 8;
    ncx = (x0 + x1) / 2 + 8;
    ncy = 44 + (H - safe.bottom - 44) / 2 + 4;
    px = (x0 + (ncx - NAP / 2)) / 2;
    py = 172;
    rx = (ncx + NAP / 2 + x1) / 2;
    hudB = hudBottom();
    placeProps();
    const stripL = ncx + NAP / 2 + 6;
    let stripR = x1;
    for (const p of placed) if (!p.hidden && (p.x0 + p.x1) / 2 > ncx) stripR = Math.min(stripR, p.x0 - 6);
    meterX = stripR - stripL >= 60 ? (stripL + stripR) / 2 : rx;
    doneX = px;
    doneY = Math.min(H - safe.bottom - 26, slot(0).y + 52);
    placeDone();
    const ui = [meterBox(), doneBox()];
    for (const p of placed) if (!p.hidden && ui.some((u) => overlaps(u, shifted(p)))) p.hidden = true;
    tableCache = null;
  }

  const shifted = (p: Placed): Rect => {
    const cx = (p.x0 + p.x1) / 2;
    const w = (p.x1 - p.x0) * p.k;
    return { x0: cx - w / 2, y0: p.y0 + p.dy, x1: cx + w / 2, y1: p.y0 + p.dy + (p.y1 - p.y0) * p.k };
  };

  function placeProps() {
    placed = [];
    const img = host.image(IMG.table);
    const tp = img ? propsOf(img) : null;
    if (!img || !tp) return;
    const { W, H } = host.stage;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const s = Math.max(W / iw, H / ih);
    const ox = (W - iw * s) / 2;
    const oy = (H - ih * s) / 2;
    const top = hudB + 6;
    const floor = oy + tp.inner.y1 * ih * s - 2;
    cream = `rgb(${tp.cream.join(',')})`;
    placed = tp.props.map((b) => ({ src: b, x0: ox + b.x0 * iw * s, y0: oy + b.y0 * ih * s, x1: ox + b.x1 * iw * s, y1: oy + b.y1 * ih * s, dy: 0, k: 1, hidden: false }));
    for (const p of placed) {
      if (p.y0 >= top) continue;
      p.dy = top - p.y0;
      // room below its new top: down to the next prop in its column, or the border
      let room = floor - top;
      for (const q of placed) {
        if (q === p || q.hidden) continue;
        const r = shifted(q);
        if (r.x0 < p.x1 && p.x0 < r.x1 && r.y0 >= top) room = Math.min(room, r.y0 - 4 - top);
      }
      const h = p.y1 - p.y0;
      if (room < h) p.k = room / h;
      if (p.k < 0.7 || placed.some((q) => q !== p && !q.hidden && overlaps(shifted(p), shifted(q)))) {
        p.dy = 0;
        p.k = 1;
        p.hidden = true;
      }
    }
  }

  /** The ketchup meter with its label, virtual units. */
  function meterBox(): Rect {
    const y = ncy - 40;
    return { x0: meterX - 30, y0: y - 75 - 28, x1: meterX + 30, y1: y + 75 + 16 };
  }

  /** The Done button's box, virtual units (measured: it grows with --frame-zoom). */
  function doneBox(): Rect {
    const s = host.stage.scale;
    let w = 130;
    let h = 46;
    if (doneBtn) {
      const shown = doneBtn.style.display !== 'none';
      if (!shown) {
        doneBtn.style.visibility = 'hidden';
        doneBtn.style.display = '';
      }
      const r = doneBtn.getBoundingClientRect();
      if (r.width) {
        w = r.width;
        h = r.height;
      }
      if (!shown) {
        doneBtn.style.display = 'none';
        doneBtn.style.visibility = '';
      }
    }
    return { x0: doneX - w / s / 2, y0: doneY - h / s / 2, x1: doneX + w / s / 2, y1: doneY + h / s / 2 };
  }

  function placeDone() {
    if (!doneBtn) return;
    const s = host.stage.scale;
    doneBtn.style.left = `${doneX * s}px`;
    doneBtn.style.top = `${doneY * s}px`;
  }

  /** Napkin-local point to client (CSS px) coordinates, for tests. */
  function toClient(p: Pt) {
    const r = host.stage.canvas.getBoundingClientRect();
    const s = host.stage.scale;
    return { x: r.left + (ncx + p.x) * s, y: r.top + (ncy + p.y) * s };
  }

  function drawNapkin(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
    const img = host.image(IMG.napkin);
    ctx.save();
    // one flat shadow tone, offset like the cover's
    ctx.shadowColor = SHADOW;
    ctx.shadowOffsetX = size * 0.012;
    ctx.shadowOffsetY = size * 0.018;
    if (img) {
      contain(ctx, img, cx - size / 2, cy - size / 2, size, size);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = LINE;
      ctx.lineWidth = Math.max(1, size * 0.0055);
      ctx.lineJoin = 'round';
      ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);
      ctx.strokeStyle = 'rgba(58, 51, 64, 0.22)';
      ctx.lineWidth = size * 0.004 + 0.5;
      ctx.setLineDash([size * 0.012, size * 0.012]);
      ctx.strokeRect(cx - size * 0.44, cy - size * 0.44, size * 0.88, size * 0.88);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(cx, cy - size / 2);
      ctx.lineTo(cx, cy + size / 2);
      ctx.moveTo(cx - size / 2, cy);
      ctx.lineTo(cx + size / 2, cy);
      ctx.strokeStyle = 'rgba(58, 51, 64, 0.08)';
      ctx.stroke();
    }
    ctx.restore();
  }

  function tableLayer(): HTMLCanvasElement {
    if (tableCache) return tableCache;
    const { W, H } = host.stage;
    const k = Math.min(2.5, host.stage.scale * host.stage.dpr);
    const c = document.createElement('canvas');
    c.width = Math.ceil(W * k);
    c.height = Math.ceil(H * k);
    const x = c.getContext('2d')!;
    x.scale(k, k);
    const img = host.image(IMG.table);
    if (img) {
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      x.drawImage(img, (W - img.naturalWidth * s) / 2, (H - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      // props that moved (or had to go) are painted out with the table's own cream...
      x.fillStyle = cream;
      for (const p of placed) if (p.dy || p.hidden) x.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
      // ...and drawn again where they no longer sit under the HUD
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      for (const p of placed) {
        if (!p.dy || p.hidden) continue;
        const b = p.src;
        const d = shifted(p);
        x.drawImage(img, b.x0 * iw, b.y0 * ih, (b.x1 - b.x0) * iw, (b.y1 - b.y0) * ih, d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
      }
    } else {
      // cream diner table with a red gingham edge
      x.fillStyle = '#6b4127';
      x.fillRect(0, 0, W, H);
      x.fillStyle = '#fdf3dc';
      x.fillRect(10, 10, W - 20, H - 20);
      const sq = 9;
      for (let i = 0; i * sq < W; i++)
        for (const yy of [10, 19, H - 28, H - 19]) {
          x.fillStyle = (i + Math.floor(yy / sq)) % 2 ? 'rgba(220, 60, 70, 0.75)' : 'rgba(220, 60, 70, 0.3)';
          x.fillRect(i * sq, yy, sq, sq);
        }
      for (let j = 0; j * sq < H; j++)
        for (const xx of [10, 19, W - 28, W - 19]) {
          x.fillStyle = (j + Math.floor(xx / sq)) % 2 ? 'rgba(220, 60, 70, 0.75)' : 'rgba(220, 60, 70, 0.3)';
          x.fillRect(xx, j * sq, sq, sq);
        }
    }
    drawNapkin(x, ncx, ncy, NAP);
    tableCache = c;
    return c;
  }

  /** The original drawn in ketchup on a small napkin, for the polaroid. */
  function original(i: number): HTMLCanvasElement {
    if (originals[i]) return originals[i];
    const size = 112;
    const k = q();
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * k);
    const x = c.getContext('2d')!;
    x.scale(k, k);
    const lw = host.image(IMG.lw);
    if (DRAWINGS[i].id === 'lw' && lw) {
      // the exact napkin from Samira's deck
      contain(x, lw, 0, 0, size, size);
    } else {
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, size, size);
      const img = host.image(IMG.napkin);
      if (img) contain(x, img, -4, -4, size + 8, size + 8);
      const s = (size * 0.8) / (2 * HALF);
      x.save();
      x.translate(size / 2, size / 2);
      x.scale(s, s);
      x.lineCap = 'round';
      x.lineJoin = 'round';
      for (let pass = 0; pass < 4; pass++)
        for (const st of DRAWINGS[i].strokes)
          for (let j = 1; j < st.length; j++) ketchupPass(x, pass, st[j - 1].x, st[j - 1].y, st[j].x, st[j].y, 5.5);
      x.restore();
    }
    originals[i] = c;
    return c;
  }

  function snapshot(): HTMLCanvasElement {
    const size = 120;
    const k = q();
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * k);
    const x = c.getContext('2d')!;
    x.scale(k, k);
    const s = size / NAP;
    x.save();
    x.scale(s, s);
    drawNapkin(x, NAP / 2, NAP / 2, NAP);
    layers.draw(x, NAP / 2, NAP / 2);
    x.restore();
    return c;
  }

  function startDrawing(i: number) {
    index = i;
    const d = drawing();
    targets = sampleStrokes(d.strokes, 3);
    pen.reset(budgetFor(strokeLength(d.strokes)));
    ink.clear();
    layers.clear();
    timeLeft = d.time;
    emptyWarned = false;
    phase = 'intro';
    phaseT = 0;
    host.banner(`${i + 1}. ${d.name}`);
    host.hud.setProgress(i, DRAWINGS.length, `Drawing ${i + 1}/${DRAWINGS.length}`);
    host.hud.setTimer(timeLeft, 5);
    doneBtn.style.display = 'none';
  }

  function submit() {
    if (phase !== 'draw') return;
    phase = 'settle';
    phaseT = 0;
    doneBtn.style.display = 'none';
    host.audio.sfx('click');
  }

  function judge() {
    const rating = rate(targets, ink);
    const comment = libbySays(rating.hearts, index, ink.count === 0);
    results.push({ rating, comment, thumb: snapshot() });
    phase = 'judge';
    phaseT = 0;
    shownHearts = 0;
    host.hud.setTimer(null);
    host.audio.speak(comment, { who: 'liz', tts: false });
  }

  function finish() {
    if (finished) return;
    finished = true;
    const hearts = results.map((r) => r.rating.hearts);
    const avg = hearts.reduce((a, b) => a + b, 0) / Math.max(1, hearts.length);
    const allHigh = hearts.length === DRAWINGS.length && hearts.every((h) => h >= HIGH);
    host.finish({
      outcome: 'win',
      stars: Math.round(avg),
      score: hearts.reduce((a, b) => a + b, 0),
      flags: { allHigh },
      summary: `Libby's hearts: ${hearts.join(', ')}`,
    });
  }

  function update(dt: number) {
    realT += dt;
    phaseT += dt;
    const p = drawingPointer();
    const drawing = phase === 'draw' && !!p;
    // a different finger or the Pencil took over: start a fresh squeeze there
    if (p && drawId !== null && p.id !== drawId) pen.lift();
    drawId = p ? p.id : null;
    if (p) pointerType = pointerTypes.get(p.id) ?? 'mouse';
    const off = p && pointerType === 'touch' ? touchOff() : 0;
    const fx = p ? Math.max(-LAYER / 2 + 6, Math.min(LAYER / 2 - 6, p.x - ncx)) : pen.aimX;
    const fy = p ? Math.max(-LAYER / 2 + 6, Math.min(LAYER / 2 - 6, p.y - off - ncy)) : pen.aimY;
    pen.step(dt, drawing, fx, fy);
    for (const s of pen.landed) {
      layers.splat(s);
      ink.addSegment(s.x0, s.y0, s.x1, s.y1, s.r);
      // the first drop of a squeeze hits the napkin
      if (s.x0 === s.x1 && s.y0 === s.y1 && realT - lastSplat > 0.25) {
        lastSplat = realT;
        host.audio.sfx('splat');
      }
    }
    // the bottle leans with its motion
    const lean = Math.max(-0.35, Math.min(0.35, pen.vx * 0.0012));
    bottleTilt += (-0.2 + lean - bottleTilt) * Math.min(1, dt * 10);
    if (pen.squeezing && realT - lastSquirt > 0.14) {
      lastSquirt = realT;
      host.audio.sfx('squirt');
    }
    if (drawing && pen.empty && !emptyWarned) {
      emptyWarned = true;
      host.toast('Out of ketchup! Tap Done.');
      host.audio.sfx('error');
    }

    switch (phase) {
      case 'intro':
        if (phaseT > 0.9) {
          phase = 'draw';
          phaseT = 0;
          doneBtn.style.display = '';
        }
        break;
      case 'draw': {
        timeLeft -= dt;
        host.hud.setTimer(timeLeft, 5);
        if (timeLeft < 5 && Math.ceil(timeLeft) !== lastTick) {
          lastTick = Math.ceil(timeLeft);
          host.audio.sfx('tick');
        }
        if (timeLeft <= 0) {
          host.toast("Time's up!");
          submit();
        }
        break;
      }
      case 'settle':
        if (pen.flying.length === 0 || phaseT > 0.5) judge();
        break;
      case 'judge': {
        const r = results[results.length - 1];
        const want = Math.min(r.rating.hearts, Math.floor((phaseT - 0.35) / 0.2) + 1);
        if (phaseT > 0.35 && want > shownHearts) {
          shownHearts = want;
          host.audio.sfx('pop');
          if (shownHearts === r.rating.hearts) host.audio.sfx(r.rating.hearts >= HIGH ? 'star' : r.rating.hearts <= 2 ? 'miss' : 'collect');
        }
        const skip = phaseT > 1.2 && host.input.taps.length > 0;
        if (phaseT > 3 || skip) {
          phase = 'swap';
          phaseT = 0;
        }
        break;
      }
      case 'swap':
        if (phaseT > 0.55) {
          if (index + 1 < DRAWINGS.length) startDrawing(index + 1);
          else {
            phase = 'final';
            phaseT = 0;
            host.hud.setProgress(DRAWINGS.length, DRAWINGS.length, 'All done!');
            const all = results.every((r) => r.rating.hearts >= HIGH);
            host.audio.sfx(all ? 'win' : 'collect');
            if (all) host.audio.sfx('cheer');
          }
        }
        break;
      case 'final':
        if (phaseT > 4 || (phaseT > 1.2 && host.input.taps.length > 0)) finish();
        break;
    }
  }

  function slot(i: number): { x: number; y: number } {
    return { x: px + (i - 2) * 27, y: py + 120 };
  }

  const POL_W = 132;
  const POL_H = 156;

  /** The polaroid card for drawing i, with its shadow and tape, cached. */
  function polaroid(i: number): HTMLCanvasElement {
    if (polaroids[i]) return polaroids[i];
    const k = q();
    const pad = 20;
    const c = document.createElement('canvas');
    c.width = Math.ceil((POL_W + pad * 2) * k);
    c.height = Math.ceil((POL_H + pad * 2) * k);
    const x = c.getContext('2d')!;
    x.scale(k, k);
    x.translate(pad + POL_W / 2, pad + POL_H / 2);
    x.shadowColor = SHADOW;
    x.shadowOffsetX = 3;
    x.shadowOffsetY = 4;
    x.fillStyle = '#fdfbf3';
    x.fillRect(-POL_W / 2, -POL_H / 2, POL_W, POL_H);
    x.shadowColor = 'transparent';
    x.strokeStyle = LINE;
    x.lineWidth = 1.5;
    x.strokeRect(-POL_W / 2, -POL_H / 2, POL_W, POL_H);
    x.drawImage(original(i), -56, -POL_H / 2 + 10, 112, 112);
    x.lineWidth = 1;
    x.strokeRect(-56, -POL_H / 2 + 10, 112, 112);
    x.fillStyle = INK;
    x.font = "16px 'Permanent Marker', cursive";
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(DRAWINGS[i].name, 0, POL_H / 2 - 18);
    const tape = host.image(IMG.tape);
    if (tape) contain(x, tape, -34, -POL_H / 2 - 14, 68, 26);
    else {
      x.fillStyle = 'rgba(255, 244, 196, 0.85)';
      x.fillRect(-30, -POL_H / 2 - 9, 60, 18);
    }
    polaroids[i] = c;
    return c;
  }

  function renderPolaroid(ctx: CanvasRenderingContext2D) {
    const intro = phase === 'intro' ? Math.min(1, phaseT / 0.35) : 1;
    const card = polaroid(index);
    ctx.save();
    ctx.translate(px, py - (1 - intro) * 30);
    ctx.rotate(-0.06 + (1 - intro) * 0.2);
    ctx.globalAlpha = intro;
    ctx.drawImage(card, -POL_W / 2 - 20, -POL_H / 2 - 20, POL_W + 40, POL_H + 40);
    ctx.restore();

    // ratings so far
    for (let i = 0; i < DRAWINGS.length; i++) {
      const s = slot(i);
      const r = results[i];
      ctx.save();
      ctx.translate(s.x, s.y);
      if (r && !(phase === 'swap' && i === results.length - 1)) {
        ctx.drawImage(r.thumb, -12, -12, 24, 24);
        ctx.fillStyle = r.rating.hearts >= HIGH ? '#f7768e' : '#94a3b8';
        heartPath(ctx, 9, 11, 12);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = "10px 'Patrick Hand', sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(r.rating.hearts), 9, 10.5);
      } else {
        ctx.strokeStyle = i === index ? 'rgba(43, 43, 58, 0.55)' : 'rgba(43, 43, 58, 0.25)';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-11, -11, 22, 22);
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  }

  function renderGuide(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(ncx, ncy);
    ctx.setLineDash([1.5, 7]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = 'rgba(150, 40, 50, 0.3)';
    for (const st of drawing().strokes) {
      ctx.beginPath();
      st.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function renderStream(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(ncx, ncy);
    ctx.fillStyle = '#d61a2c';
    for (const d of pen.flying) {
      const k = Math.max(0, Math.min(1, (pen.t - d.et) / (d.land - d.et)));
      const g = k * k;
      const x = d.ex + (d.x - d.ex) * g;
      const y = d.ey - NOZ_UP + (d.y - d.ey + NOZ_UP) * g;
      ctx.beginPath();
      ctx.ellipse(x, y, 2.4, 3 + g * 2, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function renderBottle(ctx: CanvasRenderingContext2D) {
    const show = phase === 'draw' || phase === 'settle' || (phase === 'intro' && phaseT > 0.4);
    if (!show) return;
    const x = ncx + pen.aimX;
    const y = ncy + pen.aimY;
    const sq = pen.squeezing ? 1 : 0;
    // soft shadow on the napkin: the bottle is high up
    ctx.fillStyle = 'rgba(60, 20, 10, 0.13)';
    ctx.beginPath();
    ctx.ellipse(x + 20, y + 10, 18, 9, 0.4, 0, TAU);
    ctx.fill();
    // aim marker where the ketchup will land
    if (drawingPointer() && phase === 'draw') {
      const [wx, wy] = pen.wobble(pen.t);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x + wx, y + wy, 7, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(160, 13, 30, 0.7)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(x, y - NOZ_UP);
    ctx.rotate(bottleTilt);
    const squish = 1 + sq * Math.sin(realT * 30) * 0.03;
    ctx.scale(squish + sq * 0.05, 1 / squish - sq * 0.03);
    ctx.drawImage(bottle(), -BOTTLE_W / 2 - 8, -BOTTLE_H - 8, BOTTLE_W + 30, BOTTLE_H + 30);
    ctx.restore();
  }

  const BOTTLE_W = 44;
  const BOTTLE_H = 112;

  /** The squeeze bottle (nozzle at the bottom centre) with its shadow, cached. */
  function bottle(): HTMLCanvasElement {
    if (bottleCache) return bottleCache;
    const k = q();
    const c = document.createElement('canvas');
    c.width = Math.ceil((BOTTLE_W + 30) * k);
    c.height = Math.ceil((BOTTLE_H + 30) * k);
    const x = c.getContext('2d')!;
    x.scale(k, k);
    x.translate(BOTTLE_W / 2 + 8, BOTTLE_H + 8);
    x.shadowColor = SHADOW;
    x.shadowOffsetX = 6;
    x.shadowOffsetY = 8;
    const bw = BOTTLE_W;
    const bh = BOTTLE_H;
    const img = host.image(IMG.bottle);
    if (img) {
      const s = Math.min(bw / img.naturalWidth, bh / img.naturalHeight);
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      x.drawImage(img, -w / 2, -h, w, h);
    } else {
      // upside-down squeeze bottle: body up top, cap and nozzle at the bottom
      x.strokeStyle = LINE;
      x.lineWidth = 1.7;
      x.lineJoin = 'round';
      x.fillStyle = '#d61a2c';
      x.beginPath();
      x.roundRect(-bw / 2, -bh, bw, bh * 0.74, 12);
      x.fill();
      x.shadowColor = 'transparent';
      x.stroke();
      // white cap and nozzle
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.moveTo(-bw / 2 + 4, -bh * 0.26);
      x.lineTo(bw / 2 - 4, -bh * 0.26);
      x.lineTo(7, -bh * 0.1);
      x.lineTo(2.5, -bh * 0.1);
      x.lineTo(2.5, 0);
      x.lineTo(-2.5, 0);
      x.lineTo(-2.5, -bh * 0.1);
      x.lineTo(-7, -bh * 0.1);
      x.closePath();
      x.fill();
      x.stroke();
      x.fillStyle = '#fdf3dc';
      x.fillRect(-bw / 2 + 6, -bh + 22, bw - 12, 36);
      x.strokeRect(-bw / 2 + 6, -bh + 22, bw - 12, 36);
      x.fillStyle = '#d61a2c';
      x.font = "11px 'Permanent Marker', cursive";
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      const fit = Math.min(1, (bw - 16) / x.measureText('KETCHUP').width);
      x.save();
      x.translate(0, -bh + 40);
      x.scale(fit, fit);
      x.fillText('KETCHUP', 0, 0);
      x.restore();
    }
    bottleCache = c;
    return c;
  }

  function renderJudge(ctx: CanvasRenderingContext2D) {
    const r = results[results.length - 1];
    if (!r) return;
    const t = phase === 'judge' ? phaseT : 3 + phaseT;
    const slide = phase === 'judge' ? 1 - Math.pow(1 - Math.min(1, t / 0.3), 3) : Math.max(0, 1 - phaseT / 0.25);
    if (slide <= 0) return;
    const { W, safe } = host.stage;
    const cw = Math.min(210, W - safe.right - 8 - (ncx + NAP / 2) - 6);
    const ch = 262;
    const cx = rx;
    // top-aligned with the props under the HUD, so it covers them cleanly
    const cy = Math.min(hudB + 6 + ch / 2, host.stage.H - host.stage.safe.bottom - 6 - ch / 2);
    ctx.save();
    ctx.translate(cx + (1 - slide) * 240, cy);
    ctx.rotate(0.03);
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.roundRect(-cw / 2 + 3, -ch / 2 + 5, cw, ch, 10);
    ctx.fill();
    ctx.fillStyle = '#fdfbf3';
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.roundRect(-cw / 2, -ch / 2, cw, ch, 10);
    ctx.fill();
    ctx.stroke();
    const portrait = host.image(PORTRAITS[r.rating.hearts - 1]) ?? host.image('img/portraits/liz.webp');
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-cw / 2 + 8, -ch / 2 + 8, cw - 16, 116, 8);
    ctx.clip();
    ctx.fillStyle = '#7ed2fe';
    ctx.fillRect(-cw / 2 + 8, -ch / 2 + 8, cw - 16, 116);
    if (portrait) {
      // waist-up portrait: show her head and shoulders
      const s = (cw - 16) / portrait.naturalWidth * 1.15;
      const w = portrait.naturalWidth * s;
      ctx.drawImage(portrait, -w / 2, -ch / 2 + 8, w, portrait.naturalHeight * s);
    } else {
      // flat, webtoon-simple Libby
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.7;
      ctx.fillStyle = '#e8692f';
      ctx.beginPath();
      ctx.arc(0, -ch / 2 + 70, 40, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f1c7a5';
      ctx.beginPath();
      ctx.arc(0, -ch / 2 + 74, 28, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = LINE;
      ctx.beginPath();
      ctx.arc(-10, -ch / 2 + 70, 3, 0, TAU);
      ctx.arc(10, -ch / 2 + 70, 3, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -ch / 2 + 80, 10, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-cw / 2 + 8, -ch / 2 + 8, cw - 16, 116, 8);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "19px 'Pacifico', cursive";
    ctx.fillText('Libby says', 0, -ch / 2 + 140);
    const popK = 1 + Math.max(0, 0.35 - (t - 0.35 - (shownHearts - 1) * 0.2)) * 1.4;
    drawHearts(ctx, 0, -ch / 2 + 172, 26, r.rating.hearts, shownHearts, popK);
    if (t > 0.35 + r.rating.hearts * 0.2) {
      ctx.font = "18px 'Patrick Hand', sans-serif";
      ctx.fillStyle = INK;
      const lines = wrap(ctx, `"${r.comment}"`, cw - 20);
      lines.forEach((l, i) => ctx.fillText(l, 0, -ch / 2 + 204 + i * 20));
    }
    ctx.restore();
  }

  function renderMeter(ctx: CanvasRenderingContext2D) {
    if (phase === 'judge' || phase === 'final') return;
    const h = 150;
    const w = 34;
    const x = meterX;
    const y = ncy - 40;
    const f = pen.fraction;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(253, 251, 243, 0.95)';
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.7;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 12);
    ctx.fill();
    ctx.save();
    ctx.clip();
    const low = f < 0.2;
    ctx.fillStyle = low && Math.sin(realT * 12) > 0 ? '#f87171' : '#d61a2c';
    ctx.fillRect(-w / 2, h / 2 - h * f, w, h * f);
    ctx.restore();
    ctx.stroke();
    // cap
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-10, h / 2);
    ctx.lineTo(10, h / 2);
    ctx.lineTo(4, h / 2 + 14);
    ctx.lineTo(-4, h / 2 + 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = "16px 'Patrick Hand', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('Ketchup', 0, -h / 2 - 12);
    ctx.restore();
  }

  function renderSwap(ctx: CanvasRenderingContext2D) {
    // the finished napkin shrinks into its slot under the polaroid
    const r = results[results.length - 1];
    const k = Math.min(1, phaseT / 0.55);
    const e = k * k * (3 - 2 * k);
    const s = slot(results.length - 1);
    const x = ncx + (s.x - ncx) * e;
    const y = ncy + (s.y - ncy) * e;
    const size = NAP + (24 - NAP) * e;
    ctx.drawImage(r.thumb, x - size / 2, y - size / 2, size, size);
  }

  function renderFinal(ctx: CanvasRenderingContext2D) {
    const { W, H } = host.stage;
    const a = Math.min(1, phaseT / 0.4);
    ctx.fillStyle = `rgba(58, 51, 64, ${0.55 * a})`;
    ctx.fillRect(0, 0, W, H);
    const n = results.length;
    const size = Math.min(112, (W - host.stage.safe.left - host.stage.safe.right - 40) / n - 12);
    const gap = 12;
    const total = n * size + (n - 1) * gap;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "34px 'Leckerli One', cursive";
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#b08800';
    ctx.globalAlpha = a;
    ctx.strokeText("Libby's ratings", W / 2, 96);
    ctx.fillStyle = '#ffe80f';
    ctx.fillText("Libby's ratings", W / 2, 96);
    results.forEach((r, i) => {
      const t = Math.min(1, Math.max(0, (phaseT - 0.15 - i * 0.12) / 0.3));
      const x = W / 2 - total / 2 + i * (size + gap) + size / 2;
      const y = 200 + (1 - t) * 40;
      ctx.save();
      ctx.globalAlpha = t;
      ctx.translate(x, y);
      ctx.rotate((i % 2 ? 1 : -1) * 0.04);
      ctx.fillStyle = '#fdfbf3';
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.5;
      ctx.fillRect(-size / 2 - 6, -size / 2 - 6, size + 12, size + 34);
      ctx.strokeRect(-size / 2 - 6, -size / 2 - 6, size + 12, size + 34);
      ctx.drawImage(r.thumb, -size / 2, -size / 2, size, size);
      drawHearts(ctx, 0, size / 2 + 14, size / 6.2, r.rating.hearts);
      ctx.restore();
    });
    const hearts = results.map((r) => r.rating.hearts);
    const all = hearts.every((h) => h >= HIGH);
    ctx.globalAlpha = Math.min(1, Math.max(0, (phaseT - 0.9) / 0.3));
    ctx.font = "22px 'Patrick Hand', sans-serif";
    ctx.fillStyle = '#ffffff';
    ctx.fillText(all ? 'A high rating on all five! Libby is seriously impressed.' : `Average: ${(hearts.reduce((x, y) => x + y, 0) / hearts.length).toFixed(1)} hearts. Not bad, Bennett.`, W / 2, 312);
    ctx.font = "16px 'Patrick Hand', sans-serif";
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    if (phaseT > 1.2) ctx.fillText('Tap to continue', W / 2, 344);
    ctx.globalAlpha = 1;
  }

  const game: MiniGame = {
    async init(h) {
      host = h;
      await h.load([...Object.values(IMG), ...new Set(PORTRAITS), 'img/portraits/liz.webp']);
      pen = new KetchupPen(100, (Date.now() & 0xffff) + 1);
      layers = new KetchupLayers(q());
      doneBtn = button('Done', () => submit(), { color: 'green', icon: '✓', id: 'l6-done' });
      // centred on its spot; grows with the iPad frame like the rest of the chrome
      doneBtn.style.cssText += ';position:absolute;transform:translate(-50%,-50%) scale(var(--frame-zoom, 1));display:none';
      h.dom.appendChild(doneBtn);
      // capture phase: runs before Input registers the new pointer
      h.stage.canvas.addEventListener('pointerdown', onPointerDown, { capture: true });
      window.addEventListener('pointerup', onPointerUp, { capture: true });
      window.addEventListener('pointercancel', onPointerUp, { capture: true });
      const unsub = h.stage.onResize(layout);
      unsubResize = () => {
        unsub();
        h.stage.canvas.removeEventListener('pointerdown', onPointerDown, { capture: true });
        window.removeEventListener('pointerup', onPointerUp, { capture: true });
        window.removeEventListener('pointercancel', onPointerUp, { capture: true });
      };
      layout();
      startDrawing(0);
    },

    update,

    render(ctx) {
      const { W, H } = host.stage;
      ctx.drawImage(tableLayer(), 0, 0, W, H);
      if (phase !== 'swap' && phase !== 'final') {
        renderGuide(ctx);
        layers.draw(ctx, ncx, ncy);
      } else if (phase === 'swap') {
        renderSwap(ctx);
      }
      if (phase !== 'final') {
        renderPolaroid(ctx);
        renderMeter(ctx);
        renderStream(ctx);
        renderBottle(ctx);
        renderJudge(ctx);
      } else {
        renderFinal(ctx);
      }
    },

    destroy() {
      unsubResize();
      doneBtn?.remove();
    },

    debugApi() {
      return {
        state: () => ({
          phase,
          index,
          drawing: drawing().id,
          timeLeft,
          ketchup: pen.fraction,
          hearts: results.map((r) => r.rating.hearts),
          fs: results.map((r) => +r.rating.f.toFixed(3)),
          coverage: results.map((r) => +r.rating.coverage.toFixed(3)),
          precision: results.map((r) => +r.rating.precision.toFixed(3)),
          inkCount: ink.count,
          flying: pen.flying.length,
          squeezing: pen.squeezing,
          pointerType,
          touchOffset: pointerType === 'touch' ? touchOff() : 0,
          touchOffsetPx: TOUCH_OFF_PX,
          palms: palms.size,
          scale: host.stage.scale,
        }),
        /** Client rects of the canvas-drawn layout, for overlap checks. */
        layoutBoxes: () => {
          const r = host.stage.canvas.getBoundingClientRect();
          const s = host.stage.scale;
          const c = (b: Rect) => ({ x0: r.left + b.x0 * s, y0: r.top + b.y0 * s, x1: r.left + b.x1 * s, y1: r.top + b.y1 * s });
          const out: Record<string, Rect> = {
            meter: c(meterBox()),
            napkin: c({ x0: ncx - NAP / 2, y0: ncy - NAP / 2, x1: ncx + NAP / 2, y1: ncy + NAP / 2 }),
            slots: c({ x0: slot(0).x - 12, y0: slot(0).y - 12, x1: slot(4).x + 12, y1: slot(4).y + 12 }),
          };
          placed.forEach((p, i) => {
            if (!p.hidden) out[`prop${i}`] = c(shifted(p));
          });
          return out;
        },
        props: () => placed.map((p) => ({ dy: +p.dy.toFixed(1), k: +p.k.toFixed(2), hidden: p.hidden })),
        /** The current drawing's strokes in client (CSS px) coordinates. */
        targetClient: () => drawing().strokes.map((s) => s.map(toClient)),
        /** Score of the ketchup on the napkin right now. */
        liveRating: () => rate(targets, ink),
        done: () => submit(),
        win: () => {
          while (results.length < DRAWINGS.length) {
            results.push({ rating: { coverage: 1, precision: 1, f: 1, hearts: 5 }, comment: '', thumb: snapshot() });
          }
          finish();
        },
      };
    },
  };
  return game;
};

export default factory;
