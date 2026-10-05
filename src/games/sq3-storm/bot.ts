/**
 * A reference player for tests and the debug API: runs left, waits out
 * lightning it can't beat, and jumps obstacles at a chosen point of the
 * take-off window (`aim` 0 = earliest, 1 = last chance).
 */
import {
  type Sim,
  type SimInput,
  RUN,
  dangerZone,
  nextObstacle,
  takeoffWindow,
  travelTime,
} from './sim';

const escapeDir = new WeakMap<object, number>();

export function botInput(s: Sim, aim = 0.5): SimInput {
  if (s.phase === 'crank') return { move: 0, jump: false, hold: true };
  if (s.phase !== 'run') return { move: 0, jump: false, hold: false };
  const w = s.wes;
  const v = RUN * s.speed;
  let move = -1;

  if (s.invincible <= 0) {
    for (const st of s.strikes) {
      if (st.struck) continue;
      const left = st.warn - st.t;
      const [a0, b0] = dangerZone(st);
      const a = a0 - 8;
      const b = b0 + 8;
      if (w.x > a && w.x < b) {
        // Inside the glow: pick a side once (forward if there's time) and stick to it.
        let dir = escapeDir.get(st);
        if (dir === undefined) {
          dir = travelTime(s, w.x, a) < left - 0.12 ? -1 : 1;
          escapeDir.set(st, dir);
        }
        move = dir;
      } else if (w.x >= b) {
        const pass = travelTime(s, w.x, a);
        const reach = travelTime(s, w.x, b);
        if (pass > left - 0.08 && reach < left + 0.15) move = 0;
      }
    }
  }

  let jump = false;
  const o = nextObstacle(s);
  if (o && o !== s.batTarget && s.invincible <= 0 && w.onGround && move < 0) {
    const sp = Math.max(Math.abs(w.vx), v * 0.8);
    const win = takeoffWindow(o, sp) ?? takeoffWindow(o, v);
    if (win) {
      const at = win.hi - (win.hi - win.lo) * aim;
      if (w.x <= at && w.x >= win.lo - 4) jump = true;
    }
  }
  return { move, jump, hold: false };
}
