import { describe, expect, it } from 'vitest';
import { KetchupPen, LATENCY, budgetFor } from '../src/games/l6-ketchup/pen';
import { HIGH, Ink, heartsFor, libbySays, rate } from '../src/games/l6-ketchup/score';
import { DRAWINGS, HALF, sampleStrokes, strokeLength, type Drawing, type Pt } from '../src/games/l6-ketchup/shapes';

const DT = 1 / 60;

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

interface TraceOpts {
  /** units per second along the path */
  speed?: number;
  /** amplitude of a smooth hand wobble, in napkin units */
  wobble?: number;
  /** fraction of each stroke left out at the end */
  skip?: number;
  /** overshoot past each stroke's end, units */
  overshoot?: number;
  seed?: number;
}

/** Drive the real pen along a drawing's strokes like a finger would. */
function trace(d: Drawing, o: TraceOpts = {}): { ink: Ink; pen: KetchupPen } {
  const { speed = 120, wobble = 0, skip = 0, overshoot = 0, seed = 1 } = o;
  const rnd = lcg(seed);
  const pen = new KetchupPen(budgetFor(strokeLength(d.strokes)), seed);
  const ink = new Ink();
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6];
  let s = 0;
  const noise = (): Pt => ({
    x: wobble * (0.65 * Math.sin(s / 31 + ph[0]) + 0.45 * Math.sin(s / 11 + ph[1])),
    y: wobble * (0.65 * Math.sin(s / 27 + ph[2]) + 0.45 * Math.sin(s / 13 + ph[3])),
  });
  const run = (secs: number, down: boolean, x: number, y: number) => {
    for (let t = 0; t < secs - 1e-9; t += DT) {
      pen.step(DT, down, x, y);
      for (const sp of pen.landed) ink.addSegment(sp.x0, sp.y0, sp.x1, sp.y1, sp.r);
    }
  };
  for (const stroke of d.strokes) {
    const pts = sampleStrokes([stroke], speed * DT);
    const keep = pts.slice(0, Math.max(1, Math.round(pts.length * (1 - skip))));
    if (overshoot && keep.length > 1) {
      const a = keep[keep.length - 2];
      const b = keep[keep.length - 1];
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      for (let u = speed * DT; u <= overshoot; u += speed * DT) keep.push({ x: b.x + ((b.x - a.x) / l) * u, y: b.y + ((b.y - a.y) / l) * u });
    }
    let n = noise();
    run(0.12, true, keep[0].x + n.x, keep[0].y + n.y);
    for (const p of keep) {
      s += speed * DT;
      n = noise();
      run(DT, true, p.x + n.x, p.y + n.y);
    }
    run(0.08, true, keep[keep.length - 1].x + n.x, keep[keep.length - 1].y + n.y);
    run(0.1, false, 0, 0);
  }
  run(0.5, false, 0, 0);
  return { ink, pen };
}

/** A frantic scribble all over the napkin until the bottle is empty. */
function scribble(d: Drawing, seed: number): Ink {
  const rnd = lcg(seed);
  const pen = new KetchupPen(budgetFor(strokeLength(d.strokes)), seed);
  const ink = new Ink();
  let x = (rnd() - 0.5) * 200;
  let y = (rnd() - 0.5) * 200;
  let a = rnd() * 6.28;
  for (let t = 0; t < 20; t += DT) {
    a += (rnd() - 0.5) * 1.2;
    x += Math.cos(a) * 260 * DT;
    y += Math.sin(a) * 260 * DT;
    if (Math.abs(x) > 135) a = Math.PI - a;
    if (Math.abs(y) > 135) a = -a;
    x = Math.max(-140, Math.min(140, x));
    y = Math.max(-140, Math.min(140, y));
    pen.step(DT, true, x, y);
    for (const sp of pen.landed) ink.addSegment(sp.x0, sp.y0, sp.x1, sp.y1, sp.r);
  }
  return ink;
}

const targets = DRAWINGS.map((d) => sampleStrokes(d.strokes, 3));

