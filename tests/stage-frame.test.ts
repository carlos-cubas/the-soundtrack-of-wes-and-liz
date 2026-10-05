import { describe, expect, it } from 'vitest';
import { frameFor, frameZoom, MAX_ASPECT, MIN_ASPECT, VIRTUAL_H } from '../src/core/stage';

const virtualW = (f: { w: number; h: number }) => (f.w / f.h) * VIRTUAL_H;

describe('stage frame', () => {
  it('leaves phone screens untouched', () => {
    for (const [w, h] of [
      [667, 375], // iPhone SE
      [844, 390], // iPhone 14
      [956, 440], // iPhone 17 Pro Max
    ]) {
      expect(frameFor(w, h)).toEqual({ w, h });
    }
  });

  it('letterboxes iPads to 16:9 at full width', () => {
    for (const [w, h] of [
      [1376, 1032], // iPad Pro 13"
      [1210, 834], // iPad Pro 11"
      [1180, 820], // iPad Air / iPad
      [1133, 744], // iPad mini
    ]) {
      const f = frameFor(w, h);
      expect(f.w).toBe(w);
      expect(f.h).toBeLessThan(h);
      expect(f.w / f.h).toBeCloseTo(MIN_ASPECT, 6);
    }
  });

  it('pillarboxes very wide windows', () => {
    const f = frameFor(1600, 500);
    expect(f.h).toBe(500);
    expect(f.w / f.h).toBeCloseTo(MAX_ASPECT, 6);
  });

  it('keeps the virtual width inside the range the games are built for', () => {
    for (let aspect = 1.2; aspect <= 3.2; aspect += 0.05) {
      const W = virtualW(frameFor(aspect * 500, 500));
      expect(W).toBeGreaterThanOrEqual(711);
      expect(W).toBeLessThanOrEqual(880 + 1e-6);
    }
  });
});

describe('frame zoom', () => {
  it('is 1 on phones and grows with the iPad frame, capped at 1.6', () => {
    expect(frameZoom(390)).toBe(1);
    expect(frameZoom(440)).toBe(1);
    expect(frameZoom(663)).toBeCloseTo(1.507, 3); // iPad Air frame
    expect(frameZoom(774)).toBe(1.6); // iPad Pro 13" frame
  });
});
