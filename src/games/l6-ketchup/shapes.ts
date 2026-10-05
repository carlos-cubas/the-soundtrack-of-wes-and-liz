/**
 * Level 6 target drawings, as polylines in napkin units centred on (0, 0).
 * Every drawing is scaled so its larger side spans 2 * HALF.
 */

export interface Pt {
  x: number;
  y: number;
}
export type Stroke = Pt[];

export interface Drawing {
  id: 'heart' | 'smiley' | 'star' | 'note' | 'lw';
  name: string;
  strokes: Stroke[];
  /** Seconds to draw it. */
  time: number;
}

/** Half the size of a drawing on the napkin. */
export const HALF = 104;

const TAU = Math.PI * 2;

/** Classic parametric heart, starting at the top dip and going clockwise. */
function heart(n = 96): Stroke {
  const pts: Stroke = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * TAU;
    const x = Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
    pts.push({ x, y });
  }
  return pts;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, rot: number, n: number, a0 = -Math.PI / 2): Stroke {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const pts: Stroke = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * TAU;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    pts.push({ x: cx + x * c - y * s, y: cy + x * s + y * c });
  }
  return pts;
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number, n: number): Stroke {
  const pts: Stroke = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function quad(p0: Pt, c: Pt, p1: Pt, n: number): Stroke {
  const pts: Stroke = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y });
  }
  return pts;
}

const line = (...xy: number[]): Stroke => {
  const pts: Stroke = [];
  for (let i = 0; i < xy.length; i += 2) pts.push({ x: xy[i], y: xy[i + 1] });
  return pts;
};

/** Centre the strokes on (0, 0) and scale the larger side to 2 * HALF. */
function normalise(strokes: Stroke[]): Stroke[] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of strokes)
    for (const p of s) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  const k = (2 * HALF) / Math.max(x1 - x0, y1 - y0);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return strokes.map((s) => s.map((p) => ({ x: (p.x - cx) * k, y: (p.y - cy) * k })));
}

function star(): Stroke {
  const pts: Stroke = [];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.42 : 1;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

function note(): Stroke[] {
  // an eighth note: oval head, stem, curling flag
  const head = ellipse(-0.27, 0.58, 0.26, 0.17, -0.38, 36, 0);
  const stem = line(-0.04, 0.5, -0.04, -0.92);
  const flag = [...quad({ x: -0.04, y: -0.92 }, { x: 0.07, y: -0.55 }, { x: 0.37, y: -0.42 }, 10), ...quad({ x: 0.37, y: -0.42 }, { x: 0.63, y: -0.28 }, { x: 0.41, y: 0.04 }, 10).slice(1)];
  return [head, stem, flag];
}

function lw(): Stroke[] {
  // "L+W" inside a heart, like the napkin in Samira's deck. The heart is
  // centred first so the letters can be placed in its coordinates.
  const [h] = normalise([heart()]).map((s) => s.map((p) => ({ x: p.x / HALF, y: p.y / HALF })));
  return [
    h,
    line(-0.58, -0.36, -0.58, 0.12, -0.34, 0.12),
    line(-0.23, -0.1, 0.01, -0.1),
    line(-0.11, -0.22, -0.11, 0.02),
    line(0.12, -0.36, 0.23, 0.12, 0.35, -0.16, 0.47, 0.12, 0.58, -0.36),
  ];
}

export const DRAWINGS: Drawing[] = [
  { id: 'heart', name: 'Heart', strokes: normalise([heart()]), time: 18 },
  {
    id: 'smiley',
    name: 'Smiley face',
    strokes: normalise([
      ellipse(0, 0, 1, 1, 0, 64),
      line(-0.34, -0.38, -0.34, -0.16),
      line(0.34, -0.38, 0.34, -0.16),
      arc(0, 0.02, 0.56, 0.18 * Math.PI, 0.82 * Math.PI, 24),
    ]),
    time: 20,
  },
  { id: 'star', name: 'Star', strokes: normalise([star()]), time: 20 },
  { id: 'note', name: 'Music note', strokes: normalise(note()), time: 20 },
  { id: 'lw', name: 'L + W', strokes: normalise(lw()), time: 28 },
];

export function strokeLength(strokes: Stroke[]): number {
  let n = 0;
  for (const s of strokes) for (let i = 1; i < s.length; i++) n += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  return n;
}

/** Points every `step` units along the strokes (endpoints included). */
export function sampleStrokes(strokes: Stroke[], step = 3): Pt[] {
  const out: Pt[] = [];
  for (const s of strokes) {
    if (!s.length) continue;
    out.push({ ...s[0] });
    let carry = 0;
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1];
      const b = s[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      let d = step - carry;
      while (d <= len) {
        const t = d / len;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        d += step;
      }
      carry = len - (d - step);
    }
    const last = s[s.length - 1];
    const prev = out[out.length - 1];
    if (Math.hypot(prev.x - last.x, prev.y - last.y) > step * 0.3) out.push({ ...last });
  }
  return out;
}
