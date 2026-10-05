/**
 * Level 5 "Mrs. Potato Head": play as Liz and dodge basketballs in the gym
 * for ten rounds, each faster than the last. A hit ends the level with the
 * story's alternative outcome (Wes drives her to the hospital, outcome
 * 'alt'); ten clean rounds earn the baseball cap (flags.noHit).
 */
import type { GameHost, MiniGame, MiniGameFactory } from '../types';
import { LINE, MICHAEL, NOAH, WES, drawBallArt, drawBonk, drawCourt, drawCover, drawLiz, drawPerson, newHair, starPath, stepHair, type LizPose, type PersonLook } from './draw';
import { BALL_R, DodgeSim, ROUNDS, type Arena } from './sim';

const COURT = 'img/bg/l5-court.webp';
const BALL = 'img/sprites/basketball.png';
const TAU = Math.PI * 2;
/** Thumb travel for full speed, in CSS px. */
const STICK_PX = 44;

interface Pop {
  x: number;
  y: number;
  text: string;
  t: number;
  color: string;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: string;
  size: number;
  rot: number;
  star: boolean;
}

interface Bubble {
  who: PersonLook;
  text: string;
  t: number;
}

const CONFETTI = ['#f8de4f', '#2f5fd0', '#f7768e', '#9be3c9', '#ffffff', '#e8692f'];
const NEAR_WORDS = ['Close one!', 'Whoa!', 'Nice dodge!', 'Phew!', 'So close!'];
const CHEERS: Array<[PersonLook, string]> = [
  [WES, 'Go, Liz!'],
  [MICHAEL, 'Nice moves!'],
  [WES, 'Show-off!'],
  [NOAH, 'Heads up!'],
  [MICHAEL, 'Looking good!'],
  [WES, "That's my girl! ...I mean, nice."],
  [NOAH, 'How?!'],
  [MICHAEL, 'Impressive!'],
  [WES, 'Almost there!'],
];

/** Turn angle `a` toward `b` by at most `step`. */
function turn(a: number, b: number, step: number): number {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  if (Math.abs(d) <= step) return b;
  return a + Math.sign(d) * step;
}

