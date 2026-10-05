/**
 * Visual-novel dialogue: the scene blurred behind, speaker portraits (Wes on
 * the left, everyone else on the right), a name tag and typewriter text.
 * Tap once to finish the line, again for the next one.
 */
import { app } from '../core/app';
import { audio } from '../core/audio';
import { SPEAKER_NAMES, type DialogueLine } from '../data/story';
import { art, portrait, speakerColor } from '../ui/decor';
import { el } from '../ui/dom';
import { icon } from '../ui/icons';
import { typewriter, type Typewriter } from '../ui/typewriter';

export function portraitPath(who: string, mood?: string): string {
  return `img/portraits/${who}${mood ? '-' + mood : ''}.webp`;
}

const LEFT = new Set(['wes', 'wes-kid']);

export function showDialogue(lines: DialogueLine[], opts: { scene?: string } = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!lines.length) return resolve();
    let i = 0;
    let tw: Typewriter | null = null;
    let finished = false;
    const slots = {
      left: el('div', { class: 'dlg-slot left' }),
      right: el('div', { class: 'dlg-slot right' }),
    };
    const shown: Record<'left' | 'right', string> = { left: '', right: '' };
    const name = el('div', { class: 'dlg-name' });
    const text = el('div', { class: 'dlg-text' });
    const box = el('div', { class: 'paper dlg-box' }, name, text, el('div', { class: 'dlg-next', 'aria-hidden': 'true' }, icon('play', { fill: 'currentColor' })));
    const dots = el('div', { class: 'dlg-dots', 'aria-hidden': 'true' }, ...lines.map(() => el('i')));
    const skip = el('button', { class: 'btn gray small dlg-skip', 'data-testid': 'dialogue-skip', 'aria-label': 'Skip dialogue' }, 'Skip', icon('play', { fill: 'currentColor' }));
    const root = el(
      'div',
      { class: 'dialogue-screen fade-in', 'data-testid': 'dialogue', 'data-fastclick': true },
      opts.scene ? art(opts.scene, 'dlg-scene') : null,
      el('div', { class: 'dlg-shade' }),
      slots.left,
      slots.right,
      box,
      dots,
      skip,
    );

    const end = () => {
      if (finished) return;
      finished = true;
      tw?.cancel();
      audio.stopSpeaking();
      window.removeEventListener('keydown', onKey);
      resolve();
    };

    const setSlot = (side: 'left' | 'right', l: DialogueLine) => {
      const key = `${l.who}|${l.mood ?? ''}`;
      if (shown[side] === key) return;
      shown[side] = key;
      const p = portrait(l.who, l.mood, 'dlg-portrait enter');
      slots[side].replaceChildren(p);
    };

    const render = () => {
      const l = lines[i];
      const narrator = l.who === 'narrator';
      const side = LEFT.has(l.who) ? 'left' : 'right';
      root.classList.toggle('narrator', narrator);
      if (!narrator) setSlot(side, l);
      slots.left.classList.toggle('active', !narrator && side === 'left');
      slots.right.classList.toggle('active', !narrator && side === 'right');
      box.classList.toggle('from-right', !narrator && side === 'right');
      const full = narrator ? '' : SPEAKER_NAMES[l.who] ?? l.who;
      const m = /^(.*?)\s*\((.+)\)$/.exec(full);
      name.replaceChildren(m ? m[1] : full, m ? el('small', {}, m[2]) : '');
      name.style.setProperty('--c', speakerColor(l.who));
      dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k <= i));
      tw?.cancel();
      text.replaceChildren();
      tw = typewriter(text, [l.text], { cps: 48, tag: 'span' });
      box.classList.remove('bump');
      void box.offsetWidth;
      box.classList.add('bump');
      void audio.speak(l.text, { who: l.who, tts: false });
    };

    const advance = () => {
      if (finished) return;
      if (tw && !tw.done) return tw.finish();
      audio.sfx('page');
      i++;
      if (i >= lines.length) return end();
      render();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') {
        e.preventDefault();
        advance();
      }
    };

    root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.dlg-skip')) return;
      advance();
    });
    skip.addEventListener('click', () => {
      audio.sfx('back');
      end();
    });
    window.addEventListener('keydown', onKey);
    render();
    app.show({
      el: root,
      destroy: () => {
        tw?.cancel();
        window.removeEventListener('keydown', onKey);
      },
    });
  });
}
