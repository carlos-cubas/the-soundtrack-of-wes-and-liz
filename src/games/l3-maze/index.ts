/**
 * Level 3: Vomit Girl (maze escape, chapter 3).
 *
 * Liz just got barfed on. Wes has 15 seconds to get out of Ryno's party
 * house to his pink car, where the spare clothes are. Top-down maze;
 * rooms stay dark until Wes walks into them; bumping into partygoers
 * knocks him back and costs time.
 */
import { asset, el } from '../../ui/dom';
import type { GameHost, MiniGame, MiniGameFactory } from '../types';
import {
  BASE_SPEED,
  CAR_RECT,
  CLOWN_PATH,
  CLOWN_SPEED,
  COURAGE,
  PANIC_R,
  PANIC_STUN,
  COLS,
  GOAL_TILES,
  MAP,
  ROOM_NAMES,
  ROOM_OF,
  ROWS,
  START,
  TILE,
  TIME_LIMIT,
  WORLD_H,
  WORLD_W,
  atCar,
  bfs,
  charAt,
  isSolid,
  moveCircle,
  roomAt,
  steerToward,
  type RoomId,
} from './map';

const IMG = { hoodie: 'img/sprites/hoodie.png' };
/** Book-cover line art: thin even dark outlines, flat fills. */
const INK = '#3a3340';
const LINE = 1.6;
const WES_R = 9;
const PERSON_R = 10;
const STUN = 0.35;
const FOG = '#0e1228';
const FOG_MAX = 0.9;
const HUD_TOP = 44;

type Kind = 'dance' | 'wander' | 'static';
type HairStyle = 'short' | 'long' | 'bun' | 'curly' | 'cap' | 'neat' | 'clown';

interface Person {
  x: number;
  y: number;
  ax: number;
  ay: number;
  kind: Kind;
  room: RoomId;
  shirt: string;
  hair: string;
  skin: string;
  style: HairStyle;
  cup: boolean;
  face: number;
  phase: number;
  /** Patrol waypoints (world units) for wanderers. */
  path: Array<{ x: number; y: number }>;
  wp: number;
  wait: number;
  /** Seconds Wes can pass through after a bump. */
  ghost: number;
  bubble: string | null;
  bubbleT: number;
  /** Repeating line (Michael, Ryno). */
  line?: string;
  lineEvery?: number;
  solid: boolean;
  /** Walking speed for wanderers (world units per second). */
  speed?: number;
  clown?: boolean;
}

const SHIRTS = ['#f7768e', '#2f5fd0', '#9be3c9', '#f8de4f', '#e8692f', '#7c5cff', '#2fa66b', '#ff9f43', '#5bc0eb'];
const HAIRS = ['#2a211c', '#6b4423', '#e8c26a', '#b03a2e', '#1b1b1b', '#8d5524', '#f5d76e'];
const SKINS = ['#f1c7a5', '#e0ac85', '#c68642', '#8d5524'];
const STYLES: HairStyle[] = ['short', 'long', 'bun', 'curly', 'short', 'long'];
const BUMP_LINES = ['Whoa!', 'Hey!', 'Watch it!', 'Dude!', 'Whoa!', 'My drink!'];

/** Tile-unit spots for the crowd. x/y are tile coordinates (x.5 = centre). */
const CROWD: Array<{ x: number; y: number; kind: Kind; path?: Array<[number, number]> }> = [
  // living room dance floor
  { x: 7.4, y: 8.6, kind: 'dance' },
  { x: 8.6, y: 9.3, kind: 'dance' },
  { x: 7.1, y: 9.9, kind: 'dance' },
  { x: 10.9, y: 10.6, kind: 'dance' },
  { x: 9.8, y: 7.7, kind: 'dance' },
  { x: 4.4, y: 7.6, kind: 'dance' },
  { x: 5.0, y: 10.4, kind: 'wander', path: [[4.5, 10.5], [10.5, 8.0], [9.0, 7.5], [4.5, 9.5]] },
  // crowd at the living room archway
  { x: 6.5, y: 6.4, kind: 'static' },
  // kitchen
  { x: 15.5, y: 3.55, kind: 'static' },
  { x: 16.5, y: 3.45, kind: 'static' },
  { x: 15.5, y: 2.5, kind: 'wander', path: [[15.5, 2.5], [16.5, 2.3], [15.6, 1.6], [12.5, 2.5]] },
  // garage beer pong, either side of the table (the clown has the far end)
  { x: 14.5, y: 8.3, kind: 'static' },
  { x: 14.6, y: 10.3, kind: 'static' },
  // driveway, on the phone
  { x: 21.5, y: 6.0, kind: 'wander', path: [[20.5, 5.6], [22.6, 6.6], [21.0, 7.2]] },
];

