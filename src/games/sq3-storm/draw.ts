/**
 * Procedural art for the storm dash, in the book cover's style: thin ink
 * outlines with round joins, flat palette fills, at most one flat shadow
 * tone, no gradients or texture. It draws Wes in his hoodie, Liz's car, the
 * yard obstacles, lightning, and a fallback night backdrop, all in virtual
 * units. Sprites from public/img replace most of it when they exist (see
 * index.ts).
 */
import type { Obstacle } from './sim';

export const GROUND_Y = 322;
export const INK = '#3a3340';

const SKIN = '#e0ac85';
const HAIR = '#2a211c';
const JEANS = '#3f5a8c';
const JEANS_BACK = '#33496f';
const HOODIE = '#9a9ca3';
const HOODIE_BACK = '#7f828a';
const SHOE = '#26232b';
const WHITE = '#f4f4f4';

const TAU = Math.PI * 2;

/** Stroke the current path in ink. */
function ink(ctx: CanvasRenderingContext2D, w = 1.8) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Fill the current path flat, then outline it. */
function fillInk(ctx: CanvasRenderingContext2D, color: string, w = 1.8) {
  ctx.fillStyle = color;
  ctx.fill();
  ink(ctx, w);
}

export interface WesPose {
  facing: -1 | 1;
  /** Run cycle phase, radians. */
  phase: number;
  /** 0 standing .. 1 full sprint. */
  stride: number;
  air: boolean;
  /** Forward lean, radians (wind makes it bigger). */
  lean: number;
  /** Tumble angle when stumbling or zapped (0 = upright). */
  tumble: number;
  pose: 'run' | 'crank' | 'cheer' | 'down';
  /** Crank handle angle (pose 'crank'). */
  crank: number;
  /** Bat swing progress 0..1, or <0 when not swinging. */
  swing: number;
  strut: boolean;
  t: number;
}

/** A two-segment limb with an ink outline; returns the joint positions. */
function limb(ctx: CanvasRenderingContext2D, x: number, y: number, a1: number, l1: number, a2: number, l2: number, width: number, color: string) {
  // angles measured from straight down, positive = forward (towards -x)
  const kx = x - Math.sin(a1) * l1;
  const ky = y + Math.cos(a1) * l1;
  const ex = kx - Math.sin(a2) * l2;
  const ey = ky + Math.cos(a2) * l2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(kx, ky);
  ctx.lineTo(ex, ey);
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + 3.4;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  return { kx, ky, ex, ey };
}

function shoe(ctx: CanvasRenderingContext2D, x: number, y: number, a: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-a * 0.5);
  ctx.beginPath();
  ctx.ellipse(-4, 0, 9, 4.6, 0, 0, TAU);
  fillInk(ctx, SHOE, 1.5);
  ctx.beginPath();
  ctx.rect(-13, 2, 17, 2.4);
  fillInk(ctx, WHITE, 1.2);
  ctx.restore();
}

/**
 * Wes, side view, feet at (x, y). He is drawn facing left (towards Liz's
 * house) and mirrored when facing right. About 92 units tall.
 */
