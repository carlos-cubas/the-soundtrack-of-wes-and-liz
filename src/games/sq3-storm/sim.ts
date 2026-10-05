/**
 * Side Quest 3 "The Moldy Car": the storm-dash rules as plain data, with no
 * canvas or DOM, so the fairness rules (strike scheduling, jumpable obstacle
 * spacing) can be unit tested and bot-played in node.
 *
 * World units match the stage's virtual units (400 tall). x grows to the
 * right; Wes runs LEFT from his porch to Liz's car. `h` is Wes's height above
 * the lawn, positive up.
 */
import type { ItemId } from '../../data/story';

export const WORLD_W = 3700;
/** Wes starts on his porch at the right end of the yards. */
export const START_X = 3400;
/** Liz's car (facing left) spans [CAR_X, CAR_X + CAR_W] on her driveway. */
export const CAR_X = 340;
export const CAR_W = 220;
/** Wes reaches the car when his x drops to ARRIVE_X, then cranks at CRANK_X. */
export const ARRIVE_X = 495;
export const CRANK_X = 483;

export const RUN = 165;
export const GRAVITY = 1750;
export const JUMP_V = 720;
export const ACCEL_GROUND = 1500;
export const ACCEL_AIR = 1000;
/** Letting go of the d-pad mid-jump keeps most of the momentum. */
export const AIR_DRAG = 30;
/** Half the width of Wes's hitbox, and its height. */
export const HW = 14;
export const BODY_H = 80;
/** Obstacle hitboxes are shrunk by this much on each side (and the top). */
export const OB_INSET = 4;
export const COYOTE = 0.08;
export const JUMP_BUFFER = 0.14;

export const PUDDLE_SLOW = 0.5;
export const GUST_TIME = 1.8;
export const GUST_SLOW = 0.45;
export const GUST_PUSH = 35;

export const SOAK_TIME = 45;
export const WET_TIME = 16;
export const CRANK_TIME = 2;
/** Crank progress lost per second while the button is released. */
export const CRANK_DECAY = 0.3;

export const MAX_LIVES = 3;
export const STUN_STUMBLE = 0.7;
export const STUN_ZAP = 0.45;
export const INV_TIME = 1.6;

export const STRIKE_R = 52;
export const WARN = 1.1;
/** The bolt stays on screen (harmless) this long after it lands. */
export const STRIKE_LINGER = 0.35;
/** Time a player needs to notice a warning before moving. */
export const REACTION = 0.3;
export const FIRST_STRIKE = 2.2;
/** No strike lands this close to the car or the porch. */
export const STRIKE_MIN_X = ARRIVE_X + 110;
export const STRIKE_MAX_X = START_X - 60;
/**
 * The stretch of yard around Wes that counts as his path: at most one live
 * strike may touch it at a time.
 */
export const PATH_AHEAD = 520;
export const PATH_BEHIND = 260;

export const HINT_TIME = 15;
export const BOOMBOX_TIME = 30;
/** The bat swings when Wes gets this close to its target. */
export const BAT_REACH = 70;

// ------------------------------------------------------------------ layout
export type ObstacleKind = 'branch' | 'can' | 'gnome';

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  /** Left edge. */
  x: number;
  w: number;
  h: number;
  alive: boolean;
  /** How it was cleared away, once `alive` is false. */
  how?: 'stumble' | 'knock' | 'bat' | 'smash';
}

export interface Puddle {
  x: number;
  w: number;
}

/** A gap between houses where the wind funnels; it gusts once, on entry. */
export interface Gust {
  x: number;
  w: number;
  /** Seconds of gust left (0 = calm). */
  t: number;
  used: boolean;
}

export interface Layout {
  obstacles: Obstacle[];
  puddles: Puddle[];
  gusts: Gust[];
}

const SIZES: Record<ObstacleKind, { w: number; h: number }> = {
  branch: { w: 62, h: 24 },
  can: { w: 38, h: 48 },
  gnome: { w: 24, h: 36 },
};

