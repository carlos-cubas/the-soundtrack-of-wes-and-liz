/**
 * Boss level rules: judging taps against the chart, score, combo, the
 * nerves meter and hold tiles. Pure logic (no DOM, no audio) so tests can
 * drive it with simulated players.
 *
 * Times are song seconds on the audio clock.
 */
import type { Chart, Tile } from './chart';

/**
 * Hit windows (seconds either side of the tile's time), forgiving for
 * thumbs. GOOD stays under half the tightest same-lane gap (2 steps =
 * 0.349 s), so a tap can never be judged against the wrong tile.
 */
export const PERFECT = 0.08;
export const GOOD = 0.16;

export type Grade = 'perfect' | 'great';

export function judge(dt: number): Grade | null {
  const a = Math.abs(dt);
  if (a <= PERFECT) return 'perfect';
  if (a <= GOOD) return 'great';
  return null;
}

export const POINTS: Record<Grade, number> = { perfect: 100, great: 70 };
/** Extra points for holding a hold tile to its end. */
export const HOLD_BONUS = 50;

/** "Palms are sweaty": misses drain it, hits refill it; empty = choke. */
export const NERVES = {
  max: 100,
  miss: -7,
  /** Tapping a lane with no tile near. */
  empty: -2,
  /** Letting go of a hold tile early. */
  holdBreak: -3,
  perfect: 3,
  great: 2,
};

/**
 * Score needed to win, as a percent of the max: 70%, lowered 5 points per
 * completed side quest (Libby's trust), never below 55%.
 */
export function thresholdPct(sideQuestsDone: number): number {
  return Math.max(55, 70 - 5 * sideQuestsDone);
}

export function starsFor(pct: number): number {
  if (pct >= 95) return 5;
  if (pct >= 88) return 4;
  if (pct >= 80) return 3;
  if (pct >= 70) return 2;
  return 1;
}

export type TileResult = 'pending' | 'holding' | Grade | 'miss';

export type RunEvent =
  | { kind: 'hit'; tile: Tile; grade: Grade; dt: number }
  | { kind: 'miss'; tile: Tile }
  | { kind: 'empty'; lane: number }
  | { kind: 'holdEnd'; tile: Tile; full: boolean }
  | { kind: 'choke' };

/** Per-word state for the karaoke panel (values of `BossRun.words`). */
export const WordState = { Pending: 0, Hit: 1, Missed: 2 } as const;
export type WordState = (typeof WordState)[keyof typeof WordState];

export class BossRun {
  readonly result: TileResult[];
  readonly words: Uint8Array;
  readonly maxScore: number;
  readonly thresholdScore: number;
  readonly thresholdPct: number;
  score = 0;
  nerves = NERVES.max;
  combo = 0;
  maxCombo = 0;
  perfects = 0;
  greats = 0;
  misses = 0;
  empties = 0;
  holdsDone = 0;
  choked = false;
  /** Per lane: tile indices in time order, and a pointer to the first unjudged one. */
  private queues: number[][] = [[], [], [], []];
  private heads = [0, 0, 0, 0];
  /** Hold tile being held in each lane (tile index), or -1. */
  readonly holding = [-1, -1, -1, -1];
  /** Fraction of each hold tile held when it ended. */
  readonly holdFrac: number[];
  private holdGrade: Record<number, Grade> = {};

  constructor(readonly chart: Chart, sideQuestsDone = 0) {
    const n = chart.tiles.length;
    this.result = new Array(n).fill('pending');
    this.holdFrac = new Array(n).fill(0);
    this.words = new Uint8Array(chart.words.length);
    for (const t of chart.tiles) this.queues[t.lane].push(t.i);
    this.maxScore = chart.tiles.reduce((s, t) => s + POINTS.perfect + (t.hold ? HOLD_BONUS : 0), 0);
    this.thresholdPct = thresholdPct(sideQuestsDone);
    this.thresholdScore = Math.ceil((this.maxScore * this.thresholdPct) / 100);
  }

  get pct(): number {
    return (100 * this.score) / this.maxScore;
  }

  /** Tiles judged so far (hit or missed). */
  get judged(): number {
    return this.perfects + this.greats + this.misses;
  }

  get passed(): boolean {
    return this.score >= this.thresholdScore;
  }

  /** The next unjudged tile in a lane, or null. */
  head(lane: number): Tile | null {
    const q = this.queues[lane];
    const h = this.heads[lane];
    return h < q.length ? this.chart.tiles[q[h]] : null;
  }

