/**
 * Level 4 wardrobe: every piece Liz can try on.
 *
 * Garments are SVG fragments drawn in the paper doll's body coordinates
 * (viewBox 0 0 200 450, centre line x = 100, feet at y ≈ 440), so any
 * combination lines up. Each item carries style tags, and each colour
 * variant carries colour families; Jocelyn's judging (judge.ts) reads only
 * those, never the drawings.
 *
 * Pure data + strings: no DOM, so the judging tests run under node.
 */
import { EDGE, INK, LINE, OUTLINE, L, P, S, circ, ell, f1, ink, isOutlining, mir, only, tube } from './ink';

export type Category = 'hair' | 'top' | 'bottom' | 'dress' | 'shoes' | 'extra';
/** Extras are worn one per slot. */
export type Slot = 'outer' | 'neck' | 'bag' | 'held' | 'face';
export type Tag = 'sporty' | 'casual' | 'cozy' | 'cute' | 'romantic' | 'vintage' | 'floral' | 'glam' | 'edgy' | 'chucks';
export type ColorFamily =
  | 'red'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'white'
  | 'cream'
  | 'black'
  | 'gray'
  | 'navy'
  | 'denim'
  | 'brown'
  | 'tan';

/** Neutrals go with everything and never count towards "too many colours". */
export const NEUTRALS: readonly ColorFamily[] = ['white', 'cream', 'black', 'gray', 'navy', 'denim', 'brown', 'tan'];

/** Draw order, back to front. `body` and `basics` are drawn by doll.ts. */
export const LAYERS = [
  'hairBack',
  'behind',
  'body',
  'face',
  'basics',
  'shoes',
  'under',
  'bottom',
  'top',
  'dress',
  'outer',
  'neck',
  'bag',
  'hairFront',
  'held',
] as const;
export type Layer = (typeof LAYERS)[number];
export type Drawing = Partial<Record<Layer, string>>;

export interface Variant {
  name: string;
  colors: ColorFamily[];
  /** Drawing palette, item-specific order (main colour first). */
  c: string[];
}

export interface Item {
  id: string;
  cat: Category;
  slot?: Slot;
  name: string;
  /** Lower-case noun Jocelyn uses: "Love the hoodie". */
  short: string;
  plural?: boolean;
  tags: Tag[];
  variants: Variant[];
  /** Thumbnail viewBox in body coordinates. */
  thumb: string;
  /** A hint of Liz behind the thumbnail (shoes default to feet, hair to her head). */
  thumbBody?: 'bust' | 'head';
  /** Wes's planned surprise: a sticker on the tile. */
  special?: boolean;
  /** Jocelyn's line when this item is what's wrong, by theme id. */
  quip?: Record<string, string>;
  draw(v: Variant, uid: string): Drawing;
}

// ------------------------------------------------------------ palette

export const SKIN = '#f7d4ba';
export const SKIN_SH = '#ecb999';
export const HAIR = '#e8692f';
export const HAIR_SH = '#c9521f';

const C = {
  cobalt: '#2f5fd0',
  gold: '#f6c935',
  white: '#fbfaf6',
  red: '#e5484d',
  cherry: '#c8323c',
  navy: '#2c3a6b',
  gray: '#aab0bb',
  pink: '#f59ab8',
  blush: '#f9c4d2',
  cream: '#f5ead2',
  lavender: '#c7b5ec',
  sage: '#a3c497',
  brown: '#9a6747',
  tan: '#d8b086',
  denim: '#6f97cf',
  denimLt: '#a7c3e8',
  black: '#2f2b35',
  silver: '#cfd5df',
  leaf: '#7fb069',
  rose: '#ec6f86',
};

/** Mix a hex colour towards black (k < 0) or white (k > 0). */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const t = k < 0 ? 0 : 255;
  const p = Math.abs(k);
  const ch = (v: number) => Math.round(v + (t - v) * p);
  const r = ch(n >> 16);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// ------------------------------------------------------------ body geometry

/** Left arm polyline: shoulder, elbow, wrist (the right arm is mirrored). */
const ARM: Array<[number, number]> = [
  [68.5, 151],
  [61, 212],
  [58.5, 266],
];
const SEG1 = Math.hypot(ARM[1][0] - ARM[0][0], ARM[1][1] - ARM[0][1]);
const SEG2 = Math.hypot(ARM[2][0] - ARM[1][0], ARM[2][1] - ARM[1][1]);
const ARM_LEN = SEG1 + SEG2;

/** Point at fraction t (0 = shoulder, 1 = wrist) along the left arm. */
function armAt(t: number): [number, number] {
  const d = t * ARM_LEN;
  if (d <= SEG1) {
    const k = d / SEG1;
    return [ARM[0][0] + (ARM[1][0] - ARM[0][0]) * k, ARM[0][1] + (ARM[1][1] - ARM[0][1]) * k];
  }
  const k = (d - SEG1) / SEG2;
  return [ARM[1][0] + (ARM[2][0] - ARM[1][0]) * k, ARM[1][1] + (ARM[2][1] - ARM[1][1]) * k];
}

/** Path along the arm between fractions t0 and t1. */
function armPath(t0: number, t1: number): string {
  const a = armAt(t0);
  const b = armAt(t1);
  const elbow = SEG1 / ARM_LEN;
  const mid = t0 < elbow && t1 > elbow ? ` L${ARM[1][0]} ${ARM[1][1]}` : '';
  return `M${f1(a[0])} ${f1(a[1])}${mid} L${f1(b[0])} ${f1(b[1])}`;
}

/** A line straight across the left sleeve at fraction t (cuff seams). */
function across(t: number, w: number): string {
  const [x, y] = armAt(t);
  const [a, b] = t * ARM_LEN <= SEG1 ? [ARM[0], ARM[1]] : [ARM[1], ARM[2]];
  const n = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const px = (-(b[1] - a[1]) / n) * (w / 2);
  const py = ((b[0] - a[0]) / n) * (w / 2);
  return `M${f1(x - px)} ${f1(y - py)} L${f1(x + px)} ${f1(y + py)}`;
}

/** Both sleeves as one outlined piece: a round shoulder plus a square-hemmed tube. */
function sleeves(t: number, w: number, fill: string, cuff?: string): string {
  return ink(() => {
    // the outline pass runs a little past the hem so the hem gets its ink line too
    const end = isOutlining() ? t + OUTLINE / 2 / ARM_LEN : t;
    let s = circ(ARM[0][0], ARM[0][1], w / 2, fill) + tube(armPath(0, end), fill, w);
    if (cuff) s += tube(armPath(t - 0.07, t), cuff, w) + L(across(t - 0.07, w), INK, LINE);
    return mir(s);
  });
}

/** Torso edge x at height y (left side), waist and below. */
const hipX = (y: number) => 81.5 - Math.max(0, y - 210) * 0.1625;

type Neck = 'crew' | 'high' | 'v' | 'scoop' | 'square';
const NECKS: Record<Neck, string> = {
  crew: 'Q100 146 90 135',
  high: 'Q100 140 90 135',
  v: 'L100 160 L90 135',
  scoop: 'Q100 160 90 135',
  square: 'L113 141 L113 153 L87 153 L87 141',
};

/** A shirt body from the shoulders to `hem`. `loose` widens it, `ease` flares the hem. */
function bodice(o: { neck?: Neck; hem?: number; ease?: number; loose?: number } = {}): string {
  const { neck = 'crew', hem = 236, ease = 3, loose = 0 } = o;
  const r = (x: number) => f1(200 - x);
  const shx = f1(67.5 - loose * 0.4);
  const apx = f1(70 - loose);
  const wax = f1(81.5 - loose * 1.3);
  const hx = f1(Math.min(wax, hipX(hem)) - ease);
  return (
    `M90 135 C82 136.5 ${shx + 4} 139.5 ${shx} 146.5 C${shx - 1.5} 154 ${apx - 2.5} 163 ${apx} 172 ` +
    `C${apx + 3} 186 ${wax - 1.5} 199 ${wax} 210 L${hx} ${hem} Q100 ${hem + 2.5} ${r(hx)} ${hem} L${r(wax)} 210 ` +
    `C${r(wax) + 1.5} 199 ${r(apx) - 3} 186 ${r(apx)} 172 C${r(apx) + 2.5} 163 ${r(shx) + 1.5} 154 ${r(shx)} 146.5 ` +
    `C${r(shx) - 4} 139.5 118 136.5 110 135 ${NECKS[neck]} Z`
  );
}

