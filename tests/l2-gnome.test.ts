import { describe, expect, it } from 'vitest';
import {
  GOAL,
  GnomeField,
  HOLES,
  MAX_ESCAPES,
  MOUSE_PACE,
  RISE,
  SINK,
  TOUCH_PACE,
  doubleChance,
  maxActive,
  spawnGap,
  upTime,
  type Pace,
} from '../src/games/l2-gnome/field';
import { hitHalfWidth, holeLayout } from '../src/games/l2-gnome/layout';

/** Deterministic PRNG so the simulations are repeatable. */
function rng(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Simulate a player who taps a gnome `react` seconds after it becomes
 * grabbable and needs `travel` seconds between taps.
 */
function play(react: number, travel: number, seed = 7) {
  const f = new GnomeField(rng(seed));
  const seen = new Map<number, number>();
  let busyUntil = 0;
  let t = 0;
  const dt = 1 / 60;
  while (!f.over && t < 120) {
    f.update(dt);
    t += dt;
    for (let i = 0; i < HOLES; i++) {
      if (!f.grabbable(i)) {
        seen.delete(i);
        continue;
      }
      if (!seen.has(i)) seen.set(i, t);
      if (t - seen.get(i)! >= react && t >= busyUntil) {
        f.grab(i);
        seen.delete(i);
        busyUntil = t + travel;
      }
    }
    f.drain();
  }
  return { f, t };
}

describe('L2 gnome difficulty curve', () => {
  it('starts at ~1.6 s up-time and shrinks ~8% per grab down to a 0.55 s floor', () => {
    expect(upTime(0)).toBeCloseTo(1.6, 5);
    expect(upTime(1) / upTime(0)).toBeCloseTo(0.92, 5);
    for (let g = 1; g < 30; g++) expect(upTime(g)).toBeLessThanOrEqual(upTime(g - 1));
    expect(upTime(50)).toBe(0.55);
    for (let g = 1; g < 15; g++) expect(spawnGap(g)).toBeLessThanOrEqual(spawnGap(g - 1));
  });

  it('only sends two at once from the fourth grab on', () => {
    for (let g = 0; g < 4; g++) {
      expect(maxActive(g)).toBe(1);
      expect(doubleChance(g)).toBe(0);
    }
    expect(maxActive(4)).toBe(2);
    expect(doubleChance(4)).toBeGreaterThan(0);
  });

  it('counts an un-grabbed gnome as an escape and loses after five', () => {
    const f = new GnomeField(rng());
    let t = 0;
    let escapes = 0;
    let lost = false;
    while (!f.over && t < 60) {
      f.update(1 / 60);
      t += 1 / 60;
      for (const e of f.drain()) {
        if (e.type === 'escape') escapes++;
        if (e.type === 'lose') lost = true;
      }
    }
    expect(f.over).toBe('lose');
    expect(lost).toBe(true);
    expect(escapes).toBe(MAX_ESCAPES);
    expect(f.grabbed).toBe(0);
  });

  it('rejects grabs on empty or barely-visible holes', () => {
    const f = new GnomeField(rng());
    for (let i = 0; i < HOLES; i++) expect(f.grab(i)).toBe(false);
    // let one gnome start rising: not grabbable until a quarter shows
    while (f.active === 0) f.update(1 / 60);
    const i = f.holes.findIndex((h) => h.state !== 'empty');
    f.holes[i].t = RISE * 0.1;
    expect(f.grabbable(i)).toBe(false);
    f.holes[i].t = RISE * 0.5;
    expect(f.grabbable(i)).toBe(true);
    expect(f.grab(i)).toBe(true);
    expect(f.grabbed).toBe(1);
    expect(f.grab(i)).toBe(false);
  });

  it('wins at ten grabs', () => {
    const { f } = play(0.1, 0);
    expect(f.over).toBe('win');
    expect(f.grabbed).toBe(GOAL);
  });

  it('sends leftover gnomes home after the win without counting escapes', () => {
    const f = new GnomeField(rng());
    f.grabbed = GOAL - 1;
    for (const i of [2, 6]) {
      f.holes[i].state = 'up';
      f.holes[i].t = 0;
      f.holes[i].hold = 5;
    }
    expect(f.grab(2)).toBe(true);
    expect(f.over).toBe('win');
    expect(f.holes[6].state).toBe('sinking');
    expect(f.rise(6)).toBeCloseTo(1, 5); // sinks from where it was, no snap
    f.drain();
    for (let k = 0; k < 60; k++) f.update(1 / 60);
    expect(f.active).toBe(0);
    expect(f.escapes).toBe(0);
    expect(f.drain().some((e) => e.type === 'escape')).toBe(false);
  });

  it('lets gnomes sink smoothly after a loss too', () => {
    const f = new GnomeField(rng());
    f.escapes = MAX_ESCAPES - 1;
    f.holes[0].state = 'sinking';
    f.holes[0].t = SINK - 0.001;
    f.holes[3].state = 'up';
    f.holes[3].t = 0.5;
    f.holes[3].hold = 5;
    f.update(1 / 60);
    expect(f.over).toBe('lose');
    f.update(1 / 60);
    expect(f.holes[3].state).toBe('sinking');
    expect(f.rise(3)).toBeGreaterThan(0.8);
    for (let k = 0; k < 60; k++) f.update(1 / 60);
    expect(f.active).toBe(0);
    expect(f.escapes).toBe(MAX_ESCAPES);
  });

  it('is fair: an average thumb (0.55 s reaction, 0.3 s between taps) wins', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { f } = play(0.55, 0.3, seed);
      expect(f.over).toBe('win');
      expect(f.escapes).toBeLessThan(MAX_ESCAPES);
    }
  });

  it('is not a walkover: a very slow player (1.0 s reaction) loses', () => {
    const { f } = play(1.0, 0.4);
    expect(f.over).toBe('lose');
  });
});

