import { describe, expect, it } from 'vitest';
import { CONFESSION_RAP } from '../src/data/story';
import { STEP, buildChart } from '../src/games/boss-tiles/chart';
import { BossRun, GOOD, HOLD_BONUS, NERVES, PERFECT, POINTS, WordState, judge, starsFor, thresholdPct, type RunEvent } from '../src/games/boss-tiles/run';

const chart = buildChart(CONFESSION_RAP);

describe('boss judging windows', () => {
  it('grades perfect within ±80 ms and great within ±160 ms', () => {
    expect(PERFECT).toBe(0.08);
    expect(GOOD).toBe(0.16);
    expect(judge(0)).toBe('perfect');
    expect(judge(0.079)).toBe('perfect');
    expect(judge(-0.079)).toBe('perfect');
    expect(judge(0.081)).toBe('great');
    expect(judge(-0.159)).toBe('great');
    expect(judge(0.159)).toBe('great');
    expect(judge(0.161)).toBeNull();
    expect(judge(-0.2)).toBeNull();
  });

  it('keeps the good window under half the tightest same-lane gap', () => {
    // lanes are reused after 2 sixteenths at least; a tap must not reach the next tile
    expect(GOOD).toBeLessThan(STEP);
  });

  it('lowers the target 5 points per side quest, never below 55%', () => {
    expect(thresholdPct(0)).toBe(70);
    expect(thresholdPct(1)).toBe(65);
    expect(thresholdPct(2)).toBe(60);
    expect(thresholdPct(3)).toBe(55);
    expect(thresholdPct(5)).toBe(55);
    expect(starsFor(100)).toBe(5);
    expect(starsFor(71)).toBe(2);
  });
});

describe('boss run', () => {
  it('scores a hit, marks its words, and counts combo', () => {
    const run = new BossRun(chart);
    const t0 = chart.tiles[0];
    const ev = run.tap(t0.lane, t0.t + 0.03);
    expect(ev[0]).toMatchObject({ kind: 'hit', grade: 'perfect' });
    expect(run.score).toBe(POINTS.perfect);
    expect(run.combo).toBe(1);
    for (let w = t0.w0; w < t0.w1; w++) expect(run.words[w]).toBe(WordState.Hit);
  });

  it('a tap in an empty lane costs a little nerve, not the game', () => {
    const run = new BossRun(chart);
    const ev = run.tap((chart.tiles[0].lane + 1) % 4, chart.tiles[0].t);
    expect(ev[0]).toMatchObject({ kind: 'empty' });
    expect(run.nerves).toBe(NERVES.max + NERVES.empty);
    expect(run.choked).toBe(false);
  });

  it('misses tiles that pass the line, fading their words and draining nerves', () => {
    const run = new BossRun(chart);
    const t0 = chart.tiles[0];
    expect(run.advance(t0.t + GOOD - 0.001).length).toBe(0);
    const ev = run.advance(t0.t + GOOD + 0.001);
    expect(ev[0]).toMatchObject({ kind: 'miss' });
    expect(run.words[t0.w0]).toBe(WordState.Missed);
    expect(run.nerves).toBe(NERVES.max + NERVES.miss);
  });

  it('holds pay a bonus when held to the end, partial when let go early', () => {
    const holds = chart.tiles.filter((t) => t.hold);
    const run = new BossRun(chart);
    run.skipTo(holds[0].t - 0.5);
    const before = run.score;
    run.tap(holds[0].lane, holds[0].t);
    run.advance(holds[0].t + holds[0].hold);
    expect(run.score - before).toBe(POINTS.perfect + HOLD_BONUS);

    const run2 = new BossRun(chart);
    run2.skipTo(holds[0].t - 0.5);
    const b2 = run2.score;
    run2.tap(holds[0].lane, holds[0].t);
    const ev = run2.release(holds[0].lane, holds[0].t + holds[0].hold / 2);
    expect(ev[0]).toMatchObject({ kind: 'holdEnd', full: false });
    expect(run2.score - b2).toBe(POINTS.perfect + HOLD_BONUS / 2);
  });

  it('a pause mid-hold pays the part held, with no nerve penalty', () => {
    const hold = chart.tiles.find((t) => t.hold)!;
    const run = new BossRun(chart);
    run.skipTo(hold.t - 0.5);
    const before = run.score;
    run.tap(hold.lane, hold.t);
    run.nerves = 2; // a hold break (-3) now would choke
    const ev = run.interrupt(hold.t + 0.05);
    expect(run.nerves).toBe(2);
    expect(ev).toEqual([expect.objectContaining({ kind: 'holdEnd', full: false })]);
    expect(run.score - before).toBe(POINTS.perfect + Math.round((HOLD_BONUS * 0.05) / hold.hold));
    expect(run.choked).toBe(false);
    expect(run.holding.every((h) => h < 0)).toBe(true);
  });

  it('a perfect player scores 100%', () => {
    const run = new BossRun(chart);
    play(run, () => 0, () => true);
    expect(run.misses).toBe(0);
    expect(run.score).toBe(run.maxScore);
    expect(run.finished).toBe(true);
  });

  it('an idle player chokes long before the song ends', () => {
    const run = new BossRun(chart);
    const ev: RunEvent[] = [];
    let chokedAt = -1;
    for (let t = 0; t < chart.duration && chokedAt < 0; t += 1 / 60) {
      run.advance(t, ev);
      if (run.choked) chokedAt = t;
    }
    expect(chokedAt).toBeGreaterThan(0);
    expect(chokedAt).toBeLessThan(40);
    expect(ev.some((e) => e.kind === 'choke')).toBe(true);
  });

  it('is winnable for a decent thumb player and not for a sloppy one', () => {
    // timing error ~ N(30 ms late, sigma); a share of tiles simply missed
    const trial = (sigma: number, missRate: number, seed: number, sq = 0) => {
      let s = seed;
      const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
      const run = new BossRun(chart, sq);
      play(run, () => 0.03 + gauss() * sigma, () => rand() > missRate);
      return !run.choked && run.passed;
    };
    const rate = (sigma: number, miss: number, sq = 0) => {
      let wins = 0;
      for (let i = 1; i <= 40; i++) if (trial(sigma, miss, i * 7919, sq)) wins++;
      return wins / 40;
    };
    expect(rate(0.05, 0.03)).toBeGreaterThan(0.9); // good player
    expect(rate(0.08, 0.06)).toBeGreaterThan(0.6); // average player
    expect(rate(0.14, 0.2)).toBeLessThan(0.2); // mashing
    // side quests make it easier
    expect(rate(0.1, 0.12, 3)).toBeGreaterThan(rate(0.1, 0.12, 0));
  });
});

/** Drive a run through the whole chart: tap each tile at its time + err(). */
function play(run: BossRun, err: () => number, attempt: () => boolean) {
  const taps = chart.tiles
    .filter(() => attempt())
    .map((t) => ({ t: t.t + err(), lane: t.lane, tile: t }))
    .sort((a, b) => a.t - b.t);
  let k = 0;
  const releases: Array<{ t: number; lane: number }> = [];
  for (let now = 0; now <= chart.duration + 0.5; now += 1 / 120) {
    while (k < taps.length && taps[k].t <= now) {
      const tp = taps[k++];
      run.tap(tp.lane, tp.t);
      if (tp.tile.hold) releases.push({ t: tp.tile.t + tp.tile.hold, lane: tp.lane });
    }
    for (let i = releases.length - 1; i >= 0; i--) {
      if (releases[i].t <= now) {
        run.release(releases[i].lane, releases[i].t);
        releases.splice(i, 1);
      }
    }
    run.advance(now);
  }
}
