/**
 * Liz as a paper doll in the book cover's line-art style (thin even ink
 * outlines, flat fills), plus the layer stack every wardrobe item draws
 * into (see wardrobe.ts LAYERS). Strings only, so it renders in the game
 * DOM, in thumbnails and in tests.
 */
import { INK, L, P, S, circ, ell, ink, mir } from './ink';
import { LAYERS, SKIN, SKIN_SH, item, variantOf, worn, type Drawing, type Item, type Layer, type Outfit } from './wardrobe';

export const VIEWBOX = '0 -8 200 458';

let uidN = 0;
/** Unique id prefix: pattern ids are document-global and many SVGs share the page. */
export const nextUid = () => `l4u${++uidN}`;

const ARM = 'M68.5 151 L61 212 L58.5 266';
const LEG =
  'M73.8 248 C71.8 272 72.8 300 76.3 330 C78.3 345 77.3 360 77.3 376 C77.3 392 81.6 408 83.6 424 L93.6 424 C93.6 408 97 392 97 376 C97 360 96.2 348 97 330 C98 305 100 285 101 262 L101 250 Z';
const FOOT = 'M84 421 L93.5 421 L95.5 432 C96.5 436.5 94 438 90 438 L73.5 438 C69.5 438 68.5 434.5 71 432.5 C74 430 79 429 84 427 Z';
const TORSO =
  'M90 135 C81 137 72 140 67.5 146.5 C66 152 67 162 70 172 C73 186 79 198 81.5 210 C81 224 77 236 75 250 L125 250 C123 236 119 224 118.5 210 C121 198 127 186 130 172 C133 162 134 152 132.5 146.5 C128 140 119 137 110 135 Z';
const NECK = 'M92.5 108 L92.5 138 Q100 142.5 107.5 138 L107.5 108 Z';
const FACE = 'M68 82 C68 58 82 45 100 45 C118 45 132 58 132 82 C132 101 119 121 100 123 C81 121 68 101 68 82 Z';

const FRECKLES: Array<[number, number]> = [
  [86, 98],
  [89.5, 100.5],
  [84, 102],
  [91, 96.5],
  [87.5, 104],
  [95.5, 98.5],
  [114, 98],
  [110.5, 100.5],
  [116, 102],
  [109, 96.5],
  [112.5, 104],
  [104.5, 98.5],
];

/** Skin: one outlined silhouette for arms, hands, legs, feet, torso and neck. */
export function bodySvg(): string {
  return (
    ink(() => mir(S(ARM, SKIN, 12.6) + ell(58.3, 275.5, 6.8, 9.4, SKIN) + P(LEG, SKIN) + P(FOOT, SKIN)) + P(TORSO, SKIN) + P(NECK, SKIN)) +
    mir(L('M54 270 C55 276 56 280 58 282', INK, 0.8) + L('M85 330 C87 333 90 333 92 330', INK, 0.8)) +
    P('M92.5 116 Q100 126 107.5 116 L107.5 124 Q100 131 92.5 124 Z', SKIN_SH, 'opacity=".55"')
  );
}

/** Ears and face shape (the features are faceSvg). */
export function headSvg(): string {
  return ink(() => mir(ell(68.5, 88, 5, 7.5, SKIN) + ell(69, 88.5, 2.4, 4, SKIN_SH, 'opacity=".7"')) + P(FACE, SKIN));
}

/**
 * The head and hair are drawn 12% larger around the chin: a slightly
 * bigger head reads cuter at phone size.
 */
export const HEAD_T = 'matrix(1.12 0 0 1.12 -12 -14.16)';
const HEAD_LAYERS: ReadonlySet<Layer> = new Set(['hairBack', 'face', 'hairFront']);
export const headScaled = (l: Layer) => HEAD_LAYERS.has(l);

