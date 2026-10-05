/**
 * Level 1 simulation: girders, ladders, the frog and the beach balls.
 *
 * Pure logic (no DOM, no canvas) so it can be unit tested and playtested
 * headlessly. Units are world units of a fixed 720x400 world; y grows down.
 * The renderer in index.ts turns the events returned by `Sim.step` into
 * sound and particles.
 */

export const WORLD_W = 720;
export const WORLD_H = 400;

/** A girder: top surface runs from (x0, y0) to (x1, y1). */
export interface Floor {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Direction balls roll along it (downhill). 0 = no balls (the roof). */
  dir: -1 | 0 | 1;
}

export interface Ladder {
  x: number;
  /** Floor index at the bottom and at the top. */
  lower: number;
  upper: number;
  /** Broken ladders can't be climbed by the frog, but balls still roll down them. */
  broken?: boolean;
}

// Ground, four slanted girders (alternating slope, like Donkey Kong 25m) and
// the short rooftop where the doll stands. Balls are thrown onto F4 and zig-zag
// down: F4 right, F3 left, F2 right, F1 left, then the ground right into the toy box.
export const FLOORS: Floor[] = [
  { x0: 36, x1: 564, y0: 372, y1: 372, dir: 1 },
  { x0: 110, x1: 664, y0: 320, y1: 312, dir: -1 },
  { x0: 56, x1: 610, y0: 258, y1: 266, dir: 1 },
  { x0: 110, x1: 664, y0: 212, y1: 204, dir: -1 },
  { x0: 56, x1: 610, y0: 152, y1: 158, dir: 1 },
  { x0: 96, x1: 252, y0: 105, y1: 105, dir: 0 },
];
export const ROOF = 5;
/** Floors balls can roll on (everything below the roof). */
export const BALL_FLOORS = 5;

export const LADDERS: Ladder[] = [
  { x: 170, lower: 0, upper: 1 },
  { x: 440, lower: 0, upper: 1, broken: true },
  { x: 560, lower: 1, upper: 2 },
  { x: 360, lower: 1, upper: 2, broken: true },
  { x: 160, lower: 2, upper: 3 },
  { x: 270, lower: 2, upper: 3 },
  { x: 550, lower: 3, upper: 4 },
  { x: 400, lower: 3, upper: 4, broken: true },
  { x: 226, lower: 4, upper: 5 },
];

export const DOLL_X = 150;
export const START_X = 500;
/**
 * Toy box at the right end of the ground where balls disappear (the ground
 * ends at its left side). Kept left of x ~620 so the JUMP button never covers
 * it, even on the narrowest frames (iPhone SE, iPads at ~712 units wide).
 */
export const CHEST_X = 588;
export const CHEST_W = 46;
export const CHEST_H = 28;

export const FROG = {
  walk: 66,
  climb: 42,
  /**
   * Jump apex ~26 units (about one frog, so he never pops up through the
   * girder above), ~0.72 s in the air (floaty enough for thumbs).
   */
  jumpV: 144,
  gravity: 400,
  /** Fraction of walk speed the player can steer while airborne. */
  airControl: 0.3,
  /** Hitbox, relative to the feet (bottom-centre); the toes don't count. */
  hitW: 10,
  hitH: 16,
  hitLift: 5,
  /** How close to a ladder's x the frog can grab it. */
  grabTol: 12,
  /** Distance from the doll that counts as "made it". */
  winDist: 32,
};

export const BALL = {
  r: 10,
  hitR: 6,
  gravity: 700,
  ladderSpeed: 78,
  ladderChance: 0.25,
  /** Balls don't take a ladder when the frog is this close to its foot. */
  ladderClear: 34,
  maxBalls: 8,
};

export function surfaceY(f: Floor, x: number): number {
  const t = (x - f.x0) / (f.x1 - f.x0);
  return f.y0 + (f.y1 - f.y0) * t;
}

export function onFloor(f: Floor, x: number): boolean {
  return x >= f.x0 && x <= f.x1;
}

/** Rolling speed and throw interval as the level heats up (t = seconds this life). */
export function rollSpeed(t: number): number {
  return 92 + Math.min(26, t * 0.45);
}
export function throwInterval(t: number): number {
  return Math.max(1.8, 3.0 - t * 0.024);
}

