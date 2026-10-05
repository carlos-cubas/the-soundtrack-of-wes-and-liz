/**
 * Level 5 dodgeball simulation: round plans, ball flight and hit tests.
 *
 * Pure (no DOM) so the round math is unit-tested and the difficulty is
 * playtested by a bot in tests/l5-sim.test.ts. Units are virtual stage
 * units (400 tall), time in seconds.
 */

export const ROUNDS = 10;
/** Seconds over which a round's throws are spread. */
export const SPAWN_WINDOW = 4.2;
/** A round lasts at least this long (the last balls still have to fly). */
export const ROUND_MIN = 6;
/** Breather between rounds (the "Round 4!" banner). */
export const BREATHER = 1;
export const FIRST_BREATHER = 1.6;

/** Drawn radius of a basketball. */
export const BALL_R = 13;
/** Hitboxes are a little smaller than the art so near misses feel fair. */
export const BALL_HIT_R = 10;
export const LIZ_HIT_R = 12;
export const CONTACT = BALL_HIT_R + LIZ_HIT_R;
/** A pass this close (beyond contact) counts as a near miss. */
export const NEAR_MISS = 15;
/** Liz's top speed at full stick, before the Chuck Taylors multiplier. */
export const LIZ_SPEED = 250;
/** Distance between the two balls of a 'pair' throw. */
export const PAIR_GAP = 96;
/** Spacing of the three balls in a 'wall' (too tight to slip between). */
export const WALL_GAP = 36;

/**
 * Mouse steering: Liz heads for the cursor at full speed, easing off over the
 * last FOLLOW_RAMP units so she settles on it instead of jittering.
 */
export const FOLLOW_DEAD = 4;
export const FOLLOW_RAMP = 22;

export function followAxis(lx: number, ly: number, tx: number, ty: number): { x: number; y: number } {
  const dx = tx - lx;
  const dy = ty - ly;
  const d = Math.hypot(dx, dy);
  if (d <= FOLLOW_DEAD) return { x: 0, y: 0 };
  const k = Math.min(1, (d - FOLLOW_DEAD) / FOLLOW_RAMP) / d;
  return { x: dx * k, y: dy * k };
}

export const ballCount = (r: number) => 3 + r;
export const roundSpeed = (r: number) => 160 + 32 * r;
/** Warning before a ball flies: 0.8 s in round 1 down to 0.6 s in round 10. */
export const warnTime = (r: number) => 0.8 - (0.2 * (r - 1)) / (ROUNDS - 1);

/**
 * lane  = a random line across the court
 * aimed = at Liz (from round 6 the throwers lead her if she is running)
 * cross = two at once from different sides, crossing on Liz
 * pair  = two parallel, either side of Liz or one on her
 * wall  = three side by side: run, don't squeeze between
 */
export type ThrowKind = 'lane' | 'aimed' | 'cross' | 'pair' | 'wall';
export const THROW_KINDS: ThrowKind[] = ['lane', 'aimed', 'cross', 'pair', 'wall'];
export const BALLS_PER: Record<ThrowKind, number> = { lane: 1, aimed: 1, cross: 2, pair: 2, wall: 3 };
export interface Throw {
  t: number;
  kind: ThrowKind;
}

// Throws per round, tuned with the bot in tests/l5-sim.test.ts. Each row
// adds up to 3 + r balls.
//                   lane aimed cross pair wall
const MIX: number[][] = [
  /* round 1 */ [4, 0, 0, 0, 0],
  /* round 2 */ [4, 1, 0, 0, 0],
  /* round 3 */ [5, 1, 0, 0, 0],
  /* round 4 */ [6, 1, 0, 0, 0],
  /* round 5 */ [4, 2, 1, 0, 0],
  /* round 6 */ [5, 2, 1, 0, 0],
  /* round 7 */ [3, 3, 1, 1, 0],
  /* round 8 */ [2, 3, 2, 1, 0],
  /* round 9 */ [2, 3, 2, 0, 1],
  /* round 10 */ [1, 3, 2, 1, 1],
];

export function roundMix(r: number): Record<ThrowKind, number> {
  const row = MIX[Math.max(1, Math.min(ROUNDS, r)) - 1];
  return { lane: row[0], aimed: row[1], cross: row[2], pair: row[3], wall: row[4] };
}

export const ballsIn = (mix: Record<ThrowKind, number>) => THROW_KINDS.reduce((n, k) => n + mix[k] * BALLS_PER[k], 0);