export function drawWes(ctx: CanvasRenderingContext2D, x: number, y: number, p: WesPose): void {
  ctx.save();
  ctx.translate(x, y);
  if (p.facing === 1) ctx.scale(-1, 1);
  if (p.pose === 'down') {
    ctx.translate(0, -6);
    ctx.rotate(Math.PI / 2 - 0.08);
    ctx.translate(0, 8);
  } else if (p.tumble) {
    ctx.translate(0, -40);
    ctx.rotate(p.tumble);
    ctx.translate(0, 40);
  }
  const ph = p.phase;
  const bob = p.air ? 0 : p.pose === 'run' ? -Math.abs(Math.sin(ph)) * 3.2 * p.stride : 0;
  const strutBob = p.strut ? Math.sin(p.t * 9) * 2 : 0;
  const hipY = -40 + bob;
  const lean = p.pose === 'run' ? p.lean : p.pose === 'crank' ? 0.3 : 0;
  const shX = -Math.sin(lean) * 28;
  const shY = hipY - Math.cos(lean) * 28;

  // ---- legs
  const legs: Array<[number, number]> = [];
  for (let i = 0; i < 2; i++) {
    const q = ph + i * Math.PI;
    let a: number;
    let flex: number;
    if (p.pose === 'down' || p.pose === 'crank') {
      a = i ? 0.12 : -0.08;
      flex = 0.05;
    } else if (p.pose === 'cheer') {
      a = i ? 0.15 : -0.1;
      flex = 0.1;
    } else if (p.air) {
      a = i ? 0.75 : -0.35;
      flex = i ? 1.3 : 0.7;
    } else {
      a = 0.85 * Math.sin(q) * p.stride;
      flex = (0.25 + 1.1 * Math.max(0, -Math.cos(q))) * p.stride + 0.05;
    }
    legs.push([a, flex]);
  }
  const drawLeg = (i: number) => {
    const [a, flex] = legs[i];
    const j = limb(ctx, i ? -2 : 2, hipY, a, 21, a - flex, 20, 9, i ? JEANS : JEANS_BACK);
    shoe(ctx, j.ex, j.ey, a - flex);
  };

  // ---- arms (opposite the legs)
  const armAngles = (i: number): [number, number] => {
    if (p.pose === 'crank') {
      // reaching forward to the crank, hand circling
      const c = p.crank;
      return i ? [1.6 + Math.sin(c) * 0.15, 1.8 + Math.cos(c) * 0.25] : [-0.2, 0.6];
    }
    if (p.pose === 'cheer') return i ? [2.8, 3.0] : [-2.6, -2.9];
    if (p.pose === 'down') return i ? [2.2, 2.5] : [-0.4, 0.1];
    if (p.swing >= 0 && i === 1) {
      const s = Math.min(1, p.swing);
      const a = -2.4 + s * 4.2;
      return [a, a + 0.2];
    }
    if (p.air) return i ? [1.9, 2.3] : [-1.2, -0.7];
    if (p.strut && i === 0) return [2.6, 3.4]; // holding the boombox up
    const q = ph + i * Math.PI;
    const a = -0.9 * Math.sin(q) * p.stride;
    return [a, a + 1.2 * p.stride + 0.2];
  };
  const drawArm = (i: number) => {
    const [a1, a2] = armAngles(i);
    const j = limb(ctx, shX + (i ? -2 : 3), shY + 4, a1, 15, a2, 14, 7.5, i ? HOODIE : HOODIE_BACK);
    ctx.beginPath();
    ctx.arc(j.ex, j.ey, 3.6, 0, TAU);
    fillInk(ctx, SKIN, 1.4);
    return j;
  };

  drawArm(0);
  drawLeg(1);
  // ---- torso (hoodie)
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(-lean);
  ctx.beginPath();
  ctx.moveTo(-12, 4);
  ctx.quadraticCurveTo(-15, -14, -11, -29);
  ctx.quadraticCurveTo(0, -34, 12, -28);
  ctx.quadraticCurveTo(15, -12, 12, 4);
  ctx.closePath();
  fillInk(ctx, HOODIE);
  // pocket, waistband and drawstrings as plain ink lines
  ctx.beginPath();
  ctx.moveTo(-10, -4);
  ctx.quadraticCurveTo(-2, -9, 6, -4);
  ctx.moveTo(-12, 0);
  ctx.lineTo(12, 0);
  ctx.moveTo(-8, -27);
  ctx.lineTo(-9.5, -18 + Math.sin(p.t * 14) * 1.2);
  ctx.moveTo(-4, -28);
  ctx.lineTo(-4.5, -19 + Math.cos(p.t * 13) * 1.2);
  ink(ctx, 1.3);
  ctx.restore();
  drawLeg(0);

  // ---- head, hood up
  const hx = shX - 3 + strutBob * 0.3;
  const hy = shY - 11 + (p.strut ? Math.abs(Math.sin(p.t * 9)) * -2 : 0);
  // hood back
  ctx.beginPath();
  ctx.ellipse(hx + 3.5, hy - 1, 13.5, 14, 0.25, 0, TAU);
  fillInk(ctx, HOODIE);
  // face
  ctx.beginPath();
  ctx.ellipse(hx - 3.5, hy + 1, 8.6, 10, 0, 0, TAU);
  ctx.moveTo(hx - 11, hy - 1);
  ctx.quadraticCurveTo(hx - 15, hy + 3, hx - 11, hy + 4);
  fillInk(ctx, SKIN, 1.5);
  // fringe of dark hair under the hood
  ctx.beginPath();
  ctx.moveTo(hx - 12, hy - 5);
  ctx.quadraticCurveTo(hx - 8, hy - 11, hx + 2, hy - 9);
  ctx.lineTo(hx - 1, hy - 5);
  ctx.quadraticCurveTo(hx - 6, hy - 7, hx - 12, hy - 3);
  ctx.closePath();
  ctx.fillStyle = HAIR;
  ctx.fill();
  // eye
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(hx - 7, hy - 0.5, 1.5, 0, TAU);
  ctx.fill();
  // mouth: a grin when cheering/strutting, gritted otherwise
  ctx.beginPath();
  if (p.pose === 'cheer' || p.strut) ctx.arc(hx - 8, hy + 4, 3, 0.2, Math.PI - 0.6);
  else {
    ctx.moveTo(hx - 10, hy + 5.5);
    ctx.lineTo(hx - 6, hy + 5);
  }
  ink(ctx, 1.3);
  // hood rim around the face
  ctx.beginPath();
  ctx.arc(hx - 2, hy, 12, -Math.PI * 0.62, Math.PI * 0.45);
  ctx.strokeStyle = HOODIE;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hx - 2, hy, 10.2, -Math.PI * 0.62, Math.PI * 0.45);
  ink(ctx, 1.5);

  const arm = drawArm(1);
  if (p.swing >= 0 && p.swing < 1) {
    ctx.save();
    ctx.translate(arm.ex, arm.ey);
    ctx.rotate(Math.PI - armAngles(1)[1]);
    ctx.translate(0, 20);
    ctx.rotate(Math.PI);
    drawBatShape(ctx, 40);
    ctx.restore();
  }
  ctx.restore();
}