/** Strapless sweetheart bodice to the waist (straps drawn separately). */
const SWEETHEART =
  'M78.5 156 C85 149 94 150 100 157 C106 150 115 149 121.5 156 L121.5 168 C121 184 119 198 118.5 211 L81.5 211 C81 198 79 184 78.5 168 Z';
const straps = (fill: string, w = 2.4) => ink(() => mir(S('M84.5 153 L86.5 137.5', fill, w)));

/** A-line skirt from the waist (`top`) to `hem`, hem corner at `hx` (left). */
function skirt(top: number, hem: number, hx: number, sag = 6): string {
  const h = hem - top;
  return (
    `M80 ${top} L120 ${top} C122 ${f1(top + h * 0.35)} ${f1(201 - hx)} ${f1(hem - h * 0.3)} ${f1(200 - hx)} ${hem} ` +
    `Q100 ${hem + sag} ${hx} ${hem} C${f1(hx - 1)} ${f1(hem - h * 0.3)} 78 ${f1(top + h * 0.35)} 80 ${top} Z`
  );
}

/** Trousers from the waist; `ox`/`ix` = outer/inner x of the left hem. */
function pants(hem: number, ox: number, ix: number): string {
  const r = (x: number) => f1(200 - x);
  return (
    `M80 209 L120 209 C122 223 127 237 127 252 C128 300 ${r(ox) + 1} ${hem - 60} ${r(ox)} ${hem} L${r(ix)} ${hem} ` +
    `C${r(ix)} ${hem - 60} 101.5 300 101 270 L99 270 C98.5 300 ${ix} ${hem - 60} ${ix} ${hem} L${ox} ${hem} ` +
    `C${ox - 1} ${hem - 60} 72 300 73 252 C73 237 78 223 80 209 Z`
  );
}

/** A waistband as its own outlined strip. */
const waistband = (fill: string, bottom = 216.5) => ink(() => P(`M80 209 L120 209 L120.6 ${bottom} L79.4 ${bottom} Z`, fill));

// ------------------------------------------------------------ patterns

const pat = (id: string, w: number, h: number, body: string) =>
  only(`<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="${w}" height="${h}">${body}</pattern></defs>`);

function stripesPat(id: string, bg: string, fg: string): string {
  return pat(id, 10, 10, `<rect width="10" height="10" fill="${bg}"/><rect width="10" height="4.4" fill="${fg}"/>`);
}

function ginghamPat(id: string, c: string): string {
  return pat(
    id,
    10,
    10,
    `<rect width="10" height="10" fill="#fffdf8"/><rect width="5" height="10" fill="${c}" opacity=".45"/>` +
      `<rect width="10" height="5" fill="${c}" opacity=".45"/>`,
  );
}

/** A little inked rose: bloom, swirl and two leaves, centred on (x, y). */
function rose(x: number, y: number, bloom: string, leaf: string, s = 1): string {
  const k = (n: number) => f1(n * s);
  const edge = `stroke="${INK}" stroke-width=".45"`;
  return (
    ell(x - k(4.4), y + k(2.4), k(3), k(1.5), leaf, `transform="rotate(-30 ${x - k(4.4)} ${y + k(2.4)})" ${edge}`) +
    ell(x + k(4.2), y + k(2.8), k(3), k(1.5), leaf, `transform="rotate(30 ${x + k(4.2)} ${y + k(2.8)})" ${edge}`) +
    circ(x, y, k(4.2), bloom, edge) +
    L(`M${x - k(1.8)} ${y + k(0.4)} a${k(1.9)} ${k(1.9)} 0 1 1 ${k(2.2)} ${k(1.6)}`, INK, k(0.5))
  );
}

function rosesPat(id: string, bg: string, bloom: string): string {
  return pat(
    id,
    26,
    26,
    `<rect width="26" height="26" fill="${bg}"/>` + rose(7, 7, bloom, C.leaf, 0.9) + rose(20, 20, shade(bloom, 0.18), C.leaf, 0.8),
  );
}

function daisy(x: number, y: number, petal: string, s = 1): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    out += circ(f1(x + Math.cos(a) * 2.6 * s), f1(y + Math.sin(a) * 2.6 * s), f1(1.8 * s), petal);
  }
  return out + circ(x, y, f1(1.5 * s), C.gold, `stroke="${INK}" stroke-width=".4"`);
}

function daisiesPat(id: string, bg: string, petal: string): string {
  return pat(id, 22, 22, `<rect width="22" height="22" fill="${bg}"/>` + daisy(6, 6, petal) + daisy(17, 16, petal, 0.8));
}

function lemonsPat(id: string, bg: string): string {
  const edge = `stroke="${INK}" stroke-width=".45"`;
  const lemon = (x: number, y: number) =>
    ell(x, y, 3.6, 2.6, C.gold, `transform="rotate(-25 ${x} ${y})" ${edge}`) +
    ell(x + 3.6, y - 2.6, 1.8, 0.9, C.leaf, `transform="rotate(-40 ${x + 3.6} ${y - 2.6})" ${edge}`);
  return pat(id, 22, 22, `<rect width="22" height="22" fill="${bg}"/>` + lemon(6, 7) + lemon(17, 17));
}

function sequinPat(id: string, base: string): string {
  const a = shade(base, 0.35);
  const b = shade(base, -0.15);
  return pat(id, 6, 6, `<rect width="6" height="6" fill="${base}"/>` + circ(1.5, 1.5, 1.3, a) + circ(4.5, 4.5, 1.3, b));
}

/** Vertical ribs (corduroy, knits): flat base with a thin darker line. */
function ribPat(id: string, base: string, w = 4): string {
  return pat(id, w, 10, `<rect width="${w}" height="10" fill="${base}"/><rect x="${w - 0.9}" width="0.9" height="10" fill="${shade(base, -0.16)}"/>`);
}

const url = (id: string) => `url(#${id})`;

// ------------------------------------------------------------ items

const v = (name: string, colors: ColorFamily[], ...c: string[]): Variant => ({ name, colors, c });

const THUMB_HAIR = '34 14 132 132';
const THUMB_TOP = '30 124 140 148';
const THUMB_BOTTOM = '40 204 120 226';
const THUMB_DRESS = '38 128 124 206';
const THUMB_SHOES = '58 372 84 74';

// ---------- hair  (back mass in the shadow tone, front pieces in copper, ink strands)

const hairCapPart =
  'M65 100 C59 66 76 36 101 35.5 C126 36 142 62 135 100 C132 84 127 72 117 61 C110 70 91 76 70 73 C67.5 80 66 90 65 100 Z';
const hairCapSleek =
  'M66.5 98 C61 66 77 37.5 100 37.5 C123 37.5 139 66 133.5 98 C130.5 82 124 70 112 64 C104 60.5 96 60.5 88 64 C76 70 69.5 82 66.5 98 Z';
const wavesBack =
  'M101 33 C84 32 66 40 59 58 C53 72 55 86 53 98 C51 112 45 122 46 136 C47 150 54 158 51 172 C48 186 42 196 45 210 ' +
  'C48 224 55 230 52 244 C50 252 53 260 61 262 C67 263 71 256 77 258 L101 258 Z';
const wavesLock =
  'M70 72 C60 84 57 100 60.5 116 C64 132 56 146 59.5 162 C63 176 55.5 190 59.5 204 C61.5 213 65.5 219 70 222 ' +
  'C70.5 214 74.5 208 74 199 C73.5 187 80 179 78 165 C76 151 81.5 142 79.5 128 C77.5 114 72 104 74 90 Z';
