import { describe, expect, it } from 'vitest';
import { CONFESSION_RAP } from '../src/data/story';
import { BEAT, STEP, buildChart, chunkWords, splitWords, type Chart, type Tile } from '../src/games/boss-tiles/chart';

const chart = buildChart(CONFESSION_RAP);
const allWords = CONFESSION_RAP.flatMap(splitWords);

/** Tiles grouped by section. */
function bySection(c: Chart): Tile[][] {
  return c.sections.map((_, i) => c.tiles.filter((t) => t.section === i));
}

describe('boss chart: words', () => {
  it('carries every word of the confession rap exactly once, in order', () => {
    const fromTiles = chart.tiles.flatMap((t) => t.text.split(' '));
    expect(fromTiles).toEqual(allWords);
    expect(chart.words).toEqual(allWords);
    // word index ranges tile the whole rap with no gaps or overlaps
    let w = 0;
    for (const t of chart.tiles) {
      expect(t.w0).toBe(w);
      w = t.w1;
    }
    expect(w).toBe(allWords.length);
  });

  it('puts one or two words on each tile', () => {
    for (const t of chart.tiles) {
      const n = t.w1 - t.w0;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(2);
      expect(t.text.split(' ').length).toBe(n);
    }
  });

  it('keeps each line inside its own phrase, in reading order', () => {
    for (let i = 1; i < chart.tiles.length; i++) {
      expect(chart.tiles[i].line).toBeGreaterThanOrEqual(chart.tiles[i - 1].line);
    }
    for (let l = 0; l < chart.lines.length; l++) {
      const tiles = chart.tiles.filter((t) => t.line === l);
      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles.map((t) => t.text).join(' ')).toBe(chart.lines[l].join(' '));
    }
  });

  it('chunks words evenly', () => {
    expect(chunkWords(['a', 'b', 'c', 'd'], 2)).toEqual([['a', 'b'], ['c', 'd']]);
    expect(chunkWords(['Look,', 'if', 'you', 'had'], 3).length).toBe(3);
    expect(() => chunkWords(['a', 'b', 'c'], 1)).toThrow();
  });
});