/** The yards, right to left, in the order Wes meets them. */
export function makeLayout(): Layout {
  const ob = (id: number, kind: ObstacleKind, x: number, w = SIZES[kind].w): Obstacle => ({
    id,
    kind,
    x,
    w,
    h: SIZES[kind].h,
    alive: true,
  });
  return {
    obstacles: [
      ob(0, 'branch', 2950),
      ob(1, 'can', 2360),
      ob(2, 'branch', 1810, 74),
      ob(3, 'gnome', 1240),
      ob(4, 'can', 820),
    ],
    puddles: [
      { x: 3170, w: 80 },
      { x: 2100, w: 100 },
      { x: 1020, w: 120 },
    ],
    gusts: [
      { x: 2600, w: 220, t: 0, used: false },
      { x: 1460, w: 240, t: 0, used: false },
    ],
  };
}

// --------------------------------------------------------------- jump math
/**
 * Times (after take-off) during which a jump is above height `h`, or null
 * if the jump never gets that high.
 */
export function airborneAbove(h: number): [number, number] | null {
  const disc = JUMP_V * JUMP_V - 2 * GRAVITY * h;
  if (disc <= 0) return null;
  const r = Math.sqrt(disc);
  return [(JUMP_V - r) / GRAVITY, (JUMP_V + r) / GRAVITY];
}

export const AIR_TIME = (2 * JUMP_V) / GRAVITY;

/** Shrunk collision box of an obstacle. */
export function obBox(o: Obstacle) {
  return { x0: o.x + OB_INSET, x1: o.x + o.w - OB_INSET, h: o.h - OB_INSET };
}

/**
 * The range of take-off positions (Wes's centre x) that clear `o` when
 * running left at `speed`. `lo` is the last chance, `hi` the earliest.
 * Null if it cannot be cleared at that speed.
 */
export function takeoffWindow(o: Obstacle, speed: number): { lo: number; hi: number } | null {
  const b = obBox(o);
  const t = airborneAbove(b.h);
  if (!t) return null;
  // Before t1 Wes is still low: his left edge must not have reached the box.
  const hi = b.x0 - HW + speed * t[1];
  // After t2 he is low again: his right edge must be past the box.
  const lo = b.x1 + HW + speed * t[0];
  return hi > lo ? { lo, hi } : null;
}

/** How long (seconds) the player has to press jump for obstacle `o`. */
export function jumpWindowSeconds(o: Obstacle, speed: number): number {
  const w = takeoffWindow(o, speed);
  return w ? (w.hi - w.lo) / speed : 0;
}

// ------------------------------------------------------------------- state
export type Phase = 'run' | 'crank' | 'won' | 'lost';

export interface Wes {
  x: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  facing: -1 | 1;
  stun: number;
  /** Post-hit invulnerability. */
  inv: number;
  coyote: number;
  jumpBuf: number;
}

export interface Strike {
  id: number;
  x: number;
  r: number;
  /** Warning time before it lands. */
  warn: number;
  /** Seconds since the warning appeared. */
  t: number;
  struck: boolean;
  done: boolean;
}

export type SimEvent =
  | { type: 'jump' }
  | { type: 'land'; puddle: boolean }
  | { type: 'splash'; x: number }
  | { type: 'stumble'; ob: Obstacle }
  | { type: 'knock'; ob: Obstacle }
  | { type: 'smash'; ob: Obstacle }
  | { type: 'bat'; ob: Obstacle }
  | { type: 'warn'; strike: Strike }
  | { type: 'strike'; strike: Strike; near: number }
  | { type: 'zap'; strike: Strike }
  | { type: 'deflect'; strike: Strike }
  | { type: 'gust'; gust: Gust }
  | { type: 'arrive' }
  | { type: 'won' }
  | { type: 'lost'; reason: 'soaked' | 'lives' };

export interface SimInput {
  /** -1 (left) .. 1 (right). */
  move: number;
  /** Jump pressed this step. */
  jump: boolean;
  /** Crank button held. */
  hold: boolean;
}

export interface SimOptions {
  seed?: number;
  /** host.speed: 2 with the Chuck Taylors. */
  speed?: number;
}