  private nerve(d: number): RunEvent | null {
    if (this.choked) return null;
    this.nerves = Math.max(0, Math.min(NERVES.max, this.nerves + d));
    if (this.nerves <= 0) {
      this.choked = true;
      return { kind: 'choke' };
    }
    return null;
  }

  private markWords(tile: Tile, s: WordState): void {
    for (let w = tile.w0; w < tile.w1; w++) this.words[w] = s;
  }

  /** A finger landed in `lane` at song time `t`. */
  tap(lane: number, t: number, out: RunEvent[] = []): RunEvent[] {
    if (this.choked) return out;
    if (this.holding[lane] >= 0) return out; // a second finger on a held lane: ignore
    const tile = this.head(lane);
    const grade = tile ? judge(t - tile.t) : null;
    if (!tile || !grade) {
      this.empties++;
      out.push({ kind: 'empty', lane });
      const c = this.nerve(NERVES.empty);
      if (c) out.push(c);
      return out;
    }
    this.heads[lane]++;
    this.score += POINTS[grade];
    if (grade === 'perfect') this.perfects++;
    else this.greats++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.markWords(tile, WordState.Hit);
    if (tile.hold) {
      this.result[tile.i] = 'holding';
      this.holding[lane] = tile.i;
      this.holdGrade[tile.i] = grade;
    } else {
      this.result[tile.i] = grade;
    }
    out.push({ kind: 'hit', tile, grade, dt: t - tile.t });
    this.nerve(NERVES[grade]);
    return out;
  }

  private endHold(lane: number, t: number, out: RunEvent[], interrupted = false): void {
    const i = this.holding[lane];
    if (i < 0) return;
    const tile = this.chart.tiles[i];
    this.holding[lane] = -1;
    const end = tile.t + tile.hold;
    const full = t >= end - GOOD;
    const frac = full ? 1 : Math.max(0, Math.min(1, (t - tile.t) / tile.hold));
    this.holdFrac[i] = frac;
    this.result[i] = this.holdGrade[i] ?? 'great';
    this.score += Math.round(HOLD_BONUS * frac);
    if (full) this.holdsDone++;
    out.push({ kind: 'holdEnd', tile, full });
    if (!full && !interrupted) {
      const c = this.nerve(NERVES.holdBreak);
      if (c) out.push(c);
    }
  }

  /** The finger holding `lane` lifted at song time `t`. */
  release(lane: number, t: number, out: RunEvent[] = []): RunEvent[] {
    this.endHold(lane, t, out);
    return out;
  }

  /**
   * The game stopped under the player (pause, app switch, audio
   * interruption): holds in progress end where they are, paid for the part
   * held, with no nerve penalty.
   */
  interrupt(t: number, out: RunEvent[] = []): RunEvent[] {
    for (let lane = 0; lane < 4; lane++) this.endHold(lane, t, out, true);
    return out;
  }

  /** Advance to song time `t`: completes holds, misses tiles that went past. */
  advance(t: number, out: RunEvent[] = []): RunEvent[] {
    for (let lane = 0; lane < 4; lane++) {
      const hi = this.holding[lane];
      if (hi >= 0) {
        const tile = this.chart.tiles[hi];
        if (t >= tile.t + tile.hold) this.endHold(lane, t, out);
      }
      if (this.choked) continue;
      for (let tile = this.head(lane); tile && t - tile.t > GOOD; tile = this.head(lane)) {
        this.heads[lane]++;
        this.result[tile.i] = 'miss';
        this.misses++;
        this.combo = 0;
        this.markWords(tile, WordState.Missed);
        out.push({ kind: 'miss', tile });
        const c = this.nerve(NERVES.miss);
        if (c) {
          out.push(c);
          break;
        }
      }
    }
    return out;
  }

  /** Debug: count every tile before song time `t` as a perfect hit. */
  skipTo(t: number): void {
    for (let lane = 0; lane < 4; lane++) {
      for (let tile = this.head(lane); tile && tile.t + tile.hold < t - GOOD; tile = this.head(lane)) {
        this.heads[lane]++;
        this.result[tile.i] = 'perfect';
        this.holdFrac[tile.i] = 1;
        this.perfects++;
        this.combo++;
        this.score += POINTS.perfect + (tile.hold ? HOLD_BONUS : 0);
        this.markWords(tile, WordState.Hit);
      }
    }
    this.maxCombo = Math.max(this.maxCombo, this.combo);
  }

  /** All tiles judged and no hold in progress. */
  get finished(): boolean {
    return this.heads.every((h, l) => h >= this.queues[l].length) && this.holding.every((h) => h < 0);
  }
}