describe('boss chart: song shape', () => {
  it('spreads the rap over a 90-110 s song on the 86 BPM grid', () => {
    expect(chart.duration).toBeGreaterThanOrEqual(90);
    expect(chart.duration).toBeLessThanOrEqual(110);
    for (const t of chart.tiles) {
      expect(Number.isInteger(t.step)).toBe(true);
      expect(t.t).toBeCloseTo(t.step * STEP, 9);
      expect(t.t + t.hold).toBeLessThanOrEqual(chart.duration);
    }
    // the first tile comes after the two-bar intro
    expect(chart.tiles[0].t).toBeCloseTo(8 * BEAT, 9);
  });

  it('ramps up: denser sections, doubles in the build, holds in the drop, runs at the end', () => {
    const secs = bySection(chart);
    const density = secs.map((tiles, i) => {
      const s = chart.sections[i];
      return tiles.length / ((s.bar1 - s.bar0) * 4 * BEAT);
    });
    for (let i = 1; i < density.length; i++) expect(density[i]).toBeGreaterThanOrEqual(density[i - 1] - 0.01);
    expect(density[density.length - 1]).toBeGreaterThan(density[0] * 2);

    const gaps = (tiles: Tile[]) => tiles.slice(1).map((t, i) => t.step - tiles[i].step).filter((g) => g > 0);
    // verse: quarter notes only, single lanes, no holds
    expect(Math.min(...gaps(secs[0]))).toBe(4);
    expect(secs[0].some((t) => t.hold)).toBe(false);
    // verse 2: eighths appear
    expect(Math.min(...gaps(secs[1]))).toBe(2);
    // build: doubles
    const doubles = (tiles: Tile[]) => tiles.filter((t, i) => i > 0 && tiles[i - 1].step === t.step).length;
    expect(doubles(secs[0])).toBe(0);
    expect(doubles(secs[1])).toBe(0);
    expect(doubles(secs[2])).toBeGreaterThanOrEqual(4);
    // drop: holds
    expect(secs[3].filter((t) => t.hold).length).toBeGreaterThanOrEqual(6);
    expect(secs.slice(0, 3).flat().some((t) => t.hold)).toBe(false);
    // final: sixteenth runs
    expect(Math.min(...gaps(secs[4]))).toBe(1);
    // the last word is held into the outro
    expect(chart.tiles[chart.tiles.length - 1].hold).toBeGreaterThan(0);
  });

  it('copes with any rap: one word, very long lines, few or many lines', () => {
    const raps = [
      ['Yo'],
      ['Hi', 'there you', 'a b c d e f g h i j k l m n o p q r s t'],
      Array.from({ length: 27 }, (_, i) => `line ${i} has a few more words in it`),
      [...CONFESSION_RAP, 'Just one more line to end it all'],
    ];
    for (const rap of raps) {
      for (const seed of [1, 18, 77]) {
        const c = buildChart(rap, seed);
        expect(c.tiles.flatMap((t) => t.text.split(' '))).toEqual(rap.flatMap(splitWords));
        expect(c.tiles[c.tiles.length - 1].t + c.tiles[c.tiles.length - 1].hold).toBeLessThanOrEqual(c.duration);
      }
    }
  });

  it('is deterministic for a seed and varies with the seed', () => {
    const again = buildChart(CONFESSION_RAP);
    expect(again.tiles).toEqual(chart.tiles);
    const other = buildChart(CONFESSION_RAP, 7);
    expect(other.tiles.map((t) => t.lane)).not.toEqual(chart.tiles.map((t) => t.lane));
    expect(other.tiles.flatMap((t) => t.text.split(' '))).toEqual(allWords);
  });
});

describe('boss chart: playable patterns', () => {
  const seeds = [18, 1, 2, 3, 7, 42, 99, 1234];

  for (const seed of seeds) {
    const c = seed === 18 ? chart : buildChart(CONFESSION_RAP, seed);

    it(`seed ${seed}: never needs more than two fingers`, () => {
      // at every tile start, count tiles starting then plus holds still held
      for (const t of c.tiles) {
        const busy = c.tiles.filter((o) => o.step === t.step || (o.holdSteps > 0 && o.step < t.step && t.step <= o.step + o.holdSteps));
        expect(busy.length, `step ${t.step}`).toBeLessThanOrEqual(2);
        expect(new Set(busy.map((o) => o.lane)).size).toBe(busy.length);
      }
    });

    it(`seed ${seed}: holds never overlap, and doubles split across both thumbs`, () => {
      const holds = c.tiles.filter((t) => t.holdSteps > 0);
      for (let i = 1; i < holds.length; i++) {
        expect(holds[i].step).toBeGreaterThan(holds[i - 1].step + holds[i - 1].holdSteps);
      }
      for (let i = 1; i < c.tiles.length; i++) {
        const a = c.tiles[i - 1];
        const b = c.tiles[i];
        if (a.step === b.step) {
          expect(a.lane < 2).toBe(true);
          expect(b.lane >= 2).toBe(true);
        }
      }
      // a tap during a hold goes to the other thumb's half
      for (const h of holds) {
        for (const t of c.tiles) {
          if (t !== h && t.step > h.step && t.step <= h.step + h.holdSteps) {
            expect(t.lane < 2).toBe(h.lane >= 2);
          }
        }
      }
    });

    it(`seed ${seed}: leaves at least an eighth between tiles in the same lane`, () => {
      const lastEnd = [-99, -99, -99, -99];
      for (const t of c.tiles) {
        expect(t.step - lastEnd[t.lane], `lane ${t.lane} step ${t.step}`).toBeGreaterThanOrEqual(2);
        lastEnd[t.lane] = t.step + t.holdSteps;
      }
    });
  }
});
