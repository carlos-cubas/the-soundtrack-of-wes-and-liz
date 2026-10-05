/**
 * MusicPlayer races (the "l1 music silent after a fast skip" bug), against a fake
 * Web Audio context whose decodes the test resolves by hand, in any order.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

class Param {
  constructor(public value = 1) {}
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number) {
    this.value = v;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}
class FakeNode {
  connect<T>(n: T) {
    return n;
  }
  disconnect() {}
}
class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  playbackRate = new Param();
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  start() {
    this.started = true;
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    // like a browser, a stopped source reports `ended`
    queueMicrotask(() => this.onended?.());
  }
}
interface FakeBuffer {
  tag: string;
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  duration: number;
  getChannelData: () => Float32Array;
}
const buffer = (tag: string, length = 4800): FakeBuffer => {
  const d = new Float32Array(length);
  return { tag, sampleRate: 48000, length, numberOfChannels: 2, duration: length / 48000, getChannelData: () => d };
};

interface Decode {
  src: string;
  ok: (b: FakeBuffer) => void;
  fail: (e: unknown) => void;
}

class FakeCtx {
  static last: FakeCtx;
  state = 'running';
  currentTime = 0;
  sampleRate = 48000;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  /** Music decodes waiting for the test (SFX decode by themselves). */
  pending: Decode[] = [];
  /** Every music file handed to decodeAudioData, in order. */
  decoded: string[] = [];
  resumes = 0;
  resumeWorks = true;
  private listeners: Array<() => void> = [];
  constructor() {
    FakeCtx.last = this;
  }
  createGain() {
    return Object.assign(new FakeNode(), { gain: new Param() });
  }
  createBufferSource() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createOscillator() {
    return Object.assign(new FakeNode(), { type: '', frequency: new Param(440), detune: new Param(0), start() {}, stop() {} });
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(), { type: '', frequency: new Param(), Q: new Param() });
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode(), { threshold: new Param(), ratio: new Param() });
  }
  createBuffer(_ch: number, len: number) {
    return buffer('noise', len);
  }
  decodeAudioData(bytes: ArrayBuffer, ok: (b: FakeBuffer) => void, fail: (e: unknown) => void) {
    const src = new TextDecoder().decode(bytes);
    if (src.includes('/sfx/')) queueMicrotask(() => ok(buffer(src)));
    else {
      this.decoded.push(src);
      this.pending.push({ src, ok, fail });
    }
    return undefined;
  }
  resume() {
    this.resumes++;
    if (this.resumeWorks) this.setState('running');
    return Promise.resolve();
  }
  addEventListener(_type: string, fn: () => void) {
    this.listeners.push(fn);
  }
  setState(s: string) {
    if (s === this.state) return;
    this.state = s;
    this.listeners.forEach((f) => f());
  }
}

/** url -> how fetch answers it ('ok', 'status0' like Capacitor's media responses, or an HTTP error). */
const fetchMode = new Map<string, 'ok' | 'status0' | 'empty' | 'hang' | 'hang-once' | number>();
/** Every fetch and its signal, to check that stalled requests get aborted. */
const fetches: Array<{ url: string; signal?: AbortSignal }> = [];

beforeAll(() => {
  const g = globalThis as any;
  g.window = g;
  g.addEventListener = () => {};
  g.document = { addEventListener: () => {}, hidden: false };
  g.location = { protocol: 'http:', search: '' };
  g.AudioContext = FakeCtx;
  g.fetch = async (url: string, init?: { signal?: AbortSignal }) => {
    const key = [...fetchMode.keys()].find((k) => url.includes(k));
    const mode = key ? fetchMode.get(key)! : 'ok';
    fetches.push({ url, signal: init?.signal });
    const bytes = new TextEncoder().encode(url).buffer;
    if (mode === 'hang' || mode === 'hang-once') {
      if (mode === 'hang-once') fetchMode.set(key!, 'ok');
      return new Promise(() => {}); // never answers, and ignores the abort
    }
    // an error page has a body too, so only the status can tell it apart
    if (typeof mode === 'number') return { ok: false, status: mode, arrayBuffer: async () => new TextEncoder().encode('<h1>Not Found</h1>').buffer };
    if (mode === 'empty') return { ok: false, status: 0, arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: mode === 'ok', status: mode === 'ok' ? 200 : 0, arrayBuffer: async () => bytes };
  };
});

