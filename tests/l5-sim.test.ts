import { describe, expect, it } from 'vitest';
import {
  BALLS_PER,
  BALL_R,
  CONTACT,
  THROW_KINDS,
  DodgeSim,
  ROUNDS,
  SPAWN_WINDOW,
  ballCount,
  ballsIn,
  planRound,
  rng,
  roundMix,
  roundSpeed,
  spawnThrow,
  warnTime,
  type Arena,
  type Ball,
} from '../src/games/l5-dodge/sim';

// An iPhone 12-ish stage: 866 x 400 virtual units.
const W = 866;
const H = 400;
const ARENA: Arena = {
  W,
  H,
  liz: { x0: 70, y0: 62, x1: W - 70, y1: H - 22 },
  frame: { x0: 18, y0: 56, x1: W - 18, y1: H - 16 },
};
const DT = 1 / 60;

describe('L5 round math', () => {
  it('has ten rounds that get busier and faster', () => {
    expect(ROUNDS).toBe(10);
    for (let r = 1; r <= ROUNDS; r++) {
      const mix = roundMix(r);
      expect(ballsIn(mix)).toBe(ballCount(r));
      expect(ballCount(r)).toBe(3 + r);
      expect(roundSpeed(r)).toBe(160 + 32 * r);
      expect(mix.lane).toBeGreaterThanOrEqual(1);
      const w = warnTime(r);
      expect(w).toBeGreaterThanOrEqual(0.6 - 1e-9);
      expect(w).toBeLessThanOrEqual(0.8 + 1e-9);
      if (r > 1) {
        expect(roundSpeed(r)).toBeGreaterThan(roundSpeed(r - 1));
        expect(warnTime(r)).toBeLessThan(warnTime(r - 1));
        const prev = roundMix(r - 1);
        const tricky = (m: typeof mix) => m.aimed + 2 * m.cross + 2 * m.pair + 3 * m.wall;
        expect(tricky(mix)).toBeGreaterThanOrEqual(tricky(prev));
      }
    }
    expect(roundMix(1)).toEqual({ lane: 4, aimed: 0, cross: 0, pair: 0, wall: 0 });
    expect(roundMix(4).cross).toBe(0);
    expect(roundMix(5).cross).toBe(1);
    expect(roundMix(10).cross + roundMix(10).pair + roundMix(10).wall).toBeGreaterThanOrEqual(4);
  });

  it('spreads each round plan over the spawn window, opening with a lane throw', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rand = rng(seed);
      for (let r = 1; r <= ROUNDS; r++) {
        const plan = planRound(r, rand);
        const mix = roundMix(r);
        expect(plan.length).toBe(THROW_KINDS.reduce((n, k) => n + mix[k], 0));
        expect(plan[0].kind).toBe('lane');
        for (let i = 0; i < plan.length; i++) {
          expect(plan[i].t).toBeGreaterThan(0);
          expect(plan[i].t).toBeLessThanOrEqual(SPAWN_WINDOW);
          if (i) expect(plan[i].t).toBeGreaterThan(plan[i - 1].t);
        }
      }
    }
  });

  it('leads a running Liz in later rounds', () => {
    const rand = rng(9);
    const early = spawnThrow(ARENA, 'aimed', 3, 400, 220, rand, 200, 0)[0];
    expect(distToPath(early, 400, 220)).toBeLessThan(10);
    let ahead = 0;
    for (let i = 0; i < 50; i++) {
      const late = spawnThrow(ARENA, 'aimed', 9, 400, 220, rand, 200, 0)[0];
      if (distToPath(late, 400, 220) > CONTACT) ahead++;
    }
    expect(ahead).toBeGreaterThan(25);
  });

  it('launches balls from outside the stage on paths that cross the court', () => {
    const rand = rng(7);
    const lx = 300;
    const ly = 220;
    for (let i = 0; i < 400; i++) {
      for (const kind of THROW_KINDS) {
        const balls = spawnThrow(ARENA, kind, 1 + (i % ROUNDS), lx, ly, rand);
        expect(balls.length).toBe(BALLS_PER[kind]);
        for (const b of balls) {
          const outside = b.sx < 0 || b.sx > W || b.sy < 0 || b.sy > H;
          expect(outside).toBe(true);
          expect(b.warnTotal).toBe(warnTime(1 + (i % ROUNDS)));
          // the warning arrow sits on the visible frame
          expect(b.ax).toBeGreaterThanOrEqual(ARENA.frame.x0 - 0.01);
          expect(b.ax).toBeLessThanOrEqual(ARENA.frame.x1 + 0.01);
          expect(b.ay).toBeGreaterThanOrEqual(ARENA.frame.y0 - 0.01);
          expect(b.ay).toBeLessThanOrEqual(ARENA.frame.y1 + 0.01);
        }
        if (kind === 'aimed' || kind === 'cross') {
          for (const b of balls) expect(distToPath(b, lx, ly)).toBeLessThan(10);
        }
        if (kind === 'wall') {
          // one of the three is on her, and there's no gap to slip through
          expect(Math.min(...balls.map((b) => distToPath(b, lx, ly)))).toBeLessThan(CONTACT);
          const d = distToPath(balls[0], balls[1].sx, balls[1].sy);
          expect(d).toBeLessThan(2 * CONTACT);
        }
      }
    }
  });

  it('a hit ends the round with a bounce; god mode lets balls pass', () => {
    const sim = new DodgeSim(ARENA, 3);
    sim.step(2, 0, 0);
    expect(sim.phase).toBe('play');
    const b = spawnThrow(ARENA, 'aimed', 1, sim.liz.x, sim.liz.y, rng(1))[0];
    sim.balls.push(b);
    let hit = false;
    for (let i = 0; i < 400 && !hit; i++) {
      sim.step(DT, 0, 0);
      hit = sim.events.includes('hit');
    }
    expect(hit).toBe(true);
    expect(sim.phase).toBe('hit');
    expect(sim.lastHit?.bounced).toBe(true);

    const god = new DodgeSim(ARENA, 3);
    god.god = true;
    let cleared = false;
    for (let i = 0; i < 60 * 100 && !cleared; i++) {
      god.step(DT, 0, 0);
      cleared = god.events.includes('allClear');
    }
    expect(cleared).toBe(true);
    expect(god.roundsCleared).toBe(ROUNDS);
  });

  it('rounds last about six seconds', () => {
    const sim = new DodgeSim(ARENA, 11);
    sim.god = true;
    const starts: number[] = [];
    let t = 0;
    for (let i = 0; i < 60 * 100 && sim.phase !== 'done'; i++) {
      sim.step(DT, 0, 0);
      t += DT;
      if (sim.events.includes('play')) starts.push(t);
    }
    expect(starts.length).toBe(ROUNDS);
    for (let i = 1; i < starts.length; i++) {
      const len = starts[i] - starts[i - 1];
      expect(len).toBeGreaterThan(6.9); // at least 6 s of play + 1 s breather
      expect(len).toBeLessThan(9.5);
    }
  });
});

