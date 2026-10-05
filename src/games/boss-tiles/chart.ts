/**
 * Boss level chart: the tiles of "Parking Ever After", generated from the
 * beat grid and the confession rap. Deterministic for a given seed.
 *
 * Every tile carries the next one or two words of the rap, so hitting all
 * the tiles "constructs" the whole confession. Each rap line gets one
 * phrase of music; the phrases get denser section by section:
 *
 *   bars  0-1   intro, no tiles (count-in)
 *   verse       quarter notes, one lane at a time
 *   verse 2     eighths
 *   build       eighths + doubles (two lanes at once), 1.5 bars per line
 *   drop        hold tiles + doubles, 1.5 bars per line
 *   final       sixteenth runs, one bar per line; the last word is held
 *   outro       one bar to ring out
 *
 * Time is measured in 16th-note steps from the start of the song.
 */

export const BPM = 86;
/** Seconds per beat. */
export const BEAT = 60 / BPM;
/** Seconds per 16th-note step. */
export const STEP = BEAT / 4;
export const STEPS_PER_BAR = 16;
export const INTRO_BARS = 2;
export const OUTRO_BARS = 1;

export type Style = 'quarters' | 'eighths' | 'doubles' | 'holds' | 'runs';

export interface SectionDef {
  name: 'verse' | 'verse2' | 'build' | 'drop' | 'final';
  style: Style;
  /** Bars of music per rap line. */
  barsPerLine: number;
  /** Share of the rap's lines this section carries. */
  share: number;
}

export const SECTIONS: SectionDef[] = [
  { name: 'verse', style: 'quarters', barsPerLine: 2, share: 0.2 },
  { name: 'verse2', style: 'eighths', barsPerLine: 2, share: 0.2 },
  { name: 'build', style: 'doubles', barsPerLine: 1.5, share: 0.2 },
  { name: 'drop', style: 'holds', barsPerLine: 1.5, share: 0.2 },
  { name: 'final', style: 'runs', barsPerLine: 1, share: 0.2 },
];

export interface Tile {
  /** Index in chart order (time, then lane). */
  i: number;
  /** Start in 16th steps from the song start. */
  step: number;
  /** Start in seconds from the song start. */
  t: number;
  lane: number;
  /** Hold length in seconds (0 = plain tap). */
  hold: number;
  holdSteps: number;
  /** The word(s) this tile adds to the confession. */
  text: string;
  line: number;
  /** Global word indices [w0, w1). */
  w0: number;
  w1: number;
  section: number;
}

export interface SectionSpan {
  name: SectionDef['name'];
  style: Style;
  /** First bar and bar after the last. */
  bar0: number;
  bar1: number;
  lines: [number, number];
}

export interface Chart {
  tiles: Tile[];
  /** Words of each rap line. */
  lines: string[][];
  /** Global index of each line's first word. */
  lineWord0: number[];
  /** First step of each line's phrase. */
  lineStep: number[];
  words: string[];
  sections: SectionSpan[];
  /** Bar where the outro starts, and the bar the song ends. */
  outroBar: number;
  endBar: number;
  /** Song length in seconds. */
  duration: number;
}

/** mulberry32: small, fast, deterministic PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function splitWords(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

/**
 * Group `words` into exactly `n` chunks of one or two adjacent words,
 * keeping chunks as even in length as possible (minimises the sum of
 * squared chunk lengths), so short words pair up ("if you", "one shot").
 */
export function chunkWords(words: string[], n: number): string[][] {
  const w = words.length;
  const merges = w - n;
  if (merges < 0 || merges > Math.floor(w / 2)) throw new Error(`cannot split ${w} words into ${n} chunks`);
  const len = words.map((x) => x.length);
  // best[i][j]: min cost covering words[0..i) with j merges
  const INF = Number.POSITIVE_INFINITY;
  const best: number[][] = Array.from({ length: w + 1 }, () => new Array(merges + 1).fill(INF));
  const pick: number[][] = Array.from({ length: w + 1 }, () => new Array(merges + 1).fill(0));
  best[0][0] = 0;
  for (let i = 1; i <= w; i++) {
    for (let j = 0; j <= merges; j++) {
      const one = best[i - 1][j] + len[i - 1] ** 2;
      if (one < best[i][j]) {
        best[i][j] = one;
        pick[i][j] = 1;
      }
      if (i >= 2 && j >= 1) {
        const two = best[i - 2][j - 1] + (len[i - 2] + len[i - 1] + 1) ** 2;
        if (two < best[i][j]) {
          best[i][j] = two;
          pick[i][j] = 2;
        }
      }
    }
  }
  const out: string[][] = [];
  let i = w;
  let j = merges;
  while (i > 0) {
    const k = pick[i][j];
    out.unshift(words.slice(i - k, i));
    i -= k;
    if (k === 2) j--;
  }
  return out;
}