describe('L6 drawings', () => {
  it('has the five drawings from the deck, in order', () => {
    expect(DRAWINGS.map((d) => d.id)).toEqual(['heart', 'smiley', 'star', 'note', 'lw']);
    for (const d of DRAWINGS) {
      let m = 0;
      for (const s of d.strokes) for (const p of s) m = Math.max(m, Math.abs(p.x), Math.abs(p.y));
      expect(m).toBeLessThanOrEqual(HALF + 1e-6);
      expect(m).toBeGreaterThan(HALF * 0.95);
      expect(d.time).toBeGreaterThanOrEqual(18);
    }
    expect(DRAWINGS[4].strokes.length).toBe(5); // heart, L, + (two), W
  });

  it('samples strokes evenly', () => {
    const pts = sampleStrokes([[{ x: 0, y: 0 }, { x: 30, y: 0 }]], 3);
    expect(pts.length).toBe(11);
    expect(pts[10]).toEqual({ x: 30, y: 0 });
  });
});

describe('L6 ketchup pen', () => {
  it('lands ketchup after the latency, near where it was aimed', () => {
    const pen = new KetchupPen(1000, 3, 0, 0);
    let first = -1;
    let t = 0;
    for (let i = 0; i < 60; i++) {
      pen.step(DT, true, 10, 20);
      t += DT;
      if (pen.landed.length && first < 0) {
        first = t;
        const sp = pen.landed[0];
        expect(Math.hypot(sp.x1 - 10, sp.y1 - 20)).toBeLessThan(5);
      }
    }
    expect(first).toBeGreaterThanOrEqual(LATENCY);
    expect(first).toBeLessThan(LATENCY + 0.15);
  });

  it('keeps landing after the finger lifts, then stops', () => {
    const pen = new KetchupPen(1000, 3, 0, 0);
    for (let i = 0; i < 30; i++) pen.step(DT, true, i * 2, 0);
    let after = 0;
    for (let i = 0; i < 30; i++) {
      pen.step(DT, false, 0, 0);
      after += pen.landed.length;
    }
    expect(after).toBeGreaterThan(5);
    expect(pen.flying.length).toBe(0);
  });

  it('a slow, careful hand does not waste ketchup', () => {
    // 60 units per second along a 400-unit line: about 7 s of squeezing
    const pen = new KetchupPen(budgetFor(400), 3, 0, 0);
    for (let x = 0; x <= 400; x += 1) pen.step(DT, true, x, 0);
    expect(pen.fraction).toBeGreaterThan(0.5);
  });

  it('lifting starts a fresh squeeze instead of dragging a line', () => {
    const pen = new KetchupPen(1000, 3, 0, 0);
    for (let i = 0; i < 30; i++) pen.step(DT, true, -80, 0);
    pen.lift();
    const landed: number[] = [];
    for (let i = 0; i < 60; i++) {
      pen.step(DT, true, 80, 0);
      for (const sp of pen.landed) landed.push(Math.min(sp.x0, sp.x1));
    }
    // nothing lands in between the two spots
    expect(landed.filter((x) => x > -60 && x < 60).length).toBe(0);
  });

  it('cancelled ketchup never lands', () => {
    const pen = new KetchupPen(1000, 3, 0, 0);
    for (let i = 0; i < 8; i++) pen.step(DT, true, 50, 50);
    pen.cancelFlying();
    pen.lift();
    let n = 0;
    for (let i = 0; i < 30; i++) {
      pen.step(DT, false, 0, 0);
      n += pen.landed.length;
    }
    expect(n).toBe(0);
  });

  it('runs out of ketchup', () => {
    const pen = new KetchupPen(300, 3, 0, 0);
    for (let i = 0; i < 600; i++) pen.step(DT, true, Math.sin(i / 10) * 100, Math.cos(i / 7) * 100);
    expect(pen.empty).toBe(true);
    expect(pen.squeezing).toBe(false);
  });

  it('pools a fat blob when held still', () => {
    const pen = new KetchupPen(1000, 3, 0, 0);
    let r = 0;
    for (let i = 0; i < 80; i++) {
      pen.step(DT, true, 0, 0);
      for (const sp of pen.landed) r = Math.max(r, sp.r);
    }
    expect(r).toBeGreaterThan(6);
  });
});

