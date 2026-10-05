/**
 * Scrapbook decorations for the meta screens: art with procedural fallbacks
 * (art lands in parallel, so every image here degrades to CSS/SVG), plus
 * the deck's props: tape, newspaper scraps, flowers, the vinyl record and
 * the hand-drawn "Liz and Wes Playlist" CD.
 */
import { audio } from '../core/audio';
import { SONGS, SPEAKER_NAMES, type SongId } from '../data/story';
import { asset, el } from './dom';
import { icon } from './icons';
import './scale';

type Fallback = () => Node;

const failed = new Set<string>();

/**
 * An image inside a wrapper element. If the file is missing the wrapper
 * gets `fallback()` instead (or stays empty). The wrapper carries `cls`, so
 * size and position it in CSS; the image fills it.
 */
export function art(paths: string | string[], cls: string, fallback?: Fallback, opts: { fit?: string } = {}): HTMLElement {
  const list = (Array.isArray(paths) ? paths : [paths]).map(asset).filter((u) => !failed.has(u));
  const wrap = el('span', { class: `art ${cls}` });
  const showFallback = () => {
    wrap.classList.add('art-fallback');
    wrap.replaceChildren(...(fallback ? [fallback()] : []));
  };
  const tryNext = (i: number) => {
    if (i >= list.length) return showFallback();
    const img = el('img', { alt: '', draggable: 'false', decoding: 'async', style: opts.fit ? `object-fit:${opts.fit}` : undefined });
    img.addEventListener('error', () => {
      failed.add(list[i]);
      tryNext(i + 1);
    }, { once: true });
    img.src = list[i];
    wrap.replaceChildren(img);
  };
  tryNext(0);
  return wrap;
}

/** Resolves true if the image exists (cached). */
const probes = new Map<string, Promise<boolean>>();
export function probe(path: string): Promise<boolean> {
  const url = asset(path);
  let p = probes.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      if (failed.has(url)) return resolve(false);
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => {
        failed.add(url);
        resolve(false);
      };
      img.src = url;
    });
    probes.set(url, p);
  }
  return p;
}

// Paper texture: real scan if the art exists, else a procedural crumple.
void probe('img/ui/paper-blue.webp').then((ok) => {
  const html = document.documentElement;
  // absolute URL: a relative url() inside a custom property resolves against
  // the stylesheet that uses it (dist/assets/), not the page
  if (ok) html.style.setProperty('--paper-url', `url("${new URL(asset('img/ui/paper-blue.webp'), document.baseURI).href}")`);
  html.classList.toggle('has-paper-tex', ok);
});
void probe('img/ui/tape.png').then((ok) => {
  const html = document.documentElement;
  if (ok) html.style.setProperty('--tape-url', `url("${new URL(asset('img/ui/tape.png'), document.baseURI).href}")`);
  html.classList.toggle('has-tape-tex', ok);
});

// ------------------------------------------------------------------ SVG
const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(markup: string, cls: string, viewBox: string): SVGSVGElement {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', viewBox);
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = markup;
  return s;
}

const FLOWER_COLORS = [
  ['#f7768e', '#ffd36b'],
  ['#b9a6f2', '#ffe27a'],
  ['#ffb38a', '#fff3b0'],
  ['#f9b6c8', '#ffcf5c'],
];

/** A little five-petal flower like the stickers in Samira's deck. */
export function flowerSvg(variant = 0): SVGSVGElement {
  const [petal, mid] = FLOWER_COLORS[variant % FLOWER_COLORS.length];
  const petals = [0, 72, 144, 216, 288]
    .map((a) => `<ellipse cx="0" cy="-21" rx="14" ry="20" transform="rotate(${a})" fill="${petal}" stroke="rgba(0,0,0,.12)" stroke-width="1.5"/>`)
    .join('');
  return svg(
    `<ellipse cx="26" cy="30" rx="16" ry="7" transform="rotate(35 26 30)" fill="#7cc48a"/>` +
      `<ellipse cx="-28" cy="28" rx="15" ry="6" transform="rotate(-30 -28 28)" fill="#8fd19b"/>` +
      petals +
      `<circle r="10" fill="${mid}" stroke="rgba(0,0,0,.15)" stroke-width="1.5"/>`,
    'flower-svg',
    '-50 -50 100 100',
  );
}

const FLOWER_ART = ['img/ui/flower-pink.png', 'img/ui/flower-blue.png'];