/** One rhythmic event inside a phrase: a tap, a double, or a hold. */
interface Moment {
  /** Step relative to the phrase start. */
  step: number;
  /** Tiles at this moment (2 = double). */
  n: 1 | 2;
  /** Hold length in steps (0 = tap). */
  hold: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function shuffled<T>(arr: T[], r: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Number of tiles for a line of `w` words, given a section's comfortable range. */
function tileCount(w: number, want: number): number {
  return clamp(want, Math.ceil(w / 2), w);
}

/**
 * Rhythm for one phrase. Returns moments whose tile counts sum to exactly
 * `tiles`. `steps` is the phrase length (32 = two bars, 16 = one bar).
 */
function phrase(style: Style, tiles: number, steps: number, r: () => number): Moment[] {
  const m = styled(style, tiles, steps, r);
  if (m.reduce((n, x) => n + x.n, 0) === tiles) return m;
  // a line the style can't carry (very short or very long): eighths, then sixteenths
  if (tiles > steps) throw new Error(`a line of ${tiles} tiles does not fit ${steps} steps`);
  const grid: number[] = [];
  for (let s = 0; s < steps; s += 2) grid.push(s);
  for (let s = 1; s < steps; s += 2) grid.push(s);
  return grid
    .slice(0, tiles)
    .sort((a, b) => a - b)
    .map((step) => ({ step, n: 1, hold: 0 }));
}

function styled(style: Style, tiles: number, steps: number, r: () => number): Moment[] {
  const quarters: number[] = [];
  for (let s = 0; s < steps; s += 4) quarters.push(s);
  const offbeats = quarters.map((q) => q + 2);
  const taps = (list: number[]): Moment[] => list.map((step) => ({ step, n: 1, hold: 0 }));
  const sortM = (m: Moment[]) => m.sort((a, b) => a.step - b.step);

  /** `count` single steps: quarters first (dropping from the end), then off-beats. */
  const fill = (count: number, taken: Set<number>, extra: number[] = offbeats): number[] => {
    const q = quarters.filter((s) => !taken.has(s));
    if (count <= q.length) return q.slice(0, count);
    const off = shuffled(extra.filter((s) => !taken.has(s) && s < steps - 2), r);
    return [...q, ...off.slice(0, count - q.length)];
  };

  switch (style) {
    case 'quarters':
      return taps(quarters.slice(0, Math.min(tiles, quarters.length)));

    case 'eighths':
      return sortM(taps(fill(tiles, new Set())));

    case 'doubles': {
      const doubles = Math.min(clamp(tiles - 7, 1, 3), Math.floor(tiles / 2));
      const strong = shuffled([0, steps / 2, 4, steps / 2 + 4], r).slice(0, doubles);
      const taken = new Set(strong);
      const singles = fill(tiles - 2 * doubles, taken);
      return sortM([...strong.map((step): Moment => ({ step, n: 2, hold: 0 })), ...taps(singles)]);
    }

    case 'holds': {
      // two holds of 1-1.5 beats, one per half phrase, plus one double between them
      const holds: Moment[] = [0, steps / 2].slice(0, tiles).map((h) => ({ step: h, n: 1, hold: r() < 0.5 ? 4 : 6 }));
      const inHold = (s: number) => holds.some((h) => s >= h.step && s <= h.step + h.hold);
      const dblAt = [steps / 2 - 4, steps - 4].filter((s) => !inHold(s));
      const dbl = shuffled(dblAt, r).slice(0, tiles >= holds.length + 4 ? 1 : 0);
      const taken = new Set([...holds.map((h) => h.step), ...dbl]);
      const rest = tiles - holds.length - 2 * dbl.length;
      const grid = [...quarters, ...offbeats];
      const singles = shuffled(grid.filter((s) => !taken.has(s) && s < steps - 2), r)
        .sort((a, b) => (a % 4) - (b % 4)) // quarters before off-beats
        .slice(0, rest);
      return sortM([...holds, ...dbl.map((step): Moment => ({ step, n: 2, hold: 0 })), ...taps(singles)]);
    }

    case 'runs': {
      const eighths: number[] = [];
      for (let s = 0; s < steps; s += 2) eighths.push(s);
      let set: number[];
      if (tiles <= eighths.length) {
        // drop off-beats from the end
        set = eighths.slice();
        for (let s = steps - 2; set.length > tiles && s > 0; s -= 4) set = set.filter((x) => x !== s);
        set = set.slice(0, tiles);
      } else {
        // sixteenth runs inside beats 2 and 3 ("da-da-da-da")
        const sixteenths = shuffled([5, 7, 9, 11, 3, 13].filter((s) => s < steps - 2), r);
        set = [...eighths, ...sixteenths.slice(0, tiles - eighths.length)];
      }
      return sortM(taps(set));
    }
  }
}

const HALF = [
  [0, 1],
  [2, 3],
];

/**
 * Build the chart. `seed` changes lanes and rhythm details, never the
 * structure or the words.
 */
export function buildChart(rap: string[], seed = 18): Chart {
  const r = rng(seed);
  const lines = rap.map(splitWords);
  const words = lines.flat();
  const lineWord0: number[] = [];
  let acc = 0;
  for (const l of lines) {
    lineWord0.push(acc);
    acc += l.length;
  }

  // split lines across sections by share
  const sections: SectionSpan[] = [];
  let line = 0;
  let bar = INTRO_BARS;
  SECTIONS.forEach((s, k) => {
    const isLast = k === SECTIONS.length - 1;
    const count = isLast ? lines.length - line : Math.round(lines.length * s.share);
    const from = line;
    line = Math.min(lines.length, line + count);
    const bars = Math.ceil((line - from) * s.barsPerLine);
    sections.push({ name: s.name, style: s.style, bar0: bar, bar1: bar + bars, lines: [from, line] });
    bar += bars;
  });
  const outroBar = bar;
  const endBar = outroBar + OUTRO_BARS;

  const want: Record<Style, number> = { quarters: 7, eighths: 10, doubles: 11, holds: 10, runs: 9 };
  const tiles: Tile[] = [];
  const lineStep: number[] = [];

  // lane state
  const laneFree = [-99, -99, -99, -99]; // first step a lane may be used again
  let prevLane = -1;
  let prevStep = -99;
  let dir = 1;
  let hold: { lane: number; end: number } | null = null;

  const freeAt = (l: number, step: number) => laneFree[l] <= step;
  const pickSingle = (step: number): number => {
    if (hold && step > hold.end) hold = null;
    let cands = [0, 1, 2, 3].filter((l) => freeAt(l, step));
    if (hold) {
      const h = hold;
      const other = HALF[h.lane < 2 ? 1 : 0];
      cands = cands.filter((l) => other.includes(l));
    }
    const noJack = cands.filter((l) => l !== prevLane);
    if (noJack.length) cands = noJack;
    if (!cands.length) throw new Error(`no free lane at step ${step}`);
    if (step - prevStep === 1 && prevLane >= 0) {
      // a sixteenth run walks across the lanes
      let next = prevLane + dir;
      if (next < 0 || next > 3) {
        dir = -dir;
        next = prevLane + dir;
      }
      if (cands.includes(next)) return next;
    }
    return cands[Math.floor(r() * cands.length)];
  };

  sections.forEach((sec, si) => {
    const def = SECTIONS[si];
    const steps = def.barsPerLine * STEPS_PER_BAR;
    for (let li = sec.lines[0]; li < sec.lines[1]; li++) {
      const base = (sec.bar0 + (li - sec.lines[0]) * def.barsPerLine) * STEPS_PER_BAR;
      lineStep.push(base);
      const lw = lines[li];
      const n = tileCount(lw.length, want[def.style]);
      const moments = phrase(def.style, n, steps, r);
      if (li === lines.length - 1) {
        // the final word rings out into the outro
        const end = moments[moments.length - 1];
        if (end.n === 1) end.hold = steps - end.step + 4;
      }
      const chunks = chunkWords(lw, n);
      let c = 0;
      let w = lineWord0[li];
      const emit = (step: number, lane: number, holdSteps: number) => {
        const chunk = chunks[c++];
        tiles.push({
          i: 0,
          step,
          t: step * STEP,
          lane,
          hold: holdSteps * STEP,
          holdSteps,
          text: chunk.join(' '),
          line: li,
          w0: w,
          w1: w + chunk.length,
          section: si,
        });
        w += chunk.length;
        laneFree[lane] = step + holdSteps + 2;
      };
      for (const m of moments) {
        const step = base + m.step;
        if (m.n === 2) {
          if (hold && step <= hold.end) throw new Error('double during a hold');
          hold = null;
          const pairs: Array<[number, number]> = [];
          for (const a of HALF[0]) for (const b of HALF[1]) if (freeAt(a, step) && freeAt(b, step)) pairs.push([a, b]);
          if (!pairs.length) throw new Error(`no free double at step ${step}`);
          const [a, b] = pairs[Math.floor(r() * pairs.length)];
          emit(step, a, 0);
          emit(step, b, 0);
          prevLane = r() < 0.5 ? a : b;
        } else {
          const lane = pickSingle(step);
          emit(step, lane, m.hold);
          if (m.hold) hold = { lane, end: step + m.hold };
          prevLane = lane;
        }
        prevStep = step;
      }
      if (c !== chunks.length) throw new Error(`line ${li}: ${chunks.length} chunks, ${c} tiles`);
    }
  });

  tiles.sort((a, b) => a.step - b.step || a.lane - b.lane);
  tiles.forEach((t, i) => (t.i = i));
  return {
    tiles,
    lines,
    lineWord0,
    lineStep,
    words,
    sections,
    outroBar,
    endBar,
    duration: endBar * STEPS_PER_BAR * STEP,
  };
}
