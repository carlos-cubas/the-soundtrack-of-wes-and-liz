/**
 * Level 1 drawing: girders, ladders, the Dreamhouse backdrop, and fallbacks
 * for every sprite (frog, doll, beach ball) in the book-cover style: clean
 * dark ink outlines, flat palette fills, at most one flat shadow tone.
 * Everything here draws in world units with the origin where noted.
 */
import { CHEST_H, CHEST_W, CHEST_X, FLOORS, LADDERS, ROOF, surfaceY, type Floor, type Ladder } from './sim';

/** Outline colour and weight shared by every procedural drawing. */
export const LINE = '#3a3340';
const LW = 1.6;
const PINK = '#ff5aa0';
const PINK_LIGHT = '#ffd0e4';

/** Fill the current path flat, then ink it. `lw` is in the current units. */
function ink(ctx: CanvasRenderingContext2D, fill: string | null, lw = LW): void {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = LINE;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

/** Flat ellipse with no outline (pupils, cheeks, dots). */
function dot(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, rot = 0): void {
  oval(ctx, x, y, rx, ry, rot);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Rounded-rect path (built with arcTo so it doesn't depend on ctx.roundRect). */
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** A sprite pre-rendered with a white sticker outline, sized in world units. */
export interface Sticker {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  pad: number;
}

/**
 * Bake `img` (contained in maxW x maxH) with a white outline `stroke` units
 * wide, at 4 px per unit so it stays crisp on 3x screens.
 */
export function makeSticker(img: HTMLImageElement, maxW: number, maxH: number, stroke = 1.3): Sticker {
  const ppu = 4;
  const k = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  const pw = Math.max(1, Math.round(w * ppu));
  const ph = Math.max(1, Math.round(h * ppu));
  const pad = Math.ceil(stroke * ppu) + 2;
  const sil = document.createElement('canvas');
  sil.width = pw;
  sil.height = ph;
  const sg = sil.getContext('2d')!;
  sg.drawImage(img, 0, 0, pw, ph);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = '#fff';
  sg.fillRect(0, 0, pw, ph);
  const c = document.createElement('canvas');
  c.width = pw + pad * 2;
  c.height = ph + pad * 2;
  const g = c.getContext('2d')!;
  const r = stroke * ppu;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.drawImage(sil, pad + Math.cos(a) * r, pad + Math.sin(a) * r);
  }
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, pad, pad, pw, ph);
  return { canvas: c, w, h, pad: pad / ppu };
}

/** Draw a sticker anchored bottom-centre at the origin. */
export function drawSticker(ctx: CanvasRenderingContext2D, st: Sticker): void {
  ctx.drawImage(st.canvas, -st.w / 2 - st.pad, -st.h - st.pad, st.w + st.pad * 2, st.h + st.pad * 2);
}

// ---------------------------------------------------------------- fallbacks

/** Procedural frog, origin bottom-centre, facing right, `h` tall. */
export function drawFrogFallback(ctx: CanvasRenderingContext2D, h: number, pose: 'sit' | 'jump'): void {
  const s = h / 26;
  const lw = LW / s;
  const body = '#8bd36b';
  const shade = '#5fbf5a';
  const belly = '#f6ef9a';
  ctx.save();
  ctx.scale(s, s);
  if (pose === 'jump') {
    // legs kicked out behind, body tipped up
    oval(ctx, -10, -5, 9, 3, 0.5);
    ink(ctx, shade, lw);
    oval(ctx, -15, -1.5, 5, 2, 0.1);
    ink(ctx, shade, lw);
    oval(ctx, 0, -12, 12, 8.5, -0.28);
    ink(ctx, body, lw);
    oval(ctx, 3.5, -9.5, 6.5, 4, -0.28);
    ink(ctx, belly, lw);
    oval(ctx, 11, -6, 4.5, 1.8, -0.6);
    ink(ctx, shade, lw);
  } else {
    oval(ctx, -7, -7, 8.5, 6.5);
    ink(ctx, shade, lw);
    oval(ctx, 0, -10, 13, 10);
    ink(ctx, body, lw);
    oval(ctx, 5, -7, 6.5, 5);
    ink(ctx, belly, lw);
    oval(ctx, 7, -1.6, 4.6, 1.9);
    ink(ctx, shade, lw);
    oval(ctx, -3, -1.6, 4.2, 1.9);
    ink(ctx, shade, lw);
  }
  const ey = pose === 'jump' ? -2.5 : 0;
  for (const [x, y] of [
    [1, -20],
    [9, -19],
  ]) {
    oval(ctx, x, y + ey, 5.5, 5.5);
    ink(ctx, body, lw);
    oval(ctx, x + 0.5, y - 0.5 + ey, 3.6, 3.6);
    ink(ctx, '#fff', lw * 0.8);
    dot(ctx, x + 1.7, y - 0.3 + ey, 1.8, 2, LINE);
    dot(ctx, x + 2.3, y - 1.1 + ey, 0.6, 0.6, '#fff');
  }
  dot(ctx, 10.5, -11 + ey, 2.6, 1.6, '#f7a1b5');
  ctx.beginPath();
  ctx.arc(7.5, -14 + ey, 3.6, 0.2 * Math.PI, 0.7 * Math.PI);
  ink(ctx, null, lw * 0.8);
  ctx.restore();
}

/** Procedural fashion doll, origin bottom-centre, front-facing, `h` tall. */
export function drawDollFallback(ctx: CanvasRenderingContext2D, h: number): void {
  const s = h / 52;
  const lw = LW / s;
  const skin = '#f1c7a5';
  const hair = '#f8de4f';
  ctx.save();
  ctx.scale(s, s);
  // hair behind the shoulders
  oval(ctx, 0, -38, 8.5, 12);
  ink(ctx, hair, lw);
  // legs and shoes
  for (const x of [-4, 1]) {
    roundRect(ctx, x, -16, 3, 14, 1);
    ink(ctx, skin, lw);
  }
  oval(ctx, -2.6, -1.6, 3, 1.6);
  ink(ctx, '#ff3d8b', lw);
  oval(ctx, 2.6, -1.6, 3, 1.6);
  ink(ctx, '#ff3d8b', lw);
  // arms: an ink stroke with a skin stroke on top
  ctx.beginPath();
  ctx.moveTo(-5, -36);
  ctx.lineTo(-9, -24);
  ctx.moveTo(5, -36);
  ctx.lineTo(9, -24);
  ink(ctx, null, 2.6 + lw * 2);
  ctx.strokeStyle = skin;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  // dress
  ctx.beginPath();
  ctx.moveTo(-5, -38);
  ctx.lineTo(5, -38);
  ctx.lineTo(5, -30);
  ctx.lineTo(11, -14);
  ctx.lineTo(-11, -14);
  ctx.lineTo(-5, -30);
  ctx.closePath();
  ink(ctx, '#ff6fae', lw);
  ctx.beginPath();
  ctx.moveTo(-5, -30);
  ctx.lineTo(5, -30);
  ink(ctx, null, lw);
  // head and bangs
  oval(ctx, 0, -44, 6.2, 6.6);
  ink(ctx, skin, lw);
  ctx.beginPath();
  ctx.ellipse(0, -46.5, 6.8, 4.6, 0, Math.PI, 0);
  ctx.closePath();
  ink(ctx, hair, lw);
  oval(ctx, 4.5, -50, 2.4, 1.6, 0.4);
  ink(ctx, '#ff3d8b', lw);
  // simple webtoon face
  dot(ctx, -2.2, -43.5, 0.9, 1.2, LINE);
  dot(ctx, 2.2, -43.5, 0.9, 1.2, LINE);
  dot(ctx, 0, -40.6, 1.6, 0.9, '#f7768e');
  dot(ctx, -3.8, -41.6, 1.4, 0.9, '#f9b6c8');
  dot(ctx, 3.8, -41.6, 1.4, 0.9, '#f9b6c8');
  ctx.restore();
}

const BALL_COLORS = ['#e8453c', '#ffffff', '#f8de4f', '#ffffff', '#4a86c8', '#ffffff'];

/** Procedural beach ball centred at the origin. */
export function drawBallFallback(ctx: CanvasRenderingContext2D, r: number, rot: number): void {
  const n = BALL_COLORS.length;
  ctx.save();
  ctx.rotate(rot);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = BALL_COLORS[i];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ink(ctx, null, 1);
  oval(ctx, 0, 0, r * 0.24, r * 0.24);
  ink(ctx, '#fff', 1);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, r - 0.4, 0, Math.PI * 2);
  ink(ctx, null, 1.4);
}

