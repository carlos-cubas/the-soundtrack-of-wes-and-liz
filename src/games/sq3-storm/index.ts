/**
 * Side Quest 3 "The Moldy Car". Wes sees Libby's car window wide open in a
 * thunderstorm and dashes out to close it before her early shift.
 *
 * Side view: Wes runs LEFT from his porch across the wet yards to Liz's car,
 * jumping branches, garbage cans and the gnome from Level 2, dodging
 * lightning where the ground glows, then holds a button to wind the window
 * up. The rules live in sim.ts (pure and unit tested); this file handles
 * input, camera, effects, sound and drawing.
 */
import type { ItemId } from '../../data/story';
import { asset } from '../../ui/dom';
import { icon } from '../../ui/icons';
import type { GameHost, MiniGame, MiniGameFactory } from '../types';
import { botInput } from './bot';
import { GROUND_Y, drawBatShape, drawBoombox, drawCar, drawCrank, drawObstacle, drawWes, makeBolt, paintFallbackBg, strokeBolt, type WesPose } from './draw';
import {
  AIR_TIME,
  CAR_W,
  CAR_X,
  CRANK_X,
  GRAVITY,
  GUST_TIME,
  JUMP_V,
  RUN,
  SOAK_TIME,
  STRIKE_LINGER,
  STUN_STUMBLE,
  WORLD_W,
  activeGust,
  createSim,
  dangerZone,
  puddleAt,
  step,
  takeoffWindow,
  useItem,
  type Obstacle,
  type Sim,
  type SimEvent,
  type SimInput,
} from './sim';

const IMG = {
  bg: 'img/bg/sq3-storm.webp',
  wes: 'img/sprites/wes-run.png',
  car: 'img/sprites/liz-car.png',
  gnome: 'img/sprites/gnome.png',
  library: 'img/sprites/little-library.png',
  reach: 'img/sprites/wes-reach.png',
  boombox: 'img/items/boombox.png',
  bat: 'img/items/bat.png',
  liz: 'img/sprites/liz.png',
};

const TAU = Math.PI * 2;
/** Ink outline colour shared with the line-art sprites. */
const INK = '#3a3340';
/**
 * The backdrop is drawn this tall, from this y, so its lawn (about 80% of
 * the way down the art) sits under Wes's feet.
 */
const BG_H = 460;
const BG_Y = GROUND_Y - 0.8 * BG_H;
const BG_ASPECT = 2048 / 869;
/** Spots on the backdrop art, as fractions of its width / height. */
const BG_SPOTS = {
  lizLamp: [0.3109, 0.633],
  lizDoor: [0.2759, 0.6214, 0.2993, 0.7399],
  wesLamp: [0.7422, 0.633],
};

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** liz-car.png's window holes as of the current art; re-measured at load. */
const CAR_WINDOWS: { front: Box; rear: Box | null } = {
  front: { x0: 0.363, x1: 0.566, y0: 0.117, y1: 0.348 },
  rear: null,
};

/**
 * Find the see-through windows of a car sprite: transparent pixels that the
 * outside can't reach. The leftmost one is the driver's (the car faces left).
 */