describe('L6 scoring', () => {
  it('an empty napkin gets one heart', () => {
    for (const t of targets) expect(rate(t, new Ink()).hearts).toBe(1);
    expect(heartsFor(0)).toBe(1);
  });

  it('a perfect trace of each drawing gets a high rating', () => {
    DRAWINGS.forEach((d, i) => {
      const { ink } = trace(d);
      const r = rate(targets[i], ink);
      expect(r.hearts, `${d.id} f=${r.f.toFixed(2)}`).toBeGreaterThanOrEqual(HIGH);
      expect(r.hearts).toBe(5);
    });
  });

  it('a wobbly trace (about 3 mm off) reads as messy, not perfect', () => {
    const r = rate(targets[0], trace(DRAWINGS[0], { wobble: 18, seed: 2 }).ink);
    expect(r.hearts).toBeGreaterThanOrEqual(3);
    expect(r.hearts).toBeLessThanOrEqual(4);
  });

  it('the bottle holds enough ketchup for a careful trace', () => {
    DRAWINGS.forEach((d) => {
      const { pen } = trace(d, { wobble: 6 });
      expect(pen.fraction, d.id).toBeGreaterThan(0.2);
    });
  });

  it('a careful hand-drawn trace gets 4-5 hearts', () => {
    // wobbling up to ~2 mm on an iPhone (about 13 units)
    DRAWINGS.forEach((d, i) => {
      for (const wobble of [6, 9, 12]) {
        for (const seed of [1, 2, 3]) {
          const r = rate(targets[i], trace(d, { wobble, speed: 120, seed }).ink);
          expect(r.hearts, `${d.id} w${wobble} seed ${seed} f=${r.f.toFixed(2)}`).toBeGreaterThanOrEqual(4);
        }
      }
    });
  });

  it('a sloppy trace gets 2-3 hearts', () => {
    // rushed, wobbling up to ~5 mm, bits missing, overshooting the ends
    DRAWINGS.forEach((d, i) => {
      let sum = 0;
      for (const seed of [1, 2, 3, 4, 5]) {
        const r = rate(targets[i], trace(d, { wobble: 30, speed: 200, skip: 0.22, overshoot: 30, seed }).ink);
        expect(r.hearts, `${d.id} seed ${seed} f=${r.f.toFixed(2)}`).toBeGreaterThanOrEqual(2);
        expect(r.hearts, `${d.id} seed ${seed} f=${r.f.toFixed(2)}`).toBeLessThanOrEqual(3);
        sum += r.f;
      }
      const avg = heartsFor(sum / 5);
      expect(avg, `${d.id} mean f=${(sum / 5).toFixed(2)}`).toBeGreaterThanOrEqual(2);
      expect(avg, `${d.id} mean f=${(sum / 5).toFixed(2)}`).toBeLessThanOrEqual(3);
    });
  });

  it('a random scribble gets at most 2 hearts', () => {
    DRAWINGS.forEach((d, i) => {
      for (const seed of [11, 12, 13, 14, 15, 16]) {
        const r = rate(targets[i], scribble(d, seed));
        expect(r.hearts, `${d.id} seed ${seed} f=${r.f.toFixed(2)}`).toBeLessThanOrEqual(2);
      }
    });
  });

  it('the wrong drawing does not score high', () => {
    // a perfect heart on the star napkin
    const r = rate(targets[2], trace(DRAWINGS[0]).ink);
    expect(r.hearts).toBeLessThan(HIGH);
  });

  it('Libby always has something to say', () => {
    for (let h = 1; h <= 5; h++) for (let i = 0; i < 5; i++) expect(libbySays(h, i).length).toBeGreaterThan(3);
    expect(libbySays(5, 0)).toBe('Okay, Picasso!');
  });
});