/**
 * A climbable ladder the frog can take from `floor` in direction `dir`
 * (up = ladder bottom is on this floor, down = ladder top is on this floor).
 */
export function findLadder(ladders: Ladder[], floor: number, x: number, dir: 'up' | 'down', tol = FROG.grabTol): Ladder | null {
  let best: Ladder | null = null;
  let bestD = tol;
  for (const l of ladders) {
    if (l.broken) continue;
    if ((dir === 'up' ? l.lower : l.upper) !== floor) continue;
    const d = Math.abs(l.x - x);
    if (d <= bestD) {
      best = l;
      bestD = d;
    }
  }
  return best;
}

/** Circle vs axis-aligned rectangle overlap. */
export function circleRect(cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number): boolean {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

/**
 * Which ball floor a falling ball lands on, given its bottom moved from
 * `prevBottom` to `newBottom` at `x`. Returns the highest floor crossed, or -1.
 */
export function landingFloor(floors: Floor[], x: number, prevBottom: number, newBottom: number, count = BALL_FLOORS): number {
  let best = -1;
  let bestY = Infinity;
  for (let i = 0; i < count; i++) {
    const f = floors[i];
    if (!onFloor(f, x)) continue;
    const y = surfaceY(f, x);
    if (prevBottom <= y + 0.01 && newBottom >= y && y < bestY) {
      best = i;
      bestY = y;
    }
  }
  return best;
}

/** Deterministic PRNG so tests and playtests are repeatable. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- entities

export type FrogState = 'walk' | 'climb' | 'jump' | 'hurt' | 'win';

export interface Frog {
  x: number;
  /** Feet (bottom-centre). */
  y: number;
  vx: number;
  vy: number;
  floor: number;
  state: FrogState;
  face: 1 | -1;
  ladder: Ladder | null;
  /** Horizontal speed locked in at take-off. */
  jumpVx: number;
  /** Distance walked / climbed, for animation. */
  walkDist: number;
  climbDist: number;
  /** Seconds of post-respawn invulnerability left. */
  safeT: number;
  /** Increments every jump; balls remember which jump scored them. */
  jumpId: number;
}

export type BallMode = 'fly' | 'roll' | 'ladder' | 'gone';

export interface Ball {
  id: number;
  x: number;
  /** Centre. */
  y: number;
  vx: number;
  vy: number;
  mode: BallMode;
  floor: number;
  dir: -1 | 0 | 1;
  /** Bounce height above the girder and its upward speed while rolling. */
  h: number;
  hv: number;
  rot: number;
  ladder: Ladder | null;
  /** Ball x minus frog x last frame, for jump-over scoring. */
  pdx: number;
  scoredJump: number;
  /** Squash on landing, 0..1, decays. */
  squash: number;
}

export interface SimInput {
  x: number;
  y: number;
  /** Jump pressed this frame. */
  jump: boolean;
}

export type SimEvent =
  | { type: 'jump'; x: number; y: number }
  | { type: 'land'; x: number; y: number }
  | { type: 'hop'; x: number; y: number }
  | { type: 'climbStart' }
  | { type: 'climbEnd'; floor: number }
  | { type: 'jumped'; x: number; y: number; points: number }
  | { type: 'hit'; x: number; y: number }
  | { type: 'windup' }
  | { type: 'throw'; x: number; y: number }
  | { type: 'bounce'; x: number; y: number; big: boolean }
  | { type: 'chest'; x: number; y: number }
  | { type: 'win'; x: number; y: number };

export interface SimOptions {
  seed?: number;
  /** Chuck Taylors multiplier for walking and climbing. */
  speed?: number;
}

/**
 * Where the doll releases a ball (just above her raised hands) and how hard:
 * a flat toss that clears the roof edge and lands on F4 around x 300-330.
 */
export const THROW = { x: DOLL_X + 6, y: FLOORS[ROOF].y0 - 50, vx: 260, vy: -60, spread: 30, windup: 0.55 };

