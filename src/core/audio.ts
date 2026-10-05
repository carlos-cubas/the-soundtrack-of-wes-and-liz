/**
 * Audio: music, SFX, Web Speech narration and 30-second song previews.
 *
 * Music and most SFX are recorded files (ElevenLabs, see docs/AUDIO.md) listed in
 * `data/music.json` and `data/sfx.json`. They are decoded into AudioBuffers and
 * played through the same buses as the WebAudio synth, which stays as the fallback
 * when a file is missing or fails to load: chiptune tracks in `src/audio/tracks.ts`
 * (step-sequencer patterns) and the synth SFX in `sfx()`.
 */
import { TRACKS, type Track, type Voice } from '../audio/tracks';
import MUSIC_FILES from '../data/music.json';
import SFX_FILES from '../data/sfx.json';
import VOICES from '../data/voices.json';

/** A music file: loops [loopStart, loopEnd) after playing the intro before loopStart once. */
interface MusicFile {
  src: string;
  /** Seconds of lead-in silence to skip. */
  start?: number;
  loopStart?: number;
  loopEnd?: number;
  /** Seconds before loopEnd blended with the seconds before loopStart, so the jump is seamless. */
  xfade?: number;
  /** Correlation of the two blended stretches; the blend is boosted by it so loudness holds. */
  rho?: number;
  /** Playback gain that loudness-matches the tracks. */
  gain?: number;
}

interface SfxFile {
  src: string;
  gain?: number;
  /** Random playback-rate spread (0.05 = ±5%) so repeated sounds don't machine-gun. */
  vary?: number;
  loop?: boolean;
}

const MUSIC = MUSIC_FILES as Record<string, MusicFile | string>;
const SFX = SFX_FILES as Record<string, SfxFile>;
/** Seconds of crossfade between music tracks. */
const MUSIC_XFADE = 0.4;
/** Decoded music buffers kept in memory (each is ~35 MB for 90 s of stereo at 48 kHz). */
const MUSIC_CACHE = 2;
/** A decode that hasn't finished by then counts as failed (iOS can stall one). */
const DECODE_TIMEOUT_MS = 12000;
/** A request that hasn't delivered the whole file by then is aborted (flaky PWA network). */
const FETCH_TIMEOUT_MS = 15000;
/** How often the music watchdog checks that the wanted track is actually playing. */
const WATCHDOG_MS = 1500;

function musicFile(id: string): MusicFile | null {
  const m = MUSIC[id];
  return !m ? null : typeof m === 'string' ? { src: m } : m;
}

function assetUrl(src: string): string {
  return /^(https?:|blob:|data:|\/)/.test(src) ? src : import.meta.env.BASE_URL + src;
}

/**
 * Fetch a file's bytes. A stalled request would leave its load pending forever (and the music
 * "loading" with it), so it is aborted after FETCH_TIMEOUT_MS and rejects, which lets the
 * retry and the synth fallback run. The timer rejects even where fetch ignores the signal.
 */