/** Perpendicular distance from (x, y) to a ball's straight path. */
function distToPath(b: Ball, x: number, y: number) {
  const s = Math.hypot(b.vx, b.vy);
  const dx = b.vx / s;
  const dy = b.vy / s;
  return Math.abs((x - b.sx) * dy - (y - b.sy) * dx);
}

/**
 * A human-ish dodger: notices a warning only after `react` seconds, rethinks
 * every 0.12 s, misjudges each ball's angle a little, steers imprecisely and
 * moves at most at `speedFrac` of top speed.
 */
function playBot(seed: number, react = 0.3, speedFrac = 0.75, aimErr = 0.05, steerErr = 0.25, attention = 3): number {
  const sim = new DodgeSim(ARENA, seed);
  const noise = rng(seed * 7 + 1);
  const gauss = () => (noise() + noise() + noise() - 1.5) * 1.15;
  const dirs: Array<[number, number]> = [[0, 0]];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    dirs.push([Math.cos(a), Math.sin(a)], [Math.cos(a) * 0.5, Math.sin(a) * 0.5]);
  }
  const misjudge = new Map<Ball, number>();
  let move: [number, number] = [0, 0];
  let think = 0;
  const cx = (ARENA.liz.x0 + ARENA.liz.x1) / 2;
  const cy = (ARENA.liz.y0 + ARENA.liz.y1) / 2;
  const sp = 250 * speedFrac;
  for (let i = 0; i < 60 * 150; i++) {
    think -= DT;
    if (think <= 0) {
      think = 0.12;
      // people track only the few most urgent balls
      const urgency = (b: Ball) => Math.hypot(b.x - sim.liz.x, b.y - sim.liz.y) / Math.hypot(b.vx, b.vy) + b.warn;
      const seen = sim.balls
        .filter((b) => !b.done && !b.spent && (b.flying || b.warnTotal - b.warn >= react))
        .sort((p, q) => urgency(p) - urgency(q))
        .slice(0, attention);
      let best = -Infinity;
      let pick: [number, number] = [0, 0];
      for (const [mx, my] of dirs) {
        let danger = 80;
        for (let tau = 0.05; tau <= 0.8; tau += 0.05) {
          const px = Math.min(ARENA.liz.x1, Math.max(ARENA.liz.x0, sim.liz.x + mx * sp * tau));
          const py = Math.min(ARENA.liz.y1, Math.max(ARENA.liz.y0, sim.liz.y + my * sp * tau));
          for (const b of seen) {
            if (!misjudge.has(b)) misjudge.set(b, gauss() * aimErr);
            const e = misjudge.get(b)!;
            const c = Math.cos(e);
            const s = Math.sin(e);
            const vx = b.vx * c - b.vy * s;
            const vy = b.vx * s + b.vy * c;
            const fl = Math.max(0, tau - b.warn);
            const bx = b.flying ? b.x + vx * tau : b.sx + vx * fl;
            const by = b.flying ? b.y + vy * tau : b.sy + vy * fl;
            danger = Math.min(danger, Math.hypot(px - bx, py - by) - CONTACT - (0.8 - tau) * 4);
          }
        }
        const fx = sim.liz.x + mx * sp * 0.3 - cx;
        const fy = sim.liz.y + my * sp * 0.3 - cy;
        const score = Math.min(danger, 40) - 0.03 * Math.hypot(fx, fy) - (mx || my ? 0.5 : 0);
        if (score > best) {
          best = score;
          pick = [mx, my];
        }
      }
      // fat thumbs: the stick never points quite where you meant
      const e = gauss() * steerErr;
      const k = speedFrac * (0.85 + noise() * 0.15);
      move = [(pick[0] * Math.cos(e) - pick[1] * Math.sin(e)) * k, (pick[0] * Math.sin(e) + pick[1] * Math.cos(e)) * k];
    }
    sim.step(DT, move[0], move[1]);
    if (sim.phase === 'hit') return sim.round;
    if (sim.phase === 'done') return ROUNDS + 1;
  }
  return -1;
}

