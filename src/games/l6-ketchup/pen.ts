/**
 * The ketchup bottle, held high over the napkin (pure, unit-tested).
 *
 * The bottle follows the finger with a little smoothing. While squeezed it
 * lets out a drop every step; each drop lands LATENCY seconds later, a few
 * units off from where it was aimed (wobble from the height). Consecutive
 * drops of one squeeze join into a line; holding still pools a fat blob.
 * Every unit of line costs ketchup, and the bottle runs dry.
 */

export const LATENCY = 0.21;
/** Bottle follow time constant (s). */
export const SMOOTH = 0.045;
/** A squeeze takes a moment before ketchup comes out. */
export const SQUEEZE_DELAY = 0.07;
/** Half-width of a ketchup line, and the largest a held blob grows. */
export const LINE_R = 3.8;
export const POOL_MAX = 7.5;
/** Ketchup a held, unmoving squeeze uses per second (in line units). */
export const POOL_COST = 30;
/** Below this speed (units/s) the squeeze counts as held still. */
const POOL_SPEED = 40;
/** Drops further apart than this land as separate blobs (a flick). */
const JOIN = 40;

export interface Drop {
  /** Where it will land. */
  x: number;
  y: number;
  r: number;
  stroke: number;
  /** Where it left the nozzle, and when. */
  ex: number;
  ey: number;
  et: number;
  land: number;
}

/** A piece of line that just landed (a dot when both ends match). */
export interface Splat {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
}

/** Ketchup budget for a target of `targetLen` units of line. */
export const budgetFor = (targetLen: number) => targetLen * 1.75 + 160;

export class KetchupPen {
  aimX = 0;
  aimY = 0;
  vx = 0;
  vy = 0;
  down = false;
  held = 0;
  /** Units of line left, out of `capacity`. */
  left: number;
  flying: Drop[] = [];
  /** Splats that landed during the last `step`. */
  landed: Splat[] = [];
  t = 0;
  private stroke = 0;
  private lastEmit: { x: number; y: number } | null = null;
  private lastLand: { x: number; y: number; stroke: number } | null = null;
  private pool = LINE_R;
  private ph: number[];
  private seed: number;

  constructor(public capacity: number, seed = 1, x = 0, y = 0) {
    this.left = capacity;
    this.seed = seed >>> 0 || 1;
    this.ph = [this.rand() * 6.28, this.rand() * 6.28, this.rand() * 6.28, this.rand() * 6.28];
    this.aimX = x;
    this.aimY = y;
  }

  private rand(): number {
    // xorshift32: deterministic for tests
    let s = this.seed;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.seed = s >>> 0;
    return this.seed / 4294967296;
  }

  get fraction(): number {
    return Math.max(0, this.left / this.capacity);
  }

  get empty(): boolean {
    return this.left <= 0;
  }

  /** Is ketchup coming out right now? */
  get squeezing(): boolean {
    return this.down && this.held >= SQUEEZE_DELAY && !this.empty;
  }

  /** Wobble of the stream on its way down, a few units at most. */
  wobble(t: number): [number, number] {
    const p = this.ph;
    return [2.3 * Math.sin(1.9 * t + p[0]) + 1.2 * Math.sin(4.7 * t + p[1]), 2.3 * Math.sin(1.6 * t + p[2]) + 1.2 * Math.sin(4.1 * t + p[3])];
  }

  /** End the current squeeze (another finger or the Pencil takes over). */
  lift(): void {
    this.down = false;
  }

  /** Drop ketchup still in the air, e.g. squeezed by a palm the Pencil replaced. */
  cancelFlying(): void {
    this.flying.length = 0;
    this.lastLand = null;
  }

  /** Refill for the next drawing. */
  reset(capacity: number): void {
    this.capacity = capacity;
    this.left = capacity;
    this.flying.length = 0;
    this.landed.length = 0;
    this.lastEmit = null;
    this.lastLand = null;
    this.down = false;
    this.held = 0;
  }

  /** Advance by dt with the finger at (fx, fy) if `fingerDown`. */
  step(dt: number, fingerDown: boolean, fx: number, fy: number): void {
    this.t += dt;
    this.landed.length = 0;
    const px = this.aimX;
    const py = this.aimY;
    if (fingerDown && !this.down) {
      // a new squeeze: the bottle is already where the finger landed
      this.down = true;
      this.held = 0;
      this.stroke++;
      this.aimX = fx;
      this.aimY = fy;
      this.lastEmit = null;
      this.pool = LINE_R;
    } else if (!fingerDown && this.down) {
      this.down = false;
    }
    if (this.down) {
      const k = 1 - Math.exp(-dt / SMOOTH);
      this.aimX += (fx - this.aimX) * k;
      this.aimY += (fy - this.aimY) * k;
      this.held += dt;
    }
    if (dt > 0) {
      this.vx = (this.aimX - px) / dt;
      this.vy = (this.aimY - py) / dt;
    }

    if (this.squeezing) {
      const moved = this.lastEmit ? Math.hypot(this.aimX - this.lastEmit.x, this.aimY - this.lastEmit.y) : 0;
      // Held (nearly) still, the ketchup pools into a growing blob and that
      // costs ketchup too; on the move it is spread along the line instead.
      const still = Math.max(0, 1 - moved / (POOL_SPEED * dt));
      if (still > 0.5) this.pool = Math.min(POOL_MAX, this.pool + dt * 7);
      else this.pool = Math.max(LINE_R, this.pool - moved * 0.35);
      this.left -= moved + POOL_COST * dt * still;
      const [wx, wy] = this.wobble(this.t);
      this.flying.push({
        x: this.aimX + wx + (this.rand() - 0.5),
        y: this.aimY + wy + (this.rand() - 0.5),
        r: this.pool,
        stroke: this.stroke,
        ex: this.aimX,
        ey: this.aimY,
        et: this.t,
        land: this.t + LATENCY + this.rand() * 0.03,
      });
      this.lastEmit = { x: this.aimX, y: this.aimY };
    }

    // drops are emitted in order, so the landed ones are at the front
    let n = 0;
    while (n < this.flying.length && this.flying[n].land <= this.t) n++;
    for (let i = 0; i < n; i++) {
      const d = this.flying[i];
      const l = this.lastLand;
      if (l && l.stroke === d.stroke && Math.hypot(d.x - l.x, d.y - l.y) < JOIN) {
        this.landed.push({ x0: l.x, y0: l.y, x1: d.x, y1: d.y, r: d.r });
      } else {
        this.landed.push({ x0: d.x, y0: d.y, x1: d.x, y1: d.y, r: d.r });
      }
      this.lastLand = { x: d.x, y: d.y, stroke: d.stroke };
    }
    if (n) this.flying.splice(0, n);
  }
}
