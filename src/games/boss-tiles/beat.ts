/**
 * The boss level's beat: an original, moody hip-hop instrumental in
 * C minor at 86 BPM. A descending line-cliché bass (C, B, Bb, Ab-G) under
 * a sighing piano ostinato; boom-bap drums that build from a muffled
 * intro through a snare-roll build into a full drop.
 *
 * Everything is synthesized with WebAudio and scheduled step by step on
 * the audio clock, so the music and the chart share one sample-accurate
 * grid. A Beat instance plays one stretch of the song; pausing throws it
 * away (its bus is disconnected) and resuming starts a new one.
 */
import { INTRO_BARS, STEP, STEPS_PER_BAR, type Chart } from './chart';

type Part = 'intro' | 'verse' | 'verse2' | 'build' | 'drop' | 'final' | 'outro';

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

interface Chord {
  /** Bass note per half bar (MIDI). */
  bass: [number, number];
  /** Pad voicing per half bar. */
  pad: [number[], number[]];
  /** Right-hand ostinato notes, played on OSTINATO steps. */
  rh: number[];
  /** Lead notes per half bar (drop and final). */
  lead: [number, number];
}

const CHORDS: Chord[] = [
  { bass: [36, 36], pad: [[60, 63, 67], [60, 63, 67]], rh: [67, 72, 75, 67, 72, 74], lead: [75, 74] }, // Cm
  { bass: [35, 35], pad: [[59, 63, 67], [59, 63, 67]], rh: [67, 71, 75, 67, 71, 74], lead: [74, 72] }, // Cm/B
  { bass: [34, 34], pad: [[58, 63, 67], [58, 63, 67]], rh: [67, 70, 75, 67, 70, 74], lead: [72, 70] }, // Cm7/Bb
  { bass: [32, 31], pad: [[60, 63, 68], [59, 62, 67]], rh: [68, 72, 75, 67, 71, 74], lead: [72, 71] }, // Ab -> G
];
/** 3-3-2 syncopation, twice per bar. */
const OSTINATO = [0, 3, 6, 8, 11, 14];

const LOOKAHEAD = 0.25;

/** Shared per AudioContext: noise buffer and reverb impulse. */
const cache = new WeakMap<BaseAudioContext, { noise: AudioBuffer; ir: AudioBuffer }>();
function assets(ctx: BaseAudioContext) {
  let a = cache.get(ctx);
  if (!a) {
    const sr = ctx.sampleRate;
    const noise = ctx.createBuffer(1, sr, sr);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const len = Math.floor(sr * 2.2);
    const ir = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    a = { noise, ir };
    cache.set(ctx, a);
  }
  return a;
}

export class Beat {
  private readonly out: GainNode;
  private readonly tone: BiquadFilterNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly noise: AudioBuffer;
  /** Context time of song step 0. */
  private t0 = 0;
  private next = 0;
  private timer: number | null = null;
  private stopped = false;
  private readonly lastStep: number;

  constructor(
    private readonly ctx: BaseAudioContext,
    dest: AudioNode,
    private readonly chart: Chart,
  ) {
    const a = assets(ctx);
    this.noise = a.noise;
    this.out = ctx.createGain();
    this.out.gain.value = 0.5;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 18000;
    this.tone.Q.value = 0.7;
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.32;
    const verb = ctx.createConvolver();
    verb.buffer = a.ir;
    this.dry.connect(this.tone);
    this.wet.connect(verb).connect(this.tone);
    this.tone.connect(this.out).connect(dest);
    this.lastStep = chart.endBar * STEPS_PER_BAR;
  }