const strand = (d: string) => L(d, INK, 0.9);
const lockStrands = mir(strand('M65 118 C67.5 130 62 142 64.5 155') + strand('M67 176 C68.5 187 63 197 65.5 207'));
const sleekStrands = strand('M86 64 C88.5 57 91.5 52 95.5 48') + strand('M114 64 C111.5 57 108.5 52 104.5 48');
const backHair = () => ink(() => mir(P(wavesBack, HAIR_SH))) + mir(strand('M55 150 C51 170 50 190 52 206'));

/** A hair bow centred on (x, y). */
function bow(x: number, y: number, c: string, s = 1, rot = 0): string {
  const d = shade(c, -0.18);
  const k = (n: number) => f1(n * s);
  return (
    `<g transform="translate(${x} ${y}) rotate(${rot})">` +
    ink(
      () =>
        P(`M${k(-2)} ${k(2)} L${k(-7)} ${k(13)} L${k(-3)} ${k(12)} L${k(0)} ${k(3)} Z`, d) +
        P(`M${k(2)} ${k(2)} L${k(7)} ${k(13)} L${k(3)} ${k(12)} L${k(0)} ${k(3)} Z`, d) +
        P(`M0 0 C${k(-6)} ${k(-10)} ${k(-17)} ${k(-10)} ${k(-17)} ${k(-1)} C${k(-17)} ${k(8)} ${k(-6)} ${k(7)} 0 0 Z`, c) +
        P(`M0 0 C${k(6)} ${k(-10)} ${k(17)} ${k(-10)} ${k(17)} ${k(-1)} C${k(17)} ${k(8)} ${k(6)} ${k(7)} 0 0 Z`, c),
    ) +
    L(`M${k(-12)} ${k(-3)} C${k(-9)} ${k(-5)} ${k(-6)} ${k(-4)} ${k(-3)} ${k(-1)}`, INK, Math.min(LINE, k(1))) +
    L(`M${k(12)} ${k(-3)} C${k(9)} ${k(-5)} ${k(6)} ${k(-4)} ${k(3)} ${k(-1)}`, INK, Math.min(LINE, k(1))) +
    ink(() => ell(0, 0, k(3.6), k(3.2), d)) +
    `</g>`
  );
}

/** One braid of overlapping plaits from (x0,y0) down to (x1,y1). */
function braid(x0: number, y0: number, x1: number, y1: number, n: number, w: number): string {
  const plaits = (lines: boolean) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const x = f1(x0 + (x1 - x0) * k);
      const y = f1(y0 + (y1 - y0) * k);
      const ww = f1(w * (1 - k * 0.25));
      const up = i % 2 ? -1 : 1;
      s += lines
        ? strand(`M${f1(x - ww * 0.75)} ${f1(y - up * ww * 0.35)} Q${x} ${f1(y + 2)} ${f1(x + ww * 0.75)} ${f1(y + up * ww * 0.35)}`)
        : ell(x, y, ww, f1(ww * 0.78), HAIR, `transform="rotate(${i % 2 ? 28 : -28} ${x} ${y})"`);
    }
    return s;
  };
  return ink(() => plaits(false)) + plaits(true);
}

const HAIR_ITEMS: Item[] = [
  {
    id: 'waves',
    cat: 'hair',
    name: 'Long Waves',
    short: 'long waves',
    plural: true,
    tags: ['romantic', 'vintage'],
    variants: [v('Natural', [], HAIR)],
    thumb: THUMB_HAIR,
    draw: () => ({
      hairBack: backHair(),
      hairFront:
        ink(() => mir(P(wavesLock, HAIR)) + P(hairCapPart, HAIR)) +
        lockStrands +
        strand('M80 47 C88 42 98 40.5 107 42') +
        strand('M117 61 C121 54 125 52 129 54'),
    }),
  },
  {
    id: 'ponytail',
    cat: 'hair',
    name: 'High Ponytail',
    short: 'ponytail',
    tags: ['sporty', 'casual'],
    variants: [v('Blue scrunchie', ['blue'], C.cobalt), v('Gold scrunchie', ['yellow'], C.gold), v('Pink scrunchie', ['pink'], C.pink)],
    thumb: THUMB_HAIR,
    draw: (vr) => ({
      hairBack:
        ink(
          () =>
            P('M112 38 C134 30 150 46 147 70 C144 94 133 104 139 126 C143 142 136 158 124 164 C130 148 126 134 122 120 C115 98 125 74 109 50 Z', HAIR_SH) +
            P('M66 98 C60 70 74 40 100 39 C126 40 140 70 134 98 L100 104 Z', HAIR_SH),
        ) +
        strand('M130 52 C138 66 134 84 130 98') +
        strand('M138 120 C141 134 136 146 130 154'),
      hairFront:
        ink(() => P(hairCapSleek, HAIR)) +
        strand('M87 64 C92 54 100 47 108 43') +
        strand('M101 61 C104 53 108 48 112 45') +
        ink(() => mir(S('M68.5 92 C66 102 67.5 110 70.5 115', HAIR, 1.6))) +
        ink(() => ell(113, 38, 9, 6.2, vr.c[0], 'transform="rotate(-22 113 38)"')) +
        L('M107 37 C110 41 114 42 118 39', INK, 0.9),
    }),
  },
  {
    id: 'braid',
    cat: 'hair',
    name: 'Side Braid',
    short: 'side braid',
    tags: ['cozy', 'cute', 'casual'],
    variants: [v('Cream tie', ['cream'], C.cream), v('Pink tie', ['pink'], C.pink), v('Sage tie', ['green'], C.sage)],
    thumb: THUMB_HAIR,
    draw: (vr) => ({
      hairBack: ink(() => P('M65 102 C57 68 74 36 101 35 C127 36 143 68 135 102 L101 110 Z', HAIR_SH)),
      hairFront:
        braid(69, 106, 74, 196, 9, 9.5) +
        ink(() => P('M70 205 C68 212 70 220 74 224 C76 219 80 214 79 205 Z', HAIR)) +
        ink(() => ell(74.5, 203, 5.2, 3.2, vr.c[0])) +
        ink(
          () =>
            P('M64 104 C58 70 75 36 101 35.5 C126 36 142 64 135 100 C131 84 127 72 117 61 C110 72 92 80 74 80 C69 88 66 96 64 104 Z', HAIR) +
            P('M64 104 C62 112 64 118 69 116 C71 108 72 98 74 88 Z', HAIR),
        ) +
        strand('M80 47 C88 42 98 40.5 107 42') +
        strand('M117 61 C121 54 125 52 129 54') +
        strand('M131 92 C133 100 132 106 130 112'),
    }),
  },
  {
    id: 'bun',
    cat: 'hair',
    name: 'Messy Bun',
    short: 'messy bun',
    tags: ['cozy', 'casual'],
    variants: [v('Copper', [], HAIR)],
    thumb: THUMB_HAIR,
    draw: () => ({
      hairBack:
        ink(() => P('M66 98 C60 70 74 40 100 39 C126 40 140 70 134 98 L100 104 Z', HAIR_SH)) +
        ink(() => circ(100, 28, 17.5, HAIR)) +
        strand('M112 15 C116 11 119 13 118 18') +
        strand('M88 16 C85 11 86 8 89 9') +
        strand('M88 27 C89 17 103 14 108 22 C111 30 102 36 95 31') +
        strand('M94 39 C99 34 106 35 111 38'),
      hairFront:
        ink(() => P(hairCapSleek, HAIR)) +
        sleekStrands +
        ink(() => mir(S('M70 74 C65 90 66 104 70 114 C73 121 71 128 68 134', HAIR, 2))),
    }),
  },
  {
    id: 'halfbow',
    cat: 'hair',
    name: 'Half-Up Bow',
    short: 'half-up bow',
    tags: ['romantic', 'cute', 'vintage'],
    variants: [v('Pink bow', ['pink'], C.pink), v('Cream bow', ['cream'], '#fff4e2'), v('Cherry bow', ['red'], C.cherry)],
    thumb: THUMB_HAIR,
    draw: (vr) => ({
      hairBack: backHair() + bow(100, 31, vr.c[0], 1.15),
      hairFront: ink(() => mir(P(wavesLock, HAIR)) + P(hairCapSleek, HAIR)) + sleekStrands + lockStrands,
    }),
  },
  {
    id: 'pigtails',
    cat: 'hair',
    name: 'Pigtails',
    short: 'pigtails',
    plural: true,
    tags: ['sporty', 'cute'],
    variants: [v('Blue ribbons', ['blue'], C.cobalt), v('Gold ribbons', ['yellow'], C.gold), v('Pink ribbons', ['pink'], C.pink)],
    thumb: THUMB_HAIR,
    draw: (vr) => {
      const tail =
        ink(() => P('M66 104 C54 110 46 124 48 142 C49 156 44 168 48 180 C52 174 56 168 56 160 C58 168 62 172 66 172 C62 160 64 150 62 140 C61 126 66 116 72 110 Z', HAIR)) +
        strand('M57 124 C53 136 55 148 53 160') +
        bow(66, 106, vr.c[0], 0.55, -20);
      return {
        hairBack: ink(() => P('M66 100 C60 70 74 40 100 39 C126 40 140 70 134 100 L100 106 Z', HAIR_SH)),
        hairFront:
          mir(tail) +
          ink(() =>
            P('M66.5 100 C61 66 77 37.5 100 37.5 C123 37.5 139 66 133.5 100 C131 84 124 68 112 62 C106 58 102 58 100 62 C98 58 94 58 88 62 C76 68 69 84 66.5 100 Z', HAIR),
          ) +
          strand('M100 40 L100 60') +
          strand('M84 48 C89 44 94 42 97 42'),
      };
    },
  },
];