describe('L5 difficulty (bot playtest)', () => {
  const N = 120;
  const reached: number[] = [];
  for (let s = 1; s <= N; s++) reached.push(playBot(1000 + s));
  const hitIn = (r: number) => reached.filter((x) => x === r).length;
  const survive = (r: number) => {
    const entered = reached.filter((x) => x >= r).length;
    return entered ? 1 - hitIn(r) / entered : 1;
  };

  it('prints the curve', () => {
    const rows = Array.from({ length: ROUNDS }, (_, i) => `r${i + 1}: ${(survive(i + 1) * 100).toFixed(0)}%`);
    console.log(`bot survival per round: ${rows.join('  ')}  all ten: ${hitIn(ROUNDS + 1)}/${N}`);
    expect(reached.every((x) => x > 0)).toBe(true);
  });

  it('rounds 1-6 are comfortable', () => {
    for (let r = 1; r <= 6; r++) expect(survive(r)).toBeGreaterThanOrEqual(0.97);
  });

  it('rounds 7-10 are hard but possible', () => {
    let late = 1;
    for (let r = 7; r <= 10; r++) late *= survive(r);
    expect(late).toBeLessThan(0.97);
    expect(hitIn(ROUNDS + 1)).toBeGreaterThan(N * 0.35);
  });

  it('standing still does not win', () => {
    let wins = 0;
    for (let s = 1; s <= 40; s++) {
      const sim = new DodgeSim(ARENA, 500 + s);
      for (let i = 0; i < 60 * 120 && sim.phase !== 'hit' && sim.phase !== 'done'; i++) sim.step(DT, 0, 0);
      if (sim.phase === 'done') wins++;
    }
    expect(wins).toBe(0);
  });
});

it('ball radius matches the art scale', () => {
  expect(BALL_R).toBeGreaterThan(CONTACT / 2);
});