export interface Sim {
  phase: Phase;
  time: number;
  speed: number;
  wes: Wes;
  lives: number;
  maxLives: number;
  /** Car seats soaking, 0..1 (1 = lose). */
  soak: number;
  /** Window crank progress, 0..1. */
  crank: number;
  /** Wes's wetness, 0..1 (flavour only). */
  wet: number;
  obstacles: Obstacle[];
  puddles: Puddle[];
  gusts: Gust[];
  strikes: Strike[];
  nextStrike: number;
  strikeSeq: number;
  /** Cap: warnings appear twice as early for the rest of the run. */
  capWarn: boolean;
  /** Cap: seconds of safe-path trail left. */
  hintT: number;
  /** Boombox: seconds of invincibility left. */
  invincible: number;
  /** Bat: the obstacle that gets smashed when Wes reaches it. */
  batTarget: Obstacle | null;
  /** Seconds since the bat swung (for the swing animation). */
  batSwing: number;
  god: boolean;
  lostReason: 'soaked' | 'lives' | null;
  /** Events from the last step (cleared at the start of each step). */
  events: SimEvent[];
  rng: () => number;
}

/** Small deterministic PRNG (mulberry32). */
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

export function createSim(opts: SimOptions = {}): Sim {
  const layout = makeLayout();
  return {
    phase: 'run',
    time: 0,
    speed: opts.speed ?? 1,
    wes: { x: START_X, h: 0, vx: 0, vy: 0, onGround: true, facing: -1, stun: 0, inv: 0, coyote: 0, jumpBuf: 0 },
    lives: MAX_LIVES,
    maxLives: MAX_LIVES,
    soak: 0,
    crank: 0,
    wet: 0,
    ...layout,
    strikes: [],
    nextStrike: FIRST_STRIKE,
    strikeSeq: 0,
    capWarn: false,
    hintT: 0,
    invincible: 0,
    batTarget: null,
    batSwing: 99,
    god: false,
    lostReason: null,
    events: [],
    rng: mulberry32(opts.seed ?? 1),
  };
}

// ----------------------------------------------------------------- helpers
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

export function puddleAt(s: Sim, x: number): Puddle | null {
  for (const p of s.puddles) if (x >= p.x && x <= p.x + p.w) return p;
  return null;
}

/** The gust currently blowing on Wes, if any. */
export function activeGust(s: Sim): Gust | null {
  const x = s.wes.x;
  for (const g of s.gusts) if (g.t > 0 && x >= g.x - 40 && x <= g.x + g.w + 40) return g;
  return null;
}

/** 0 at the porch, 1 at the car. */
export function progress(s: Sim): number {
  return clamp((START_X - s.wes.x) / (START_X - ARRIVE_X), 0, 1);
}

/** Where Wes's centre must not be when `st` lands. */
export function dangerZone(st: { x: number; r: number }): [number, number] {
  return [st.x - st.r - HW, st.x + st.r + HW];
}

export function inDanger(x: number, st: { x: number; r: number }): boolean {
  const [a, b] = dangerZone(st);
  return x > a && x < b;
}

/** Does a live strike's danger zone touch the stretch of yard around `x`? */
export function onPath(st: { x: number; r: number }, x: number): boolean {
  const [a, b] = dangerZone(st);
  return b > x - PATH_AHEAD && a < x + PATH_BEHIND;
}

/**
 * Seconds to run from `from` to `to` on the ground at full effort, slowed
 * by any puddles in between and by the gust that is blowing right now.
 */
export function travelTime(s: Sim, from: number, to: number): number {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  let wet = 0;
  for (const p of s.puddles) wet += Math.max(0, Math.min(hi, p.x + p.w) - Math.max(lo, p.x));
  const dry = hi - lo - wet;
  const gust = !!activeGust(s);
  const speed = (f: number) => {
    const v = RUN * s.speed * f;
    if (!gust) return v;
    return to < from ? v * GUST_SLOW - GUST_PUSH : v + GUST_PUSH;
  };
  const leg = (d: number, v: number) => (d <= 0 ? 0 : v > 0 ? d / v : Infinity);
  return leg(dry, speed(1)) + leg(wet, speed(PUDDLE_SLOW));
}