// ---------- tops

const TOP_ITEMS: Item[] = [
  {
    id: 'teamtee',
    cat: 'top',
    name: 'Team Tee',
    short: 'team tee',
    tags: ['sporty', 'casual'],
    variants: [
      v('Blue & gold', ['blue', 'yellow'], C.cobalt, C.gold),
      v('White & blue', ['white', 'blue'], C.white, C.cobalt),
      v('Red & white', ['red', 'white'], C.red, C.white),
    ],
    thumb: '46 126 108 118',
    draw: (vr) => {
      const [m, a] = vr.c;
      return {
        top:
          ink(() => P(bodice({ hem: 238, ease: 4, loose: 2 }), m)) +
          sleeves(0.32, 17, a) +
          ink(() => S('M90 136 Q100 146 110 136', a, 2.6)) +
          // basketball crest
          ink(() => circ(100, 182, 10.5, '#f08a3c')) +
          L('M89.5 182 L110.5 182 M100 171.5 L100 192.5', INK, 0.9) +
          L('M93 174.5 C96.5 179 96.5 185 93 189.5 M107 174.5 C103.5 179 103.5 185 107 189.5', INK, 0.9),
      };
    },
  },
  {
    id: 'hoodie',
    cat: 'top',
    name: 'Cozy Hoodie',
    short: 'hoodie',
    tags: ['cozy', 'casual', 'sporty'],
    variants: [v('Heather gray', ['gray'], C.gray), v('School blue', ['blue'], C.cobalt), v('Bubblegum', ['pink'], C.pink)],
    thumb: THUMB_TOP,
    quip: { liz: "a hoodie? That's Wes's look, not hers." },
    draw: (vr) => {
      const m = vr.c[0];
      const d = shade(m, -0.14);
      return {
        behind: ink(() => P('M80 146 C76 126 88 118 100 118 C112 118 124 126 120 146 Z', d)),
        top:
          ink(() => P(bodice({ neck: 'high', hem: 242, ease: 5, loose: 5 }), m)) +
          ink(() => P('M75.6 233 L124.4 233 L125 246 Q100 249 75 246 Z', d)) +
          sleeves(0.96, 17.5, m, d) +
          ink(() => P('M84 207 L116 207 L121 231 L79 231 Z', m)) +
          L('M86 209 C84 216 82 222 81 229 M114 209 C116 216 118 222 119 229', INK, LINE) +
          ink(() => P('M86 132 C84 142 90 152 100 156 C110 152 116 142 114 132 C110 140 106 144 100 145 C94 144 90 140 86 132 Z', d)) +
          ink(() => S('M96 151 L95 175', '#fbfaf6', 1.3) + S('M104 151 L105 175', '#fbfaf6', 1.3)),
      };
    },
  },
  {
    id: 'blouse',
    cat: 'top',
    name: 'Puff-Sleeve Blouse',
    short: 'puff-sleeve blouse',
    tags: ['romantic', 'vintage', 'cute'],
    variants: [v('Cream', ['cream'], C.cream), v('Blush', ['pink'], C.blush), v('Lavender', ['purple'], C.lavender)],
    thumb: '46 126 108 118',
    draw: (vr) => {
      const m = vr.c[0];
      let scallop = '';
      for (let x = 88; x < 113; x += 4) scallop += circ(x + 2, 153.5, 2, '#fffdf8');
      return {
        under:
          ink(() => P(bodice({ neck: 'square', hem: 220, ease: 0, loose: 0 }), m)) +
          ink(() => scallop) +
          ink(() => mir(ell(65.5, 158, 11.5, 13, m))) +
          mir(L('M58 168 C62 172 68 172 72.5 168', INK, LINE) + L('M61 150 C63 158 63 164 62 169', INK, 0.8)) +
          circ(100, 168, 1.5, '#fffdf8', EDGE) +
          circ(100, 182, 1.5, '#fffdf8', EDGE) +
          circ(100, 196, 1.5, '#fffdf8', EDGE),
      };
    },
  },
  {
    id: 'stripetee',
    cat: 'top',
    name: 'Striped Tee',
    short: 'striped tee',
    tags: ['casual', 'cute'],
    variants: [
      v('Navy stripe', ['navy', 'white'], C.navy, C.white),
      v('Red stripe', ['red', 'white'], C.red, C.white),
      v('Sunny stripe', ['yellow', 'white'], C.gold, C.white),
    ],
    thumb: '46 126 108 118',
    draw: (vr, uid) => {
      const id = `${uid}st`;
      return {
        top:
          stripesPat(id, vr.c[1], vr.c[0]) +
          ink(() => P(bodice({ hem: 232, ease: 2, loose: 0 }), url(id))) +
          sleeves(0.28, 15.5, url(id)) +
          ink(() => S('M90 136 Q100 146 110 136', vr.c[0], 2.2)),
      };
    },
  },
  {
    id: 'sweater',
    cat: 'top',
    name: 'Chunky Sweater',
    short: 'chunky sweater',
    tags: ['cozy', 'cute'],
    variants: [v('Oatmeal', ['cream'], C.cream), v('Sage', ['green'], C.sage), v('Rose', ['pink'], C.blush)],
    thumb: THUMB_TOP,
    draw: (vr) => {
      const m = vr.c[0];
      const d = shade(m, -0.14);
      const cable = (x: number) => {
        let s = `M${x} 150`;
        let s2 = `M${x} 150`;
        for (let y = 150; y < 228; y += 9) {
          s += ' q4 4.5 0 9';
          s2 += ' q-4 4.5 0 9';
        }
        return L(s, d, 1.2) + L(s2, d, 1.2);
      };
      return {
        top:
          ink(() => P(bodice({ neck: 'high', hem: 240, ease: 6, loose: 6 }), m)) +
          cable(88) +
          cable(100) +
          cable(112) +
          ink(() => P('M74 232 L126 232 L127 244 Q100 247 73 244 Z', d)) +
          ink(() => S('M89 137 Q100 144 111 137', d, 3.6)) +
          sleeves(0.96, 19, m, d),
      };
    },
  },
  {
    id: 'sequintop',
    cat: 'top',
    name: 'Sequin Top',
    short: 'sequin top',
    tags: ['glam'],
    variants: [v('Silver', ['gray'], C.silver), v('Gold', ['yellow'], C.gold)],
    thumb: '62 128 76 106',
    draw: (vr, uid) => {
      const id = `${uid}sq`;
      return {
        top:
          sequinPat(id, vr.c[0]) +
          straps(shade(vr.c[0], -0.2), 1.8) +
          ink(() => P('M78.5 156 L121.5 156 L121.5 168 C121 184 119 198 118.5 211 L121 228 Q100 231 79 228 L81.5 211 C81 198 79 184 78.5 168 Z', url(id))),
      };
    },
  },
];

