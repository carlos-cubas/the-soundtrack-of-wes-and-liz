/**
 * Boss level drawing helpers: layout, the pre-rendered static layer
 * (night street + lanes + hit line), the glowing tile sprite and the
 * karaoke word layout. Everything here is drawn once per resize.
 */
import type { Stage } from '../../core/stage';
import { rng } from './chart';

export const HIT_Y = 336;
/** Tall enough to hit with a thumb (about 15% of the screen height). */
export const TILE_H = 58;
/**
 * Scroll speed in virtual units per second. A lane is reused after 2 steps
 * at least (0.349 s), so same-lane tiles sit 75 units apart: 17 units clear.
 */
export const SPEED = 215;

/** Side columns' minimum widths (nerves card + Wes, karaoke card + Libby) and gaps to the lanes. */
const LEFT_MIN = 124;
const RIGHT_MIN = 180;
const GAP_L = 12;
const GAP_R = 14;
export const LANE_MIN = 66;
export const LANE_MAX = 96;

export interface Layout {
  W: number;
  H: number;
  laneW: number;
  /** Left and right edge of the four lanes. */
  x0: number;
  x1: number;
  /** Karaoke card (right). */
  kx: number;
  ky: number;
  kw: number;
  /** Left column (nerves + Wes). */
  lx: number;
  lw: number;
}

/**
 * Lanes take whatever the side columns don't need (inside the safe
 * insets), up to LANE_MAX each; spare width goes 40/60 to the columns.
 */
export function layout(stage: Stage): Layout {
  const { W, H, safe } = stage;
  const lx = Math.max(10, safe.left + 6);
  const right = W - Math.max(10, safe.right + 6);
  const avail = right - lx;
  const room = (avail - LEFT_MIN - RIGHT_MIN - GAP_L - GAP_R) / 4;
  const laneW = Math.floor(Math.max(LANE_MIN, Math.min(LANE_MAX, room)));
  const sides = avail - 4 * laneW - GAP_L - GAP_R;
  const spare = sides - LEFT_MIN - RIGHT_MIN;
  const lw = Math.max(0, Math.round(spare >= 0 ? LEFT_MIN + spare * 0.4 : (sides * LEFT_MIN) / (LEFT_MIN + RIGHT_MIN)));
  const x0 = lx + lw + GAP_L;
  const x1 = x0 + 4 * laneW;
  const kx = x1 + GAP_R;
  return { W, H, laneW, x0, x1, kx, ky: 52, kw: Math.max(0, right - kx), lx, lw };
}

export const laneCenter = (L: Layout, lane: number) => L.x0 + (lane + 0.5) * L.laneW;

/**
 * Lane under a virtual x: exactly the drawn columns, plus the gap to each
 * side column (so a thumb slightly off the edge still counts); -1 over a column.
 */
export function laneAt(L: Layout, x: number): number {
  if (x < L.x0 - GAP_L || x > L.x1 + GAP_R) return -1;
  return Math.max(0, Math.min(3, Math.floor((x - L.x0) / L.laneW)));
}

function canvasFor(stage: Stage, w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D, number] {
  const k = stage.scale * stage.dpr;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * k));
  c.height = Math.max(1, Math.ceil(h * k));
  const ctx = c.getContext('2d')!;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  return [c, ctx, k];
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  w = Math.max(0, w);
  h = Math.max(0, h);
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Palette and line weight from the book cover's flat line art (docs/SPEC.md). */
export const INK = '#3a3340';
export const INK_TEXT = '#2b2b3a';
export const CREAM = '#fdfbf3';
export const LEMON = '#f8de4f';
/** Lanes: frosted paper over the street, like Magic Tiles' white lanes. */
const LANE = 'rgba(253,251,243,0.74)';

/** Fill and outline the current path in the cover's style: flat fill, thin ink line. */
export function inked(ctx: CanvasRenderingContext2D, fill: string | null, line = 1.8, stroke = INK): void {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.lineWidth = line;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

/** A cream card with an ink outline and one flat drop shadow. */
export function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 12): void {
  ctx.fillStyle = 'rgba(16,14,40,0.35)';
  roundRect(ctx, x + 2, y + 4, w, h, r);
  ctx.fill();
  roundRect(ctx, x, y, w, h, r);
  inked(ctx, CREAM, 2);
}

/** Night street fallback, flat colours with ink outlines: sky, stars, moon, two houses, the parking spot. */
function drawFallbackNight(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.fillStyle = '#1d2a6b';
  ctx.fillRect(0, 0, W, H);
  const r = rng(7);
  ctx.fillStyle = CREAM;
  for (let i = 0; i < 70; i++) {
    const s = r() < 0.15 ? 2 : 1.2;
    ctx.fillRect(r() * W, r() * H * 0.55, s, s);
  }
  // crescent moon
  const mx = W * 0.64;
  ctx.beginPath();
  ctx.arc(mx, 62, 16, Math.PI * 0.3, Math.PI * 1.7);
  ctx.arc(mx + 7, 58, 13, Math.PI * 1.55, Math.PI * 0.45, true);
  ctx.closePath();
  inked(ctx, '#fdf3d6', 1.5);
  // houses: Wes's on the left, Liz's on the right
  const house = (x: number, w: number, h: number, wall: string, lit: number[]) => {
    const base = 318;
    ctx.beginPath();
    ctx.rect(x, base - h, w, h);
    inked(ctx, wall);
    ctx.beginPath();
    ctx.moveTo(x - 10, base - h);
    ctx.lineTo(x + w / 2, base - h - w * 0.36);
    ctx.lineTo(x + w + 10, base - h);
    ctx.closePath();
    inked(ctx, '#3d3f5c');
    const cols = 3;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.beginPath();
        ctx.rect(x + 12 + i * ((w - 24) / cols), base - h + 16 + j * 44, (w - 24) / cols - 12, 26);
        inked(ctx, lit.includes(i + j * cols) ? '#ffd98a' : '#2c3566', 1.5);
      }
    }
  };
  house(W * 0.03, W * 0.22, 120, '#9db59a', [1, 3]);
  house(W * 0.75, W * 0.22, 128, '#e9e6f0', [0, 4, 5]);
  // street, curb and the yellow parking spot
  ctx.beginPath();
  ctx.rect(-2, 318, W + 4, H - 318 + 2);
  inked(ctx, '#3b3d52');
  ctx.beginPath();
  ctx.rect(-2, 314, W + 4, 6);
  inked(ctx, '#6c7090', 1.5);
  ctx.strokeStyle = LEMON;
  ctx.lineWidth = 3;
  ctx.strokeRect(W * 0.36, 345, W * 0.28, 40);
}

