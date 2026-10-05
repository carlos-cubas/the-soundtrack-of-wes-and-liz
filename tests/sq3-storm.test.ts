import { describe, expect, it } from 'vitest';
import { botInput } from '../src/games/sq3-storm/bot';
import {
  AIR_TIME,
  ARRIVE_X,
  BOOMBOX_TIME,
  HINT_TIME,
  HW,
  MAX_LIVES,
  REACTION,
  RUN,
  SOAK_TIME,
  STRIKE_MIN_X,
  WARN,
  createSim,
  escapeTime,
  jumpWindowSeconds,
  makeLayout,
  obBox,
  onPath,
  step,
  takeoffWindow,
  useItem,
  type Sim,
  type SimInput,
} from '../src/games/sq3-storm/sim';

const DT = 1 / 60;
const IDLE: SimInput = { move: 0, jump: false, hold: false };

/** Run until the sim ends (or `maxT`), checking `each` after every step. */
function play(s: Sim, input: (s: Sim) => SimInput, maxT = 90, each?: (s: Sim) => void) {
  while ((s.phase === 'run' || s.phase === 'crank') && s.time < maxT) {
    step(s, DT, input(s));
    each?.(s);
  }
  return s;
}

/** Obstacles in the order Wes meets them (right to left). */
const ordered = () => [...makeLayout().obstacles].sort((a, b) => b.x - a.x);

describe('sq3 layout', () => {
  it('every obstacle is jumpable at base speed with a generous window', () => {
    for (const o of ordered()) {
      expect(jumpWindowSeconds(o, RUN), `${o.kind} @${o.x}`).toBeGreaterThan(0.18);
      expect(jumpWindowSeconds(o, RUN * 2), `${o.kind} @${o.x} with Chucks`).toBeGreaterThan(0.1);
    }
  });

  it('spaces obstacles so every jump lands clear with time to react', () => {
    for (const v of [RUN, RUN * 2]) {
      const obs = ordered();
      for (let i = 0; i + 1 < obs.length; i++) {
        const a = takeoffWindow(obs[i], v)!;
        const b = takeoffWindow(obs[i + 1], v)!;
        const next = obBox(obs[i + 1]);
        // Latest take-off for this one still lands short of the next obstacle…
        const land = a.lo - v * AIR_TIME;
        expect(land - HW, `landing before ${obs[i + 1].kind} @${obs[i + 1].x}`).toBeGreaterThan(next.x1);
        // …with at least a quarter second before the next window closes.
        expect((land - b.lo) / v).toBeGreaterThan(0.25);
      }
    }
  });

  it('keeps take-offs out of puddles and gust gaps', () => {
    const { puddles, gusts } = makeLayout();
    for (const o of ordered()) {
      const w = takeoffWindow(o, RUN)!;
      const span: [number, number] = [w.lo - 20, w.hi + 20];
      for (const p of puddles) expect(span[1] < p.x || span[0] > p.x + p.w, `${o.kind} @${o.x} vs puddle @${p.x}`).toBe(true);
      for (const g of gusts) expect(span[1] < g.x - 40 || span[0] > g.x + g.w + 40, `${o.kind} @${o.x} vs gust @${g.x}`).toBe(true);
    }
  });
});