/** How far ahead aimed throws lead a running Liz (0 = at her feet). */
export const leadFrac = (r: number) => (r >= 8 ? 0.7 : r >= 6 ? 0.45 : 0);

export type Rng = () => number;

/** Small seeded PRNG (mulberry32). */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The throws of round `r`, shuffled and spread over the spawn window. */
export function planRound(r: number, rand: Rng): Throw[] {
  const mix = roundMix(r);
  const kinds: ThrowKind[] = [];
  for (const k of THROW_KINDS) for (let i = 0; i < mix[k]; i++) kinds.push(k);
  // The first throw of a round is always a plain lane: a beat to settle in.
  for (let i = kinds.length - 1; i > 1; i--) {
    const j = 1 + Math.floor(rand() * i);
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const n = kinds.length;
  const slot = SPAWN_WINDOW / n;
  return kinds.map((kind, i) => ({ kind, t: Math.max(0.05, (i + 0.5 + (rand() - 0.5) * 0.5) * slot) }));
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Arena {
  /** Stage size: balls enter and leave beyond it. */
  W: number;
  H: number;
  /** Where Liz can move. */
  liz: Rect;
  /** Visible frame for the warning arrows (inside notch and HUD). */
  frame: Rect;
}

export interface Ball {
  kind: ThrowKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Start and end of the straight path, just outside the stage. */
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  /** Where the path enters the visible frame (warning arrow). */
  ax: number;
  ay: number;
  /** Seconds of warning left; the ball flies once it reaches 0. */
  warn: number;
  warnTotal: number;
  flying: boolean;
  /** Seconds since launch. */
  age: number;
  done: boolean;
  spin: number;
  minD: number;
  near: boolean;
  /** Deflected off Liz. */
  bounced: boolean;
  /** Left over from a cleared round: harmless, just flying off. */
  spent: boolean;
}

/** Slab intersection of the line p + t·d with a rect: [tmin, tmax]. */
function clipLine(px: number, py: number, dx: number, dy: number, r: Rect): [number, number] {
  let t0 = -Infinity;
  let t1 = Infinity;
  const slab = (p: number, d: number, lo: number, hi: number) => {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) {
        t0 = Infinity;
        t1 = -Infinity;
      }
      return;
    }
    let a = (lo - p) / d;
    let b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
  };
  slab(px, dx, r.x0, r.x1);
  slab(py, dy, r.y0, r.y1);
  return [t0, t1];
}

const SIDE_DIR: Array<[number, number]> = [
  [1, 0], // from the left
  [-1, 0], // from the right
  [0, 1], // from the top
  [0, -1], // from the bottom
];

/** Make a ball that passes through (qx, qy) heading along `ang`. */
export function makeBall(arena: Arena, kind: ThrowKind, qx: number, qy: number, ang: number, speed: number, warn: number): Ball {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const m = BALL_R + 8;
  const [t0, t1] = clipLine(qx, qy, dx, dy, { x0: -m, y0: -m, x1: arena.W + m, y1: arena.H + m });
  const sx = qx + dx * t0;
  const sy = qy + dy * t0;
  const [f0] = clipLine(sx, sy, dx, dy, arena.frame);
  const fa = Number.isFinite(f0) && f0 > 0 ? f0 : 0;
  return {
    kind,
    x: sx,
    y: sy,
    vx: dx * speed,
    vy: dy * speed,
    sx,
    sy,
    ex: qx + dx * t1,
    ey: qy + dy * t1,
    ax: sx + dx * fa,
    ay: sy + dy * fa,
    warn,
    warnTotal: warn,
    flying: false,
    age: 0,
    done: false,
    spin: 0,
    minD: Infinity,
    near: false,
    bounced: false,
    spent: false,
  };
}

/** Pick a side to throw from, favouring the sides far from Liz. */
function pickSide(arena: Arena, lx: number, ly: number, rand: Rng, not = -1): number {
  const d = [lx, arena.W - lx, ly, arena.H - ly].map((v, i) => (i === not ? 0 : Math.max(20, v) ** 1.5));
  let r = rand() * d.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 4; i++) {
    r -= d[i];
    if (r <= 0) return i;
  }
  return 0;
}

const MAX_TILT = 0.55; // about 32 degrees off the side's normal

/**
 * The balls one throw launches, given where Liz is and how she is moving
 * (`lvx, lvy`, for throws that lead her).
 */
