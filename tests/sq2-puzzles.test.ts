import { describe, expect, it } from 'vitest';
import { seeded } from '../src/games/sq1-dinner/rng';
import { buildDeck, isNextWord, LESSON, LESSON_WORDS, MEMORY_CARDS, scrambleWords, TALK } from '../src/games/sq2-helena/puzzles';
import { canMove, isSolvable, isSolved, manhattan, move, NEIGHBORS, scramble, solve, SOLVED, type Board } from '../src/games/sq2-helena/slide';

const apply = (b: Board, cells: number[]) => cells.reduce<Board>((acc, c) => {
  const next = move(acc, c);
  expect(next, `cell ${c} not next to the gap`).not.toBeNull();
  return next!;
}, b);

describe('sq2 memory match', () => {
  it('uses the six memory cards from the brief', () => {
    expect(MEMORY_CARDS.map((c) => c.id).sort()).toEqual(['cookies', 'flowers', 'mixtape', 'photo', 'teacup', 'vinyl']);
    for (const c of MEMORY_CARDS) expect(c.img).toBe(`img/puzzles/cards/${c.id}.webp`);
  });

  it('deals 12 cards: every card exactly twice', () => {
    for (let s = 1; s <= 25; s++) {
      const deck = buildDeck(seeded(s));
      expect(deck).toHaveLength(12);
      const counts = new Map<string, number>();
      for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
      expect(counts.size).toBe(6);
      for (const n of counts.values()) expect(n).toBe(2);
    }
  });

  it('has no color emoji anywhere in the quest text', () => {
    const texts = [...MEMORY_CARDS.flatMap((c) => [c.label, c.line]), ...Object.values(TALK).flat().map((l) => l.text), LESSON];
    for (const t of texts) expect(t, t).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('actually shuffles', () => {
    const decks = new Set(Array.from({ length: 10 }, (_, s) => buildDeck(seeded(s + 100)).join()));
    expect(decks.size).toBeGreaterThan(5);
  });
});

describe('sq2 sliding puzzle', () => {
  it('knows its neighbours and legal moves', () => {
    expect([...NEIGHBORS[4]].sort()).toEqual([1, 3, 5, 7]);
    expect([...NEIGHBORS[0]].sort()).toEqual([1, 3]);
    expect(canMove(SOLVED, 7)).toBe(true);
    expect(canMove(SOLVED, 0)).toBe(false);
    expect(move(SOLVED, 0)).toBeNull();
    expect(move(SOLVED, 5)).toEqual([1, 2, 3, 4, 5, 0, 7, 8, 6]);
  });

  it('detects solvability by inversion parity', () => {
    expect(isSolvable(SOLVED)).toBe(true);
    expect(isSolvable([2, 1, 3, 4, 5, 6, 7, 8, 0])).toBe(false);
    expect(solve([2, 1, 3, 4, 5, 6, 7, 8, 0])).toBeNull();
  });

  it('scrambles 20–30 random moves into solvable, unsolved boards', () => {
    for (let s = 1; s <= 200; s++) {
      const rng = seeded(s);
      const b = scramble(20 + Math.floor(rng() * 11), rng);
      expect(b.slice().sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(isSolvable(b)).toBe(true);
      expect(isSolved(b)).toBe(false);
      expect(manhattan(b)).toBeGreaterThanOrEqual(8);
    }
  });

  it('solves scrambles optimally-ish (within the walk length) and the path works', () => {
    for (let s = 1; s <= 60; s++) {
      const rng = seeded(s * 31);
      const walk = 20 + Math.floor(rng() * 11);
      const b = scramble(walk, rng);
      const path = solve(b)!;
      expect(path).not.toBeNull();
      expect(path.length).toBeLessThanOrEqual(walk);
      expect(path.length).toBeGreaterThanOrEqual(manhattan(b));
      expect(isSolved(apply(b, path))).toBe(true);
    }
  });

  it('finds known optimal lengths, including the hardest 31-move position', () => {
    expect(solve(SOLVED)).toEqual([]);
    expect(solve([1, 2, 3, 4, 5, 6, 7, 0, 8])).toEqual([8]);
    const hardest: Board = [8, 6, 7, 2, 5, 4, 3, 0, 1];
    const t0 = Date.now();
    const path = solve(hardest)!;
    expect(path).toHaveLength(31);
    expect(isSolved(apply(hardest, path))).toBe(true);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});

describe('sq2 word puzzle', () => {
  it('builds the deck line, word by word', () => {
    expect(LESSON).toBe("Holding on to the past won't stop the pain of the present");
    expect(LESSON_WORDS).toHaveLength(12);
  });

  it('scrambles into the same words, never in order', () => {
    for (let s = 1; s <= 50; s++) {
      const w = scrambleWords(seeded(s));
      expect(w.slice().sort()).toEqual(LESSON_WORDS.slice().sort());
      expect(w.join(' ')).not.toBe(LESSON);
    }
  });

  it('accepts any "the" tile when "the" is next', () => {
    expect(isNextWord(0, 'Holding')).toBe(true);
    expect(isNextWord(0, 'the')).toBe(false);
    expect(isNextWord(3, 'the')).toBe(true);
    expect(isNextWord(7, 'the')).toBe(true);
    expect(isNextWord(11, 'present')).toBe(true);
    expect(isNextWord(12, 'present')).toBe(false);
  });
});
