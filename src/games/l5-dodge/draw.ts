/**
 * Procedural art for Level 5, all seen from above: the gym floor, Liz with
 * her long copper hair, the boys on the baselines, and the basketballs.
 *
 * Style follows the book cover: thin even ink outlines, flat fills, at most
 * one flat shadow tone, no gradients.
 */

const TAU = Math.PI * 2;

export const LINE = '#3a3340';
const LW = 1.7;
const SHADOW = 'rgba(58, 51, 64, 0.2)';
export const SKIN = '#f1c7a5';
export const LIZ_HAIR = '#e8692f';
const CARDIGAN = '#f4a3b6';
const BLUSH = 'rgba(247, 118, 142, 0.55)';

type Shape = (ctx: CanvasRenderingContext2D) => void;

/**
 * Fill shapes inside one shared ink outline: every shape is stroked wide
 * first, then all are filled, so lines between overlapping pieces vanish.
 */
function inked(ctx: CanvasRenderingContext2D, shapes: Shape[], fills: string | string[], lw = LW): void {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = lw * 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const s of shapes) {
    ctx.beginPath();
    s(ctx);
    ctx.stroke();
  }
  shapes.forEach((s, i) => {
    ctx.fillStyle = typeof fills === 'string' ? fills : fills[i];
    ctx.beginPath();
    s(ctx);
    ctx.fill();
  });
}

const circle = (x: number, y: number, r: number): Shape => (c) => c.arc(x, y, r, 0, TAU);
const ellipse = (x: number, y: number, rx: number, ry: number, rot: number): Shape => (c) => c.ellipse(x, y, rx, ry, rot, 0, TAU);

/** Wood floor and court lines (fallback for the court art), drawn once into a cache. */
export function drawCourt(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.fillStyle = '#e8b56f';
  ctx.fillRect(0, 0, W, H);
  // Planks run across the court; each row is staggered with joints.
  const tones = ['#e4ae66', '#ecbe7c', '#e6b36d', '#efc485', '#e1aa61'];
  const ph = 16;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < H; y += ph) {
    let x = -rnd() * 120;
    while (x < W) {
      const len = 90 + rnd() * 110;
      ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
      ctx.fillRect(x, y, len, ph);
      ctx.fillStyle = 'rgba(58, 51, 64, 0.22)';
      ctx.fillRect(x, y, 1, ph);
      x += len;
    }
    ctx.fillStyle = 'rgba(58, 51, 64, 0.2)';
    ctx.fillRect(0, y, W, 1);
  }

  const cx = W / 2;
  const cy = H / 2;
  const inset = 14;
  // painted keys (cobalt, like the book cover) and a coral centre circle
  const keyW = Math.min(150, W * 0.17);
  const keyH = 136;
  ctx.fillStyle = '#5b82dc';
  ctx.fillRect(inset, cy - keyH / 2, keyW, keyH);
  ctx.fillRect(W - inset - keyW, cy - keyH / 2, keyW, keyH);
  ctx.beginPath();
  ctx.arc(cx, cy, 56, 0, TAU);
  ctx.fillStyle = '#f7768e';
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  ctx.beginPath();
  ctx.moveTo(cx, inset);
  ctx.lineTo(cx, H - inset);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 56, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, TAU);
  ctx.stroke();
  for (const side of [-1, 1]) {
    const bx = side < 0 ? inset : W - inset;
    const kx = bx - side * keyW;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(Math.min(bx, kx), cy - keyH / 2, keyW, keyH);
    // free-throw circle
    ctx.beginPath();
    ctx.arc(kx, cy, keyH / 2 - 14, side < 0 ? -Math.PI / 2 : Math.PI / 2, side < 0 ? Math.PI / 2 : (3 * Math.PI) / 2);
    ctx.stroke();
    // three-point arc
    const r3 = Math.min(H / 2 - inset - 18, keyW + 70);
    ctx.beginPath();
    ctx.moveTo(bx, cy - r3);
    ctx.lineTo(bx + side * 30, cy - r3);
    ctx.arc(bx + side * 30, cy, r3, side < 0 ? -Math.PI / 2 : (3 * Math.PI) / 2, side < 0 ? Math.PI / 2 : Math.PI / 2, side > 0);
    ctx.lineTo(bx, cy + r3);
    ctx.stroke();
    // backboard and rim
    const hx = bx + side * 22;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = LINE;
    ctx.lineWidth = LW;
    ctx.fillRect(hx - side * 4 - 2, cy - 22, 4, 44);
    ctx.strokeRect(hx - side * 4 - 2, cy - 22, 4, 44);
    ctx.beginPath();
    ctx.arc(hx + side * 10, cy, 9, 0, TAU);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ef6b1f';
    ctx.stroke();
  }
}

