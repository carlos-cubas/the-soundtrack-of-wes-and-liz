import { describe, expect, it } from 'vitest';
import type { Stage } from '../src/core/stage';
import { STEP } from '../src/games/boss-tiles/chart';
import { HIT_Y, LANE_MAX, SPEED, TILE_H, laneAt, laneCenter, layout } from '../src/games/boss-tiles/view';

/** A stage as the game sees it: virtual height 400, width from the phone's aspect, insets in virtual units. */
function stage(cssW: number, cssH: number, insetPt = 0): Stage {
  const scale = cssH / 400;
  const inset = insetPt / scale;
  return { W: cssW / scale, H: 400, scale, safe: { left: inset, right: inset, top: 0, bottom: 0 } } as unknown as Stage;
}

const PHONES = {
  'iPhone 17 Pro Max (956x440, 62pt insets)': stage(956, 440, 62),
  'iPhone Pro (844x390, 59pt insets)': stage(844, 390, 59),
  'iPhone SE (667x375, no insets)': stage(667, 375, 0),
  'desktop 844x390, no insets': stage(844, 390, 0),
};

describe('boss layout', () => {
  it('gives thumb-sized lanes: >= 90 on the Pro Max with insets, >= 80 on the SE', () => {
    expect(layout(PHONES['iPhone 17 Pro Max (956x440, 62pt insets)']).laneW).toBeGreaterThanOrEqual(90);
    expect(layout(PHONES['iPhone Pro (844x390, 59pt insets)']).laneW).toBeGreaterThanOrEqual(90);
    expect(layout(PHONES['iPhone SE (667x375, no insets)']).laneW).toBeGreaterThanOrEqual(80);
    for (const s of Object.values(PHONES)) expect(layout(s).laneW).toBeLessThanOrEqual(LANE_MAX);
  });

  for (const [name, s] of Object.entries(PHONES)) {
    it(`${name}: lanes and both columns fit inside the safe area`, () => {
      const L = layout(s);
      expect(L.lx).toBeGreaterThanOrEqual(s.safe.left);
      expect(L.lw).toBeGreaterThanOrEqual(124); // nerves card + Wes
      expect(L.x0).toBeGreaterThanOrEqual(L.lx + L.lw);
      expect(L.x1).toBe(L.x0 + 4 * L.laneW);
      expect(L.kx).toBeGreaterThan(L.x1);
      expect(L.kw).toBeGreaterThanOrEqual(180); // karaoke card + Libby
      expect(L.kx + L.kw).toBeLessThanOrEqual(s.W - s.safe.right);
    });

    it(`${name}: the tap zones are exactly the drawn lanes`, () => {
      const L = layout(s);
      for (let lane = 0; lane < 4; lane++) {
        const left = L.x0 + lane * L.laneW;
        expect(laneAt(L, laneCenter(L, lane))).toBe(lane);
        expect(laneAt(L, left + 0.5)).toBe(lane);
        expect(laneAt(L, left + L.laneW - 0.5)).toBe(lane);
      }
      // a thumb just off the outer edges still counts; over a side column it doesn't
      expect(laneAt(L, L.x0 - 6)).toBe(0);
      expect(laneAt(L, L.x1 + 6)).toBe(3);
      expect(laneAt(L, L.lx + L.lw / 2)).toBe(-1);
      expect(laneAt(L, L.kx + L.kw / 2)).toBe(-1);
    });
  }

  it('keeps visible clearance between same-lane tiles at the tightest spacing', () => {
    const gap = 2 * STEP * SPEED; // centre to centre, 2 sixteenths apart
    expect(gap - TILE_H).toBeGreaterThanOrEqual(12);
    expect(TILE_H).toBeGreaterThanOrEqual(56);
    expect(HIT_Y + TILE_H / 2).toBeLessThan(400);
  });
});
