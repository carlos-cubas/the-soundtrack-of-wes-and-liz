/** Settings (sound toggles) and Samira's "About this game" pages. */
import { audio } from '../core/audio';
import { save, type SaveData } from '../core/save';
import { ABOUT_GAME } from '../data/story';
import { closeX, flower, tape } from '../ui/decor';
import { el, modal } from '../ui/dom';
import { icon } from '../ui/icons';

type Key = keyof SaveData['settings'];

const ROWS: Array<{ key: Key; icon: string; label: string; sub: string }> = [
  { key: 'music', icon: 'music', label: 'Music', sub: 'Chiptune soundtrack on the map and in levels' },
  { key: 'sfx', icon: 'sparkle', label: 'Sound effects', sub: 'Taps, jumps, stars and claims' },
  { key: 'voice', icon: 'heart', label: 'Character voices', sub: 'Wes, Liz and friends read their lines' },
  { key: 'autoNarrate', icon: 'speaker', label: 'Auto-play narration', sub: 'Wes reads each level intro out loud' },
];

export function openSettings(parent: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const rows = ROWS.map((r) => {
      const sw = el('button', {
        class: 'switch',
        role: 'switch',
        'aria-label': r.label,
        'data-testid': `setting-${r.key}`,
      }, el('i'));
      const sync = () => {
        const on = save.data.settings[r.key];
        sw.setAttribute('aria-checked', String(on));
        sw.classList.toggle('on', on);
      };
      sync();
      const row = el(
        'label',
        { class: 'set-row' },
        el('span', { class: 'set-ico' }, icon(r.icon)),
        el('span', { class: 'set-text' }, el('b', {}, r.label), el('small', {}, r.sub)),
        sw,
      );
      sw.addEventListener('click', (e) => {
        e.preventDefault();
        save.data.settings[r.key] = !save.data.settings[r.key];
        save.persist();
        audio.applySettings(save.data.settings);
        audio.sfx('click');
        sync();
      });
      return row;
    });
    const done = () => {
      close();
      resolve();
    };
    const close = modal(
      parent,
      el(
        'div',
        { class: 'settings', 'data-testid': 'settings' },
        closeX(done, 'settings-close'),
        flower(1, 'set-flower'),
        el('h2', { class: 'brush-title' }, 'Settings'),
        el('div', { class: 'set-list' }, ...rows),
      ),
      { onBackdrop: done, class: 'panel settings-card' },
    );
  });
}

/**
 * "About this game": Samira's own words from the deck, one taped paper card
 * per section with a lemon heading. The chips jump to a section.
 */
export function openAbout(parent: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const cards = ABOUT_GAME.map((sec, i) =>
      el(
        'section',
        { class: 'paper about-sec', 'data-testid': `about-sec-${i}` },
        tape('about-tape'),
        el('h3', { class: 'brush-title about-h' }, sec.heading),
        ...sec.body.map((p) => el('p', {}, p)),
      ),
    );
    const body = el(
      'div',
      { class: 'about-body scrollable' },
      ...cards,
      el('div', { class: 'about-credit' }, 'Game design by Samira Cubas', el('small', {}, 'based on Better Than the Movies by Lynn Painter')),
    );
    const chips = ABOUT_GAME.map((sec, i) => {
      const b = el('button', { class: 'about-tab', 'data-testid': `about-tab-${i}` }, sec.heading);
      b.addEventListener('click', () => {
        audio.sfx('page');
        body.scrollTo({ top: cards[i].offsetTop - 4, behavior: 'smooth' });
      });
      return b;
    });
    // highlight the chip of the section being read
    const sync = () => {
      const y = body.scrollTop + 40;
      let cur = 0;
      cards.forEach((c, i) => {
        if (c.offsetTop <= y) cur = i;
      });
      if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4) cur = cards.length - 1;
      chips.forEach((c, i) => c.classList.toggle('on', i === cur));
      // keep the active chip visible in the sideways-scrolling strip
      const chip = chips[cur];
      const strip = chip.parentElement;
      if (strip) {
        const l = chip.offsetLeft - strip.offsetLeft;
        if (l < strip.scrollLeft + 18 || l + chip.offsetWidth > strip.scrollLeft + strip.clientWidth - 24) {
          strip.scrollTo({ left: Math.max(0, l - (strip.clientWidth - chip.offsetWidth) / 2), behavior: 'smooth' });
        }
      }
    };
    body.addEventListener('scroll', sync, { passive: true });
    const done = () => {
      close();
      resolve();
    };
    const close = modal(
      parent,
      el(
        'div',
        { class: 'about', 'data-testid': 'about' },
        closeX(done, 'about-close'),
        el(
          'div',
          { class: 'about-head' },
          el('h2', { class: 'brush-title' }, 'About this game'),
          el('span', { class: 'about-by' }, 'Game design by Samira Cubas'),
        ),
        el('div', { class: 'about-tabs scrollable', 'data-testid': 'about-tabs' }, ...chips),
        body,
      ),
      { onBackdrop: done, class: 'panel about-card' },
    );
    sync();
  });
}