/** Flower sticker (pink or blue), drawn in SVG if the art is missing. */
export function flower(variant: number, cls = ''): HTMLElement {
  return art(FLOWER_ART[variant % FLOWER_ART.length], `deco flower ${cls}`, () => flowerSvg(variant));
}

/** Samira's headphones doodle from the "About the game" slide. */
export function headphones(cls = ''): HTMLElement {
  return art('img/ui/headphones.png', `deco headphones ${cls}`);
}

/** Vinyl record (img/ui/vinyl.png or an SVG record). */
export function vinyl(cls = ''): HTMLElement {
  return art('img/ui/vinyl.png', `deco vinyl ${cls}`, () => {
    const grooves = Array.from({ length: 14 }, (_, i) => `<circle r="${44 + i * 3.8}" fill="none" stroke="${i % 2 ? '#262630' : '#1b1b22'}" stroke-width="1.6"/>`).join('');
    return svg(
      `<circle r="99" fill="#111116"/>${grooves}` +
        `<path d="M0 0 L70 -70 A99 99 0 0 1 99 0 Z" fill="rgba(255,255,255,.07)"/>` +
        `<path d="M0 0 L-70 70 A99 99 0 0 1 -99 0 Z" fill="rgba(255,255,255,.05)"/>` +
        `<circle r="34" fill="#f7768e"/><circle r="34" fill="none" stroke="#ffe80f" stroke-width="3" stroke-dasharray="4 5"/>` +
        `<circle r="4" fill="#7ed2fe"/>`,
      'vinyl-svg',
      '-100 -100 200 200',
    );
  });
}

/** The hand-drawn CD from the deck (img/ui/cd-playlist.png or an SVG one). */
export function cdPlaylist(cls = ''): HTMLElement {
  return art('img/ui/cd-playlist.png', `deco cd-playlist ${cls}`, () => cdSvg());
}

export function cdSvg(): SVGSVGElement {
  const lines = (x: number, w: number) =>
    Array.from({ length: 9 }, (_, i) => `<line x1="${x}" x2="${x + w - (i % 3) * 6}" y1="${-34 + i * 9}" y2="${-34 + i * 9}" stroke="#7a7f99" stroke-width="2" stroke-linecap="round"/>`).join('');
  const heart = (x: number, y: number, s = 1) =>
    `<path transform="translate(${x} ${y}) scale(${s})" d="M0 3 C-6 -3 -3 -8 0 -4 C3 -8 6 -3 0 3 Z" fill="#ef4f6b"/>`;
  return svg(
    `<defs><radialGradient id="cdg" r="0.5"><stop offset="0.25" stop-color="#ffffff"/><stop offset="0.85" stop-color="#f3f1ea"/><stop offset="1" stop-color="#d9d6cc"/></radialGradient></defs>` +
      `<circle r="99" fill="url(#cdg)" stroke="#55596e" stroke-width="2.5"/>` +
      `<circle r="94" fill="none" stroke="#b9b6ad" stroke-width="1"/>` +
      `<text y="-62" text-anchor="middle" font-family="Pacifico, cursive" font-size="17" fill="#2b2b3a">The</text>` +
      `<text y="-42" text-anchor="middle" font-family="Pacifico, cursive" font-size="19" fill="#2b2b3a">Liz and Wes</text>` +
      `<text y="-22" text-anchor="middle" font-family="Pacifico, cursive" font-size="15" fill="#2b2b3a">Playlist</text>` +
      lines(-78, 46) +
      lines(32, 46) +
      `<circle r="22" fill="#eceae4" stroke="#8d8a82" stroke-width="1.5"/><circle r="9" fill="#7ed2fe" stroke="#8d8a82" stroke-width="1.5"/>` +
      `<text x="0" y="62" text-anchor="middle" font-family="Pacifico, cursive" font-size="13" fill="#2b2b3a">love, Wes</text>` +
      heart(-60, -70) + heart(60, -70) + heart(-84, 10, 0.9) + heart(84, 10, 0.9) + heart(-50, 76) + heart(50, 76) + heart(0, 84, 0.8),
    'cd-svg',
    '-100 -100 200 200',
  );
}

/** A strip of washi tape (img/ui/tape.png or CSS). */
export function tape(cls = ''): HTMLElement {
  return art('img/ui/tape.png', `deco tape-strip ${cls}`, () => el('i', { class: 'tape-css' }));
}

/** A torn newspaper scrap (img/ui/newspaper-1.webp or CSS). */
export function newspaper(cls = ''): HTMLElement {
  return art('img/ui/newspaper-1.webp', `deco news ${cls}`, () =>
    el('i', { class: 'news-css' }, el('b', {}, 'THE OMAHA DAILY'), el('span', {}, 'Local boy still next door')),
  );
}