export function spawnThrow(arena: Arena, kind: ThrowKind, r: number, lx: number, ly: number, rand: Rng, lvx = 0, lvy = 0): Ball[] {
  const speed = roundSpeed(r);
  const warn = warnTime(r);
  const a = arena.liz;
  const tiltAng = (side: number, tilt = MAX_TILT) => {
    const [dx, dy] = SIDE_DIR[side];
    return Math.atan2(dy, dx) + (rand() * 2 - 1) * tilt;
  };
  const jitter = () => (rand() * 2 - 1) * 6;
  switch (kind) {
    case 'lane': {
      const qx = a.x0 + (0.08 + rand() * 0.84) * (a.x1 - a.x0);
      const qy = a.y0 + (0.08 + rand() * 0.84) * (a.y1 - a.y0);
      const u = rand();
      const side = u < 0.32 ? 0 : u < 0.64 ? 1 : u < 0.82 ? 2 : 3;
      return [makeBall(arena, kind, qx, qy, tiltAng(side), speed * (0.92 + rand() * 0.16), warn)];
    }
    case 'aimed': {
      const side = pickSide(arena, lx, ly, rand);
      // Lead her by the time the ball needs to reach her (about).
      const lead = leadFrac(r) * (warn + 300 / speed);
      const qx = Math.min(a.x1, Math.max(a.x0, lx + lvx * lead));
      const qy = Math.min(a.y1, Math.max(a.y0, ly + lvy * lead));
      return [makeBall(arena, kind, qx + jitter(), qy + jitter(), tiltAng(side), speed, warn)];
    }
    case 'cross': {
      const s1 = pickSide(arena, lx, ly, rand);
      const s2 = pickSide(arena, lx, ly, rand, s1);
      const qx = lx + jitter();
      const qy = ly + jitter();
      return [makeBall(arena, kind, qx, qy, tiltAng(s1), speed, warn), makeBall(arena, kind, qx, qy, tiltAng(s2), speed, warn)];
    }
    case 'pair': {
      const ang = tiltAng(pickSide(arena, lx, ly, rand));
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      // Either straddle Liz (stay calm!) or put one ball on her and one beside.
      const offs = rand() < 0.5 ? [-PAIR_GAP / 2, PAIR_GAP / 2] : rand() < 0.5 ? [0, PAIR_GAP] : [0, -PAIR_GAP];
      return offs.map((o) => makeBall(arena, kind, lx + nx * o, ly + ny * o, ang, speed, warn));
    }
    case 'wall': {
      // a flatter tilt reads better for three abreast
      const ang = tiltAng(pickSide(arena, lx, ly, rand), MAX_TILT * 0.5);
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      const shift = (rand() * 2 - 1) * WALL_GAP * 0.5;
      return [-WALL_GAP, 0, WALL_GAP].map((o) => makeBall(arena, kind, lx + nx * (o + shift), ly + ny * (o + shift), ang, speed, warn));
    }
  }
}

export type SimEvent = 'breather' | 'play' | 'throw' | 'launch' | 'near' | 'hit' | 'roundClear' | 'allClear';

export class DodgeSim {
  round = 1;
  phase: 'breather' | 'play' | 'hit' | 'done' = 'breather';
  /** Seconds in the current phase. */
  t = 0;
  breatherLen = FIRST_BREATHER;
  balls: Ball[] = [];
  plan: Throw[] = [];
  next = 0;
  liz = { x: 0, y: 0, vx: 0, vy: 0 };
  /** Debug: balls pass through Liz. */
  god = false;
  /** Events raised by the last `step`, read by the game for juice. */
  events: SimEvent[] = [];
  lastHit: Ball | null = null;
  lastNear: Ball | null = null;
  private rand: Rng;

  constructor(public arena: Arena, seed = 1) {
    this.rand = rng(seed);
    this.liz.x = (arena.liz.x0 + arena.liz.x1) / 2;
    this.liz.y = (arena.liz.y0 + arena.liz.y1) / 2;
    this.beginRound(1);
  }

  setArena(a: Arena): void {
    this.arena = a;
    this.liz.x = Math.min(a.liz.x1, Math.max(a.liz.x0, this.liz.x));
    this.liz.y = Math.min(a.liz.y1, Math.max(a.liz.y0, this.liz.y));
  }

  /**
   * Start round `r` with its breather. Balls still in the air are already
   * past Liz (see `passed`); they fly off harmlessly.
   */
  beginRound(r: number): void {
    this.round = Math.max(1, Math.min(ROUNDS, r));
    this.phase = 'breather';
    this.t = 0;
    this.breatherLen = this.round === 1 ? FIRST_BREATHER : BREATHER;
    this.balls = this.balls.filter((b) => b.flying && !b.done);
    for (const b of this.balls) b.spent = true;
    this.plan = [];
    this.next = 0;
    this.events.push('breather');
  }