export class Sim {
  frog!: Frog;
  balls: Ball[] = [];
  /** Seconds since the current life started (drives difficulty). */
  lifeT = 0;
  /** Countdown to the next windup. */
  nextThrow = 1.6;
  /** >0 while the doll is winding up a throw. */
  windupT = 0;
  score = 0;
  jumpedCount = 0;
  god = false;
  speed: number;
  /** Balls won't spawn while false (win/lose sequences, tests). */
  throwing = true;
  private rng: () => number;
  private nextId = 1;
  private events: SimEvent[] = [];

  constructor(opts: SimOptions = {}) {
    this.rng = mulberry32(opts.seed ?? 1);
    this.speed = opts.speed ?? 1;
    this.respawn();
  }

  /** Put the frog back at the start, clear balls, reset the difficulty ramp. */
  respawn(): void {
    const f = FLOORS[0];
    this.frog = {
      x: START_X,
      y: surfaceY(f, START_X),
      vx: 0,
      vy: 0,
      floor: 0,
      state: 'walk',
      face: -1,
      ladder: null,
      jumpVx: 0,
      walkDist: 0,
      climbDist: 0,
      safeT: 1.2,
      jumpId: 0,
    };
    this.balls = [];
    this.lifeT = 0;
    this.nextThrow = 1.6;
    this.windupT = 0;
  }

  /** Place the frog on the floor at or below (x, y). */
  teleport(x: number, y: number): void {
    let best = 0;
    let bestY = Infinity;
    for (let i = 0; i < FLOORS.length; i++) {
      const f = FLOORS[i];
      if (!onFloor(f, x)) continue;
      const sy = surfaceY(f, x);
      if (sy >= y - 1 && sy < bestY) {
        best = i;
        bestY = sy;
      }
    }
    this.place(best, x);
  }

  place(floor: number, x: number): void {
    const f = FLOORS[floor];
    const fr = this.frog;
    fr.floor = floor;
    fr.x = Math.max(f.x0 + 8, Math.min(f.x1 - 8, x));
    fr.y = surfaceY(f, fr.x);
    fr.state = 'walk';
    fr.ladder = null;
    fr.vx = fr.vy = 0;
  }

  /** Add a ball rolling on `floor` at `x` (tests / debug). */
  spawnRolling(floor: number, x: number): Ball {
    const f = FLOORS[floor];
    const b = this.newBall(x, surfaceY(f, x) - BALL.r);
    b.mode = 'roll';
    b.floor = floor;
    b.dir = f.dir;
    this.balls.push(b);
    return b;
  }

  private newBall(x: number, y: number): Ball {
    return {
      id: this.nextId++,
      x,
      y,
      vx: 0,
      vy: 0,
      mode: 'fly',
      floor: -1,
      dir: 0,
      h: 0,
      hv: 0,
      rot: 0,
      ladder: null,
      pdx: x - this.frog.x,
      scoredJump: -1,
      squash: 0,
    };
  }

  liveBalls(): number {
    let n = 0;
    for (const b of this.balls) if (b.mode !== 'gone') n++;
    return n;
  }

  step(dt: number, input: SimInput): SimEvent[] {
    this.events = [];
    const fr = this.frog;
    if (fr.state === 'hurt' || fr.state === 'win') return this.events;
    this.lifeT += dt;
    fr.safeT = Math.max(0, fr.safeT - dt);
    this.stepFrog(dt, input);
    this.stepDoll(dt);
    for (const b of this.balls) this.stepBall(b, dt);
    this.balls = this.balls.filter((b) => b.mode !== 'gone');
    this.checkContacts();
    return this.events;
  }