/** A wooden bat, `len` long, centred on the origin and pointing up. */
export function drawBatShape(ctx: CanvasRenderingContext2D, len: number) {
  const k = len / 60;
  ctx.save();
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.moveTo(-1.8, 30);
  ctx.lineTo(-2.6, 4);
  ctx.quadraticCurveTo(-6, -24, -4.5, -28);
  ctx.quadraticCurveTo(0, -32, 4.5, -28);
  ctx.quadraticCurveTo(6, -24, 2.6, 4);
  ctx.lineTo(1.8, 30);
  ctx.closePath();
  fillInk(ctx, '#f0b955', 1.8 / k);
  ctx.beginPath();
  ctx.rect(-2.6, 20, 5.2, 10);
  fillInk(ctx, '#2b2b33', 1.4 / k);
  ctx.restore();
}

/** A little boombox Wes holds on his shoulder while strutting. */
export function drawBoombox(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.12 + Math.sin(t * 9) * 0.05);
  ctx.beginPath();
  ctx.moveTo(-10, -10);
  ctx.lineTo(-8, -15);
  ctx.lineTo(8, -15);
  ctx.lineTo(10, -10);
  ink(ctx, 2);
  ctx.beginPath();
  ctx.rect(-15, -10, 30, 18);
  fillInk(ctx, '#f8de4f');
  const pulse = 1 + Math.max(0, Math.sin(t * 18)) * 0.25;
  for (const sx of [-8, 8]) {
    ctx.beginPath();
    ctx.arc(sx, -1, 5.5, 0, TAU);
    fillInk(ctx, '#2f5fd0', 1.4);
    ctx.beginPath();
    ctx.arc(sx, -1, 2.2 * pulse, 0, TAU);
    fillInk(ctx, '#fdfbf3', 1.2);
  }
  ctx.restore();
}

