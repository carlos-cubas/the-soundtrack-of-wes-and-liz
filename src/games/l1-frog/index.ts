/**
 * Level 1: Barbie and the Frog. A Donkey Kong 25m homage set in Libby's
 * Barbie Dreamhouse: the frog climbs pink girders while the doll throws beach
 * balls down at him, and gets a kiss (and a tiny crown) up on the roof.
 *
 * Gameplay rules live in sim.ts; this file handles input, sequencing (hit,
 * respawn, win), juice and drawing.
 */
import { applyWorld } from '../../core/stage';
import type { GameHost, MiniGame, MiniGameFactory } from '../types';
import {
  drawBallFallback,
  drawChest,
  drawCrown,
  drawDollFallback,
  drawFrogFallback,
  drawHeart,
  drawStar,
  drawSticker,
  LINE,
  makeSticker,
  paintBackdrop,
  paintStructure,
  roundRect,
  type Sticker,
} from './draw';
import { BALL, BALL_FLOORS, CHEST_H, CHEST_W, CHEST_X, DOLL_X, FLOORS, LADDERS, ROOF, Sim, THROW, WORLD_H, WORLD_W, onFloor, surfaceY, type SimEvent } from './sim';

const IMG = {
  bg: 'img/bg/l1-dreamhouse.webp',
  frog: 'img/sprites/frog.png',
  frogJump: 'img/sprites/frog-jump.png',
  doll: 'img/sprites/barbie.png',
  ball: 'img/sprites/beachball.png',
};

const MAX_LIVES = 3;
const BONUS_START = 5000;
/** The bonus drops by 100 this often (seconds), like Donkey Kong's. */
const BONUS_TICK = 1.5;
const FROG_H = 26;
const DOLL_H = 56;
const ROOF_Y = FLOORS[ROOF].y0;
/** Where the spare beach balls sit next to the doll. */
const PILE: Array<[number, number]> = [
  [DOLL_X - 40, ROOF_Y - 10],
  [DOLL_X - 21, ROOF_Y - 10],
  [DOLL_X - 30.5, ROOF_Y - 27],
];

type Phase = 'play' | 'hurt' | 'over' | 'win';

interface Particle {
  kind: 'dust' | 'heart' | 'star' | 'spark';
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  size: number;
  color: string;
  rot: number;
}

interface Popup {
  text: string;
  x: number;
  y: number;
  t: number;
  life: number;
  color: string;
  size: number;
}