async function fetchBytes(src: string): Promise<ArrayBuffer> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl?.abort();
      reject(new Error(`${src}: fetch timed out`));
    }, FETCH_TIMEOUT_MS);
  });
  try {
    return await Promise.race([readBytes(src, ctrl?.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function readBytes(src: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(assetUrl(src), signal ? { signal } : undefined);
  // Capacitor's iOS scheme handler answers media files (mp3, m4a) with a plain URLResponse,
  // which fetch reports as status 0 with the whole file in the body. Only a real HTTP status
  // or an empty body is a failure.
  if (!res.ok && res.status !== 0) throw new Error(`${src}: HTTP ${res.status}`);
  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) throw new Error(`${src}: empty response`);
  return bytes;
}

function decodeBytes(ctx: AudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  // callback form: older iOS Safari has no promise-returning decodeAudioData. Newer browsers
  // also reject the returned promise, which the error callback already handles.
  return new Promise((resolve, reject) => {
    (ctx.decodeAudioData(bytes, resolve, reject) as Promise<AudioBuffer> | undefined)?.catch(() => {});
  });
}

async function fetchBuffer(ctx: AudioContext, src: string): Promise<AudioBuffer> {
  return decodeBytes(ctx, await fetchBytes(src));
}

class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(msg)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

/** One music file on its way in: fetched in parallel, decoded in the queue. */
interface MusicLoad {
  id: string;
  /** Asked for by play() (the player is about to hear it), not just preloaded. */
  urgent: boolean;
  result: Promise<AudioBuffer | null>;
  /** Its decode, while it waits in the queue. */
  queued?: { id: string; run: () => Promise<void> };
}

/**
 * Loop points in whole sample frames of the decoded buffer (its rate may differ from the
 * file's), or null when they don't fit it (a truncated file or a stale music.json).
 */
function loopFrames(buf: AudioBuffer, entry: MusicFile): { s: number; e: number } | null {
  if (!entry.loopEnd) return null;
  const sr = buf.sampleRate;
  const s = Math.round((entry.loopStart ?? 0) * sr);
  const e = Math.round(entry.loopEnd * sr);
  return s >= 0 && e > s + 3 && e <= buf.length - 3 ? { s, e } : null;
}

/**
 * Blend the `xfade` seconds before loopEnd with the `xfade` seconds before loopStart,
 * so the jump from loopEnd back to loopStart continues the waveform, and copy a few
 * frames from loopStart to loopEnd so a browser that renders frame `e` before wrapping
 * still plays the right sample. The numpy twin (tools/eleven_loop.py apply_seam) is
 * what the seam measurements in docs/AUDIO.md use.
 */
function bakeLoopSeam(buf: AudioBuffer, entry: MusicFile): void {
  const f = loopFrames(buf, entry);
  if (!f) return;
  const { s, e } = f;
  const n = Math.min(Math.round((entry.xfade ?? 0) * buf.sampleRate), s, e - s);
  const rho = Math.min(1, Math.max(0, entry.rho ?? 1));
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const w = 0.5 - 0.5 * Math.cos((Math.PI * (i + 1)) / (n + 1));
      // partly correlated signals lose power mid-blend; this keeps it level
      const k = 1 / Math.sqrt(w * w + (1 - w) * (1 - w) + 2 * rho * w * (1 - w));
      d[e - n + i] = (d[e - n + i] * (1 - w) + d[s - n + i] * w) * k;
    }
    for (let g = 0; g < 3; g++) d[e + g] = d[s + g];
  }
}

/**
 * A playing track's gain stage. Its level is worked out from the automation we scheduled,
 * never read back: AudioParam.value lags scheduled events, so a fade started right after a
 * start would otherwise begin from the default gain of 1.
 */
interface Stage {
  gain: GainNode;
  at: number;
  level: number;
  ramp: boolean;
}

function stageLevel(st: Stage, now: number): number {
  if (now <= st.at) return 0;
  return st.ramp ? st.level * Math.min(1, (now - st.at) / MUSIC_XFADE) : st.level;
}

/** Key for a recorded voice clip in data/voices.json. */
export function voiceKey(who: string, text: string): string {
  return `${who}|${text.replace(/\s+/g, ' ').trim()}`;
}

export type SfxName =
  | 'tap'
  | 'click'
  | 'back'
  | 'jump'
  | 'land'
  | 'hit'
  | 'collect'
  | 'pop'
  | 'grab'
  | 'win'
  | 'lose'
  | 'star'
  | 'whoosh'
  | 'squirt'
  | 'bonk'
  | 'thunder'
  | 'kiss'
  | 'error'
  | 'unlock'
  | 'claim'
  | 'tick'
  | 'splash'
  | 'swish'
  | 'perfect'
  | 'miss'
  | 'scream'
  | 'page'
  | 'rain'
  | 'whoa'
  | 'cheer'
  | 'splat'
  | 'ribbit'
  | 'camera';

const NOTE_RE = /^([A-G])(#|b)?(-?\d)$/;
const SEMIS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" -> 440 Hz. Accepts numbers (Hz) as-is. */
export function noteHz(n: string | number): number {
  if (typeof n === 'number') return n;
  const m = NOTE_RE.exec(n);
  if (!m) return 440;
  let semi = SEMIS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const oct = parseInt(m[3], 10);
  const midi = (oct + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface Settings {
  music: boolean;
  sfx: boolean;
  voice: boolean;
}

/**
 * Plays one music track at a time: the recorded file from data/music.json when there
 * is one (looped gaplessly from a decoded AudioBuffer), else the step-sequencer synth.
 * Track changes crossfade; a new file keeps the old track playing until it has loaded.
 */
class MusicPlayer {
  private track: Track | null = null;
  private trackId: string | null = null;
  private nextStepTime = 0;
  private step = 0;
  private timer: number | null = null;
  /** Gain stage of the synth track that is playing, so it can fade like a file. */
  private synthOut: Stage | null = null;
  private file: { id: string; src: AudioBufferSourceNode; stage: Stage } | null = null;
  private loading: string | null = null;
  /** A track whose file and synth fallback both failed, so the watchdog leaves it alone. */
  private gaveUp: string | null = null;
  /** When ensure() last restarted a track, so a context that kills every source can't loop. */
  private lastRestart = -Infinity;
  /** Bumped on every play/stop so a slow load can't start a track that was replaced. */
  private token = 0;
  /** What is producing the current track. */
  source: 'file' | 'synth' | null = null;
  startTime = 0;
  /** Called for each sequencer step; fires only while a synth track plays (files have no step clock). */
  stepListeners: Array<(step: number, time: number) => void> = [];

  constructor(private engine: AudioEngine) {}

  get id() {
    return this.trackId;
  }

  /** `skipIntro` starts a file at its loop instead of the top (used after a song preview). */
  play(id: string, opts: { restart?: boolean; skipIntro?: boolean } = {}): void {
    const active = this.timer !== null || !!this.file || this.loading === id;
    if (this.trackId === id && !opts.restart && active) return;
    if (this.file?.id === id && this.loading && !opts.restart) {
      // back to the track that is still playing while another loads: just drop the load
      this.token++;
      this.loading = null;
      this.trackId = id;
      return;
    }
    const token = ++this.token;
    this.trackId = id; // remembered so unlock() can start it later
    this.gaveUp = null;
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const entry = musicFile(id);
    if (!entry) {
      this.loading = null; // a stale load still in flight must not count as busy
      this.startSynth(id);
      return;
    }
    this.loading = id;
    void this.engine.loadMusic(id, true).then((buf) => {
      if (token !== this.token) return;
      this.loading = null;
      if (buf) this.startFile(id, buf, entry, !!opts.skipIntro);
      else this.startSynth(id);
    });
  }

  /**
   * Restart the wanted track if nothing is playing or loading it: a source that ended on
   * its own, or a context that came back from an iOS interruption. Cheap; the engine
   * calls it on a timer, on context state changes and on every tap.
   */
  ensure(): void {
    const id = this.trackId;
    const ctx = this.engine.ctx;
    if (!id || !ctx || ctx.state !== 'running' || id === this.gaveUp) return;
    if (this.file || this.timer !== null || this.loading) return;
    const now = performance.now();
    if (now - this.lastRestart < WATCHDOG_MS) return;
    this.lastRestart = now;
    this.engine.debugEvent('music-restart', { id });
    this.play(id, { restart: true });
  }

  /** Stop the current track, fading out over `fade` seconds. */
  stop(fade = 0.25): void {
    this.token++;
    this.loading = null;
    this.fadeOut(fade);
    this.trackId = null;
  }

  private startFile(id: string, buf: AudioBuffer, entry: MusicFile, skipIntro: boolean): void {
    const ctx = this.engine.ctx!;
    const crossfade = this.fadeOut(MUSIC_XFADE);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = loopFrames(buf, entry);
    if (f) {
      src.loopStart = f.s / buf.sampleRate;
      src.loopEnd = f.e / buf.sampleRate;
    }
    const gain = ctx.createGain();
    const level = entry.gain ?? 1;
    const t = ctx.currentTime + 0.03;
    gain.gain.setValueAtTime(crossfade ? 0 : level, t);
    if (crossfade) gain.gain.linearRampToValueAtTime(level, t + MUSIC_XFADE);
    src.connect(gain).connect(this.engine.musicBus());
    src.onended = () => {
      src.disconnect();
      gain.disconnect();
      // a looping source only ends when we stop it; anything else means iOS dropped it
      if (this.file?.src === src) {
        this.file = null;
        this.source = null;
        this.engine.debugEvent('music-ended', { id });
        this.ensure();
      }
    };
    src.start(t, skipIntro && f ? f.s / buf.sampleRate : entry.start ?? 0);
    this.file = { id, src, stage: { gain, at: t, level, ramp: crossfade } };
    this.source = 'file';
    this.startTime = t;
    this.engine.debugEvent('music', { id, via: 'file', crossfade });
  }

  private startSynth(id: string): void {
    const ctx = this.engine.ctx!;
    const crossfade = this.fadeOut(MUSIC_XFADE);
    const track = TRACKS[id];
    if (!track) {
      this.gaveUp = id;
      this.engine.debugEvent('music', { id, via: 'none' });
      return;
    }
    const out = ctx.createGain();
    const t = ctx.currentTime;
    out.gain.setValueAtTime(crossfade ? 0 : 1, t);
    if (crossfade) out.gain.linearRampToValueAtTime(1, t + MUSIC_XFADE);
    out.connect(this.engine.musicBus());
    this.synthOut = { gain: out, at: t, level: 1, ramp: crossfade };
    this.track = track;
    this.source = 'synth';
    this.step = 0;
    this.startTime = t + 0.08;
    this.nextStepTime = this.startTime;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
    this.engine.debugEvent('music', { id, via: 'synth', crossfade });
  }

  /** Fade out and release whatever is playing. Returns true if something was. */
  private fadeOut(dur: number): boolean {
    const ctx = this.engine.ctx;
    const playing = !!this.file || this.timer !== null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.track = null;
    this.source = null;
    if (!ctx) return playing;
    const t = ctx.currentTime;
    const end = t + Math.max(dur, 0.01);
    const release = (st: Stage) => {
      st.gain.gain.cancelScheduledValues(t);
      st.gain.gain.setValueAtTime(stageLevel(st, t), t);
      st.gain.gain.linearRampToValueAtTime(0, end);
    };
    if (this.file) {
      release(this.file.stage);
      this.file.src.stop(end + 0.05);
      this.file = null;
    }
    if (this.synthOut) {
      const out = this.synthOut.gain;
      release(this.synthOut);
      window.setTimeout(() => out.disconnect(), (dur + 0.3) * 1000);
      this.synthOut = null;
    }
    return playing;
  }

  /** Seconds per sequencer step for the current track. */
  stepDur(): number {
    if (!this.track) return 0.125;
    return 60 / this.track.bpm / (this.track.stepsPerBeat ?? 4);
  }

  private schedule(): void {
    const ctx = this.engine.ctx;
    const t = this.track;
    if (!ctx || !t) return;
    const ahead = ctx.currentTime + 0.12;
    const sd = this.stepDur();
    const total = t.lengthSteps;
    while (this.nextStepTime < ahead) {
      const s = this.step;
      if (!t.loop && s >= total) {
        this.stop();
        return;
      }
      const ls = s % total;
      for (const v of t.voices) this.playVoiceStep(v, ls, this.nextStepTime, sd);
      for (const fn of this.stepListeners) fn(s, this.nextStepTime);
      this.step++;
      this.nextStepTime += sd;
    }
  }

  private playVoiceStep(v: Voice, s: number, time: number, sd: number): void {
    const len = v.pattern.length;
    if (!len) return;
    const ev = v.pattern[s % len];
    if (ev === null || ev === undefined || ev === '.' || ev === '-') return;
    const notes = Array.isArray(ev) ? ev : [ev];
    // a run of '-' after a note extends it
    let hold = 1;
    while (hold < len && v.pattern[(s + hold) % len] === '-') hold++;
    const bus = this.synthOut?.gain ?? this.engine.musicBus();
    for (const n of notes) {
      if (v.wave === 'noise' || v.wave === 'kick' || v.wave === 'snare' || v.wave === 'hat') {
        this.engine.drum(v.wave, time, v.gain ?? 0.5, bus);
      } else {
        this.engine.tone({
          freq: noteHz(n as string | number),
          time,
          dur: sd * hold * (v.legato ?? 0.9),
          wave: v.wave,
          gain: v.gain ?? 0.2,
          attack: v.attack ?? 0.005,
          release: v.release ?? 0.06,
          bus,
          detune: v.detune,
        });
      }
    }
  }
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  readonly music: MusicPlayer;
  settings: Settings = { music: true, sfx: true, voice: true };
  private previewEl: HTMLAudioElement | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private rainNode: { src: AudioBufferSourceNode; gain: GainNode; at: number; level: number } | null = null;
  private musicCache = new Map<string, Promise<AudioBuffer | null>>();
  /** Music loads not finished yet (also when the LRU above has already let go of them). */
  private inflight = new Map<string, MusicLoad>();
  /** Music decodes, run one at a time with the wanted track first (see loadMusic). */
  private decodeQueue: Array<{ id: string; run: () => Promise<void> }> = [];
  private decoding = false;
  private sfxBufs = new Map<string, AudioBuffer>();
  private sfxLast = new Map<string, number>();
  /** Recent music/sfx events and what played them (file or synth), for tests: window.__audioDebug. */
  readonly debugLog: Array<{ t: number; ev: string; [k: string]: unknown }> = [];
  private analyser: AnalyserNode | null = null;

  constructor() {
    this.music = new MusicPlayer(this);
    (window as any).__audioDebug = {
      log: this.debugLog,
      state: () => ({
        ctx: this.ctx?.state ?? null,
        music: this.music.id,
        source: this.music.source,
        musicCached: [...this.musicCache.keys()],
        decodeQueue: this.decodeQueue.map((j) => j.id),
        sfxLoaded: [...this.sfxBufs.keys()],
        rain: this.rainNode ? (this.rainNode.src.buffer === this.noiseBuf ? 'synth' : 'file') : null,
      }),
      /** RMS of the master output right now (taps an analyser on first use). */
      level: () => {
        if (!this.ctx || !this.master) return 0;
        if (!this.analyser) {
          this.analyser = this.ctx.createAnalyser();
          this.analyser.fftSize = 2048;
          this.master.connect(this.analyser);
        }
        const d = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(d);
        let sum = 0;
        for (const v of d) sum += v * v;
        return Math.sqrt(sum / d.length);
      },
      audio: this,
    };
    // Pin the audio session (Safari 17+, and the native app's WKWebView). Left on 'auto',
    // WebKit picks the category itself from its GPU process, ignoring the app's AVAudioSession:
    // AmbientSound (muted by the silent switch) for Web Audio, MediaPlayback while a voice
    // <audio> plays, so skipping through voiced dialogue flips it several times a second.
    // 'playback' keeps one category: music, SFX and voices all play, silent switch or not.
    const session = (navigator as any).audioSession;
    if (session) session.type = 'playback';
    // iOS leaves the context 'interrupted' after a call or Siri; pick it back up when visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    });
    if (typeof speechSynthesis !== 'undefined') {
      const load = () => (this.voices = speechSynthesis.getVoices());
      load();
      speechSynthesis.addEventListener?.('voiceschanged', load);
    }
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  /** Must run inside a user gesture on iOS. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.settings.music ? 0.55 : 0;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.settings.sfx ? 0.8 : 0;
      this.sfxGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const ctx = this.ctx;
      // iOS suspends or interrupts the context (calls, Siri, another app's audio). The next tap
      // resumes it (below), not this handler: with a 'playback' session an instant resume would
      // take the audio back from the app the player just started. Once it runs again, make
      // sure the music is still there.
      ctx.addEventListener('statechange', () => {
        this.debugEvent('ctx', { state: ctx.state });
        if (ctx.state === 'running') this.music.ensure();
      });
      window.setInterval(() => this.music.ensure(), WATCHDOG_MS);
      // a queued track (requested before unlock) starts now
      const pending = this.music.id;
      if (pending) this.music.play(pending, { restart: true });
      this.loadSfx();
    }
    const state = this.ctx.state as string;
    if (state === 'suspended' || state === 'interrupted') this.ctx.resume().catch(() => {});
    this.music.ensure();
  }

  musicBus(): AudioNode {
    return this.musicGain!;
  }

  /**
   * Fetch and decode a music file (cached). Resolves null when there is no file or it failed.
   * Fetches run in parallel, but decodes run one at a time: on iOS each is ~35 MB, and a burst
   * of them (a player skipping title -> map -> narration -> level) can stall. `urgent` (the
   * track the player is about to hear) jumps the queue; a decode the player has moved on
   * from is dropped. The wanted track gets a second try after an error.
   */
  loadMusic(id: string, urgent = false): Promise<AudioBuffer | null> {
    const entry = musicFile(id);
    const ctx = this.ctx;
    if (!entry || !ctx) return Promise.resolve(null);
    const hit = this.musicCache.get(id) ?? this.inflight.get(id)?.result;
    if (hit) {
      this.cacheMusic(id, hit);
      if (urgent) this.prioritize(id);
      return hit;
    }
    let finish!: (b: AudioBuffer | null) => void;
    const load: MusicLoad = { id, urgent, result: new Promise((r) => (finish = r)) };
    this.inflight.set(id, load);
    this.cacheMusic(id, load.result);
    void this.runLoad(load, entry, ctx).then((buf) => {
      this.inflight.delete(id);
      if (!buf && this.musicCache.get(id) === load.result) this.musicCache.delete(id); // retry next time (e.g. back online)
      finish(buf);
    });
    return load.result;
  }

  /** Warm the cache for a track that is about to play (no-op before unlock). */
  preloadMusic(id: string): void {
    void this.loadMusic(id);
  }

  private cacheMusic(id: string, p: Promise<AudioBuffer | null>): void {
    this.musicCache.delete(id); // most recently used goes last
    this.musicCache.set(id, p);
    while (this.musicCache.size > MUSIC_CACHE) this.musicCache.delete(this.musicCache.keys().next().value!);
  }

  private prioritize(id: string): void {
    const load = this.inflight.get(id);
    if (!load) return;
    load.urgent = true;
    const i = load.queued ? this.decodeQueue.indexOf(load.queued) : -1;
    if (i > 0) this.decodeQueue.unshift(...this.decodeQueue.splice(i, 1));
  }

  /** Never throws: resolves the buffer, or null. */
  private async runLoad(load: MusicLoad, entry: MusicFile, ctx: AudioContext): Promise<AudioBuffer | null> {
    let buf: AudioBuffer | null = null;
    try {
      for (let attempt = 1; attempt <= 2 && !buf; attempt++) {
        // only the track the player is waiting for is worth a second try
        if (attempt > 1 && this.music.id !== load.id) break;
        try {
          buf = await this.queueDecode(load, ctx, await fetchBytes(entry.src));
          if (!buf) break; // dropped: nobody wants it any more
        } catch (err) {
          this.debugEvent('music-load-failed', { id: load.id, attempt, err: String(err) });
          if (err instanceof TimeoutError) break; // a stalled decode would only stall again
        }
      }
      if (buf && entry.loopEnd) bakeLoopSeam(buf, entry);
    } catch (err) {
      this.debugEvent('music-load-failed', { id: load.id, err: String(err) });
      buf = null;
    }
    return buf;
  }

  /** Decode in turn. Resolves null if, when its turn comes, nobody wants the track. */
  private queueDecode(load: MusicLoad, ctx: AudioContext, bytes: ArrayBuffer): Promise<AudioBuffer | null> {
    return new Promise((resolve, reject) => {
      const job = {
        id: load.id,
        run: async () => {
          load.queued = undefined;
          const wanted = this.music.id === load.id;
          // asked for by play() but the player has moved on, or a preload the cache let go of
          if (!wanted && (load.urgent || this.musicCache.get(load.id) !== load.result)) return resolve(null);
          const decode = decodeBytes(ctx, bytes);
          try {
            resolve(await withTimeout(decode, DECODE_TIMEOUT_MS, `${load.id}: decode timed out`));
          } catch (err) {
            reject(err);
            // a stalled decode may still be running: give it a moment before starting another
            await Promise.race([decode.catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
          }
        },
      };
      load.queued = job;
      if (load.urgent) this.decodeQueue.unshift(job);
      else this.decodeQueue.push(job);
      this.pumpDecodes();
    });
  }

  private pumpDecodes(): void {
    if (this.decoding) return;
    const job = this.decodeQueue.shift();
    if (!job) return;
    this.decoding = true;
    void job.run().finally(() => {
      this.decoding = false;
      this.pumpDecodes();
    });
  }

  /** SFX are small (~400 KB in all), so they load in parallel, outside the music queue. */
  private loadSfx(): void {
    const ctx = this.ctx!;
    for (const [name, entry] of Object.entries(SFX)) {
      fetchBuffer(ctx, entry.src).then(
        (buf) => this.sfxBufs.set(name, buf),
        (err) => this.debugEvent('sfx-load-failed', { name, err: String(err) }),
      );
    }
  }

  debugEvent(ev: string, data: Record<string, unknown> = {}): void {
    this.debugLog.push({ t: Math.round(performance.now()), ev, ...data });
    if (this.debugLog.length > 200) this.debugLog.splice(0, this.debugLog.length - 200);
  }

  applySettings(s: Partial<Settings>): void {
    Object.assign(this.settings, s);
    if (this.musicGain) this.musicGain.gain.value = this.settings.music ? 0.55 : 0;
    if (this.sfxGain) this.sfxGain.gain.value = this.settings.sfx ? 0.8 : 0;
    if (!this.settings.voice) this.stopSpeaking();
  }

  // ------------------------------------------------------------------ synth
  tone(o: {
    freq: number;
    time?: number;
    dur: number;
    wave?: OscillatorType;
    gain?: number;
    attack?: number;
    release?: number;
    slideTo?: number;
    bus?: AudioNode;
    detune?: number;
  }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = o.time ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = o.wave ?? 'square';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.detune) osc.detune.value = o.detune;
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t + o.dur);
    const g = ctx.createGain();
    const peak = o.gain ?? 0.2;
    const a = o.attack ?? 0.005;
    const r = o.release ?? 0.05;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, o.dur - r));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur + r);
    osc.connect(g).connect(o.bus ?? this.sfxGain!);
    osc.start(t);
    osc.stop(t + o.dur + r + 0.02);
  }

  noise(o: { time?: number; dur: number; gain?: number; filter?: number; type?: BiquadFilterType; bus?: AudioNode; q?: number; sweepTo?: number }): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    const t = o.time ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'lowpass';
    f.frequency.setValueAtTime(o.filter ?? 2000, t);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.dur);
    f.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain ?? 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(o.bus ?? this.sfxGain!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.02);
  }

  drum(kind: 'kick' | 'snare' | 'hat' | 'noise', time: number, gain: number, bus?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (kind === 'kick') {
      this.tone({ freq: 150, slideTo: 42, time, dur: 0.16, wave: 'sine', gain: gain * 1.4, attack: 0.002, release: 0.05, bus });
    } else if (kind === 'snare') {
      this.noise({ time, dur: 0.14, gain: gain * 0.7, filter: 1800, type: 'highpass', bus });
      this.tone({ freq: 220, slideTo: 140, time, dur: 0.06, wave: 'triangle', gain: gain * 0.4, bus });
    } else if (kind === 'hat') {
      this.noise({ time, dur: 0.035, gain: gain * 0.35, filter: 7000, type: 'highpass', bus });
    } else {
      this.noise({ time, dur: 0.25, gain, filter: 1200, bus });
    }
  }

  /** Play a named sound effect: the recorded file when loaded, else the synth version. */
  sfx(name: SfxName): void {
    const ctx = this.ctx;
    if (!ctx || !this.settings.sfx) return;
    const t = ctx.currentTime;
    // the same effect fired twice in one frame would just double in volume
    if (t - (this.sfxLast.get(name) ?? -1) < 0.03) return;
    this.sfxLast.set(name, t);
    const buf = this.sfxBufs.get(name);
    if (buf) {
      this.playSfxBuffer(name, buf, SFX[name]);
      return;
    }
    this.debugEvent('sfx', { name, via: 'synth' });
    const T = (freq: number, dur: number, wave: OscillatorType = 'square', gain = 0.18, dt = 0, slideTo?: number) =>
      this.tone({ freq, dur, wave, gain, time: t + dt, slideTo });
    switch (name) {
      case 'tap':
      case 'click':
        T(880, 0.04, 'triangle', 0.18);
        break;
      case 'back':
        T(520, 0.05, 'triangle', 0.16);
        T(390, 0.06, 'triangle', 0.14, 0.05);
        break;
      case 'page':
        this.noise({ dur: 0.12, gain: 0.12, filter: 3000, type: 'bandpass', sweepTo: 900 });
        break;
      case 'jump':
        T(330, 0.14, 'square', 0.14, 0, 760);
        break;
      case 'land':
        T(140, 0.05, 'triangle', 0.18);
        break;
      case 'hit':
        T(220, 0.22, 'sawtooth', 0.2, 0, 60);
        this.noise({ dur: 0.18, gain: 0.25, filter: 900 });
        break;
      case 'bonk':
        T(180, 0.18, 'square', 0.22, 0, 70);
        T(90, 0.2, 'sine', 0.3, 0.02, 50);
        break;
      case 'collect':
      case 'grab':
        T(988, 0.06, 'square', 0.13);
        T(1319, 0.12, 'square', 0.13, 0.06);
        break;
      case 'pop':
        T(500, 0.07, 'sine', 0.25, 0, 900);
        break;
      case 'star':
        [1047, 1319, 1568].forEach((f, i) => T(f, 0.09, 'triangle', 0.16, i * 0.07));
        break;
      case 'perfect':
        T(1568, 0.06, 'triangle', 0.13);
        T(2093, 0.08, 'triangle', 0.1, 0.03);
        break;
      case 'miss':
      case 'error':
        T(196, 0.12, 'square', 0.14);
        T(147, 0.16, 'square', 0.14, 0.1);
        break;
      case 'win':
        ['C5', 'E5', 'G5', 'C6', 'G5', 'C6'].forEach((n, i) =>
          T(noteHz(n), i === 5 ? 0.4 : 0.11, 'square', 0.13, i * 0.11),
        );
        break;
      case 'lose':
        ['G4', 'F#4', 'F4', 'E4'].forEach((n, i) => T(noteHz(n), i === 3 ? 0.5 : 0.18, 'triangle', 0.18, i * 0.2));
        break;
      case 'unlock':
      case 'claim':
        ['G5', 'B5', 'D6', 'G6'].forEach((n, i) => T(noteHz(n), 0.1, 'triangle', 0.15, i * 0.06));
        break;
      case 'whoosh':
      case 'swish':
        this.noise({ dur: 0.25, gain: 0.2, filter: 600, type: 'bandpass', sweepTo: 3500, q: 2 });
        break;
      case 'squirt':
        this.noise({ dur: 0.09, gain: 0.12, filter: 500, type: 'lowpass', q: 6 });
        break;
      case 'splash':
        this.noise({ dur: 0.35, gain: 0.25, filter: 2500, type: 'lowpass', sweepTo: 400 });
        break;
      case 'thunder':
        this.noise({ dur: 1.6, gain: 0.6, filter: 300, type: 'lowpass', sweepTo: 60 });
        this.noise({ dur: 0.25, gain: 0.35, filter: 2500, type: 'highpass' });
        break;
      case 'kiss':
        T(1200, 0.05, 'sine', 0.2, 0, 2400);
        T(800, 0.1, 'sine', 0.12, 0.06, 1600);
        break;
      case 'scream':
        T(900, 0.5, 'sawtooth', 0.08, 0, 1300);
        T(905, 0.5, 'square', 0.05, 0, 1250);
        break;
      case 'tick':
        T(1500, 0.02, 'square', 0.08);
        break;
      case 'rain':
        this.noise({ dur: 0.6, gain: 0.1, filter: 4000, type: 'highpass' });
        break;
      case 'whoa':
        T(392, 0.35, 'triangle', 0.14, 0, 523);
        T(494, 0.35, 'triangle', 0.1, 0.02, 659);
        break;
      case 'cheer':
        this.noise({ dur: 0.9, gain: 0.22, filter: 1800, type: 'bandpass', q: 0.6 });
        ['C5', 'E5', 'G5'].forEach((n, i) => T(noteHz(n), 0.12, 'square', 0.1, i * 0.08));
        break;
      case 'splat':
        this.noise({ dur: 0.18, gain: 0.3, filter: 900, type: 'lowpass', sweepTo: 200 });
        T(160, 0.08, 'sine', 0.2, 0, 70);
        break;
      case 'ribbit':
        T(260, 0.07, 'square', 0.12, 0, 180);
        T(240, 0.09, 'square', 0.12, 0.1, 170);
        break;
      case 'camera':
        this.noise({ dur: 0.04, gain: 0.25, filter: 3000, type: 'highpass' });
        this.noise({ dur: 0.05, gain: 0.2, filter: 2000, type: 'bandpass', time: t + 0.07 });
        break;
    }
  }

  private playSfxBuffer(name: string, buf: AudioBuffer, entry: SfxFile): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (entry.vary) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * entry.vary;
    const g = ctx.createGain();
    g.gain.value = entry.gain ?? 1;
    src.connect(g).connect(this.sfxGain!);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
    src.start(t);
    if (entry.loop) {
      // a looping bed (rain) used as a one-shot: a short swell
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(entry.gain ?? 1, t + 0.1);
      g.gain.linearRampToValueAtTime(0, t + 1.2);
      src.stop(t + 1.25);
    }
    this.debugEvent('sfx', { name, via: 'file' });
  }

  /**
   * Looping rain ambience for storm scenes: the recorded rain loop when loaded, else
   * filtered noise. `level` is relative to the default 0.12. Fades in and out, and goes
   * through the SFX bus so the SFX setting mutes it.
   */
  setRain(on: boolean, level = 0.12): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    const t = ctx.currentTime;
    if (on && !this.rainNode) {
      const file = this.sfxBufs.get('rain');
      const src = ctx.createBufferSource();
      src.loop = true;
      const g = ctx.createGain();
      let target = level / 0.8; // the noise level was tuned before the 0.8 sfx bus
      if (file) {
        src.buffer = file;
        src.connect(g);
        target = (level / 0.12) * (SFX.rain?.gain ?? 1);
      } else {
        src.buffer = this.noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 2500;
        f.Q.value = 0.4;
        src.connect(f).connect(g);
      }
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(target, t + 0.6);
      g.connect(this.sfxGain!);
      src.start(t);
      this.rainNode = { src, gain: g, at: t, level: target };
      this.debugEvent('rain', { on: true, via: file ? 'file' : 'synth' });
    } else if (!on && this.rainNode) {
      const { src, gain, at, level } = this.rainNode;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(level * Math.min(1, Math.max(0, (t - at) / 0.6)), t);
      gain.gain.linearRampToValueAtTime(0, t + 0.5);
      src.stop(t + 0.55);
      this.rainNode = null;
      this.debugEvent('rain', { on: false });
    }
  }

  // ------------------------------------------------------------------ music
  /**
   * Switch the music track (crossfades; same id keeps playing unless `restart`).
   * Before unlock() the id is remembered and starts on the first user gesture.
   */
  playMusic(id: string | null, opts?: { restart?: boolean }): void {
    if (!id) {
      this.music.stop();
      return;
    }
    this.music.play(id, opts);
  }

  stopMusic(): void {
    this.music.stop();
  }

  // ----------------------------------------------------------------- speech
  /**
   * Speak lines in order (the orange "hear the narration" button, dialogue).
   * Uses the recorded character voice clip for a line when one exists in
   * `data/voices.json` (key: voiceKey(who, text)), else the Web Speech API.
   * Resolves when all lines finish or `stopSpeaking()` is called.
   */
  async speakLines(lines: Array<{ who: string; text: string }>, opts: { tts?: boolean } = {}): Promise<void> {
    this.stopSpeaking();
    const token = ++this.speechToken;
    for (const l of lines) {
      if (token !== this.speechToken || !this.settings.voice) return;
      await this.speakOne(l.who, l.text, token, opts.tts ?? true);
    }
  }

  /**
   * Speak one line. See speakLines. Pass `tts: false` to stay silent when
   * no recorded clip exists (used for dialogue, so robotic TTS never plays
   * over every line).
   */
  speak(text: string, opts: { who?: string; tts?: boolean } = {}): Promise<void> {
    return this.speakLines([{ who: opts.who ?? 'wes', text }], { tts: opts.tts });
  }

  /** True if a recorded voice clip exists for this line. */
  hasVoice(who: string, text: string): boolean {
    return !!(VOICES as Record<string, string>)[voiceKey(who, text)];
  }

  private speechToken = 0;
  private voiceEl: HTMLAudioElement | null = null;
  private ttsActive = false;

  private speakOne(who: string, text: string, token: number, tts: boolean): Promise<void> {
    return new Promise((resolve) => {
      const clip = (VOICES as Record<string, string>)[voiceKey(who, text)];
      if (clip) {
        const el = new Audio(clip.startsWith('http') ? clip : import.meta.env.BASE_URL + clip);
        this.voiceEl = el;
        this.duck(true);
        const done = () => {
          if (this.voiceEl === el) {
            this.voiceEl = null;
            this.duck(false);
          }
          resolve();
        };
        el.onended = done;
        el.onerror = done;
        (el as any)._done = done;
        el.play().catch(done);
        return;
      }
      if (!tts || typeof speechSynthesis === 'undefined' || token !== this.speechToken) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      const v = this.pickVoice(who);
      if (v) u.voice = v;
      u.lang = v?.lang ?? 'en-US';
      u.pitch = who === 'liz' || who === 'liz-kid' ? 1.15 : who.endsWith('kid') ? 1.35 : who === 'wes' ? 0.95 : 1;
      this.ttsActive = true;
      const done = () => {
        this.ttsActive = false;
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
    });
  }

  private duck(on: boolean): void {
    if (this.musicGain && this.ctx) {
      const target = !this.settings.music ? 0 : on ? 0.18 : 0.55;
      this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.15);
    }
  }

  stopSpeaking(): void {
    this.speechToken++;
    if (this.voiceEl) {
      const el = this.voiceEl;
      this.voiceEl = null;
      el.pause();
      (el as any)._done?.();
      this.duck(false);
    }
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.ttsActive = false;
  }

  get speaking(): boolean {
    return !!this.voiceEl || this.ttsActive || (typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking);
  }

  private pickVoice(who: string): SpeechSynthesisVoice | null {
    const en = this.voices.filter((v) => v.lang.startsWith('en'));
    if (!en.length) return null;
    const male = ['Aaron', 'Daniel', 'Alex', 'Fred', 'Tom', 'Arthur', 'Nathan', 'Evan', 'Reed', 'Rishi', 'Gordon'];
    const female = ['Samantha', 'Nicky', 'Ava', 'Allison', 'Susan', 'Zoe', 'Karen', 'Moira', 'Tessa', 'Serena', 'Kate'];
    const prefs = who === 'liz' || who === 'jocelyn' || who === 'helena' ? female : male;
    for (const name of prefs) {
      const hit = en.find((v) => v.name.includes(name) && /enhanced|premium/i.test(v.name)) ?? en.find((v) => v.name.includes(name));
      if (hit) return hit;
    }
    return en.find((v) => v.lang === 'en-US') ?? en[0];
  }

  // ---------------------------------------------------------------- preview
  /**
   * Play a 30-second preview of a real song (Apple's iTunes preview).
   * Returns false if no preview could be played (offline etc.).
   */
  async playPreview(url: string, onEnd?: () => void): Promise<boolean> {
    this.stopPreview();
    const el = new Audio(url);
    el.crossOrigin = 'anonymous';
    el.volume = 0.9;
    this.previewEl = el;
    const musicWas = this.music.id;
    this.music.stop();
    el.onended = () => {
      if (this.previewEl === el) this.previewEl = null;
      if (musicWas) this.music.play(musicWas, { skipIntro: true });
      onEnd?.();
    };
    try {
      await el.play();
      return true;
    } catch {
      this.previewEl = null;
      if (musicWas) this.music.play(musicWas, { skipIntro: true });
      return false;
    }
  }

  stopPreview(): void {
    if (this.previewEl) {
      this.previewEl.pause();
      this.previewEl.onended?.(new Event('ended'));
      this.previewEl = null;
    }
  }

  get previewing(): boolean {
    return !!this.previewEl && !this.previewEl.paused;
  }
}

export const audio = new AudioEngine();
