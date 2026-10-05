/**
 * Small toolkit shared by the two DOM side quests (sq1 dinner, sq2 Helena):
 * portraits with drawn fallbacks, a cover-fit background, the boombox
 * countdown chip and pause-aware delays.
 */
import { frameZoom } from '../../core/stage';
import { ITEMS, type ItemId } from '../../data/story';
import { portraitPath } from '../../screens/dialogue';
import { asset, el } from '../../ui/dom';
import type { Hud } from '../../ui/hud';
import type { GameHost } from '../types';
import './kit.css';

export type Who = 'liz' | 'wes' | 'helena';

/** Outline colour for drawn fallbacks (SPEC: thin even ink lines, flat fills). */
export const INK = '#3a3340';

/** Set up the canvas for ink outlines: call before fill() + stroke(). */
export function ink(c: CanvasRenderingContext2D, width = 2): void {
  c.strokeStyle = INK;
  c.lineWidth = width;
  c.lineJoin = 'round';
  c.lineCap = 'round';
}

/** The item's own art as a small inline picture (never emoji: they don't match the line art). */
export function itemImg(id: ItemId, cls = 'sq-item'): HTMLImageElement {
  return el('img', { class: cls, src: asset(ITEMS[id].icon), alt: '', draggable: 'false' });
}

const LOOK: Record<Who, { hair: string; skin: string; shirt: string; trim: string }> = {
  liz: { hair: '#e8692f', skin: '#f6d2b8', shirt: '#f29bb0', trim: '#fdfbf3' },
  wes: { hair: '#2a211c', skin: '#e0ac85', shirt: '#ffffff', trim: '#2f5fd0' },
  helena: { hair: '#efcb7f', skin: '#f6d6c0', shirt: '#f3ead2', trim: '#d9cba6' },
};

