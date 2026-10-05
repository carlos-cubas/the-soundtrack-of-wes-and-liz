/** Result card after a game: a celebration on a win, a gentle retry on a loss. */
import { app } from '../core/app';
import { audio } from '../core/audio';
import { save } from '../core/save';
import { SPEAKER_NAMES, type LevelDef } from '../data/story';
import type { GameResult } from '../games/types';
import { art, confetti, portrait, starRow, tape } from '../ui/decor';
import { button, el } from '../ui/dom';
import { icon } from '../ui/icons';

function heroOf(level: LevelDef): string | null {
  if (level.playAs === 'frog') return null;
  return level.year === '2011' ? `${level.playAs}-kid` : level.playAs;
}

export function showResult(level: LevelDef, r: GameResult): Promise<'retry' | 'continue' | 'map'> {
  return new Promise((resolve) => {
    const win = r.outcome !== 'lose';
    const alt = r.outcome === 'alt';
    audio.stopMusic();
    audio.sfx(win ? 'win' : 'lose');

    const title = win ? (alt ? 'Ouch!' : level.kind === 'boss' ? 'You did it!' : level.kind === 'side' ? 'Quest complete!' : 'Level complete!') : 'Not quite…';
    const first = win && save.data.levels[level.id]?.plays === 1;
    const gain = level.kind === 'side' ? 15 : level.kind === 'boss' ? 0 : 10;

    let who: string | null;
    let mood: string | undefined;
    let line = r.summary ?? '';
    if (win) {
      who = heroOf(level);
      mood = alt ? 'sad' : 'happy';
    } else if (level.failLine) {
      who = level.failLine.who;
      mood = level.failLine.mood;
    } else {
      who = heroOf(level);
      mood = 'sad';
    }
    const failText = !win ? level.failLine?.text ?? 'So close. Give it another go!' : '';

    const actions = win
      ? [button('Continue', () => resolve('continue'), { color: 'green', icon: '▶', id: 'result-continue' })]
      : [
          button('Map', () => resolve('map'), { color: 'gray', icon: '🗺', id: 'result-map' }),
          button('Try again', () => resolve('retry'), { color: 'green', icon: '↻', id: 'result-retry' }),
        ];

    const card = el(
      'div',
      { class: `paper result-card ${win ? 'win' : 'lose'} pop-in` },
      tape('result-tape'),
      el('div', { class: 'result-kicker' }, `${level.label} · ${level.title}`),
      el('h2', { class: 'brush-title result-title' }, title),
      r.stars !== undefined ? starRow(r.stars, 'result-stars') : null,
      !win
        ? el(
            'div',
            { class: 'result-bubble' },
            who ? el('b', {}, SPEAKER_NAMES[who as keyof typeof SPEAKER_NAMES] || '') : null,
            el('span', {}, failText),
          )
        : null,
      line ? el('p', { class: 'result-line' }, line) : null,
      first && gain ? el('div', { class: 'result-heart' }, icon('heart', { fill: 'currentColor' }), `Libby's heart +${gain}%`) : null,
      el('div', { class: 'row result-actions' }, ...actions),
    );

    const root = el(
      'div',
      { class: `result-screen paper-screen fade-in ${win ? 'win' : 'lose'}`, 'data-testid': 'result' },
      art(level.scene, 'result-scene'),
      el('div', { class: 'result-shade' }),
      win && !alt ? confetti(40, true) : null,
      el(
        'div',
        { class: 'result-layout' },
        who
          ? portrait(who, mood, 'result-portrait')
          : art('img/sprites/frog.png', 'result-portrait frog', () => el('span', { class: 'initial-badge', style: '--c:#4f9d3a' }, el('b', {}, 'F')), { fit: 'contain' }),
        card,
      ),
    );
    app.show({ el: root });
  });
}
