/**
 * Typewriter reveal for narration and dialogue. The full text is laid out
 * from the start (the unrevealed part is transparent), so nothing reflows
 * while it types and screen readers get the whole line.
 */
import { el } from './dom';
import { reducedMotion } from './decor';

export interface Typewriter {
  /** Reveal everything now. */
  finish(): void;
  /** Stop the animation (screen closed). */
  cancel(): void;
  readonly done: boolean;
}

export function typewriter(
  target: HTMLElement,
  paragraphs: string[],
  opts: { cps?: number; scroller?: HTMLElement; onDone?: () => void; tag?: 'p' | 'span' } = {},
): Typewriter {
  const cps = opts.cps ?? 55;
  const parts = paragraphs.map((text) => {
    const shown = document.createTextNode('');
    const caret = el('i', { class: 'tw-caret' });
    const rest = el('span', { class: 'tw-rest' }, text);
    const node = el(opts.tag ?? 'p', { class: 'tw' }, shown, caret, rest);
    target.appendChild(node);
    return { text, shown, caret, rest, node };
  });
  const total = parts.reduce((n, p) => n + p.text.length, 0);
  let shownChars = 0;
  let raf = 0;
  let last = performance.now();
  let done = false;

  const paint = () => {
    let left = Math.floor(shownChars);
    for (const p of parts) {
      const k = Math.max(0, Math.min(p.text.length, left));
      left -= p.text.length;
      p.shown.data = p.text.slice(0, k);
      p.rest.textContent = p.text.slice(k);
      const active = k > 0 && k < p.text.length;
      p.caret.style.display = active ? '' : 'none';
      if (active && opts.scroller) follow(p.caret);
    }
  };

  const follow = (caret: HTMLElement) => {
    const sc = opts.scroller!;
    const r = caret.getBoundingClientRect();
    const box = sc.getBoundingClientRect();
    // rects are on-screen px; scrollTop is layout px (they differ when the screen is scaled up)
    const k = box.height / (sc.clientHeight || box.height || 1);
    // keep the caret above the card's faded bottom edge
    const limit = box.bottom - Math.max(14 * k, box.height * 0.28);
    if (r.bottom > limit) sc.scrollTop += (r.bottom - limit) / k;
  };

  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    shownChars = total;
    paint();
    for (const p of parts) p.caret.remove();
    opts.onDone?.();
  };

  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    shownChars += dt * cps;
    if (shownChars >= total) return finish();
    paint();
    raf = requestAnimationFrame(tick);
  };

  paint();
  if (reducedMotion() || total === 0) finish();
  else raf = requestAnimationFrame(tick);

  return {
    finish,
    cancel: () => {
      cancelAnimationFrame(raf);
      done = true;
    },
    get done() {
      return done;
    },
  };
}
