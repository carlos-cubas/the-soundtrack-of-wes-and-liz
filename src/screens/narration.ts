/**
 * Narration screen, laid out like one of Samira's deck slides: a taped
 * polaroid of the scene, the lemon title, and Wes's narration typed out on
 * paper. The orange button reads it aloud, then the how-to-play card.
 */
import { app } from '../core/app';
import { audio } from '../core/audio';
import { likelyKeyboard } from '../core/input';
import { save } from '../core/save';
import { ITEMS, type LevelDef } from '../data/story';
import { art, closeX, flower, newspaper, portrait, tape } from '../ui/decor';
import { button, el, modal, toast } from '../ui/dom';
import { icon } from '../ui/icons';
import { typewriter } from '../ui/typewriter';
import { openInventory } from './inventory';
import { shortPlace } from './map';

/** Scroll `box` so `child` sits at its top. */
function scrollToChild(box: HTMLElement, child: HTMLElement): void {
  const r = box.getBoundingClientRect();
  const k = r.height / (box.clientHeight || r.height || 1); // on-screen px per layout px
  const top = box.scrollTop + (child.getBoundingClientRect().top - r.top) / k - 8;
  box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

/** Polaroid of a level's scene (with a doodle if the art is missing). */
export function scenePolaroid(level: LevelDef, cls = ''): HTMLElement {
  return el(
    'div',
    { class: `polaroid scene-polaroid ${cls}` },
    tape('polaroid-tape'),
    art(level.scene, 'polaroid-img', () => el('span', { class: 'scene-doodle' }, icon('heart', { fill: '#f7768e', stroke: '#fff' }))),
    el('div', { class: 'polaroid-cap' }, `${shortPlace(level.location)}, ${level.year}`),
  );
}

/**
 * Orange "hear the narration" toggle. Reads one paragraph at a time and
 * reports which one (-1 when it stops) so the text can follow along.
 */
function hearButton(level: LevelDef, parent: () => HTMLElement, onLine: (i: number) => void = () => {}): HTMLButtonElement {
  let run = 0;
  const set = (on: boolean) => {
    hear.classList.toggle('speaking', on);
    hear.lastChild!.textContent = on ? 'Stop' : 'Hear narration';
    if (!on) onLine(-1);
  };
  const hear = button('Hear narration', () => {
    if (hear.classList.contains('speaking')) {
      run++;
      audio.stopSpeaking();
      set(false);
      return;
    }
    if (!save.data.settings.voice) {
      toast(parent(), 'Character voices are off. Turn them on in Settings.', 2600);
      return;
    }
    const mine = ++run;
    set(true);
    void (async () => {
      for (let i = 0; i < level.narration.length && mine === run; i++) {
        onLine(i);
        await audio.speak(level.narration[i], { who: 'wes' });
      }
      if (mine === run) set(false);
    })();
  }, { color: 'orange', icon: '🔊', id: 'hear-narration' });
  return hear;
}

export function showNarration(level: LevelDef, opts: { howTo?: boolean } = {}): Promise<'start' | 'back'> {
  return new Promise((resolve) => {
    audio.playMusic('narration');
    const text = el('div', { class: 'narr-text' });
    const sign = el('p', { class: 'narr-sign' }, '— Wesley Bennett');
    const card = el('div', { class: 'paper lined narr-card scrollable', 'data-testid': 'narration-text' }, text, sign);
    // fade the bottom edge while there is more to read below
    const more = () => card.classList.toggle('more', card.scrollTop + card.clientHeight < card.scrollHeight - 6);
    const tw = typewriter(text, level.narration, {
      cps: 60,
      scroller: card,
      onDone: () => {
        card.classList.add('typed');
        requestAnimationFrame(more);
      },
    });
    card.addEventListener('click', () => tw.finish());
    card.addEventListener('scroll', more, { passive: true });
    const ro = new ResizeObserver(more);
    ro.observe(card);

    // while Wes reads, show the whole text and mark the paragraph he is on
    const follow = (i: number) => {
      if (i >= 0) tw.finish();
      const ps = text.querySelectorAll('.tw');
      ps.forEach((p, k) => p.classList.toggle('reading', k === i));
      const cur = ps[i] as HTMLElement | undefined;
      if (cur) scrollToChild(card, cur);
      card.classList.toggle('following', i >= 0);
    };
    const hear = hearButton(level, () => root, follow);
    const next = button(opts.howTo ? 'Next' : 'Continue', () => {
      audio.stopSpeaking();
      tw.finish();
      if (!opts.howTo) return resolve('start');
      showHowTo();
    }, { color: 'green', icon: '▶', id: 'narration-next' });
    const back = button('Map', () => {
      audio.stopSpeaking();
      resolve('back');
    }, { color: 'gray', small: true, icon: '🗺', id: 'narration-back' });

    const root = el(
      'div',
      { class: 'narration paper-screen fade-in', 'data-testid': 'narration' },
      flower(0, 'narr-flower'),
      // Stella's gets Liz's ketchup napkin instead of a newspaper scrap
      level.id === 'l6' ? art('img/ui/napkin-lw.png', 'deco narr-napkin', () => newspaper()) : newspaper('narr-news'),
      el(
        'div',
        { class: 'narr-layout' },
        el('div', { class: 'narr-photo-col' }, scenePolaroid(level, 'narr-photo')),
        el(
          'div',
          { class: 'narr-body' },
          el('div', { class: 'narr-kicker' }, `${level.label} · ${level.chapter} · ${level.year}`),
          el('h1', { class: 'brush-title narr-title' }, level.title),
          // page + buttons: one column on iPad (centred on the polaroid); invisible on phones
          el('div', { class: 'narr-page' }, card, el('div', { class: 'narr-actions' }, back, el('div', { class: 'spacer' }), hear, next)),
        ),
      ),
    );
    app.show({
      el: root,
      destroy: () => {
        tw.cancel();
        ro.disconnect();
        audio.stopSpeaking();
      },
    });
    if (save.data.settings.autoNarrate && save.data.settings.voice) hear.click();

    function showHowTo() {
      const who = level.playAs === 'frog' ? null : level.year === '2011' ? `${level.playAs}-kid` : level.playAs;
      const avatar = who
        ? portrait(who, undefined, 'howto-portrait')
        : art('img/sprites/frog.png', 'howto-portrait frog', () => el('span', { class: 'initial-badge', style: '--c:#4f9d3a' }, el('b', {}, 'F')), { fit: 'contain' });
      const asName = level.playAs === 'frog' ? 'the frog' : level.playAs === 'liz' ? 'Liz' : 'Wes';
      const extras = el('div', { class: 'howto-extras' });
      const renderExtras = () => {
        const chips: Node[] = [];
        if (level.kind === 'side') {
          const eq = save.data.equipped;
          chips.push(
            eq
              ? el('div', { class: 'howto-chip item' }, art(ITEMS[eq].icon, 'chip-ico', () => icon('bag')), el('span', {}, `${ITEMS[eq].name} equipped. Tap the item button to use it.`))
              : el('div', { class: 'howto-chip' }, el('span', {}, 'No item equipped. Items help in side quests.')),
          );
        }
        if (save.speedMultiplier() > 1) chips.push(el('div', { class: 'howto-chip chucks' }, art(ITEMS.chucks.icon, 'chip-ico', () => icon('star')), el('span', {}, 'Chuck Taylors on: double speed!')));
        extras.replaceChildren(...chips);
      };
      renderExtras();
      const done = () => close();
      const close = modal(
        root,
        el(
          'div',
          { class: 'howto', 'data-testid': 'howto' },
          closeX(done, 'howto-close', 'Back to the narration'),
          el(
            'div',
            { class: 'howto-grid' },
            el('div', { class: 'howto-who' }, avatar, el('div', { class: 'howto-as' }, 'You play as ', el('b', {}, asName))),
            el(
              'div',
              { class: 'howto-main' },
              el('h2', { class: 'brush-title howto-title' }, 'How to play'),
              el('ol', { class: 'howto-list' }, ...level.howTo.map((h, n) => el('li', {}, el('span', { class: 'howto-n' }, String(n + 1)), el('span', {}, h)))),
              level.keys && likelyKeyboard()
                ? el(
                    'div',
                    { class: 'howto-keys', 'data-testid': 'howto-keys' },
                    el('b', {}, 'On a keyboard'),
                    ...level.keys.map((k) => el('div', { class: 'howto-key' }, ...k.keys.map((t) => el('kbd', {}, t)), el('span', {}, k.does))),
                  )
                : null,
              extras,
              el(
                'div',
                { class: 'row howto-actions' },
                level.kind === 'side'
                  ? button('Inventory', () => void openInventory(root).then(renderExtras), { color: 'blue', icon: '🎒', small: true, id: 'howto-inventory' })
                  : null,
                button('Start!', () => {
                  close();
                  resolve('start');
                }, { color: 'green', icon: '▶', id: 'start-game' }),
              ),
            ),
          ),
        ),
        { onBackdrop: done, class: 'panel howto-card' },
      );
    }
  });
}

/** Overlay replay of a level's narration (orange button during play). */
export function replayNarration(parent: HTMLElement, level: LevelDef): Promise<void> {
  return new Promise((resolve) => {
    const lines = level.narration.map((p) => el('p', {}, p));
    const box = el('div', { class: 'narr-replay-text scrollable' }, ...lines, el('p', { class: 'narr-sign' }, '— Wesley Bennett'));
    const hear = hearButton(level, () => parent, (i) => {
      lines.forEach((p, k) => p.classList.toggle('reading', k === i));
      if (lines[i]) scrollToChild(box, lines[i]);
    });
    const done = () => {
      audio.stopSpeaking();
      close();
      resolve();
    };
    const close = modal(
      parent,
      el(
        'div',
        { class: 'narr-replay', 'data-testid': 'narration-replay' },
        el('div', { class: 'narr-kicker dark' }, `${level.label} · ${level.chapter} · ${level.year}`),
        el('h2', { class: 'brush-title' }, level.title),
        box,
        el('div', { class: 'row' }, hear, button('Back to game', done, { color: 'green', icon: '▶', id: 'narration-resume' })),
      ),
      { class: 'panel replay-card' },
    );
    if (save.data.settings.voice) hear.click();
  });
}

