/**
 * Ending: the book's theme line by line over the last scene, read by the
 * narrator's recorded clips, then the "Better Than the Movies" flourish, the
 * credits and the finished playlist.
 */
import { app } from '../core/app';
import { audio } from '../core/audio';
import { save } from '../core/save';
import { CREDITS, ENDING } from '../data/story';
import { art, confetti, flower, floatingNotes } from '../ui/decor';
import { button, el } from '../ui/dom';
import { icon } from '../ui/icons';
import { showMap } from './map';
import { openAbout } from './settings';
import { openSoundtrack, songPlayButton } from './soundtrack';

/** Each paragraph stays up at least this long, even if its clip is shorter. */
const MIN_SHOW_MS = 2600;

export function showEnding(): void {
  audio.playMusic('ending');
  let step = 0;
  let timer = 0;
  let run = 0;
  const paras = ENDING.map((p, i) => el('p', { class: `end-p${i === ENDING.length - 1 ? ' last' : ''}` }, p));
  const theme = el('div', { class: 'paper end-theme' }, ...paras);
  const tapHint = el('div', { class: 'end-hint' }, 'tap to continue');

  const toMap = () => {
    audio.stopPreview();
    showMap();
  };
  const finale = el(
    'div',
    { class: 'end-final' },
    el(
      'h1',
      { class: 'brush-title end-flourish', 'aria-label': 'Better Than the Movies' },
      ...'Better Than the Movies'.split(' ').map((w, wi) =>
        el('span', { class: 'end-word' }, ...[...w].map((ch, ci) => el('span', { class: 'end-ch', style: `--i:${wi * 6 + ci}` }, ch))),
      ),
    ),
    el('div', { class: 'end-thanks' }, 'Thank you for playing ', icon('heart', { fill: 'currentColor' })),
    el(
      'div',
      { class: 'paper end-credits' },
      ...CREDITS.map(([k, v]) => el('div', { class: 'credit' }, el('span', {}, k), el('b', {}, v))),
      el(
        'div',
        { class: 'credit' },
        el('span', {}, 'About'),
        Object.assign(button('About this game', () => void openAbout(root), { color: 'gray', small: true, icon: 'info', id: 'ending-about' }), { className: 'btn gray small end-about' }),
      ),
    ),
    el(
      'div',
      { class: 'row end-actions' },
      songPlayButton(app.root, 'paradise', { id: 'ending-play', label: true, text: 'Play "Paradise"' }),
      button('Playlist', () => void openSoundtrack(root), { color: 'red', icon: '♫', id: 'ending-playlist' }),
      button('Map', toMap, { color: 'green', icon: '🗺', id: 'ending-map' }),
    ),
  );

  const root = el(
    'div',
    { class: 'ending-screen fade-in', 'data-testid': 'ending', 'data-fastclick': true },
    art('img/scenes/ending.webp', 'ending-art', () => el('div', { class: 'ending-sky' })),
    el('div', { class: 'ending-shade' }),
    floatingNotes(10),
    flower(0, 'end-flower a'),
    flower(1, 'end-flower b'),
    theme,
    tapHint,
    finale,
  );

  // Show paragraph n and read it; the next one follows when the clip ends.
  // Without a clip (or with voices off) a reading-length timer paces it.
  const show = (n: number) => {
    step = n;
    const mine = ++run;
    paras.forEach((p, i) => p.classList.toggle('in', i === n));
    root.classList.toggle('theme-last', n === ENDING.length - 1);
    clearTimeout(timer);
    const next = () => {
      if (mine !== run) return;
      if (n < ENDING.length - 1) show(n + 1);
      else timer = window.setTimeout(showFinale, 1400);
    };
    const text = ENDING[n];
    if (save.data.settings.voice && audio.hasVoice('narrator', text)) {
      const t0 = performance.now();
      void audio.speak(text, { who: 'narrator', tts: false }).then(() => {
        if (mine !== run) return;
        timer = window.setTimeout(next, Math.max(700, MIN_SHOW_MS - (performance.now() - t0)));
      });
    } else {
      timer = window.setTimeout(next, Math.max(3400, text.length * 55));
    }
  };
  const showFinale = () => {
    if (root.classList.contains('final')) return;
    run++;
    audio.stopSpeaking();
    clearTimeout(timer);
    root.classList.add('final');
    root.append(confetti(46, true));
    audio.sfx('win');
  };
  root.addEventListener('click', (e) => {
    if (root.classList.contains('final') || (e.target as HTMLElement).closest('button')) return;
    audio.sfx('page');
    run++; // the clip's end must not advance a second time
    audio.stopSpeaking();
    if (step < ENDING.length - 1) show(step + 1);
    else showFinale();
  });

  app.show({
    el: root,
    destroy: () => {
      run++;
      clearTimeout(timer);
      audio.stopSpeaking();
      audio.stopPreview();
    },
  });
  show(0);
}
