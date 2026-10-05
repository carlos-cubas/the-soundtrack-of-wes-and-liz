import { describe, expect, it } from 'vitest';
import { dealChoices, MOMENTS, starsFor, TIMEOUT_LINES } from '../src/games/sq1-dinner/moments';
import { seeded } from '../src/games/sq1-dinner/rng';
import { iconSvg } from '../src/ui/icons';

const EMOJI = /\p{Extended_Pictographic}/u;

describe('sq1 date moments', () => {
  it('has the six moments of the date in order', () => {
    expect(MOMENTS.map((m) => m.id)).toEqual(['arrive', 'order', 'jukebox', 'talk', 'spill', 'goodnight']);
  });

  it('every moment has three choices and exactly one real Wes', () => {
    for (const m of MOMENTS) {
      expect(m.choices, m.id).toHaveLength(3);
      expect(m.choices.filter((c) => c.real), m.id).toHaveLength(1);
      for (const c of m.choices) {
        expect(c.text.length, `${m.id}: ${c.text}`).toBeLessThanOrEqual(60);
        expect(c.react.length).toBeGreaterThan(0);
        expect(iconSvg(c.icon), `${m.id}: icon '${c.icon}' missing from icons.ts`).not.toBe(iconSvg('__missing__'));
      }
    }
  });

  it('includes the deck-specified real moves and clichés', () => {
    const all = MOMENTS.flatMap((m) => m.choices);
    const real = all.filter((c) => c.real).map((c) => c.text.toLowerCase()).join(' | ');
    const fake = all.filter((c) => !c.real).map((c) => c.text.toLowerCase()).join(' | ');
    for (const k of ['her usual', 'race her to the booth', 'gnome', 'hoodie', 'parking spot, buxbaum']) expect(real).toContain(k);
    for (const k of ['rose', 'violinist', 'sonnet', 'carry her out', 'kiss her hand under the stars']) expect(fake).toContain(k);
    expect(all.some((c) => c.react.includes('This feels like a movie set.'))).toBe(true);
  });

  it('dealing shuffles positions but keeps one real choice', () => {
    const rng = seeded(7);
    const positions = new Set<number>();
    for (let k = 0; k < 60; k++) {
      for (const m of MOMENTS) {
        const d = dealChoices(m, rng);
        expect(d).toHaveLength(3);
        expect(new Set(d)).toEqual(new Set(m.choices));
        positions.add(d.findIndex((c) => c.real));
      }
    }
    expect([...positions].sort()).toEqual([0, 1, 2]);
  });

  it('uses line-art icons, never color emoji (no emoji font on iOS 26.3 sim)', () => {
    for (const m of MOMENTS) {
      for (const t of [m.title, m.setup, ...m.choices.flatMap((c) => [c.icon, c.text, c.react])]) expect(t, t).not.toMatch(EMOJI);
    }
    for (const t of TIMEOUT_LINES) expect(t).not.toMatch(EMOJI);
  });

  it('stars drop one per slip and never below one', () => {
    expect(starsFor(0)).toBe(5);
    expect(starsFor(2)).toBe(3);
    expect(starsFor(9)).toBe(1);
    expect(TIMEOUT_LINES.length).toBeGreaterThan(0);
  });
});
