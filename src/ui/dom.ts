/** Tiny DOM helpers shared by every screen. */
import { audio, type SfxName } from '../core/audio';
import { icon as svgIcon } from './icons';

type Attrs = Record<string, string | number | boolean | undefined | null> & {
  class?: string;
  style?: string;
};
type Child = Node | string | number | null | undefined | false;

/** Create an element: el('div', { class: 'x' }, 'text', child) */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'style') node.setAttribute('style', String(v));
    else if (k === 'html') node.innerHTML = String(v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Resolve a public asset path ("img/map.webp") against the app base. */
export function asset(path: string): string {
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return import.meta.env.BASE_URL + path.replace(/^\//, '');
}

export type BtnColor = 'blue' | 'red' | 'orange' | 'green' | 'gray';

/** Glyphs that are drawn as line-art SVG icons instead of emoji/text. */
const GLYPH_ICONS: Record<string, string> = {
  '▶': 'play', '■': 'stop', '⏸': 'pause', '🔊': 'speaker', '🎒': 'bag', '🗺': 'map', '↻': 'retry',
  '♫': 'music', '♪': 'note', '♥': 'heart', '❤️': 'heart', '✋': 'hand', '🏠': 'home', '🔒': 'lock',
  '⚙': 'gear', '★': 'star', '✓': 'check', '✕': 'close', '✨': 'sparkle', '⏱': 'timer', 'i': 'info',
};

/** Icon content for a button: an SVG for known glyphs or icon names, else the text. */
export function glyph(g: string): Node {
  const name = GLYPH_ICONS[g] ?? (/^[a-z]+$/.test(g) && g.length > 1 ? g : null);
  return name ? svgIcon(name) : document.createTextNode(g);
}

/**
 * A pill button. Colours follow the deck's controller:
 * blue = claim reward, red = play song, orange = narration, green = select.
 */
export function button(
  label: string,
  onClick: (e: MouseEvent) => void,
  opts: { color?: BtnColor; icon?: string; small?: boolean; sfx?: SfxName; id?: string; title?: string } = {},
): HTMLButtonElement {
  const b = el(
    'button',
    {
      class: `btn ${opts.color ?? 'green'}${opts.small ? ' small' : ''}`,
      'data-testid': opts.id,
      'aria-label': opts.title ?? label,
    },
    opts.icon ? el('span', { class: 'ico' }, glyph(opts.icon)) : null,
    label,
  );
  b.addEventListener('click', (e) => {
    audio.sfx(opts.sfx ?? 'click');
    onClick(e);
  });
  return b;
}

export function iconButton(icon: string, onClick: () => void, opts: { title: string; id?: string } = { title: '' }) {
  const b = el('button', { class: 'icon-btn', 'aria-label': opts.title, title: opts.title, 'data-testid': opts.id }, glyph(icon));
  b.addEventListener('click', () => {
    audio.sfx('click');
    onClick();
  });
  return b;
}

/** Show a centred modal card over `parent`. Returns a close function. */
export function modal(parent: HTMLElement, content: Node, opts: { onBackdrop?: () => void; class?: string } = {}): () => void {
  // `scrollable` lets iOS scroll a tall card (main.ts blocks touchmove elsewhere)
  const card = el('div', { class: `paper modal pop-in scrollable${opts.class ? ' ' + opts.class : ''}` }, el('div', { class: 'tape' }), content);
  const ov = el('div', { class: 'overlay fade-in' }, card);
  ov.addEventListener('pointerdown', (e) => {
    if (e.target === ov) opts.onBackdrop?.();
  });
  parent.appendChild(ov);
  return () => ov.remove();
}

/** Brief message at the top of the screen. */
export function toast(parent: HTMLElement, text: string, ms = 2200): void {
  const t = el('div', { class: 'toast' }, text);
  parent.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/** Big animated banner text ("Round 3!"). */
export function banner(parent: HTMLElement, text: string): void {
  const b = el('div', { class: 'banner' }, text);
  parent.appendChild(b);
  setTimeout(() => b.remove(), 1450);
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Preload an image; resolves null if it fails (callers draw a fallback). */
const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
const imgReady = new Map<string, HTMLImageElement>();
export function loadImage(path: string): Promise<HTMLImageElement | null> {
  const url = asset(path);
  let p = imgCache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        imgReady.set(url, img);
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    imgCache.set(url, p);
  }
  return p;
}

/** Synchronous lookup of an already-loaded image. */
export function getImage(path: string): HTMLImageElement | null {
  return imgReady.get(asset(path)) ?? null;
}
