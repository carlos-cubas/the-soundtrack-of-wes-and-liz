import { describe, expect, it } from 'vitest';
import { SongClock } from '../src/games/boss-tiles/clock';

/** A fake AudioContext whose currentTime advances in coarse callback chunks, like Safari's. */
function fakeCtx(opts: { chunk: number; latency?: number; outputTimestamp?: boolean; skew?: number }) {
  let perfMs = 1000;
  const ctx = {
    get currentTime() {
      const t = perfMs / 1000 - 1; // context started at perf 1000 ms
      return Math.floor(t / opts.chunk) * opts.chunk;
    },
    state: 'running' as AudioContextState,
    outputLatency: opts.latency ?? 0,
    baseLatency: 0,
    getOutputTimestamp: opts.outputTimestamp
      ? () => ({ contextTime: Math.max(0, perfMs / 1000 - 1 - (opts.latency ?? 0) + (opts.skew ?? 0)), performanceTime: perfMs })
      : undefined,
  };
  return { ctx: ctx as unknown as AudioContext, raw: ctx, setPerf: (ms: number) => (perfMs = ms) };
}

describe('boss song clock', () => {
  it('follows the audio clock smoothly even when currentTime jumps in chunks', () => {
    const { ctx, setPerf } = fakeCtx({ chunk: 0.0107, latency: 0.02 });
    const clock = new SongClock(ctx);
    setPerf(2000);
    clock.start(0, 0.1); // position 0 plays 0.1 s from now
    let last = -Infinity;
    let maxErr = 0;
    for (let ms = 2000; ms < 4000; ms += 1000 / 60) {
      setPerf(ms);
      const p = clock.tick(ms);
      const truth = (ms - 2000) / 1000 - 0.1 - 0.02; // audible position, minus output latency
      if (ms > 2300) maxErr = Math.max(maxErr, Math.abs(p - truth));
      expect(p).toBeGreaterThan(last); // never runs backwards
      last = p;
    }
    expect(maxErr).toBeLessThan(0.012);
  });

  it('uses getOutputTimestamp when available and maps event timestamps', () => {
    const { ctx, setPerf } = fakeCtx({ chunk: 0.003, latency: 0.03, outputTimestamp: true });
    const clock = new SongClock(ctx);
    setPerf(5000);
    clock.start(10); // resume at song second 10
    setPerf(5500);
    const p = clock.tick(5500);
    expect(p).toBeCloseTo(10 + 0.5 - 0.12 - 0.03, 2);
    // a tap 40 ms before the frame maps 40 ms earlier on the song clock
    expect(clock.at(5460)).toBeCloseTo(p - 0.04, 6);
  });

  it('ignores the output timestamp while audio is not running', () => {
    const { ctx, raw, setPerf } = fakeCtx({ chunk: 0.003, outputTimestamp: true, skew: 0.2 });
    raw.state = 'suspended';
    const clock = new SongClock(ctx);
    setPerf(5000);
    clock.start(0, 0);
    setPerf(5600);
    // suspended audio: currentTime is the only truth (the timestamp is stale/skewed)
    expect(clock.raw(5600)).toBeCloseTo(0.6, 2);
  });

  it('latches currentTime when the output timestamp is garbage, and never flips back', () => {
    const { ctx, setPerf } = fakeCtx({ chunk: 0.003, outputTimestamp: true, skew: 5 });
    const clock = new SongClock(ctx);
    setPerf(5000);
    clock.start(0, 0);
    for (let ms = 5000; ms < 5500; ms += 16) {
      setPerf(ms);
      expect(Math.abs(clock.raw(ms) - (ms - 5000) / 1000)).toBeLessThan(0.01);
    }
  });

  it('keeps one reading per stretch even when the two latency estimates differ a lot', () => {
    // e.g. Bluetooth: the timestamp knows ~0.25 s more latency than outputLatency
    const { ctx, setPerf } = fakeCtx({ chunk: 0.0107, outputTimestamp: true, skew: -0.25 });
    const clock = new SongClock(ctx);
    setPerf(5000);
    clock.start(0, 0);
    let last = clock.tick(5000);
    for (let ms = 5016; ms < 7000; ms += 1000 / 60) {
      setPerf(ms);
      const p = clock.tick(ms);
      expect(Math.abs(p - last - 1 / 60)).toBeLessThan(0.006); // smooth, no 0.25 s jumps
      last = p;
    }
  });

  it('falls back to wall time without an AudioContext', () => {
    const clock = new SongClock(null);
    expect(clock.source).toBe('wall');
    const now = performance.now();
    clock.start(2, 0);
    expect(clock.tick(now + 500)).toBeCloseTo(2.5, 1);
  });
});