let AudioEngine: typeof import('../src/core/audio').AudioEngine;
beforeAll(async () => {
  ({ AudioEngine } = await import('../src/core/audio'));
});

beforeEach(() => {
  vi.useFakeTimers();
  fetchMode.clear();
  fetches.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

const flush = () => vi.advanceTimersByTimeAsync(0);

/** Resolve (or fail) the pending decode of a music id. */
async function decode(ctx: FakeCtx, id: string, ok = true) {
  await flush();
  const i = ctx.pending.findIndex((d) => d.src.endsWith(`/music/${id}.mp3`));
  if (i < 0) throw new Error(`no pending decode for ${id}; pending: ${ctx.pending.map((d) => d.src).join(', ')}`);
  const [d] = ctx.pending.splice(i, 1);
  if (ok) d.ok(buffer(id));
  else d.fail(new Error('EncodingError'));
  await flush();
}

/** The music source that is playing (started, not stopped), if any. */
const playing = (ctx: FakeCtx) => ctx.sources.filter((s) => s.started && !s.stopped && s.loop).map((s) => s.buffer?.tag);

function boot(first = 'title') {
  const engine = new AudioEngine();
  engine.playMusic(first); // before unlock, like the title screen
  engine.unlock();
  return { engine, ctx: FakeCtx.last };
}

describe('music after a fast skip', () => {
  it('ends on the level track whatever order the decodes finish in', async () => {
    const { engine, ctx } = boot();
    await flush(); // the title is decoding
    // the player rushes: map, the level preload, narration, and the game itself
    engine.playMusic('map');
    engine.preloadMusic('l1');
    engine.playMusic('narration');
    engine.playMusic('l1');
    await decode(ctx, 'title');
    await decode(ctx, 'l1'); // jumped the queue: it is what the player hears next
    expect(engine.music.id).toBe('l1');
    expect(engine.music.source).toBe('file');
    expect(playing(ctx)).toEqual(['l1']);
    // map and narration were asked for but the player moved on: never decoded
    await vi.advanceTimersByTimeAsync(100);
    expect(ctx.decoded).toEqual(['/audio/music/title.mp3', '/audio/music/l1.mp3']);
    expect(ctx.pending).toEqual([]);
  });

  it('decodes one music file at a time', async () => {
    const { engine, ctx } = boot();
    await flush();
    engine.preloadMusic('map');
    engine.playMusic('l1');
    await flush();
    expect(ctx.pending.map((d) => d.src)).toEqual(['/audio/music/title.mp3']);
    await decode(ctx, 'title');
    expect(ctx.pending.map((d) => d.src)).toEqual(['/audio/music/l1.mp3']);
    await decode(ctx, 'l1');
    expect(playing(ctx)).toEqual(['l1']);
    // the preload still decodes, after the track that is playing
    expect(ctx.pending.map((d) => d.src)).toEqual(['/audio/music/map.mp3']);
  });

  it('decodes a preload once even after the cache has let go of it', async () => {
    const { engine, ctx } = boot('map');
    await decode(ctx, 'map');
    engine.preloadMusic('l1');
    await flush(); // l1 is decoding
    engine.preloadMusic('l2');
    engine.preloadMusic('l3'); // the two-entry cache drops l1
    engine.playMusic('l1');
    await decode(ctx, 'l1');
    expect(playing(ctx)).toEqual(['l1']);
    expect(ctx.decoded.filter((s) => s.endsWith('/l1.mp3'))).toHaveLength(1);
  });

  it('a crossfade does not count as the old track ending on its own', async () => {
    const { engine, ctx } = boot('map');
    await decode(ctx, 'map');
    engine.playMusic('l1');
    await decode(ctx, 'l1');
    await vi.advanceTimersByTimeAsync(3000);
    expect(playing(ctx)).toEqual(['l1']);
    expect(ctx.sources.filter((s) => s.buffer?.tag === 'l1')).toHaveLength(1);
    expect(engine.debugLog.some((e) => e.ev === 'music-restart' || e.ev === 'music-ended')).toBe(false);
  });

  it('retries a failed decode once, then plays the file', async () => {
    const { engine, ctx } = boot('l1');
    await decode(ctx, 'l1', false);
    expect(engine.music.source).toBe(null);
    await decode(ctx, 'l1');
    expect(playing(ctx)).toEqual(['l1']);
    expect(engine.debugLog.some((e) => e.ev === 'music-load-failed' && e.id === 'l1' && e.attempt === 1)).toBe(true);
  });

  it('falls back to the synth track after two failures', async () => {
    const { engine, ctx } = boot('l1');
    await decode(ctx, 'l1', false);
    await decode(ctx, 'l1', false);
    expect(engine.music.id).toBe('l1');
    expect(engine.music.source).toBe('synth');
    engine.stopMusic();
  });

  it('accepts the status-0 responses Capacitor gives media files', async () => {
    fetchMode.set('/music/', 'status0');
    const { engine, ctx } = boot('l1');
    await decode(ctx, 'l1');
    expect(engine.music.source).toBe('file');
    expect(playing(ctx)).toEqual(['l1']);
  });

  it('treats a real HTTP error as a failure, even with a body', async () => {
    fetchMode.set('/music/l1.mp3', 404);
    const { engine, ctx } = boot('l1');
    await vi.advanceTimersByTimeAsync(10);
    expect(engine.music.source).toBe('synth');
    expect(ctx.decoded).toEqual([]);
    engine.stopMusic();
  });

  it('treats status 0 with an empty body as a failure', async () => {
    fetchMode.set('/music/l1.mp3', 'empty');
    const { engine, ctx } = boot('l1');
    await vi.advanceTimersByTimeAsync(10);
    expect(engine.music.source).toBe('synth');
    expect(ctx.decoded).toEqual([]);
    engine.stopMusic();
  });

  it('aborts a fetch that never answers, retries, then falls back to the synth', async () => {
    fetchMode.set('/music/l1.mp3', 'hang');
    const { engine, ctx } = boot('l1');
    await vi.advanceTimersByTimeAsync(14_000);
    expect(engine.music.source).toBe(null); // still waiting on the first request
    await vi.advanceTimersByTimeAsync(1_010); // first request aborted, the retry is out
    const l1 = fetches.filter((f) => f.url.endsWith('/l1.mp3'));
    expect(l1.map((f) => f.signal?.aborted)).toEqual([true, false]);
    await vi.advanceTimersByTimeAsync(15_010); // the retry is aborted too
    expect(engine.music.id).toBe('l1');
    expect(engine.music.source).toBe('synth');
    expect(ctx.decoded).toEqual([]);
    expect(engine.debugLog.filter((e) => e.ev === 'music-load-failed' && String(e.err).includes('fetch timed out'))).toHaveLength(2);
    engine.stopMusic();
  });

  it('plays the file when the retry of a stalled fetch gets through', async () => {
    fetchMode.set('/music/l1.mp3', 'hang-once');
    const { engine, ctx } = boot('l1');
    await vi.advanceTimersByTimeAsync(15_010);
    await decode(ctx, 'l1');
    expect(engine.music.source).toBe('file');
    expect(playing(ctx)).toEqual(['l1']);
  });

  it('times out a stalled decode so the queue keeps moving', async () => {
    const { engine, ctx } = boot('map');
    await flush(); // map is decoding, and never finishes
    engine.playMusic('l1');
    await vi.advanceTimersByTimeAsync(12_000 + 2_000 + 10); // the timeout, then the grace
    await decode(ctx, 'l1');
    expect(playing(ctx)).toEqual(['l1']);
  });

  it('falls back to the synth when the wanted track stalls', async () => {
    const { engine } = boot('l1');
    await flush();
    await vi.advanceTimersByTimeAsync(12_010);
    expect(engine.music.source).toBe('synth');
    engine.stopMusic();
  });

  it('starts nothing when stopped during a load', async () => {
    const { engine, ctx } = boot('l1');
    await flush(); // decoding
    engine.stopMusic();
    await decode(ctx, 'l1');
    expect(engine.music.id).toBe(null);
    expect(playing(ctx)).toEqual([]);
  });

  it('drops the decode when stopped before its turn', async () => {
    const { engine, ctx } = boot('l1');
    engine.stopMusic();
    await vi.advanceTimersByTimeAsync(100);
    expect(ctx.decoded).toEqual([]);
    expect(playing(ctx)).toEqual([]);
  });

  it('A -> B (loading) -> A keeps A playing without a restart', async () => {
    const { engine, ctx } = boot('map');
    await decode(ctx, 'map');
    const first = ctx.sources.find((s) => s.buffer?.tag === 'map');
    engine.playMusic('l1');
    engine.playMusic('map');
    await vi.advanceTimersByTimeAsync(100);
    expect(engine.music.id).toBe('map');
    expect(playing(ctx)).toEqual(['map']);
    expect(ctx.sources.filter((s) => s.buffer?.tag === 'map')).toEqual([first]);
    expect(ctx.decoded.some((s) => s.endsWith('/l1.mp3'))).toBe(false); // dropped, not decoded
  });
});

describe('music recovery on iOS', () => {
  it('resumes an interrupted context on the next tap, not on its own', async () => {
    const { engine, ctx } = boot('l1');
    await decode(ctx, 'l1');
    const before = ctx.resumes;
    ctx.setState('interrupted'); // e.g. the player started another app's music
    expect(ctx.resumes).toBe(before);
    engine.unlock(); // what every pointerdown calls
    expect(ctx.resumes).toBe(before + 1);
    expect(ctx.state).toBe('running');
  });

  it('restarts the track when iOS drops its source, once the context runs again', async () => {
    const { engine, ctx } = boot('l1');
    await decode(ctx, 'l1');
    const src = ctx.sources.find((s) => s.buffer?.tag === 'l1')!;
    ctx.setState('interrupted');
    src.stopped = true;
    src.onended?.(); // the source ended without us stopping it
    expect(playing(ctx)).toEqual([]);
    expect(engine.music.id).toBe('l1');
    ctx.setState('running'); // the interruption ends
    await flush();
    expect(playing(ctx)).toEqual(['l1']);
    expect(engine.debugLog.some((e) => e.ev === 'music-restart' && e.id === 'l1')).toBe(true);
  });

  it('the watchdog restarts the wanted track if nothing is playing or loading', async () => {
    const { engine, ctx } = boot('l1');
    await decode(ctx, 'l1');
    const src = ctx.sources.find((s) => s.buffer?.tag === 'l1')!;
    // the context stops and comes back without telling anyone (no statechange)
    ctx.state = 'suspended';
    src.stopped = true;
    src.onended?.();
    ctx.state = 'running';
    expect(playing(ctx)).toEqual([]);
    await vi.advanceTimersByTimeAsync(1600);
    expect(playing(ctx)).toEqual(['l1']);
    expect(engine.music.source).toBe('file');
  });

  it('does not restart in a tight loop when every new source dies at once', async () => {
    const { engine, ctx } = boot('l1');
    await decode(ctx, 'l1');
    for (let i = 0; i < 5; i++) {
      const live = ctx.sources.filter((s) => s.started && !s.stopped && s.loop);
      live.forEach((s) => {
        s.stopped = true;
        s.onended?.();
      });
      await flush();
    }
    expect(engine.debugLog.filter((e) => e.ev === 'music-restart')).toHaveLength(1);
  });

  it('leaves a stopped track alone', async () => {
    const { engine, ctx } = boot('l1');
    await decode(ctx, 'l1');
    engine.stopMusic();
    await vi.advanceTimersByTimeAsync(5000);
    expect(engine.music.id).toBe(null);
    expect(playing(ctx)).toEqual([]);
  });
});