  /** Render the whole song offline, e.g. to check levels and timing. */
  static renderOffline(chart: Chart, sampleRate = 22050): Promise<AudioBuffer> {
    const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * (chart.duration + 2)), sampleRate);
    const beat = new Beat(ctx, ctx.destination, chart);
    for (let s = 0; s < beat.lastStep; s++) beat.playStep(s, s * STEP);
    return ctx.startRendering();
  }

  /** Play from `fromStep`, with song step 0 at context time `t0`. */
  start(t0: number, fromStep: number): void {
    this.t0 = t0;
    this.next = Math.max(0, Math.ceil(fromStep));
    this.pump();
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  /** Fade out and release every node of this stretch. */
  stop(fade = 0.04): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + fade);
    const out = this.out;
    setTimeout(() => out.disconnect(), fade * 1000 + 80);
  }

  /** The words won't come out: the beat drowns and dies away. */
  choke(): void {
    const now = this.ctx.currentTime;
    this.tone.frequency.cancelScheduledValues(now);
    this.tone.frequency.setValueAtTime(this.tone.frequency.value, now);
    this.tone.frequency.exponentialRampToValueAtTime(160, now + 0.9);
    this.stop(1.1);
  }

  /** A miss: the whole world goes muffled for a moment. */
  muffle(): void {
    const now = this.ctx.currentTime;
    const f = this.tone.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(Math.min(f.value, 18000), now);
    f.exponentialRampToValueAtTime(650, now + 0.04);
    f.setTargetAtTime(18000, now + 0.22, 0.12);
  }

  /** Song step `s` -> context time. */
  time(s: number): number {
    return this.t0 + s * STEP;
  }

  pump(): void {
    if (this.stopped) return;
    const until = this.ctx.currentTime + LOOKAHEAD;
    while (this.next < this.lastStep && this.time(this.next) < until) {
      const t = this.time(this.next);
      if (t >= this.ctx.currentTime - 0.01) this.playStep(this.next, t);
      this.next++;
    }
  }

  // ------------------------------------------------------------ arrangement
  private partOf(bar: number): { part: Part; bar0: number; bar1: number } {
    if (bar < INTRO_BARS) return { part: 'intro', bar0: 0, bar1: INTRO_BARS };
    for (const s of this.chart.sections) if (bar >= s.bar0 && bar < s.bar1) return { part: s.name, bar0: s.bar0, bar1: s.bar1 };
    return { part: 'outro', bar0: this.chart.outroBar, bar1: this.chart.endBar };
  }

  /** Chord for a bar: the 4-bar loop restarts with each section, so the drop lands on Cm. */
  chordAt(bar: number): Chord {
    const { part, bar0 } = this.partOf(bar);
    if (part === 'intro') return CHORDS[(bar + 2) % 4];
    if (part === 'outro') return CHORDS[0];
    return CHORDS[(bar - bar0) % 4];
  }

  private playStep(step: number, t: number): void {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const s = step % STEPS_PER_BAR;
    const { part, bar0, bar1 } = this.partOf(bar);
    const ch = this.chordAt(bar);
    const half = s < 8 ? 0 : 1;
    const fromEnd = bar1 - bar; // 1 = last bar of the part
    const big = part === 'drop' || part === 'final';

    if (part === 'outro') {
      if (s === 0) {
        this.crash(t, 0.5);
        this.kick(t, 1);
        this.bass(t, ch.bass[0], STEP * 24, 0.55);
        for (const n of [48, 60, 63, 67, 72]) this.piano(t, n, 3.2, 0.2);
        this.pad(t, [60, 63, 67, 72], STEP * 28, 0.09);
      }
      return;
    }

    // ---- piano: ostinato always; muffled in the intro, doubled in the final
    const oi = OSTINATO.indexOf(s);
    if (oi >= 0) {
      const g = part === 'intro' ? 0.16 : big ? 0.17 : 0.2;
      const muffle = part === 'intro' ? (bar === 0 ? 900 : 2200) : 5000;
      this.piano(t, ch.rh[oi], STEP * 5, g, muffle);
      if (part === 'final') this.piano(t, ch.rh[oi] + 12, STEP * 4, 0.08, 6000);
    }
    if (s === 0 || (s === 8 && ch.bass[1] !== ch.bass[0])) this.piano(t, ch.bass[half] + 24, STEP * 8, part === 'intro' ? 0.1 : 0.13, 1600);

    if (part === 'intro') {
      // count-in on the second bar: a side-stick on every beat, then a swell
      if (bar === INTRO_BARS - 1) {
        if (s % 4 === 0) this.rim(t, s === 12 ? 0.5 : 0.35);
        if (s === 8) this.riser(t, STEP * 8, 0.12);
      }
      return;
    }

    // ---- drums
    const kicks =
      part === 'verse' ? [0, 10] : part === 'verse2' ? [0, 7, 10] : part === 'build' ? (fromEnd <= 2 ? [0, 4, 8, 10, 12] : [0, 10]) : part === 'drop' ? [0, 6, 10] : [0, 3, 6, 10, 14];
    if (kicks.includes(s)) this.kick(t, s === 0 ? 1 : 0.85);

    const roll = part === 'build' && fromEnd === 1;
    if (roll) {
      // snare roll into the drop, 16ths, rising
      this.snare(t, 0.18 + 0.4 * (s / 15), false);
    } else if (s === 4 || s === 12) {
      this.snare(t, big ? 0.62 : 0.55, big);
    }
    if (part === 'build' && fromEnd === 2 && (s === 14 || s === 15)) this.snare(t, 0.25, false);

    const sixteenths = big || part === 'build';
    if (s % 2 === 0 || (sixteenths && !roll)) {
      const accent = s % 4 === 2 ? 1 : s % 2 === 0 ? 0.7 : 0.45;
      const open = (part === 'verse2' || big) && s === 14 && bar % 2 === 1;
      this.hat(t, (big ? 0.2 : part === 'verse' ? 0.11 : 0.15) * accent, open);
    } else if (part === 'verse2' && (s === 13 || s === 15)) {
      this.hat(t, 0.06, false);
    }
    if (bar === bar0 && s === 0 && (big || part === 'build')) this.crash(t, part === 'build' ? 0.25 : 0.45);
    if (part === 'build' && fromEnd === 2 && s === 0) this.riser(t, STEP * 32, 0.16);

    // ---- bass
    if (part === 'build') {
      if (s % 2 === 0) this.bass(t, ch.bass[half], STEP * 1.6, 0.42);
    } else if (big) {
      if (s === 0) this.bass(t, ch.bass[0], STEP * (ch.bass[1] !== ch.bass[0] ? 7.5 : 9.5), 0.6, ch.bass[0] + 12);
      if (s === 8 && ch.bass[1] !== ch.bass[0]) this.bass(t, ch.bass[1], STEP * 7.5, 0.6);
      if (s === 10 && ch.bass[1] === ch.bass[0]) this.bass(t, ch.bass[1], STEP * 5.5, 0.5);
    } else {
      const v = part === 'verse' ? 0.4 : 0.48;
      if (s === 0) this.bass(t, ch.bass[0], STEP * (ch.bass[1] !== ch.bass[0] ? 7.5 : 9.5), v);
      if (s === 8 && ch.bass[1] !== ch.bass[0]) this.bass(t, ch.bass[1], STEP * 7.5, v);
      if (s === 10 && ch.bass[1] === ch.bass[0]) this.bass(t, ch.bass[1], STEP * 5.5, v * 0.85);
      if (part === 'verse2' && s === 14) this.bass(t, ch.bass[1] + 12, STEP * 1.5, 0.28);
    }

    // ---- pad from the build on; lead bell in the drop
    if (part === 'build' || big) {
      if (s === 0 || (s === 8 && ch.pad[1] !== ch.pad[0])) {
        const open = part === 'build' ? 500 + 1800 * ((bar - bar0) / Math.max(1, bar1 - bar0)) : 2600;
        this.pad(t, ch.pad[half], STEP * (ch.pad[1] !== ch.pad[0] ? 8 : 16), part === 'build' ? 0.06 : 0.075, open);
      }
    }
    if (big && (s === 0 || s === 8)) this.bell(t, ch.lead[half] + (part === 'final' ? 12 : 0), STEP * 7, part === 'final' ? 0.07 : 0.09);
  }

  // -------------------------------------------------------------- voices
  private env(t: number, peak: number, attack: number, decay: number, bus: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(bus);
    return g;
  }

  private osc(type: OscillatorType, freq: number, t: number, dur: number, to: AudioNode, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.connect(to);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private noiseSrc(t: number, dur: number, to: AudioNode): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.connect(to);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.05);
    return src;
  }

  private filter(type: BiquadFilterType, freq: number, q: number, to: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(to);
    return f;
  }

  private kick(t: number, v: number): void {
    const g = this.env(t, 0.95 * v, 0.003, 0.42, this.dry);
    const o = this.osc('sine', 125, t, 0.45, g);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    // knock so it reads on phone speakers
    const k = this.env(t, 0.3 * v, 0.001, 0.05, this.dry);
    const ko = this.osc('triangle', 260, t, 0.06, k);
    ko.frequency.exponentialRampToValueAtTime(120, t + 0.05);
  }

  private snare(t: number, v: number, clap: boolean): void {
    const g = this.env(t, v, 0.002, 0.19, this.dry);
    this.noiseSrc(t, 0.22, this.filter('bandpass', 1900, 0.7, g));
    const send = this.env(t, v * 0.6, 0.002, 0.14, this.wet);
    this.noiseSrc(t, 0.16, this.filter('highpass', 1200, 0.7, send));
    const b = this.env(t, v * 0.5, 0.002, 0.08, this.dry);
    const o = this.osc('triangle', 196, t, 0.1, b);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    if (clap) {
      for (const d of [0, 0.011, 0.023]) {
        const c = this.env(t + d, v * 0.5, 0.001, 0.07 + d * 3, this.wet);
        this.noiseSrc(t + d, 0.15, this.filter('bandpass', 1300, 1.4, c));
      }
    }
  }

  private rim(t: number, v: number): void {
    const g = this.env(t, v, 0.001, 0.05, this.dry);
    this.osc('square', 820, t, 0.06, this.filter('bandpass', 1700, 3, g));
    const w = this.env(t, v * 0.5, 0.001, 0.08, this.wet);
    this.osc('triangle', 1650, t, 0.06, w);
  }

  private hat(t: number, v: number, open: boolean): void {
    const g = this.env(t, v, 0.001, open ? 0.32 : 0.045, this.dry);
    this.noiseSrc(t, open ? 0.36 : 0.06, this.filter('highpass', 7600, 0.8, g));
  }

  private crash(t: number, v: number): void {
    const g = this.env(t, v * 0.5, 0.002, 1.8, this.wet);
    this.noiseSrc(t, 1.9, this.filter('highpass', 4800, 0.5, g));
    const d = this.env(t, v * 0.35, 0.002, 1.1, this.dry);
    this.noiseSrc(t, 1.2, this.filter('highpass', 6500, 0.5, d));
  }

  private riser(t: number, dur: number, v: number): void {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
    g.connect(this.wet);
    const f = this.filter('bandpass', 400, 2.5, g);
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    this.noiseSrc(t, dur, f);
  }

  /** 808-style bass with a 2x harmonic so phone speakers can hear it. */
  private bass(t: number, midi: number, dur: number, v: number, slideFrom?: number): void {
    const f = hz(midi);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.006);
    g.gain.setTargetAtTime(v * 0.55, t + 0.05, 0.25);
    g.gain.setValueAtTime(v * 0.5, t + dur - 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    g.connect(this.dry);
    const o = this.osc('sine', slideFrom ? hz(slideFrom) : f, t, dur + 0.1, g);
    if (slideFrom) o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    const h = this.ctx.createGain();
    h.gain.value = 0.35;
    h.connect(this.filter('lowpass', 700, 0.7, g));
    const o2 = this.osc('triangle', (slideFrom ? hz(slideFrom) : f) * 2, t, dur + 0.1, h);
    if (slideFrom) o2.frequency.exponentialRampToValueAtTime(f * 2, t + 0.09);
  }

  private piano(t: number, midi: number, dur: number, v: number, bright = 5000): void {
    const f = hz(midi);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(bright, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, bright * 0.25), t + dur);
    const g = this.env(t, v, 0.004, dur, lp);
    const send = this.ctx.createGain();
    send.gain.value = 0.55;
    lp.connect(this.dry);
    lp.connect(send).connect(this.wet);
    this.osc('triangle', f, t, dur, g, -4);
    this.osc('sine', f * 2, t, dur * 0.5, this.env(t, v * 0.35, 0.003, dur * 0.4, lp), 3);
    this.osc('sine', f, t, dur, g, 5);
  }

  private pad(t: number, notes: number[], dur: number, v: number, cutoff = 2600): void {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.25);
    g.gain.setValueAtTime(v, t + Math.max(0.26, dur - 0.2));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3);
    const lp = this.filter('lowpass', cutoff, 0.9, this.wet);
    lp.connect(this.dry);
    g.connect(lp);
    for (const n of notes) {
      this.osc('sawtooth', hz(n), t, dur + 0.35, g, -7);
      this.osc('sawtooth', hz(n), t, dur + 0.35, g, 7);
    }
  }

  private bell(t: number, midi: number, dur: number, v: number): void {
    const f = hz(midi);
    const g = this.env(t, v, 0.005, dur, this.wet);
    g.connect(this.dry);
    this.osc('sine', f, t, dur, g);
    this.osc('sine', f * 3.01, t, dur * 0.4, this.env(t, v * 0.3, 0.002, dur * 0.3, this.wet));
  }

  /** Pitch (Hz) in key for the k-th hit around `step`, so hits "play" over the beat. */
  hitHz(step: number, k: number): number {
    const ch = this.chordAt(Math.floor(step / STEPS_PER_BAR));
    const tones = [ch.rh[1], ch.rh[2], ch.rh[0] + 12, ch.rh[5]];
    return hz(tones[k % tones.length] + 12);
  }
}