// ---------- bottoms

const BOTTOM_ITEMS: Item[] = [
  {
    id: 'jeans',
    cat: 'bottom',
    name: 'Mom Jeans',
    short: 'mom jeans',
    plural: true,
    tags: ['casual'],
    variants: [v('Classic wash', ['denim'], C.denim), v('Light wash', ['denim'], C.denimLt), v('White', ['white'], '#f2efe7')],
    thumb: THUMB_BOTTOM,
    draw: (vr) => {
      const m = vr.c[0];
      const st = '#e8b85c';
      return {
        bottom:
          ink(() => P(pants(420, 75.5, 98), m)) +
          mir(ink(() => P('M75.5 410 L98 410 L98 420 L75.5 420 Z', shade(m, 0.12)))) +
          waistband(shade(m, -0.12)) +
          circ(100, 213, 1.8, st, EDGE) +
          L('M100 217 L100 240', INK, LINE) +
          mir(L('M80 222 C86 226 90 226 93 220', INK, LINE) + L('M81 224.5 C86 228 90 228 93 223', st, 0.8, 'stroke-dasharray="1.6 1.4"')),
      };
    },
  },
  {
    id: 'joggers',
    cat: 'bottom',
    name: 'Joggers',
    short: 'joggers',
    plural: true,
    tags: ['sporty', 'cozy', 'casual'],
    variants: [v('Heather gray', ['gray'], C.gray), v('Navy', ['navy'], C.navy), v('School blue', ['blue'], C.cobalt)],
    thumb: THUMB_BOTTOM,
    draw: (vr) => {
      const m = vr.c[0];
      const d = shade(m, -0.15);
      return {
        bottom:
          ink(() => P(pants(410, 77.5, 97), m)) +
          mir(L('M74 252 C74 300 77 360 78.6 405', '#fbfaf6', 1.8)) +
          mir(ink(() => P('M78.2 406 L97 406 L96.5 421 L79.5 421 Z', d))) +
          waistband(d, 219) +
          L('M97 219 L95.5 229 M103 219 L104.5 229', '#fbfaf6', 1.3),
      };
    },
  },
  {
    id: 'pleated',
    cat: 'bottom',
    name: 'Pleated Skirt',
    short: 'pleated skirt',
    tags: ['cute', 'casual'],
    variants: [v('White', ['white'], '#f7f5ef'), v('Navy', ['navy'], C.navy), v('Pink', ['pink'], C.pink)],
    thumb: '48 200 104 96',
    draw: (vr) => {
      const m = vr.c[0];
      let pleats = '';
      for (let i = 1; i < 8; i++) {
        const xt = 80 + (40 * i) / 8;
        const xb = 68 + (64 * i) / 8;
        pleats += L(`M${f1(xt)} 217 L${f1(xb)} 283`, INK, 0.9);
      }
      return { bottom: ink(() => P(skirt(209, 282, 68, 4), m)) + pleats + waistband(shade(m, -0.12)) };
    },
  },
  {
    id: 'floralskirt',
    cat: 'bottom',
    name: 'Floral Midi Skirt',
    short: 'floral midi skirt',
    tags: ['romantic', 'floral', 'vintage'],
    variants: [v('Cream roses', ['cream', 'pink'], C.cream, C.rose), v('Blue daisies', ['blue', 'white'], '#7fa6e6', '#ffffff')],
    thumb: '34 200 132 166',
    draw: (vr, uid) => {
      const id = `${uid}fl`;
      const defs = vr.c[1] === '#ffffff' ? daisiesPat(id, vr.c[0], vr.c[1]) : rosesPat(id, vr.c[0], vr.c[1]);
      return { bottom: defs + ink(() => P(skirt(209, 352, 58, 7), url(id))) + waistband(shade(vr.c[0], -0.12)) };
    },
  },
  {
    id: 'cords',
    cat: 'bottom',
    name: 'Corduroy Pants',
    short: 'corduroys',
    plural: true,
    tags: ['vintage', 'cozy', 'casual'],
    variants: [v('Toffee', ['brown'], C.brown), v('Sage', ['green'], '#8fb383')],
    thumb: THUMB_BOTTOM,
    draw: (vr, uid) => {
      const id = `${uid}cd`;
      return {
        bottom: ribPat(id, vr.c[0], 3.4) + ink(() => P(pants(424, 69, 98.5), url(id))) + waistband(shade(vr.c[0], -0.14)) + circ(100, 213, 1.7, '#e8c46d', EDGE),
      };
    },
  },
  {
    id: 'leather',
    cat: 'bottom',
    name: 'Leather Mini',
    short: 'leather mini',
    tags: ['edgy', 'glam'],
    variants: [v('Black', ['black'], C.black)],
    thumb: '56 198 88 80',
    draw: (vr) => ({
      bottom: ink(() => P(skirt(209, 266, 75, 3), vr.c[0])) + L('M100 216 L100 246', '#9a96a3', 1.2) + waistband(shade(vr.c[0], 0.14), 215),
    }),
  },
];

// ---------- dresses

