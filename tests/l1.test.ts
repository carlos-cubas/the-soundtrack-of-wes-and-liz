import { describe, expect, it } from 'vitest';
import {
  BALL,
  BALL_FLOORS,
  DOLL_X,
  FLOORS,
  FROG,
  LADDERS,
  ROOF,
  START_X,
  Sim,
  circleRect,
  findLadder,
  landingFloor,
  rollSpeed,
  surfaceY,
  throwInterval,
  type SimEvent,
} from '../src/games/l1-frog/sim';

const DT = 1 / 60;
const idle = { x: 0, y: 0, jump: false };

describe('l1 girder geometry', () => {
  it('interpolates the girder surface', () => {
    const f = FLOORS[1];
    expect(surfaceY(f, f.x0)).toBe(f.y0);
    expect(surfaceY(f, f.x1)).toBeCloseTo(f.y1);
    expect(surfaceY(f, (f.x0 + f.x1) / 2)).toBeCloseTo((f.y0 + f.y1) / 2);
  });

  it('slants the girders alternately and balls roll downhill', () => {
    for (let i = 1; i < BALL_FLOORS; i++) {
      const f = FLOORS[i];
      const downhill = f.y1 > f.y0 ? 1 : -1;
      expect(f.dir).toBe(downhill);
    }
    for (let i = 2; i < BALL_FLOORS; i++) expect(FLOORS[i].dir).toBe(-FLOORS[i - 1].dir);
  });

  it('stacks floors from the ground up to the roof with room for the frog', () => {
    for (let i = 1; i < FLOORS.length; i++) {
      const lo = FLOORS[i - 1];
      const hi = FLOORS[i];
      for (const x of [Math.max(lo.x0, hi.x0), Math.min(lo.x1, hi.x1)]) {
        expect(surfaceY(lo, x) - surfaceY(hi, x)).toBeGreaterThan(40);
      }
    }
  });

  it("leaves a floor below each girder's downhill end to catch the balls", () => {
    for (let i = 1; i < BALL_FLOORS; i++) {
      const f = FLOORS[i];
      const edge = f.dir > 0 ? f.x1 + 18 : f.x0 - 18;
      const below = FLOORS[i - 1];
      expect(edge).toBeGreaterThan(below.x0);
      expect(edge).toBeLessThan(below.x1);
    }
  });

  it('keeps the top-left HUD corner clear', () => {
    for (const f of FLOORS) expect(Math.min(f.y0, f.y1) > 44 || f.x0 > 110).toBe(true);
  });
});

