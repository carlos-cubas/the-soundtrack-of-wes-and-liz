/**
 * In-game HUD: a row of chips across the top of the screen.
 *
 *   [II] [speaker]  Level title     [timer 0:15] [hearts] [score] [progress]
 *
 * Games call the setters; passing null hides a chip.
 */
import { el } from './dom';
import { icon, iconSvg } from './icons';

export class Hud {
  readonly root: HTMLElement;
  private titleEl: HTMLElement;
  private timerEl: HTMLElement;
  private livesEl: HTMLElement;
  private scoreEl: HTMLElement;
  private progEl: HTMLElement;
  private progBar: HTMLElement;
  private progLabel: HTMLElement;
  private customEl: HTMLElement;
  readonly left: HTMLElement;
  private timerText: Text | null = null;
  private livesKey = '';

  constructor(parent: HTMLElement) {
    this.left = el('div', { style: 'display:flex;gap:8px' });
    this.titleEl = el('div', { class: 'hud-title' });
    this.customEl = el('div', { style: 'display:flex;gap:8px' });
    this.timerEl = el('div', { class: 'hud-chip', 'data-testid': 'hud-timer' });
    this.livesEl = el('div', { class: 'hud-chip', 'data-testid': 'hud-lives' });
    this.scoreEl = el('div', { class: 'hud-chip', 'data-testid': 'hud-score' });
    this.progBar = el('i');
    this.progLabel = el('span');
    this.progEl = el('div', { class: 'hud-chip', 'data-testid': 'hud-progress' }, this.progLabel, el('div', { class: 'hud-progress' }, this.progBar));
    this.root = el(
      'div',
      { class: 'hud' },
      this.left,
      this.titleEl,
      el('div', { class: 'spacer' }),
      this.customEl,
      this.progEl,
      this.timerEl,
      this.livesEl,
      this.scoreEl,
    );
    for (const c of [this.timerEl, this.livesEl, this.scoreEl, this.progEl]) c.style.display = 'none';
    parent.appendChild(this.root);
  }

  setTitle(text: string | null): void {
    this.titleEl.textContent = text ?? '';
  }

  /** Seconds remaining (or elapsed). Chip turns red below `warnBelow`. */
  setTimer(seconds: number | null, warnBelow = 5): void {
    if (seconds === null) {
      this.timerEl.style.display = 'none';
      return;
    }
    this.timerEl.style.display = '';
    const s = Math.max(0, seconds);
    // Countdown style: whole seconds round up (59.6 shows "1:00", never "60"),
    // tenths below 10 s round down (9.96 shows "9.9").
    const whole = Math.ceil(s);
    const txt =
      s < 10
        ? (Math.floor(s * 10) / 10).toFixed(1)
        : whole >= 60
          ? `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
          : String(whole);
    if (!this.timerText) {
      this.timerText = document.createTextNode('');
      this.timerEl.replaceChildren(icon('timer'), this.timerText);
    }
    if (this.timerText.data !== ` ${txt}`) this.timerText.data = ` ${txt}`;
    this.timerEl.classList.toggle('warn', s <= warnBelow);
  }

  setLives(lives: number | null, max?: number): void {
    if (lives === null) {
      this.livesEl.style.display = 'none';
      return;
    }
    this.livesEl.style.display = '';
    const m = Math.max(max ?? lives, lives);
    if (this.livesKey === `${lives}/${m}`) return;
    this.livesKey = `${lives}/${m}`;
    const full = iconSvg('heart', { fill: '#f7768e', stroke: '#3a3340' });
    const empty = iconSvg('heart', { fill: '#fff', stroke: '#3a3340' });
    this.livesEl.innerHTML = full.repeat(Math.max(0, lives)) + empty.repeat(Math.max(0, m - lives));
    this.livesEl.setAttribute('aria-label', `${lives} of ${m} lives`);
  }

  setScore(text: string | number | null): void {
    if (text === null) {
      this.scoreEl.style.display = 'none';
      return;
    }
    this.scoreEl.style.display = '';
    this.scoreEl.textContent = String(text);
  }

  setProgress(value: number | null, max = 1, label = ''): void {
    if (value === null) {
      this.progEl.style.display = 'none';
      return;
    }
    this.progEl.style.display = '';
    this.progLabel.textContent = label;
    this.progBar.style.width = `${Math.max(0, Math.min(1, value / max)) * 100}%`;
  }

  /** Free-form chip area for game-specific info. */
  custom(): HTMLElement {
    return this.customEl;
  }

  destroy(): void {
    this.root.remove();
  }
}
