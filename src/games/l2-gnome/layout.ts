/**
 * Level 2 geometry, kept pure so tests can simulate a player against the
 * real hole positions and hitbox sizes.
 */

export interface HolePos {
  x: number;
  y: number;
  /** Perspective scale of this row. */
  s: number;
}

/** Input device: a finger, or a cursor (mouse, trackpad, pen). */
export type PointerKind = 'touch' | 'mouse';

/**
 * The 3×3 holes between Wes (left) and the little library (right).
 * `left`/`right` are the usable x range (stage width minus safe insets),
 * `y0` the back row.
 */
export function holeLayout(left: number, right: number, y0: number): HolePos[] {
  const y2 = 357;
  const fieldL = left + 150;
  const fieldR = right - 140;
  const cx = (fieldL + fieldR) / 2 + 4;
  const spacing = Math.min(168, (fieldR - fieldL) / 3);
  const rows = [
    { y: y0, s: 0.86, k: 0.84 },
    { y: (y0 + y2) / 2 + 3, s: 0.97, k: 0.92 },
    { y: y2, s: 1.08, k: 1.0 },
  ];
  const holes: HolePos[] = [];
  for (const r of rows) for (let c = -1; c <= 1; c++) holes.push({ x: cx + c * spacing * r.k, y: r.y, s: r.s });
  return holes;
}

/**
 * Half the width of a gnome's tap/click box. Cursors get a wider box (a
 * bigger target is a faster point, by Fitts's law) that still stops short
 * of the neighbouring hole.
 */
export function hitHalfWidth(s: number, kind: PointerKind): number {
  return kind === 'mouse' ? Math.max(46, 50 * s) : Math.max(32, 36 * s);
}

/**
 * Vertical extent of a gnome's hit box: from just above its hat (and never
 * less than a fixed height above the hole) down to the hole's front lip.
 */
export function hitSpan(holeY: number, s: number, gnomeTop: number, kind: PointerKind): { top: number; bottom: number } {
  if (kind === 'mouse') return { top: Math.min(gnomeTop, holeY - 64) - 16, bottom: holeY + 24 * s };
  return { top: Math.min(gnomeTop, holeY - 50) - 10, bottom: holeY + 18 * s };
}
