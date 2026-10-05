import { describe, expect, it } from 'vitest';
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
  ROOM_OF,
  ROWS,
  START,
  TILE,
  TIME_LIMIT,
  WORLD_H,
  WORLD_W,
  atCar,
  bfs,
  isSolid,
  MOUSE_DEAD,
  moveCircle,
  roomAt,
  steerToward,
} from '../src/games/l3-maze/map';

const secondsFor = (tiles: number) => (tiles * TILE) / BASE_SPEED;

describe('L3 party maze', () => {
  it('is a rectangular map that fits the stage under the HUD', () => {
    for (const row of MAP) expect(row.length).toBe(COLS);
    // same fit as layout(): 400 tall stage minus 44 for the HUD, every phone width
    for (const W of [711, 780, 866]) {
      const drawnTile = TILE * Math.min(W / WORLD_W, 356 / WORLD_H);
      expect(drawnTile).toBeGreaterThanOrEqual(26);
      expect(drawnTile).toBeLessThanOrEqual(30);
    }
    expect(TIME_LIMIT).toBe(15);
  });

  it('starts Wes on a bathroom floor tile', () => {
    expect(isSolid(START.x, START.y)).toBe(false);
    expect(ROOM_OF[START.y][START.x]).toBe('bath');
  });

  it('has a reachable car whose shortest route takes 8-10 s at base speed', () => {
    const path = bfs(START);
    expect(path).not.toBeNull();
    const steps = path!.length - 1;
    const t = secondsFor(steps);
    expect(t).toBeGreaterThanOrEqual(7.5);
    expect(t).toBeLessThanOrEqual(10);
    // tense but fair: at least 4 s of slack for a wrong turn or a bump
    expect(TIME_LIMIT - t).toBeGreaterThanOrEqual(4);
  });

  it('offers two routes: living room + garage, or kitchen + back door', () => {
    const viaGarage = bfs(START, GOAL_TILES, new Set(['17,1'])); // back door shut
    const viaKitchen = bfs(START, GOAL_TILES, new Set(['18,7'])); // garage door shut
    expect(viaGarage).not.toBeNull();
    expect(viaKitchen).not.toBeNull();
    const rooms = (p: Array<{ x: number; y: number }>) => new Set(p.map((t) => ROOM_OF[t.y][t.x]));
    expect(rooms(viaGarage!).has('living')).toBe(true);
    expect(rooms(viaGarage!).has('garage')).toBe(true);
    expect(rooms(viaKitchen!).has('kitchen')).toBe(true);
    for (const p of [viaGarage!, viaKitchen!]) expect(secondsFor(p.length - 1)).toBeLessThanOrEqual(10.5);
  });

  it('has dead ends (bedroom, closet) that do not lead to the car', () => {
    let count = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (isSolid(x, y)) continue;
        let open = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!isSolid(x + dx, y + dy)) open++;
        if (open === 1) count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(3);
    // the closet and the bedroom are reachable but are not on the shortest path
    const path = bfs(START)!;
    const on = new Set(path.map((t) => ROOM_OF[t.y][t.x]));
    expect(on.has('closet')).toBe(false);
    expect(on.has('bedroom')).toBe(false);
    expect(bfs(START, [{ x: 1, y: 9 }])).not.toBeNull();
    expect(bfs(START, [{ x: 7, y: 2 }])).not.toBeNull();
  });

  it('every goal tile touches the car', () => {
    for (const g of GOAL_TILES) expect(atCar((g.x + 0.5) * TILE, (g.y + 0.5) * TILE, 9)).toBe(true);
    expect(atCar(CAR_RECT.x - 40, CAR_RECT.y - 40, 9)).toBe(false);
  });

  it('slides along walls instead of sticking or tunnelling', () => {
    // in the hallway (row 5) under a solid wall, pushing up-right keeps moving right
    const p = { x: 3.5 * TILE, y: 5.5 * TILE };
    for (let i = 0; i < 20; i++) moveCircle(p, 3, -3, 9);
    expect(p.y).toBeCloseTo(5 * TILE + 9, 0);
    expect(p.x).toBeCloseTo(3.5 * TILE + 60, 0);
    // a huge step into a wall never passes through it
    const q = { x: 2.5 * TILE, y: 5.5 * TILE };
    moveCircle(q, 0, 200, 9);
    expect(q.y).toBeLessThanOrEqual(6 * TILE - 9 + 0.01);
  });

  it('rounds corners into a doorway when slightly off-centre', () => {
    // just right of the bathroom door's centre line, walking down from the bathroom
    const p = { x: 2.5 * TILE + 6, y: 3.5 * TILE };
    for (let i = 0; i < 40; i++) moveCircle(p, 0, 2, 9);
    expect(p.y).toBeGreaterThan(5 * TILE);
  });

  describe('the clown (Wes is deathly afraid of clowns)', () => {
    /** Points along the clown's patrol loop, world units. */
    const patrol = (() => {
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < CLOWN_PATH.length; i++) {
        const [ax, ay] = CLOWN_PATH[i];
        const [bx, by] = CLOWN_PATH[(i + 1) % CLOWN_PATH.length];
        for (let k = 0; k < 20; k++) pts.push({ x: (ax + (bx - ax) * (k / 20)) * TILE, y: (ay + (by - ay) * (k / 20)) * TILE });
      }
      return pts;
    })();
    const centre = (t: { x: number; y: number }) => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE });
    const closest = (path: Array<{ x: number; y: number }>) =>
      Math.min(...path.flatMap((t) => patrol.map((c) => Math.hypot(centre(t).x - c.x, centre(t).y - c.y))));

    it('patrols walkable garage floor', () => {
      for (const c of patrol) {
        expect(roomAt(c.x, c.y)).toBe('garage');
        for (const [dx, dy] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) {
          expect(isSolid(Math.floor((c.x + dx) / TILE), Math.floor((c.y + dy) / TILE))).toBe(false);
        }
      }
      expect(CLOWN_SPEED).toBeLessThan(BASE_SPEED / 3); // wanders slowly
    });

    it('is a real obstacle on the shortest (garage) route', () => {
      const viaGarage = bfs(START, GOAL_TILES, new Set(['17,1']))!;
      expect(closest(viaGarage)).toBeLessThan(PANIC_R);
    });

    it('never comes near the kitchen route, so avoiding it keeps the full margin', () => {
      const viaKitchen = bfs(START, GOAL_TILES, new Set(['18,7']))!;
      expect(closest(viaKitchen)).toBeGreaterThan(PANIC_R + 9);
      expect(TIME_LIMIT - secondsFor(viaKitchen.length - 1)).toBeGreaterThanOrEqual(5);
    });

    it('leaves the garage passable when timed (the clown at the far end of its patrol)', () => {
      const [cx, cy] = CLOWN_PATH[0];
      const scary = new Set<string>();
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++)
          if (Math.hypot((x + 0.5 - cx) * TILE, (y + 0.5 - cy) * TILE) < PANIC_R + 9) scary.add(`${x},${y}`);
      expect(bfs({ x: 12, y: 11 }, [{ x: 18, y: 7 }], scary)).not.toBeNull();
    });

    it('a player who panics once on the garage route still has slack', () => {
      const viaGarage = bfs(START, GOAL_TILES, new Set(['17,1']))!;
      // frozen, plus walking back the ~30 units the knockback threw him
      const panicCost = PANIC_STUN + 30 / BASE_SPEED;
      expect(TIME_LIMIT - secondsFor(viaGarage.length - 1) - panicCost).toBeGreaterThanOrEqual(5);
      expect(COURAGE).toBeGreaterThan(1); // enough nerve to get past before panicking again
    });
  });

  describe('mouse steering (walk toward the cursor)', () => {
    it('heads straight for the cursor at full speed beyond the dead zone', () => {
      const d = steerToward(100, 100, 160, 180);
      expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 10);
      expect(d.x).toBeCloseTo(0.6, 10);
      expect(d.y).toBeCloseTo(0.8, 10);
      const near = steerToward(100, 100, 100 + MOUSE_DEAD + 0.5, 100);
      expect(near).toEqual({ x: 1, y: 0 }); // no ramp: still full speed just outside
    });

    it('stops cleanly inside the ~14 unit dead zone', () => {
      expect(MOUSE_DEAD).toBeGreaterThanOrEqual(12);
      expect(MOUSE_DEAD).toBeLessThanOrEqual(16);
      expect(steerToward(100, 100, 100, 100)).toEqual({ x: 0, y: 0 });
      expect(steerToward(100, 100, 100 + MOUSE_DEAD * 0.7, 100 - MOUSE_DEAD * 0.7)).toEqual({ x: 0, y: 0 });
    });

    it('gets Wes to the car by holding the cursor a few tiles ahead on the route, in time', () => {
      // a simple mouse player: re-aims every 0.2 s at the tile 2 ahead on the shortest route
      const p = { x: (START.x + 0.5) * TILE, y: (START.y + 0.5) * TILE };
      let aim = { x: p.x, y: p.y };
      let t = 0;
      let next = 0;
      const dt = 1 / 60;
      while (!atCar(p.x, p.y, 9) && t < TIME_LIMIT) {
        if (t >= next) {
          const path = bfs({ x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) })!;
          const k = path[Math.min(2, path.length - 1)];
          aim = path.length > 1 ? { x: (k.x + 0.5) * TILE, y: (k.y + 0.5) * TILE } : { x: CAR_RECT.x + CAR_RECT.w / 2, y: CAR_RECT.y + CAR_RECT.h / 2 };
          next = t + 0.2;
        }
        const d = steerToward(p.x, p.y, aim.x, aim.y);
        moveCircle(p, d.x * BASE_SPEED * dt, d.y * BASE_SPEED * dt, 9);
        t += dt;
      }
      expect(atCar(p.x, p.y, 9)).toBe(true);
      expect(TIME_LIMIT - t).toBeGreaterThanOrEqual(4); // people aside, plenty of slack
    });
  });
});