  /** Advance by dt. `ax, ay` is the movement input in [-1, 1]. */
  step(dt: number, ax: number, ay: number, speedMul = 1): void {
    this.events.length = 0;
    this.lastNear = null;
    const L = this.liz;
    if (this.phase === 'hit' || this.phase === 'done') {
      ax = 0;
      ay = 0;
    }
    const len = Math.hypot(ax, ay);
    if (len > 1) {
      ax /= len;
      ay /= len;
    }
    const sp = LIZ_SPEED * speedMul;
    const a = this.arena.liz;
    const nx = Math.min(a.x1, Math.max(a.x0, L.x + ax * sp * dt));
    const ny = Math.min(a.y1, Math.max(a.y0, L.y + ay * sp * dt));
    L.vx = dt > 0 ? (nx - L.x) / dt : 0;
    L.vy = dt > 0 ? (ny - L.y) / dt : 0;
    L.x = nx;
    L.y = ny;

    this.t += dt;
    if (this.phase === 'breather') {
      if (this.t >= this.breatherLen) {
        this.phase = 'play';
        this.t = 0;
        this.plan = planRound(this.round, this.rand);
        this.next = 0;
        this.events.push('play');
      }
      return;
    }

    if (this.phase === 'play') {
      while (this.next < this.plan.length && this.plan[this.next].t <= this.t) {
        const th = this.plan[this.next++];
        this.balls.push(...spawnThrow(this.arena, th.kind, this.round, L.x, L.y, this.rand, L.vx, L.vy));
        this.events.push('throw');
      }
    }

    this.stepBalls(dt);

    if (this.phase === 'play' && this.next >= this.plan.length && this.t >= ROUND_MIN && this.balls.every((b) => b.done || this.passed(b))) {
      if (this.round >= ROUNDS) {
        this.phase = 'done';
        this.events.push('allClear');
      } else {
        this.events.push('roundClear');
        this.beginRound(this.round + 1);
      }
    }
  }

  /** A flying ball heading away from Liz and well clear of her. */
  passed(b: Ball): boolean {
    if (!b.flying || b.spent) return b.spent;
    const dx = b.x - this.liz.x;
    const dy = b.y - this.liz.y;
    return dx * b.vx + dy * b.vy > 0 && Math.hypot(dx, dy) > CONTACT + 60;
  }

  private stepBalls(dt: number): void {
    const L = this.liz;
    const { W, H } = this.arena;
    const m = BALL_R + 10;
    for (const b of this.balls) {
      if (b.done) continue;
      let fly = dt;
      if (!b.flying) {
        b.warn -= dt;
        if (b.warn > 0) continue;
        b.flying = true;
        fly = -b.warn;
        b.warn = 0;
        this.events.push('launch');
      }
      b.age += fly;
      b.x += b.vx * fly;
      b.y += b.vy * fly;
      b.spin += (Math.hypot(b.vx, b.vy) / BALL_R) * fly * (b.vx >= 0 ? 1 : -1);
      if (b.age > 0.15 && (b.x < -m || b.x > W + m || b.y < -m || b.y > H + m)) {
        b.done = true;
        continue;
      }
      if (this.phase !== 'play' || b.bounced || b.spent) continue;
      const dx = b.x - L.x;
      const dy = b.y - L.y;
      const d = Math.hypot(dx, dy);
      b.minD = Math.min(b.minD, d);
      if (d < CONTACT && !this.god) {
        this.phase = 'hit';
        this.t = 0;
        this.lastHit = b;
        // Bounce off her (the nose): reflect and lose most of the pace.
        const n = d > 0.01 ? [dx / d, dy / d] : [1, 0];
        const vn = b.vx * n[0] + b.vy * n[1];
        if (vn < 0) {
          b.vx -= 2 * vn * n[0];
          b.vy -= 2 * vn * n[1];
        }
        b.vx *= 0.45;
        b.vy *= 0.45;
        b.bounced = true;
        this.events.push('hit');
        continue;
      }
      // Moving away from Liz after passing close: a near miss.
      if (!b.near && b.minD < CONTACT + NEAR_MISS && dx * b.vx + dy * b.vy > 0) {
        b.near = true;
        this.lastNear = b;
        this.events.push('near');
      }
    }
  }

  get roundsCleared(): number {
    return this.phase === 'done' ? ROUNDS : this.round - 1;
  }
}
