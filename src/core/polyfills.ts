/**
 * Polyfills for older iOS WebKit. Imported first in main.ts.
 *
 * CanvasRenderingContext2D.roundRect / Path2D.roundRect arrived in Safari 16;
 * the games use it everywhere, and on iOS 15 the call would throw.
 */

type Radius = number | DOMPointInit;

function radiusOf(v: Radius | undefined): number {
  if (typeof v === 'number') return Math.max(0, v);
  return Math.max(0, v?.x ?? 0);
}

function roundRect(this: CanvasPath, x: number, y: number, w: number, h: number, radii?: Radius | Radius[]): void {
  const list = Array.isArray(radii) ? radii : [radii ?? 0];
  let tl: number, tr: number, br: number, bl: number;
  switch (list.length) {
    case 1:
      tl = tr = br = bl = radiusOf(list[0]);
      break;
    case 2:
      tl = br = radiusOf(list[0]);
      tr = bl = radiusOf(list[1]);
      break;
    case 3:
      tl = radiusOf(list[0]);
      tr = bl = radiusOf(list[1]);
      br = radiusOf(list[2]);
      break;
    default:
      [tl, tr, br, bl] = list.slice(0, 4).map(radiusOf);
  }
  if (w < 0) {
    x += w;
    w = -w;
    [tl, tr] = [tr, tl];
    [bl, br] = [br, bl];
  }
  if (h < 0) {
    y += h;
    h = -h;
    [tl, bl] = [bl, tl];
    [tr, br] = [br, tr];
  }
  // Scale radii down when they don't fit, like the spec does.
  const f = Math.min(1, w / (tl + tr || 1), w / (bl + br || 1), h / (tl + bl || 1), h / (tr + br || 1));
  tl *= f;
  tr *= f;
  br *= f;
  bl *= f;
  this.moveTo(x + tl, y);
  this.lineTo(x + w - tr, y);
  this.arcTo(x + w, y, x + w, y + tr, tr);
  this.lineTo(x + w, y + h - br);
  this.arcTo(x + w, y + h, x + w - br, y + h, br);
  this.lineTo(x + bl, y + h);
  this.arcTo(x, y + h, x, y + h - bl, bl);
  this.lineTo(x, y + tl);
  this.arcTo(x, y, x + tl, y, tl);
  this.closePath();
}

const targets: Array<{ prototype: object } | undefined> = [
  typeof CanvasRenderingContext2D !== 'undefined' ? CanvasRenderingContext2D : undefined,
  typeof OffscreenCanvasRenderingContext2D !== 'undefined' ? OffscreenCanvasRenderingContext2D : undefined,
  typeof Path2D !== 'undefined' ? Path2D : undefined,
];
for (const t of targets) {
  if (t && !('roundRect' in t.prototype)) {
    Object.defineProperty(t.prototype, 'roundRect', { value: roundRect, configurable: true, writable: true });
  }
}

export {};
