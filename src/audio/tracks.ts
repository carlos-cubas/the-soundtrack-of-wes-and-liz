/**
 * Chiptune music tracks for the step sequencer in `core/audio.ts`.
 *
 * These are the fallback: every id normally plays a recorded file from
 * `data/music.json` (see docs/AUDIO.md). The synth version plays when that file
 * is missing or fails to load, so the game is never silent.
 *
 * A pattern is an array with one entry per step (16th notes by default):
 *   'C4'      play a note            ['C4','E4']  play a chord
 *   '-'       hold the previous note  '.' / null   rest
 * Drum voices (`kick`, `snare`, `hat`) play on any non-rest entry ('x').
 * Patterns shorter than the track repeat.
 *
 * Track ids used by the game:
 *   title, map, narration, reward, l1 … l6, sq1 … sq3, ending
 * The boss level builds its own beat (see games/boss).
 */

export type Step = string | number | Array<string | number> | null;

export interface Voice {
  wave: OscillatorType | 'kick' | 'snare' | 'hat' | 'noise';
  pattern: Step[];
  gain?: number;
  attack?: number;
  release?: number;
  /** Fraction of the step length the note sounds (0..1). */
  legato?: number;
  detune?: number;
}

export interface Track {
  bpm: number;
  /** Steps per beat (4 = 16th notes). */
  stepsPerBeat?: number;
  lengthSteps: number;
  loop: boolean;
  voices: Voice[];
}

/** Split "C4 . E4 - G4" into a pattern array. */
export function p(s: string): Step[] {
  return s
    .trim()
    .split(/\s+/)
    .map((tok) => (tok === '.' ? null : tok.includes('+') ? tok.split('+') : tok));
}

const backbeat = (kick = 0.5, snare = 0.35, hat = 0.3): Voice[] => [
  { wave: 'kick', gain: kick, pattern: p('x . . . . . . . x . x . . . . .') },
  { wave: 'snare', gain: snare, pattern: p('. . . . x . . . . . . . x . . .') },
  { wave: 'hat', gain: hat, pattern: p('x . x . x . x . x . x . x . x .') },
];

/** Sunny I–V–vi–IV pop (title, ending). */
const bright: Track = {
  bpm: 112,
  lengthSteps: 64,
  loop: true,
  voices: [
    {
      wave: 'triangle',
      gain: 0.15,
      pattern: p(`E5 . G5 . C6 - - . B5 . G5 . E5 . D5 .  D5 . G5 . B5 - - . A5 . G5 . D5 . B4 .
                  C5 . E5 . A5 - - . G5 . E5 . C5 . E5 .  F5 . A5 . C6 - - . A5 . G5 . F5 . E5 .`),
    },
    {
      wave: 'square',
      gain: 0.06,
      legato: 0.7,
      pattern: p(`C3 - - - . . C3 . C3 - - - . . G2 .  G2 - - - . . G2 . G2 - - - . . D3 .
                  A2 - - - . . A2 . A2 - - - . . E3 .  F2 - - - . . F2 . F2 - - - . . C3 .`),
    },
    ...backbeat(),
  ],
};

/** Easy-going whistle over a walking bass (map). */
const stroll: Track = {
  bpm: 96,
  lengthSteps: 64,
  loop: true,
  voices: [
    {
      wave: 'triangle',
      gain: 0.15,
      pattern: p(`A5 - . G5 F5 - . . C5 - . D5 F5 - . .  D6 - . C6 Bb5 - . . F5 - . G5 Bb5 - . .
                  C6 - . Bb5 A5 - . . G5 - . A5 G5 - E5 .  F5 - - - . . . . . . . . . . . .`),
    },
    {
      wave: 'square',
      gain: 0.06,
      legato: 0.6,
      pattern: p(`F2 . . . C3 . . . F2 . . . C3 . . .  Bb2 . . . F2 . . . Bb2 . . . F2 . . .
                  C3 . . . G2 . . . C3 . . . G2 . . .  F2 . . . C3 . . . F2 . A2 . C3 . . .`),
    },
    { wave: 'kick', gain: 0.4, pattern: p('x . . . . . . . x . . . . . . .') },
    { wave: 'hat', gain: 0.25, pattern: p('. . x . . . x . . . x . . . x .') },
  ],
};

/** Soft arpeggios and a slow melody, no drums (narration, sq1, sq2). */
const gentle: Track = {
  bpm: 72,
  lengthSteps: 64,
  loop: true,
  voices: [
    {
      wave: 'triangle',
      gain: 0.07,
      legato: 0.8,
      release: 0.12,
      pattern: p(`C4 G4 C5 E5 G4 C5 E5 G5 C4 G4 C5 E5 G4 C5 E5 G5  A3 E4 A4 C5 E4 A4 C5 E5 A3 E4 A4 C5 E4 A4 C5 E5
                  F3 C4 F4 A4 C4 F4 A4 C5 F3 C4 F4 A4 C4 F4 A4 C5  G3 D4 G4 B4 D4 G4 B4 D5 G3 D4 G4 B4 D4 G4 B4 D5`),
    },
    {
      wave: 'sine',
      gain: 0.13,
      attack: 0.04,
      release: 0.25,
      pattern: p(`E5 - - - - - - - G5 - - - E5 - - -  C5 - - - - - - - E5 - - - A5 - - -
                  A5 - - - G5 - - - F5 - - - A5 - - -  G5 - - - - - - - D5 - - - - - - -`),
    },
  ],
};