const DRESS_ITEMS: Item[] = [
  {
    id: 'sundress',
    cat: 'dress',
    name: 'Floral Sundress',
    short: 'floral sundress',
    tags: ['romantic', 'floral', 'vintage', 'cute'],
    variants: [
      v('Cream roses', ['cream', 'pink'], C.cream, C.rose),
      v('Blue daisies', ['blue', 'white'], '#7fa6e6', '#ffffff'),
      v('Lemons', ['yellow', 'white'], '#fffbea', C.gold),
    ],
    thumb: THUMB_DRESS,
    draw: (vr, uid) => {
      const id = `${uid}sd`;
      const defs = vr.c[0] === '#fffbea' ? lemonsPat(id, vr.c[0]) : vr.c[1] === '#ffffff' ? daisiesPat(id, vr.c[0], vr.c[1]) : rosesPat(id, vr.c[0], vr.c[1]);
      const d = shade(vr.c[0], -0.15);
      return {
        dress:
          defs +
          straps(d) +
          ink(() => P(skirt(207, 324, 60, 7), url(id)) + P(SWEETHEART, url(id))) +
          L('M81.5 210.5 L118.5 210.5', INK, LINE) +
          circ(100, 172, 1.5, '#fffdf8', EDGE) +
          circ(100, 186, 1.5, '#fffdf8', EDGE) +
          circ(100, 200, 1.5, '#fffdf8', EDGE),
      };
    },
  },
  {
    id: 'gingham',
    cat: 'dress',
    name: 'Gingham Dress',
    short: 'gingham dress',
    tags: ['vintage', 'cute', 'romantic'],
    variants: [v('Pink', ['pink', 'white'], '#f27aa0'), v('Blue', ['blue', 'white'], '#4f7fe0'), v('Butter', ['yellow', 'white'], '#f2c230')],
    thumb: THUMB_DRESS,
    draw: (vr, uid) => {
      const id = `${uid}gh`;
      const m = vr.c[0];
      return {
        dress:
          ginghamPat(id, m) +
          ink(() => P(skirt(207, 318, 62, 7), url(id)) + P(bodice({ neck: 'square', hem: 212, ease: 0 }), url(id))) +
          ink(() => mir(ell(65.5, 157, 10.5, 11.5, url(id)))) +
          ink(() => S('M81.5 210 L118.5 210', shade(m, -0.1), 3.4)) +
          bow(100, 210, '#fffaf0', 0.5),
      };
    },
  },
  {
    id: 'sweaterdress',
    cat: 'dress',
    name: 'Sweater Dress',
    short: 'sweater dress',
    tags: ['cozy'],
    variants: [v('Oatmeal', ['cream'], '#eadcc2'), v('Gray', ['gray'], C.gray), v('Mauve', ['pink'], '#d79fb0')],
    thumb: THUMB_DRESS,
    draw: (vr, uid) => {
      const id = `${uid}sw`;
      const m = vr.c[0];
      const d = shade(m, -0.13);
      return {
        dress:
          ribPat(id, m, 4) +
          ink(() => P(skirt(206, 318, 72, 4), url(id)) + P(bodice({ neck: 'high', hem: 214, ease: 0, loose: 2 }), url(id))) +
          ink(() => P('M72.5 309 L127.5 309 L128 318 Q100 324 72 318 Z', d)) +
          ink(() => P('M88 132 Q100 128 112 132 L112 141 Q100 145 88 141 Z', d)) +
          sleeves(0.96, 17, url(id), d),
      };
    },
  },
  {
    id: 'collardress',
    cat: 'dress',
    name: 'Her Collar Dress',
    short: 'collar dress',
    tags: ['vintage', 'romantic', 'cute'],
    variants: [v('Navy', ['navy', 'white'], C.navy), v('Cherry', ['red', 'white'], '#b8323f'), v('Sage', ['green', 'white'], '#8fb383')],
    thumb: THUMB_DRESS,
    quip: { game: 'Michael already thought that dress was a uniform. Not for game day.' },
    draw: (vr) => {
      const m = vr.c[0];
      const d = shade(m, -0.15);
      return {
        dress:
          ink(() => P(skirt(204, 318, 62, 6), m) + P(bodice({ neck: 'crew', hem: 206, ease: 0 }), m)) +
          L('M80.5 205 L119.5 205', INK, LINE) +
          sleeves(0.24, 16, m, d) +
          ink(
            () =>
              P('M100 141 C94 152 84 152 82 143 C82 138 86 135 90 135 Q95 140 100 141 Z', '#fffdf8') +
              P('M100 141 C106 152 116 152 118 143 C118 138 114 135 110 135 Q105 140 100 141 Z', '#fffdf8'),
          ) +
          L('M100 141 L100 147', INK, LINE) +
          bow(100, 144, C.cherry === m ? '#fffdf8' : C.cherry, 0.36),
      };
    },
  },
  {
    id: 'jerseydress',
    cat: 'dress',
    name: 'Jersey Dress',
    short: 'jersey dress',
    tags: ['sporty', 'casual'],
    variants: [v('Blue & gold', ['blue', 'yellow'], C.cobalt, C.gold), v('White & blue', ['white', 'blue'], C.white, C.cobalt)],
    thumb: THUMB_DRESS,
    draw: (vr) => {
      const [m, a] = vr.c;
      return {
        dress:
          ink(() => P(skirt(208, 300, 70, 3), m) + P(bodice({ neck: 'v', hem: 212, ease: 0, loose: 2 }), m)) +
          mir(L('M80 214 C78 250 74 280 71 297', a, 2.6)) +
          sleeves(0.3, 17, m, a) +
          ink(() => S('M90 136.5 L100 157 L110 136.5', a, 2.6)) +
          only(
            `<text x="100" y="196" text-anchor="middle" font-family="'Permanent Marker', 'Patrick Hand', sans-serif" font-size="24" fill="${a}" stroke="${INK}" stroke-width=".8" paint-order="stroke">07</text>`,
          ),
      };
    },
  },
  {
    id: 'sequindress',
    cat: 'dress',
    name: 'Sequin Party Dress',
    short: 'sequin dress',
    tags: ['glam'],
    variants: [v('Silver', ['gray'], C.silver), v('Hot pink', ['pink'], '#ee5f9a'), v('Gold', ['yellow'], C.gold)],
    thumb: THUMB_DRESS,
    draw: (vr, uid) => {
      const id = `${uid}sp`;
      return {
        dress: sequinPat(id, vr.c[0]) + straps(shade(vr.c[0], -0.25), 1.6) + ink(() => P(skirt(207, 280, 74, 3), url(id)) + P(SWEETHEART, url(id))),
      };
    },
  },
];

// ---------- shoes  (left shoe drawn, mirrored for the right; toes point outwards)

const SHOE_LOW = 'M80 425 C86 423.5 93 423.5 96.5 426 L97.5 437.5 L72 437.5 C67.5 437.5 66.5 433 68.5 430.5 C71 428 76 427 80 425 Z';

const SHOE_ITEMS: Item[] = [
  {
    id: 'chucks',
    cat: 'shoes',
    name: 'Chuck Taylors',
    short: 'Chuck Taylors',
    plural: true,
    tags: ['casual', 'sporty', 'chucks'],
    variants: [v('White canvas', ['white'], '#fbfaf6')],
    thumb: THUMB_SHOES,
    special: true,
    draw: () => ({
      shoes: mir(
        ink(
          () =>
            P('M82 401 L96 401 L96.5 426 C97.5 430 97.5 434 97 437 L72 437 C67.5 437 66.5 432.5 68.5 430 C71 427 76 425.5 82 424 Z', '#f6f3ea') +
            P('M66.8 434 L97.8 434 L97.8 440.5 L69 440.5 C66.4 440.5 65.6 436.2 66.8 434 Z', '#ffffff'),
        ) +
          L('M67 434 L97.8 434', INK, 0.9) +
          L('M67.5 437.4 L97.5 437.4', '#2c3a6b', 0.9) +
          L('M76.5 427 C73 428 69.5 430 68 433.5', INK, 0.8) +
          L('M83.5 405 L88.5 405 M83 410 L88 410 M82.5 415 L87.5 415 M81.5 420 L86.5 420', INK, 0.8) +
          circ(92.5, 411, 2.6, '#2c3a6b', EDGE) +
          circ(92.5, 411, 1.1, '#ffffff'),
      ),
    }),
  },
  {
    id: 'sneakers',
    cat: 'shoes',
    name: 'Running Sneakers',
    short: 'sneakers',
    plural: true,
    tags: ['sporty', 'casual'],
    variants: [v('Blue & gold', ['blue', 'yellow'], C.cobalt, C.gold), v('Pink', ['pink'], C.pink, '#ffffff'), v('All white', ['white'], '#f4f2ee', '#c9ccd4')],
    thumb: THUMB_SHOES,
    draw: (vr) => {
      const [m, a] = vr.c;
      return {
        shoes: mir(
          ink(
            () =>
              P('M82 417 L95.5 417 L97 431 L97.5 435 L70 435 C66 435 65.5 430.5 68 428.5 C71 426 76 424.5 82 423 Z', m) +
              P('M66.5 433 L98 433 L98 441 L69.5 441 C66 441 65 436 66.5 433 Z', '#ffffff'),
          ) +
            L('M66.8 433 L98 433', INK, 0.9) +
            L('M72 430 C78 428 86 424 92 418', a, 2.2) +
            L('M84 419.5 L89 419.5 M83 423.5 L88 423.5', '#ffffff', 1.2) +
            ink(() => P('M93.5 417 L96 417 L97 426 L94 426 Z', a)),
        ),
      };
    },
  },
  {
    id: 'maryjanes',
    cat: 'shoes',
    name: 'Mary Janes',
    short: 'Mary Janes',
    plural: true,
    tags: ['vintage', 'cute', 'romantic'],
    variants: [v('Cherry', ['red'], C.cherry), v('Black', ['black'], C.black), v('Cream', ['cream'], '#efe2c6')],
    thumb: THUMB_SHOES,
    draw: (vr) => {
      const m = vr.c[0];
      return {
        shoes: mir(
          ink(() => P(SHOE_LOW, m) + P('M67 435.5 L98 435.5 L98 439.5 L69 439.5 C67 439.5 66.4 437 67 435.5 Z', shade(m, -0.25))) +
            L('M67 435.5 L98 435.5', INK, 0.8) +
            ink(() => S('M84 425.5 L95 421.8', m, 2)) +
            circ(95, 422, 1.3, '#f6e7b0', EDGE),
        ),
      };
    },
  },
  {
    id: 'flats',
    cat: 'shoes',
    name: 'Ballet Flats',
    short: 'ballet flats',
    plural: true,
    tags: ['romantic', 'cute'],
    variants: [v('Blush', ['pink'], '#f29bb2'), v('Cream', ['cream'], '#efe2c6'), v('Cherry', ['red'], C.cherry)],
    thumb: THUMB_SHOES,
    draw: (vr) => {
      const m = vr.c[0];
      const d = shade(m, -0.22);
      return {
        shoes: mir(
          ink(
            () =>
              P('M77 430.5 C84 429.5 92 429.5 97 430.5 L97.5 437.5 L72 437.5 C67.5 437.5 66.5 434 68.5 432.5 C71 431 74 430.8 77 430.5 Z', m) +
              P('M67.2 436 L97.8 436 L97.8 439.2 L69 439.2 C67.2 439.2 66.6 437.4 67.2 436 Z', d),
          ) +
            L('M67.4 436 L97.8 436', INK, 0.8) +
            ink(() => ell(76, 431, 2.2, 1.4, d) + ell(80, 431, 2.2, 1.4, d)),
        ),
      };
    },
  },
  {
    id: 'boots',
    cat: 'shoes',
    name: 'Shearling Boots',
    short: 'shearling boots',
    plural: true,
    tags: ['cozy', 'casual'],
    variants: [v('Chestnut', ['tan'], C.tan), v('Gray', ['gray'], '#b9b4ae'), v('Pink', ['pink'], '#f2b4c6')],
    thumb: THUMB_SHOES,
    draw: (vr) => {
      const m = vr.c[0];
      let fluff = '';
      for (let x = 80.5; x <= 95.5; x += 3) fluff += circ(f1(x), 386, 2.6, '#fbf3e4');
      return {
        shoes: mir(
          ink(
            () =>
              P('M79.5 386 L97 386 L97.5 427 C99 431 99 435 98 437.5 L72 437.5 C67.5 437.5 66.5 432.5 68.5 430 C71 427 75.5 425.5 79.5 423 Z', m) +
              P('M67 435 L98.8 435 L98.8 440.5 L69 440.5 C66.6 440.5 66 437 67 435 Z', shade(m, -0.2)),
          ) +
            L('M67.2 435 L98.8 435', INK, 0.8) +
            L('M93 392 L93 430', INK, 0.8) +
            ink(() => fluff),
        ),
      };
    },
  },
  {
    id: 'heels',
    cat: 'shoes',
    name: 'Strappy Heels',
    short: 'heels',
    plural: true,
    tags: ['glam'],
    variants: [v('Black', ['black'], C.black), v('Gold', ['yellow'], '#e2b23a'), v('Red', ['red'], C.red)],
    thumb: THUMB_SHOES,
    draw: (vr) => {
      const m = vr.c[0];
      return {
        shoes: mir(
          ink(
            () =>
              P('M68 436 C70 433 76 432 82 433 L97 435 L97.5 438.5 L70 439 C67.5 439 66.8 437.5 68 436 Z', m) +
              P('M93.5 438 L97 438 L96.2 447 L95 447 Z', m) +
              S('M83 425.5 L94 423.5', m, 1.6) +
              S('M72 433 L80 430.5', m, 1.6) +
              S('M84 418 L94 418', m, 1.4),
          ),
        ),
      };
    },
  },
];