function measureWindows(img: HTMLImageElement): { front: Box; rear: Box | null } | null {
  const w = img.width;
  const h = img.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0);
  let data: Uint8ClampedArray;
  try {
    data = g.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
  const mark = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 100) mark[i] = 1;
  const stack: number[] = [];
  const fill = (start: number, label: number, box?: Box) => {
    stack.length = 0;
    stack.push(start);
    mark[start] = label;
    let n = 0;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      n++;
      if (box) {
        box.x0 = Math.min(box.x0, x);
        box.x1 = Math.max(box.x1, x);
        box.y0 = Math.min(box.y0, y);
        box.y1 = Math.max(box.y1, y);
      }
      if (x > 0 && !mark[i - 1]) (mark[i - 1] = label), stack.push(i - 1);
      if (x < w - 1 && !mark[i + 1]) (mark[i + 1] = label), stack.push(i + 1);
      if (y > 0 && !mark[i - w]) (mark[i - w] = label), stack.push(i - w);
      if (y < h - 1 && !mark[i + w]) (mark[i + w] = label), stack.push(i + w);
    }
    return n;
  };
  for (let x = 0; x < w; x++) {
    if (!mark[x]) fill(x, 2);
    if (!mark[(h - 1) * w + x]) fill((h - 1) * w + x, 2);
  }
  for (let y = 0; y < h; y++) {
    if (!mark[y * w]) fill(y * w, 2);
    if (!mark[y * w + w - 1]) fill(y * w + w - 1, 2);
  }
  const holes: Box[] = [];
  for (let i = 0; i < w * h; i++) {
    if (mark[i]) continue;
    const b = { x0: w, x1: 0, y0: h, y1: 0 };
    if (fill(i, 3, b) > w * h * 0.004) holes.push({ x0: b.x0 / w, x1: (b.x1 + 1) / w, y0: b.y0 / h, y1: (b.y1 + 1) / h });
  }
  // driver window: the leftmost hole in the upper half of the car
  const upper = holes.filter((b) => b.y1 < 0.6).sort((a, b) => a.x0 - b.x0);
  return upper.length ? { front: upper[0], rear: upper[1] ?? null } : null;
}
const WES_H = 100;
/** wes-reach.png is drawn this tall; its fist (on the crank) sits near its top-left. */
const REACH_H = 98;
const TILE_W = 320;
const TILE_TOP = GROUND_Y - 20;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Build a path with `path`, fill it flat and outline it in ink. */
function inkShape(ctx: CanvasRenderingContext2D, color: string, path: () => void) {
  ctx.beginPath();
  path();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

// ------------------------------------------------------------- particles
const P = { Drop: 0, Chip: 1, Spark: 2, Sparkle: 3, Note: 4, Smoke: 5, Leaf: 6, Heart: 7 } as const;
type P = (typeof P)[keyof typeof P];

interface Particle {
  kind: P;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
}

interface Ripple {
  x: number;
  y: number;
  life: number;
  max: number;
  big: boolean;
}

interface Say {
  text: string;
  x: number;
  y: number;
  life: number;
  color: string;
}

interface RainLayer {
  n: number;
  len: number;
  speed: number;
  width: number;
  alpha: number;
  depth: number;
  xs: Float32Array;
  ys: Float32Array;
}

const game: MiniGameFactory = () => {
  let host!: GameHost;
  let sim!: Sim;
  let t = 0;
  let camX = 0;
  let lastCamX = 0;
  let shake = 0;
  let shakeX = 0;
  let shakeY = 0;
  let flash = 0;
  let ambientIn = 2.5;
  let thunderIn = -1;
  let skyBolt: { pts: number[]; life: number } | null = null;
  let mode: 'run' | 'crank' | 'none' = 'run';
  let endT = 0;
  let done = false;
  let destroyed = false;
  let lizLight = 0;
  let lightClicked = false;
  let runPhase = 0;
  let prevSin = 0;
  let squash = 0;
  let crankAngle = 0;
  let crankTick = 0;
  let gustFx = 0;
  let zapT = 0;
  let unsubResize: (() => void) | null = null;
  let fallbackBg: HTMLCanvasElement | null = null;
  let groundTile: HTMLCanvasElement | null = null;
  const bolts = new Map<number, number[]>();
  const scorches: Array<{ x: number; life: number }> = [];
  const parts: Particle[] = [];
  let partNext = 0;
  const ripples: Ripple[] = [];
  let rippleNext = 0;
  const says: Say[] = [];
  const knockT = new Map<Obstacle, number>();
  const rain: RainLayer[] = [
    { n: 90, len: 9, speed: 520, width: 1, alpha: 0.22, depth: 0.35, xs: new Float32Array(90), ys: new Float32Array(90) },
    { n: 70, len: 16, speed: 780, width: 1.4, alpha: 0.38, depth: 0.8, xs: new Float32Array(70), ys: new Float32Array(70) },
    { n: 26, len: 30, speed: 1150, width: 2.2, alpha: 0.5, depth: 1.25, xs: new Float32Array(26), ys: new Float32Array(26) },
  ];
  const hudLast = { lives: -1, max: -1, soak: -1, wet: -1, chip: '' };
  let wetChip: HTMLElement | null = null;
  let wetText: HTMLElement | null = null;
  let itemChip: HTMLElement | null = null;
  let itemImg: HTMLImageElement | null = null;
  let itemText: HTMLElement | null = null;
  let carWindows = CAR_WINDOWS;

  for (let i = 0; i < 320; i++) {
    parts.push({ kind: P.Drop, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, rot: 0, vr: 0, color: '#fff' });
  }
  for (let i = 0; i < 70; i++) ripples.push({ x: 0, y: 0, life: 0, max: 1, big: false });

  const rnd = Math.random;

  function spawn(kind: P, x: number, y: number, vx: number, vy: number, life: number, size: number, color: string) {
    const p = parts[partNext];
    partNext = (partNext + 1) % parts.length;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.size = size;
    p.rot = rnd() * TAU;
    p.vr = (rnd() - 0.5) * 12;
    p.color = color;
  }

  function ripple(x: number, y: number, big: boolean) {
    const r = ripples[rippleNext];
    rippleNext = (rippleNext + 1) % ripples.length;
    r.x = x;
    r.y = y;
    r.big = big;
    r.max = big ? 0.9 : 0.5 + rnd() * 0.3;
    r.life = r.max;
  }

  function splash(x: number, n: number) {
    for (let i = 0; i < n; i++) {
      spawn(P.Drop, x + (rnd() - 0.5) * 20, GROUND_Y - 2, (rnd() - 0.5) * 220, -120 - rnd() * 220, 0.5 + rnd() * 0.3, 1.6 + rnd() * 1.8, rnd() < 0.5 ? '#cfe6ff' : '#9cc4ee');
    }
    ripple(x, GROUND_Y + 4, true);
  }

  function chips(o: Obstacle, n: number) {
    const colors = o.kind === 'branch' ? ['#5e4130', '#8a6a50', '#2e5a38'] : o.kind === 'can' ? ['#7f8996', '#5f6875', '#c6ccd4'] : ['#d8434f', '#3f6fc2', '#f3efe6'];
    const cx = o.x + o.w / 2;
    for (let i = 0; i < n; i++) {
      spawn(P.Chip, cx + (rnd() - 0.5) * o.w, GROUND_Y - o.h * rnd(), (rnd() - 0.6) * 300, -150 - rnd() * 260, 0.7 + rnd() * 0.5, 2.5 + rnd() * 3.5, colors[i % 3]);
    }
  }

  /** The bat pointing straight up from its handle at the origin. */
  function drawBat(ctx: CanvasRenderingContext2D, len: number) {
    const img = host.image(IMG.bat);
    ctx.save();
    if (img) {
      // bat.png lies on the diagonal, handle bottom-left, about 1.16 x its size long
      const s = len / 1.16;
      ctx.rotate(-Math.PI / 4);
      ctx.drawImage(img, -0.08 * s, -0.92 * s, s, s);
    } else {
      ctx.translate(0, -len / 2);
      drawBatShape(ctx, len);
    }
    ctx.restore();
  }

  function say(text: string, color = '#ffe80f') {
    if (says.length > 4) says.shift();
    says.push({ text, x: sim.wes.x, y: GROUND_Y - sim.wes.h - WES_H - 8, life: 1.1, color });
  }

  // ------------------------------------------------------------ layout
  function layoutControls() {
    const { W, H, safe } = host.stage;
    const inp = host.input;
    inp.clearControls();
    if (mode === 'run') {
      // high enough to clear the item button that sits in the bottom-left corner
      inp.addDpad({ id: 'move', x: safe.left + 84, y: H - safe.bottom - 132, r: 58, axes: 'lr' });
      inp.addButton({ id: 'jump', x: W - safe.right - 82, y: H - safe.bottom - 94, r: 56, label: 'JUMP', color: '#f7768e', keys: ['Space', 'ArrowUp', 'KeyW'] });
    } else if (mode === 'crank') {
      inp.addButton({ id: 'hold', x: W - safe.right - 112, y: H - safe.bottom - 112, r: 70, label: 'HOLD', color: '#22c55e', keys: ['Space', 'ArrowUp', 'KeyW', 'Enter'] });
    }
  }

  function buildCaches() {
    const { W, H } = host.stage;
    const k = Math.min(2.5, host.stage.scale * host.stage.dpr);
    // fallback backdrop
    if (!host.image(IMG.bg)) {
      const bw = BG_H * BG_ASPECT;
      fallbackBg = document.createElement('canvas');
      fallbackBg.width = Math.ceil(bw * Math.min(k, 1.5));
      fallbackBg.height = Math.ceil(BG_H * Math.min(k, 1.5));
      const g = fallbackBg.getContext('2d')!;
      g.scale(Math.min(k, 1.5), Math.min(k, 1.5));
      paintFallbackBg(g, bw, BG_H);
    }
    // wet lawn strip, tiled 1:1 with the world so the ground visibly moves
    const th = H - TILE_TOP;
    groundTile = document.createElement('canvas');
    groundTile.width = Math.ceil(TILE_W * k);
    groundTile.height = Math.ceil(th * k);
    const g = groundTile.getContext('2d')!;
    g.scale(k, k);
    let seed = 11;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // water sheen
    for (let i = 0; i < 14; i++) {
      const x = r() * TILE_W;
      const y = 22 + r() * (th - 26);
      g.fillStyle = 'rgba(190,225,255,0.14)';
      for (const dx of [-TILE_W, 0, TILE_W]) g.fillRect(x + dx, y, 20 + r() * 50, 1.5);
    }
    // flat little grass tufts with ink outlines, like the backdrop's
    g.strokeStyle = INK;
    g.lineWidth = 1.1;
    g.lineJoin = 'round';
    for (let i = 0; i < 26; i++) {
      const x = r() * TILE_W;
      const y = 22 + r() * (th - 40);
      const s = 0.8 + (y / th) * 0.8;
      g.fillStyle = r() < 0.5 ? '#5aa070' : '#3f7d58';
      g.beginPath();
      for (const dx of [-TILE_W, 0, TILE_W]) {
        const bx = x + dx;
        g.moveTo(bx - 5 * s, y);
        g.lineTo(bx - 3 * s, y - 6 * s);
        g.lineTo(bx - 1 * s, y - 1.5 * s);
        g.lineTo(bx + 0.5 * s, y - 8 * s);
        g.lineTo(bx + 2 * s, y - 1.5 * s);
        g.lineTo(bx + 4 * s, y - 5.5 * s);
        g.lineTo(bx + 5 * s, y);
        g.closePath();
      }
      g.fill();
      g.stroke();
    }
  }

  function seedRain() {
    const { W, H } = host.stage;
    for (const l of rain) {
      for (let i = 0; i < l.n; i++) {
        l.xs[i] = rnd() * (W + 200) - 100;
        l.ys[i] = rnd() * H;
      }
    }
  }

  function camTarget() {
    const W = host.stage.W;
    return clamp(sim.wes.x - W * 0.6, 0, WORLD_W - W);
  }

  // ------------------------------------------------------------- events
  function onEvent(e: SimEvent) {
    const a = host.audio;
    const w = sim.wes;
    switch (e.type) {
      case 'jump':
        a.sfx('jump');
        for (let i = 0; i < 5; i++) spawn(P.Drop, w.x, GROUND_Y - 2, (rnd() - 0.5) * 120, -60 - rnd() * 90, 0.4, 1.6, '#bcd8f5');
        break;
      case 'land':
        a.sfx('land');
        squash = 1;
        if (!e.puddle) for (let i = 0; i < 6; i++) spawn(P.Drop, w.x + (rnd() - 0.5) * 20, GROUND_Y - 2, (rnd() - 0.5) * 160, -50 - rnd() * 100, 0.4, 1.5, '#bcd8f5');
        break;
      case 'splash':
        a.sfx('splash');
        splash(e.x, 16);
        break;
      case 'stumble':
        a.sfx('bonk');
        a.sfx('whoa');
        shake = Math.max(shake, 9);
        chips(e.ob, 10);
        knockT.set(e.ob, 0);
        say('Oof!', '#ffffff');
        break;
      case 'knock':
        a.sfx('hit');
        chips(e.ob, 6);
        knockT.set(e.ob, 0);
        break;
      case 'smash':
        a.sfx('bonk');
        a.sfx('whoosh');
        shake = Math.max(shake, 7);
        chips(e.ob, 22);
        say('SMASH!');
        break;
      case 'bat':
        a.sfx('whoosh');
        a.sfx('bonk');
        shake = Math.max(shake, 8);
        chips(e.ob, 26);
        say('CRACK!');
        break;
      case 'warn':
        a.sfx('rain');
        bolts.set(e.strike.id, makeBolt(e.strike.x, -20, GROUND_Y, rnd));
        break;
      case 'strike': {
        a.sfx('thunder');
        const near = clamp(1 - e.near / 700, 0, 1);
        flash = Math.max(flash, 0.45 + 0.4 * near);
        shake = Math.max(shake, 5 + 9 * near);
        scorches.push({ x: e.strike.x, life: 4 });
        for (let i = 0; i < 16; i++) {
          spawn(P.Spark, e.strike.x + (rnd() - 0.5) * 30, GROUND_Y - 4, (rnd() - 0.5) * 420, -120 - rnd() * 300, 0.35 + rnd() * 0.3, 1.5 + rnd() * 1.5, rnd() < 0.5 ? '#fff6c2' : '#9ec3ff');
        }
        splash(e.strike.x, 10);
        break;
      }
      case 'zap':
        a.sfx('hit');
        zapT = 0.6;
        shake = Math.max(shake, 14);
        for (let i = 0; i < 10; i++) spawn(P.Smoke, w.x + (rnd() - 0.5) * 20, GROUND_Y - w.h - 60 - rnd() * 30, (rnd() - 0.5) * 30, -30 - rnd() * 40, 1.2, 6 + rnd() * 6, '#5b6070');
        say('ZAP!');
        break;
      case 'deflect':
        for (let i = 0; i < 18; i++) spawn(P.Sparkle, w.x, GROUND_Y - w.h - 50, (rnd() - 0.5) * 300, (rnd() - 0.5) * 300, 0.6, 3, '#fff3a0');
        say('Untouchable!');
        break;
      case 'gust':
        a.sfx('whoosh');
        gustFx = GUST_TIME;
        say('WHOOSH!', '#d6ecff');
        break;
      case 'arrive':
        mode = 'crank';
        layoutControls();
        host.banner('Roll it up!');
        a.sfx('grab');
        break;
      case 'won':
        mode = 'none';
        layoutControls();
        a.sfx('unlock');
        host.banner('Window closed!');
        break;
      case 'lost':
        mode = 'none';
        layoutControls();
        if (e.reason === 'lives') a.sfx('splat');
        a.sfx('lose');
        host.banner(e.reason === 'soaked' ? 'The seats are soaked!' : 'Wiped out!');
        break;
    }
  }

  // -------------------------------------------------------------- update
  function readInput(): SimInput {
    const inp = host.input;
    if (mode === 'run') return { move: inp.axis().x, jump: inp.pressed('jump'), hold: false };
    if (mode === 'crank') return { move: 0, jump: false, hold: inp.isDown('hold') };
    return { move: 0, jump: false, hold: false };
  }

  function updateWes(dt: number) {
    const w = sim.wes;
    const sp = Math.abs(w.vx);
    if (w.onGround) runPhase += sp * dt * 0.075;
    const s = Math.sin(runPhase);
    if (w.onGround && sp > 40 && s * prevSin < 0) {
      // footstep
      const inP = !!puddleAt(sim, w.x);
      for (let i = 0; i < (inP ? 7 : 3); i++) {
        spawn(P.Drop, w.x + (rnd() - 0.5) * 16, GROUND_Y - 1, (rnd() - 0.5) * 90 - w.vx * 0.2, -40 - rnd() * (inP ? 160 : 70), 0.35, 1.4 + rnd(), '#c3dcf7');
      }
      if (inP) ripple(w.x, GROUND_Y + 4, true);
    }
    prevSin = s;
    squash = Math.max(0, squash - dt * 5);
    zapT = Math.max(0, zapT - dt);
    if (sim.phase === 'crank') {
      if (host.input.isDown('hold')) crankAngle += dt * 10;
      const tick = Math.floor(sim.crank * 14);
      if (tick > crankTick) host.audio.sfx('tick');
      crankTick = tick;
    }
    // drips off a soaked hoodie
    if (rnd() < sim.wet * dt * 10) spawn(P.Drop, w.x + (rnd() - 0.5) * 30, GROUND_Y - w.h - 30 - rnd() * 50, w.vx * 0.3, 20, 0.5, 1.3, '#d3e6ff');
  }

  function updateFx(dt: number) {
    const { W, H } = host.stage;
    shake = Math.max(0, shake - dt * 28);
    shakeX = (rnd() - 0.5) * shake;
    shakeY = (rnd() - 0.5) * shake;
    flash = Math.max(0, flash - dt * 3);
    // ambient lightning in the sky, thunder a beat later
    ambientIn -= dt;
    if (ambientIn <= 0 && !done) {
      const x = 60 + rnd() * (W - 120);
      skyBolt = { pts: makeBolt(x, -20, 90 + rnd() * 110, rnd), life: 0.28 };
      flash = Math.max(flash, 0.3 + rnd() * 0.3);
      thunderIn = 0.35 + rnd() * 0.9;
      ambientIn = 3.5 + rnd() * 4;
    }
    if (skyBolt) {
      skyBolt.life -= dt;
      if (skyBolt.life <= 0) skyBolt = null;
    }
    if (thunderIn > 0) {
      thunderIn -= dt;
      if (thunderIn <= 0) host.audio.sfx('thunder');
    }
    // rain
    const gust = gustFx > 0 ? 1 : 0;
    const slant = 0.16 + gust * 0.75;
    const camD = camX - lastCamX;
    for (const l of rain) {
      for (let i = 0; i < l.n; i++) {
        l.ys[i] += l.speed * dt;
        l.xs[i] += slant * l.speed * dt - camD * l.depth;
        if (l.ys[i] > H + 20) {
          l.ys[i] = -l.len - rnd() * 40;
          l.xs[i] = rnd() * (W + 300) - 200;
        }
        if (l.xs[i] > W + 120) l.xs[i] -= W + 260;
        else if (l.xs[i] < -140) l.xs[i] += W + 260;
      }
    }
    // rain hitting the lawn and the puddles
    for (let i = 0; i < 2; i++) ripple(camX + rnd() * W, GROUND_Y - 6 + rnd() * (H - GROUND_Y + 6), false);
    for (const p of sim.puddles) {
      const sx = p.x - camX;
      if (sx > W || sx + p.w < 0) continue;
      if (rnd() < dt * 16) ripple(p.x + 8 + rnd() * (p.w - 16), GROUND_Y + 2 + rnd() * 8, false);
    }
    for (const r of ripples) if (r.life > 0) r.life -= dt;
    // wind gust debris
    if (gustFx > 0) {
      gustFx -= dt;
      if (rnd() < dt * 30) spawn(P.Leaf, camX - 20 + rnd() * W * 0.5, 80 + rnd() * 240, 380 + rnd() * 200, (rnd() - 0.5) * 80, 1.6, 3 + rnd() * 3, rnd() < 0.6 ? '#4f8a4f' : '#a8743c');
    }
    // boombox aura
    if (sim.invincible > 0 && !done) {
      const w = sim.wes;
      if (rnd() < dt * 26) spawn(P.Sparkle, w.x + (rnd() - 0.5) * 60, GROUND_Y - w.h - rnd() * 100, (rnd() - 0.5) * 30, -20 - rnd() * 30, 0.7, 2 + rnd() * 2, rnd() < 0.5 ? '#fff3a0' : '#ffb6e1');
      if (rnd() < dt * 5) spawn(P.Note, w.x + 10 + rnd() * 20, GROUND_Y - w.h - 95, 20 + rnd() * 20, -40, 1.3, 12 + rnd() * 5, ['#ffe80f', '#f9b6c8', '#9be3c9'][Math.floor(rnd() * 3)]);
    }
    for (const p of parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === P.Drop || p.kind === P.Chip || p.kind === P.Spark) {
        p.vy += 900 * dt;
        if (p.y > GROUND_Y + 6 && p.vy > 0) {
          if (p.kind === P.Chip) {
            p.vy *= -0.3;
            p.vx *= 0.6;
            p.y = GROUND_Y + 6;
          } else p.life = 0;
        }
      } else if (p.kind === P.Leaf) {
        p.vy += Math.sin(t * 6 + p.rot) * 120 * dt;
      } else if (p.kind === P.Smoke) {
        p.size += dt * 8;
      }
    }
    for (const s of scorches) s.life -= dt;
    while (scorches.length && scorches[0].life <= 0) scorches.shift();
    for (const s of says) {
      s.life -= dt;
      s.y -= dt * 30;
    }
    while (says.length && says[0].life <= 0) says.shift();
    for (const [o, k] of knockT) knockT.set(o, Math.min(1, k + dt * 3));
    for (const id of bolts.keys()) if (!sim.strikes.some((st) => st.id === id)) bolts.delete(id);
    lastCamX = camX;
  }

  function updateHud() {
    const hud = host.hud;
    if (sim.lives !== hudLast.lives || sim.maxLives !== hudLast.max) {
      hudLast.lives = sim.lives;
      hudLast.max = sim.maxLives;
      hud.setLives(Math.max(0, sim.lives), sim.maxLives);
    }
    const soak = Math.round(sim.soak * 100);
    if (soak !== hudLast.soak) {
      hudLast.soak = soak;
      hud.setProgress(Math.min(1, sim.soak), 1, 'Seats');
    }
    const wet = Math.round(sim.wet * 100);
    if (wet !== hudLast.wet && wetText) {
      hudLast.wet = wet;
      wetText.textContent = wet >= 100 ? 'Drenched!' : `Wet ${wet}%`;
    }
    // the item at work, with its own art: boombox and cap count down
    let item = '';
    let text = '';
    if (sim.invincible > 0) [item, text] = ['boombox', `${Math.ceil(sim.invincible)}s`];
    else if (sim.hintT > 0) [item, text] = ['cap', `${Math.ceil(sim.hintT)}s`];
    else if (sim.batTarget) [item, text] = ['bat', 'Ready'];
    const chip = item + text;
    if (chip !== hudLast.chip && itemChip && itemImg && itemText) {
      hudLast.chip = chip;
      itemChip.style.display = item ? '' : 'none';
      if (item) {
        const src = asset(`img/items/${item}.png`);
        if (itemImg.getAttribute('src') !== src) itemImg.src = src;
        itemText.textContent = text;
      }
    }
  }

  function finish(outcome: 'win' | 'lose') {
    if (done) return;
    done = true;
    if (outcome === 'win') {
      const spare = Math.max(0, Math.round((1 - sim.soak) * SOAK_TIME));
      host.finish({ outcome: 'win', score: spare, summary: `Window rolled up with ${spare}s to spare!` });
    } else host.finish({ outcome: 'lose' });
  }

  function updateEnd(dt: number) {
    endT += dt;
    if (sim.phase === 'won') {
      if (endT > 0.8 && !lightClicked) {
        lightClicked = true;
        host.audio.sfx('click');
      }
      if (lightClicked) lizLight = Math.min(1, lizLight + dt * 2.5);
      if (endT > 2.8) finish('win');
    } else if (endT > 1.9) finish('lose');
  }

  // -------------------------------------------------------------- render
  function bgGeom() {
    const W = host.stage.W;
    const img = host.image(IMG.bg);
    const bw = BG_H * (img ? img.width / img.height : BG_ASPECT);
    const max = WORLD_W - W;
    const f = max > 0 ? camX / max : 0;
    return { x: -f * Math.max(0, bw - W), w: bw };
  }

  function drawBackdrop(ctx: CanvasRenderingContext2D) {
    const { W, H } = host.stage;
    const g = bgGeom();
    const img = host.image(IMG.bg);
    const src = img ?? fallbackBg;
    if (src) ctx.drawImage(src, g.x + shakeX * 0.3, BG_Y + shakeY * 0.3, g.w, BG_H);
    else {
      ctx.fillStyle = '#18264a';
      ctx.fillRect(0, 0, W, H);
    }
    // night grade so the foreground pops
    ctx.fillStyle = 'rgba(10,16,48,0.28)';
    ctx.fillRect(0, 0, W, H);
    // porch lights: Wes's is on, Liz's comes on at the end
    const glow = (x: number, y: number, r: number, a: number) => {
      const gr = ctx.createRadialGradient(x, y, 1, x, y, r);
      gr.addColorStop(0, `rgba(255,226,140,${a})`);
      gr.addColorStop(0.35, `rgba(255,200,90,${a * 0.4})`);
      gr.addColorStop(1, 'rgba(255,190,80,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const spot = (fx: number, fy: number) => [g.x + fx * g.w, BG_Y + fy * BG_H];
    const [wx, wy] = spot(BG_SPOTS.wesLamp[0], BG_SPOTS.wesLamp[1]);
    if (wx > -80 && wx < W + 80) glow(wx, wy, 46, 0.7 + Math.sin(t * 3) * 0.05);
    // Liz's porch lamp stays dark until she hears him out there
    const [lx, ly] = spot(BG_SPOTS.lizLamp[0], BG_SPOTS.lizLamp[1]);
    if (lizLight < 1 && lx > -40 && lx < W + 40) {
      ctx.fillStyle = `rgba(40,44,70,${0.85 * (1 - lizLight)})`;
      ctx.beginPath();
      ctx.ellipse(lx, ly + 1, 3.2, 4.4, 0, 0, TAU);
      ctx.fill();
    }
    if (lizLight > 0) {
      const [d0, d1, d2, d3] = BG_SPOTS.lizDoor;
      const [dx0, dy0] = spot(d0, d1);
      const [dx1, dy1] = spot(d2, d3);
      // the door swings open on a warm hallway, and there she is
      ctx.globalAlpha = lizLight;
      ctx.fillStyle = '#ffd98a';
      ctx.fillRect(dx0, dy0, dx1 - dx0, dy1 - dy0);
      const cx = (dx0 + dx1) / 2;
      const liz = host.image(IMG.liz);
      if (liz) {
        const lh = (dy1 - dy0) * 0.92;
        const lw = (lh * liz.width) / liz.height;
        ctx.drawImage(liz, cx - lw / 2, dy1 - 1 - lh, lw, lh);
      } else {
        ctx.fillStyle = '#d98d9a';
        ctx.fillRect(cx - 5, dy1 - 30, 10, 28);
        ctx.fillStyle = '#e8692f';
        ctx.beginPath();
        ctx.arc(cx, dy1 - 36, 6, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      glow(lx, ly, 60, 0.9 * lizLight);
      glow(cx, dy1 - 10, 90, 0.4 * lizLight);
    }
    if (skyBolt) strokeBolt(ctx, skyBolt.pts, Math.min(1, skyBolt.life * 6) * 0.8, 0.6);
  }

  function drawGround(ctx: CanvasRenderingContext2D) {
    const { W } = host.stage;
    if (groundTile) {
      const start = -(((camX % TILE_W) + TILE_W) % TILE_W);
      const th = host.stage.H - TILE_TOP;
      for (let x = start; x < W; x += TILE_W) ctx.drawImage(groundTile, x, TILE_TOP, TILE_W, th);
    }
    // Liz's driveway under the car
    const d0 = CAR_X - 40 - camX;
    const d1 = CAR_X + CAR_W + 40 - camX;
    if (d1 > 0 && d0 < W) {
      ctx.beginPath();
      ctx.moveTo(d0 + 18, GROUND_Y - 16);
      ctx.lineTo(d1 - 18, GROUND_Y - 16);
      ctx.lineTo(d1 + 14, host.stage.H + 2);
      ctx.lineTo(d0 - 14, host.stage.H + 2);
      ctx.closePath();
      ctx.fillStyle = '#5f6a86';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      ctx.stroke();
      // expansion joints and a wet shine
      ctx.beginPath();
      ctx.moveTo(d0 + 4, GROUND_Y + 16);
      ctx.lineTo(d1 - 4, GROUND_Y + 16);
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.fillStyle = '#8b97b3';
      ctx.fillRect(d0 + 40, GROUND_Y + 26, 70, 2);
      ctx.fillRect(d1 - 120, GROUND_Y + 34, 50, 2);
    }
  }

  function drawPuddles(ctx: CanvasRenderingContext2D) {
    const { W } = host.stage;
    for (const p of sim.puddles) {
      const sx = p.x - camX;
      if (sx > W + 20 || sx + p.w < -20) continue;
      const cx = sx + p.w / 2;
      const rx = p.w / 2 + 6;
      // a flat, lumpy sheet of water with an ink edge and one lighter tone
      const blob = () => {
        ctx.beginPath();
        ctx.ellipse(cx - rx * 0.18, GROUND_Y + 5, rx * 0.8, 6, 0, 0, TAU);
        ctx.ellipse(cx + rx * 0.25, GROUND_Y + 6, rx * 0.72, 5, 0, 0, TAU);
      };
      blob();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3.2;
      ctx.stroke();
      blob();
      ctx.fillStyle = flash > 0.3 ? '#9fb8ec' : '#4f6db4';
      ctx.fill();
      ctx.fillStyle = '#7e9be0';
      ctx.beginPath();
      ctx.ellipse(cx - rx * 0.25, GROUND_Y + 4, rx * 0.45, 2.6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#e6eeff';
      ctx.fillRect(cx - p.w * 0.32, GROUND_Y + 3, p.w * 0.22, 1.4);
      ctx.fillRect(cx + p.w * 0.1, GROUND_Y + 7, p.w * 0.16, 1.2);
    }
    ctx.lineWidth = 1;
    for (const r of ripples) {
      if (r.life <= 0) continue;
      const sx = r.x - camX;
      if (sx < -30 || sx > W + 30) continue;
      const f = 1 - r.life / r.max;
      const rad = (r.big ? 26 : 7) * f + 1;
      ctx.strokeStyle = `rgba(210,230,255,${(1 - f) * (r.big ? 0.7 : 0.45)})`;
      ctx.beginPath();
      ctx.ellipse(sx, r.y, rad, rad * 0.3, 0, 0, TAU);
      ctx.stroke();
    }
  }

  function drawProps(ctx: CanvasRenderingContext2D) {
    const { W } = host.stage;
    const lib = host.image(IMG.library);
    // the little free library the Level 2 gnome guards
    const lx = 1196 - camX;
    if (lx > -80 && lx < W + 80) {
      if (lib) {
        const h = 82;
        ctx.drawImage(lib, lx - (h * lib.width) / lib.height / 2, GROUND_Y - 10 - h, (h * lib.width) / lib.height, h);
      } else {
        inkShape(ctx, '#8a5a3c', () => ctx.rect(lx - 3, GROUND_Y - 60, 6, 50));
        inkShape(ctx, '#f3e6c4', () => ctx.rect(lx - 18, GROUND_Y - 92, 36, 32));
        inkShape(ctx, '#f7768e', () => {
          ctx.moveTo(lx - 24, GROUND_Y - 90);
          ctx.lineTo(lx, GROUND_Y - 108);
          ctx.lineTo(lx + 24, GROUND_Y - 90);
          ctx.closePath();
        });
      }
    }
    // mailboxes: Wes's by his walk, Liz's by her driveway
    for (const mx of [3600, 640]) {
      const sx = mx - camX;
      if (sx < -40 || sx > W + 40) continue;
      inkShape(ctx, '#6b4630', () => ctx.rect(sx - 2.5, GROUND_Y - 52, 5, 44));
      inkShape(ctx, mx > 2000 ? '#2b2b33' : '#4f79b8', () => {
        ctx.moveTo(sx - 13, GROUND_Y - 52);
        ctx.lineTo(sx - 13, GROUND_Y - 64);
        ctx.quadraticCurveTo(sx, GROUND_Y - 74, sx + 13, GROUND_Y - 64);
        ctx.lineTo(sx + 13, GROUND_Y - 52);
        ctx.closePath();
      });
      inkShape(ctx, '#f7768e', () => ctx.rect(sx + 9, GROUND_Y - 72, 2.5, 12));
    }
  }

  function drawStrikes(ctx: CanvasRenderingContext2D) {
    for (const s of scorches) {
      const sx = s.x - camX;
      ctx.fillStyle = `rgba(10,10,14,${Math.min(0.55, s.life * 0.2)})`;
      ctx.beginPath();
      ctx.ellipse(sx, GROUND_Y + 4, 30, 7, 0, 0, TAU);
      ctx.fill();
    }
    for (const st of sim.strikes) {
      const sx = st.x - camX;
      if (!st.struck) {
        const f = clamp(st.t / st.warn, 0, 1);
        const pulse = 0.5 + 0.5 * Math.sin(t * (10 + f * 26));
        const gr = ctx.createRadialGradient(sx, GROUND_Y + 2, 2, sx, GROUND_Y + 2, st.r * 1.35);
        gr.addColorStop(0, `rgba(255,252,210,${0.35 + 0.55 * f * pulse})`);
        gr.addColorStop(0.55, `rgba(255,222,90,${0.22 + 0.38 * f})`);
        gr.addColorStop(1, 'rgba(255,200,60,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.ellipse(sx, GROUND_Y + 2, st.r * 1.35, 20, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,238,130,${0.45 + 0.45 * pulse})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.ellipse(sx, GROUND_Y + 3, st.r, 10, 0, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        // a pulsing bolt sign so first-timers know what the glow means
        const s = 0.9 + pulse * 0.25;
        ctx.save();
        ctx.translate(sx, GROUND_Y - 34 - f * 6);
        ctx.scale(s, s);
        ctx.beginPath();
        ctx.moveTo(2, -14);
        ctx.lineTo(-7, 2);
        ctx.lineTo(-1, 2);
        ctx.lineTo(-3, 14);
        ctx.lineTo(7, -3);
        ctx.lineTo(1, -3);
        ctx.lineTo(4, -14);
        ctx.closePath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.fillStyle = '#ffe80f';
        ctx.fill();
        ctx.restore();
        // crackles jumping off the ground
        ctx.strokeStyle = `rgba(255,255,230,${0.5 + 0.5 * f})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        const n = 2 + Math.floor(f * 7);
        for (let i = 0; i < n; i++) {
          let x = sx + (rnd() - 0.5) * st.r * 1.8;
          let y = GROUND_Y + 2;
          ctx.moveTo(x, y);
          for (let j = 0; j < 3; j++) {
            x += (rnd() - 0.5) * 10;
            y -= 5 + rnd() * 10 * (0.5 + f);
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        // a flickering pre-bolt in the last moments
        const pts = bolts.get(st.id);
        if (pts && f > 0.72 && Math.sin(t * 70) > 0.2) {
          ctx.save();
          ctx.translate(-camX, 0);
          strokeBolt(ctx, pts, 0.22, 0.6);
          ctx.restore();
        }
      } else {
        const age = st.t - st.warn;
        const a = clamp(1 - age / STRIKE_LINGER, 0, 1) * (Math.sin(t * 90) > -0.4 ? 1 : 0.4);
        const pts = bolts.get(st.id);
        if (pts) {
          ctx.save();
          ctx.translate(-camX, 0);
          strokeBolt(ctx, pts, a, 1.1);
          ctx.restore();
        }
        const gr = ctx.createRadialGradient(sx, GROUND_Y, 2, sx, GROUND_Y, 90);
        gr.addColorStop(0, `rgba(255,255,255,${0.9 * a})`);
        gr.addColorStop(1, 'rgba(160,200,255,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(sx - 90, GROUND_Y - 90, 180, 120);
      }
    }
  }

  /** Cap hint: a glowing trail along the safe path, arcing over obstacles. */
  function drawTrail(ctx: CanvasRenderingContext2D) {
    if (sim.hintT <= 0 || sim.phase !== 'run') return;
    const { W } = host.stage;
    const w = sim.wes;
    const v = RUN * sim.speed;
    const fade = Math.min(1, sim.hintT / 1.5);
    const arcs: Array<[number, number]> = [];
    for (const o of sim.obstacles) {
      if (!o.alive || o === sim.batTarget || o.x > w.x || o.x < w.x - 900) continue;
      const win = takeoffWindow(o, v);
      if (win) arcs.push([(win.lo + win.hi) / 2, (win.lo + win.hi) / 2 - v * AIR_TIME]);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    let waitAt: number | null = null;
    for (let x = w.x - 26; x > w.x - 820; x -= 15) {
      const sx = x - camX;
      if (sx < -10) break;
      if (sx > W + 10) continue;
      let danger = false;
      for (const st of sim.strikes) {
        if (st.struck) continue;
        const [a, b] = dangerZone(st);
        if (x > a && x < b) {
          danger = true;
          if (waitAt === null) waitAt = b + 10;
        }
      }
      let h = 0;
      for (const [take, land] of arcs) {
        if (x <= take && x >= land) {
          const tt = (take - x) / v;
          h = Math.max(0, JUMP_V * tt - (GRAVITY * tt * tt) / 2);
        }
      }
      const pulse = 0.5 + 0.5 * Math.sin(t * 7 + x * 0.04);
      if (danger) {
        ctx.fillStyle = `rgba(255,90,90,${0.35 * fade})`;
        ctx.fillRect(sx - 3, GROUND_Y - 8, 6, 2);
      } else {
        ctx.fillStyle = `rgba(255,226,107,${(0.45 + 0.4 * pulse) * fade})`;
        ctx.beginPath();
        ctx.arc(sx, GROUND_Y - 8 - h, 2.6 + pulse * 1.4, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.font = "15px 'Permanent Marker', 'Patrick Hand', sans-serif";
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    for (const [take] of arcs) {
      const sx = take - camX;
      if (sx < 20 || sx > W - 20) continue;
      ctx.globalAlpha = fade;
      ctx.strokeText('JUMP', sx, GROUND_Y + 22);
      ctx.fillStyle = '#ffe36b';
      ctx.fillText('JUMP', sx, GROUND_Y + 22);
    }
    if (waitAt !== null) {
      const sx = waitAt - camX;
      ctx.strokeText('WAIT', sx, GROUND_Y + 22);
      ctx.fillStyle = '#ff8c8c';
      ctx.fillText('WAIT', sx, GROUND_Y + 22);
    }
    ctx.globalAlpha = 1;
  }

  function drawCarAndWindow(ctx: CanvasRenderingContext2D) {
    const sx = CAR_X - camX;
    if (sx > host.stage.W + 20 || sx + CAR_W < -20) return;
    const img = host.image(IMG.car);
    const glass = sim.crank;
    if (!img) {
      drawCar(ctx, sx, GROUND_Y + 4, CAR_W, glass, sim.soak, t);
      if (sim.phase === 'crank') drawCrank(ctx, sx + CAR_W * 0.55, GROUND_Y - 34, crankAngle);
      return;
    }
    const h = (CAR_W * img.height) / img.width;
    const top = GROUND_Y + 5 - h;
    const { front, rear } = carWindows;
    const fx0 = sx + front.x0 * CAR_W;
    const fx1 = sx + front.x1 * CAR_W;
    const y0 = top + front.y0 * h;
    const y1 = top + front.y1 * h;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(sx + CAR_W / 2, GROUND_Y + 4, CAR_W * 0.5, 7, 0, 0, TAU);
    ctx.fill();
    // Everything here is drawn behind the sprite and only shows through its
    // see-through windows: a dark cabin, rain blowing in, and the glass.
    const cx0 = Math.min(fx0, rear ? sx + rear.x0 * CAR_W : fx0) - 2;
    const cx1 = Math.max(fx1, rear ? sx + rear.x1 * CAR_W : fx1) + 2;
    const cy0 = Math.min(y0, rear ? top + rear.y0 * h : y0) - 2;
    const cy1 = Math.max(y1, rear ? top + rear.y1 * h : y1) + 2;
    ctx.fillStyle = '#18213a';
    ctx.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
    // a headrest, getting soaked
    ctx.fillStyle = sim.soak > 0.6 ? '#3b2f36' : '#5b4a52';
    ctx.beginPath();
    ctx.ellipse(fx1 - (fx1 - fx0) * 0.22, y0 + (y1 - y0) * 0.55, (fx1 - fx0) * 0.08, (y1 - y0) * 0.32, 0, 0, TAU);
    ctx.fill();
    if (rear) {
      ctx.fillStyle = 'rgba(130,170,210,0.55)';
      ctx.fillRect(sx + rear.x0 * CAR_W - 2, top + rear.y0 * h - 2, (rear.x1 - rear.x0) * CAR_W + 4, (rear.y1 - rear.y0) * h + 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sx + (rear.x0 + 0.03) * CAR_W, top + (rear.y1 - 0.02) * h);
      ctx.lineTo(sx + (rear.x0 + 0.07) * CAR_W, top + (rear.y0 + 0.04) * h);
      ctx.stroke();
    }
    if (glass < 1) {
      ctx.strokeStyle = 'rgba(170,205,255,0.7)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      const span = fx1 - fx0;
      for (let i = 0; i < 10; i++) {
        const rx = fx0 + ((i * 0.13 + t * 0.9) % 1) * span;
        const ry = y0 + ((i * 17 + t * 260) % Math.max(1, (y1 - y0) * (1 - glass)));
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + 2, ry + 7);
      }
      ctx.stroke();
    }
    if (glass > 0) {
      const gy = y1 + 2 - (y1 - y0 + 4) * glass;
      // flat pale glass like the rear window's, with an ink top edge
      ctx.fillStyle = '#bcd8ee';
      ctx.fillRect(fx0 - 2, gy, fx1 - fx0 + 4, y1 - gy + 4);
      ctx.fillStyle = INK;
      ctx.fillRect(fx0 - 2, gy, fx1 - fx0 + 4, 1.8);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(fx0 + (fx1 - fx0) * 0.3, gy + 5);
      ctx.lineTo(fx0 + (fx1 - fx0) * 0.38, Math.min(y1, gy + 30));
      ctx.moveTo(fx0 + (fx1 - fx0) * 0.42, gy + 5);
      ctx.lineTo(fx0 + (fx1 - fx0) * 0.46, Math.min(y1, gy + 18));
      ctx.stroke();
    }
    ctx.drawImage(img, sx, top, CAR_W, h);
  }

  function drawObstacles(ctx: CanvasRenderingContext2D) {
    const { W } = host.stage;
    const gnome = host.image(IMG.gnome);
    for (const o of sim.obstacles) {
      if (!o.alive && (o.how === 'bat' || o.how === 'smash')) continue;
      const sx = o.x - camX;
      if (sx > W + 40 || sx + o.w < -40) continue;
      const k = o.alive ? 0 : knockT.get(o) ?? 1;
      if (o.kind === 'gnome' && gnome) {
        const h = o.h + 6;
        const gw = (h * gnome.width) / gnome.height;
        ctx.save();
        ctx.translate(sx + o.w / 2 + k * 14, GROUND_Y + 2);
        if (k) ctx.rotate((-Math.PI / 2) * Math.min(1, k * 1.4));
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 0, gw * 0.7, 3, 0, 0, TAU);
        ctx.fill();
        ctx.drawImage(gnome, -gw / 2, -h, gw, h);
        // his head is glued back on after Level 2
        ctx.fillStyle = 'rgba(255,240,190,0.9)';
        ctx.save();
        ctx.translate(2, -h * 0.5);
        ctx.rotate(-0.45);
        ctx.fillRect(-6, -1.6, 12, 3.2);
        ctx.restore();
        ctx.restore();
      } else drawObstacle(ctx, o, sx, GROUND_Y + 2, k);
    }
    const bt = sim.batTarget;
    if (bt && bt.alive) {
      const sx = bt.x + bt.w / 2 - camX;
      const y = GROUND_Y - bt.h - 34 + Math.sin(t * 5) * 4;
      ctx.save();
      ctx.translate(sx - 6, y + 14);
      ctx.rotate(0.5 + Math.sin(t * 3) * 0.2);
      drawBat(ctx, 34);
      ctx.restore();
      ctx.font = "13px 'Permanent Marker', sans-serif";
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.strokeText('SMASH', sx, y - 18);
      ctx.fillStyle = '#ffe80f';
      ctx.fillText('SMASH', sx, y - 18);
    }
  }

  function wesPose(): { rot: number; bob: number; sx: number; sy: number } {
    const w = sim.wes;
    const stride = Math.min(1, Math.abs(w.vx) / RUN);
    let rot = 0;
    let bob = 0;
    let sx = 1;
    let sy = 1;
    if (sim.phase === 'lost' && sim.lostReason === 'lives') {
      rot = Math.min(1, endT * 4) * 1.35;
      bob = Math.min(1, endT * 4) * 28;
    } else if (sim.phase === 'won') {
      bob = endT < 1.4 ? -Math.abs(Math.sin(endT * 7)) * 16 : 0;
    } else if (sim.phase === 'crank') {
      rot = -0.1 + Math.sin(crankAngle) * 0.025;
      bob = Math.sin(crankAngle) * 1.5;
    } else if (w.stun > 0) {
      rot = (w.stun / STUN_STUMBLE) * 0.75;
    } else if (!w.onGround) {
      rot = w.vy > 0 ? -0.14 : 0.04;
    } else {
      const strut = sim.invincible > 0;
      bob = -Math.abs(Math.sin(runPhase)) * (strut ? 8 : 4.5) * stride;
      rot = (-0.05 + Math.sin(runPhase * 2) * 0.035) * stride + (strut ? Math.sin(runPhase) * 0.06 : 0);
      if (activeGust(sim)) rot -= 0.12;
      sy = 1 - squash * 0.08;
      sx = 1 + squash * 0.05;
    }
    return { rot, bob, sx, sy };
  }

  function drawWesNow(ctx: CanvasRenderingContext2D) {
    const w = sim.wes;
    const x = w.x - camX;
    const y = GROUND_Y + 3 - w.h;
    const atCar = sim.phase === 'crank' || sim.phase === 'won';
    const reach = atCar ? host.image(IMG.reach) : null;
    const img = host.image(IMG.wes);
    const blink = w.inv > 0 && sim.phase === 'run' && Math.floor(t * 12) % 2 === 0;
    // shadow
    ctx.fillStyle = `rgba(0,0,0,${0.35 * clamp(1 - w.h / 200, 0.3, 1)})`;
    ctx.beginPath();
    ctx.ellipse(x, GROUND_Y + 4, 26 * clamp(1 - w.h / 300, 0.5, 1), 5, 0, 0, TAU);
    ctx.fill();
    // boombox aura
    if (sim.invincible > 0 && sim.phase === 'run') {
      const r = 64 + Math.sin(t * 8) * 4;
      const gr = ctx.createRadialGradient(x, y - 50, 10, x, y - 50, r);
      gr.addColorStop(0, 'rgba(255,240,150,0.0)');
      gr.addColorStop(0.7, `rgba(255,190,230,${0.18 + Math.sin(t * 6) * 0.06})`);
      gr.addColorStop(1, 'rgba(255,180,230,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x - r, y - 50 - r, r * 2, r * 2);
    }
    ctx.save();
    if (blink) ctx.globalAlpha = 0.45;
    const pose = wesPose();
    if (reach) {
      // leaning into the open window, his fist circling with the crank
      const h = REACH_H;
      const iw = (h * reach.width) / reach.height;
      const c = sim.phase === 'crank' ? crankAngle : 0;
      const hop = sim.phase === 'won' && endT < 0.6 ? -Math.sin((endT / 0.6) * Math.PI) * 5 : 0;
      ctx.drawImage(reach, x - iw / 2 + Math.cos(c) * 1.4, y - h + Math.sin(c) * 1.8 + hop, iw, h);
    } else if (img) {
      const h = WES_H;
      const iw = (h * img.width) / img.height;
      ctx.translate(x, y + pose.bob);
      ctx.scale(w.facing === 1 ? -pose.sx : pose.sx, pose.sy);
      ctx.translate(0, -h * 0.45);
      ctx.rotate(pose.rot);
      ctx.translate(0, h * 0.45);
      ctx.drawImage(img, -iw / 2, -h, iw, h);
      if (zapT > 0 && Math.floor(t * 30) % 2 === 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        ctx.drawImage(img, -iw / 2, -h, iw, h);
      }
    } else {
      const p: WesPose = {
        facing: w.facing,
        phase: runPhase,
        stride: Math.min(1, Math.abs(w.vx) / RUN),
        air: !w.onGround,
        lean: 0.18 + (activeGust(sim) ? 0.25 : 0),
        tumble: pose.rot > 0.1 && sim.phase === 'run' ? pose.rot : 0,
        pose: sim.phase === 'crank' ? 'crank' : sim.phase === 'won' ? 'cheer' : sim.phase === 'lost' && sim.lostReason === 'lives' ? 'down' : 'run',
        crank: crankAngle,
        swing: sim.batSwing < 0.35 ? sim.batSwing / 0.35 : -1,
        strut: sim.invincible > 0,
        t,
      };
      ctx.translate(0, pose.bob * (p.pose === 'down' ? 0 : 1));
      drawWes(ctx, x, y, p);
    }
    ctx.restore();
    // boombox on his shoulder while strutting
    if (sim.invincible > 0 && sim.phase === 'run') {
      const bb = host.image(IMG.boombox);
      const bx = x - 10 * w.facing;
      const by = y + pose.bob - WES_H * 0.86;
      if (bb) {
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(Math.sin(t * 9) * 0.08);
        ctx.drawImage(bb, -20, -16, 40, (40 * bb.height) / bb.width);
        ctx.restore();
      } else drawBoombox(ctx, bx, by, t);
    }
    // bat swing
    if (img && sim.batSwing < 0.35) {
      const f = sim.batSwing / 0.35;
      ctx.save();
      ctx.translate(x + 26 * w.facing, y - 70);
      ctx.rotate(-w.facing * (0.8 - 2.8 * f));
      drawBat(ctx, 60);
      ctx.restore();
    }
    // the crank, turning under his hand
    if (sim.phase === 'crank' && img && !reach) drawCrank(ctx, x - 33, y - 66, crankAngle);
  }

  function drawParticles(ctx: CanvasRenderingContext2D) {
    const { W } = host.stage;
    for (const p of parts) {
      if (p.life <= 0) continue;
      const sx = p.x - camX;
      if (sx < -40 || sx > W + 40) continue;
      const a = clamp(p.life / p.max, 0, 1);
      switch (p.kind) {
        case P.Drop:
        case P.Spark:
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.fillRect(sx - p.size / 2, p.y - p.size, p.size, p.size * 1.8);
          break;
        case P.Chip:
        case P.Leaf:
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.save();
          ctx.translate(sx, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
          ctx.restore();
          break;
        case P.Sparkle: {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          const s = p.size * (0.6 + a * 0.6);
          ctx.beginPath();
          ctx.moveTo(sx, p.y - s * 2);
          ctx.lineTo(sx + s * 0.5, p.y - s * 0.5);
          ctx.lineTo(sx + s * 2, p.y);
          ctx.lineTo(sx + s * 0.5, p.y + s * 0.5);
          ctx.lineTo(sx, p.y + s * 2);
          ctx.lineTo(sx - s * 0.5, p.y + s * 0.5);
          ctx.lineTo(sx - s * 2, p.y);
          ctx.lineTo(sx - s * 0.5, p.y - s * 0.5);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case P.Note:
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.font = `${Math.round(p.size)}px 'Patrick Hand', sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(p.rot > Math.PI ? '♪' : '♫', sx, p.y);
          break;
        case P.Smoke:
          ctx.globalAlpha = a * 0.5;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(sx, p.y, p.size, 0, TAU);
          ctx.fill();
          break;
        case P.Heart:
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.font = `${Math.round(p.size)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('♥', sx, p.y);
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawRain(ctx: CanvasRenderingContext2D, layer: RainLayer) {
    const slant = 0.16 + (gustFx > 0 ? 0.75 : 0);
    ctx.strokeStyle = `rgba(200,220,255,${layer.alpha + flash * 0.3})`;
    ctx.lineWidth = layer.width;
    ctx.beginPath();
    for (let i = 0; i < layer.n; i++) {
      const x = layer.xs[i];
      const y = layer.ys[i];
      ctx.moveTo(x, y);
      ctx.lineTo(x - slant * layer.len, y - layer.len);
    }
    ctx.stroke();
  }

  function drawForegroundGrass(ctx: CanvasRenderingContext2D) {
    // dark tufts right at the lens, moving faster than the yard
    const { W, H } = host.stage;
    const off = -((camX * 1.3) % 90);
    ctx.fillStyle = 'rgba(6,20,14,0.85)';
    ctx.beginPath();
    for (let x = off - 90; x < W + 90; x += 90) {
      const sway = Math.sin(t * 2 + x * 0.01) * 3 + (gustFx > 0 ? 6 : 0);
      ctx.moveTo(x, H);
      ctx.quadraticCurveTo(x + 6 + sway, H - 22, x + 12 + sway * 1.5, H - 30);
      ctx.quadraticCurveTo(x + 12, H - 14, x + 18, H);
      ctx.moveTo(x + 14, H);
      ctx.quadraticCurveTo(x + 24 + sway, H - 16, x + 32 + sway, H - 20);
      ctx.quadraticCurveTo(x + 28, H - 8, x + 34, H);
    }
    ctx.fill();
  }

  function drawCrankUi(ctx: CanvasRenderingContext2D) {
    if (mode !== 'crank') return;
    const { W, H, safe } = host.stage;
    const bx = W - safe.right - 112;
    const by = H - safe.bottom - 112;
    // progress ring around the HOLD button
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(bx, by, 84, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#ffe80f';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(bx, by, 84, -Math.PI / 2, -Math.PI / 2 + TAU * sim.crank);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.font = "19px 'Permanent Marker', 'Patrick Hand', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    const text = 'HOLD to roll up the window';
    const tw = ctx.measureText(text).width;
    const tx = Math.min(bx, W - safe.right - 12 - tw / 2);
    ctx.strokeText(text, tx, by - 100);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, tx, by - 100);
  }

  function drawSays(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = 'center';
    ctx.font = "22px 'Permanent Marker', 'Patrick Hand', sans-serif";
    ctx.lineWidth = 4;
    for (const s of says) {
      const a = clamp(s.life / 0.4, 0, 1);
      ctx.globalAlpha = a;
      ctx.strokeStyle = INK;
      ctx.strokeText(s.text, s.x - camX, s.y);
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.x - camX, s.y);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- game
  const g: MiniGame = {
    async init(h) {
      host = h;
      await h.load(Object.values(IMG));
      // the player may have quit while the art was loading
      if (destroyed) return;
      const car = h.image(IMG.car);
      if (car) carWindows = measureWindows(car) ?? CAR_WINDOWS;
      sim = createSim({ seed: (Math.random() * 1e9) | 0, speed: h.speed });
      camX = lastCamX = camTarget();
      buildCaches();
      seedRain();
      layoutControls();
      unsubResize = h.stage.onResize(() => {
        buildCaches();
        layoutControls();
      });
      wetText = document.createElement('span');
      wetChip = document.createElement('div');
      wetChip.className = 'hud-chip';
      wetChip.dataset.testid = 'sq3-wet';
      wetChip.append(icon('drop'), wetText);
      itemImg = document.createElement('img');
      itemImg.alt = '';
      itemImg.style.cssText = 'width:26px;height:26px;object-fit:contain';
      itemText = document.createElement('span');
      itemChip = document.createElement('div');
      itemChip.className = 'hud-chip';
      itemChip.dataset.testid = 'sq3-item';
      itemChip.style.display = 'none';
      itemChip.append(itemImg, itemText);
      h.hud.custom().append(itemChip, wetChip);
      updateHud();
      h.audio.setRain(true, 0.16);
      h.banner('Close her window!');
    },

    update(dt) {
      if (done) return;
      t += dt;
      step(sim, dt, readInput());
      for (const e of sim.events) onEvent(e);
      updateWes(dt);
      camX += (camTarget() - camX) * Math.min(1, dt * 5);
      updateFx(dt);
      updateHud();
      if (sim.phase === 'won' || sim.phase === 'lost') updateEnd(dt);
    },

    render(ctx) {
      const { W, H } = host.stage;
      ctx.fillStyle = '#0d1530';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(shakeX, shakeY);
      drawBackdrop(ctx);
      drawRain(ctx, rain[0]);
      drawGround(ctx);
      drawProps(ctx);
      drawPuddles(ctx);
      drawStrikes(ctx);
      drawTrail(ctx);
      drawCarAndWindow(ctx);
      drawObstacles(ctx);
      drawWesNow(ctx);
      drawParticles(ctx);
      drawRain(ctx, rain[1]);
      drawForegroundGrass(ctx);
      drawRain(ctx, rain[2]);
      drawSays(ctx);
      ctx.restore();
      if (flash > 0) {
        ctx.fillStyle = `rgba(235,242,255,${flash * 0.55})`;
        ctx.fillRect(0, 0, W, H);
      }
      drawCrankUi(ctx);
      host.input.renderControls(ctx);
    },

    onItemUse(item: ItemId) {
      if (done || !useItem(sim, item)) return false;
      const w = sim.wes;
      if (item === 'cap') say('Eyes on the sky!');
      else if (item === 'bat') say('Batter up!');
      else if (item === 'boombox') {
        host.audio.sfx('star');
        say('Untouchable!');
      } else if (item === 'jersey') {
        for (let i = 0; i < 8; i++) spawn(P.Heart, w.x + (rnd() - 0.5) * 40, GROUND_Y - w.h - 60, (rnd() - 0.5) * 80, -60 - rnd() * 60, 1, 14 + rnd() * 6, '#f7768e');
        say('+1 life!', '#f9b6c8');
      }
      updateHud();
      return true;
    },

    onPause(p) {
      host.audio.setRain(!p, 0.16);
    },

    destroy() {
      destroyed = true;
      host.audio.setRain(false);
      unsubResize?.();
      host.input.clearControls();
      wetChip?.remove();
      itemChip?.remove();
    },

    debugApi() {
      return {
        state: () => ({
          phase: sim.phase,
          time: sim.time,
          x: sim.wes.x,
          h: sim.wes.h,
          vx: sim.wes.vx,
          onGround: sim.wes.onGround,
          stun: sim.wes.stun,
          lives: sim.lives,
          maxLives: sim.maxLives,
          soak: sim.soak,
          crank: sim.crank,
            speed: sim.speed,
          invincible: sim.invincible,
          hintT: sim.hintT,
          capWarn: sim.capWarn,
          batTarget: sim.batTarget?.id ?? null,
          god: sim.god,
          mode,
          camX,
          crankX: CRANK_X,
          worldW: WORLD_W,
          obstacles: sim.obstacles.map((o) => ({ id: o.id, kind: o.kind, x: o.x, w: o.w, h: o.h, alive: o.alive, how: o.how ?? null })),
          strikes: sim.strikes.map((s) => ({ x: s.x, r: s.r, t: s.t, warn: s.warn, struck: s.struck })),
          puddles: sim.puddles,
          gusts: sim.gusts,
        }),
        /** What the reference bot would press right now (for automated playtests). */
        advice: () => botInput(sim),
        teleport: (x: number) => {
          sim.wes.x = x;
          sim.wes.vx = 0;
          camX = lastCamX = camTarget();
        },
        win: () => finish('win'),
        lose: () => finish('lose'),
        god: (on = true) => {
          sim.god = on;
        },
        soak: (v: number) => {
          sim.soak = v;
        },
      };
    },
  };
  return g;
};

export default game;