  // ---------------------------------------------------------------- frog
  private stepFrog(dt: number, input: SimInput): void {
    const fr = this.frog;
    const walk = FROG.walk * this.speed;
    const ix = input.x > 0.3 ? 1 : input.x < -0.3 ? -1 : 0;
    const iy = input.y > 0.5 ? 1 : input.y < -0.5 ? -1 : 0;

    if (fr.state === 'walk') {
      const f = FLOORS[fr.floor];
      if (iy !== 0) {
        const l = findLadder(LADDERS, fr.floor, fr.x, iy < 0 ? 'up' : 'down');
        if (l) {
          fr.state = 'climb';
          fr.ladder = l;
          fr.x = l.x;
          fr.vx = 0;
          this.events.push({ type: 'climbStart' });
          return;
        }
      }
      if (input.jump) {
        fr.state = 'jump';
        fr.vy = -FROG.jumpV;
        fr.jumpVx = ix * walk;
        fr.jumpId++;
        if (ix) fr.face = ix as 1 | -1;
        this.events.push({ type: 'jump', x: fr.x, y: fr.y });
        return;
      }
      fr.vx = ix * walk;
      if (ix) fr.face = ix as 1 | -1;
      const before = Math.floor(fr.walkDist / 22);
      fr.x = Math.max(f.x0 + 8, Math.min(f.x1 - 8, fr.x + fr.vx * dt));
      fr.y = surfaceY(f, fr.x);
      if (ix) fr.walkDist += walk * dt;
      if (Math.floor(fr.walkDist / 22) !== before) this.events.push({ type: 'hop', x: fr.x, y: fr.y });
      return;
    }

    if (fr.state === 'climb' && fr.ladder) {
      const l = fr.ladder;
      const top = surfaceY(FLOORS[l.upper], l.x);
      const bottom = surfaceY(FLOORS[l.lower], l.x);
      fr.y += iy * FROG.climb * this.speed * dt;
      if (iy) fr.climbDist += FROG.climb * this.speed * dt;
      if (fr.y <= top) this.leaveLadder(l.upper);
      else if (fr.y >= bottom) this.leaveLadder(l.lower);
      return;
    }

    if (fr.state === 'jump') {
      const f = FLOORS[fr.floor];
      fr.vx = fr.jumpVx + ix * walk * FROG.airControl;
      fr.x = Math.max(f.x0 + 8, Math.min(f.x1 - 8, fr.x + fr.vx * dt));
      fr.vy += FROG.gravity * dt;
      fr.y += fr.vy * dt;
      const ground = surfaceY(f, fr.x);
      if (fr.vy > 0 && fr.y >= ground) {
        fr.y = ground;
        fr.vy = 0;
        fr.state = 'walk';
        this.events.push({ type: 'land', x: fr.x, y: fr.y });
      }
    }
  }

  private leaveLadder(floor: number): void {
    const fr = this.frog;
    fr.floor = floor;
    fr.y = surfaceY(FLOORS[floor], fr.x);
    fr.state = 'walk';
    fr.ladder = null;
    this.events.push({ type: 'climbEnd', floor });
    if (floor === ROOF) this.checkWin();
  }

  private checkWin(): void {
    const fr = this.frog;
    if (fr.floor === ROOF && fr.state === 'walk' && Math.abs(fr.x - DOLL_X) <= FROG.winDist) {
      fr.state = 'win';
      fr.face = -1;
      this.events.push({ type: 'win', x: fr.x, y: fr.y });
    }
  }

  // ---------------------------------------------------------------- doll
  private stepDoll(dt: number): void {
    if (!this.throwing) return;
    if (this.windupT > 0) {
      this.windupT -= dt;
      if (this.windupT <= 0) this.release();
      return;
    }
    // the doll stops throwing once the frog has made it up to her roof
    if (this.frog.floor === ROOF) return;
    this.nextThrow -= dt;
    if (this.nextThrow <= 0 && this.liveBalls() < BALL.maxBalls) {
      this.windupT = THROW.windup;
      this.events.push({ type: 'windup' });
    }
  }

  private release(): void {
    const b = this.newBall(THROW.x, THROW.y);
    b.vx = THROW.vx + (this.rng() - 0.5) * THROW.spread;
    b.vy = THROW.vy;
    this.balls.push(b);
    this.events.push({ type: 'throw', x: b.x, y: b.y });
    this.nextThrow = throwInterval(this.lifeT) + (this.rng() - 0.5) * 0.5;
  }