// ------------------------------------------------------------- portraits
const SPEAKER_COLORS: Record<string, string> = {
  wes: '#2f5fd0',
  'wes-kid': '#2f5fd0',
  liz: '#e8692f',
  'liz-kid': '#e8692f',
  michael: '#22a38a',
  jocelyn: '#d9468f',
  helena: '#8b6ad8',
  noah: '#e0a000',
  ryno: '#4f9d3a',
  narrator: '#43b3ee',
};

export function speakerColor(who: string): string {
  return SPEAKER_COLORS[who] ?? '#43b3ee';
}

/** Initial badge used when a portrait image is missing. */
export function initialBadge(who: string): HTMLElement {
  const name = SPEAKER_NAMES[who as keyof typeof SPEAKER_NAMES] || who;
  return el(
    'span',
    { class: 'initial-badge', style: `--c:${speakerColor(who)}` },
    el('b', {}, (name.replace(/^the /i, '')[0] ?? '?').toUpperCase()),
  );
}

/** Character portrait: mood variant → base portrait → initial badge. */
export function portrait(who: string, mood: string | undefined, cls: string): HTMLElement {
  const paths = [mood ? `img/portraits/${who}-${mood}.webp` : null, `img/portraits/${who}.webp`].filter(Boolean) as string[];
  const p = art(paths, `portrait ${cls}`, () => initialBadge(who), { fit: 'contain' });
  p.dataset.who = who;
  return p;
}

// --------------------------------------------------------------- songs
/** Flat fills from the book cover and the deck. */
const SLEEVE_INK = '#2b2b3a';
const SLEEVE_COLORS = ['#ffe80f', '#2f5fd0', '#f7768e', '#9be3c9', '#f9b6c8', '#fdfbf3'];
const DARK_SLEEVES = new Set(['#2f5fd0']);