/**
 * A mouse/trackpad player: notices a gnome `react` s after it can be
 * clicked, then moves the cursor there in Fitts's-law time
 * a + b·log2(1 + D/W) (D = cursor distance, W = hitbox width, same units),
 * clicks, and moves on to the next gnome it has noticed.
 */
function playCursor(p: { react: number; a: number; b: number }, pace: Pace, W: number, seed: number) {
  const f = new GnomeField(rng(seed));
  f.pace = pace;
  const holes = holeLayout(0, W, 222);
  let cur = { x: W / 2, y: 300 };
  const noticed = new Map<number, number>();
  let busy: { i: number; at: number; x: number; y: number } | null = null;
  let free = 0;
  let t = 0;
  const dt = 1 / 120;
  while (!f.over && t < 120) {
    f.update(dt);
    t += dt;
    f.drain();
    for (let i = 0; i < HOLES; i++) {
      if (f.grabbable(i) && !noticed.has(i)) noticed.set(i, t);
      if (f.holes[i].state === 'empty') noticed.delete(i);
    }
    if (!busy && t >= free) {
      let best = -1;
      for (const [i, at] of noticed) if (t - at >= p.react && (best < 0 || at < noticed.get(best)!)) best = i;
      if (best >= 0) {
        const h = holes[best];
        const x = h.x;
        const y = h.y - 40 * h.s;
        const D = Math.hypot(x - cur.x, y - cur.y);
        busy = { i: best, at: t + p.a + p.b * Math.log2(1 + D / (2 * hitHalfWidth(h.s, 'mouse'))), x, y };
      }
    }
    if (busy && t >= busy.at) {
      cur = { x: busy.x, y: busy.y };
      if (f.grabbable(busy.i)) f.grab(busy.i);
      noticed.delete(busy.i);
      busy = null;
      free = t + 0.08; // re-target
    }
  }
  return f;
}

const winRate = (p: { react: number; a: number; b: number }, pace: Pace, W: number, n = 40) => {
  let wins = 0;
  for (let seed = 1; seed <= n; seed++) if (playCursor(p, pace, W, seed).over === 'win') wins++;
  return wins / n;
};

