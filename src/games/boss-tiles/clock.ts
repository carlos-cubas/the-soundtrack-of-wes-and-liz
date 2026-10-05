/**
 * Song clock: the song position the player is hearing right now, read from
 * the audio clock (never from frame time).
 *
 * The raw position comes from `getOutputTimestamp()` when the browser has
 * it (it already accounts for output latency), else `currentTime` minus
 * the reported latency. AudioContext time advances in audio-callback
 * chunks, so the clock is smoothed: it runs on `performance.now()` between
 * reads and is pulled gently toward the audio clock, snapping if they ever
 * drift apart. Pointer event timestamps map onto it with `at()`.
 *
 * Without an AudioContext (audio blocked) it falls back to wall time, so
 * the game still runs, silently.
 */
export class SongClock {
  /** Context time (or wall seconds) of song position 0. */
  private t0 = 0;
  private s = 0;
  private lastPerf = 0;
  private synced = false;
  /**
   * Which audio reading this stretch uses, latched on the first good sample
   * so the two latency estimates can never alternate frame to frame.
   */
  private mode: 'unknown' | 'fine' | 'coarse' = 'unknown';

  constructor(private readonly ctx: AudioContext | null) {}

  get source(): 'audio' | 'wall' {
    return this.ctx ? 'audio' : 'wall';
  }

  /** Context time of song position 0 (for scheduling). */
  get origin(): number {
    return this.t0;
  }

  /**
   * Start so that song position `pos` is heard `lead` seconds from now.
   * Returns the context time at which position 0 would play.
   */
  start(pos: number, lead = 0.12): number {
    const base = this.ctx ? this.ctx.currentTime : performance.now() / 1000;
    this.t0 = base + lead - pos;
    this.synced = false;
    this.mode = 'unknown';
    return this.t0;
  }

  /** Audible song position at `perf` (performance.now() ms), unsmoothed. */
  raw(perf: number): number {
    const ctx = this.ctx;
    if (!ctx) return perf / 1000 - this.t0;
    const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    const coarse = ctx.currentTime - lat - this.t0;
    if (this.mode === 'coarse' || ctx.state !== 'running') return coarse;
    // the output timestamp, while audio runs and if it isn't garbage (within 1 s of currentTime)
    const ts = ctx.getOutputTimestamp?.();
    if (!ts || !ts.performanceTime || ts.contextTime === undefined || ts.contextTime <= 0) return coarse;
    const fine = ts.contextTime + (perf - ts.performanceTime) / 1000 - this.t0;
    if (this.mode === 'unknown') this.mode = Math.abs(fine - coarse) < 1 ? 'fine' : 'coarse';
    return this.mode === 'fine' ? fine : coarse;
  }

  /** Advance to `perf` and return the smoothed song position. Call once per frame. */
  tick(perf: number): number {
    const raw = this.raw(perf);
    if (!this.synced) {
      this.s = raw;
      this.synced = true;
    } else {
      const pred = this.s + (perf - this.lastPerf) / 1000;
      const err = raw - pred;
      this.s = Math.abs(err) > 0.05 ? raw : pred + err * 0.12;
    }
    this.lastPerf = perf;
    return this.s;
  }

  /** Song position at another moment (e.g. a pointer event's timeStamp). */
  at(perf: number): number {
    if (!this.synced) return this.tick(perf);
    return this.s + (perf - this.lastPerf) / 1000;
  }
}