/** Flat-vector waist-up portrait used until the painted art exists. */
export function fallbackFace(who: Who, mood = ''): string {
  const c = LOOK[who];
  const mouth =
    mood === 'sad'
      ? '<path d="M86 132 q14 -10 28 0" stroke="#7a3b2e" stroke-width="4" fill="none" stroke-linecap="round"/>'
      : mood === 'mad'
        ? '<path d="M86 130 h28" stroke="#7a3b2e" stroke-width="4" stroke-linecap="round"/>'
        : mood === 'happy'
          ? '<path d="M82 122 q18 22 36 0 z" fill="#7a3b2e"/>'
          : '<path d="M86 124 q14 12 28 0" stroke="#7a3b2e" stroke-width="4" fill="none" stroke-linecap="round"/>';
  const brows =
    mood === 'mad'
      ? '<path d="M70 84 l18 6 M130 84 l-18 6" stroke="#5a3a2a" stroke-width="4" stroke-linecap="round"/>'
      : mood === 'sad'
        ? '<path d="M70 90 l18 -5 M130 90 l-18 -5" stroke="#5a3a2a" stroke-width="4" stroke-linecap="round"/>'
        : '';
  const backHair =
    who === 'liz'
      ? `<path d="M44 96 q-14 70 6 128 h100 q20 -58 6 -128 q-56 -70 -112 0z" fill="${c.hair}"/>`
      : who === 'helena'
        ? `<path d="M46 98 q-6 44 6 64 h96 q12 -20 6 -64 q-54 -60 -108 0z" fill="${c.hair}"/>`
        : '';
  const frontHair =
    who === 'wes'
      ? `<path d="M48 92 q0 -52 52 -54 q52 2 52 54 q-10 -20 -22 -24 q-6 12 -30 10 q-20 -2 -26 -14 q-18 8 -26 28z" fill="${c.hair}"/>`
      : who === 'liz'
        ? `<path d="M48 96 q4 -58 56 -56 q50 4 48 56 q-16 -26 -40 -30 q-30 4 -64 30z" fill="${c.hair}"/>` +
          '<g fill="#d98a6a" stroke="none"><circle cx="78" cy="112" r="1.8"/><circle cx="84" cy="117" r="1.8"/><circle cx="72" cy="118" r="1.8"/><circle cx="122" cy="112" r="1.8"/><circle cx="116" cy="117" r="1.8"/><circle cx="128" cy="118" r="1.8"/></g>'
        : `<path d="M48 98 q2 -56 54 -56 q52 0 50 56 q-30 -6 -48 -30 q-20 26 -56 30z" fill="${c.hair}"/>`;
  const shirt =
    who === 'wes'
      ? `<path d="M22 260 q4 -62 50 -72 l28 18 l28 -18 q46 10 50 72z" fill="${c.shirt}"/>` +
        `<text x="128" y="246" font-family="Arial Black,Arial" font-weight="900" font-size="26" fill="${c.trim}" stroke="none">32</text>`
      : `<path d="M22 260 q4 -62 50 -72 l28 18 l28 -18 q46 10 50 72z" fill="${c.shirt}"/>` +
        `<path d="M100 206 v54" stroke-width="3"/>`;
  // clean ink line art with flat fills, like the book cover
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260">' +
    `<g stroke="${INK}" stroke-width="3" stroke-linejoin="round">` +
    backHair +
    shirt +
    `<rect x="88" y="150" width="24" height="44" rx="10" fill="${c.skin}"/>` +
    `<ellipse cx="100" cy="106" rx="50" ry="56" fill="${c.skin}"/>` +
    frontHair +
    '</g>' +
    '<circle cx="80" cy="102" r="5" fill="#2b2b3a"/><circle cx="120" cy="102" r="5" fill="#2b2b3a"/>' +
    brows +
    '<circle cx="70" cy="122" r="7" fill="#f9b6c8"/><circle cx="130" cy="122" r="7" fill="#f9b6c8"/>' +
    mouth +
    '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const spritePath = (who: Who) => `img/sprites/${who}.png`;

/** Every portrait (and sprite fallback) a quest might show, for host.load(). */
export function portraitPaths(list: Array<[Who, string?]>): string[] {
  const out = new Set<string>();
  for (const [who, mood] of list) {
    out.add(portraitPath(who));
    out.add(spritePath(who));
    if (mood) out.add(portraitPath(who, mood));
  }
  return [...out];
}

/**
 * Best available picture of `who`: the mood portrait, the base portrait,
 * the full-body sprite (shown cropped to waist-up), else a drawn face.
 */
export function portraitSrc(host: GameHost, who: Who, mood?: string): { src: string; kind: 'portrait' | 'sprite' | 'drawn' } {
  if (mood && host.image(portraitPath(who, mood))) return { src: asset(portraitPath(who, mood)), kind: 'portrait' };
  if (host.image(portraitPath(who))) return { src: asset(portraitPath(who)), kind: 'portrait' };
  if (host.image(spritePath(who))) return { src: asset(spritePath(who)), kind: 'sprite' };
  return { src: fallbackFace(who, mood), kind: 'drawn' };
}

/** Point an <img> at the best picture of `who`; `.is-sprite` / `.is-drawn` let CSS crop the stand-ins. */
export function setPortrait(img: HTMLImageElement, host: GameHost, who: Who, mood?: string): void {
  const p = portraitSrc(host, who, mood);
  if (img.getAttribute('src') !== p.src) img.src = p.src;
  img.classList.toggle('is-sprite', p.kind === 'sprite');
  img.classList.toggle('is-drawn', p.kind === 'drawn');
}

/** A small head-and-shoulders crop of `who` (round by default; add `square` for polaroids). */
export function faceEl(host: GameHost, who: Who, mood?: string, cls = ''): HTMLElement {
  const img = el('img', { alt: '', draggable: 'false' });
  setPortrait(img, host, who, mood);
  return el('span', { class: `sq-face ${cls}`.trim() }, img);
}

/** Canvas roundRect, falling back to a plain rect where it's missing (iOS < 16). */
export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]): void {
  if (c.roundRect) c.roundRect(x, y, w, h, r);
  else c.rect(x, y, w, h);
}