/** Simple webtoon face: ink eyes (they blink: .l4-eye in l4.css), copper brows, freckles, blush, smile. */
export function faceSvg(): string {
  const eye = (x: number) =>
    `<g class="l4-eye"><ellipse cx="${x}" cy="89" rx="3.4" ry="4.4" fill="${INK}"/><circle cx="${x + 1.2}" cy="87.4" r="1.2" fill="#fff"/></g>`;
  let freckles = '';
  for (const [x, y] of FRECKLES) freckles += circ(x, y, 0.8, '#c9774d', 'opacity=".75"');
  return (
    ell(82.5, 101, 6.2, 3.6, '#f58f98', 'opacity=".38"') +
    ell(117.5, 101, 6.2, 3.6, '#f58f98', 'opacity=".38"') +
    freckles +
    eye(88) +
    eye(112) +
    L('M83 85.8 Q87.5 82.4 92.4 84.8', INK, 1.3) +
    L('M107.6 84.8 Q112.5 82.4 117 85.8', INK, 1.3) +
    L('M82 78.5 Q87.5 75.2 93.5 76.8', '#b5481c', 1.7) +
    L('M106.5 76.8 Q112.5 75.2 118 78.5', '#b5481c', 1.7) +
    L('M99.6 95.5 Q101.6 98.4 99.3 99.8', INK, 0.9) +
    P('M94 106.2 Q100 111.6 106 106.2 Q100 108 94 106.2 Z', '#d6596a') +
    L('M94 106.2 Q100 111.6 106 106.2', INK, 0.8)
  );
}

/** Paper-doll basics shown where no top / bottom / dress is worn. */
export function basicsSvg(o: Outfit): string {
  let s = '';
  if (!o.dress && !o.top) {
    s +=
      ink(() => mir(S('M84 154 L86.5 137.5', '#fffaf0', 2.2))) +
      ink(() => P('M80 152 Q100 158 120 152 L121 168 C121 184 119 198 118.5 210 L120 234 Q100 237 80 234 L81.5 210 C81 198 79 184 79 168 Z', '#fffaf0')) +
      circ(100, 158.5, 2, '#f7a9bf', `stroke="${INK}" stroke-width=".6"`);
  }
  if (!o.dress && !o.bottom) {
    s +=
      ink(() => P('M78.5 226 L121.5 226 C124 238 126.5 252 127.5 276 L104 278 L100 266 L96 278 L72.5 276 C73.5 252 76 238 78.5 226 Z', '#f9c5d5')) +
      ink(() => P('M78.5 226 L121.5 226 L122.5 231 L77.5 231 Z', '#f4a9c0'));
  }
  return s;
}

/** Draw every worn item into its layer. */
export function outfitLayers(o: Outfit, uid = nextUid()): Partial<Record<Layer, string>> {
  const out: Partial<Record<Layer, string>> = { basics: basicsSvg(o) };
  worn(o).forEach((p, i) => {
    const d = item(p.id).draw(variantOf(p), `${uid}i${i}`);
    for (const k of Object.keys(d) as Layer[]) out[k] = (out[k] ?? '') + d[k];
  });
  return out;
}

/** A complete standalone doll (used for thumbnails, the verdict card and tests). */
export function dollSvg(o: Outfit, attrs = ''): string {
  const layers = outfitLayers(o);
  let s = '';
  for (const l of LAYERS) {
    let part = layers[l] ?? '';
    if (l === 'body') part = bodySvg();
    else if (l === 'face') part = headSvg() + faceSvg() + part;
    if (part) s += headScaled(l) ? `<g transform="${HEAD_T}">${part}</g>` : part;
  }
  return `<svg viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg" ${attrs}>${s}</svg>`;
}

/** Tile thumbnail of one item in one variant, with a hint of Liz where it helps. */
export function thumbSvg(it: Item, vi: number): string {
  const d: Drawing = it.draw(it.variants[vi] ?? it.variants[0], nextUid());
  const head = it.cat === 'hair' || it.thumbBody === 'head';
  // face paint is shown on Liz's own waves, never on a bald head
  const hair: Drawing = it.cat === 'hair' ? {} : head ? item('waves').draw(item('waves').variants[0], '') : {};
  const ghost = '#f3d9c6';
  let s = '';
  for (const l of LAYERS) {
    let part = (hair[l] ?? '') + (d[l] ?? '');
    if (l === 'body') {
      if (it.cat === 'shoes') part = mir(`<path d="M83.6 380 L93.6 380 L93.6 424 L83.6 424 Z" fill="${ghost}"/><path d="${FOOT}" fill="${ghost}"/>`);
      else if (it.thumbBody === 'bust') part = `<path d="${TORSO}" fill="${ghost}"/><path d="M92.5 100 L92.5 138 Q100 142.5 107.5 138 L107.5 100 Z" fill="${ghost}"/>`;
      else if (head) part = ink(() => P('M92.5 108 L92.5 140 L107.5 140 L107.5 108 Z', SKIN));
    } else if (l === 'face' && head) {
      part = headSvg() + faceSvg() + part;
    }
    s += part;
  }
  return `<svg viewBox="${it.thumb}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${s}</svg>`;
}
