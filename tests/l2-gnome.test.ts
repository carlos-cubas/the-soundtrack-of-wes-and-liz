import { describe, expect, it } from 'vitest';
import { GOAL, GnomeField, HOLES, MAX_ESCAPES, RISE, SINK, doubleChance, maxActive, spawnGap, upTime } from '../src/games/l2-gnome/field';

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
