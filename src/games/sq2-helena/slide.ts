/**
 * 3×3 sliding tile puzzle logic (pure, unit tested).
 *
 * A board is 9 cells in reading order; each holds the tile that belongs at
 * that index (1..8), or 0 for the gap. Solved = [1,2,3,4,5,6,7,8,0].
 * A move is the index of the tile that slides into the gap.
 */

export type Board = number[];

export const N = 3;
export const SOLVED: Board = [1, 2, 3, 4, 5, 6, 7, 8, 0];

/** Cells orthogonally adjacent to each cell. */
export const NEIGHBORS: number[][] = Array.from({ length: N * N }, (_, i) => {
  const r = Math.floor(i / N);
  const c = i % N;
  const out: number[] = [];
  if (r > 0) out.push(i - N);
  if (r < N - 1) out.push(i + N);
  if (c > 0) out.push(i - 1);
  if (c < N - 1) out.push(i + 1);
  return out;
});

export function isSolved(b: Board): boolean {
  return b.every((v, i) => v === SOLVED[i]);
}

/** Can the tile at `cell` slide into the gap? */
export function canMove(b: Board, cell: number): boolean {
  return NEIGHBORS[b.indexOf(0)].includes(cell);
}

/** Slide the tile at `cell` into the gap. Returns a new board, or null if it isn't next to the gap. */
export function move(b: Board, cell: number): Board | null {
  if (!canMove(b, cell)) return null;
  const out = b.slice();
  out[b.indexOf(0)] = out[cell];
  out[cell] = 0;
  return out;
}

/** On an odd-width board a position is solvable iff its inversion count is even. */
export function isSolvable(b: Board): boolean {
  const tiles = b.filter((v) => v !== 0);
  let inv = 0;
  for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) if (tiles[i] > tiles[j]) inv++;
  return inv % 2 === 0;
}

/**
 * Scramble by walking `moves` random legal moves from the solved board
 * (never undoing the previous move), so the result is always solvable.
 * Re-rolls if the walk happens to land back near solved.
 */
export function scramble(moves: number, rng: () => number = Math.random): Board {
  for (;;) {
    let b = SOLVED.slice();
    let prevGap = -1;
    for (let k = 0; k < moves; k++) {
      const gap = b.indexOf(0);
      const opts = NEIGHBORS[gap].filter((c) => c !== prevGap);
      const cell = opts[Math.floor(rng() * opts.length)];
      b = move(b, cell)!;
      prevGap = gap;
    }
    if (manhattan(b) >= 8) return b;
  }
}

function dist(cell: number, tile: number): number {
  const goal = tile - 1;
  return Math.abs(Math.floor(cell / N) - Math.floor(goal / N)) + Math.abs((cell % N) - (goal % N));
}

/** Sum of Manhattan distances of every tile to its home (admissible heuristic). */
export function manhattan(b: Board): number {
  let h = 0;
  for (let i = 0; i < b.length; i++) if (b[i]) h += dist(i, b[i]);
  return h;
}

/**
 * Optimal solution by IDA* with the Manhattan heuristic: the list of cells to
 * tap, in order. [] if already solved, null if unsolvable. 3×3 needs at
 * most 31 moves, which IDA* finds in milliseconds.
 */
export function solve(start: Board): number[] | null {
  if (!isSolvable(start)) return null;
  const b = start.slice();
  let gap = b.indexOf(0);
  const path: number[] = [];
  const FOUND = -1;

  const search = (g: number, h: number, bound: number, prevGap: number): number => {
    const f = g + h;
    if (f > bound) return f;
    if (h === 0) return FOUND;
    let min = Infinity;
    for (const cell of NEIGHBORS[gap]) {
      if (cell === prevGap) continue;
      const tile = b[cell];
      const nh = h - dist(cell, tile) + dist(gap, tile);
      const oldGap = gap;
      b[oldGap] = tile;
      b[cell] = 0;
      gap = cell;
      path.push(cell);
      const t = search(g + 1, nh, bound, oldGap);
      if (t === FOUND) return FOUND;
      path.pop();
      gap = oldGap;
      b[cell] = tile;
      b[oldGap] = 0;
      if (t < min) min = t;
    }
    return min;
  };

  let bound = manhattan(b);
  for (;;) {
    const t = search(0, manhattan(b), bound, -1);
    if (t === FOUND) return path.slice();
    if (t === Infinity) return null;
    bound = t;
  }
}