// ---------- extras

const EXTRA_ITEMS: Item[] = [
  {
    id: 'cardigan',
    cat: 'extra',
    slot: 'outer',
    name: 'Cardigan',
    short: 'cardigan',
    tags: ['cozy', 'vintage', 'romantic', 'cute'],
    variants: [v('Pink', ['pink'], '#ef9fb2'), v('Cream', ['cream'], '#f4e6c8'), v('Sage', ['green'], C.sage)],
    thumb: '28 124 144 148',
    draw: (vr, uid) => {
      const id = `${uid}cg`;
      const m = vr.c[0];
      const d = shade(m, -0.14);
      return {
        outer:
          ribPat(id, m, 4.5) +
          ink(() =>
            mir(
              P('M90 134.5 C81 136.5 71.5 139.5 66.5 146.5 C65 154 66 164 68.5 174 C71 190 72 208 71 226 C70 238 69.5 246 69.5 254 L94.5 255.5 C94.5 230 95 200 95.5 172 C95 156 93 145 90 134.5 Z', url(id)),
            ),
          ) +
          mir(ink(() => P('M69.6 247 L94.5 248.5 L94.5 255.5 L69.5 254 Z', d))) +
          mir(ink(() => S('M90.5 136 C93.5 146 95 157 95 172 C95 200 94.5 230 94.5 254', d, 2.8))) +
          circ(98, 182, 1.9, '#fffaf0', EDGE) +
          circ(98, 202, 1.9, '#fffaf0', EDGE) +
          circ(98, 222, 1.9, '#fffaf0', EDGE) +
          sleeves(0.95, 19, url(id), d),
      };
    },
  },
  {
    id: 'denimjacket',
    cat: 'extra',
    slot: 'outer',
    name: 'Denim Jacket',
    short: 'denim jacket',
    tags: ['casual'],
    variants: [v('Classic wash', ['denim'], '#6d95cc')],
    thumb: '28 124 144 148',
    draw: (vr) => {
      const m = vr.c[0];
      const d = shade(m, -0.16);
      const st = '#efc067';
      return {
        outer: mir(
          ink(() => P('M90 134.5 C81 136.5 71.5 139.5 66.5 146.5 C65 154 66 164 68.5 174 C71 188 73 204 73 226 L95 227.5 C95 210 95.5 190 95.5 170 C95 156 93 145 90 134.5 Z', m)) +
            ink(() => P('M73 219 L95 220.5 L95 228 L73 227 Z', d)) +
            ink(() => P('M76 168 L91 168 L91 177 L76 177 Z', d)) +
            L('M76.5 179 L90.5 179 M76.5 179 L76.5 187 M90.5 179 L90.5 187', INK, 0.8) +
            L('M77.5 181 L89.5 181', st, 0.8, 'stroke-dasharray="1.4 1.2"') +
            circ(83.5, 172.5, 1.2, st, EDGE) +
            ink(() => P('M90 133 L82 140 L88 156 L95 160 Z', d)) +
            circ(97, 190, 1.7, '#d9a441', EDGE) +
            circ(97, 208, 1.7, '#d9a441', EDGE),
        ) + sleeves(0.94, 18.5, m, d),
      };
    },
  },
  {
    id: 'headphones',
    cat: 'extra',
    slot: 'neck',
    name: 'Headphones',
    short: 'headphones',
    plural: true,
    tags: ['vintage', 'cute'],
    variants: [v('Silver', ['gray'], '#8e939d'), v('Pink', ['pink'], '#f39cba')],
    thumb: '64 112 72 60',
    draw: (vr) => {
      const m = vr.c[0];
      const d = shade(m, -0.3);
      return {
        behind: ink(() => S('M83 148 C83 124 117 124 117 148', d, 3.6)),
        neck: mir(ink(() => ell(84, 148, 7, 9.5, d, 'transform="rotate(-18 84 148)"')) + ink(() => ell(85.5, 147.5, 4.6, 6.8, m, 'transform="rotate(-18 85.5 147.5)"'))),
      };
    },
  },
  {
    id: 'pearls',
    cat: 'extra',
    slot: 'neck',
    name: 'Pearl Necklace',
    short: 'pearls',
    thumbBody: 'bust',
    plural: true,
    tags: ['vintage', 'romantic'],
    variants: [v('Pearl', ['cream'], '#fffaf0')],
    thumb: '74 120 52 46',
    draw: (vr) => {
      let s = '';
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        s += circ(f1(89 + 22 * t), f1(136 + Math.sin(t * Math.PI) * 15), 1.9, vr.c[0], EDGE);
      }
      return { neck: s };
    },
  },
  {
    id: 'foamfinger',
    cat: 'extra',
    slot: 'held',
    name: 'Foam Finger',
    short: 'foam finger',
    tags: ['sporty'],
    variants: [v('Blue & gold', ['blue', 'yellow'], C.cobalt, C.gold), v('Gold & blue', ['yellow', 'blue'], C.gold, C.cobalt)],
    thumb: '118 196 52 104',
    draw: (vr) => {
      const [m, a] = vr.c;
      return {
        held:
          `<g transform="rotate(8 142 278)">` +
          ink(
            () =>
              P('M137 262 L137 214 C137 206 147 206 147 214 L147 262 Z', m) +
              P('M131 262 C131 256 153 256 153 262 L154 288 C154 296 130 296 130 288 Z', m) +
              P('M130 268 C126 268 125 276 130 278 Z', m),
          ) +
          L('M131 266 L136 266', INK, LINE) +
          only(
            `<text x="142" y="285" text-anchor="middle" font-family="'Permanent Marker', 'Patrick Hand', sans-serif" font-size="13" fill="${a}" stroke="${INK}" stroke-width=".6" paint-order="stroke">#1</text>`,
          ) +
          `</g>`,
      };
    },
  },
  {
    id: 'popcorn',
    cat: 'extra',
    slot: 'held',
    name: 'Popcorn',
    short: 'popcorn',
    tags: ['cozy', 'casual'],
    variants: [v('Movie stripes', ['red', 'white'], C.red)],
    thumb: '30 236 56 66',
    draw: (vr) => {
      const pts = [
        [47, 260],
        [53, 256],
        [59, 257],
        [65, 260],
        [70, 262],
        [50, 264],
        [62, 262],
        [56, 252],
        [56, 261],
        [61, 265],
        [45, 264],
      ];
      return {
        held:
          `<g transform="rotate(-6 58 280)">` +
          ink(() => pts.map(([x, y]) => circ(x, y, 4.2, '#fff4cf')).join('')) +
          ink(() => P('M44 264 L72 264 L68 298 L48 298 Z', '#ffffff')) +
          P('M48.5 264 L53 264 L52.5 298 L50 298 Z M58 264 L62 264 L62 298 L58 298 Z M67 264 L71.5 264 L68 298 L66.2 298 Z', vr.c[0]) +
          `</g>`,
      };
    },
  },
  {
    id: 'crossbody',
    cat: 'extra',
    slot: 'bag',
    name: 'Crossbody Bag',
    short: 'crossbody bag',
    tags: ['casual', 'cute'],
    variants: [v('Tan', ['tan'], '#c98f5a'), v('Pink', ['pink'], '#f39cba'), v('Gold', ['yellow'], C.gold)],
    thumb: '74 130 66 136',
    draw: (vr) => {
      const m = vr.c[0];
      const d = shade(m, -0.2);
      return {
        bag:
          ink(() => S('M80 140 L124 238', d, 1.8)) +
          ink(() => P('M111 238 C111 234 137 234 137 238 L137 258 C137 262 111 262 111 258 Z', m)) +
          ink(() => P('M111 238 C111 234 137 234 137 238 L137 246 C130 251 118 251 111 246 Z', d)) +
          circ(124, 249, 2, '#f3d27a', EDGE),
      };
    },
  },
  {
    id: 'facepaint',
    cat: 'extra',
    slot: 'face',
    name: 'Spirit Face Paint',
    short: 'face paint',
    thumbBody: 'head',
    tags: ['sporty'],
    variants: [v('Blue & gold', ['blue', 'yellow'], C.cobalt, C.gold)],
    thumb: '58 52 84 70',
    draw: (vr) => ({
      face: mir(L('M78.5 99 L87 97.5', vr.c[0], 2.4) + L('M79 103.5 L87.5 102', vr.c[1], 2.4)),
    }),
  },
];