const CASUAL_TRACKPAD = { react: 0.45, a: 0.25, b: 0.15 };
const SLOW_TRACKPAD = { react: 0.55, a: 0.3, b: 0.2 };
const VERY_SLOW = { react: 0.8, a: 0.35, b: 0.25 };

describe('L2 timing for mouse and trackpad players', () => {
  it('leaves touch timing exactly as it was', () => {
    expect(TOUCH_PACE).toEqual({ up: 1, gap: 1, floor: 0.25 });
    for (let g = 0; g < 12; g++) {
      expect(upTime(g, TOUCH_PACE)).toBe(upTime(g));
      expect(spawnGap(g, TOUCH_PACE)).toBe(spawnGap(g));
    }
  });

  it('scales up-time and spawn gaps for a cursor and still speeds up every grab', () => {
    for (let g = 0; g < 12; g++) {
      expect(upTime(g, MOUSE_PACE)).toBeCloseTo(upTime(g) * MOUSE_PACE.up, 10);
      expect(spawnGap(g, MOUSE_PACE)).toBeCloseTo(spawnGap(g) * MOUSE_PACE.gap, 10);
      if (g > 0) expect(upTime(g, MOUSE_PACE)).toBeLessThan(upTime(g - 1, MOUSE_PACE));
    }
    expect(MOUSE_PACE.up).toBeGreaterThan(1);
    expect(MOUSE_PACE.gap).toBeGreaterThan(1);
  });

  it('lets a click land earlier as a gnome rises and later as it ducks', () => {
    const f = new GnomeField(rng());
    f.pace = MOUSE_PACE;
    while (f.active === 0) f.update(1 / 60);
    const i = f.holes.findIndex((h) => h.state !== 'empty');
    f.holes[i].t = RISE * 0.18;
    expect(f.grabbable(i)).toBe(true); // a touch player would have to wait
    f.pace = TOUCH_PACE;
    expect(f.grabbable(i)).toBe(false);
  });

  it('keeps the deck rules for cursor players: 10 grabs win, 5 escapes lose', () => {
    const idle = new GnomeField(rng());
    idle.pace = MOUSE_PACE;
    let escapes = 0;
    for (let t = 0; t < 120 && !idle.over; t += 1 / 60) {
      idle.update(1 / 60);
      escapes += idle.drain().filter((e) => e.type === 'escape').length;
    }
    expect(idle.over).toBe('lose');
    expect(escapes).toBe(MAX_ESCAPES);
    const pro = playCursor({ react: 0.2, a: 0.1, b: 0.05 }, MOUSE_PACE, 711, 3);
    expect(pro.over).toBe('win');
    expect(pro.grabbed).toBe(GOAL);
  });

  it('gives cursors wider hitboxes that never overlap the next hole', () => {
    for (const W of [711, 780, 866]) {
      const holes = holeLayout(0, W, 222);
      for (let row = 0; row < 3; row++) {
        const a = holes[row * 3];
        const b = holes[row * 3 + 1];
        expect(hitHalfWidth(a.s, 'mouse')).toBeGreaterThan(hitHalfWidth(a.s, 'touch'));
        expect(hitHalfWidth(a.s, 'mouse') + hitHalfWidth(b.s, 'mouse')).toBeLessThan(b.x - a.x);
      }
    }
  });

  it('was too hard on a trackpad with touch timing (the reported bug)', () => {
    for (const W of [711, 866]) expect(winRate(SLOW_TRACKPAD, TOUCH_PACE, W)).toBeLessThan(0.2);
  });

  it('lets casual and slower trackpad players win, usually first try', () => {
    for (const W of [711, 866]) {
      expect(winRate(CASUAL_TRACKPAD, MOUSE_PACE, W)).toBeGreaterThanOrEqual(0.9);
      expect(winRate(SLOW_TRACKPAD, MOUSE_PACE, W)).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('is still a game: a very slow cursor player wins at most half the time', () => {
    for (const W of [711, 866]) expect(winRate(VERY_SLOW, MOUSE_PACE, W)).toBeLessThanOrEqual(0.5);
  });
});