/** Cover-fit an image over the stage. */
export function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number): void {
  const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

export interface LizPose {
  x: number;
  y: number;
  /** Facing angle (radians, 0 = right, PI/2 = down the screen). */
  face: number;
  /** Walk cycle phase and how fast she's moving (0..1). */
  walk: number;
  moving: number;
  /** Hair chain in world coordinates: x0, y0, x1, y1, ... */
  hair: Float32Array;
  /** Seconds since the ball hit her, or -1. */
  hitT: number;
  time: number;
}

export const HAIR_N = 6;
const HAIR_SEG = 4.6;

export function newHair(x: number, y: number): Float32Array {
  const h = new Float32Array(HAIR_N * 2);
  for (let i = 0; i < HAIR_N; i++) {
    h[i * 2] = x;
    h[i * 2 + 1] = y - 6 - i * HAIR_SEG;
  }
  return h;
}

/** Hair trails behind her head like a rope with a little give. */
export function stepHair(p: LizPose, dt: number): void {
  const fx = Math.cos(p.face);
  const fy = Math.sin(p.face);
  const h = p.hair;
  h[0] = p.x - fx * 5;
  h[1] = p.y - fy * 5;
  const k = 1 - Math.exp(-dt * 10);
  for (let i = 1; i < HAIR_N; i++) {
    const px = h[(i - 1) * 2];
    const py = h[(i - 1) * 2 + 1];
    // rest: hanging straight down her back
    const rx = px - fx * HAIR_SEG;
    const ry = py - fy * HAIR_SEG;
    let x = h[i * 2] + (rx - h[i * 2]) * k;
    let y = h[i * 2 + 1] + (ry - h[i * 2 + 1]) * k;
    const dx = x - px;
    const dy = y - py;
    const d = Math.hypot(dx, dy) || 1;
    x = px + (dx / d) * HAIR_SEG;
    y = py + (dy / d) * HAIR_SEG;
    h[i * 2] = x;
    h[i * 2 + 1] = y;
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

const hairL = new Float32Array(HAIR_N * 2);
const hairR = new Float32Array(HAIR_N * 2);

/** The long wavy hair down her back: a tapered fan along the hair chain. */
function drawHairFan(ctx: CanvasRenderingContext2D, p: LizPose): void {
  const h = p.hair;
  for (let i = 0; i < HAIR_N; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(HAIR_N - 1, i + 1);
    let dx = h[a * 2] - h[b * 2];
    let dy = h[a * 2 + 1] - h[b * 2 + 1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const t = i / (HAIR_N - 1);
    const w = 12 - t * 4.5 + Math.sin(i * 2.1 + p.time * 4) * 1.1 * t;
    hairL[i * 2] = h[i * 2] - dy * w;
    hairL[i * 2 + 1] = h[i * 2 + 1] + dx * w;
    hairR[i * 2] = h[i * 2] + dy * w;
    hairR[i * 2 + 1] = h[i * 2 + 1] - dx * w;
  }
  const e = (HAIR_N - 1) * 2;
  const tx = h[e] - h[e - 2];
  const ty = h[e + 1] - h[e - 1];
  const flick = Math.sin(p.time * 3) * 2;
  inked(
    ctx,
    [
      (c) => {
        c.moveTo(hairL[0], hairL[1]);
        for (let i = 1; i < HAIR_N; i++) c.lineTo(hairL[i * 2], hairL[i * 2 + 1]);
        // one soft rounded end with a little flick
        c.bezierCurveTo(
          hairL[e] + tx * 1.6 - ty * flick * 0.3,
          hairL[e + 1] + ty * 1.6 + tx * flick * 0.3,
          hairR[e] + tx * 1.6 - ty * flick * 0.3,
          hairR[e + 1] + ty * 1.6 + tx * flick * 0.3,
          hairR[e],
          hairR[e + 1],
        );
        for (let i = HAIR_N - 2; i >= 0; i--) c.lineTo(hairR[i * 2], hairR[i * 2 + 1]);
        c.closePath();
      },
    ],
    LIZ_HAIR,
  );
  // two ink strand lines for the waves
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.1;
  for (const off of [-4.5, 4]) {
    ctx.beginPath();
    for (let i = 1; i < HAIR_N - 1; i++) {
      const t = i / (HAIR_N - 1);
      const m = off * (1 - t * 0.35) + Math.sin(i * 1.7 + p.time * 4 + off) * 1.3;
      const cx = (hairL[i * 2] + hairR[i * 2]) / 2;
      const cy = (hairL[i * 2 + 1] + hairR[i * 2 + 1]) / 2;
      const nx = (hairR[i * 2] - hairL[i * 2]) / 24;
      const ny = (hairR[i * 2 + 1] - hairL[i * 2 + 1]) / 24;
      if (i === 1) ctx.moveTo(cx + nx * m, cy + ny * m);
      else ctx.lineTo(cx + nx * m, cy + ny * m);
    }
    ctx.stroke();
  }
}

/** Liz from above: pink cardigan, a peek of face, long copper waves. */
export function drawLiz(ctx: CanvasRenderingContext2D, p: LizPose): void {
  const fx = Math.cos(p.face);
  const fy = Math.sin(p.face);
  const nx = -fy;
  const ny = fx;
  const { x, y } = p;
  const swing = Math.sin(p.walk) * 6 * p.moving;

  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 7, 23, 17, 0, 0, TAU);
  ctx.fill();

  // arms swing as she runs; hands get their own cuff line
  for (const s of [-1, 1]) {
    const sw = swing * s;
    inked(ctx, [ellipse(x + nx * s * 15 + fx * sw * 0.5, y + ny * s * 15 + fy * sw * 0.5, 7.5, 5.5, p.face)], CARDIGAN);
    inked(ctx, [circle(x + nx * s * 17 + fx * (sw + 5), y + ny * s * 17 + fy * (sw + 5), 3.6)], SKIN);
  }

  // cardigan shoulders, with the rose dress showing at the front
  inked(ctx, [ellipse(x, y, 17.5, 10.5, p.face + Math.PI / 2)], CARDIGAN);
  ctx.fillStyle = '#fdf3dc';
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x + fx * 10 + nx * 5, y + fy * 10 + ny * 5);
  ctx.lineTo(x + fx * 4, y + fy * 4);
  ctx.lineTo(x + fx * 10 - nx * 5, y + fy * 10 - ny * 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e25d6f';
  ctx.beginPath();
  ctx.arc(x + fx * 8.4 + nx * 2, y + fy * 8.4 + ny * 2, 1.4, 0, TAU);
  ctx.fill();

  drawHairFan(ctx, p);

  // head: face at the front, then the hair cap with bangs and side locks
  const hx = x + fx * 2.5;
  const hy = y + fy * 2.5;
  inked(ctx, [circle(hx, hy, 12)], SKIN);
  // the cap sits far enough back that the face (and its eyes) peeks out
  const cbx = hx - fx * 7;
  const cby = hy - fy * 7;
  const cap: Shape[] = [circle(cbx, cby, 12.2)];
  for (let i = -2; i <= 2; i++) {
    const a = p.face + i * 0.45;
    cap.push(circle(cbx + Math.cos(a) * 10.5, cby + Math.sin(a) * 10.5, 3));
  }
  for (const s of [-1, 1]) cap.push(ellipse(hx + nx * s * 10.5 + fx * 3, hy + ny * s * 10.5 + fy * 3, 3.6, 7.2, p.face));
  inked(ctx, cap, LIZ_HAIR);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(hx - fx * 15, hy - fy * 15);
  ctx.quadraticCurveTo(hx - fx * 7 + nx * 2, hy - fy * 7 + ny * 2, hx - fx * 1, hy - fy * 1);
  ctx.stroke();

  // flower clip
  const cx = hx + nx * 9 - fx * 2;
  const cy = hy + ny * 9 - fy * 2;
  const petals: Shape[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + p.face;
    petals.push(circle(cx + Math.cos(a) * 2.4, cy + Math.sin(a) * 2.4, 1.8));
  }
  inked(ctx, petals, '#f9b6c8', 1);
  ctx.fillStyle = '#ffe80f';
  ctx.beginPath();
  ctx.arc(cx, cy, 1.2, 0, TAU);
  ctx.fill();

  // simple face on the visible sliver: dot eyes and blush
  const ex = hx + fx * 9.4;
  const ey = hy + fy * 9.4;
  const eyeGap = p.hitT >= 0 ? 5.2 : 4.4;
  ctx.fillStyle = LINE;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(ex + nx * s * eyeGap, ey + ny * s * eyeGap, 1.5, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = BLUSH;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(ex + nx * s * 7.2 + fx * 0.2, ey + ny * s * 7.2 + fy * 0.2, 1.8, 1.2, p.face + Math.PI / 2, 0, TAU);
    ctx.fill();
  }

  if (p.hitT >= 0) {
    // Mrs. Potato Head: a big red swollen nose that boings in
    const t = Math.min(1, p.hitT / 0.5);
    const boing = 1 + Math.sin(t * Math.PI * 2.5) * (1 - t) * 0.6;
    const r = Math.max(0.2, 8.5 * Math.min(1, t * 1.6) * boing);
    const nxp = hx + fx * 11.5;
    const nyp = hy + fy * 11.5;
    inked(ctx, [circle(nxp, nyp, r)], '#ef4444');
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(nxp - r * 0.35, nyp - r * 0.35, r * 0.24, 0, TAU);
    ctx.fill();
    // dizzy stars
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 3; i++) {
      const a = p.time * 4 + (i * TAU) / 3;
      star(ctx, hx + Math.cos(a) * 20, hy - 6 + Math.sin(a) * 10, 4.6, p.time * 3);
      ctx.fillStyle = '#ffe80f';
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.stroke();
    }
  }
}

export interface PersonLook {
  name: string;
  shirt: string;
  hair: string;
  skin: string;
  /** Optional shirt detail (Wes's jersey piping). */
  trim?: string;
  curls?: boolean;
}

export const WES: PersonLook = { name: 'Wes', shirt: '#fbfbfb', trim: '#2f5fd0', hair: '#2a211c', skin: '#e0ac85', curls: true };
export const MICHAEL: PersonLook = { name: 'Michael', shirt: '#22345e', hair: '#d6a23c', skin: '#f1c7a5' };
export const NOAH: PersonLook = { name: 'Noah', shirt: '#e2574c', hair: '#5b3d26', skin: '#c98e64' };

/** A boy on the baseline, from above, with a name tag. `cheer` raises arms. */
export function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, face: number, look: PersonLook, cheer: number, time: number): void {
  const fx = Math.cos(face);
  const fy = Math.sin(face);
  const nx = -fy;
  const ny = fx;
  const bob = cheer > 0 ? Math.abs(Math.sin(time * 9)) * 2.5 * cheer : 0;
  const s = 1 + bob * 0.02;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1.1, 1.1);
  ctx.translate(-x, -y);
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 5, 18, 13, 0, 0, TAU);
  ctx.fill();
  // arms: at the sides, or up and waving
  ctx.lineCap = 'round';
  for (const sd of [-1, 1]) {
    const up = cheer * (0.6 + 0.4 * Math.sin(time * 12 + sd));
    const hx = x + nx * sd * (15 + up * 4) + fx * (2 + up * 12);
    const hy = y + ny * sd * (15 + up * 4) + fy * (2 + up * 12);
    const ax = x + nx * sd * 11;
    const ay = y + ny * sd * 11;
    for (const [w, col] of [
      [7 + LW * 2, LINE],
      [7, look.shirt],
    ] as Array<[number, string]>) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(hx, hy);
      ctx.stroke();
    }
    inked(ctx, [circle(hx, hy, 3.5)], look.skin);
  }
  inked(ctx, [ellipse(x, y, 16 * s, 9.5 * s, face + Math.PI / 2)], look.shirt);
  if (look.trim) {
    ctx.strokeStyle = look.trim;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x + nx * 4 + fx * 8, y + ny * 4 + fy * 8);
    ctx.lineTo(x - fx * 8, y - fy * 8);
    ctx.stroke();
  }
  const hx = x + fx * 2;
  const hy = y + fy * 2;
  inked(ctx, [circle(hx + fx * 1.5, hy + fy * 1.5, 9 * s)], look.skin);
  const hair: Shape[] = [circle(hx - fx * 3.5, hy - fy * 3.5, 9 * s)];
  if (look.curls) {
    for (let i = 0; i < 7; i++) {
      const a = face + Math.PI + (i - 3) * 0.45;
      hair.push(circle(hx - fx * 1.5 + Math.cos(a) * 8, hy - fy * 1.5 + Math.sin(a) * 8, 3.3));
    }
  }
  inked(ctx, hair, look.hair);
  // a parting so the top of the head reads as hair
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hx - fx * 10 + nx * 2, hy - fy * 10 + ny * 2);
  ctx.quadraticCurveTo(hx - fx * 4 + nx * 3.5, hy - fy * 4 + ny * 3.5, hx + fx * 2 + nx * 2.5, hy + fy * 2 + ny * 2.5);
  ctx.stroke();
  ctx.fillStyle = LINE;
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(hx + fx * 8.3 + nx * sd * 3.3, hy + fy * 8.3 + ny * sd * 3.3, 1.1, 0, TAU);
    ctx.fill();
  }
  // name tag on a strip of tape
  ctx.font = "13px 'Patrick Hand', sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(look.name).width + 12;
  ctx.save();
  ctx.translate(x, y + 27);
  ctx.rotate(-0.05);
  ctx.fillStyle = 'rgba(255, 244, 196, 0.95)';
  ctx.fillRect(-tw / 2, -8, tw, 16);
  ctx.fillStyle = LINE;
  ctx.fillText(look.name, 0, 1);
  ctx.restore();
  ctx.restore();
}