describe('l1 ladders', () => {
  it('connects every floor to the roof with climbable ladders', () => {
    const reach = new Set([0]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const l of LADDERS) {
        if (!l.broken && reach.has(l.lower) && !reach.has(l.upper)) {
          reach.add(l.upper);
          grew = true;
        }
      }
    }
    expect(reach.has(ROOF)).toBe(true);
    for (let i = 0; i < ROOF; i++) {
      expect(LADDERS.filter((l) => l.lower === i && !l.broken).length).toBeGreaterThanOrEqual(1);
      expect(LADDERS.filter((l) => l.lower === i).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('places every ladder over both of its floors', () => {
    for (const l of LADDERS) {
      expect(l.upper).toBe(l.lower + 1);
      const lo = FLOORS[l.lower];
      const hi = FLOORS[l.upper];
      expect(l.x).toBeGreaterThan(Math.max(lo.x0, hi.x0) + 8);
      expect(l.x).toBeLessThan(Math.min(lo.x1, hi.x1) - 8);
    }
  });

  it('finds the ladder in reach, by direction, ignoring broken ones', () => {
    expect(findLadder(LADDERS, 0, 170, 'up')?.x).toBe(170);
    expect(findLadder(LADDERS, 0, 178, 'up')?.x).toBe(170);
    expect(findLadder(LADDERS, 0, 170 + FROG.grabTol + 1, 'up')).toBeNull();
    expect(findLadder(LADDERS, 0, 170, 'down')).toBeNull();
    expect(findLadder(LADDERS, 1, 170, 'down')?.x).toBe(170);
    // broken ladder at x 440 between floors 0 and 1
    expect(findLadder(LADDERS, 0, 440, 'up')).toBeNull();
    expect(findLadder(LADDERS, 4, 226, 'up')?.upper).toBe(ROOF);
  });
});

describe('l1 collisions', () => {
  it('overlaps a circle and a rectangle', () => {
    expect(circleRect(5, 5, 2, 0, 0, 10, 10)).toBe(true);
    expect(circleRect(-3, 5, 2, 0, 0, 10, 10)).toBe(false);
    expect(circleRect(-1.5, 5, 2, 0, 0, 10, 10)).toBe(true);
    // corner: distance sqrt(2)*2 ≈ 2.83 > 2.5
    expect(circleRect(-2, -2, 2.5, 0, 0, 10, 10)).toBe(false);
    expect(circleRect(-1, -1, 2.5, 0, 0, 10, 10)).toBe(true);
  });

  it('lands a falling ball on the highest floor it crosses', () => {
    const x = 300;
    const f4 = surfaceY(FLOORS[4], x);
    expect(landingFloor(FLOORS, x, f4 - 2, f4 + 1)).toBe(4);
    expect(landingFloor(FLOORS, x, f4 - 10, f4 - 5)).toBe(-1);
    // never lands on the roof (balls are thrown over it)
    const roof = FLOORS[ROOF].y0;
    expect(landingFloor(FLOORS, 150, roof - 2, roof + 2)).toBe(-1);
    // off the right end of F4 the next floor down is F3
    const f3 = surfaceY(FLOORS[3], 630);
    expect(landingFloor(FLOORS, 630, f3 - 3, f3 + 3)).toBe(3);
  });

  it('ramps difficulty within bounds', () => {
    expect(throwInterval(0)).toBeCloseTo(3.0);
    expect(throwInterval(120)).toBeCloseTo(1.8);
    expect(rollSpeed(0)).toBeLessThan(rollSpeed(30));
    expect(rollSpeed(1000)).toBeLessThanOrEqual(120);
  });
});

function run(sim: Sim, secs: number, input = idle, until?: (e: SimEvent[]) => boolean): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < secs / DT; i++) {
    const ev = sim.step(DT, input);
    all.push(...ev);
    if (until?.(ev)) break;
  }
  return all;
}

describe('l1 simulation', () => {
  it('rolls a thrown ball all the way down the Dreamhouse into the toy box', () => {
    const sim = new Sim({ seed: 3 });
    sim.god = true;
    const floors = new Set<number>();
    let chest = false;
    for (let i = 0; i < 60 / DT && !chest; i++) {
      const ev = sim.step(DT, idle);
      if (sim.balls[0]) floors.add(sim.balls[0].floor);
      sim.throwing = sim.liveBalls() === 0 && floors.size === 0;
      chest = ev.some((e) => e.type === 'chest');
    }
    expect(chest).toBe(true);
    expect(floors.has(4)).toBe(true);
    expect(floors.has(0)).toBe(true);
  });

  it('walks the frog to the first ladder and climbs it', () => {
    const sim = new Sim({ seed: 1 });
    sim.throwing = false;
    run(sim, 20, { x: -1, y: -1, jump: false }, () => sim.frog.floor === 1);
    expect(sim.frog.floor).toBe(1);
    expect(sim.frog.state).toBe('walk');
    expect(sim.frog.x).toBe(170);
    expect(sim.frog.y).toBeCloseTo(surfaceY(FLOORS[1], 170));
  });

  it('cannot climb a broken ladder', () => {
    const sim = new Sim({ seed: 1 });
    sim.throwing = false;
    sim.place(0, 440);
    run(sim, 2, { x: 0, y: -1, jump: false });
    expect(sim.frog.floor).toBe(0);
    expect(sim.frog.state).toBe('walk');
  });

  it('scores 100 for jumping over a ball and gets hit when standing still', () => {
    const sim = new Sim({ seed: 1 });
    sim.throwing = false;
    sim.frog.safeT = 0;
    // ground balls roll right, toward a frog standing at START_X
    const b = sim.spawnRolling(0, START_X - 120);
    let jumped = false;
    let hit = false;
    for (let i = 0; i < 4 / DT; i++) {
      const gap = sim.frog.x - b.x;
      const ev = sim.step(DT, { x: 0, y: 0, jump: !jumped && gap < 32 });
      if (ev.some((e) => e.type === 'jump')) jumped = true;
      if (ev.some((e) => e.type === 'hit')) hit = true;
    }
    expect(jumped).toBe(true);
    expect(hit).toBe(false);
    expect(sim.score).toBe(100);
    expect(sim.jumpedCount).toBe(1);

    const sim2 = new Sim({ seed: 1 });
    sim2.throwing = false;
    sim2.frog.safeT = 0;
    sim2.spawnRolling(0, START_X - 120);
    const ev2 = run(sim2, 4, idle, (e) => e.some((x) => x.type === 'hit'));
    expect(ev2.some((e) => e.type === 'hit')).toBe(true);
    expect(sim2.frog.state).toBe('hurt');
  });

  it('wins next to the doll on the roof', () => {
    const sim = new Sim({ seed: 1 });
    sim.place(4, 226);
    const ev = run(sim, 6, { x: -1, y: -1, jump: false }, (e) => e.some((x) => x.type === 'win'));
    expect(ev.some((e) => e.type === 'climbEnd' && e.floor === ROOF)).toBe(true);
    expect(ev.some((e) => e.type === 'win')).toBe(true);
    expect(Math.abs(sim.frog.x - DOLL_X)).toBeLessThanOrEqual(FROG.winDist);
  });

  it('doubles walking speed with the Chuck Taylors', () => {
    const a = new Sim({ seed: 1 });
    const b = new Sim({ seed: 1, speed: 2 });
    a.throwing = b.throwing = false;
    run(a, 1, { x: -1, y: 0, jump: false });
    run(b, 1, { x: -1, y: 0, jump: false });
    expect(START_X - b.frog.x).toBeCloseTo(2 * (START_X - a.frog.x), 0);
  });

  it('caps the number of balls in play', () => {
    const sim = new Sim({ seed: 9 });
    sim.god = true;
    let most = 0;
    for (let i = 0; i < 120 / DT; i++) {
      sim.step(DT, idle);
      most = Math.max(most, sim.liveBalls());
    }
    expect(most).toBeLessThanOrEqual(BALL.maxBalls);
    expect(most).toBeGreaterThan(3);
  });
});

/**
 * A rough "first-time player" bot: heads for the nearest climbable ladder,
 * jumps when a ball is about to reach it (timing off by up to +-`slop` s),
 * stops for balls coming from behind or falling from above, and waits on a
 * ladder when a ball is about to roll past the top. Used to sanity-check the
 * fairness numbers: most runs should reach the doll with lives to spare.
 */
function botRun(seed: number, slop: number): { won: boolean; hits: number; time: number; life: number } {
  const sim = new Sim({ seed });
  let a = seed * 7919 + 13;
  const noise = () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
  let hits = 0;
  let t = 0;
  let lifeStart = 0;
  let jumpAt = -1;
  const EDGE = FROG.hitW / 2 + BALL.hitR;
  // seconds after take-off during which the frog's feet clear a rolling ball
  const clear = BALL.r + BALL.hitR - FROG.hitLift;
  const disc = Math.sqrt(FROG.jumpV ** 2 - 2 * FROG.gravity * clear);
  const AIR = [(FROG.jumpV - disc) / FROG.gravity, (FROG.jumpV + disc) / FROG.gravity];
  while (t < 300) {
    const fr = sim.frog;
    if (fr.state === 'hurt') {
      hits++;
      if (hits >= 3) return { won: false, hits, time: t, life: t - lifeStart };
      sim.respawn();
      lifeStart = t;
      jumpAt = -1;
      continue;
    }
    const input = { x: 0, y: 0, jump: false };
    const v = rollSpeed(sim.lifeT);
    let targetX = DOLL_X;
    if (fr.floor !== ROOF) {
      let best = Infinity;
      for (const l of LADDERS) {
        if (l.broken || l.lower !== fr.floor) continue;
        if (Math.abs(l.x - fr.x) < best) {
          best = Math.abs(l.x - fr.x);
          targetX = l.x;
        }
      }
    }
    /** Seconds until a rolling ball on `floor` reaches x, if the frog moves at `move`. */
    const eta = (floor: number, x: number, move: number) => {
      let best = Infinity;
      for (const b of sim.balls) {
        if (b.mode !== 'roll' || b.floor !== floor) continue;
        const dx = x - b.x;
        const closing = Math.sign(dx) * (b.dir * v - move * FROG.walk);
        if (closing <= 0) continue;
        best = Math.min(best, (Math.abs(dx) - EDGE) / closing);
      }
      return best;
    };
    if (fr.state === 'walk') {
      const atLadder = fr.floor !== ROOF && Math.abs(targetX - fr.x) < 3;
      let move = atLadder ? 0 : Math.sign(targetX - fr.x);
      // balls from behind can't be jumped while walking away from them: stop
      if (move !== 0 && eta(fr.floor, fr.x, move) < 1.2 && eta(fr.floor, fr.x, 0) > eta(fr.floor, fr.x, move)) move = 0;
      // don't walk under falling balls or balls coming down a ladder
      for (const b of sim.balls) {
        const near = b.mode === 'ladder' ? 40 : 34;
        if ((b.mode === 'fly' || b.mode === 'ladder') && Math.abs(b.x - fr.x) < near && b.y < fr.y && b.y > fr.y - 90) move = 0;
      }
      // on the top girder, wait outside the landing zone while the doll throws
      const throwing = sim.windupT > 0 || sim.balls.some((b) => b.mode === 'fly' && b.vx > 0 && b.x < 330);
      if (fr.floor === 4 && throwing && fr.x > 350 && fr.x < 380 && move < 0) move = 0;
      const tHit = eta(fr.floor, fr.x, move);
      if (jumpAt < 0 && tHit < 0.5) {
        const closing = Math.max(1, v + Math.abs(move) * FROG.walk);
        const aim = (AIR[0] + AIR[1] - (2 * EDGE) / closing) / 2;
        jumpAt = t + tHit - aim + (noise() * 2 - 1) * slop;
      }
      if (jumpAt >= 0 && t >= jumpAt) {
        input.jump = true;
        jumpAt = -1;
      }
      input.x = move;
      if (atLadder && tHit > 1 && !input.jump) {
        const l = LADDERS.find((q) => !q.broken && q.lower === fr.floor && q.x === targetX)!;
        const busy = sim.balls.some((b) => b.mode === 'ladder' && b.ladder === l);
        if (!busy && eta(l.upper, l.x, 0) > 1.4) input.y = -1;
      }
    } else if (fr.state === 'climb' && fr.ladder) {
      const l = fr.ladder;
      const below = fr.y - surfaceY(FLOORS[l.upper], l.x);
      // wait below the top while a ball rolls past it
      input.y = below > 18 && eta(l.upper, l.x, 0) < 0.9 ? 0 : -1;
    } else {
      jumpAt = -1;
    }
    for (const e of sim.step(DT, input)) if (e.type === 'win') return { won: true, hits, time: t, life: t - lifeStart };
    t += DT;
  }
  return { won: false, hits, time: t, life: t - lifeStart };
}

describe('l1 fairness playtest', () => {
  it('lets a sloppy first-time player win most runs in about a minute', () => {
    const runs = Array.from({ length: 60 }, (_, i) => botRun(i + 1, 0.12));
    const wins = runs.filter((r) => r.won);
    const lives = wins.map((r) => r.life).sort((x, y) => x - y);
    const median = lives[Math.floor(lives.length / 2)];
    const clean = wins.filter((r) => r.hits === 0).length;
    console.log(
      `l1 bot: ${wins.length}/60 won, ${clean} without a hit, winning life median ${median?.toFixed(1)}s ` +
        `(${lives[0]?.toFixed(1)}-${lives[lives.length - 1]?.toFixed(1)}s)`,
    );
    expect(wins.length).toBeGreaterThanOrEqual(45);
    expect(median).toBeGreaterThan(30);
    expect(median).toBeLessThan(75);
  });
});