describe('sq3 lightning scheduling', () => {
  /** A player who wanders: runs, stops, backs up, jumps at random. */
  const wanderer = (seed: number) => {
    let r = seed;
    const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
    let move = -1;
    let hold = 0;
    return (s: Sim): SimInput => {
      hold -= DT;
      if (hold <= 0) {
        move = [-1, -1, -1, 0, 1][Math.floor(rnd() * 5)];
        hold = 0.2 + rnd() * 1.2;
      }
      return { move, jump: rnd() < 0.02, hold: s.phase === 'crank' };
    };
  };

  it('never puts two strikes on the path at once, and every strike can be escaped', () => {
    let strikes = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const cap of [false, true]) {
        const s = createSim({ seed, speed: seed % 4 === 0 ? 2 : 1 });
        s.god = true;
        if (cap) useItem(s, 'cap');
        const input = wanderer(seed);
        play(s, input, 60, (s) => {
          const live = s.strikes.filter((st) => !st.done);
          expect(live.filter((st) => onPath(st, s.wes.x)).length).toBeLessThanOrEqual(1);
          for (const e of s.events) {
            if (e.type !== 'warn') continue;
            strikes++;
            const st = e.strike;
            expect(st.x - st.r - HW).toBeGreaterThan(ARRIVE_X);
            expect(st.x).toBeGreaterThanOrEqual(STRIKE_MIN_X);
            expect(st.warn).toBeCloseTo(cap ? WARN * 2 : WARN);
            // Even standing where he is, Wes has time to notice and get out.
            expect(REACTION + escapeTime(s, st)).toBeLessThanOrEqual(st.warn);
          }
        });
      }
    }
    expect(strikes).toBeGreaterThan(500);
  });

  it('a player who reacts to the glow is never zapped', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = createSim({ seed });
      let zaps = 0;
      play(s, (s) => botInput(s), 90, (s) => {
        zaps += s.events.filter((e) => e.type === 'zap').length;
      });
      expect(zaps, `seed ${seed}`).toBe(0);
    }
  });
});