// --------------------------------------------------------------------- car
/**
 * Liz's little car, facing left, bottom-left corner at (x, y). `glass` is
 * how far the driver window is rolled up (0..1), `soak` how wet the seat is.
 */
export function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, glass: number, soak: number, t: number) {
  const k = w / 250;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  const lw = 1.8 / k;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(125, -2, 128, 7, 0, 0, TAU);
  ctx.fill();
  // body
  ctx.beginPath();
  ctx.moveTo(4, -14);
  ctx.quadraticCurveTo(0, -30, 8, -42);
  ctx.lineTo(70, -48);
  ctx.lineTo(100, -78);
  ctx.quadraticCurveTo(104, -82, 112, -82);
  ctx.lineTo(178, -82);
  ctx.quadraticCurveTo(186, -82, 190, -78);
  ctx.lineTo(222, -50);
  ctx.lineTo(244, -46);
  ctx.quadraticCurveTo(252, -36, 248, -14);
  ctx.closePath();
  fillInk(ctx, '#7cc4e8', lw);
  // one flat shadow tone along the rocker
  ctx.beginPath();
  ctx.rect(6, -24, 242, 10);
  fillInk(ctx, '#5aa3c9', lw);
  // windshield
  ctx.beginPath();
  ctx.moveTo(76, -50);
  ctx.lineTo(102, -76);
  ctx.lineTo(104, -50);
  ctx.closePath();
  fillInk(ctx, '#cfe6f2', lw);
  // driver window: open, dark cabin and a headrest getting soaked
  const wx0 = 108;
  const wx1 = 150;
  const wy0 = -77;
  const wy1 = -50;
  ctx.beginPath();
  ctx.rect(wx0, wy0, wx1 - wx0, wy1 - wy0);
  fillInk(ctx, '#232a44', lw);
  ctx.beginPath();
  ctx.ellipse(140, -62, 7, 9, 0, 0, TAU);
  fillInk(ctx, soak > 0.5 ? '#5a3f46' : '#c97f6a', lw);
  if (glass < 1) {
    ctx.strokeStyle = 'rgba(190,215,255,0.7)';
    ctx.lineWidth = 1 / k;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const rx = wx0 + 4 + ((i * 7 + t * 60) % (wx1 - wx0 - 6));
      const ry = wy0 + ((i * 11 + t * 240) % Math.max(1, (wy1 - wy0) * (1 - glass)));
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + 1.5, ry + 6);
    }
    ctx.stroke();
  }
  if (glass > 0) {
    const gh = (wy1 - wy0) * glass;
    ctx.beginPath();
    ctx.rect(wx0, wy1 - gh, wx1 - wx0, gh);
    ctx.fillStyle = '#cfe6f2';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(wx0, wy1 - gh);
    ctx.lineTo(wx1, wy1 - gh);
    ink(ctx, lw);
  }
  // rear window
  ctx.beginPath();
  ctx.moveTo(156, -77);
  ctx.lineTo(178, -77);
  ctx.lineTo(206, -51);
  ctx.lineTo(156, -50);
  ctx.closePath();
  fillInk(ctx, '#cfe6f2', lw);
  // door lines + handles
  ctx.beginPath();
  ctx.moveTo(104, -49);
  ctx.lineTo(102, -20);
  ctx.moveTo(153, -49);
  ctx.lineTo(153, -20);
  ctx.moveTo(206, -49);
  ctx.lineTo(204, -24);
  ctx.moveTo(138, -42);
  ctx.lineTo(147, -42);
  ctx.moveTo(188, -42);
  ctx.lineTo(197, -42);
  ink(ctx, lw);
  // lights
  ctx.beginPath();
  ctx.ellipse(9, -36, 5, 4, 0, 0, TAU);
  fillInk(ctx, '#fff3b0', lw);
  ctx.beginPath();
  ctx.rect(242, -42, 6, 9);
  fillInk(ctx, '#f7768e', lw);
  // wheels
  for (const cx of [52, 198]) {
    ctx.beginPath();
    ctx.arc(cx, -18, 19, 0, TAU);
    fillInk(ctx, '#2b2b33', lw);
    ctx.beginPath();
    ctx.arc(cx, -18, 8, 0, TAU);
    fillInk(ctx, '#fdfbf3', lw);
  }
  ctx.restore();
}

