import { describe, expect, it } from 'vitest';
import { findProps } from '../src/games/l6-ketchup/props';

const CREAM: [number, number, number] = [250, 240, 220];

/** A synthetic diner table: cream inside a red border, with props drawn on it. */
function table(w: number, h: number, draw: (set: (x: number, y: number, rgb: number[]) => void) => void, noise = 0) {
  const d = new Uint8ClampedArray(w * h * 4);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * noise;
  const set = (x: number, y: number, rgb: number[]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    d[i] = rgb[0];
    d[i + 1] = rgb[1];
    d[i + 2] = rgb[2];
    d[i + 3] = 255;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const border = x < 10 || y < 10 || x >= w - 10 || y >= h - 10;
      set(x, y, border ? [((x >> 2) + (y >> 2)) % 2 ? 230 : 250, 60, 70] : CREAM.map((c) => c + rnd()));
    }
  const rect = (x0: number, y0: number, x1: number, y1: number, rgb: number[]) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, rgb);
  };
  draw((x, y, rgb) => set(x, y, rgb));
  return { d, rect };
}

describe('L6 table props', () => {
  const W = 240;
  const H = 134;
  const scene = (noise = 0) => {
    const t = table(W, H, () => {}, noise);
    // burger plate top-left (a disc), two shakers top-right, a milkshake bottom-right
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - 40) ** 2 + (y - 35) ** 2 < 24 ** 2) t.rect(x, y, x + 1, y + 1, [240, 200, 60]);
    t.rect(200, 14, 208, 38, [50, 80, 200]);
    t.rect(212, 20, 222, 40, [210, 215, 220]);
    t.rect(202, 70, 222, 120, [240, 130, 130]);
    return findProps(t.d, W, H)!;
  };

  it('finds the burger, the pair of shakers (as one) and the milkshake', () => {
    const r = scene();
    expect(r).not.toBeNull();
    expect(r.cream).toEqual(CREAM);
    expect(r.inner.x0).toBeCloseTo(10 / W, 2);
    expect(r.inner.x1).toBeCloseTo((W - 10) / W, 2);
    expect(r.props.length).toBe(3);
    const near = (b: { x0: number; y0: number; x1: number; y1: number }, x0: number, y0: number, x1: number, y1: number) =>
      Math.abs(b.x0 * W - x0) < 3 && Math.abs(b.y0 * H - y0) < 3 && Math.abs(b.x1 * W - x1) < 3 && Math.abs(b.y1 * H - y1) < 3;
    expect(r.props.some((b) => near(b, 16, 11, 64, 59))).toBe(true);
    expect(r.props.some((b) => near(b, 200, 14, 222, 40))).toBe(true);
    expect(r.props.some((b) => near(b, 202, 70, 222, 120))).toBe(true);
    // boxes stay on the table, never over the border
    for (const b of r.props) {
      expect(b.x0).toBeGreaterThanOrEqual(r.inner.x0);
      expect(b.y1).toBeLessThanOrEqual(r.inner.y1);
    }
  });

  it('copes with lossy-compression noise on the flat cream', () => {
    expect(scene(9).props.length).toBe(3);
  });

  it('leaves art it does not understand alone', () => {
    const t = table(W, H, () => {});
    // a busy picture: stripes everywhere
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x >> 3) % 2) t.rect(x, y, x + 1, y + 1, [20, 120, 40]);
    expect(findProps(t.d, W, H)).toBeNull();
  });
});