/** Heart centred at (x, y), about `s` wide; `outline` inks it. */
export function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color = '#ff4f8b', outline = false): void {
  const k = s / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, k * 0.9);
  ctx.bezierCurveTo(-k * 1.4, -k * 0.1, -k * 0.7, -k * 1.2, 0, -k * 0.45);
  ctx.bezierCurveTo(k * 0.7, -k * 1.2, k * 1.4, -k * 0.1, 0, k * 0.9);
  ctx.closePath();
  if (outline) ink(ctx, color, 1.2);
  else {
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

/** Tiny gold crown sitting on (x, y), `w` wide. */
export function drawCrown(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  const h = w * 0.7;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(w / 2, 0);
  ctx.lineTo(w / 2, -h);
  ctx.lineTo(w / 4, -h * 0.45);
  ctx.lineTo(0, -h * 1.1);
  ctx.lineTo(-w / 4, -h * 0.45);
  ctx.lineTo(-w / 2, -h);
  ctx.closePath();
  ink(ctx, '#f8de4f', 1.1);
  dot(ctx, 0, -h * 1.1, 1.3, 1.3, '#ff4f8b');
  dot(ctx, -w / 2, -h, 1.1, 1.1, '#ff4f8b');
  dot(ctx, w / 2, -h, 1.1, 1.1, '#ff4f8b');
  dot(ctx, 0, -h * 0.28, 1.2, 1.2, '#2f5fd0');
  ctx.restore();
}

/** Five-point star centred at (x, y). */
export function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, outline = false): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  if (outline) ink(ctx, color, 1);
  else {
    ctx.fillStyle = color;
    ctx.fill();
  }
}