/** A window crank, turning as Wes winds it. */
export function drawCrank(ctx: CanvasRenderingContext2D, x: number, y: number, a: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.strokeStyle = '#d5d9e0';
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 3.6, 0, TAU);
  fillInk(ctx, '#d5d9e0', 1.4);
  ctx.beginPath();
  ctx.arc(Math.cos(a) * 11, Math.sin(a) * 11, 3, 0, TAU);
  fillInk(ctx, '#2b2b33', 1.4);
  ctx.restore();
}

// --------------------------------------------------------------- obstacles
/** Draw an obstacle with its left edge at screen x `sx`, on ground `gy`. */
export function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle, sx: number, gy: number, knocked: number) {
  ctx.save();
  if (o.kind === 'branch') drawBranch(ctx, sx, gy, o.w, o.h, knocked);
  else if (o.kind === 'can') drawCan(ctx, sx, gy, o.w, o.h, knocked);
  else drawGnome(ctx, sx, gy, o.w, o.h, knocked);
  ctx.restore();
}

function groundShadow(ctx: CanvasRenderingContext2D, x: number, rx: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, 0, rx, 4, 0, 0, TAU);
  ctx.fill();
}

function drawBranch(ctx: CanvasRenderingContext2D, x: number, gy: number, w: number, h: number, knocked: number) {
  ctx.translate(x + w / 2, gy);
  if (knocked) {
    ctx.translate(knocked * 18, 2);
    ctx.scale(1, 0.75);
  }
  groundShadow(ctx, 0, w * 0.55);
  // twigs: ink under a thinner bark stroke
  ctx.beginPath();
  ctx.moveTo(-w * 0.2, -h * 0.5);
  ctx.lineTo(-w * 0.32, -h * 1.05);
  ctx.moveTo(w * 0.15, -h * 0.55);
  ctx.lineTo(w * 0.3, -h * 1.15);
  ctx.moveTo(w * 0.3, -h * 0.4);
  ctx.lineTo(w * 0.5, -h * 0.8);
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = '#8a5a3c';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  for (const [lx, ly, r] of [[-0.32, -1.05, 6], [0.3, -1.15, 7], [0.5, -0.8, 5], [-0.05, -0.95, 5]] as const) {
    ctx.beginPath();
    ctx.ellipse(w * lx, h * ly, r, r * 0.65, 0.4, 0, TAU);
    fillInk(ctx, '#6fb36a', 1.5);
  }
  // the log
  ctx.beginPath();
  ctx.moveTo(-w / 2, -2);
  ctx.quadraticCurveTo(-w / 2 - 3, -h * 0.55, -w / 2 + 4, -h * 0.62);
  ctx.quadraticCurveTo(0, -h * 0.8, w / 2 - 2, -h * 0.5);
  ctx.quadraticCurveTo(w / 2 + 3, -h * 0.2, w / 2 - 2, -1);
  ctx.closePath();
  fillInk(ctx, '#9a6a44');
  // bark lines and the cut end
  ctx.beginPath();
  ctx.moveTo(-w * 0.25, -h * 0.35);
  ctx.lineTo(-w * 0.05, -h * 0.4);
  ctx.moveTo(w * 0.05, -h * 0.25);
  ctx.lineTo(w * 0.28, -h * 0.3);
  ink(ctx, 1.2);
  ctx.beginPath();
  ctx.ellipse(-w / 2 + 3, -h * 0.32, 4, h * 0.28, 0, 0, TAU);
  fillInk(ctx, '#e3b878', 1.5);
}