describe('sq3 tuning', () => {
  it('a careful player wins in about half a minute without items', () => {
    const times: number[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const s = play(createSim({ seed }), (s) => botInput(s));
      expect(s.phase, `seed ${seed}`).toBe('won');
      expect(s.lives).toBe(MAX_LIVES);
      times.push(s.time);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    expect(avg).toBeGreaterThan(22);
    expect(avg).toBeLessThan(36);
    expect(Math.max(...times)).toBeLessThan(SOAK_TIME - 5);
  });

  /**
   * A first-timer: notices each lightning glow `react` seconds late and
   * jumps anywhere from too early to too late.
   */
  const firstTimer = (react: number) => {
    const aims = [-0.4, 0.1, 0.5, 0.9, 1.3, 0.5];
    return (seed: number) => (s: Sim) => {
      const real = s.strikes;
      s.strikes = real.filter((st) => st.t >= react);
      const inp = botInput(s, aims[(seed * 7 + s.obstacles.filter((o) => !o.alive).length) % aims.length]);
      s.strikes = real;
      return inp;
    };
  };

  const winRate = (mk: (seed: number) => Sim, policy: (seed: number) => (s: Sim) => SimInput, n = 100) => {
    let wins = 0;
    let zaps = 0;
    for (let seed = 1; seed <= n; seed++) {
      const s = play(mk(seed), policy(seed), 90, (s) => {
        zaps += s.events.filter((e) => e.type === 'zap').length;
      });
      if (s.phase === 'won') wins++;
    }
    return { wins: wins / n, zaps: zaps / n };
  };

  it('a first-timer with slow reactions and sloppy jumps wins on the first or second try', () => {
    const r = winRate((seed) => createSim({ seed }), firstTimer(0.5));
    expect(r.wins).toBeGreaterThanOrEqual(0.9);
    const slow = winRate((seed) => createSim({ seed }), firstTimer(0.6));
    // two tries
    expect(1 - (1 - slow.wins) ** 2).toBeGreaterThan(0.95);
  });

  it('items make it clearly easier for a slow first-timer', () => {
    const base = winRate((seed) => createSim({ seed }), firstTimer(0.6));
    const withItem = (item: 'cap' | 'boombox' | 'jersey') =>
      winRate((seed) => {
        const s = createSim({ seed });
        useItem(s, item);
        return s;
      }, firstTimer(0.6));
    const cap = withItem('cap');
    expect(cap.zaps).toBeLessThan(base.zaps / 4);
    expect(cap.wins).toBeGreaterThan(base.wins);
    expect(withItem('boombox').wins).toBe(1);
    expect(withItem('jersey').wins).toBeGreaterThan(base.wins);
  });

  it('standing still soaks the seats at ~45 s', () => {
    const s = createSim({ seed: 3 });
    s.lives = 99; // so the lightning can't end it first
    play(s, () => IDLE);
    expect(s.phase).toBe('lost');
    expect(s.lostReason).toBe('soaked');
    expect(s.time).toBeCloseTo(SOAK_TIME, 0);
  });

  it('running into every obstacle loses all three lives', () => {
    const s = createSim({ seed: 5 });
    play(s, (s) => ({ ...botInput(s), jump: false }));
    expect(s.phase).toBe('lost');
    expect(s.lostReason).toBe('lives');
  });

  it('releasing the crank slowly undoes it', () => {
    const s = createSim({ seed: 2 });
    s.wes.x = ARRIVE_X + 5;
    for (let i = 0; i < 30 && s.phase === 'run'; i++) step(s, DT, { move: -1, jump: false, hold: false });
    expect(s.phase).toBe('crank');
    for (let i = 0; i < 60; i++) step(s, DT, { move: 0, jump: false, hold: true });
    expect(s.crank).toBeCloseTo(0.5, 1);
    for (let i = 0; i < 60; i++) step(s, DT, IDLE);
    expect(s.crank).toBeLessThan(0.5);
    expect(s.crank).toBeGreaterThan(0.1);
    play(s, () => ({ move: 0, jump: false, hold: true }));
    expect(s.phase).toBe('won');
  });
});

describe('sq3 items', () => {
  it('cap doubles the warning and shows the trail', () => {
    const s = createSim();
    expect(useItem(s, 'cap')).toBe(true);
    expect(s.hintT).toBe(HINT_TIME);
    play(s, (s) => botInput(s), 10);
    expect(s.strikes.every((st) => st.warn >= WARN * 2 - 1e-9)).toBe(true);
  });

  it('bat smashes the next obstacle so it needs no jump', () => {
    const s = createSim();
    expect(useItem(s, 'bat')).toBe(true);
    const target = s.batTarget!;
    expect(target.id).toBe(ordered()[0].id);
    play(s, (s) => ({ ...botInput(s), jump: false }), 15, (s) => {
      if (target.alive === false) s.time = 99;
    });
    expect(target.how).toBe('bat');
    expect(s.lives).toBe(MAX_LIVES);
  });

  it('bat has nothing to hit once every obstacle is passed', () => {
    const s = createSim();
    for (const o of s.obstacles) o.alive = false;
    expect(useItem(s, 'bat')).toBe(false);
  });

  it('boombox makes Wes invincible for 30 s', () => {
    const s = createSim({ seed: 4 });
    expect(useItem(s, 'boombox')).toBe(true);
    expect(s.invincible).toBe(BOOMBOX_TIME);
    // never jumps, never dodges: still no damage while it lasts
    play(s, () => ({ move: -1, jump: false, hold: false }), BOOMBOX_TIME - 1);
    expect(s.lives).toBe(MAX_LIVES);
    expect(s.obstacles.filter((o) => o.how === 'smash').length).toBeGreaterThan(0);
  });

  it('jersey adds a life', () => {
    const s = createSim();
    expect(useItem(s, 'jersey')).toBe(true);
    expect(s.lives).toBe(MAX_LIVES + 1);
    expect(s.maxLives).toBe(MAX_LIVES + 1);
  });

  it('items are kept (not consumed) when they would do nothing', () => {
    const s = createSim();
    expect(useItem(s, 'bat')).toBe(true);
    expect(useItem(s, 'bat')).toBe(false); // already aimed at that obstacle
    s.phase = 'crank'; // nothing can hurt Wes at the car
    for (const item of ['cap', 'bat', 'boombox', 'jersey'] as const) expect(useItem(s, item)).toBe(false);
    s.phase = 'won';
    expect(useItem(s, 'jersey')).toBe(false);
  });
});
