/**
 * Level 3 map: Ryno's party house, top-down, plus the pure maze logic
 * (rooms, BFS, circle-vs-tile collision) so it can be unit tested.
 *
 * Wes starts in the bathroom (top-left) and has to reach his pink car on
 * the driveway (right). Two routes: through the dancing crowd in the
 * living room and out the garage, or through the kitchen and out the back
 * door. The bedroom, the closet and the hallway end are dead ends.
 */

export const TILE = 28;
/** Wes's base walking speed in world units per second (×host.speed). */
export const BASE_SPEED = 105;
export const TIME_LIMIT = 15;

// Floors: b bath, r bedroom, k kitchen, h hallway, c closet, l living room,
//         g garage, . doorway, o lawn, d driveway.
// Solids: # wall, T tub, W toilet, S sink, E bed, F fridge, K counter,
//         I kitchen island, C couch, V TV, P speaker, X snack table,
//         Z shelves, G beer pong table, Q tree, H hedge, Y Wes's car.
export const MAP: readonly string[] = [
  '##################HHHHHH',
  '#TbW#EErr#FKKKKkk.oooooo',
  '#Tbb#EErr#kkkkkkk#ooQooo',
  '#Sbb#rrrr#kkIIIkk#oooooo',
  '##b####r##k#######HHHHoo',
  '#hhhhhhhhhhhhPX####ddddo',
  '#h####hhh####ZZZgg#ddddd',
  '#h#lllllllll#ggggg.ddddd',
  '#c#lCCllllll#ggggg#dYYdd',
  '#c#llllllCCl#gGGgg#dYYdd',
  '###lllllllll#ggggg#dYYdd',
  '#ZZlllVVllll.ggggg#ddddd',
  '##################dddddd',
];

export const COLS = MAP[0].length;
export const ROWS = MAP.length;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export const START = { x: 3, y: 2 };

/**
 * "Bennett's fatal flaw is that he is deathly afraid of clowns." One
 * clown wanders the right half of the garage, on the shortest route; the
 * kitchen route never comes near. Coordinates are tile units (x.5 = centre).
 */
export const CLOWN_PATH: ReadonlyArray<readonly [number, number]> = [
  [16.6, 10.7],
  [17.35, 9.2],
  [16.5, 7.7],
  [17.35, 9.2],
];
export const CLOWN_SPEED = 18;
/** Wes panics when the clown is this close (world units). */
export const PANIC_R = 1.6 * TILE;
/** Seconds Wes is frozen by a panic (a normal bump is 0.35). */
export const PANIC_STUN = 0.6;
/** After a panic Wes works up the nerve to slip past for this long. */
export const COURAGE = 1.4;

const SOLID = new Set('#TWSEFKICVPXZGQHY'.split(''));
const FLOOR_ROOM: Record<string, RoomId> = {
  b: 'bath',
  r: 'bedroom',
  k: 'kitchen',
  h: 'hall',
  c: 'closet',
  l: 'living',
  g: 'garage',
  o: 'out',
  d: 'out',
};

export type RoomId = 'bath' | 'bedroom' | 'kitchen' | 'hall' | 'closet' | 'living' | 'garage' | 'out';

export const ROOM_NAMES: Record<RoomId, string> = {
  bath: 'Bathroom',
  bedroom: "Ryno's Room",
  kitchen: 'Kitchen',
  hall: 'Hallway',
  closet: 'Closet',
  living: 'Living Room',
  garage: 'Garage',
  out: 'Driveway',
};

export function charAt(tx: number, ty: number): string {
  if (ty < 0 || ty >= ROWS || tx < 0 || tx >= COLS) return '#';
  return MAP[ty][tx];
}

export function isSolid(tx: number, ty: number): boolean {
  return SOLID.has(charAt(tx, ty));
}

/**
 * Room of every tile. Floors take their own room; furniture takes the room
 * of the floor next to it; walls and doorways get null.
 */
export const ROOM_OF: Array<Array<RoomId | null>> = (() => {
  const rooms: Array<Array<RoomId | null>> = MAP.map((row) => [...row].map((c) => FLOOR_ROOM[c] ?? null));
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = MAP[y][x];
        if (rooms[y][x] || c === '#' || c === '.') continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const r = rooms[y + dy]?.[x + dx];
          if (r) {
            rooms[y][x] = r;
            changed = true;
            break;
          }
        }
      }
    }
  }
  return rooms;
})();

export function roomAt(px: number, py: number): RoomId | null {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  return ROOM_OF[ty]?.[tx] ?? null;
}

/** Tiles of the car. */
export const CAR_TILES: Array<{ x: number; y: number }> = (() => {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (MAP[y][x] === 'Y') out.push({ x, y });
  return out;
})();

/** Car rectangle in world units. */
export const CAR_RECT = (() => {
  const xs = CAR_TILES.map((t) => t.x);
  const ys = CAR_TILES.map((t) => t.y);
  const x0 = Math.min(...xs) * TILE;
  const y0 = Math.min(...ys) * TILE;
  return { x: x0, y: y0, w: (Math.max(...xs) + 1) * TILE - x0, h: (Math.max(...ys) + 1) * TILE - y0 };
})();

/** Walkable tiles touching the car: reaching any of them wins. */
export const GOAL_TILES: Array<{ x: number; y: number }> = (() => {
  const seen = new Set<string>();
  const out: Array<{ x: number; y: number }> = [];
  for (const t of CAR_TILES) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = t.x + dx;
      const y = t.y + dy;
      const k = `${x},${y}`;
      if (!isSolid(x, y) && !seen.has(k)) {
        seen.add(k);
        out.push({ x, y });
      }
    }
  }
  return out;
})();