/** A spinning basketball (fallback when the sprite is missing). */
export function drawBallArt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number, img: HTMLImageElement | null): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  if (img) {
    const s = (2 * r) / Math.max(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (-img.naturalWidth * s) / 2, (-img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
    ctx.restore();
    return;
  }
  inked(ctx, [circle(0, 0, r - LW / 2)], '#ef7a2a');
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r - LW / 2, 0, TAU);
  ctx.clip();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.moveTo(0, -r);
  ctx.lineTo(0, r);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 1.25, 0, r * 0.9, -0.9, 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r * 1.25, 0, r * 0.9, Math.PI - 0.9, Math.PI + 0.9);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/** The comic "BONK!" burst. `t` is seconds since the hit. */
export function drawBonk(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const k = Math.min(1, t / 0.18);
  const s = k < 1 ? k * 1.25 : 1 + Math.sin(Math.min(1, (t - 0.18) / 0.3) * Math.PI) * 0.12;
  const fade = t > 1.5 ? Math.max(0, 1 - (t - 1.5) / 0.4) : 1;
  if (fade <= 0) return;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(x, y);
  ctx.rotate(-0.12);
  ctx.scale(s, s);
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    const r = i % 2 ? 34 : 56 + (i % 4 === 0 ? 8 : 0);
    ctx.lineTo(Math.cos(a) * r * 1.25, Math.sin(a) * r * 0.85);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffe80f';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = LINE;
  ctx.stroke();
  ctx.font = "34px 'Permanent Marker', 'Leckerli One', cursive";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText('BONK!', 0, 2);
  ctx.fillStyle = '#e11d48';
  ctx.fillText('BONK!', 0, 2);
  ctx.restore();
}

export { star as starPath };