function drawCan(ctx: CanvasRenderingContext2D, x: number, gy: number, w: number, h: number, knocked: number) {
  ctx.translate(x + w / 2, gy);
  groundShadow(ctx, knocked * 12, w * 0.75);
  if (knocked) {
    ctx.translate(knocked * 16, -w / 2 + 2);
    ctx.rotate((Math.PI / 2) * Math.min(1, knocked * 1.4));
    ctx.translate(0, w / 2 - 2);
  }
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h + 7);
    ctx.lineTo(w / 2, -h + 7);
    ctx.lineTo(w / 2 - 3, 0);
    ctx.lineTo(-w / 2 + 3, 0);
    ctx.closePath();
  };
  body();
  ctx.fillStyle = '#aab4c0';
  ctx.fill();
  // one flat shadow tone down the far side
  ctx.save();
  body();
  ctx.clip();
  ctx.fillStyle = '#8c97a5';
  ctx.fillRect(w * 0.18, -h, w, h);
  ctx.restore();
  body();
  ink(ctx);
  ctx.beginPath();
  for (let i = -2; i <= 2; i++) {
    ctx.moveTo(i * (w / 6), -h + 11);
    ctx.lineTo(i * (w / 6.6), -4);
  }
  ink(ctx, 1.1);
  if (!knocked) {
    ctx.beginPath();
    ctx.ellipse(0, -h + 6, w / 2 + 3, 5, 0, 0, TAU);
    fillInk(ctx, '#9aa4b1');
    ctx.beginPath();
    ctx.rect(-5, -h - 1, 10, 4);
    fillInk(ctx, '#9aa4b1', 1.4);
  }
}

function drawGnome(ctx: CanvasRenderingContext2D, x: number, gy: number, w: number, h: number, knocked: number) {
  ctx.translate(x + w / 2, gy);
  groundShadow(ctx, 0, w * 0.7);
  if (knocked) {
    ctx.translate(knocked * 14, -4);
    ctx.rotate((-Math.PI / 2) * Math.min(1, knocked * 1.4));
  }
  const s = h / 34;
  ctx.scale(s, s);
  const lw = 1.4 / s;
  // boots + body
  ctx.beginPath();
  ctx.rect(-9, -4, 8, 4);
  ctx.rect(1, -4, 8, 4);
  fillInk(ctx, '#6b4630', lw);
  ctx.beginPath();
  ctx.moveTo(-10, -4);
  ctx.quadraticCurveTo(-12, -16, -6, -19);
  ctx.lineTo(6, -19);
  ctx.quadraticCurveTo(12, -16, 10, -4);
  ctx.closePath();
  fillInk(ctx, '#2f5fd0', lw);
  // beard + face
  ctx.beginPath();
  ctx.moveTo(-7, -19);
  ctx.quadraticCurveTo(0, -4, 7, -19);
  ctx.closePath();
  fillInk(ctx, '#fdfbf3', lw);
  ctx.beginPath();
  ctx.arc(0, -21, 5, 0, TAU);
  fillInk(ctx, '#f1c7a5', lw);
  // the glued-back neck from Level 2, plus a strip of tape
  ctx.beginPath();
  ctx.moveTo(-6, -17);
  ctx.lineTo(-3, -18.5);
  ctx.lineTo(0, -17);
  ctx.lineTo(3, -18.5);
  ctx.lineTo(6, -17);
  ink(ctx, 0.9 / s);
  ctx.save();
  ctx.translate(3, -17.5);
  ctx.rotate(-0.4);
  ctx.beginPath();
  ctx.rect(-5, -1.6, 10, 3.2);
  fillInk(ctx, '#f8e9b0', 0.9 / s);
  ctx.restore();
  // hat
  ctx.beginPath();
  ctx.moveTo(-6.5, -23);
  ctx.quadraticCurveTo(-2, -36, 4, -38);
  ctx.quadraticCurveTo(2, -30, 6.5, -23);
  ctx.closePath();
  fillInk(ctx, '#f7768e', lw);
}