/**
 * The static layer: background (cover-fit, dimmed) and the four lanes
 * with ink dividers and the hit line. Drawn once per resize.
 */
export function buildStatic(stage: Stage, L: Layout, bg: HTMLImageElement | null): HTMLCanvasElement {
  const { W, H } = L;
  const [c, ctx] = canvasFor(stage, W, H);
  if (bg && bg.naturalWidth) {
    const s = Math.max(W / bg.naturalWidth, H / bg.naturalHeight);
    const dw = bg.naturalWidth * s;
    const dh = bg.naturalHeight * s;
    ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    drawFallbackNight(ctx, W, H);
  }
  ctx.fillStyle = 'rgba(8,10,40,0.3)';
  ctx.fillRect(0, 0, W, H);

  // behind the lanes: the scene softened, so tiles read clearly
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.x0, 0, L.x1 - L.x0, H);
  ctx.clip();
  if ('filter' in ctx) {
    ctx.filter = 'blur(4px)';
    ctx.drawImage(c, 0, 0, W, H);
    ctx.filter = 'none';
  }
  ctx.fillStyle = LANE;
  ctx.fillRect(L.x0, 0, L.x1 - L.x0, H);
  // the strip under the hit line, one flat shade darker
  ctx.fillStyle = 'rgba(58,51,64,0.12)';
  ctx.fillRect(L.x0, HIT_Y + TILE_H / 2, L.x1 - L.x0, H);
  ctx.restore();

  // ink dividers and outer edges
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.5;
  for (let i = 1; i < 4; i++) ctx.fillRect(L.x0 + i * L.laneW - 0.6, 0, 1.2, H);
  ctx.globalAlpha = 1;
  ctx.fillRect(L.x0 - 1.2, 0, 2, H);
  ctx.fillRect(L.x1 - 0.8, 0, 2, H);

  // hit slots and the hit line: flat coral bar with ink edges
  for (let i = 0; i < 4; i++) {
    roundRect(ctx, L.x0 + i * L.laneW + 5, HIT_Y - TILE_H / 2 + 1, L.laneW - 10, TILE_H - 2, 8);
    ctx.globalAlpha = 0.45;
    inked(ctx, null, 1.5);
    ctx.globalAlpha = 1;
  }
  ctx.beginPath();
  ctx.rect(L.x0 - 4, HIT_Y - 2.5, L.x1 - L.x0 + 8, 5);
  inked(ctx, '#f7768e', 1.5);
  return c;
}

export const TILE_PAD = 4;

/** A crisp black tile: flat ink fill, one flat sheen, thin outline. Pre-rendered. */
export function buildTileSprite(stage: Stage, L: Layout, tint: 'black' | 'miss'): HTMLCanvasElement {
  const w = L.laneW - 8;
  const [c, ctx] = canvasFor(stage, w + TILE_PAD * 2, TILE_H + TILE_PAD * 2);
  roundRect(ctx, TILE_PAD, TILE_PAD, w, TILE_H, 8);
  inked(ctx, tint === 'miss' ? '#e0566f' : '#24212e', 2, tint === 'miss' ? '#7a1f2c' : '#121018');
  ctx.fillStyle = tint === 'miss' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.1)';
  roundRect(ctx, TILE_PAD + 4, TILE_PAD + 4, w - 8, TILE_H * 0.28, 4);
  ctx.fill();
  return c;
}

export interface WordBox {
  x: number;
  y: number;
  w: number;
}

export interface LineLayout {
  boxes: WordBox[];
  height: number;
}

/** Wrap words into rows `maxW` wide, measured with the font currently set on ctx. */
export function layoutWords(ctx: CanvasRenderingContext2D, words: string[], maxW: number, lineH: number): LineLayout {
  const space = ctx.measureText(' ').width;
  const boxes: WordBox[] = [];
  let x = 0;
  let y = 0;
  for (const w of words) {
    const ww = ctx.measureText(w).width;
    if (x > 0 && x + ww > maxW) {
      x = 0;
      y += lineH;
    }
    boxes.push({ x, y, w: ww });
    x += ww + space;
  }
  return { boxes, height: y + lineH };
}

/** A heart path centred at (x, y), size s. */
export function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 0.9, y - s * 0.25, x - s * 0.45, y - s * 0.95, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 0.95, x + s * 0.9, y - s * 0.25, x, y + s * 0.35);
  ctx.closePath();
}