const factory: MiniGameFactory = () => {
  let host: GameHost;
  let view = { s: 1, ox: 0, oy: HUD_TOP };
  let stickR = 44;
  /**
   * Touch steers with the floating stick. A mouse or trackpad walks Wes
   * toward the cursor while the button is held, or to the last clicked spot
   * (straight line, sliding along walls). Arrow keys/WASD work in both.
   */
  let scheme: 'touch' | 'mouse' = 'touch';
  let walkTo: { x: number; y: number } | null = null;
  /** After a click: tile-centre waypoints to walkTo through rooms already explored. */
  let walkPath: Array<{ x: number; y: number }> = [];
  let pressing = false;
  let stuckT = 0;
  let cache: HTMLCanvasElement | null = null;
  let cacheK = 0;
  let unResize: (() => void) | null = null;
  let hudChip: HTMLElement | null = null;
  let hudText: HTMLElement | null = null;

  const wes = { x: (START.x + 0.5) * TILE, y: (START.y + 0.5) * TILE, vx: 0, vy: 0, face: Math.PI / 2, kbx: 0, kby: 0 };
  let stun = 0;
  let squash = 0;
  /** After a clown panic Wes can slip past the clown while this runs. */
  let courage = 0;
  let panics = 0;
  let wesBubble: string | null = null;
  let wesBubbleT = 0;
  let phase: 'ready' | 'run' | 'win' | 'lose' = 'ready';
  let phaseT = 0;
  let clock = 0;
  let timeLeft = TIME_LIMIT;
  let lastShown = '';
  let lastTick = 99;
  let finished = false;
  let shake = 0;
  let bumps = 0;
  const people: Person[] = [];
  const revealed = new Set<RoomId>(['bath', 'out']);
  const fogA: Record<RoomId, number> = { bath: 0, bedroom: FOG_MAX, kitchen: FOG_MAX, hall: FOG_MAX, closet: FOG_MAX, living: FOG_MAX, garage: FOG_MAX, out: 0 };
  const parts: Array<{ x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }> = [];
  const texts: Array<{ text: string; x: number; y: number; t: number; dur: number; color: string; size: number }> = [];
  const fogLevels = new Map<number, number[]>();
  const drawList: Array<Person | null> = [];
  const byY = (a: Person | null, b: Person | null) => (a ? a.y : wes.y) - (b ? b.y : wes.y);
  const bubbleW = new Map<string, number>();

  // Fog lookup per tile: rooms whose reveal uncovers this tile.
  const tileRooms: RoomId[][][] = MAP.map((row, y) =>
    [...row].map((_, x) => {
      const r = ROOM_OF[y][x];
      if (r) return [r];
      const set = new Set<RoomId>();
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const n = ROOM_OF[y + dy]?.[x + dx];
          if (n) set.add(n);
        }
      if (y === 0 || x === 0 || y === ROWS - 1 || x === COLS - 1) set.add('out');
      return [...set];
    }),
  );
  /** Centre of each room, for the "?" marker and the name pop. */
  const roomCentre = (() => {
    const acc = new Map<RoomId, { x: number; y: number; n: number }>();
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const r = ROOM_OF[y][x];
        if (!r || isSolid(x, y)) continue;
        const a = acc.get(r) ?? { x: 0, y: 0, n: 0 };
        a.x += (x + 0.5) * TILE;
        a.y += (y + 0.5) * TILE;
        a.n++;
        acc.set(r, a);
      }
    const out = new Map<RoomId, { x: number; y: number }>();
    for (const [r, a] of acc) out.set(r, { x: a.x / a.n, y: a.y / a.n });
    return out;
  })();

  function rand(a: number, b: number): number {
    return a + Math.random() * (b - a);
  }

  function makePeople(): void {
    let i = 0;
    const add = (x: number, y: number, kind: Kind, extra: Partial<Person> = {}) => {
      const px = x * TILE;
      const py = y * TILE;
      people.push({
        x: px,
        y: py,
        ax: px,
        ay: py,
        kind,
        room: roomAt(px, py) ?? 'out',
        shirt: SHIRTS[i % SHIRTS.length],
        hair: HAIRS[(i * 3) % HAIRS.length],
        skin: SKINS[(i * 5) % SKINS.length],
        style: STYLES[i % STYLES.length],
        cup: i % 3 !== 1,
        face: rand(0, Math.PI * 2),
        phase: rand(0, 10),
        path: [],
        wp: 0,
        wait: rand(0, 1),
        ghost: 0,
        bubble: null,
        bubbleT: 0,
        solid: true,
        ...extra,
      });
      i++;
    };
    for (const c of CROWD) add(c.x, c.y, c.kind, { path: (c.path ?? []).map(([x, y]) => ({ x: x * TILE, y: y * TILE })) });
    // Michael by the closet, worried; Ryno at the end of the hall by the speaker
    add(1.5, 6.45, 'static', { shirt: '#1f3a68', hair: '#b5835a', skin: '#f1c7a5', style: 'neat', cup: false, face: -Math.PI / 2, line: 'Is Liz okay?', lineEvery: 3.2 });
    add(12.5, 5.5, 'dance', { shirt: '#f8de4f', hair: '#e5483d', skin: '#e0ac85', style: 'cap', cup: true, line: 'PARTY!', lineEvery: 2.4 });
    // the clown (Wes's fatal flaw), slowly patrolling the garage
    add(CLOWN_PATH[0][0], CLOWN_PATH[0][1], 'wander', {
      clown: true,
      path: CLOWN_PATH.map(([x, y]) => ({ x: x * TILE, y: y * TILE })),
      speed: CLOWN_SPEED,
      shirt: '#ffe14d',
      hair: '#e5483d',
      skin: '#ffffff',
      style: 'clown',
      cup: false,
      line: 'Honk honk!',
      lineEvery: 3.6,
    });
    // Liz on the edge of the tub (not in the way)
    add(2.5, 1.45, 'static', { shirt: '#f9b6c8', hair: '#e8692f', skin: '#f1c7a5', style: 'curly', cup: false, face: Math.PI / 2, solid: false, line: 'Hurry, Wes…', lineEvery: 4.5 });
  }

  // ------------------------------------------------------------------ layout
  function layout(): void {
    const { W, H, safe } = host.stage;
    const left = safe.left;
    const availW = W - safe.left - safe.right;
    const availH = H - HUD_TOP;
    const s = Math.min(availW / WORLD_W, availH / WORLD_H);
    view = { s, ox: left + (availW - WORLD_W * s) / 2, oy: HUD_TOP + (availH - WORLD_H * s) / 2 };
    applyControls();
    cache = null;
  }

  /** The floating stick for touch; no on-screen control for a mouse. */
  function applyControls(): void {
    const { W, H } = host.stage;
    // re-making the stick drops its state, so leave it alone while a finger
    // is on it (e.g. Safari's toolbar resizing the page mid-run)
    for (const p of host.input.pointers.values()) if (p.owner === 'move') return;
    host.input.clearControls();
    if (scheme === 'touch') {
      // 44 units on phones; on iPads (bigger CSS px per unit) keep the thumb
      // travel for full speed about a centimetre instead of growing with the frame
      stickR = 44 * Math.min(1, 1.25 / host.stage.scale);
      host.input.addStick({ id: 'move', zone: { x: 0, y: HUD_TOP, w: W * 0.55, h: H - HUD_TOP }, r: stickR });
    }
    host.stage.canvas.style.cursor = scheme === 'mouse' ? 'crosshair' : '';
  }

  function setScheme(k: 'touch' | 'mouse'): void {
    if (k === scheme) return;
    scheme = k;
    walkTo = null;
    applyControls();
  }

  // capture phase: runs before Input sees the press, so a mouse click is
  // never grabbed by the touch stick (and a finger always finds it)
  const onDownCapture = (e: PointerEvent) => setScheme(e.pointerType === 'mouse' ? 'mouse' : 'touch');

  function toWorldPt(vx: number, vy: number): { x: number; y: number } {
    return { x: (vx - view.ox) / view.s, y: (vy - view.oy) / view.s };
  }

  /** Has Wes seen this tile (its room, or a room next to a wall/doorway, revealed)? */
  function known(tx: number, ty: number): boolean {
    for (const r of tileRooms[ty]?.[tx] ?? []) if (revealed.has(r)) return true;
    return false;
  }

  /**
   * A click (button released): walk the tile route to the spot, but only
   * through rooms already explored, so the fog still hides the way out.
   * Anything else is a straight walk toward the spot, sliding along walls.
   */
  function planWalk(): void {
    walkPath = [];
    if (!walkTo) return;
    const to = { x: Math.floor(walkTo.x / TILE), y: Math.floor(walkTo.y / TILE) };
    if (isSolid(to.x, to.y) || !known(to.x, to.y)) return;
    const unknown = new Set<string>();
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!known(x, y)) unknown.add(`${x},${y}`);
    const path = bfs({ x: Math.floor(wes.x / TILE), y: Math.floor(wes.y / TILE) }, [to], unknown);
    if (!path || path.length < 3) return;
    walkPath = path.slice(1, -1).map((t) => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE }));
  }

  /** Mouse input this frame: a held button follows the cursor, a click sets a spot. */
  function readMouse(): void {
    const p = host.input.primary();
    const tap = host.input.taps[host.input.taps.length - 1];
    if (p) {
      // holding: straight at the cursor
      walkTo = toWorldPt(p.x, p.y);
      walkPath = [];
      pressing = true;
    } else if (tap) {
      // a quick click that went down and up between two frames
      walkTo = toWorldPt(tap.x, tap.y);
      pressing = false;
      planWalk();
    } else if (pressing) {
      pressing = false;
      planWalk();
    }
  }

  /** Mouse steering: a unit direction toward the cursor / clicked spot, or zero. */
  function mouseAxis(keys: { x: number; y: number }): { x: number; y: number } {
    const p = host.input.primary();
    if (Math.hypot(keys.x, keys.y) > 0.15) {
      walkTo = null; // the keys take over
      walkPath = [];
      return keys;
    }
    if (!walkTo) return keys;
    while (walkPath.length && Math.hypot(walkPath[0].x - wes.x, walkPath[0].y - wes.y) < 9) walkPath.shift();
    const next = walkPath[0] ?? walkTo;
    const dir = steerToward(wes.x, wes.y, next.x, next.y, walkPath.length ? 0 : undefined);
    if ((dir.x === 0 && dir.y === 0) || (!p && stuckT > 0.45)) {
      // arrived (or a clicked spot behind a wall): stop cleanly
      if (!p) {
        walkTo = null;
        walkPath = [];
      }
      return { x: 0, y: 0 };
    }
    return dir;
  }

  // ------------------------------------------------------------------ update
  function update(dt: number): void {
    clock += dt;
    phaseT += dt;
    shake = Math.max(0, shake - dt);
    squash = Math.max(0, squash - dt);
    courage = Math.max(0, courage - dt);
    if (wesBubbleT > 0) {
      wesBubbleT -= dt;
      if (wesBubbleT <= 0) wesBubble = null;
    }
    const keys = host.input.axis();
    const live = phase === 'ready' || phase === 'run';
    if (scheme === 'mouse' && live) readMouse();
    const a = scheme === 'mouse' && live && stun <= 0 ? mouseAxis(keys) : keys;
    const moving = Math.hypot(a.x, a.y) > 0.15;

    if (phase === 'ready') {
      if (moving || phaseT > 1.2) {
        phase = 'run';
        phaseT = 0;
      }
    }
    if (phase === 'run') {
      timeLeft = Math.max(0, timeLeft - dt);
      const sec = Math.ceil(timeLeft);
      if (timeLeft <= 5 && sec < lastTick) {
        lastTick = sec;
        host.audio.sfx('tick');
      }
      if (timeLeft <= 0) startLose();
    }
    updateHud();

    // movement
    if (phase === 'ready' || phase === 'run') {
      if (stun > 0) {
        stun -= dt;
        const k = Math.exp(-dt * 9);
        wes.kbx *= k;
        wes.kby *= k;
        moveCircle(wes, wes.kbx * dt, wes.kby * dt, WES_R);
        wes.vx = 0;
        wes.vy = 0;
      } else {
        let ax = a.x;
        let ay = a.y;
        const l = Math.hypot(ax, ay);
        if (l > 1) {
          ax /= l;
          ay /= l;
        }
        const sp = BASE_SPEED * host.speed;
        const blend = Math.min(1, dt * 16);
        wes.vx += (ax * sp - wes.vx) * blend;
        wes.vy += (ay * sp - wes.vy) * blend;
        if (Math.hypot(wes.vx, wes.vy) > 8) wes.face = Math.atan2(wes.vy, wes.vx);
        const x0 = wes.x;
        const y0 = wes.y;
        moveCircle(wes, wes.vx * dt, wes.vy * dt, WES_R);
        // walking at a wall toward a clicked spot? (see mouseAxis)
        const progress = dt > 0 ? Math.hypot(wes.x - x0, wes.y - y0) / dt : 0;
        stuckT = walkTo && moving && progress < 15 ? stuckT + dt : 0;
      }
      revealAround();
      panicNearClown();
      bumpPeople();
      if (atCar(wes.x, wes.y, WES_R)) startWin();
    }

    updatePeople(dt);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      p.vx *= 0.9;
      p.vy *= 0.9;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      texts[i].t += dt;
      if (texts[i].t >= texts[i].dur) texts.splice(i, 1);
    }
    for (const r of Object.keys(fogA) as RoomId[]) {
      if (revealed.has(r)) fogA[r] = Math.max(0, fogA[r] - dt * 2.6);
    }
    if (phase === 'win' && phaseT >= 0.25 && phaseT - dt < 0.25) host.audio.sfx('star');
    if (phase === 'win' && phaseT > 1.5) finish('win');
    if (phase === 'lose' && phaseT > 1.6) finish('lose');
  }

  function updateHud(): void {
    const shown = timeLeft.toFixed(1);
    if (shown !== lastShown) {
      lastShown = shown;
      host.hud.setTimer(timeLeft, 5);
    }
  }

  function revealAround(): void {
    const probe = WES_R + 6;
    for (const [dx, dy] of [[0, 0], [probe, 0], [-probe, 0], [0, probe], [0, -probe]]) {
      const r = roomAt(wes.x + dx, wes.y + dy);
      if (!r || revealed.has(r)) continue;
      revealed.add(r);
      host.audio.sfx('swish');
      const c = roomCentre.get(r);
      if (c && r !== 'hall') texts.push({ text: ROOM_NAMES[r], x: c.x, y: c.y, t: 0, dur: 1.1, color: '#fdfbf3', size: 16 });
    }
  }

  /** Wes is deathly afraid of clowns: too close and he bolts the other way. */
  function panicNearClown(): void {
    if (stun > 0 || courage > 0) return;
    const here = roomAt(wes.x, wes.y);
    for (const p of people) {
      if (!p.clown) continue;
      // only in the same room (or its doorway), never through a wall
      if (here !== null && here !== p.room) continue;
      const dx = wes.x - p.x;
      const dy = wes.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d >= PANIC_R) continue;
      const nx = d > 0.01 ? dx / d : -Math.cos(wes.face);
      const ny = d > 0.01 ? dy / d : -Math.sin(wes.face);
      wes.kbx = nx * 270;
      wes.kby = ny * 270;
      stun = PANIC_STUN;
      courage = PANIC_STUN + COURAGE;
      p.ghost = courage;
      squash = 0.25;
      shake = 0.3;
      panics++;
      wesBubble = 'NOPE!';
      wesBubbleT = 0.9;
      p.bubble = 'Honk?';
      p.bubbleT = 0.8;
      host.audio.sfx('scream');
      for (let i = 0; i < 10; i++) {
        const a = rand(0, Math.PI * 2);
        const sp = rand(50, 120);
        parts.push({ x: wes.x, y: wes.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, max: 0.5, color: '#9fd8f2', size: rand(1.5, 2.5) });
      }
      return;
    }
  }

  function bumpPeople(): void {
    for (const p of people) {
      if (!p.solid) continue;
      const dx = wes.x - p.x;
      const dy = wes.y - p.y;
      const d = Math.hypot(dx, dy);
      const overlap = d < WES_R + PERSON_R;
      if (p.ghost > 0) {
        // stay passable while Wes is still inside them
        if (overlap && p.ghost < 0.1) p.ghost = 0.1;
        continue;
      }
      if (!overlap || stun > 0) continue;
      const nx = d > 0.01 ? dx / d : -Math.cos(wes.face);
      const ny = d > 0.01 ? dy / d : -Math.sin(wes.face);
      wes.kbx = nx * 190;
      wes.kby = ny * 190;
      stun = STUN;
      squash = 0.25;
      shake = 0.15;
      p.ghost = 1.0;
      moveCircle(p, -nx * 5, -ny * 5, PERSON_R - 2);
      p.bubble = bumps === 0 ? 'Whoa!' : BUMP_LINES[bumps % BUMP_LINES.length];
      p.bubbleT = 0.9;
      bumps++;
      host.audio.sfx('whoa');
      const sx = (wes.x + p.x) / 2;
      const sy = (wes.y + p.y) / 2;
      for (let i = 0; i < 8; i++) {
        const a = rand(0, Math.PI * 2);
        const sp = rand(40, 110);
        parts.push({ x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.45, max: 0.45, color: p.cup && i % 2 ? '#e5483d' : '#fdfbf3', size: rand(1.5, 3) });
      }
      break;
    }
  }

  function updatePeople(dt: number): void {
    for (const p of people) {
      p.ghost = Math.max(0, p.ghost - dt);
      if (p.bubbleT > 0) {
        p.bubbleT -= dt;
        if (p.bubbleT <= 0) p.bubble = null;
      }
      if (p.line && p.lineEvery && !p.bubble && revealed.has(p.room)) {
        const k = (clock + p.phase) % p.lineEvery;
        if (k < dt) {
          p.bubble = p.line;
          p.bubbleT = 1.3;
        }
      }
      if (p.kind === 'dance') {
        p.x = p.ax + Math.sin(clock * 2.1 + p.phase) * 3;
        p.y = p.ay + Math.cos(clock * 1.7 + p.phase) * 2.5;
        p.face += dt * (1.2 + (p.phase % 1.5)) * (p.phase % 2 > 1 ? 1 : -1);
      } else if (p.kind === 'wander' && p.path.length) {
        if (p.wait > 0) {
          p.wait -= dt;
          continue;
        }
        const t = p.path[p.wp];
        const dx = t.x - p.x;
        const dy = t.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 2) {
          p.wp = (p.wp + 1) % p.path.length;
          p.wait = rand(0.6, 1.6);
        } else {
          const sp = p.speed ?? 26;
          p.face = Math.atan2(dy, dx);
          moveCircle(p, (dx / d) * sp * dt, (dy / d) * sp * dt, PERSON_R - 2);
        }
      } else if (p.kind === 'static') {
        p.face += Math.sin(clock * 0.8 + p.phase) * dt * 0.4;
      }
    }
  }

  function startWin(): void {
    if (phase === 'win' || phase === 'lose') return;
    phase = 'win';
    phaseT = 0;
    host.audio.sfx('collect');
    texts.push({ text: 'Got the clothes!', x: CAR_RECT.x + CAR_RECT.w / 2, y: CAR_RECT.y - 26, t: 0, dur: 1.5, color: '#ffe80f', size: 22 });
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(60, 170);
      parts.push({ x: wes.x, y: wes.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.9, max: 0.9, color: SHIRTS[i % SHIRTS.length], size: rand(2, 3.5) });
    }
    if (hudText) hudText.textContent = 'Got them!';
    hudChip?.classList.add('got');
  }

  function startLose(): void {
    if (phase === 'win' || phase === 'lose') return;
    phase = 'lose';
    phaseT = 0;
    host.audio.sfx('miss');
    texts.push({ text: 'Too late!', x: wes.x, y: wes.y - 26, t: 0, dur: 1.6, color: '#f7768e', size: 24 });
  }

  function finish(outcome: 'win' | 'lose'): void {
    if (finished) return;
    finished = true;
    if (outcome === 'win') {
      const t = timeLeft.toFixed(1);
      host.finish({ outcome: 'win', score: Math.round(timeLeft * 10) / 10, summary: `Made it with ${t}s to spare!` });
    } else {
      host.finish({ outcome: 'lose', summary: 'The party swallowed you up. Try another way out!' });
    }
  }

  // ------------------------------------------------------------------ render
  function render(ctx: CanvasRenderingContext2D): void {
    const { W, H } = host.stage;
    ctx.lineJoin = 'round';
    drawSurroundings(ctx, W, H);
    ctx.save();
    if (shake > 0) ctx.translate(rand(-2, 2), rand(-2, 2));
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);
    drawStatic(ctx);
    drawDisco(ctx);
    drawLights(ctx);
    drawSpeaker(ctx);
    drawCarMarker(ctx);
    // people and Wes, back to front
    if (drawList.length !== people.length + 1) {
      drawList.length = 0;
      drawList.push(...people, null);
    }
    drawList.sort(byY);
    for (const p of drawList) {
      if (p) drawPerson(ctx, p.x, p.y, p, 1);
      else drawWes(ctx);
    }
    drawFog(ctx);
    if (scheme === 'mouse' && walkTo && (phase === 'ready' || phase === 'run')) drawWalkTarget(ctx, walkTo.x, walkTo.y);
    for (const p of people) if (p.bubble && fogVisible(p.room)) bubble(ctx, p.bubble, p.x, p.y - PERSON_R - 4, p.line === 'PARTY!' ? '#ffe80f' : '#ffffff');
    if (wesBubble) bubble(ctx, wesBubble, wes.x, wes.y - WES_R - 6, '#f9b6c8');
    drawParts(ctx);
    drawTexts(ctx);
    if (phase === 'ready' || (phase === 'run' && phaseT < 1)) {
      const k = phase === 'ready' ? Math.min(1, phaseT * 4) : 1 - phaseT;
      ctx.globalAlpha = Math.max(0, k);
      outlined(ctx, 'Get to your car!', wes.x + 70, wes.y + 4, 18, '#ffe80f', 'left');
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    host.input.renderControls(ctx);
  }

  function fogVisible(r: RoomId): boolean {
    return fogA[r] < 0.5;
  }

  function drawSurroundings(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.fillStyle = '#16302a';
    ctx.fillRect(0, 0, W, H);
    // the driveway runs off to the street on the right
    const x0 = view.ox + 19 * TILE * view.s;
    const y0 = view.oy + 5 * TILE * view.s;
    ctx.fillStyle = '#3a3d45';
    ctx.fillRect(x0, y0, W - x0, H - y0);
    ctx.fillRect(x0, view.oy + WORLD_H * view.s - 2, 5 * TILE * view.s, H);
    // a few night bushes on the left lawn
    ctx.fillStyle = '#1e4434';
    ctx.strokeStyle = '#0d1f18';
    ctx.lineWidth = LINE;
    for (let i = 0; i < 6; i++) {
      const bx = view.ox - 30 - (i % 2) * 22;
      const by = 80 + i * 55;
      ctx.beginPath();
      ctx.arc(bx, by, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // stars
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 18; i++) {
      const sx = (i * 97) % W;
      const sy = 8 + ((i * 53) % 34);
      const tw = 0.5 + 0.5 * Math.sin(clock * 2 + i);
      ctx.globalAlpha = 0.3 + tw * 0.5;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------- static layer
  function drawStatic(ctx: CanvasRenderingContext2D): void {
    const k = view.s * host.stage.scale * host.stage.dpr;
    if (!cache || Math.abs(cacheK - k) > 0.01) {
      cacheK = k;
      cache = document.createElement('canvas');
      cache.width = Math.ceil(WORLD_W * k);
      cache.height = Math.ceil(WORLD_H * k);
      const c = cache.getContext('2d');
      if (c) {
        c.scale(k, k);
        paintHouse(c);
      }
    }
    ctx.drawImage(cache, 0, 0, WORLD_W, WORLD_H);
  }

  const FLOOR_OF: Record<RoomId, string> = { bath: 'b', bedroom: 'r', kitchen: 'k', hall: 'h', closet: 'c', living: 'l', garage: 'g', out: 'o' };

  function paintHouse(c: CanvasRenderingContext2D): void {
    c.lineJoin = 'round';
    c.lineCap = 'round';
    // floors (furniture tiles get their room's floor)
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        let ch = MAP[y][x];
        if (ch === '#') continue;
        if (isSolid(x, y)) {
          const r = ROOM_OF[y][x];
          ch = r ? FLOOR_OF[r] : 'h';
          if (r === 'out' && (MAP[y][x] === 'Y' || y >= 5)) ch = 'd';
        }
        paintFloor(c, ch, x * TILE, y * TILE, x, y);
      }
    }
    // living room rug
    c.save();
    c.globalAlpha = 0.55;
    c.fillStyle = '#f7768e';
    c.beginPath();
    c.ellipse(7.6 * TILE, 9.3 * TILE, 2.6 * TILE, 1.7 * TILE, 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 0.5;
    c.strokeStyle = '#fdfbf3';
    c.lineWidth = 2;
    c.setLineDash([4, 4]);
    c.beginPath();
    c.ellipse(7.6 * TILE, 9.3 * TILE, 2.3 * TILE, 1.45 * TILE, 0, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.restore();
    // driveway markings
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 2;
    c.setLineDash([8, 8]);
    c.beginPath();
    c.moveTo(19.15 * TILE, 7.8 * TILE);
    c.lineTo(19.15 * TILE, 11.4 * TILE);
    c.moveTo(22.85 * TILE, 7.8 * TILE);
    c.lineTo(22.85 * TILE, 11.4 * TILE);
    c.stroke();
    c.setLineDash([]);
    // walls
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (MAP[y][x] === '#') paintWall(c, x, y);
    // doorways: a threshold strip
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        if (isSolid(x, y)) continue;
        const horiz = charAt(x - 1, y) === '#' && charAt(x + 1, y) === '#';
        const vert = charAt(x, y - 1) === '#' && charAt(x, y + 1) === '#';
        if (!horiz && !vert) continue;
        c.fillStyle = 'rgba(80,50,30,0.35)';
        if (horiz) c.fillRect(x * TILE + 2, y * TILE + TILE / 2 - 2, TILE - 4, 4);
        else c.fillRect(x * TILE + TILE / 2 - 2, y * TILE + 2, 4, TILE - 4);
      }
    // furniture, one shape per connected group
    const seen = new Set<string>();
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const ch = MAP[y][x];
        if (ch === '#' || !isSolid(x, y) || seen.has(`${x},${y}`)) continue;
        const g = group(x, y, ch, seen);
        paintFurniture(c, ch, g.x0 * TILE, g.y0 * TILE, (g.x1 - g.x0 + 1) * TILE, (g.y1 - g.y0 + 1) * TILE, ROOM_OF[y][x]);
      }
    // faint room names
    c.font = "13px 'Permanent Marker', cursive";
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(43,43,58,0.28)';
    const labels: Array<[string, number, number]> = [
      ['Bathroom', 2.5, 3.6],
      ["Ryno's room", 6.9, 3.5],
      ['Kitchen', 15.0, 1.5],
      ['Hallway', 4.5, 5.5],
      ['Living room', 5.6, 11.5],
      ['Garage', 15.5, 7.4],
    ];
    for (const [t, x, y] of labels) c.fillText(t, x * TILE, y * TILE);
  }

  function group(x: number, y: number, ch: string, seen: Set<string>) {
    const g = { x0: x, y0: y, x1: x, y1: y };
    const stack = [[x, y]];
    seen.add(`${x},${y}`);
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      g.x0 = Math.min(g.x0, cx);
      g.x1 = Math.max(g.x1, cx);
      g.y0 = Math.min(g.y0, cy);
      g.y1 = Math.max(g.y1, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        const k = `${nx},${ny}`;
        if (charAt(nx, ny) === ch && !seen.has(k)) {
          seen.add(k);
          stack.push([nx, ny]);
        }
      }
    }
    return g;
  }

  function paintFloor(c: CanvasRenderingContext2D, ch: string, px: number, py: number, tx: number, ty: number): void {
    const T = TILE;
    switch (ch) {
      case 'h':
      case 'c':
      case '.': {
        c.fillStyle = ch === 'c' ? '#a87749' : '#c8925a';
        c.fillRect(px, py, T, T);
        // plank seams: thin even lines
        c.fillStyle = 'rgba(58,51,64,0.22)';
        for (let i = 0; i < 4; i++) {
          c.fillRect(px, py + i * 7 + 6, T, 1);
          c.fillRect(px + ((tx * 11 + i * 9) % T), py + i * 7, 1, 7);
        }
        break;
      }
      case 'r':
        c.fillStyle = '#b9a7d6';
        c.fillRect(px, py, T, T);
        break;
      case 'b':
        c.fillStyle = '#d4eef9';
        c.fillRect(px, py, T, T);
        c.fillStyle = '#a9d3e6';
        c.fillRect(px, py + T / 2, T, 1);
        c.fillRect(px + T / 2, py, 1, T);
        c.fillRect(px, py, T, 1);
        c.fillRect(px, py, 1, T);
        break;
      case 'k':
        for (let j = 0; j < 2; j++)
          for (let i = 0; i < 2; i++) {
            c.fillStyle = (i + j + tx + ty) % 2 ? '#f4ead2' : '#e0b88c';
            c.fillRect(px + (i * T) / 2, py + (j * T) / 2, T / 2, T / 2);
          }
        break;
      case 'l':
        c.fillStyle = '#dcbc96';
        c.fillRect(px, py, T, T);
        break;
      case 'g':
        c.fillStyle = '#a7abb2';
        c.fillRect(px, py, T, T);
        if (tx === 15 && ty === 11) {
          c.fillStyle = 'rgba(30,30,40,0.25)';
          c.beginPath();
          c.ellipse(px + 10, py + 12, 9, 5, 0.3, 0, Math.PI * 2);
          c.fill();
        }
        break;
      case 'd':
        c.fillStyle = '#3a3d45';
        c.fillRect(px, py, T, T);
        break;
      default:
        // night lawn
        c.fillStyle = '#245c3c';
        c.fillRect(px, py, T, T);
    }
  }

  function paintWall(c: CanvasRenderingContext2D, x: number, y: number): void {
    const px = x * TILE;
    const py = y * TILE;
    // flat top face; a darker front face only where the wall meets floor below
    c.fillStyle = '#6d5c86';
    c.fillRect(px - 0.5, py - 0.5, TILE + 1, TILE + 1);
    const wall = (dx: number, dy: number) => charAt(x + dx, y + dy) === '#';
    if (!wall(0, 1)) {
      c.fillStyle = '#54476b';
      c.fillRect(px, py + TILE - 7, TILE, 7);
    }
    c.fillStyle = INK;
    if (!wall(-1, 0)) c.fillRect(px, py, LINE, TILE);
    if (!wall(1, 0)) c.fillRect(px + TILE - LINE, py, LINE, TILE);
    if (!wall(0, -1)) c.fillRect(px, py, TILE, LINE);
    if (!wall(0, 1)) c.fillRect(px, py + TILE - LINE, TILE, LINE);
  }

  function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke = true): void {
    c.fillStyle = fill;
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fill();
    if (stroke) {
      c.strokeStyle = INK;
      c.lineWidth = LINE;
      c.stroke();
    }
  }

  function redCup(c: CanvasRenderingContext2D, x: number, y: number): void {
    c.fillStyle = '#e5483d';
    c.beginPath();
    c.arc(x, y, 3.2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#fdfbf3';
    c.lineWidth = 1;
    c.stroke();
  }

  function paintFurniture(c: CanvasRenderingContext2D, ch: string, x: number, y: number, w: number, h: number, room: RoomId | null): void {
    switch (ch) {
      case 'T': // tub
        rr(c, x + 3, y + 3, w - 6, h - 6, 9, '#ffffff');
        rr(c, x + 7, y + 8, w - 14, h - 16, 7, '#9fd8f2', false);
        c.fillStyle = '#9aa0a6';
        c.beginPath();
        c.arc(x + w / 2, y + 7, 2.5, 0, Math.PI * 2);
        c.fill();
        break;
      case 'W': // toilet
        rr(c, x + 6, y + 2, w - 12, 8, 2, '#ffffff');
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.ellipse(x + w / 2, y + 17, 8, 9, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = 1.5;
        c.stroke();
        c.fillStyle = '#cfeaf6';
        c.beginPath();
        c.ellipse(x + w / 2, y + 18, 4.5, 5.5, 0, 0, Math.PI * 2);
        c.fill();
        break;
      case 'S': // sink
        rr(c, x + 3, y + 4, w - 6, h - 8, 4, '#ffffff');
        c.fillStyle = '#cfeaf6';
        c.beginPath();
        c.ellipse(x + w / 2 + 2, y + h / 2, 7, 6, 0, 0, Math.PI * 2);
        c.fill();
        break;
      case 'E': // bed
        rr(c, x + 3, y + 3, w - 6, h - 6, 4, '#8a5a32');
        rr(c, x + 5, y + 5, w - 10, h - 10, 3, '#fdfbf3', false);
        rr(c, x + 5, y + h * 0.36, w - 10, h * 0.64 - 5, 3, '#7aa6e8', false);
        rr(c, x + 9, y + 8, w / 2 - 12, 10, 4, '#ffffff');
        rr(c, x + w / 2 + 3, y + 8, w / 2 - 12, 10, 4, '#ffffff');
        // a heap of coats on the bed
        c.fillStyle = '#2f5fd0';
        c.beginPath();
        c.ellipse(x + w * 0.6, y + h * 0.66, 10, 6, 0.4, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#e8692f';
        c.beginPath();
        c.ellipse(x + w * 0.4, y + h * 0.72, 9, 5, -0.3, 0, Math.PI * 2);
        c.fill();
        break;
      case 'F': // fridge
        rr(c, x + 2, y + 2, w - 4, h - 4, 3, '#e3e9ef');
        c.fillStyle = '#9aa0a6';
        c.fillRect(x + 4, y + h * 0.45, w - 8, 1.5);
        c.fillRect(x + w - 8, y + 6, 2, 6);
        for (const [mx, my, col] of [[8, 8, '#f7768e'], [12, 18, '#f8de4f'], [17, 9, '#2fa66b']] as const) {
          c.fillStyle = col;
          c.fillRect(x + mx, y + my, 4, 4);
        }
        break;
      case 'K': // counter with sink and party mess
        rr(c, x, y + 2, w, h - 4, 3, '#d9cbb3');
        c.fillStyle = '#b9a98f';
        c.fillRect(x, y + h - 7, w, 3);
        rr(c, x + TILE * 1 + 4, y + 6, 20, 13, 4, '#cfd8df');
        for (let i = 0; i < 5; i++) redCup(c, x + TILE * 2 + 8 + i * 9, y + 10 + (i % 2) * 6);
        c.fillStyle = '#f2b53a';
        c.beginPath();
        c.arc(x + TILE * 3.5 + 6, y + 13, 6, 0, Math.PI * 2);
        c.fill();
        break;
      case 'I': // island: pizza box and cups
        rr(c, x + 1, y + 3, w - 2, h - 6, 4, '#b07d4a');
        rr(c, x + 6, y + 6, 28, 16, 2, '#e9d3a5');
        c.fillStyle = '#f2b53a';
        c.beginPath();
        c.arc(x + 20, y + 14, 6.5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#e5483d';
        for (const [dx, dy] of [[-2, -2], [3, 1], [-1, 3]]) c.fillRect(x + 20 + dx, y + 14 + dy, 2, 2);
        for (let i = 0; i < 6; i++) redCup(c, x + 46 + (i % 3) * 8, y + 9 + Math.floor(i / 3) * 9);
        break;
      case 'C': // couch
        rr(c, x + 2, y + 3, w - 4, h - 6, 6, '#3fa7a0');
        rr(c, x + 2, y + 3, w - 4, 7, 4, '#2d7f79', false);
        c.strokeStyle = 'rgba(0,0,0,0.2)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x + w / 2, y + 11);
        c.lineTo(x + w / 2, y + h - 4);
        c.stroke();
        break;
      case 'V': // TV against the wall
        rr(c, x + 4, y + h - 9, w - 8, 6, 2, '#1b1b1b');
        c.fillStyle = 'rgba(95,140,240,0.25)';
        c.beginPath();
        c.moveTo(x + 6, y + h - 9);
        c.lineTo(x + w - 6, y + h - 9);
        c.lineTo(x + w + 6, y - 6);
        c.lineTo(x - 6, y - 6);
        c.closePath();
        c.fill();
        rr(c, x + w / 2 - 10, y + h - 15, 20, 5, 2, '#5b5b6b');
        break;
      case 'P': // speaker
        rr(c, x + 3, y + 3, w - 6, h - 6, 3, '#1f1f28');
        c.fillStyle = '#4a4a5a';
        c.beginPath();
        c.arc(x + w / 2, y + h / 2 + 2, 7, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#1f1f28';
        c.beginPath();
        c.arc(x + w / 2, y + h / 2 + 2, 3, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#4a4a5a';
        c.beginPath();
        c.arc(x + w / 2, y + 7, 2.5, 0, Math.PI * 2);
        c.fill();
        break;
      case 'X': // snack table
        c.fillStyle = '#8a5a32';
        c.beginPath();
        c.arc(x + w / 2, y + h / 2, 11, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = 1.5;
        c.stroke();
        redCup(c, x + w / 2 - 4, y + h / 2 - 3);
        redCup(c, x + w / 2 + 4, y + h / 2 + 2);
        c.fillStyle = '#f2b53a';
        c.beginPath();
        c.arc(x + w / 2 - 3, y + h / 2 + 5, 3, 0, Math.PI * 2);
        c.fill();
        break;
      case 'Z':
        if (room === 'garage') {
          rr(c, x + 1, y + 2, w - 2, h - 8, 2, '#8e959e');
          for (let i = 0; i < Math.floor(w / 14); i++) rr(c, x + 4 + i * 14, y + 5, 10, 10, 1, i % 2 ? '#c69c6d' : '#d9b380');
        } else {
          rr(c, x + 1, y + 8, w - 2, h - 10, 2, '#8a5a32');
          const cols = ['#e5483d', '#2f5fd0', '#f2b53a', '#2fa66b', '#9b59b6', '#e8692f'];
          for (let i = 0; i < Math.floor((w - 6) / 6); i++) {
            c.fillStyle = cols[i % cols.length];
            c.fillRect(x + 4 + i * 6, y + 11, 4, 10 + (i % 3));
          }
        }
        break;
      case 'G': // beer pong table
        rr(c, x + 1, y + 4, w - 2, h - 8, 3, '#2f6fd0');
        c.fillStyle = 'rgba(255,255,255,0.7)';
        c.fillRect(x + w / 2 - 0.5, y + 5, 1, h - 10);
        for (const side of [0, 1]) {
          const bx = side ? x + w - 10 : x + 10;
          const dir = side ? -1 : 1;
          redCup(c, bx, y + h / 2);
          redCup(c, bx + dir * 6, y + h / 2 - 4);
          redCup(c, bx + dir * 6, y + h / 2 + 4);
        }
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.arc(x + w / 2 + 8, y + h / 2 - 2, 2, 0, Math.PI * 2);
        c.fill();
        break;
      case 'Q': // tree
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.beginPath();
        c.arc(x + w / 2 + 3, y + h / 2 + 4, 19, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#2b7546';
        c.strokeStyle = INK;
        c.lineWidth = LINE;
        c.beginPath();
        c.arc(x + w / 2, y + h / 2, 17, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.beginPath();
        c.arc(x + w / 2 - 4, y + h / 2 - 3, 7, Math.PI * 0.9, Math.PI * 1.9);
        c.stroke();
        break;
      case 'H': // hedge
        c.fillStyle = '#2b6a43';
        c.strokeStyle = INK;
        c.lineWidth = LINE;
        c.beginPath();
        c.moveTo(x, y + h - 5);
        for (let i = 0; i < w / 14; i++) c.arc(x + 7 + i * 14, y + h / 2, 8, Math.PI * 0.85, Math.PI * 0.15);
        c.lineTo(x + w, y + h - 5);
        c.closePath();
        c.fill();
        c.stroke();
        break;
      case 'Y':
        paintCar(c, x, y, w, h);
        break;
    }
  }

  /** Wes's pink car, top-down, nose towards the house (up). */
  function paintCar(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.roundRect(x + 3, y + 6, w - 2, h - 6, 12);
    c.fill();
    // wheels
    c.fillStyle = '#1b1b1b';
    for (const [wx, wy] of [[x + 2, y + 12], [x + w - 7, y + 12], [x + 2, y + h - 24], [x + w - 7, y + h - 24]]) c.fillRect(wx, wy, 5, 13);
    rr(c, x + 4, y + 2, w - 8, h - 4, 13, '#f39ac2');
    // hood and trunk shading
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.beginPath();
    c.roundRect(x + 9, y + 6, w - 18, 14, 6);
    c.fill();
    // windshield, roof, rear window
    rr(c, x + 9, y + 22, w - 18, 13, 4, '#bfe6fb');
    rr(c, x + 8, y + 36, w - 16, 26, 5, '#f7b6d3');
    rr(c, x + 10, y + 63, w - 20, 9, 3, '#bfe6fb');
    // headlights + mirrors
    c.fillStyle = '#fff3a8';
    c.fillRect(x + 8, y + 3, 7, 3);
    c.fillRect(x + w - 15, y + 3, 7, 3);
    c.fillStyle = '#f39ac2';
    c.fillRect(x + 1, y + 26, 4, 5);
    c.fillRect(x + w - 5, y + 26, 4, 5);
  }

  // ----------------------------------------------------------- dynamic bits
  const DISCO = ['#ff5aaa', '#5aaaff', '#ffe65a'];

  /** Party spotlights: flat translucent discs sliding over the dance floor. */
  function drawDisco(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(3 * TILE, 7 * TILE, 9 * TILE, 5 * TILE);
    ctx.clip();
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < DISCO.length; i++) {
      const x = 7.5 * TILE + Math.sin(clock * (0.9 + i * 0.3) + i * 2) * 3.4 * TILE;
      const y = 9.4 * TILE + Math.cos(clock * (1.1 + i * 0.2) + i) * 1.6 * TILE;
      ctx.fillStyle = DISCO[i];
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLights(ctx: CanvasRenderingContext2D): void {
    const runs: Array<[number, number, number]> = [
      [3 * TILE + 2, 12 * TILE - 2, 7 * TILE + 3],
      [10 * TILE + 2, 17 * TILE - 2, 1 * TILE + 3],
    ];
    const cols = ['#ff5a8a', '#ffe14d', '#5ad1ff', '#7dff8a', '#c58cff'];
    for (const [x0, x1, y] of runs) {
      ctx.strokeStyle = 'rgba(30,30,30,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const n = Math.floor((x1 - x0) / 13);
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        const sag = Math.sin((i % 4) / 4 * Math.PI) * 3;
        if (i === 0) ctx.moveTo(x, y + sag);
        else ctx.lineTo(x, y + sag);
      }
      ctx.stroke();
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        const sag = Math.sin((i % 4) / 4 * Math.PI) * 3;
        const tw = 0.55 + 0.45 * Math.sin(clock * 4 + i * 1.7);
        ctx.globalAlpha = tw;
        ctx.fillStyle = cols[i % cols.length];
        ctx.beginPath();
        ctx.arc(x, y + sag + 2, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = tw * 0.25;
        ctx.beginPath();
        ctx.arc(x, y + sag + 2, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawSpeaker(ctx: CanvasRenderingContext2D): void {
    const x = 13.5 * TILE;
    const y = 5.5 * TILE;
    const beat = (clock * 2) % 1;
    ctx.strokeStyle = `rgba(255,230,90,${0.6 * (1 - beat)})`;
    ctx.lineWidth = 2;
    for (const k of [0, 0.5]) {
      const b = (beat + k) % 1;
      ctx.beginPath();
      ctx.arc(x, y, 10 + b * 22, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.stroke();
    }
  }

  /** Where a mouse player is sending Wes: a small lemon ring. */
  function drawWalkTarget(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const r = 6 + Math.sin(clock * 8) * 1.2;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffe80f';
    ctx.stroke();
    ctx.fillStyle = '#ffe80f';
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCarMarker(ctx: CanvasRenderingContext2D): void {
    if (phase === 'win') return;
    const cx = CAR_RECT.x + CAR_RECT.w / 2;
    const cy = CAR_RECT.y + CAR_RECT.h / 2;
    const pulse = (clock * 1.2) % 1;
    ctx.strokeStyle = `rgba(255,232,15,${0.8 * (1 - pulse)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(CAR_RECT.x - 4 - pulse * 8, CAR_RECT.y - 4 - pulse * 8, CAR_RECT.w + 8 + pulse * 16, CAR_RECT.h + 8 + pulse * 16, 14);
    ctx.stroke();
    const bob = Math.sin(clock * 4) * 2;
    drawHoodie(ctx, cx, cy - 2 + bob, 34);
  }

  function drawHoodie(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const img = host.image(IMG.hoodie);
    if (img) {
      const k = Math.min(size / img.width, size / img.height);
      ctx.drawImage(img, x - (img.width * k) / 2, y - (img.height * k) / 2, img.width * k, img.height * k);
      return;
    }
    // folded grey hoodie
    rr(ctx, x - size / 2, y - size * 0.32, size, size * 0.64, 5, '#9aa3ad');
    ctx.fillStyle = '#7d8691';
    ctx.fillRect(x - size / 2 + 3, y - 2, size - 6, 3);
    ctx.strokeStyle = '#fdfbf3';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 4, y - size * 0.3);
    ctx.lineTo(x - 5, y + 4);
    ctx.moveTo(x + 4, y - size * 0.3);
    ctx.lineTo(x + 5, y + 4);
    ctx.stroke();
  }

  function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, p: Person, scale: number): void {
    if (p.clown) return drawClown(ctx, x, y, p);
    const r = PERSON_R * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(1.5, 2.5, r * 1.05, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    if (p.ghost > 0) ctx.globalAlpha = 0.75;
    ctx.rotate(p.face);
    const dancing = p.kind === 'dance';
    const sway = dancing ? Math.sin(clock * 8 + p.phase) : 0;
    // hands
    ctx.fillStyle = p.skin;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    const hx = dancing ? r * 0.75 + sway * 2 : r * 0.35;
    for (const side of [-1, 1]) {
      const up = dancing ? (side * sway > 0 ? 3 : -1) : 0;
      ctx.beginPath();
      ctx.arc(hx + up, side * r * 0.82, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (p.cup) {
      ctx.fillStyle = '#e5483d';
      ctx.beginPath();
      ctx.arc(hx + 2, r * 0.82, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fdfbf3';
      ctx.stroke();
    }
    // shoulders
    ctx.fillStyle = p.shirt;
    ctx.strokeStyle = INK;
    ctx.lineWidth = LINE;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.58, r * 0.98, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (p.style === 'neat') {
      // polo collar
      ctx.fillStyle = '#fdfbf3';
      ctx.fillRect(r * 0.2, -r * 0.25, r * 0.22, r * 0.5);
    }
    drawHead(ctx, r, p.hair, p.skin, p.style);
    ctx.restore();
  }

  const RAINBOW = ['#e5483d', '#ff9f43', '#ffe14d', '#2fa66b', '#2f5fd0', '#7c5cff'];

  /** Top-down clown: ruffle collar, polka dots, rainbow afro, white face, red nose, a balloon. */
  function drawClown(ctx: CanvasRenderingContext2D, x: number, y: number, p: Person): void {
    const r = PERSON_R * 1.25;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(58,51,64,0.22)';
    ctx.beginPath();
    ctx.ellipse(1.5, 2.5, r * 1.1, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    if (p.ghost > 0) ctx.globalAlpha = 0.8;
    ctx.rotate(p.face);
    ctx.strokeStyle = INK;
    ctx.lineWidth = LINE;
    // balloon on a string, bobbing beside the clown
    const bx = r * 0.4 + Math.sin(clock * 2 + p.phase) * 2;
    const by = r * 1.9;
    ctx.beginPath();
    ctx.moveTo(r * 0.35, r * 0.85);
    ctx.lineTo(bx, by - 6);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.lineWidth = LINE;
    ctx.fillStyle = '#e5483d';
    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // white gloves
    ctx.fillStyle = '#ffffff';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(r * 0.35, side * r * 0.85, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // polka-dot costume
    ctx.fillStyle = p.shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.6, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (const [dx, dy, c] of [[-0.25, -0.55, '#2f5fd0'], [-0.3, 0.5, '#e5483d'], [0.15, 0.7, '#2fa66b'], [0.1, -0.75, '#e5483d']] as const) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(dx * r, dy * r, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    // ruffle collar, pink and white scallops
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.fillStyle = i % 2 ? '#f9b6c8' : '#ffffff';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // rainbow afro around the back of the head
    const hr = r * 0.44;
    for (let i = 0; i < RAINBOW.length; i++) {
      const a = Math.PI * 0.5 + (i / (RAINBOW.length - 1)) * Math.PI;
      ctx.fillStyle = RAINBOW[i];
      ctx.beginPath();
      ctx.arc(Math.cos(a) * hr * 0.95 - r * 0.05, Math.sin(a) * hr * 1.05, hr * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // white face and the red nose up front
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r * 0.08, 0, hr * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e5483d';
    ctx.beginPath();
    ctx.arc(r * 0.08 + hr * 0.7, 0, hr * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawHead(ctx: CanvasRenderingContext2D, r: number, hair: string, skin: string, style: HairStyle): void {
    const hr = r * 0.58;
    if (style === 'long') {
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.ellipse(-r * 0.45, 0, r * 0.5, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = skin;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(r * 0.08, 0, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hair;
    if (style === 'curly') {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * 0.45 + (i / 8) * Math.PI * 1.1;
        ctx.beginPath();
        ctx.arc(r * 0.02 + Math.cos(a) * hr * 0.75, Math.sin(a) * hr * 0.85, hr * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (style === 'cap') {
      ctx.beginPath();
      ctx.arc(r * 0.02, 0, hr * 0.98, 0, Math.PI * 2);
      ctx.fill();
      // backwards: the brim sticks out behind
      ctx.fillRect(-r * 0.95, -hr * 0.5, r * 0.42, hr);
      ctx.fillStyle = '#fdfbf3';
      ctx.beginPath();
      ctx.arc(r * 0.02, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // hair covers the back of the head, face peeks out the front
      ctx.beginPath();
      ctx.arc(r * 0.02, 0, hr * 0.95, Math.PI * (style === 'neat' ? 0.42 : 0.32), Math.PI * (style === 'neat' ? 1.58 : 1.68));
      ctx.closePath();
      ctx.fill();
      if (style === 'bun') {
        ctx.beginPath();
        ctx.arc(-hr * 0.85, 0, hr * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (style === 'short') {
        // messy tufts
        for (const a of [0.55, 1.0, 1.45]) {
          ctx.beginPath();
          ctx.arc(r * 0.02 + Math.cos(Math.PI * a) * hr * 0.85, Math.sin(Math.PI * a) * hr * 0.85, hr * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawWes(ctx: CanvasRenderingContext2D): void {
    const x = wes.x;
    const y = wes.y;
    // glow ring so he's easy to find
    const pulse = 0.5 + 0.5 * Math.sin(clock * 5);
    ctx.fillStyle = `rgba(255,232,15,${0.22 + pulse * 0.18})`;
    ctx.beginPath();
    ctx.arc(x, y, WES_R + 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    let spin = 0;
    if (phase === 'lose') spin = phaseT * 10;
    if (stun > 0) spin = Math.sin(stun * 40) * (courage > COURAGE ? 0.5 : 0.25);
    const sq = squash > 0 ? 1 + 0.25 * Math.sin((squash / 0.25) * Math.PI) : 1;
    const step = Math.hypot(wes.vx, wes.vy) > 10 ? Math.sin(clock * 16) : 0;
    ctx.rotate(wes.face + spin);
    ctx.scale(1 / sq, sq);
    const r = WES_R * 1.08;
    // arms swing while walking
    ctx.fillStyle = '#f1c7a5';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(r * 0.3 + side * step * 3, side * r * 0.85, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // white No. 32 jersey
    ctx.fillStyle = '#fdfbf3';
    ctx.lineWidth = LINE;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.6, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#2f5fd0';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.6, r, 0, Math.PI * 0.6, Math.PI * 1.4);
    ctx.stroke();
    drawHead(ctx, r, '#2a211c', '#e0ac85', 'short');
    ctx.restore();
    if (phase === 'win') {
      const k = Math.min(1, phaseT / 0.45);
      const fx = CAR_RECT.x + CAR_RECT.w / 2;
      const fy = CAR_RECT.y + CAR_RECT.h / 2;
      const hx = fx + (x - fx) * k;
      const hy = fy + (y - 16 - fy) * k - Math.sin(k * Math.PI) * 30;
      drawHoodie(ctx, hx, hy, 26 + 6 * Math.sin(Math.min(1, phaseT / 0.6) * Math.PI));
    }
  }

  function drawFog(ctx: CanvasRenderingContext2D): void {
    // one path per fog level, so neighbouring tiles don't leave seams
    for (const list of fogLevels.values()) list.length = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const rs = tileRooms[y][x];
        let a = rs.length ? FOG_MAX : 0;
        for (const r of rs) a = Math.min(a, fogA[r]);
        if (a <= 0.01) continue;
        const key = Math.round(a * 50);
        let list = fogLevels.get(key);
        if (!list) fogLevels.set(key, (list = []));
        list.push(x, y);
      }
    }
    ctx.fillStyle = FOG;
    for (const [key, list] of fogLevels) {
      if (!list.length) continue;
      ctx.globalAlpha = key / 50;
      ctx.beginPath();
      for (let i = 0; i < list.length; i += 2) ctx.rect(list[i] * TILE, list[i + 1] * TILE, TILE, TILE);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // "?" over rooms not yet explored
    ctx.font = "20px 'Permanent Marker', cursive";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [r, c] of roomCentre) {
      if (fogA[r] < 0.3) continue;
      ctx.globalAlpha = (fogA[r] / FOG_MAX) * (0.35 + 0.15 * Math.sin(clock * 3 + c.x));
      ctx.fillStyle = '#ffffff';
      ctx.fillText('?', c.x, c.y);
    }
    ctx.globalAlpha = 1;
  }

  function bubble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string): void {
    ctx.font = "13px 'Patrick Hand', sans-serif";
    let w = bubbleW.get(text);
    if (w === undefined) bubbleW.set(text, (w = ctx.measureText(text).width + 12));
    const h = 18;
    const bx = Math.max(w / 2 + 2, Math.min(WORLD_W - w / 2 - 2, x));
    ctx.fillStyle = fill;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx - w / 2, y - h, w, h, 7);
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x, y + 5);
    ctx.lineTo(x + 4, y);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx, y - h / 2 + 1);
  }

  function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center'): void {
    ctx.font = `${size}px 'Permanent Marker', cursive`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.2);
    ctx.strokeStyle = INK;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawParts(ctx: CanvasRenderingContext2D): void {
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawTexts(ctx: CanvasRenderingContext2D): void {
    for (const t of texts) {
      const k = t.t / t.dur;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : k < 0.25 ? 1.1 - ((k - 0.15) / 0.1) * 0.1 : 1;
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.save();
      const tx = Math.max(60, Math.min(WORLD_W - 60, t.x));
      ctx.translate(tx, t.y - k * 14);
      ctx.scale(pop, pop);
      outlined(ctx, t.text, 0, 0, t.size, t.color);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------- game
  const game: MiniGame = {
    async init(h) {
      host = h;
      await h.load(Object.values(IMG));
      // the static layer bakes text into a canvas, so the fonts must be ready
      try {
        await Promise.all([document.fonts.load("13px 'Permanent Marker'"), document.fonts.load("13px 'Patrick Hand'")]);
      } catch {
        /* draw with fallback fonts */
      }
      makePeople();
      // best first guess before any input: a fine pointer without touch is a mouse/trackpad
      const fine = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches && !matchMedia('(any-pointer: coarse)').matches;
      scheme = fine ? 'mouse' : 'touch';
      layout();
      unResize = h.stage.onResize(layout);
      h.stage.canvas.addEventListener('pointerdown', onDownCapture, true);
      h.hud.setTimer(TIME_LIMIT, 5);
      hudText = el('span', {}, 'In your car');
      hudChip = el(
        'div',
        { class: 'hud-chip', 'data-testid': 'hud-clothes', style: 'gap:4px;padding:0 10px 0 6px' },
        el('img', { src: asset(IMG.hoodie), alt: 'Spare clothes', style: 'height:28px;width:auto' }),
        hudText,
      );
      h.hud.custom().appendChild(hudChip);
    },
    update,
    render,
    destroy() {
      unResize?.();
      host.stage.canvas.removeEventListener('pointerdown', onDownCapture, true);
      host.stage.canvas.style.cursor = '';
      hudChip?.remove();
      host.hud.setTimer(null);
      // WebKit holds canvas memory until GC; release it now
      if (cache) cache.width = cache.height = 0;
      cache = null;
    },
    debugApi() {
      const tileOf = () => ({ x: Math.floor(wes.x / TILE), y: Math.floor(wes.y / TILE) });
      // tiles the debug path should route around, e.g. ['18,7'] for the kitchen route
      let avoid = new Set<string>();
      let goals = GOAL_TILES;
      return {
        state: () => {
          const rect = host.stage.canvas.getBoundingClientRect();
          const sc = host.stage.scale;
          return {
            phase,
            x: wes.x,
            y: wes.y,
            tile: tileOf(),
            timeLeft,
            stunned: stun > 0,
            bumps,
            panics,
            clown: (() => {
              const c = people.find((q) => q.clown);
              return c ? { x: c.x, y: c.y } : null;
            })(),
            revealed: [...revealed],
            path: bfs(tileOf(), goals, avoid),
            clientX: rect.left + (view.ox + wes.x * view.s) * sc,
            clientY: rect.top + (view.oy + wes.y * view.s) * sc,
            tile_px: TILE,
            stickR,
            scheme,
            walkTo,
            walkSteps: walkPath.length,
            view,
            sc,
            rect: { left: rect.left, top: rect.top },
            speed: BASE_SPEED * host.speed,
            car: { x: CAR_RECT.x + CAR_RECT.w / 2, y: CAR_RECT.y + CAR_RECT.h / 2 },
          };
        },
        avoid: (tiles: string[]) => {
          avoid = new Set(tiles);
        },
        goto: (tx: number | null, ty = 0) => {
          goals = tx === null ? GOAL_TILES : [{ x: tx, y: ty }];
        },
        teleport: (tx: number, ty: number) => {
          wes.x = (tx + 0.5) * TILE;
          wes.y = (ty + 0.5) * TILE;
        },
        win: () => {
          const g = GOAL_TILES[0];
          if (phase === 'ready') phase = 'run';
          wes.x = (g.x + 0.5) * TILE;
          wes.y = (g.y + 0.5) * TILE;
        },
        lose: () => {
          if (phase === 'ready') phase = 'run';
          timeLeft = 0.001;
        },
      };
    },
  };
  return game;
};

export default factory;
