/**
 * Reliable taps on iOS.
 *
 * iOS only synthesizes `click` after a tap passes UIKit's gesture checks, and a
 * slight finger wiggle, a competing gesture or Safari's toolbar can swallow it,
 * so buttons sometimes needed two or three taps. For touch input we fire the
 * click ourselves on pointerup (if the finger lifted over the same control
 * without travelling) and swallow the native click that may follow.
 *
 * Applies to buttons, links, [role=button] and anything marked
 * [data-fastclick]. Mouse input keeps the native behaviour.
 */

const SELECTOR = 'button, a[href], [role="button"], [data-fastclick]';
const SLOP_PX = 14;
const MAX_MS = 900;

export function installFastClick(doc: Document = document): void {
  let down: { el: HTMLElement; id: number; x: number; y: number; t: number } | null = null;
  let swallowUntil = 0;

  const target = (x: number, y: number): HTMLElement | null =>
    (doc.elementFromPoint(x, y)?.closest(SELECTOR) as HTMLElement | null) ?? null;

  doc.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse' || !e.isPrimary) {
        down = null;
        return;
      }
      const el = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
      down = el && !(el as HTMLButtonElement).disabled ? { el, id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } : null;
    },
    true,
  );

  doc.addEventListener(
    'pointerup',
    (e) => {
      const d = down;
      down = null;
      if (!d || e.pointerId !== d.id) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > SLOP_PX || performance.now() - d.t > MAX_MS) return;
      if (!d.el.isConnected || target(e.clientX, e.clientY) !== d.el) return;
      swallowUntil = performance.now() + 700;
      d.el.click();
    },
    true,
  );

  doc.addEventListener('pointercancel', () => (down = null), true);

  // The browser's own click for the same tap (if it still arrives) is a duplicate.
  doc.addEventListener(
    'click',
    (e) => {
      if (e.isTrusted && performance.now() < swallowUntil) {
        swallowUntil = 0;
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    },
    true,
  );
}