// --------------------------------------------------------------- lightning
/** Jagged bolt from (x, top) down to (x, bottom): flat [x0,y0,x1,y1,...]. */
export function makeBolt(x: number, top: number, bottom: number, rnd: () => number): number[] {
  const pts: number[] = [];
  const n = 11;
  let cx = x + (rnd() - 0.5) * 60;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const y = top + (bottom - top) * f;
    const target = x + (cx - x) * (1 - f);
    pts.push(i === n ? x : target + (rnd() - 0.5) * 34 * (1 - f * 0.6), y);
    cx += (rnd() - 0.5) * 20;
  }
  return pts;
}

export function strokeBolt(ctx: CanvasRenderingContext2D, pts: number[], alpha: number, scale = 1) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.globalAlpha = alpha * 0.35;
  ctx.strokeStyle = '#9ec3ff';
  ctx.lineWidth = 14 * scale;
  ctx.stroke();
  ctx.globalAlpha = alpha * 0.8;
  ctx.strokeStyle = '#dfeaff';
  ctx.lineWidth = 5 * scale;
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2 * scale;
  ctx.stroke();
  // a fork off the middle
  const m = Math.floor(pts.length / 4) * 2;
  ctx.globalAlpha = alpha * 0.7;
  ctx.lineWidth = 1.6 * scale;
  ctx.beginPath();
  ctx.moveTo(pts[m], pts[m + 1]);
  ctx.lineTo(pts[m] + 26 * scale, pts[m + 1] + 30 * scale);
  ctx.lineTo(pts[m] + 30 * scale, pts[m + 1] + 58 * scale);
  ctx.stroke();
  ctx.restore();
}

// -------------------------------------------------------------- backdrops
/**
 * Fallback for img/bg/sq3-storm.webp, laid out like the art: storm sky, Liz's
 * pale green two-story on the left, the fence of the secret area, and Wes's
 * white house with the black roof on the right (as on Samira's map).
 */
export function paintFallbackBg(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#1d2347';
  ctx.fillRect(0, 0, w, h);
  // flat storm clouds
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let layer = 0; layer < 2; layer++) {
    ctx.fillStyle = ['#262d58', '#2f3767'][layer];
    for (let i = 0; i < 14; i++) {
      const cx = rnd() * w;
      const cy = 24 + layer * 30 + rnd() * 40;
      const r = 50 + rnd() * 70;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.6, r * 0.5, 0, 0, TAU);
      ctx.fill();
    }
  }
  const lawnY = h * 0.745;
  // distant tree line
  ctx.fillStyle = '#1f3a3a';
  ctx.beginPath();
  ctx.moveTo(0, lawnY);
  for (let x = 0; x <= w + 34; x += 34) ctx.quadraticCurveTo(x + 17, lawnY - 46 - ((x * 7) % 19), x + 34, lawnY - 30);
  ctx.lineTo(w, lawnY);
  ctx.closePath();
  ctx.fill();

  house(ctx, w * 0.13, lawnY, w * 0.315, 196, {
    wall: '#a9c4a0',
    roof: '#3e4458',
    shutter: '#3f5f8f',
    door: '#4f79b8',
    lit: [true, false, true, false, true],
  });
  // the fence of the secret area
  const fx0 = w * 0.45;
  const fx1 = w * 0.58;
  ctx.beginPath();
  for (let x = fx0; x < fx1; x += 9) {
    ctx.moveTo(x, lawnY);
    ctx.lineTo(x, lawnY - 38);
    ctx.lineTo(x + 3, lawnY - 42);
    ctx.lineTo(x + 6, lawnY - 38);
    ctx.lineTo(x + 6, lawnY);
  }
  ctx.rect(fx0, lawnY - 30, fx1 - fx0, 4);
  ctx.fillStyle = '#d6dbe6';
  ctx.fill();
  ink(ctx, 1.2);
  house(ctx, w * 0.58, lawnY, w * 0.28, 186, {
    wall: '#e8ebf1',
    roof: '#1d1d24',
    shutter: '#26232b',
    door: '#26232b',
    lit: [false, true, true, true, false],
  });
  // lawn, then the sidewalk
  ctx.fillStyle = '#2f6b4f';
  ctx.fillRect(0, lawnY, w, h - lawnY);
  ctx.fillStyle = '#5d6787';
  ctx.fillRect(0, h * 0.875, w, h * 0.06);
  ctx.beginPath();
  ctx.moveTo(0, lawnY);
  ctx.lineTo(w, lawnY);
  ctx.moveTo(0, h * 0.875);
  ctx.lineTo(w, h * 0.875);
  ink(ctx, 1.5);
}