/** Is a standing obstacle in the way of Wes running from `from` to `to` (and stopping)? */
function blocked(s: Sim, from: number, to: number): boolean {
  const lo = to < from ? to - HW - 12 : from - HW;
  const hi = to < from ? from + HW : to + HW + 12;
  return s.obstacles.some((o) => o.alive && o.x + o.w > lo && o.x < hi);
}

/**
 * Seconds Wes needs to get clear of `st` starting from `x`, on foot: an
 * obstacle in the way of one side closes that side.
 */
export function escapeTime(s: Sim, st: { x: number; r: number }, x = s.wes.x): number {
  if (!inDanger(x, st)) return 0;
  const [a, b] = dangerZone(st);
  const left = blocked(s, x, a) ? Infinity : travelTime(s, x, a);
  const right = blocked(s, x, b) ? Infinity : travelTime(s, x, b);
  return Math.min(left, right) + s.wes.stun;
}

export function strikeWarn(s: Sim): number {
  return WARN * (s.capWarn ? 2 : 1);
}

/**
 * Pick the next strike near Wes, or null if none is fair right now.
 *
 * Only one strike is ever live, so two can never be on his path at once,
 * and it is placed so that a player who reacts in REACTION seconds (still
 * running at his current speed until then) can get clear before it lands.
 */
export function planStrike(s: Sim): Strike | null {
  if (!s.wes.onGround || s.strikes.some((st) => !st.done)) return null;
  const warn = strikeWarn(s);
  const w = s.wes;
  const reacted = w.x + w.vx * REACTION;
  for (let tries = 0; tries < 8; tries++) {
    // Mostly ahead of Wes (to the left), sometimes right on top of him.
    const lead = -30 + s.rng() * 310;
    const cand = { x: clamp(w.x - lead, STRIKE_MIN_X, STRIKE_MAX_X), r: STRIKE_R };
    if (!onPath(cand, w.x) || nearGust(s, cand) || nearObstacle(s, cand)) continue;
    if (REACTION + Math.max(escapeTime(s, cand, w.x), escapeTime(s, cand, reacted)) > warn) continue;
    return { id: s.strikeSeq++, x: cand.x, r: STRIKE_R, warn, t: 0, struck: false, done: false };
  }
  return null;
}

/** Would `st` land in (or next to) a gap that is still to gust, or gusting? */
function nearGust(s: Sim, st: { x: number; r: number }): boolean {
  const [a, b] = dangerZone(st);
  return s.gusts.some((g) => (!g.used || g.t > 0) && b > g.x - 60 && a < g.x + g.w + 60);
}

/**
 * Would `st` land on a standing obstacle or the lawn just past it? Lightning
 * never lands where a jump does, so a player is never trapped between the
 * glow and the thing they just cleared.
 */
function nearObstacle(s: Sim, st: { x: number; r: number }): boolean {
  const [a, b] = dangerZone(st);
  const landing = AIR_TIME * RUN * s.speed + 20;
  return s.obstacles.some((o) => o.alive && b > o.x - landing && a < o.x + o.w + 30);
}

/** Seconds until the next strike: they come faster near the car. */
export function strikeInterval(s: Sim): number {
  const p = progress(s);
  const base = 2.1 - 0.5 * p + s.rng() * 0.5;
  return Math.max(base, strikeWarn(s) + STRIKE_LINGER + 0.2);
}

// ------------------------------------------------------------------ items
/** Apply a side-quest item. True if it took effect. */
export function useItem(s: Sim, item: ItemId): boolean {
  // nothing can hurt Wes once he's at the car, so every item is moot there
  if (s.phase !== 'run') return false;
  if (item === 'jersey') {
    s.lives += 1;
    s.maxLives = Math.max(s.maxLives, s.lives);
    return true;
  }
  if (item === 'cap') {
    s.capWarn = true;
    s.hintT = HINT_TIME;
    for (const st of s.strikes) if (!st.struck) st.warn = Math.max(st.warn, st.t + WARN);
    return true;
  }
  if (item === 'boombox') {
    s.invincible = BOOMBOX_TIME;
    return true;
  }
  if (item === 'bat') {
    const target = nextObstacle(s);
    if (!target || target === s.batTarget) return false;
    s.batTarget = target;
    return true;
  }
  return false;
}