/** Is a circle at (x, y) with radius r touching the car (with a small margin)? */
export function atCar(x: number, y: number, r: number): boolean {
  const c = CAR_RECT;
  const cx = Math.max(c.x, Math.min(x, c.x + c.w));
  const cy = Math.max(c.y, Math.min(y, c.y + c.h));
  return Math.hypot(x - cx, y - cy) <= r + 6;
}

/**
 * Shortest 4-connected tile path from `from` to any goal tile, including
 * both ends. Optional `blocked` tiles ("x,y") are treated as solid.
 */
export function bfs(
  from: { x: number; y: number },
  goals: Array<{ x: number; y: number }> = GOAL_TILES,
  blocked: Set<string> = new Set(),
): Array<{ x: number; y: number }> | null {
  const goal = new Set(goals.map((g) => `${g.x},${g.y}`));
  const key = (x: number, y: number) => `${x},${y}`;
  const prev = new Map<string, string | null>();
  prev.set(key(from.x, from.y), null);
  const q: Array<{ x: number; y: number }> = [from];
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    const ck = key(c.x, c.y);
    if (goal.has(ck)) {
      const path: Array<{ x: number; y: number }> = [];
      let k: string | null = ck;
      while (k) {
        const [x, y] = k.split(',').map(Number);
        path.push({ x, y });
        k = prev.get(k) ?? null;
      }
      return path.reverse();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      const nk = key(nx, ny);
      if (prev.has(nk) || isSolid(nx, ny) || blocked.has(nk)) continue;
      prev.set(nk, ck);
      q.push({ x: nx, y: ny });
    }
  }
  return null;
}

/** Scratch list for resolve(), reused so collision doesn't allocate per frame. */
const near: Array<{ tx: number; ty: number; d: number }> = [];

/** Mouse steering: Wes stops this close (world units) to the cursor or clicked spot. */
export const MOUSE_DEAD = 14;

/**
 * Mouse steering: full-speed unit direction from (x, y) toward (tx, ty),
 * or zero inside the dead zone so Wes stops cleanly on the spot.
 */
export function steerToward(x: number, y: number, tx: number, ty: number, dead = MOUSE_DEAD): { x: number; y: number } {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy);
  if (d <= dead) return { x: 0, y: 0 };
  return { x: dx / d, y: dy / d };
}

/** Push a circle out of every solid tile it overlaps. */
function resolve(p: { x: number; y: number }, r: number): boolean {
  let hit = false;
  let n = 0;
  const tx0 = Math.floor((p.x - r) / TILE);
  const tx1 = Math.floor((p.x + r) / TILE);
  const ty0 = Math.floor((p.y - r) / TILE);
  const ty1 = Math.floor((p.y + r) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!isSolid(tx, ty)) continue;
      const cx = Math.max(tx * TILE, Math.min(p.x, tx * TILE + TILE));
      const cy = Math.max(ty * TILE, Math.min(p.y, ty * TILE + TILE));
      const e = near[n] ?? (near[n] = { tx: 0, ty: 0, d: 0 });
      e.tx = tx;
      e.ty = ty;
      e.d = Math.hypot(p.x - cx, p.y - cy);
      n++;
    }
  }
  // nearest first, so a flat wall wins over the corner of the tile beside it
  // (otherwise sliding along a wall jitters sideways at every tile seam)
  for (let i = 1; i < n; i++) {
    const e = near[i];
    let j = i - 1;
    while (j >= 0 && near[j].d > e.d) {
      near[j + 1] = near[j];
      j--;
    }
    near[j + 1] = e;
  }
  for (let i = 0; i < n; i++) {
    const { tx, ty } = near[i];
    const x0 = tx * TILE;
    const y0 = ty * TILE;
    const cx = Math.max(x0, Math.min(p.x, x0 + TILE));
    const cy = Math.max(y0, Math.min(p.y, y0 + TILE));
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.hypot(dx, dy);
    if (d >= r) continue;
    hit = true;
    if (d > 1e-6) {
      p.x += (dx / d) * (r - d);
      p.y += (dy / d) * (r - d);
    } else {
      // centre inside the tile: leave along the shallowest axis that opens
      // onto a free tile
      const exits: Array<[number, () => void, boolean]> = [
        [p.x - x0, () => (p.x = x0 - r), !isSolid(tx - 1, ty)],
        [x0 + TILE - p.x, () => (p.x = x0 + TILE + r), !isSolid(tx + 1, ty)],
        [p.y - y0, () => (p.y = y0 - r), !isSolid(tx, ty - 1)],
        [y0 + TILE - p.y, () => (p.y = y0 + TILE + r), !isSolid(tx, ty + 1)],
      ];
      const open = exits.filter((e) => e[2]);
      (open.length ? open : exits).sort((a, b) => a[0] - b[0])[0][1]();
    }
  }
  return hit;
}

/**
 * Move a circle by (dx, dy), sliding along walls. Sub-steps so a fast
 * move never tunnels through a tile. Returns true if it touched a wall.
 */
export function moveCircle(p: { x: number; y: number }, dx: number, dy: number, r: number): boolean {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r * 0.5)));
  let hit = false;
  for (let i = 0; i < steps; i++) {
    p.x += dx / steps;
    hit = resolve(p, r) || hit;
    p.y += dy / steps;
    hit = resolve(p, r) || hit;
  }
  return hit;
}
