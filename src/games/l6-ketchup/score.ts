/**
 * Libby's judging for Level 6 (pure, unit-tested).
 *
 * coverage  = share of the original's points with ketchup within COVER_R
 * precision = share of the ketchup within PREC_R of the original's lines
 * The F-score of the two maps to 1-5 hearts. Distances are measured from
 * the middle of a ketchup line; a pooled blob gets credit for how much
 * fatter than a line it is.
 */
import { LINE_R } from './pen';
import type { Pt } from './shapes';

export const COVER_R = 9;
export const PREC_R = 12;
/** F-score needed for 2, 3, 4 and 5 hearts. */
export const HEART_AT = [0.3, 0.52, 0.72, 0.88];
/** Four hearts or more is a "high rating" (the jersey needs five of them). */
export const HIGH = 4;

/** Ketchup as samples along its lines, each with its blob radius. */
export class Ink {
  xs: number[] = [];
  ys: number[] = [];
  rs: number[] = [];
  private lx = NaN;
  private ly = NaN;

  get count(): number {
    return this.xs.length;
  }

  clear(): void {
    this.xs.length = 0;
    this.ys.length = 0;
    this.rs.length = 0;
    this.lx = NaN;
  }

  private add(x: number, y: number, r: number): void {
    // a held blob lands many drops on one spot: count it once
    if (Math.abs(x - this.lx) < 1.5 && Math.abs(y - this.ly) < 1.5) {
      const i = this.xs.length - 1;
      this.rs[i] = Math.max(this.rs[i], r);
      return;
    }
    this.xs.push(x);
    this.ys.push(y);
    this.rs.push(r);
    this.lx = x;
    this.ly = y;
  }

  /** Add a landed piece of line, sampled every 2.5 units. */
  addSegment(x0: number, y0: number, x1: number, y1: number, r: number): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len / 2.5));
    for (let i = len < 0.01 ? n : 1; i <= n; i++) this.add(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, r);
  }
}

/** Uniform grid over points for neighbour queries. */
class Grid {
  private cells = new Map<number, number[]>();
  constructor(private size: number, xs: ArrayLike<number>, ys: ArrayLike<number>) {
    for (let i = 0; i < xs.length; i++) {
      const k = this.key(Math.floor(xs[i] / size), Math.floor(ys[i] / size));
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, (c = []));
      c.push(i);
    }
  }
  private key(cx: number, cy: number) {
    return (cx + 1000) * 4096 + (cy + 1000);
  }
  /** Calls fn for each point index near (x, y); stops when fn returns true. */
  near(x: number, y: number, fn: (i: number) => boolean): boolean {
    const cx = Math.floor(x / this.size);
    const cy = Math.floor(y / this.size);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const c = this.cells.get(this.key(cx + dx, cy + dy));
        if (c) for (const i of c) if (fn(i)) return true;
      }
    return false;
  }
}

export interface Rating {
  coverage: number;
  precision: number;
  f: number;
  hearts: number;
}

export function heartsFor(f: number): number {
  let h = 1;
  for (const t of HEART_AT) if (f >= t) h++;
  return h;
}

/** Score ketchup against the original's sample points. */
export function rate(target: Pt[], ink: Ink): Rating {
  if (!target.length || !ink.count) return { coverage: 0, precision: 0, f: 0, hearts: 1 };
  let maxR = 0;
  for (const r of ink.rs) maxR = Math.max(maxR, r);
  const extra = (i: number) => Math.max(0, ink.rs[i] - LINE_R);
  const more = Math.max(0, maxR - LINE_R);
  const inkGrid = new Grid(COVER_R + more + 0.5, ink.xs, ink.ys);
  let covered = 0;
  for (const p of target) {
    const hit = inkGrid.near(p.x, p.y, (i) => Math.hypot(ink.xs[i] - p.x, ink.ys[i] - p.y) - extra(i) <= COVER_R);
    if (hit) covered++;
  }
  const tx = target.map((p) => p.x);
  const ty = target.map((p) => p.y);
  const tGrid = new Grid(PREC_R + more + 0.5, tx, ty);
  let precise = 0;
  for (let i = 0; i < ink.count; i++) {
    const x = ink.xs[i];
    const y = ink.ys[i];
    const e = extra(i);
    if (tGrid.near(x, y, (j) => Math.hypot(tx[j] - x, ty[j] - y) - e <= PREC_R)) precise++;
  }
  const coverage = covered / target.length;
  const precision = precise / ink.count;
  const f = coverage + precision > 0 ? (2 * coverage * precision) / (coverage + precision) : 0;
  return { coverage, precision, f, hearts: heartsFor(f) };
}

const SAYS: Record<number, string[]> = {
  5: ['Okay, Picasso!', 'Frame it. Seriously.', 'A Wes Bennett original!', 'Stella should hang that up.', 'Perfection. I hate it.'],
  4: ['Ooh, not bad, Bennett!', "Cute! I'd put it on my fridge.", 'Okay, I see you.', 'Pretty good, for a menace.'],
  3: ['I see what you were going for.', "It's giving... abstract.", 'Hmm. Points for effort.'],
  2: ['Is that... a potato?', 'Did the bottle sneeze?', 'My nose looks better than that.'],
  1: ['Wes. What is this?', 'That is a crime scene.', 'Was that on purpose?!'],
};

/** Libby's comment for a rating (varies by drawing so it doesn't repeat). */
export function libbySays(hearts: number, index: number, empty = false): string {
  if (empty) return "Um... you didn't draw anything.";
  const list = SAYS[Math.max(1, Math.min(5, hearts))];
  return list[index % list.length];
}