const l1: MiniGameFactory = () => {
  let host: GameHost;
  let sim: Sim;
  let phase: Phase = 'play';
  let phaseT = 0;
  let lives = MAX_LIVES;
  let playTime = 0;
  let world = { s: 1, ox: 0, oy: 0 };
  let staticLayer: HTMLCanvasElement | null = null;
  let unsubResize: (() => void) | null = null;
  let jumpBuf = 0;
  let shake = 0;
  let shakeX = 0;
  let shakeY = 0;
  let destroyed = false;
  // squash/stretch spring: >0 stretched tall, <0 squashed flat
  let squash = 0;
  let squashV = 0;
  let throwKick = 0;
  let dollLean = 0;
  let chestLid = 0;
  let crownT = -1;
  /** 0..1 celebration camera: zooms and pans onto the kiss. */
  let cam = 0;
  let kissed = false;
  let winSfx = false;
  let heartClock = 0;
  let finalBonus = 0;
  let tallied = 0;
  let shownScore = -1;
  let particles: Particle[] = [];
  let popups: Popup[] = [];
  let anim = 0;
  /**
   * Where the BONUS box goes, in CSS px from the canvas' top-left: right under
   * the DOM HUD's chips and at their scale (k), measured on layout.
   */
  let bonusBox = { right: 0, top: 52, k: 1 };
  /** On-screen control positions in virtual units (also reported to tests). */
  const controls = { pad: { x: 0, y: 0, r: 0 }, jump: { x: 0, y: 0, r: 0 } };
  /** Sprites with their sticker outline, baked once after loading; null = draw the fallback. */
  const art: Record<'frog' | 'frogJump' | 'doll' | 'ball', Sticker | null> = { frog: null, frogJump: null, doll: null, ball: null };

  const bonus = () => Math.max(0, BONUS_START - 100 * Math.floor(sim.lifeT / BONUS_TICK));
  const totalScore = () => sim.score + tallied;

  // ---------------------------------------------------------------- layout
  function layout(): void {
    const { W, H, safe } = host.stage;
    world = host.stage.fitWorld(WORLD_W, WORLD_H);
    const input = host.input;
    input.clearControls();
    // thumb-sized on every screen: cap the on-screen radius in CSS px so the
    // controls don't double in size on an iPad (phones keep 54 / 42)
    const css = (units: number, maxPx: number) => Math.min(units, maxPx / host.stage.scale);
    const r = css(54, 76);
    controls.pad = { x: safe.left + 14 + r, y: H - safe.bottom - 12 - r, r };
    input.addDpad({ id: 'pad', ...controls.pad, axes: '4' });
    const jr = css(42, 60);
    controls.jump = { x: W - safe.right - 14 - jr, y: H - safe.bottom - 12 - jr, r: jr };
    input.addButton({ id: 'jump', ...controls.jump, label: 'JUMP', color: '#f7768e', keys: ['Space', 'KeyZ'] });
    buildStatic();
    measureHud();
  }

  /** Line the BONUS box up under the HUD chips, whatever size the HUD renders at. */
  function measureHud(): void {
    const c = host.stage.canvas.getBoundingClientRect();
    const hud = host.hud.root.getBoundingClientRect();
    const chip = host.hud.root.querySelector('[data-testid=hud-lives]')?.getBoundingClientRect();
    const k = chip && chip.height > 0 ? chip.height / 38 : 1;
    bonusBox = {
      right: hud.width > 0 ? hud.right - c.left : c.width - 8,
      top: (chip && chip.height > 0 ? chip.bottom - c.top : 44) + 8 * k,
      k,
    };
  }

  /** Background + girders + ladders, cached at device resolution. */
  function buildStatic(): void {
    const st = host.stage;
    const k = st.scale * st.dpr;
    const c = staticLayer ?? document.createElement('canvas');
    c.width = Math.max(1, Math.round(st.W * k));
    c.height = Math.max(1, Math.round(st.H * k));
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    const bg = host.image(IMG.bg);
    if (bg) {
      const s = Math.max(st.W / bg.naturalWidth, st.H / bg.naturalHeight);
      const w = bg.naturalWidth * s;
      const h = bg.naturalHeight * s;
      g.drawImage(bg, (st.W - w) / 2, (st.H - h) / 2, w, h);
      // soften the busy dollhouse so the girders and characters pop
      g.fillStyle = 'rgba(255,238,246,0.42)';
      g.fillRect(0, 0, st.W, st.H);
    } else {
      paintBackdrop(g, st.W, st.H, world.oy + FLOORS[0].y0 * world.s);
    }
    g.save();
    applyWorld(g, world);
    paintStructure(g, -world.ox / world.s - 4, (st.W - world.ox) / world.s + 4);
    g.restore();
    staticLayer = c;
  }

  // ---------------------------------------------------------------- fx
  function dust(x: number, y: number, n: number, size = 4): void {
    for (let i = 0; i < n; i++) {
      const a = Math.PI + Math.random() * Math.PI;
      particles.push({
        kind: 'dust',
        x: x + (Math.random() - 0.5) * 10,
        y: y - 2,
        vx: Math.cos(a) * (20 + Math.random() * 30),
        vy: Math.sin(a) * (8 + Math.random() * 14),
        t: 0,
        life: 0.35 + Math.random() * 0.25,
        size: size * (0.7 + Math.random() * 0.6),
        color: 'rgba(255,255,255,0.9)',
        rot: 0,
      });
    }
  }

  function burst(kind: Particle['kind'], x: number, y: number, n: number, speed: number, colors: string[], size: number, life = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      particles.push({
        kind,
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.4,
        t: 0,
        life: life * (0.7 + Math.random() * 0.5),
        size: size * (0.7 + Math.random() * 0.6),
        color: colors[i % colors.length],
        rot: (Math.random() - 0.5) * 0.8,
      });
    }
  }

  function floatHeart(x: number, y: number, size: number): void {
    particles.push({
      kind: 'heart',
      x,
      y,
      vx: (Math.random() - 0.5) * 16,
      vy: -26 - Math.random() * 14,
      t: 0,
      life: 1.4,
      size,
      color: Math.random() < 0.5 ? '#ff4f8b' : '#ff8fc0',
      rot: (Math.random() - 0.5) * 0.5,
    });
  }

  function popup(text: string, x: number, y: number, color = '#ffe80f', size = 18, life = 0.9): void {
    popups.push({ text, x, y, t: 0, life, color, size });
  }

  function updateFx(dt: number): void {
    anim += dt;
    shake = Math.max(0, shake - dt * 22);
    shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    shakeY = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    throwKick = Math.max(0, throwKick - dt * 3);
    chestLid = Math.max(0, chestLid - dt * 2.5);
    // critically-damped-ish spring back to 1:1
    squashV += (-170 * squash - 14 * squashV) * dt;
    squash += squashV * dt;
    for (const p of particles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'dust') {
        p.vx *= 1 - 4 * dt;
        p.vy *= 1 - 4 * dt;
      } else if (p.kind === 'heart') {
        p.vx += Math.sin(p.t * 6 + p.size) * 30 * dt;
      } else {
        p.vy += 260 * dt;
      }
    }
    particles = particles.filter((p) => p.t < p.life);
    for (const p of popups) {
      p.t += dt;
      p.y -= 26 * dt;
    }
    popups = popups.filter((p) => p.t < p.life);
  }

  // ---------------------------------------------------------------- events
  function onEvent(e: SimEvent): void {
    const audio = host.audio;
    switch (e.type) {
      case 'jump':
        audio.sfx('jump');
        squash = 0.3;
        squashV = 0;
        jumpBuf = 0;
        dust(e.x, e.y, 3);
        break;
      case 'land':
        audio.sfx('land');
        squash = -0.34;
        squashV = 0;
        dust(e.x, e.y, 5);
        break;
      case 'hop':
        squash = -0.12;
        if (Math.random() < 0.5) dust(e.x - sim.frog.face * 6, e.y, 1, 3);
        break;
      case 'climbEnd':
        squash = -0.2;
        dust(sim.frog.x, sim.frog.y, 2, 3);
        break;
      case 'jumped':
        audio.sfx('collect');
        popup('+100', e.x, e.y);
        burst('spark', e.x, e.y + 8, 6, 70, ['#ffe80f', '#fff'], 2.4, 0.5);
        break;
      case 'hit':
        hit();
        break;
      case 'throw':
        audio.sfx('whoosh');
        throwKick = 1;
        break;
      case 'bounce':
        if (e.big) dust(e.x, e.y, 3, 3);
        break;
      case 'chest':
        chestLid = 1;
        audio.sfx('pop');
        burst('spark', e.x + 6, e.y - 6, 5, 60, ['#ff8fc0', '#fff', '#ffe80f'], 2.2, 0.5);
        break;
      case 'win':
        startWin();
        break;
      default:
        break;
    }
  }

  function hit(): void {
    const fr = sim.frog;
    fr.state = 'hurt';
    phase = 'hurt';
    phaseT = 0;
    lives = Math.max(0, lives - 1);
    host.hud.setLives(lives, MAX_LIVES);
    host.audio.sfx('hit');
    shake = 9;
    squash = 0;
    burst('star', fr.x, fr.y - 16, 7, 90, ['#ffe80f', '#fff', '#ff8fc0'], 3.5, 0.7);
    popup(lives > 0 ? 'Ouch!' : 'Oh no!', fr.x, fr.y - 40, '#fff', 20, 1.1);
  }

  function respawn(): void {
    for (const b of sim.balls) burst('spark', b.x, b.y, 4, 50, ['#fff', '#ff8fc0'], 2.2, 0.4);
    sim.respawn();
    sim.speed = host.speed;
    jumpBuf = 0;
    phase = 'play';
    phaseT = 0;
    squash = 0.25;
    dust(sim.frog.x, sim.frog.y, 6);
    host.audio.sfx('ribbit');
    popup('Try again!', sim.frog.x, sim.frog.y - 40, '#fff', 18, 1.2);
  }

  function startWin(): void {
    phase = 'win';
    phaseT = 0;
    sim.throwing = false;
    sim.windupT = 0;
    heartClock = 0;
    for (const b of sim.balls) burst('heart', b.x, b.y, 3, 40, ['#ff4f8b', '#ff8fc0'], 7, 0.8);
    sim.balls = [];
    finalBonus = bonus();
    host.audio.sfx('ribbit');
  }

  function updateWin(dt: number): void {
    const fr = sim.frog;
    // the frog hops over to stand facing her
    fr.x += (DOLL_X + 26 - fr.x) * Math.min(1, dt * 8);
    fr.face = -1;
    if (phaseT > 0.25) dollLean += (0.42 - dollLean) * Math.min(1, dt * 7);
    const ck = Math.min(1, Math.max(0, (phaseT - 0.1) / 0.7));
    cam = ck * ck * (3 - 2 * ck);
    const kissX = DOLL_X + 16;
    const kissY = ROOF_Y - 40;
    if (!kissed && phaseT >= 0.75) {
      kissed = true;
      host.audio.sfx('kiss');
      squash = 0.35;
      burst('heart', kissX, kissY, 14, 120, ['#ff4f8b', '#ff8fc0', '#ff2d6f'], 9, 1.3);
      host.banner('Mwah!');
    }
    if (crownT < 0 && phaseT >= 1.1) {
      crownT = 0;
      host.audio.sfx('star');
      burst('spark', fr.x, fr.y - FROG_H - 4, 12, 90, ['#ffe80f', '#fff'], 2.6, 0.7);
    }
    if (crownT >= 0) crownT += dt;
    heartClock -= dt;
    if (kissed && heartClock <= 0) {
      heartClock = 0.16;
      floatHeart(kissX + (Math.random() - 0.5) * 30, kissY, 6 + Math.random() * 5);
    }
    // count the bonus into the score, Donkey Kong style
    if (phaseT >= 1.5) {
      const k = Math.min(1, (phaseT - 1.5) / 0.8);
      const next = Math.round((finalBonus * k) / 100) * 100;
      if (next !== tallied) {
        tallied = next;
        host.audio.sfx('tick');
      }
    }
    if (!winSfx && phaseT >= 2.4) {
      winSfx = true;
      host.audio.sfx('win');
    }
    if (phaseT >= 3.5) {
      const secs = Math.round(playTime);
      const n = sim.jumpedCount;
      host.finish({
        outcome: 'win',
        score: totalScore(),
        summary: `Kissed by Barbie in ${secs}s! Jumped ${n} beach ball${n === 1 ? '' : 's'}, bonus ${finalBonus}.`,
      });
    }
  }

  function refreshHud(): void {
    const s = totalScore();
    if (s !== shownScore) {
      shownScore = s;
      host.hud.setScore(`★ ${s}`);
    }
  }

  // ---------------------------------------------------------------- drawing
  function bakeArt(): void {
    const bake = (path: string, maxW: number, maxH: number, stroke?: number) => {
      const img = host.image(path);
      return img ? makeSticker(img, maxW, maxH, stroke) : null;
    };
    art.frog = bake(IMG.frog, 34, FROG_H);
    art.frogJump = bake(IMG.frogJump, 42, 32);
    art.doll = bake(IMG.doll, 36, DOLL_H);
    art.ball = bake(IMG.ball, BALL.r * 2, BALL.r * 2, 1);
  }

  /** Surface y of the first ball girder under (x, y), or Infinity. */
  function girderBelow(x: number, y: number): number {
    let best = Infinity;
    for (let i = 0; i < BALL_FLOORS; i++) {
      const f = FLOORS[i];
      if (!onFloor(f, x)) continue;
      const gy = surfaceY(f, x);
      if (gy >= y - 0.5 && gy < best) best = gy;
    }
    return best;
  }

  function renderBall(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, sq = 0): void {
    const r = BALL.r;
    const st = art.ball;
    ctx.save();
    ctx.translate(x, y + r);
    if (sq) ctx.scale(1 + sq * 0.2, 1 - sq * 0.2);
    ctx.translate(0, -r);
    if (st) {
      ctx.rotate(rot);
      ctx.translate(0, st.h / 2);
      drawSticker(ctx, st);
    } else {
      drawBallFallback(ctx, r, rot);
    }
    ctx.restore();
  }

  function renderDoll(ctx: CanvasRenderingContext2D): void {
    // spare balls, minus the one she's holding
    const holding = sim.windupT > 0 && 1 - sim.windupT / THROW.windup > 0.4;
    for (let i = 0; i < PILE.length; i++) {
      if (holding && i === PILE.length - 1) continue;
      renderBall(ctx, PILE[i][0], PILE[i][1], i * 1.3);
    }
    let lean = dollLean + throwKick * 0.16;
    let held: [number, number] | null = null;
    if (sim.windupT > 0) {
      // bend to the pile, lift a ball over her head, lean back, toss
      const w = 1 - sim.windupT / THROW.windup;
      const top = PILE[PILE.length - 1];
      const overhead: [number, number] = [DOLL_X + 1, ROOF_Y - DOLL_H + 4];
      if (w < 0.4) lean -= 0.2 * (w / 0.4);
      else {
        const k = Math.min(1, (w - 0.4) / 0.4);
        const ease = k * k * (3 - 2 * k);
        lean -= 0.2 * (1 - ease) + (w > 0.8 ? 0.07 * ((w - 0.8) / 0.2) : 0);
        held = [top[0] + (overhead[0] - top[0]) * ease, top[1] + (overhead[1] - top[1]) * ease - Math.sin(k * Math.PI) * 8];
      }
    }
    const breathe = 1 + Math.sin(anim * 2.4) * 0.015;
    const st = art.doll;
    ctx.save();
    ctx.translate(DOLL_X, ROOF_Y);
    ctx.rotate(lean);
    ctx.scale(1, breathe);
    if (st) {
      drawSticker(ctx, st);
    } else {
      drawDollFallback(ctx, DOLL_H);
    }
    ctx.restore();
    if (held) renderBall(ctx, held[0], held[1], anim * 3);
  }

  function renderFrog(ctx: CanvasRenderingContext2D): void {
    const fr = sim.frog;
    let x = fr.x;
    let y = fr.y;
    let rot = 0;
    let flip = fr.face < 0;
    const jumping = fr.state === 'jump';
    if (fr.state === 'walk' && phase === 'play' && Math.abs(fr.vx) > 1) {
      y -= Math.abs(Math.sin((fr.walkDist / 22) * Math.PI)) * 3;
    }
    if (fr.state === 'climb') flip = Math.floor(fr.climbDist / 8) % 2 === 1;
    const knocked = phase === 'hurt' || phase === 'over';
    if (knocked) {
      const k = Math.min(1, phaseT / 0.55);
      rot = k * Math.PI * (fr.face > 0 ? -3 : 3);
      y -= Math.sin(Math.min(1, phaseT / 0.7) * Math.PI) * 18;
    }
    if (phase === 'win' && kissed) y -= Math.max(0, Math.sin(Math.min(1, (phaseT - 0.75) / 0.4) * Math.PI)) * 8;
    if (fr.safeT > 0 && phase === 'play' && Math.floor(fr.safeT * 12) % 2 === 1) ctx.globalAlpha = 0.35;
    const sy = 1 + squash;
    const sx = 1 - squash * 0.55;
    // soft shadow on the girder
    if (fr.state !== 'climb' && !knocked) {
      const gy = surfaceY(FLOORS[fr.floor], fr.x);
      const lift = Math.max(0, Math.min(1, (gy - y) / 40));
      ctx.fillStyle = `rgba(110,20,60,${0.22 * (1 - lift)})`;
      ctx.beginPath();
      ctx.ellipse(fr.x, gy + 1, 11 * (1 - lift * 0.5), 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const st = (jumping && art.frogJump) || art.frog;
    ctx.save();
    ctx.translate(x, y);
    if (rot) {
      ctx.translate(0, -FROG_H / 2);
      ctx.rotate(rot);
      ctx.translate(0, FROG_H / 2);
    }
    ctx.scale(flip ? -sx : sx, sy);
    if (st) {
      drawSticker(ctx, st);
    } else {
      drawFrogFallback(ctx, FROG_H, jumping ? 'jump' : 'sit');
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (crownT >= 0) {
      const pop = crownT < 0.25 ? 1 + Math.sin((crownT / 0.25) * Math.PI) * 0.6 : 1;
      ctx.save();
      ctx.translate(x + fr.face * 4, y - FROG_H * sy + 2);
      ctx.scale(pop, pop);
      ctx.rotate(-0.12 * fr.face);
      drawCrown(ctx, 0, 0, 12);
      ctx.restore();
    }
    if (phase === 'hurt' && phaseT < 1.2) {
      // dizzy stars
      for (let i = 0; i < 3; i++) {
        const a = anim * 6 + (i * Math.PI * 2) / 3;
        drawStar(ctx, x + Math.cos(a) * 12, y - 30 + Math.sin(a) * 4, 3.5, '#ffe80f', true);
      }
    }
  }

  function renderHints(ctx: CanvasRenderingContext2D): void {
    const fr = sim.frog;
    if (phase !== 'play' || fr.state !== 'walk') return;
    const bob = Math.sin(anim * 5) * 3;
    ctx.save();
    ctx.globalAlpha = 0.55 + Math.sin(anim * 5) * 0.2;
    if (fr.floor === ROOF) {
      drawHeart(ctx, DOLL_X + 4, ROOF_Y - DOLL_H - 8 + bob, 12, '#ff4f8b', true);
    } else {
      for (const l of LADDERS) {
        if (l.broken || l.lower !== fr.floor || Math.abs(l.x - fr.x) < 10) continue;
        const y = surfaceY(FLOORS[l.lower], l.x) - 30 + bob;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(l.x, y - 7);
        ctx.lineTo(l.x + 7, y + 1);
        ctx.lineTo(l.x + 3, y + 1);
        ctx.lineTo(l.x + 3, y + 7);
        ctx.lineTo(l.x - 3, y + 7);
        ctx.lineTo(l.x - 3, y + 1);
        ctx.lineTo(l.x - 7, y + 1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function renderParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of particles) {
      const k = p.t / p.life;
      ctx.globalAlpha = Math.max(0, 1 - k);
      if (p.kind === 'dust') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + k), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'heart') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        drawHeart(ctx, 0, 0, p.size * (k < 0.15 ? k / 0.15 : 1), p.color);
        ctx.restore();
      } else if (p.kind === 'star') {
        drawStar(ctx, p.x, p.y, p.size, p.color, true);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const p of popups) {
      const k = p.t / p.life;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.4 : 1;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = `${Math.round(p.size * pop)}px 'Leckerli One', 'Patrick Hand', sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = LINE;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  function renderBonus(ctx: CanvasRenderingContext2D): void {
    const value = phase === 'win' ? Math.max(0, finalBonus - tallied) : bonus();
    // drawn in CSS px like the DOM HUD chips it sits under, so it matches them on any screen
    const bw = 112;
    const bh = 34;
    const bx = -bw;
    const by = 0;
    ctx.save();
    ctx.scale(1 / host.stage.scale, 1 / host.stage.scale);
    ctx.translate(bonusBox.right, bonusBox.top);
    ctx.scale(bonusBox.k, bonusBox.k);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = '#ff6fa8';
    ctx.lineWidth = 3;
    roundRect(ctx, bx, by, bw, bh, 10);
    ctx.fill();
    ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c23a78';
    ctx.font = "15px 'Patrick Hand', sans-serif";
    ctx.fillText('BONUS', bx + 10, by + bh / 2 + 1);
    ctx.textAlign = 'right';
    ctx.fillStyle = value < 1000 && phase !== 'win' ? '#e11d48' : '#2b2b3a';
    ctx.font = "19px 'Permanent Marker', sans-serif";
    ctx.fillText(String(value), bx + bw - 10, by + bh / 2 + 1);
    ctx.restore();
  }

  // ---------------------------------------------------------------- game
  const game: MiniGame = {
    async init(h) {
      host = h;
      await h.load(Object.values(IMG));
      if (destroyed) return;
      sim = new Sim({ seed: (Math.random() * 1e9) | 0, speed: h.speed });
      bakeArt();
      layout();
      unsubResize = h.stage.onResize(layout);
      h.hud.setLives(lives, MAX_LIVES);
      refreshHud();
      measureHud();
      h.banner('Hop up to Barbie!');
    },

    update(dt) {
      const input = host.input;
      if (phase === 'play' && input.pressed('jump')) jumpBuf = 0.12;
      jumpBuf = Math.max(0, jumpBuf - dt);
      updateFx(dt);
      phaseT += dt;
      if (phase === 'play') {
        playTime += dt;
        const ax = input.axis();
        const events = sim.step(dt, { x: ax.x, y: ax.y, jump: jumpBuf > 0 });
        for (const e of events) onEvent(e);
        if (phase === 'play' && heartClock <= 0 && sim.windupT <= 0) {
          heartClock = 2.2 + Math.random() * 1.5;
          floatHeart(DOLL_X + 6, ROOF_Y - DOLL_H + 4, 5);
        }
        heartClock -= dt;
      } else if (phase === 'hurt') {
        if (phaseT >= 1.35) {
          if (lives > 0) respawn();
          else {
            // phaseT keeps running so the frog stays knocked out
            phase = 'over';
            host.audio.sfx('lose');
          }
        }
      } else if (phase === 'over') {
        if (phaseT >= 2.35) {
          host.finish({
            outcome: 'lose',
            score: totalScore(),
            summary: `The beach balls won this time. Jumped ${sim.jumpedCount}.`,
          });
        }
      } else if (phase === 'win') {
        updateWin(dt);
      }
      refreshHud();
    },

    render(ctx) {
      const { W, H } = host.stage;
      ctx.fillStyle = '#fbb6cf';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(shakeX, shakeY);
      if (cam > 0) {
        // keep the view inside the stage: the pair can move at most to (px*z, py*z)
        const z = 1 + 0.8 * cam;
        const px = world.ox + (DOLL_X + 14) * world.s;
        const py = world.oy + (ROOF_Y - 28) * world.s;
        const cx = Math.max(px, Math.min(px * 1.8, W / 2));
        const cy = Math.max(py, Math.min(py * 1.8, H * 0.45));
        ctx.translate(px + (cx - px) * cam, py + (cy - py) * cam);
        ctx.scale(z, z);
        ctx.translate(-px, -py);
      }
      if (staticLayer) ctx.drawImage(staticLayer, 0, 0, W, H);
      applyWorld(ctx, world);
      drawChest(ctx, chestLid);
      renderHints(ctx);
      renderDoll(ctx);
      for (const b of sim.balls) {
        // shadows: bouncing balls, and a landing marker under falling ones
        const bottom = b.y + BALL.r;
        const gy = b.mode === 'roll' ? bottom + b.h : girderBelow(b.x, bottom);
        const d = gy - bottom;
        if (d > 0.5 && d < 130) {
          const k = 1 - d / 130;
          ctx.globalAlpha = 0.3 * k;
          ctx.fillStyle = LINE;
          ctx.beginPath();
          ctx.ellipse(b.x, gy + 1, 4 + 5 * k, 1.2 + 1.2 * k, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        const wob = b.mode === 'ladder' ? Math.sin(anim * 18 + b.id) * 1.5 : 0;
        renderBall(ctx, b.x + wob, b.y, b.rot, b.squash);
      }
      renderFrog(ctx);
      renderParticles(ctx);
      ctx.restore();
      renderBonus(ctx);
      host.input.renderControls(ctx);
    },

    destroy() {
      destroyed = true;
      unsubResize?.();
      unsubResize = null;
      // shrink canvases so WebKit frees their memory right away
      for (const st of Object.values(art)) if (st) st.canvas.width = st.canvas.height = 0;
      if (staticLayer) staticLayer.width = staticLayer.height = 0;
      staticLayer = null;
      particles = [];
      popups = [];
    },

    debugApi() {
      const hitNow = () => {
        if (phase === 'play') hit();
      };
      return {
        state: () => ({
          phase,
          lives,
          score: totalScore(),
          bonus: phase === 'win' ? finalBonus : bonus(),
          playTime,
          jumped: sim.jumpedCount,
          frog: {
            x: sim.frog.x,
            y: sim.frog.y,
            floor: sim.frog.floor,
            state: sim.frog.state,
            face: sim.frog.face,
            safeT: sim.frog.safeT,
            ladder: sim.frog.ladder ? LADDERS.indexOf(sim.frog.ladder) : -1,
          },
          balls: sim.balls.map((b) => ({ id: b.id, x: b.x, y: b.y, mode: b.mode, floor: b.floor, dir: b.dir })),
        }),
        geometry: () => ({
          floors: FLOORS,
          ladders: LADDERS,
          doll: DOLL_X,
          chest: { x0: CHEST_X - CHEST_W / 2, x1: CHEST_X + CHEST_W / 2, y0: FLOORS[0].y0 - CHEST_H, y1: FLOORS[0].y0 },
          world,
          controls,
          W: host.stage.W,
          H: host.stage.H,
          scale: host.stage.scale,
        }),
        teleport: (x: number, y: number) => {
          if (phase === 'play') sim.teleport(x, y);
        },
        place: (floor: number, x: number) => {
          if (phase === 'play') sim.place(floor, x);
        },
        spawnBall: (floor: number, x: number) => sim.spawnRolling(floor, x).id,
        clearBalls: () => {
          sim.balls = [];
        },
        throwing: (on: boolean) => {
          sim.throwing = on;
        },
        godMode: (on = true) => {
          sim.god = on;
        },
        hit: hitNow,
        win: () => {
          if (phase === 'play') sim.place(ROOF, DOLL_X + 24);
        },
        lose: () => {
          if (phase !== 'play') return;
          lives = 1;
          hitNow();
        },
      };
    },
  };
  return game;
};

export default l1;