/** The closest standing obstacle Wes has not passed yet. */
export function nextObstacle(s: Sim): Obstacle | null {
  let best: Obstacle | null = null;
  for (const o of s.obstacles) {
    if (!o.alive || o.x > s.wes.x + HW) continue;
    if (!best || o.x > best.x) best = o;
  }
  return best;
}

// ------------------------------------------------------------------- step
function lose(s: Sim, reason: 'soaked' | 'lives') {
  if (s.phase === 'won' || s.phase === 'lost') return;
  s.phase = 'lost';
  s.lostReason = reason;
  s.events.push({ type: 'lost', reason });
}

function hurt(s: Sim) {
  if (s.god) return;
  s.lives -= 1;
  if (s.lives <= 0) lose(s, 'lives');
}

function overlaps(w: Wes, o: Obstacle): boolean {
  const b = obBox(o);
  return w.x + HW > b.x0 && w.x - HW < b.x1 && w.h < b.h;
}

export function step(s: Sim, dt: number, inp: SimInput): void {
  s.events.length = 0;
  s.time += dt;
  const w = s.wes;
  w.stun = Math.max(0, w.stun - dt);
  w.inv = Math.max(0, w.inv - dt);
  s.batSwing += dt;

  if (s.phase === 'run' || s.phase === 'crank') {
    s.soak += dt / SOAK_TIME;
    s.wet = Math.min(1, s.wet + dt / WET_TIME);
    s.invincible = Math.max(0, s.invincible - dt);
    s.hintT = Math.max(0, s.hintT - dt);
    if (s.soak >= 1) {
      if (s.god) s.soak = 0.999;
      else lose(s, 'soaked');
    }
  }

  if (s.phase === 'run') stepRun(s, dt, inp);
  else if (s.phase === 'crank') stepCrank(s, dt, inp);
  else settle(s, dt);
  stepStrikes(s, dt);
}

/** After the end Wes just stops where he is. */
function settle(s: Sim, dt: number) {
  const w = s.wes;
  w.vx = approach(w.vx, 0, ACCEL_GROUND * dt);
  w.x += w.vx * dt;
  if (!w.onGround) {
    w.vy -= GRAVITY * dt;
    w.h += w.vy * dt;
    if (w.h <= 0) {
      w.h = 0;
      w.vy = 0;
      w.onGround = true;
    }
  }
}