// ---------------------------------------------------------------- structure

function paintGirder(ctx: CanvasRenderingContext2D, f: Floor, thick: number, color = PINK, light = PINK_LIGHT): void {
  const len = Math.hypot(f.x1 - f.x0, f.y1 - f.y0);
  ctx.save();
  ctx.translate(f.x0, f.y0);
  ctx.rotate(Math.atan2(f.y1 - f.y0, f.x1 - f.x0));
  // one flat shadow tone under the beam
  ctx.fillStyle = 'rgba(58,51,64,0.22)';
  roundRect(ctx, 1, 2.5, len, thick + 1, 3);
  ctx.fill();
  roundRect(ctx, 0, 0, len, thick, 3);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = light;
  ctx.fillRect(2, 0.8, len - 4, 2);
  // white lattice like a Donkey Kong girder, but cute
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const step = 11;
  ctx.moveTo(3, 4);
  for (let x = 3; x < len - 3; x += step) {
    ctx.lineTo(Math.min(x + step / 2, len - 3), thick - 3);
    ctx.lineTo(Math.min(x + step, len - 3), 4);
  }
  ctx.stroke();
  roundRect(ctx, 0, 0, len, thick, 3);
  ink(ctx, null);
  ctx.restore();
}

function paintLadder(ctx: CanvasRenderingContext2D, l: Ladder): void {
  const top = surfaceY(FLOORS[l.upper], l.x);
  const bottom = surfaceY(FLOORS[l.lower], l.x);
  const hw = 7.5;
  const segs: Array<[number, number]> = l.broken ? [[top, top + 15], [bottom - 19, bottom]] : [[top, bottom]];
  ctx.save();
  for (const [a, b] of segs) {
    // soft backing so the ladder reads on a busy background
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(l.x - hw - 3, a, hw * 2 + 6, b - a);
    for (let y = b - 6; y > a + 2; y -= 8) {
      ctx.fillStyle = LINE;
      ctx.fillRect(l.x - hw, y - 2, hw * 2, 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(l.x - hw, y - 1.2, hw * 2, 2.4);
    }
    for (const sx of [-hw, hw]) {
      ctx.fillStyle = LINE;
      ctx.fillRect(l.x + sx - 2.4, a, 4.8, b - a);
      ctx.fillStyle = l.broken ? '#f3a6c6' : '#ff7ab6';
      ctx.fillRect(l.x + sx - 1.2, a, 2.4, b - a);
    }
  }
  if (l.broken) {
    // a dangling rung marks the gap
    ctx.save();
    ctx.translate(l.x, top + 19);
    ctx.rotate(0.45);
    ctx.fillStyle = LINE;
    ctx.fillRect(-hw + 1, -2, hw * 2 - 2, 4);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-hw + 1, -1.2, hw * 2 - 2, 2.4);
    ctx.restore();
  }
  ctx.restore();
}

/**
 * The static playfield in world units: ladders, girders, the rooftop and the
 * ground (which runs from `left` to `right` so wide phones have no gap).
 */
