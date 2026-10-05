/**
 * Find the props on the diner table art (burger plate, salt shakers,
 * milkshake) so Level 6 can move them out from under the HUD and its own
 * controls. The art is flat colour on a flat cream table, so each prop is a
 * blob of not-cream pixels inside the gingham border.
 *
 * `findProps` is pure (unit-tested); `propsOf` reads an image once.
 */

/** A box as fractions of the image. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TableProps {
  cream: [number, number, number];
  /** The cream table inside the border. */
  inner: Box;
  props: Box[];
}

/** Analysis width; the art is downscaled to this before scanning. */
export const SCAN_W = 240;
const TOL = 40;
const MERGE_GAP = 5;
const PAD = 1.5;

export function findProps(d: ArrayLike<number>, w: number, h: number): TableProps | null {
  const at = (x: number, y: number) => (y * w + x) * 4;
  const c0 = at(w >> 1, h >> 1);
  const cream: [number, number, number] = [d[c0], d[c0 + 1], d[c0 + 2]];
  const isCream = (x: number, y: number) => {
    const i = at(x, y);
    return Math.abs(d[i] - cream[0]) + Math.abs(d[i + 1] - cream[1]) + Math.abs(d[i + 2] - cream[2]) < TOL;
  };
  // The border's inner edge: how far cream reaches from the middle, over a
  // few rows and columns (a prop may block some of them).
  let l = w >> 1;
  let r = w >> 1;
  let t = h >> 1;
  let b = h >> 1;
  for (const f of [0.35, 0.42, 0.5, 0.58, 0.65]) {
    const y = Math.round(f * (h - 1));
    let a = w >> 1;
    while (a > 0 && isCream(a - 1, y)) a--;
    l = Math.min(l, a);
    let e = w >> 1;
    while (e < w - 1 && isCream(e + 1, y)) e++;
    r = Math.max(r, e);
    const x = Math.round(f * (w - 1));
    a = h >> 1;
    while (a > 0 && isCream(x, a - 1)) a--;
    t = Math.min(t, a);
    e = h >> 1;
    while (e < h - 1 && isCream(x, e + 1)) e++;
    b = Math.max(b, e);
  }
  // not a cream table we understand: leave the art alone
  if (r - l < w * 0.6 || b - t < h * 0.6 || !isCream(w >> 1, h >> 1)) return null;

  // flood-fill the not-cream blobs inside the table
  const seen = new Uint8Array(w * h);
  let boxes: Array<[number, number, number, number]> = [];
  const stack: number[] = [];
  for (let y = t; y <= b; y++)
    for (let x = l; x <= r; x++) {
      if (seen[y * w + x] || isCream(x, y)) continue;
      let bx0 = x;
      let by0 = y;
      let bx1 = x;
      let by1 = y;
      let n = 0;
      stack.push(x, y);
      seen[y * w + x] = 1;
      while (stack.length) {
        const cy = stack.pop()!;
        const cx = stack.pop()!;
        n++;
        bx0 = Math.min(bx0, cx);
        by0 = Math.min(by0, cy);
        bx1 = Math.max(bx1, cx);
        by1 = Math.max(by1, cy);
        for (const [nx, ny] of [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ]) {
          if (nx < l || nx > r || ny < t || ny > b || seen[ny * w + nx] || isCream(nx, ny)) continue;
          seen[ny * w + nx] = 1;
          stack.push(nx, ny);
        }
      }
      // specks and compression noise are not props, nor a wobbly border edge
      const big = bx1 - bx0 > w * 0.5 || by1 - by0 > h * 0.6;
      if (n >= 12 && bx1 - bx0 >= 2 && by1 - by0 >= 2 && !big) boxes.push([bx0, by0, bx1, by1]);
    }
  // pieces of one prop (two shakers, a plate and its fries) merge into one box
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < boxes.length && !merged; i++)
      for (let j = i + 1; j < boxes.length && !merged; j++) {
        const p = boxes[i];
        const q = boxes[j];
        if (p[0] - MERGE_GAP <= q[2] && q[0] - MERGE_GAP <= p[2] && p[1] - MERGE_GAP <= q[3] && q[1] - MERGE_GAP <= p[3]) {
          boxes[i] = [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[2], q[2]), Math.max(p[3], q[3])];
          boxes.splice(j, 1);
          merged = true;
        }
      }
  }
  if (boxes.length > 8) return null;
  const inner: Box = { x0: l / w, y0: t / h, x1: (r + 1) / w, y1: (b + 1) / h };
  const props = boxes.map(([x0, y0, x1, y1]) => ({
    x0: Math.max(inner.x0, (x0 - PAD) / w),
    y0: Math.max(inner.y0, (y0 - PAD) / h),
    x1: Math.min(inner.x1, (x1 + 1 + PAD) / w),
    y1: Math.min(inner.y1, (y1 + 1 + PAD) / h),
  }));
  return { cream, inner, props };
}

const cache = new WeakMap<HTMLImageElement, TableProps | null>();

/** Props of a loaded table image (null if it can't be read or understood). */
export function propsOf(img: HTMLImageElement): TableProps | null {
  if (cache.has(img)) return cache.get(img)!;
  let out: TableProps | null = null;
  try {
    const w = SCAN_W;
    const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (x) {
      x.drawImage(img, 0, 0, w, h);
      out = findProps(x.getImageData(0, 0, w, h).data, w, h);
    }
  } catch {
    out = null; // a tainted canvas: keep the art as it is
  }
  cache.set(img, out);
  return out;
}