function stepRun(s: Sim, dt: number, inp: SimInput) {
  const w = s.wes;
  // A gust starts the first time Wes steps into its gap.
  for (const g of s.gusts) {
    if (!g.used && w.x >= g.x && w.x <= g.x + g.w) {
      g.used = true;
      g.t = GUST_TIME;
      s.events.push({ type: 'gust', gust: g });
    } else if (g.t > 0) g.t = Math.max(0, g.t - dt);
  }

  const move = w.stun > 0 ? 0 : clamp(inp.move, -1, 1);
  const puddle = w.onGround ? puddleAt(s, w.x) : null;
  let target = move * RUN * s.speed;
  if (puddle) target *= PUDDLE_SLOW;
  if (activeGust(s)) target = (target < 0 ? target * GUST_SLOW : target) + GUST_PUSH;
  const accel = w.onGround ? (w.stun > 0 ? 500 : ACCEL_GROUND) : move === 0 ? AIR_DRAG : ACCEL_AIR;
  w.vx = approach(w.vx, target, accel * dt);
  if (move < 0) w.facing = -1;
  else if (move > 0) w.facing = 1;

  w.jumpBuf = inp.jump ? JUMP_BUFFER : Math.max(0, w.jumpBuf - dt);
  w.coyote = w.onGround ? COYOTE : Math.max(0, w.coyote - dt);
  if (w.jumpBuf > 0 && w.coyote > 0 && w.stun <= 0) {
    w.vy = JUMP_V;
    w.onGround = false;
    w.coyote = 0;
    w.jumpBuf = 0;
    s.events.push({ type: 'jump' });
  }

  const wasIn = puddle;
  w.x = clamp(w.x + w.vx * dt, ARRIVE_X - 20, WORLD_W - 40);
  if (!w.onGround) {
    w.vy -= GRAVITY * dt;
    w.h += w.vy * dt;
    if (w.h <= 0) {
      w.h = 0;
      w.vy = 0;
      w.onGround = true;
      const inP = !!puddleAt(s, w.x);
      s.events.push({ type: 'land', puddle: inP });
      if (inP) {
        s.events.push({ type: 'splash', x: w.x });
        s.wet = Math.min(1, s.wet + 0.08);
      }
    }
  } else {
    const now = puddleAt(s, w.x);
    if (now && !wasIn) s.events.push({ type: 'splash', x: w.x });
  }

  // The bat swings as Wes reaches its target.
  const bt = s.batTarget;
  if (bt && bt.alive && w.x - HW - (bt.x + bt.w) < BAT_REACH) {
    bt.alive = false;
    bt.how = 'bat';
    s.batTarget = null;
    s.batSwing = 0;
    s.events.push({ type: 'bat', ob: bt });
  }

  for (const o of s.obstacles) {
    if (!o.alive || !overlaps(w, o)) continue;
    o.alive = false;
    if (s.invincible > 0) {
      o.how = 'smash';
      s.events.push({ type: 'smash', ob: o });
    } else if (w.inv > 0 || s.god) {
      o.how = 'knock';
      s.events.push({ type: 'knock', ob: o });
    } else {
      o.how = 'stumble';
      w.stun = STUN_STUMBLE;
      w.inv = INV_TIME;
      w.vx = 190;
      w.vy = 260;
      w.onGround = false;
      s.events.push({ type: 'stumble', ob: o });
      hurt(s);
    }
    if (s.batTarget === o) s.batTarget = null;
  }

  if (s.phase === 'run' && w.x <= ARRIVE_X) {
    s.phase = 'crank';
    w.x = CRANK_X;
    w.vx = 0;
    w.facing = -1;
    s.events.push({ type: 'arrive' });
  }
}

function stepCrank(s: Sim, dt: number, inp: SimInput) {
  settle(s, dt);
  if (inp.hold) s.crank = Math.min(1, s.crank + dt / CRANK_TIME);
  else s.crank = Math.max(0, s.crank - CRANK_DECAY * dt);
  if (s.crank >= 1 && s.phase === 'crank') {
    s.phase = 'won';
    s.events.push({ type: 'won' });
  }
}

function stepStrikes(s: Sim, dt: number) {
  const w = s.wes;
  if (s.phase === 'run') {
    s.nextStrike -= dt;
    if (s.nextStrike <= 0) {
      const st = planStrike(s);
      if (st) {
        s.strikes.push(st);
        s.events.push({ type: 'warn', strike: st });
        s.nextStrike = strikeInterval(s);
      } else s.nextStrike = 0.25;
    }
  }
  for (const st of s.strikes) {
    st.t += dt;
    if (!st.struck && st.t >= st.warn) {
      st.struck = true;
      s.events.push({ type: 'strike', strike: st, near: Math.abs(w.x - st.x) });
      if (s.phase === 'run' && inDanger(w.x, st)) {
        if (s.invincible > 0) s.events.push({ type: 'deflect', strike: st });
        else if (w.inv <= 0) {
          s.events.push({ type: 'zap', strike: st });
          w.stun = STUN_ZAP;
          w.inv = INV_TIME;
          w.vx = (w.x >= st.x ? 1 : -1) * 230;
          w.vy = 380;
          w.onGround = false;
          hurt(s);
        }
      }
    }
    if (st.t >= st.warn + STRIKE_LINGER) st.done = true;
  }
  if (s.strikes.some((st) => st.done)) s.strikes = s.strikes.filter((st) => !st.done);
}
