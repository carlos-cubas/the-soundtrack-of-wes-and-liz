/**
 * Stage: a full-screen canvas with a virtual coordinate system.
 *
 * The virtual height is always 400 units. The virtual width follows the
 * device aspect ratio (about 711 on an iPhone SE, about 866 on a modern
 * notched iPhone in landscape). Games draw in virtual units and never touch
 * device pixels: `begin()` sets the transform for the current frame.
 *
 * Games are built for phone shapes, 16:9 up to 2.2:1. On squarer screens
 * (iPad, 4:3) or very wide windows the stage letterboxes its parent into a
 * centred frame inside that range, so W always stays in [MIN_W, MAX_W].
 */

export const VIRTUAL_H = 400;
export const MIN_ASPECT = 16 / 9;
export const MAX_ASPECT = 2.2;

/** The largest frame within the supported aspect range that fits a w×h box. */
export function frameFor(w: number, h: number): { w: number; h: number } {
  const aspect = w / h;
  if (aspect < MIN_ASPECT) return { w, h: w / MIN_ASPECT };
  if (aspect > MAX_ASPECT) return { w: h * MAX_ASPECT, h };
  return { w, h };
}

/** How much to enlarge DOM chrome in a frame this tall, against a 440pt phone screen (1 to 1.6). */
export function frameZoom(frameH: number): number {
  return Math.max(1, Math.min(1.6, frameH / 440));
}

export interface SafeArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export class Stage {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Virtual width (depends on aspect ratio). */
  W = 800;
  /** Virtual height, always 400. */
  readonly H = VIRTUAL_H;
  /** CSS pixels per virtual unit. */
  scale = 1;
  dpr = 1;
  /** Safe-area insets (notch, home indicator) in virtual units. */
  safe: SafeArea = { left: 0, right: 0, top: 0, bottom: 0 };
  private listeners: Array<() => void> = [];
  private ro: ResizeObserver | null = null;
  private viewportRo: ResizeObserver | null = null;
  private probe: HTMLDivElement;

  constructor(private readonly parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    parent.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.probe = document.createElement('div');
    this.probe.style.cssText =
      'position:fixed;inset:0;pointer-events:none;visibility:hidden;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(this.probe);
    this.fitFrame();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
    // the probe covers the viewport: refit the frame whenever the window changes
    this.viewportRo = new ResizeObserver(() => this.fitFrame());
    this.viewportRo.observe(this.probe);
    window.addEventListener('orientationchange', this.onOrient);
  }

  private onOrient = () => setTimeout(() => this.resize(), 250);

  /** Letterbox the parent into the supported aspect range when the viewport is outside it. */
  private fitFrame(): void {
    const vp = this.probe.getBoundingClientRect();
    if (!vp.width || !vp.height) return;
    const f = frameFor(vp.width, vp.height);
    const boxed = f.w < vp.width - 0.5 || f.h < vp.height - 0.5;
    this.parent.classList.toggle('stage-boxed', boxed);
    this.parent.style.width = boxed ? `${Math.floor(f.w)}px` : '';
    this.parent.style.height = boxed ? `${Math.floor(f.h)}px` : '';
    // A big frame (iPad) scales the game's DOM chrome with it, relative to a large phone.
    if (boxed) this.parent.style.setProperty('--frame-zoom', frameZoom(f.h).toFixed(3));
    else this.parent.style.removeProperty('--frame-zoom');
  }

  /** Recompute sizes. Called automatically on resize. */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width || window.innerWidth);
    const cssH = Math.max(1, rect.height || window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.scale = cssH / VIRTUAL_H;
    this.W = cssW / this.scale;
    // Safe-area insets only matter where the frame reaches the screen edge.
    const cs = getComputedStyle(this.probe);
    const vp = this.probe.getBoundingClientRect();
    const placed = rect.width > 0 && rect.height > 0;
    const inset = (env: string, gap: number) => Math.max(0, (parseFloat(env) || 0) - (placed ? gap : 0));
    const px = {
      top: inset(cs.paddingTop, rect.top - vp.top),
      right: inset(cs.paddingRight, vp.right - rect.right),
      bottom: inset(cs.paddingBottom, vp.bottom - rect.bottom),
      left: inset(cs.paddingLeft, rect.left - vp.left),
    };
    this.safe = { top: px.top / this.scale, right: px.right / this.scale, bottom: px.bottom / this.scale, left: px.left / this.scale };
    // DOM inside a letterboxed frame (HUD, item button) pads by the same insets
    const boxed = this.parent.classList.contains('stage-boxed');
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      if (boxed) this.parent.style.setProperty(`--safe-${side}`, `${px[side]}px`);
      else this.parent.style.removeProperty(`--safe-${side}`);
    }
    for (const fn of this.listeners) fn();
  }

  onResize(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  /** Reset transform to virtual units for this frame. */
  begin(): CanvasRenderingContext2D {
    const k = this.scale * this.dpr;
    this.ctx.setTransform(k, 0, 0, k, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    return this.ctx;
  }

  /** Convert a client (CSS pixel) point into virtual coordinates. */
  toVirtual(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) / this.scale, y: (clientY - rect.top) / this.scale };
  }

  /**
   * Fit a fixed-size world (e.g. 720x400) inside the stage, centred, and
   * return the transform. Use `applyWorld` to draw in world units.
   */
  fitWorld(worldW: number, worldH: number, mode: 'contain' | 'cover' = 'contain') {
    const sx = this.W / worldW;
    const sy = this.H / worldH;
    const s = mode === 'contain' ? Math.min(sx, sy) : Math.max(sx, sy);
    return { s, ox: (this.W - worldW * s) / 2, oy: (this.H - worldH * s) / 2 };
  }

  destroy(): void {
    this.ro?.disconnect();
    this.viewportRo?.disconnect();
    window.removeEventListener('orientationchange', this.onOrient);
    this.probe.remove();
    this.canvas.remove();
    this.listeners = [];
  }
}

/** Apply a world transform from `Stage.fitWorld` on top of the virtual transform. */
export function applyWorld(ctx: CanvasRenderingContext2D, t: { s: number; ox: number; oy: number }): void {
  ctx.translate(t.ox, t.oy);
  ctx.scale(t.s, t.s);
}

/** Convert a virtual point to world units for a transform from `fitWorld`. */
export function toWorld(p: { x: number; y: number }, t: { s: number; ox: number; oy: number }) {
  return { x: (p.x - t.ox) / t.s, y: (p.y - t.oy) / t.s };
}
