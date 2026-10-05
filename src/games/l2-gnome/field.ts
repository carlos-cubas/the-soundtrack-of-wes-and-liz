/**
 * Level 2 rules, kept free of rendering so they can be unit tested.
 *
 * Nine holes. Gnomes rise, hold, and sink back. Tapping a visible gnome
 * grabs it; a gnome that sinks back un-grabbed got away. Every grab makes
 * the gnomes faster and, from the fourth grab on, two can pop up at once.
 */

export const GOAL = 10;
export const MAX_ESCAPES = 5;
export const HOLES = 9;
/** Seconds a gnome takes to rise out of / sink into its hole. */
export const RISE = 0.16;
export const SINK = 0.22;

/**
 * How the timing adapts to the input device. A finger lands where the eye
 * looks; a mouse or trackpad cursor has to travel there first (Fitts's
 * law: about 0.25 s + 0.15 s·log2(1 + D/W)), so on those the gnomes stay
 * up longer, come a little less often and can be clicked a touch earlier
 * and later. The rules stay the deck's: 10 grabs win, 5 escapes lose, and
 * every grab still speeds things up.
 */
export interface Pace {
  /** Multiplies the time a gnome stays out of the ground. */
  up: number;
  /** Multiplies the pause between spawns. */
  gap: number;
  /** A gnome is grabbable while more than this fraction of it shows. */
  floor: number;
}
export const TOUCH_PACE: Pace = { up: 1, gap: 1, floor: 0.25 };
export const MOUSE_PACE: Pace = { up: 1.6, gap: 1.25, floor: 0.12 };

/** Time a gnome is out of the ground (rise + hold), shrinking 8% per grab. */
export function upTime(grabbed: number, pace: Pace = TOUCH_PACE): number {
  return Math.max(0.55, 1.6 * Math.pow(0.92, grabbed)) * pace.up;
}

/** Pause between spawns, shrinking with every grab. */
export function spawnGap(grabbed: number, pace: Pace = TOUCH_PACE): number {
  return Math.max(0.28, 0.8 * Math.pow(0.9, grabbed)) * pace.gap;
}

/** Chance that a spawn brings a second gnome along. */
export function doubleChance(grabbed: number): number {
  return grabbed >= 4 ? Math.min(0.6, 0.3 + 0.05 * (grabbed - 4)) : 0;
}

export function maxActive(grabbed: number): number {
  return grabbed >= 4 ? 2 : 1;
}

export type HoleState = 'empty' | 'rising' | 'up' | 'sinking';

export interface Hole {
  state: HoleState;
  /** Seconds spent in the current state. */
  t: number;
  /** Hold time for the current gnome (after rising). */
  hold: number;
  /** Cosmetic variant for the current gnome. */
  variant: number;
}

export type FieldEvent =
  | { type: 'spawn'; hole: number }
  | { type: 'grab'; hole: number; rise: number }
  | { type: 'escape'; hole: number }
  | { type: 'win'; hole: number }
  | { type: 'lose'; hole: number };

export class GnomeField {
  holes: Hole[] = Array.from({ length: HOLES }, () => ({ state: 'empty' as HoleState, t: 0, hold: 0, variant: 0 }));
  grabbed = 0;
  escapes = 0;
  over: 'win' | 'lose' | null = null;
  events: FieldEvent[] = [];
  /** Timing for the current input device; applies from the next gnome on. */
  pace: Pace = TOUCH_PACE;
  private spawnIn = 0.6;
  private lastHole = -1;

  constructor(private rng: () => number = Math.random) {}

  get active(): number {
    let n = 0;
    for (const h of this.holes) if (h.state !== 'empty') n++;
    return n;
  }

  /** How far a hole's gnome is out of the ground, 0..1. */
  rise(i: number): number {
    const h = this.holes[i];
    switch (h.state) {
      case 'rising':
        return Math.min(1, h.t / RISE);
      case 'up':
        return 1;
      case 'sinking':
        return Math.max(0, 1 - h.t / SINK);
      default:
        return 0;
    }
  }

  /** A gnome can be grabbed while at least a quarter of it shows. */
  grabbable(i: number): boolean {
    return this.holes[i].state !== 'empty' && this.rise(i) > this.pace.floor;
  }

  update(dt: number): void {
    if (this.over) {
      // after the end, visible gnomes just finish sinking; nothing counts
      for (let i = 0; i < HOLES; i++) {
        const h = this.holes[i];
        if (h.state === 'empty') continue;
        if (h.state !== 'sinking') {
          h.t = (1 - this.rise(i)) * SINK;
          h.state = 'sinking';
        }
        h.t += dt;
        if (h.t >= SINK) {
          h.state = 'empty';
          h.t = 0;
        }
      }
      return;
    }
    for (let i = 0; i < HOLES; i++) {
      const h = this.holes[i];
      if (h.state === 'empty') continue;
      h.t += dt;
      if (h.state === 'rising' && h.t >= RISE) {
        h.state = 'up';
        h.t -= RISE;
      }
      if (h.state === 'up' && h.t >= h.hold) {
        h.state = 'sinking';
        h.t -= h.hold;
      }
      if (h.state === 'sinking' && h.t >= SINK) {
        h.state = 'empty';
        h.t = 0;
        this.escapes++;
        this.events.push({ type: 'escape', hole: i });
        this.spawnIn = Math.max(this.spawnIn, spawnGap(this.grabbed, this.pace) * 0.5);
        if (this.escapes >= MAX_ESCAPES) {
          this.over = 'lose';
          this.events.push({ type: 'lose', hole: i });
          return;
        }
      }
    }
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      if (this.active < maxActive(this.grabbed)) {
        this.spawn();
        if (this.active < maxActive(this.grabbed) && this.rng() < doubleChance(this.grabbed)) this.spawn();
        this.spawnIn = spawnGap(this.grabbed, this.pace) * (0.8 + this.rng() * 0.4);
      } else {
        this.spawnIn = 0;
      }
    }
  }

  private spawn(): void {
    const free: number[] = [];
    for (let i = 0; i < HOLES; i++) if (this.holes[i].state === 'empty' && i !== this.lastHole) free.push(i);
    if (!free.length) return;
    const i = free[Math.floor(this.rng() * free.length)];
    const h = this.holes[i];
    h.state = 'rising';
    h.t = 0;
    h.hold = Math.max(0.15, upTime(this.grabbed, this.pace) - RISE);
    h.variant = Math.floor(this.rng() * 3);
    this.lastHole = i;
    this.events.push({ type: 'spawn', hole: i });
  }

  /** Try to grab the gnome in hole `i`. Returns true on success. */
  grab(i: number): boolean {
    if (this.over || !this.grabbable(i)) return false;
    const rise = this.rise(i);
    const h = this.holes[i];
    h.state = 'empty';
    h.t = 0;
    this.grabbed++;
    this.events.push({ type: 'grab', hole: i, rise });
    this.spawnIn = Math.max(this.spawnIn, spawnGap(this.grabbed, this.pace) * 0.5);
    if (this.grabbed >= GOAL) {
      this.over = 'win';
      this.events.push({ type: 'win', hole: i });
      // the rest dive back underground without counting as escapes
      for (let j = 0; j < HOLES; j++) {
        const o = this.holes[j];
        if (o.state === 'empty') continue;
        o.t = (1 - this.rise(j)) * SINK;
        o.state = 'sinking';
      }
    }
    return true;
  }

  /** Drain queued events. */
  drain(): FieldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