const factory: MiniGameFactory = () => {
  let host: GameHost;
  let sim: DodgeSim;
  let pose: LizPose;
  let court: HTMLCanvasElement | null = null;
  let unsubResize = () => {};
  let realT = 0;
  let timeScale = 1;
  let hitAt = -1;
  let endAt = -1;
  let won = false;
  let shake = 0;
  let flash = 0;
  let fastK = 1;
  let hintAlpha = 1;
  let movedFor = 0;
  let cheer = 0;
  let worry = 0;
  let cheerIdx = 0;
  let bonkAt: { x: number; y: number } | null = null;
  const pops: Pop[] = [];
  const bits: Bit[] = [];
  const bubbles: Bubble[] = [];
  const lastSfx = new Map<string, number>();

  const sfx = (name: Parameters<GameHost['audio']['sfx']>[0], gap = 0) => {
    const t = lastSfx.get(name) ?? -1;
    if (gap && realT - t < gap) return;
    lastSfx.set(name, realT);
    host.audio.sfx(name);
  };

  function arena(): Arena {
    const { W, H, safe } = host.stage;
    return {
      W,
      H,
      liz: { x0: safe.left + 66, y0: 66, x1: W - safe.right - 66, y1: H - safe.bottom - 22 },
      frame: { x0: safe.left + 20, y0: 62, x1: W - safe.right - 20, y1: H - safe.bottom - 18 },
    };
  }

  function setupControls() {
    const { W, H } = host.stage;
    host.input.clearControls();
    // Full speed takes the same thumb travel on any screen (about 8 mm), so
    // the stick radius is set in CSS px: ~44 units on a phone, ~24 on an iPad.
    const r = Math.max(22, Math.min(46, STICK_PX / host.stage.scale));
    host.input.addStick({ id: 'move', zone: { x: 0, y: 0, w: W, h: H }, r });
  }

  function spectators(): Array<[PersonLook, number, number]> {
    const { W, H, safe } = host.stage;
    return [
      [MICHAEL, safe.left + 32, H / 2 - 84],
      [NOAH, safe.left + 32, H / 2 + 84],
      [WES, W - safe.right - 32, H / 2 + 76],
    ];
  }

  function courtLayer(): HTMLCanvasElement {
    if (court) return court;
    const { W, H } = host.stage;
    const k = Math.min(2.5, host.stage.scale * host.stage.dpr);
    const c = document.createElement('canvas');
    c.width = Math.ceil(W * k);
    c.height = Math.ceil(H * k);
    const cx = c.getContext('2d')!;
    cx.scale(k, k);
    const img = host.image(COURT);
    if (img) drawCover(cx, img, W, H);
    else drawCourt(cx, W, H);
    court = c;
    return c;
  }

  function pop(x: number, y: number, text: string, color = '#ffffff') {
    pops.push({ x, y, text, t: 0, color });
  }

  function burst(x: number, y: number, n: number, speed: number, stars = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = speed * (0.4 + Math.random() * 0.8);
      bits.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.3,
        t: 0,
        life: 0.7 + Math.random() * 0.7,
        color: stars ? '#ffe80f' : CONFETTI[i % CONFETTI.length],
        size: stars ? 4 + Math.random() * 3 : 3 + Math.random() * 3,
        rot: Math.random() * TAU,
        star: stars,
      });
    }
  }

  function say(who: PersonLook, text: string) {
    for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].who === who) bubbles.splice(i, 1);
    bubbles.push({ who, text, t: 0 });
  }

  function progress() {
    const r = sim.phase === 'done' ? ROUNDS : sim.round;
    host.hud.setProgress(sim.roundsCleared, ROUNDS, `Round ${r}/${ROUNDS}`);
  }

  function finish() {
    if (won) {
      host.finish({ outcome: 'win', score: ROUNDS, flags: { noHit: true }, summary: 'All ten rounds without a scratch!' });
    } else {
      host.finish({ outcome: 'alt', score: sim.round - 1, flags: { noHit: false }, summary: `Bonk! Round ${sim.round}.` });
    }
  }

  function onEvent(e: string) {
    const L = sim.liz;
    switch (e) {
      case 'breather':
        host.banner(sim.round === ROUNDS ? 'Final round!' : `Round ${sim.round}!`);
        progress();
        break;
      case 'throw':
        sfx('tick', 0.12);
        break;
      case 'launch':
        sfx('whoosh', 0.16);
        break;
      case 'near':
        if (realT - (lastSfx.get('swish') ?? -9) > 0.7) {
          pop(L.x, L.y - 34, NEAR_WORDS[Math.floor(Math.random() * NEAR_WORDS.length)], '#ffffff');
          sfx('swish');
          // the boys on the baseline can't believe it
          sfx('whoa', 4);
        }
        break;
      case 'roundClear': {
        sfx(sim.round >= 7 ? 'cheer' : 'collect');
        cheer = 1.4;
        burst(L.x, L.y, 16, 160);
        const [who, text] = CHEERS[cheerIdx++ % CHEERS.length];
        say(who, text);
        break;
      }
      case 'hit': {
        const b = sim.lastHit!;
        hitAt = realT;
        endAt = realT + 2.3;
        pose.hitT = 0;
        bonkAt = { x: (b.x + L.x) / 2, y: (b.y + L.y) / 2 };
        shake = 12;
        flash = 1;
        worry = 3;
        burst(bonkAt.x, bonkAt.y, 12, 220, true);
        sfx('bonk');
        sfx('hit');
        say(NOAH, 'OH NO. Liz!');
        progress();
        break;
      }
      case 'allClear':
        won = true;
        endAt = realT + 2.6;
        cheer = 3;
        sfx('win');
        sfx('cheer');
        host.banner('Not a scratch!');
        burst(L.x, L.y, 40, 260);
        say(WES, 'Ten for ten!');
        progress();
        break;
    }
  }

  function tick(dt: number) {
    realT += dt;
    if (hitAt >= 0) {
      const h = realT - hitAt;
      timeScale = h < 0.5 ? 0.07 : Math.min(0.5, 0.07 + (h - 0.5) * 0.6);
    }
    const a = host.input.axis();
    const sdt = dt * timeScale;
    sim.step(sdt, a.x, a.y, host.speed);
    for (const e of sim.events) onEvent(e);

    const L = sim.liz;
    const sp = Math.hypot(L.vx, L.vy);
    pose.x = L.x;
    pose.y = L.y;
    pose.moving += (Math.min(1, sp / 180) - pose.moving) * Math.min(1, dt * 10);
    if (hitAt >= 0) pose.face = turn(pose.face, Math.PI / 2, dt * 9);
    else if (sp > 15) pose.face = turn(pose.face, Math.atan2(L.vy, L.vx), dt * 14);
    pose.walk += sp * sdt * 0.085;
    pose.time += dt;
    if (pose.hitT >= 0) pose.hitT += dt;
    stepHair(pose, Math.max(sdt, dt * 0.25));

    if (sp > 30) movedFor += dt;
    if (movedFor > 0.6 || sim.round > 1) hintAlpha = Math.max(0, hintAlpha - dt * 2);

    for (let i = pops.length - 1; i >= 0; i--) if ((pops[i].t += dt) > 1) pops.splice(i, 1);
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.t += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += 260 * dt;
      b.vx *= 1 - dt * 1.5;
      b.rot += dt * 8;
      if (b.t > b.life) bits.splice(i, 1);
    }
    for (let i = bubbles.length - 1; i >= 0; i--) if ((bubbles[i].t += dt) > 1.6) bubbles.splice(i, 1);
    shake = Math.max(0, shake - dt * 30);
    flash = Math.max(0, flash - dt * 4);
    cheer = Math.max(0, cheer - dt);
    worry = Math.max(0, worry - dt);

    if (endAt >= 0 && realT >= endAt) {
      endAt = -1;
      finish();
    }
  }

  function drawWarnings(ctx: CanvasRenderingContext2D) {
    ctx.lineCap = 'butt';
    for (const b of sim.balls) {
      if (b.done) continue;
      let alpha: number;
      if (!b.flying) alpha = 1 - b.warn / b.warnTotal;
      else if (b.age < 0.25) alpha = 1 - b.age / 0.25;
      else continue;
      const p = b.flying ? 1 : alpha;
      const fade = b.flying ? alpha : 1;
      ctx.globalAlpha = (0.1 + 0.16 * p) * fade;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = BALL_R * 2;
      ctx.beginPath();
      ctx.moveTo(b.sx, b.sy);
      ctx.lineTo(b.ex, b.ey);
      ctx.stroke();
      ctx.globalAlpha = (0.3 + 0.5 * p) * fade;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 9]);
      ctx.lineDashOffset = -realT * 90;
      ctx.beginPath();
      ctx.moveTo(b.sx, b.sy);
      ctx.lineTo(b.ex, b.ey);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }

  function drawArrows(ctx: CanvasRenderingContext2D) {
    for (const b of sim.balls) {
      if (b.done || b.flying) continue;
      const p = 1 - b.warn / b.warnTotal;
      const pulse = 1 + Math.sin(realT * 22) * 0.08;
      const ang = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.ax, b.ay);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = 'rgba(58, 51, 64, 0.2)';
      ctx.beginPath();
      ctx.arc(1.5, 2.5, 15, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.7;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 11.5, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffe80f';
      ctx.beginPath();
      ctx.arc(0, 0, 18.5, -Math.PI / 2, -Math.PI / 2 + p * TAU);
      ctx.stroke();
      ctx.rotate(ang);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-4, -6);
      ctx.lineTo(-1.5, 0);
      ctx.lineTo(-4, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBalls(ctx: CanvasRenderingContext2D) {
    const img = host.image(BALL);
    for (const b of sim.balls) {
      if (b.done || !b.flying) continue;
      ctx.fillStyle = 'rgba(40, 20, 0, 0.22)';
      ctx.beginPath();
      ctx.ellipse(b.x + 6, b.y + 9, BALL_R, BALL_R * 0.8, 0, 0, TAU);
      ctx.fill();
    }
    for (const b of sim.balls) {
      if (b.done || !b.flying) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const dx = b.vx / sp;
      const dy = b.vy / sp;
      const len = Math.min(70, sp * 0.11) * Math.min(1, b.age / 0.1);
      // motion trail: a tapered streak and two speed lines
      ctx.fillStyle = 'rgba(255, 186, 110, 0.4)';
      ctx.beginPath();
      ctx.moveTo(b.x - dy * BALL_R, b.y + dx * BALL_R);
      ctx.lineTo(b.x - dx * (len + BALL_R), b.y - dy * (len + BALL_R));
      ctx.lineTo(b.x + dy * BALL_R, b.y - dx * BALL_R);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const s of [-0.55, 0.55]) {
        const ox = -dy * BALL_R * s;
        const oy = dx * BALL_R * s;
        ctx.moveTo(b.x + ox - dx * (BALL_R + 4), b.y + oy - dy * (BALL_R + 4));
        ctx.lineTo(b.x + ox - dx * (BALL_R + 4 + len * 0.8), b.y + oy - dy * (BALL_R + 4 + len * 0.8));
      }
      ctx.stroke();
      drawBallArt(ctx, b.x, b.y, BALL_R, b.spin, img);
    }
  }

  function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, t: number) {
    const a = Math.min(1, t / 0.15) * Math.min(1, (1.6 - t) / 0.25);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = "15px 'Patrick Hand', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 16;
    const { W, safe } = host.stage;
    const bx = Math.min(W - safe.right - w / 2 - 6, Math.max(safe.left + w / 2 + 6, x));
    const by = y - 38;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.7;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.roundRect(bx - w / 2, by - 12, w, 24, 10);
    ctx.moveTo(x - 5, by + 11);
    ctx.lineTo(x, by + 20);
    ctx.lineTo(x + 5, by + 11);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2b2b3a';
    ctx.fillText(text, bx, by + 1);
    ctx.restore();
  }

  const game: MiniGame = {
    async init(h) {
      host = h;
      await h.load([COURT, BALL]);
      sim = new DodgeSim(arena(), (Date.now() ^ (Math.random() * 1e9)) >>> 0);
      pose = { x: sim.liz.x, y: sim.liz.y, face: Math.PI / 2, walk: 0, moving: 0, hair: newHair(sim.liz.x, sim.liz.y), hitT: -1, time: 0 };
      setupControls();
      unsubResize = h.stage.onResize(() => {
        court = null;
        sim.setArena(arena());
        setupControls();
      });
      // the round-1 breather event was raised in the constructor
      host.banner('Round 1!');
      progress();
      sim.events.length = 0;
    },

    update(dt) {
      for (let i = 0; i < fastK; i++) tick(dt);
    },

    render(ctx) {
      const { W, H } = host.stage;
      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      ctx.drawImage(courtLayer(), 0, 0, W, H);

      const L = sim.liz;
      for (const [look, x, y] of spectators()) {
        const face = Math.atan2(L.y - y, L.x - x);
        const k = look === NOAH && worry > 0 ? 1 : cheer > 0 ? Math.min(1, cheer) : 0;
        drawPerson(ctx, x, y, face, look, k, realT);
      }

      drawWarnings(ctx);
      if (hitAt >= 0) {
        // slow-mo: the gym dims behind Liz, the ball and the burst
        const k = Math.min(1, (realT - hitAt) / 0.2);
        ctx.fillStyle = `rgba(58, 51, 64, ${0.28 * k})`;
        ctx.fillRect(-20, -20, W + 40, H + 40);
      }
      drawLiz(ctx, pose);
      drawBalls(ctx);
      drawArrows(ctx);

      if (bonkAt && hitAt >= 0) {
        // beside her, on whichever side has room, so the nose stays visible
        const right = L.x + 120 < W - host.stage.safe.right;
        const above = L.y - 110 > 50;
        const bx = L.x + (right ? 62 : -62);
        const by = L.y + (above ? -56 : 56);
        drawBonk(ctx, bx, by, realT - hitAt);
      }

      for (const b of bits) {
        ctx.globalAlpha = Math.max(0, 1 - b.t / b.life);
        ctx.fillStyle = b.color;
        if (b.star) {
          starPath(ctx, b.x, b.y, b.size, b.rot);
          ctx.fill();
        } else {
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(b.rot);
          ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;

      ctx.font = "24px 'Leckerli One', cursive";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const p of pops) {
        ctx.globalAlpha = Math.min(1, (1 - p.t) * 2.5);
        const y = p.y - 8 - p.t * 34;
        const s = 0.6 + Math.min(1, p.t / 0.12) * 0.4;
        ctx.save();
        ctx.translate(p.x, y);
        ctx.scale(s, s);
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#2f5fd0';
        ctx.strokeText(p.text, 0, 0);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      const spots = spectators();
      for (const b of bubbles) {
        const s = spots.find((p) => p[0] === b.who);
        if (s) drawBubble(ctx, s[1], s[2], b.text, b.t);
      }
      ctx.restore();

      if (flash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${flash * 0.55})`;
        ctx.fillRect(0, 0, W, H);
      }

      if (hintAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = hintAlpha;
        ctx.font = "19px 'Patrick Hand', sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const text = 'Drag anywhere to move Liz. Dodge every ball!';
        const w = ctx.measureText(text).width + 30;
        const y = H - host.stage.safe.bottom - 34;
        ctx.fillStyle = 'rgba(43, 43, 58, 0.78)';
        ctx.beginPath();
        ctx.roundRect(W / 2 - w / 2, y - 16, w, 32, 16);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, W / 2, y + 1);
        ctx.restore();
      }

      host.input.renderControls(ctx);
    },

    destroy() {
      unsubResize();
      court = null;
    },

    debugApi() {
      return {
        state: () => ({
          round: sim.round,
          phase: sim.phase,
          cleared: sim.roundsCleared,
          liz: { x: sim.liz.x, y: sim.liz.y },
          balls: sim.balls
            .filter((b) => !b.done)
            .map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, sx: b.sx, sy: b.sy, flying: b.flying, warn: b.warn, kind: b.kind, spent: b.spent })),
          god: sim.god,
          timeScale,
          W: host.stage.W,
          scale: host.stage.scale,
          stickR: Math.max(22, Math.min(46, STICK_PX / host.stage.scale)),
          /** game seconds (pauses and the 0.05 s dt clamp included) */
          t: realT,
        }),
        /** Balls pass through Liz. */
        god: (on = true) => {
          sim.god = on;
        },
        /** Run the simulation k times per frame. */
        fast: (k = 4) => {
          fastK = Math.max(1, Math.min(12, Math.round(k)));
        },
        skipTo: (r: number) => {
          sim.beginRound(r);
          for (const e of sim.events) onEvent(e);
          sim.events.length = 0;
        },
        win: () => {
          won = true;
          finish();
        },
      };
    },
  };
  return game;
};

export default factory;