/** Draw `img` to fill the stage like CSS `object-fit: cover`. */
export function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, W: number, H: number): void {
  const s = Math.max(W / img.width, H / img.height);
  const w = img.width * s;
  const h = img.height * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

/**
 * Background layer: the painted image if loaded, else a procedural one
 * cached to an offscreen canvas (redrawn only when the stage width changes).
 */
export class Backdrop {
  private cache: HTMLCanvasElement | null = null;
  private cacheW = 0;
  constructor(
    private host: GameHost,
    private path: string,
    private drawFallback: (ctx: CanvasRenderingContext2D, W: number, H: number) => void,
    /** Darken the art a little so paper cards and white text stay readable. */
    private shade = 0.18,
  ) {}

  render(ctx: CanvasRenderingContext2D): void {
    const { W, H } = this.host.stage;
    const img = this.host.image(this.path);
    if (img) drawCover(ctx, img, W, H);
    else {
      if (!this.cache || this.cacheW !== Math.round(W)) {
        this.cacheW = Math.round(W);
        this.cache = document.createElement('canvas');
        this.cache.width = Math.ceil(W * 2);
        this.cache.height = H * 2;
        const c = this.cache.getContext('2d')!;
        c.scale(2, 2);
        this.drawFallback(c, W, H);
      }
      ctx.drawImage(this.cache, 0, 0, W, H);
    }
    if (this.shade > 0) {
      ctx.fillStyle = `rgba(20, 40, 70, ${this.shade})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}

/** The boombox: thirty seconds of invincibility with a countdown chip in the HUD. */
export class Boombox {
  left = 0;
  private chip: HTMLElement | null = null;
  private secs: HTMLElement | null = null;
  private shown = -1;
  constructor(private hud: Hud) {}

  get active(): boolean {
    return this.left > 0;
  }

  start(seconds = 30): void {
    this.left = seconds;
    this.shown = -1;
    if (!this.chip) {
      this.secs = el('span');
      this.chip = el('div', { class: 'hud-chip sq-boombox', 'data-testid': 'boombox-chip' }, itemImg('boombox'), this.secs);
      this.hud.custom().appendChild(this.chip);
    }
    this.update(0);
  }

  update(dt: number): void {
    if (!this.chip) return;
    this.left = Math.max(0, this.left - dt);
    if (this.left <= 0) {
      this.chip.remove();
      this.chip = null;
      return;
    }
    const s = Math.ceil(this.left);
    if (s !== this.shown) {
      this.shown = s;
      this.secs!.textContent = `${s}s`;
      this.chip.classList.toggle('warn', s <= 5);
    }
  }

  destroy(): void {
    this.chip?.remove();
    this.chip = null;
  }
}

/** A short line that floats up over `parent` and fades (used instead of stacking toasts). */
export function floatText(parent: HTMLElement, ...content: Array<Node | string>): void {
  const f = el('div', { class: 'sq-float' }, ...content);
  f.addEventListener('animationend', () => f.remove());
  parent.appendChild(f);
}

/**
 * The DOM layouts are designed for phone frames. Taller frames (an iPad's
 * letterboxed stage) scale the whole quest UI uniformly by core's frameZoom(),
 * the same factor core uses for the HUD and item button, so the UI never sits
 * phone-sized in a big frame. Sets on the root: --k (scale), --dw / --dh
 * (design size in px), --hud-clear / --item-clear (room for the host chrome as
 * it is actually drawn, in design px) and `.compact` for SE-sized designs.
 */
export class FrameScale {
  k = 1;
  constructor(
    private host: GameHost,
    private root: HTMLElement,
  ) {}

  apply(): void {
    const r = this.host.dom.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const k = frameZoom(r.height);
    const w = r.width / k;
    const h = r.height / k;
    this.k = k;
    const s = this.root.style;
    s.width = k > 1 ? `${w}px` : '';
    s.height = k > 1 ? `${h}px` : '';
    s.transform = k > 1 ? `scale(${k})` : '';
    s.setProperty('--k', String(k));
    s.setProperty('--dw', `${w}px`);
    s.setProperty('--dh', `${h}px`);
    this.root.classList.toggle('compact', w < 700 || h < 380);
    // measure the host chrome on screen: core enlarges it on boxed frames
    const screen = this.host.dom.parentElement;
    const pause = screen?.querySelector('[data-testid=pause]')?.getBoundingClientRect();
    const item = screen?.querySelector<HTMLElement>('[data-testid=item-use]');
    const z = pause?.height ? pause.height / 44 : 1;
    const hudClear = pause?.height ? pause.bottom - r.top + 2 : 52;
    const ib = item && item.offsetParent ? item.getBoundingClientRect() : null;
    const itemClear = ib?.height ? r.bottom - ib.top + 6 : 62 * z;
    s.setProperty('--hud-clear', `${hudClear / k}px`);
    s.setProperty('--item-clear', `${itemClear / k}px`);
  }
}

/** Delayed callbacks driven by update(dt), so they freeze while paused and die with the game. */
export class Later {
  private list: Array<{ t: number; fn: () => void }> = [];
  private gen = 0;

  after(seconds: number, fn: () => void): void {
    this.list.push({ t: seconds, fn });
  }

  update(dt: number): void {
    if (!this.list.length) return;
    const due: Array<() => void> = [];
    this.list = this.list.filter((j) => {
      j.t -= dt;
      if (j.t <= 0) due.push(j.fn);
      return j.t > 0;
    });
    const gen = this.gen;
    for (const fn of due) {
      if (gen !== this.gen) return; // a callback ended the game
      fn();
    }
  }

  clear(): void {
    this.list = [];
    this.gen++;
  }
}
