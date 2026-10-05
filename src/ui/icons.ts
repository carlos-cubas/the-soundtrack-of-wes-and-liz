/**
 * Line-art SVG icons (thin, even strokes like the book cover's art).
 * Use these instead of emoji: they match the style and render identically
 * everywhere (the iOS 26.3 simulator is missing its emoji font).
 *
 *   icon('pause')            → <svg class="ico-svg">…</svg>
 *   icon('heart', { fill: '#f7768e' })
 */

const P: Record<string, string> = {
  pause: '<rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/>',
  play: '<path d="M8 5.5v13l10-6.5z" stroke-linejoin="round"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
  speaker:
    '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" stroke-linejoin="round"/><path d="M15.5 9a4 4 0 0 1 0 6" fill="none"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11" fill="none"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" stroke-linejoin="round"/>',
  star: '<path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z" stroke-linejoin="round"/>',
  home: '<path d="M4 11.5L12 5l8 6.5" fill="none" stroke-linejoin="round"/><path d="M6.5 10v9h11v-9" fill="none" stroke-linejoin="round"/><rect x="10.3" y="14" width="3.4" height="5"/>',
  bag: '<path d="M6 8.5h12l-1 11H7z" stroke-linejoin="round"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" fill="none"/>',
  lock: '<rect x="6" y="10.5" width="12" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none"/>',
  music: '<path d="M9 17.5V6l9-2v11.5" fill="none" stroke-linejoin="round"/><ellipse cx="7" cy="17.5" rx="2.4" ry="2"/><ellipse cx="16" cy="15.5" rx="2.4" ry="2"/>',
  note: '<path d="M14 4v11.5" fill="none"/><ellipse cx="11.3" cy="16" rx="3" ry="2.4"/><path d="M14 4c1.5 2.2 4 2.5 4 5.2" fill="none"/>',
  gear:
    '<circle cx="12" cy="12" r="3" fill="none"/><path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6" fill="none"/><circle cx="12" cy="12" r="6" fill="none"/>',
  map: '<path d="M4 6.5l5-2 6 2 5-2v13l-5 2-6-2-5 2z" fill="none" stroke-linejoin="round"/><path d="M9 4.5v13M15 6.5v13" fill="none"/>',
  retry: '<path d="M18.5 12a6.5 6.5 0 1 1-2-4.7" fill="none"/><path d="M17.5 3.8v4.3h-4.3" fill="none" stroke-linejoin="round"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke-linejoin="round"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none"/>',
  timer: '<circle cx="12" cy="13" r="7" fill="none"/><path d="M12 13V9.2M10 3.5h4M17.5 6.8l1.3-1.3" fill="none"/>',
  sparkle: '<path d="M12 3.5l1.8 6.7 6.7 1.8-6.7 1.8L12 20.5l-1.8-6.7L3.5 12l6.7-1.8z" stroke-linejoin="round"/>',
  hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11V5a1.5 1.5 0 0 1 3 0v6V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a5 5 0 0 1-4.3-2.5L5 13.8a1.5 1.5 0 0 1 2.6-1.5z" stroke-linejoin="round"/>',
  info: '<circle cx="12" cy="12" r="8" fill="none"/><path d="M12 11v5.5" fill="none"/><circle cx="12" cy="7.8" r="0.6"/>',
  drop: '<path d="M12 3.5c3.4 4.4 5.6 7.6 5.6 10.4a5.6 5.6 0 0 1-11.2 0c0-2.8 2.2-6 5.6-10.4z" fill="#9cc4ee" stroke-linejoin="round"/><path d="M9.6 14.2a2.6 2.6 0 0 0 2 2.4" fill="none"/>',

  // ---- Side Quest 1 date-choice cards: ink outline + flat palette fills (self-coloured)
  sneaker:
    '<path d="M4 16.5c0-3 .8-6.5 2.5-7.2l3 .4c1 2 3.3 3.2 6.3 3.6 2.7.4 4.7 1.4 4.7 3.2v1z" fill="#f7768e" stroke-linejoin="round"/><path d="M4 16.5h16.5v1.3a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 17.8z" fill="#fdfbf3" stroke-linejoin="round"/><path d="M9 11.2l1.6 1.1M11 10.6l1.6 1.2M1.5 9.5H3M1 12.5h1.5" fill="none"/>',
  rose:
    '<path d="M12 12.5V21" fill="none"/><path d="M12 17.5c-2.6 0-4.2-1.4-4.8-3.2 2.2 0 4 .9 4.8 3.2z" fill="#9be3c9" stroke-linejoin="round"/><path d="M7.8 7.6C7.8 4.6 9.8 3 12 3s4.2 1.6 4.2 4.6S14.3 12.5 12 12.5 7.8 10.6 7.8 7.6z" fill="#f7768e" stroke-linejoin="round"/><path d="M10.4 6.6c.9-1.3 3.1-1.1 3.1.5s-2 2.1-3.1.9" fill="none"/>',
  carpet:
    '<path d="M6.5 11h11l3 9.5h-17z" fill="#ef4444" stroke-linejoin="round"/><rect x="5" y="6.5" width="14" height="4.5" rx="2.25" fill="#ef4444"/><circle cx="17" cy="8.75" r="1.1" fill="#fdfbf3"/><path d="M8 15h8" fill="none"/>',
  burger:
    '<path d="M4 11.2a8 6.2 0 0 1 16 0z" fill="#f8de4f" stroke-linejoin="round"/><rect x="3.8" y="12.6" width="16.4" height="3.2" rx="1.6" fill="#8a5a3c"/><path d="M4.4 17.3h15.2v.9a2 2 0 0 1-2 2H6.4a2 2 0 0 1-2-2z" fill="#f8de4f" stroke-linejoin="round"/><path d="M9 7.8l.9-.3M13.4 7.4l.9.3M11.2 9.4l.7.4" fill="none"/>',
  candle:
    '<rect x="9" y="10.5" width="6" height="9" rx="1" fill="#fdfbf3"/><path d="M12 3.5c1.8 2 2.2 3.3 2.2 4.3A2.2 2.2 0 0 1 12 10a2.2 2.2 0 0 1-2.2-2.2c0-1 .4-2.3 2.2-4.3z" fill="#f8de4f" stroke-linejoin="round"/><path d="M5.5 20.5h13" fill="none"/>',
  baguette:
    '<path d="M4.6 19.4c-1.6-1.6-1.1-3.7 1-5.8l7.6-7.6c2.1-2.1 4.2-2.6 5.8-1s1.1 3.7-1 5.8l-7.6 7.6c-2.1 2.1-4.2 2.6-5.8 1z" fill="#f3c77a" stroke-linejoin="round"/><path d="M8.6 13.4l2 2M11.6 10.4l2 2M14.6 7.4l2 2" fill="none"/>',
  drum:
    '<path d="M5 11v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6" fill="#f7768e" stroke-linejoin="round"/><ellipse cx="12" cy="11" rx="7" ry="2.5" fill="#fdfbf3"/><path d="M5 14.5c2.5 1.6 11.5 1.6 14 0M9.5 8.5L5 3.5M14.5 8.5L19 3.5" fill="none"/>',
  violin:
    '<path d="M12 8.5c-2.6 0-3.6 1.6-3.1 3.1.3 1-1.7 1.9-1.7 4 0 2.4 2.1 4.4 4.8 4.4s4.8-2 4.8-4.4c0-2.1-2-3-1.7-4 .5-1.5-.5-3.1-3.1-3.1z" fill="#c9824f" stroke-linejoin="round"/><path d="M12 3v15M10.4 13.5v2.2M13.6 13.5v2.2M20 4.5L15.5 19" fill="none"/>',
  disco:
    '<path d="M12 2.5v4" fill="none"/><circle cx="12" cy="13" r="6.5" fill="#e8eef5"/><path d="M5.5 13h13M6.6 9.8h10.8M6.6 16.2h10.8M12 6.5v13M9.2 7.2c-1.2 3.8-1.2 7.8 0 11.6M14.8 7.2c1.2 3.8 1.2 7.8 0 11.6" fill="none" stroke-width="1.2"/><path d="M20 3.5v3M18.5 5h3" fill="none"/>',
  gnome:
    '<path d="M7.6 12.5c0 5 2.2 8 4.4 8s4.4-3 4.4-8z" fill="#fdfbf3" stroke-linejoin="round"/><path d="M12 2.5l-5.2 10h10.4z" fill="#f7768e" stroke-linejoin="round"/><circle cx="12" cy="13.6" r="1.4" fill="#f1c7a5"/>',
  scroll:
    '<rect x="6" y="5" width="12" height="14" fill="#fdfbf3"/><rect x="4.5" y="3" width="15" height="3.2" rx="1.6" fill="#f3e6c4"/><rect x="4.5" y="17.8" width="15" height="3.2" rx="1.6" fill="#f3e6c4"/><path d="M9 9.5h6M9 12h6M9 14.5h4" fill="none"/>',
  eyes:
    '<ellipse cx="7.5" cy="12" rx="4.3" ry="5.5" fill="#fff"/><ellipse cx="16.5" cy="12" rx="4.3" ry="5.5" fill="#fff"/><circle cx="8.6" cy="13" r="1.6" fill="currentColor"/><circle cx="17.6" cy="13" r="1.6" fill="currentColor"/>',
  hoodie:
    '<path d="M8.2 4.5c1 1.4 2.4 2 3.8 2s2.8-.6 3.8-2l4.2 2.4 1.5 6-3 1-.7-2.4V20.5H6.2v-9L5.5 14l-3-1L4 6.9z" fill="#b8c6e6" stroke-linejoin="round"/><path d="M8.6 4.6c.5 2.4 1.9 3.9 3.4 3.9s2.9-1.5 3.4-3.9M11 8.6V11M13 8.6V11M9 15.5h6v3H9z" fill="none"/>',
  cape:
    '<path d="M8 4h8l1 2.2 3 12.8c-2 1.5-5 1-6-1-1 2-3 2-4 0-1 2-4 2.5-6 1L7 6.2z" fill="#ef4444" stroke-linejoin="round"/><circle cx="12" cy="5" r="1.5" fill="#f8de4f"/>',
  snail:
    '<path d="M2.5 18.5H19a2 2 0 0 0 2-2M4.2 18.5c0-3 .6-5.8 2.6-7.3M6.8 11.2l-1.6-3M6.8 11.2l1-3.3" fill="none"/><circle cx="13.5" cy="12.5" r="5.5" fill="#f9b6c8"/><path d="M13.5 12.5a1.4 1.4 0 1 1 1.4 1.4 2.9 2.9 0 0 1-2.9-2.9 4.2 4.2 0 0 1 5.6 4" fill="none"/>',
  parking:
    '<path d="M12 15.5V21" fill="none"/><rect x="5" y="3" width="14" height="12.5" rx="2" fill="#2f5fd0"/><path d="M10 12.5V6h2.6a2 2 0 0 1 0 4H10" fill="none" stroke="#fff"/>',
  stars:
    '<path d="M9.5 3.5l1.6 5.6 5.6 1.6-5.6 1.6-1.6 5.6-1.6-5.6-5.6-1.6 5.6-1.6z" fill="#f8de4f" stroke-linejoin="round"/><path d="M18 13l.9 2.8 2.8.9-2.8.9L18 20.4l-.9-2.8-2.8-.9 2.8-.9z" fill="#f8de4f" stroke-linejoin="round"/>',
  firework:
    '<path d="M12 12V4.5M12 12l5.3-5.3M12 12h7.5M12 12l5.3 5.3M12 12v7.5M12 12l-5.3 5.3M12 12H4.5M12 12L6.7 6.7" fill="none"/><g fill="#f7768e" stroke="none"><circle cx="12" cy="3" r="1.3"/><circle cx="18.4" cy="5.6" r="1.3"/><circle cx="21" cy="12" r="1.3"/><circle cx="18.4" cy="18.4" r="1.3"/><circle cx="12" cy="21" r="1.3"/><circle cx="5.6" cy="18.4" r="1.3"/><circle cx="3" cy="12" r="1.3"/><circle cx="5.6" cy="5.6" r="1.3"/></g>',
};

export type IconName = keyof typeof P;

export function iconSvg(name: string, opts: { fill?: string; size?: number; stroke?: string; title?: string } = {}): string {
  const body = P[name] ?? P.star;
  const fill = opts.fill ?? 'none';
  const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : '';
  const title = opts.title ? `<title>${opts.title}</title>` : '';
  return `<svg class="ico-svg" viewBox="0 0 24 24"${size} aria-hidden="${opts.title ? 'false' : 'true'}" fill="${fill}" stroke="${opts.stroke ?? 'currentColor'}" stroke-width="2" stroke-linecap="round">${title}${body}</svg>`;
}

/** An inline icon element. */
export function icon(name: string, opts: { fill?: string; size?: number; stroke?: string; title?: string; class?: string } = {}): HTMLElement {
  const span = document.createElement('span');
  span.className = `ico-wrap${opts.class ? ' ' + opts.class : ''}`;
  span.innerHTML = iconSvg(name, opts);
  return span;
}
