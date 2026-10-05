/**
 * One UI scale for big screens (iPad, desktop windows).
 *
 * The meta screens are laid out in CSS px sized for phones. On a bigger
 * screen each screen root is laid out at viewport ÷ scale and scaled up as a
 * whole (screens.css, `html.ui-big`), so text, art and tap targets grow with
 * the screen. Phones are shorter than REF_H, so they stay at exactly 1.
 *
 * Inside a scaled root, use `var(--vh)` / `var(--vw)` instead of vh / vw:
 * those still measure the physical viewport.
 */
const REF_W = 960;
const REF_H = 600;
const MAX = 1.6;

let current = 1;

/** The current scale (1 on phones). */
export function uiScale(): number {
  return current;
}

function update(): void {
  const s = Math.max(1, Math.min(innerWidth / REF_W, innerHeight / REF_H, MAX));
  current = Math.round(s * 1000) / 1000;
  const html = document.documentElement;
  html.style.setProperty('--ui-scale', String(current));
  html.classList.toggle('ui-big', current > 1);
}

update();
addEventListener('resize', update);
addEventListener('orientationchange', () => setTimeout(update, 250));
