/**
 * SVG builders for the paper doll in the book cover's line-art style: flat
 * fills with a thin, even ink outline (docs/SPEC.md "Look and feel").
 *
 * `ink(draw)` outlines one piece. It calls `draw` twice: first in outline
 * mode, where every filled shape is painted ink with a wide stroke and
 * details are skipped, then normally on top. Only the outer half of that
 * stroke stays visible, so a piece built from overlapping shapes gets one
 * clean silhouette, and a piece drawn later is outlined where it overlaps
 * an earlier one. Plain vector strokes: no filters, cheap on a phone.
 */
export const INK = '#3a3340';
/** Outline-pass stroke width in body units; half of it shows (about 1.5 px on a phone). */
export const OUTLINE = 4;
/** Interior ink lines: seams, folds, hair strands. */
export const LINE = 1.1;
/** Attributes for a hairline ink edge on small shapes (buttons, pearls). */
export const EDGE = `stroke="${INK}" stroke-width=".7"`;

let outlining = false;
export const isOutlining = () => outlining;

/** Draw a piece with an ink outline around its silhouette. */
export function ink(draw: () => string): string {
  // Nested inside another piece's outline pass: that silhouette already covers this one.
  if (outlining) return draw();
  outlining = true;
  let under = '';
  try {
    under = draw();
  } finally {
    outlining = false;
  }
  return under + draw();
}

const sp = (extra: string) => (extra ? ' ' + extra : '');
/** Outline mode keeps a shape's transform; translucent shapes (shading) are skipped. */
const keep = (extra: string) => sp(/transform="[^"]*"/.exec(extra)?.[0] ?? '');
const OUT = `fill="${INK}" stroke="${INK}" stroke-width="${OUTLINE}" stroke-linejoin="round"`;
const shading = (extra: string) => /opacity=/.test(extra);

/** Filled path. */
export function P(d: string, fill: string, extra = ''): string {
  if (outlining) return shading(extra) ? '' : `<path d="${d}" ${OUT}${keep(extra)}/>`;
  return `<path d="${d}" fill="${fill}"${sp(extra)}/>`;
}

export function circ(x: number, y: number, r: number, fill: string, extra = ''): string {
  if (outlining) return shading(extra) ? '' : `<circle cx="${x}" cy="${y}" r="${r}" ${OUT}${keep(extra)}/>`;
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"${sp(extra)}/>`;
}

export function ell(x: number, y: number, rx: number, ry: number, fill: string, extra = ''): string {
  if (outlining) return shading(extra) ? '' : `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" ${OUT}${keep(extra)}/>`;
  return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"${sp(extra)}/>`;
}

/** Detail line, never outlined: seams, folds, stitching, strands, prints. */
export function L(d: string, stroke: string, w: number, extra = ''): string {
  if (outlining) return '';
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${sp(extra)}/>`;
}

/** A stroked shape that is part of the silhouette (straps, arms, tendrils): outlined, round ends. */
export function S(d: string, stroke: string, w: number, extra = ''): string {
  const [c, ww] = outlining ? [INK, w + OUTLINE] : [stroke, w];
  return `<path d="${d}" fill="none" stroke="${c}" stroke-width="${ww}" stroke-linecap="round" stroke-linejoin="round"${outlining ? keep(extra) : sp(extra)}/>`;
}

/** A stroked tube with square-cut ends (sleeves). Callers lengthen it in outline mode for the hem line. */
export function tube(d: string, stroke: string, w: number): string {
  const [c, ww] = outlining ? [INK, w + OUTLINE] : [stroke, w];
  return `<path d="${d}" fill="none" stroke="${c}" stroke-width="${ww}" stroke-linejoin="round"/>`;
}

/** Markup drawn only in the normal pass (pattern defs, printed text). */
export const only = (s: string) => (outlining ? '' : s);

/** The fragment plus its mirror image across x = 100. */
export const mir = (s: string) => `${s}<g transform="matrix(-1 0 0 1 200 0)">${s}</g>`;

export const f1 = (n: number) => Math.round(n * 10) / 10;
