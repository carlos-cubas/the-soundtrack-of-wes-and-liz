/** Title screen and prologue. */
import { app } from '../core/app';
import { audio } from '../core/audio';
import { save } from '../core/save';
import { PROLOGUE } from '../data/story';
import { art, flower, floatingNotes, newspaper, tape, vinyl } from '../ui/decor';
import { button, el, modal } from '../ui/dom';
import { icon } from '../ui/icons';
import { showDialogue } from './dialogue';
import { showMap } from './map';
import { openAbout, openSettings } from './settings';
import { openSoundtrack } from './soundtrack';

/** Key art size, and how much of its width Wes, Liz and their props fill. */
const ART_W = 2048;
const ART_H = 869;
const ART_PAIR = 0.46; // measured: the pair (boombox to Liz's shoe and record) ends at 46%
const ART_PAD = 0.06; // empty yellow left of Wes's elbow

export function showTitle(): void {
  audio.playMusic('title');
  const cont = save.hasProgress();

  const gear = el('button', { class: 'icon-btn title-corner-btn', 'aria-label': 'Settings', title: 'Settings', 'data-testid': 'open-settings' }, icon('gear'));
  gear.addEventListener('click', () => {
    audio.sfx('click');
    void openSettings(root);
  });
  const about = button('About this game', () => void openAbout(root), { color: 'gray', small: true, icon: 'info', id: 'open-about' });
  about.classList.add('title-about');

  const confirmNew = () => {
    const close = modal(
      root,
      el(
        'div',
        {},
        el('h2', { class: 'brush-title' }, 'Start over?'),
        el('p', {}, 'This erases your songs, items and progress.'),
        el(
          'div',
          { class: 'row' },
          button('Yes, start over', () => {
            close();
            save.reset();
            void startNew();
          }, { color: 'red', id: 'confirm-reset' }),
          button('Cancel', () => close(), { color: 'gray', id: 'cancel-reset' }),
        ),
      ),
      { onBackdrop: () => close() },
    );
  };

  const keyArt = art('img/title.webp', 'title-art', () =>
    el('div', { class: 'title-fallback' }, newspaper('tf-news'), el('div', { class: 'tf-photo tf-p1' }, el('b', {}, 'W')), el('div', { class: 'tf-photo tf-p2' }, el('b', {}, 'L')), flower(0, 'tf-f1'), flower(1, 'tf-f2')),
  );
  const probe = el('div', { class: 'safe-probe', 'aria-hidden': 'true' });
  const card = el(
    'div',
    { class: 'title-card-wrap' },
    el(
      'div',
      { class: 'title-card paper-screen' },
      el(
        'h1',
        { class: 'brush-title game-title' },
        el('span', { class: 'gt-small' }, 'The Soundtrack of'),
        el('span', { class: 'gt-big' }, 'Wes and Liz'),
      ),
      el('div', { class: 'title-by' }, 'a game by Samira Cubas'),
      el('div', { class: 'title-sub' }, 'based on ', el('i', {}, 'Better Than the Movies'), ' by Lynn Painter'),
    ),
    tape('tc-tape l'),
    tape('tc-tape r'),
  );
  const root = el(
    'div',
    { class: 'title-screen fade-in', 'data-testid': 'title' },
    probe,
    keyArt,
    // vinyl and notes live in the space right of the pair, behind the panel
    el('div', { class: 'title-decor' }, vinyl('title-vinyl spin-slow'), floatingNotes(7)),
    el('div', { class: 'title-corner' }, about, gear),
    el(
      'div',
      { class: 'title-panel', 'data-testid': 'title-panel' },
      // the title on a scrap of Samira's sky-blue paper, taped down
      card,
      el(
        'div',
        { class: 'title-actions' },
        cont ? button('Continue', () => showMap(), { color: 'green', icon: '▶', id: 'continue' }) : null,
        button(cont ? 'New game' : 'Start', () => (cont ? confirmNew() : void startNew()), {
          color: cont ? 'gray' : 'green',
          icon: '♥',
          id: 'new-game',
        }),
        button('Soundtrack', () => void openSoundtrack(root), { color: 'red', icon: '♫', id: 'title-soundtrack' }),
      ),
    ),
  );

  // The key art is never cover-fit: it sits bottom-left and the pair never
  // reaches under the title or buttons. The rest of the screen is the art's
  // own yellow.
  //   phones (wide):       art ≤ 42% of the width tall, panel to its right
  //   squarer (iPad 4:3):  "stacked": title card across the top band, art
  //                        below it up to half the width, buttons beside Liz
  const layout = () => {
    const W = root.clientWidth || innerWidth;
    const H = root.clientHeight || innerHeight;
    const ps = getComputedStyle(probe);
    const safeL = parseFloat(ps.paddingLeft) || 0;
    const safeR = parseFloat(ps.paddingRight) || 0;
    const safeT = parseFloat(ps.paddingTop) || 0;
    const stacked = W / H <= 1.6;
    const set = (k: string, v: number) => root.style.setProperty(k, `${Math.round(v)}px`);
    root.classList.toggle('stacked', stacked);
    let cardH = 0;
    if (stacked) {
      // the title fonts scale with the card width; measure the card, then fit the art below it
      set('--panel-w', Math.min(680, W - safeL - safeR - 40));
      cardH = card.offsetHeight;
      set('--card-h', cardH);
    }
    const pairPerH = (ART_PAIR * ART_W) / ART_H; // pair width per px of art height
    const h = stacked
      ? Math.min(0.62 * H, (0.5 * W) / pairPerH, H - safeT - cardH - 40)
      : Math.min(H, 0.42 * W);
    const w = (h * ART_W) / ART_H;
    const left = Math.max(0, safeL - ART_PAD * w);
    const panelL = left + ART_PAIR * w + 16; // 12px gap, plus the card's tilt
    const panelR = safeR + 12;
    set('--art-h', h);
    set('--art-w', w);
    set('--art-l', left);
    set('--art-top', H - h);
    set('--panel-l', panelL);
    set('--panel-r', panelR);
    if (!stacked) set('--panel-w', W - panelL - panelR);
  };
  const ro = new ResizeObserver(layout);

  app.show({ el: root, destroy: () => ro.disconnect() });
  ro.observe(root);
  layout();
}

async function startNew(): Promise<void> {
  await showDialogue(PROLOGUE.map((text) => ({ who: 'wes', text })), { scene: 'img/scenes/prologue.webp' });
  save.setFlag('prologueSeen');
  showMap();
}