/** Two-bar fanfare (reward). */
const fanfare: Track = {
  bpm: 120,
  lengthSteps: 32,
  loop: true,
  voices: [
    {
      wave: 'square',
      gain: 0.09,
      pattern: p('C5 . E5 . G5 . C6 - - - G5 . C6 - - -  F5 . A5 . C6 . F6 - - - E6 . D6 - - -'),
    },
    { wave: 'triangle', gain: 0.16, pattern: p('C3 - - - C3 - - - G2 - - - C3 - - -  F2 - - - F2 - - - G2 - - - G2 - - -') },
    { wave: 'kick', gain: 0.45, pattern: p('x . . . x . . . x . . . x . . .') },
    { wave: 'snare', gain: 0.3, pattern: p('. . . . x . . . . . . . x . x x') },
  ],
};

/** Bouncy 8-bit platformer (l1, l4, l5). */
const bouncy: Track = {
  bpm: 140,
  lengthSteps: 64,
  loop: true,
  voices: [
    {
      wave: 'square',
      gain: 0.08,
      legato: 0.6,
      pattern: p(`C5 . C5 E5 . G5 . E5 C5 . C5 E5 . G5 A5 G5  F5 . F5 A5 . C6 . A5 G5 . G5 B5 . D6 B5 G5
                  C5 . C5 E5 . G5 . E5 C5 . C5 E5 . G5 A5 G5  F5 . A5 . G5 . B5 . C6 . . . C6 . . .`),
    },
    {
      wave: 'triangle',
      gain: 0.18,
      legato: 0.5,
      pattern: p(`C3 . C4 . C3 . C4 . C3 . C4 . C3 . C4 .  F2 . F3 . F2 . F3 . G2 . G3 . G2 . G3 .
                  C3 . C4 . C3 . C4 . C3 . C4 . C3 . C4 .  F2 . F3 . G2 . G3 . C3 . G2 . C3 . . .`),
    },
    { wave: 'kick', gain: 0.5, pattern: p('x . . . x . . . x . . . x . . .') },
    { wave: 'snare', gain: 0.3, pattern: p('. . . . x . . . . . . . x . . .') },
    { wave: 'hat', gain: 0.25, pattern: p('. . x . . . x . . . x . . . x .') },
  ],
};

/** Tiptoeing pizzicato caper in A minor (l2, l6). */
const quirky: Track = {
  bpm: 128,
  lengthSteps: 64,
  loop: true,
  voices: [
    {
      wave: 'triangle',
      gain: 0.16,
      legato: 0.35,
      pattern: p(`A4 . . C5 . . E5 . D5 . C5 . B4 . . .  G#4 . . B4 . . E5 . D5 . B4 . G#4 . . .
                  A4 . . C5 . . E5 . A5 . G5 . E5 . . .  F5 . E5 . D5 . B4 . A4 - - - . . . .`),
    },
    {
      wave: 'square',
      gain: 0.06,
      legato: 0.5,
      pattern: p(`A2 . . . E3 . . . A2 . . . E3 . . .  E2 . . . B2 . . . E2 . . . B2 . . .
                  A2 . . . E3 . . . A2 . . . E3 . . .  E2 . . . B2 . . . A2 . . . . . . .`),
    },
    { wave: 'kick', gain: 0.4, pattern: p('x . . . . . . . x . . . . . . .') },
    { wave: 'hat', gain: 0.35, pattern: p('. . x . . . x . . . x . . . x x') },
  ],
};

/** Driving minor-key chase (l3, sq3). */
const tense: Track = {
  bpm: 160,
  lengthSteps: 64,
  loop: true,
  voices: [
    {
      wave: 'sawtooth',
      gain: 0.06,
      legato: 0.5,
      pattern: p(`E2 . E2 . E2 . E2 . E2 . E2 . G2 . A2 .  C3 . C3 . C3 . C3 . B2 . B2 . B2 . B2 .
                  E2 . E2 . E2 . E2 . E2 . E2 . G2 . A2 .  C3 . C3 . D3 . D3 . B2 . B2 . D#3 . D#3 .`),
    },
    {
      wave: 'square',
      gain: 0.07,
      pattern: p(`E5 - - - D5 - - - B4 - - - G4 - A4 -  B4 - - - - - - - . . . . . . . .
                  E5 - - - D5 - - - B4 - - - G4 - A4 -  C5 - - - B4 - - - A4 - - - B4 - - -`),
    },
    { wave: 'kick', gain: 0.5, pattern: p('x . . . x . . . x . . . x . x .') },
    { wave: 'snare', gain: 0.35, pattern: p('. . . . x . . . . . . . x . . x') },
    { wave: 'hat', gain: 0.3, pattern: p('x . x . x . x . x . x . x . x .') },
  ],
};

export const TRACKS: Record<string, Track> = {
  title: bright,
  ending: bright,
  map: stroll,
  narration: gentle,
  sq1: gentle,
  sq2: gentle,
  reward: fanfare,
  l1: bouncy,
  l4: bouncy,
  l5: bouncy,
  l2: quirky,
  l6: quirky,
  l3: tense,
  sq3: tense,
};