interface HouseColors {
  wall: string;
  roof: string;
  shutter: string;
  door: string;
  lit: boolean[];
}

function house(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, hgt: number, c: HouseColors) {
  const top = base - hgt;
  const roofH = hgt * 0.32;
  // walls
  ctx.beginPath();
  ctx.rect(x, top + roofH, w, hgt - roofH);
  fillInk(ctx, c.wall);
  // siding lines
  ctx.beginPath();
  for (let y = top + roofH + 12; y < base - 4; y += 12) {
    ctx.moveTo(x + 2, y);
    ctx.lineTo(x + w - 2, y);
  }
  ctx.strokeStyle = 'rgba(58,51,64,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // chimney, roof, porch roof
  ctx.beginPath();
  ctx.rect(x + w * 0.72, top + roofH * 0.15, 14, roofH * 0.6);
  fillInk(ctx, c.roof);
  ctx.beginPath();
  ctx.moveTo(x - 12, top + roofH + 4);
  ctx.lineTo(x + w * 0.5, top);
  ctx.lineTo(x + w + 12, top + roofH + 4);
  ctx.closePath();
  fillInk(ctx, c.roof);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.3, base - 60);
  ctx.lineTo(x + w * 0.7, base - 60);
  ctx.lineTo(x + w * 0.75, base - 50);
  ctx.lineTo(x + w * 0.25, base - 50);
  ctx.closePath();
  fillInk(ctx, c.roof);
  // windows (2 up, 2 down + attic)
  const win = (wx: number, wy: number, ww: number, wh: number, lit: boolean) => {
    ctx.beginPath();
    ctx.rect(wx - 7, wy, 6, wh);
    ctx.rect(wx + ww + 1, wy, 6, wh);
    fillInk(ctx, c.shutter, 1.2);
    ctx.beginPath();
    ctx.rect(wx, wy, ww, wh);
    fillInk(ctx, lit ? '#f6d77c' : '#33416a', 1.5);
    ctx.beginPath();
    ctx.moveTo(wx + ww / 2, wy);
    ctx.lineTo(wx + ww / 2, wy + wh);
    ctx.moveTo(wx, wy + wh / 2);
    ctx.lineTo(wx + ww, wy + wh / 2);
    ink(ctx, 1.2);
  };
  const ww = w * 0.13;
  const wh = hgt * 0.17;
  const upY = top + roofH + hgt * 0.08;
  const dnY = base - hgt * 0.36;
  win(x + w * 0.14, upY, ww, wh, c.lit[0]);
  win(x + w * 0.73, upY, ww, wh, c.lit[1]);
  win(x + w * 0.14, dnY, ww, wh, c.lit[2]);
  win(x + w * 0.73, dnY, ww, wh, c.lit[3]);
  win(x + w * 0.5 - ww * 0.35, top + roofH * 0.45, ww * 0.7, wh * 0.7, c.lit[4]);
  // door + step
  ctx.beginPath();
  ctx.rect(x + w * 0.5 - 11, base - 46, 22, 46);
  fillInk(ctx, c.door);
  ctx.beginPath();
  ctx.rect(x + w * 0.38, base - 6, w * 0.24, 6);
  fillInk(ctx, '#9aa1b5', 1.4);
}