export function paintStructure(ctx: CanvasRenderingContext2D, left: number, right: number): void {
  for (const l of LADDERS) paintLadder(ctx, l);
  // ground: a pink-and-white dreamhouse floor across the whole stage
  const gy = FLOORS[0].y0;
  ctx.fillStyle = '#e36a9e';
  ctx.fillRect(left, gy, right - left, 400 - gy + 40);
  ctx.fillStyle = '#f591bb';
  for (let x = Math.floor(left / 24) * 24; x < right; x += 24) ctx.fillRect(x, gy + 14, 22, 6);
  paintGirder(ctx, { x0: left, x1: right, y0: gy, y1: gy, dir: 0 }, 12);
  for (let i = 1; i < ROOF; i++) paintGirder(ctx, FLOORS[i], 10);
  // rooftop: white railing, the deck and a scalloped awning
  const r = FLOORS[ROOF];
  ctx.beginPath();
  ctx.moveTo(r.x0 + 4, r.y0 - 16);
  ctx.lineTo(r.x1 - 30, r.y0 - 16);
  for (let x = r.x0 + 6; x <= r.x1 - 30; x += 10) {
    ctx.moveTo(x, r.y0 - 16);
    ctx.lineTo(x, r.y0);
  }
  ink(ctx, null, 2.2 + LW * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  for (let x = r.x0 + 4; x < r.x1 - 4; x += 12) {
    ctx.beginPath();
    ctx.arc(x + 6, r.y0 + 10, 6, 0, Math.PI);
    ctx.closePath();
    ink(ctx, (x - r.x0) % 24 < 12 ? '#fff' : '#ff9cc5', 1.2);
  }
  paintGirder(ctx, r, 10, '#ff8cbc', '#ffe3ef');
}

/** Toy box at the end of the ground; `lid` 0..1 opens it. */
export function drawChest(ctx: CanvasRenderingContext2D, lid: number): void {
  const x = CHEST_X;
  const y = FLOORS[0].y0;
  const w = CHEST_W;
  const h = CHEST_H;
  ctx.save();
  ctx.fillStyle = 'rgba(58,51,64,0.2)';
  oval(ctx, x, y + 1, w / 2 + 2, 3);
  ctx.fill();
  roundRect(ctx, x - w / 2, y - h, w, h, 4);
  ink(ctx, '#fff');
  ctx.fillStyle = '#ff9cc5';
  ctx.fillRect(x - w / 2 + 3, y - h + 8, w - 6, 4);
  drawHeart(ctx, x, y - 10, 11, '#ff4f8b', true);
  // lid hinged at the back-left
  ctx.translate(x - w / 2, y - h);
  ctx.rotate(-lid * 0.9);
  roundRect(ctx, -2, -7, w + 4, 8, 3);
  ink(ctx, PINK);
  ctx.restore();
}

/**
 * Fallback Dreamhouse wallpaper for the whole stage (virtual units), used
 * when img/bg/l1-dreamhouse.webp is missing. `floorY` is the ground line.
 */
export function paintBackdrop(ctx: CanvasRenderingContext2D, W: number, H: number, floorY: number): void {
  ctx.fillStyle = '#ffd9e8';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffe8f1';
  for (let x = 0; x < W; x += 34) ctx.fillRect(x, 0, 13, H);
  for (let y = 24, row = 0; y < H; y += 46, row++) {
    for (let x = (row % 2) * 17 + 10; x < W; x += 34) drawHeart(ctx, x, y, 7, '#ffc2d9');
  }
  // a window with sky and a cloud on the right, a mirror on the left
  const wx = W * 0.72;
  const wy = 64;
  roundRect(ctx, wx - 4, wy - 4, 118, 92, 46);
  ink(ctx, '#fff');
  roundRect(ctx, wx, wy, 110, 84, 42);
  ink(ctx, '#7ed2fe');
  oval(ctx, wx + 46, wy + 50, 20, 9);
  ink(ctx, '#fff', 1.2);
  ctx.beginPath();
  ctx.moveTo(wx + 55, wy);
  ctx.lineTo(wx + 55, wy + 84);
  ctx.moveTo(wx, wy + 42);
  ctx.lineTo(wx + 110, wy + 42);
  ink(ctx, null, 4 + LW * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.stroke();
  roundRect(ctx, wx - 10, wy + 84, 130, 8, 4);
  ink(ctx, '#f7768e');
  const mx = W * 0.3;
  oval(ctx, mx, 236, 30, 40);
  ink(ctx, '#ffd0e4');
  oval(ctx, mx, 236, 24, 34);
  ink(ctx, '#e8f6ff');
  // baseboard just above the floor
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, floorY - 9, W, 9);
  ctx.beginPath();
  ctx.moveTo(0, floorY - 9.5);
  ctx.lineTo(W, floorY - 9.5);
  ink(ctx, null);
}