  // ---------------------------------------------------------------- balls
  private stepBall(b: Ball, dt: number): void {
    b.squash = Math.max(0, b.squash - dt * 5);
    if (b.mode === 'fly') {
      b.vy += BALL.gravity * dt;
      const prevBottom = b.y + BALL.r;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += (b.vx * dt) / BALL.r;
      const i = landingFloor(FLOORS, b.x, prevBottom, b.y + BALL.r);
      if (i >= 0) this.landBall(b, i, b.vy);
      else if (b.y > WORLD_H + 40) b.mode = 'gone';
      return;
    }
    if (b.mode === 'ladder' && b.ladder) {
      const l = b.ladder;
      b.y += BALL.ladderSpeed * dt;
      const bottom = surfaceY(FLOORS[l.lower], l.x) - BALL.r;
      if (b.y >= bottom) this.landBall(b, l.lower, 120);
      return;
    }
    if (b.mode !== 'roll') return;
    const f = FLOORS[b.floor];
    const v = rollSpeed(this.lifeT);
    const nx = b.x + b.dir * v * dt;
    // small bounces after landing
    if (b.h > 0 || b.hv > 0) {
      b.hv -= BALL.gravity * dt;
      b.h += b.hv * dt;
      if (b.h <= 0) {
        b.h = 0;
        b.hv = -b.hv * 0.42;
        if (b.hv < 45) b.hv = 0;
        else b.squash = 0.6;
      }
    }
    // roll down a ladder sometimes (never onto a frog on it or waiting at its foot)
    if (b.h < 3) {
      for (const l of LADDERS) {
        if (l.upper !== b.floor) continue;
        if ((b.x - l.x) * (nx - l.x) > 0) continue;
        if (b.x === l.x) continue;
        if (this.frog.ladder === l) continue;
        if (this.frog.floor === l.lower && Math.abs(this.frog.x - l.x) < BALL.ladderClear) continue;
        if (this.rng() < BALL.ladderChance) {
          b.mode = 'ladder';
          b.ladder = l;
          b.x = l.x;
          b.h = b.hv = 0;
          return;
        }
      }
    }
    b.x = nx;
    b.rot += (b.dir * v * dt) / BALL.r;
    if (!onFloor(f, b.x)) {
      if (b.floor === 0) {
        b.mode = 'gone';
        this.events.push({ type: 'chest', x: b.x, y: b.y });
        return;
      }
      b.mode = 'fly';
      b.vx = b.dir * v * 0.55;
      b.vy = 0;
      b.y = surfaceY(f, b.dir > 0 ? f.x1 : f.x0) - BALL.r - b.h;
      b.h = b.hv = 0;
      return;
    }
    b.y = surfaceY(f, b.x) - BALL.r - b.h;
  }

  private landBall(b: Ball, floor: number, impact: number): void {
    const f = FLOORS[floor];
    b.mode = 'roll';
    b.floor = floor;
    b.dir = f.dir;
    b.ladder = null;
    b.y = surfaceY(f, b.x) - BALL.r;
    b.h = 0;
    b.hv = Math.min(190, Math.max(0, impact) * 0.34);
    b.squash = 1;
    this.events.push({ type: 'bounce', x: b.x, y: b.y + BALL.r, big: impact > 200 });
  }

  // ---------------------------------------------------------------- contacts
  /** The frog's hitbox in world units: [x, y, w, h]. */
  frogBox(): [number, number, number, number] {
    const fr = this.frog;
    return [fr.x - FROG.hitW / 2, fr.y - FROG.hitLift - FROG.hitH, FROG.hitW, FROG.hitH];
  }

  private checkContacts(): void {
    const fr = this.frog;
    if (fr.state === 'win') return;
    const [rx, ry, rw, rh] = this.frogBox();
    for (const b of this.balls) {
      const dx = b.x - fr.x;
      if (circleRect(b.x, b.y, BALL.hitR, rx, ry, rw, rh)) {
        if (!this.god && fr.safeT <= 0) {
          fr.state = 'hurt';
          fr.ladder = null;
          this.events.push({ type: 'hit', x: fr.x, y: fr.y - FROG.hitH / 2 });
          return;
        }
      } else if (
        fr.state === 'jump' &&
        b.mode === 'roll' &&
        b.floor === fr.floor &&
        b.scoredJump !== fr.jumpId &&
        dx * b.pdx <= 0 &&
        b.pdx !== 0
      ) {
        b.scoredJump = fr.jumpId;
        this.score += 100;
        this.jumpedCount++;
        this.events.push({ type: 'jumped', x: fr.x, y: fr.y - 34, points: 100 });
      }
      b.pdx = dx === 0 ? b.pdx : dx;
    }
    this.checkWin();
  }
}