/** Flat line-art doodles for the sleeve front, kept in its bottom third (the title sits above). */
function sleeveDoodle(kind: number, c: string): string {
  const ink = `stroke="${SLEEVE_INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;
  switch (kind) {
    case 0: // heart, bottom right
      return `<path d="M76 94 C64 86 60 81 60 75 C60 70.5 63.5 67 68 67 C71.5 67 74 69 76 72 C78 69 80.5 67 84 67 C88.5 67 92 70.5 92 75 C92 81 88 86 76 94 Z" fill="${c}" ${ink}/>`;
    case 1: // two stripes across the bottom
      return `<rect x="2" y="76" width="94" height="8" fill="${c}" ${ink}/><rect x="2" y="88" width="94" height="4" fill="${c}" ${ink}/>`;
    case 2: // setting sun with a horizon line
      return `<path d="M54 93 A19 19 0 0 1 92 93 Z" fill="${c}" ${ink}/><line x1="8" y1="93" x2="92" y2="93" ${ink}/>`;
    default: // three stars
      return [[18, 84, 6], [36, 90, 4], [82, 82, 8]]
        .map(([x, y, r]) => {
          const pts = Array.from({ length: 10 }, (_, i) => {
            const a = (Math.PI / 5) * i - Math.PI / 2;
            const rr = i % 2 ? r * 0.45 : r;
            return `${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`;
          }).join(' ');
          return `<polygon points="${pts}" fill="${c}" ${ink}/>`;
        })
        .join('');
  }
}

/** "Electric (feat. Khalid)" → "Electric": the sleeve keeps the short title. */
const shortTitle = (t: string) => t.replace(/\s*\((feat\.|with|interlude)[^)]*\)/i, '');

/**
 * A drawn record sleeve for a song, in the cover's style: thin even ink
 * outline, flat fills, a per-song colour, a vinyl peeking out, and the title
 * handwritten on the front. No network. `mini` drops the lettering (for
 * small thumbnails). Size it with `--sz` (the sleeve's height) in CSS.
 */
export function recordSleeve(id: SongId, cls = '', opts: { mini?: boolean } = {}): HTMLElement {
  const s = SONGS[id];
  const h = hash(id);
  const fill = SLEEVE_COLORS[h % SLEEVE_COLORS.length];
  let accent = SLEEVE_COLORS[(h >>> 4) % SLEEVE_COLORS.length];
  if (accent === fill) accent = SLEEVE_COLORS[(SLEEVE_COLORS.indexOf(fill) + 2) % SLEEVE_COLORS.length];
  const label = SLEEVE_COLORS[(SLEEVE_COLORS.indexOf(accent) + 3) % SLEEVE_COLORS.length];
  const ink = `stroke="${SLEEVE_INK}" stroke-width="1.6"`;
  const grooves = [33, 27, 21].map((r) => `<circle r="${r}" fill="none" stroke="#4a4a5c" stroke-width="0.9"/>`).join('');
  const markup =
    `<g class="sl-vinyl" transform="translate(94 50)"><g class="sl-disc">` +
    `<circle r="38" fill="#23232e" ${ink}/>${grooves}` +
    `<path d="M-30 -14 A33 33 0 0 1 -14 -30" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="2" stroke-linecap="round"/>` +
    `<circle r="12" fill="${label}" ${ink}/><circle r="2.2" fill="#fdfbf3" ${ink}/></g></g>` +
    `<rect x="2" y="2" width="94" height="96" rx="3" fill="${fill}" ${ink}/>` +
    sleeveDoodle((h >>> 8) % 4, accent);
  const svgEl = svg(markup, 'sleeve-svg', '0 0 134 100');
  const node = el('span', { class: `art record-sleeve${opts.mini ? ' mini' : ''}${DARK_SLEEVES.has(fill) ? ' dark' : ''} ${cls}`, 'aria-hidden': 'true' }, svgEl);
  if (!opts.mini && s) {
    const t = shortTitle(s.title);
    // lettering size as a fraction of the sleeve: smaller for long titles, and
    // small enough that the longest word fits on one line (no mid-word breaks)
    const longest = Math.max(...t.split(/\s+/).map((w) => w.length));
    const fs = Math.min(t.length <= 9 ? 0.17 : t.length <= 16 ? 0.15 : 0.115, 1.2 / longest);
    node.append(el('span', { class: 'sl-text', style: `--fs:${fs.toFixed(3)}` }, el('b', {}, t), el('small', {}, s.artist)));
  }
  return node;
}

function hash(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// ------------------------------------------------------------ particles
const CONFETTI = ['#ffe80f', '#f7768e', '#2f5fd0', '#9be3c9', '#f9b6c8', '#ffffff'];

/** Falling confetti and hearts. Pure CSS; removed with its parent. */
export function confetti(n = 36, hearts = true): HTMLElement {
  const box = el('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < n; i++) {
    const heart = hearts && i % 3 === 0;
    const c = CONFETTI[i % CONFETTI.length];
    const left = (i * 37) % 100;
    const delay = ((i * 0.27) % 2.6).toFixed(2);
    const dur = (3.2 + ((i * 7) % 10) * 0.22).toFixed(2);
    const drift = ((i % 7) - 3) * 14;
    box.append(
      el(
        'i',
        {
          class: heart ? 'cf heart' : 'cf',
          style: `left:${left}%;--c:${c};--d:${delay}s;--t:${dur}s;--x:${drift}px;--r:${(i * 47) % 360}deg`,
        },
        heart ? icon('heart', { fill: 'currentColor', stroke: 'currentColor' }) : null,
      ),
    );
  }
  return box;
}

/** Musical notes drifting upward. */
export function floatingNotes(n = 8): HTMLElement {
  const box = el('div', { class: 'notes', 'aria-hidden': 'true' });
  const glyphs = ['note', 'music', 'note', 'heart'];
  for (let i = 0; i < n; i++) {
    box.append(
      el(
        'i',
        { style: `left:${8 + ((i * 53) % 84)}%;--d:${(i * 0.9).toFixed(1)}s;--t:${(6 + (i % 4)).toFixed(1)}s;--s:${18 + (i % 3) * 7}px` },
        icon(glyphs[i % glyphs.length], { fill: 'currentColor' }),
      ),
    );
  }
  return box;
}

/** Five stars, filled up to `n`, popping in one by one. */
export function starRow(n: number, cls = ''): HTMLElement {
  return el(
    'div',
    { class: `star-row ${cls}`, 'aria-label': `${n} of 5 stars` },
    ...Array.from({ length: 5 }, (_, i) => el('i', { class: i < n ? 'on' : '', style: `--i:${i}` }, icon('star', { fill: 'currentColor', stroke: 'currentColor' }))),
  );
}

/** Close (X) button in the corner of a panel. */
export function closeX(onClick: () => void, id: string, label = 'Close'): HTMLButtonElement {
  const b = el('button', { class: 'close-x', 'aria-label': label, title: label, 'data-testid': id }, icon('close'));
  b.addEventListener('click', () => {
    audio.sfx('back');
    onClick();
  });
  return b;
}

export function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