export const ITEMS: Item[] = [...HAIR_ITEMS, ...TOP_ITEMS, ...BOTTOM_ITEMS, ...DRESS_ITEMS, ...SHOE_ITEMS, ...EXTRA_ITEMS];
const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export function item(id: string): Item {
  const it = BY_ID.get(id);
  if (!it) throw new Error(`Unknown wardrobe item: ${id}`);
  return it;
}

export const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: 'hair', label: 'Hair' },
  { id: 'top', label: 'Tops' },
  { id: 'bottom', label: 'Bottoms' },
  { id: 'dress', label: 'Dresses' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'extra', label: 'Extras' },
];

export const itemsIn = (cat: Category) => ITEMS.filter((i) => i.cat === cat);

// ------------------------------------------------------------ outfits

export interface Pick {
  id: string;
  v: number;
}

export interface Outfit {
  hair: Pick;
  top: Pick | null;
  bottom: Pick | null;
  dress: Pick | null;
  shoes: Pick | null;
  /** At most one per slot. */
  extras: Pick[];
}

/** What Liz wears at the start of every round: her own waves and her basics. */
export function emptyOutfit(): Outfit {
  return { hair: { id: 'waves', v: 0 }, top: null, bottom: null, dress: null, shoes: null, extras: [] };
}

export function variantOf(p: Pick): Variant {
  const it = item(p.id);
  return it.variants[Math.min(Math.max(0, p.v), it.variants.length - 1)];
}

/** "jeans" or "jeans:1" → Pick (throws on unknown ids, so tests catch typos). */
export function parsePick(s: string): Pick {
  const [id, vs] = s.split(':');
  const it = item(id);
  const vi = vs === undefined ? 0 : Number(vs);
  if (!Number.isInteger(vi) || vi < 0 || vi >= it.variants.length) throw new Error(`Bad variant for ${id}: ${vs}`);
  return { id, v: vi };
}

/**
 * Put an item on. Dresses replace top + bottom (and vice versa); extras
 * replace whatever is in the same slot. Returns a new outfit.
 */
export function wear(o: Outfit, p: Pick): Outfit {
  const it = item(p.id);
  const n: Outfit = { ...o, extras: [...o.extras] };
  switch (it.cat) {
    case 'hair':
      n.hair = p;
      break;
    case 'top':
      n.top = p;
      n.dress = null;
      break;
    case 'bottom':
      n.bottom = p;
      n.dress = null;
      break;
    case 'dress':
      n.dress = p;
      n.top = null;
      n.bottom = null;
      break;
    case 'shoes':
      n.shoes = p;
      break;
    case 'extra':
      n.extras = n.extras.filter((e) => item(e.id).slot !== it.slot);
      n.extras.push(p);
      break;
  }
  return n;
}

/** Take an item off (hair can't be removed). */
export function takeOff(o: Outfit, id: string): Outfit {
  const n: Outfit = { ...o, extras: o.extras.filter((e) => e.id !== id) };
  if (n.top?.id === id) n.top = null;
  if (n.bottom?.id === id) n.bottom = null;
  if (n.dress?.id === id) n.dress = null;
  if (n.shoes?.id === id) n.shoes = null;
  return n;
}

/** Every worn piece, hair first. */
export function worn(o: Outfit): Pick[] {
  return [o.hair, o.top, o.bottom, o.dress, o.shoes, ...o.extras].filter((p): p is Pick => !!p);
}

export function wearing(o: Outfit, id: string): Pick | null {
  return worn(o).find((p) => p.id === id) ?? null;
}

export interface OutfitSpec {
  hair?: string;
  top?: string;
  bottom?: string;
  dress?: string;
  shoes?: string;
  extras?: string[];
}

/** Build an outfit from short strings: { top: 'teamtee:0', shoes: 'chucks', extras: ['foamfinger'] }. */
export function outfitFrom(spec: OutfitSpec): Outfit {
  let o = emptyOutfit();
  for (const s of [spec.hair, spec.top, spec.bottom, spec.dress, spec.shoes, ...(spec.extras ?? [])]) {
    if (s) o = wear(o, parsePick(s));
  }
  return o;
}

export function outfitToSpec(o: Outfit): OutfitSpec {
  const s = (p: Pick | null) => (p ? `${p.id}:${p.v}` : undefined);
  return { hair: s(o.hair), top: s(o.top), bottom: s(o.bottom), dress: s(o.dress), shoes: s(o.shoes), extras: o.extras.map((p) => `${p.id}:${p.v}`) };
}
