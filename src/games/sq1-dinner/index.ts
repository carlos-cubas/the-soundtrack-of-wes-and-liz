/**
 * Side Quest 1, "Not the Hollywood Version" (deck: self-acceptance).
 *
 * A date in six moments. Liz sets up each one, Wes picks one of three
 * cards: the real Wes, or a movie cliché. Clichés and freezing up (12 s
 * per moment) cost a heart; the real Wes grows her smile. A wrong card is
 * struck out and Wes gets another go, so every moment ends with the real
 * him. Three hearts.
 *
 * Items: cap = highlight the real card, bat = skip the moment as a success,
 * boombox = 30 s of free mistakes, jersey = one more heart.
 */
import type { ItemId } from '../../data/story';
import { el } from '../../ui/dom';
import { icon } from '../../ui/icons';
import type { GameHost, MiniGame, MiniGameFactory } from '../types';
import { Backdrop, Boombox, faceEl, floatText, FrameScale, ink, itemImg, Later, portraitPaths, roundRect, setPortrait } from './kit';
import { dealChoices, MOMENTS, SECONDS_PER_MOMENT, START_HEARTS, starsFor, TIMEOUT_LINES, type Choice } from './moments';
import './sq1.css';

const BG = 'img/bg/sq1-diner.webp';
const ROT = [-2.2, 1.4, -1];

type Phase = 'loading' | 'choose' | 'react' | 'done' | 'over';

const game: MiniGameFactory = (level) => {
  let host: GameHost;
  let backdrop: Backdrop;
  let boombox: Boombox;
  let frame: FrameScale;
  let offResize: (() => void) | null = null;
  const later = new Later();

  let phase: Phase = 'loading';
  let destroyed = false;
  let index = 0;
  let deal: Choice[] = [];
  let struck = new Set<number>();
  let hearts = START_HEARTS;
  let maxHearts = START_HEARTS;
  let smiles = 0;
  let slips = 0;
  let timeLeft = SECONDS_PER_MOMENT;
  let lastTick = 0;
  let hinted = false;
  let timeoutLine = 0;

  // ---- DOM ----
  const liz = el('img', { class: 'sq1-liz', alt: 'Liz', draggable: 'false' });
  const kicker = el('div', { class: 'sq1-kicker' });
  const title = el('h2', { class: 'sq1-title title-text' });
  const meter = el('div', { class: 'sq1-smile', 'data-testid': 'sq1-smile', title: "Liz's smile" }, el('span', {}, "Liz's smile"));
  const dots = MOMENTS.map(() => meter.appendChild(el('i')));
  const say = el('div', { class: 'sq1-say', 'data-testid': 'sq1-say' });
  const nextBtn = el('button', { class: 'btn green sq1-next', 'data-testid': 'sq1-next', style: 'display:none' }, 'Next', icon('play', { fill: 'currentColor' }));
  const bubble = el('div', { class: 'paper sq1-bubble' }, say, nextBtn);
  const ask = el('div', { class: 'sq1-ask' }, el('span', {}, 'What would the real Wes do?'));
  const cards = el('div', { class: 'sq1-cards' });
  const flash = el('div', { class: 'sq1-flash' });
  const root = el(
    'div',
    { class: 'sq1', 'data-testid': 'sq1' },
    el('div', { class: 'sq1-lizbox' }, liz),
    el('div', { class: 'sq1-main' }, el('div', { class: 'sq1-head' }, el('div', { class: 'sq1-heading', 'data-testid': 'sq1-heading' }, kicker, title), meter), bubble, ask, cards),
    flash,
  );

  const setLiz = (text: string, mood?: string) => {
    say.replaceChildren(el('b', {}, 'Liz'), text);
    setPortrait(liz, host, 'liz', mood);
    liz.classList.remove('bounce');
    void liz.offsetWidth;
    liz.classList.add('bounce');
  };

  const card = (i: number) => cards.children[i] as HTMLElement | undefined;

  function showMoment() {
    const m = MOMENTS[index];
    deal = dealChoices(m);
    struck = new Set();
    hinted = false;
    phase = 'choose';
    timeLeft = SECONDS_PER_MOMENT;
    lastTick = 0;
    kicker.textContent = `Moment ${index + 1} of ${MOMENTS.length}`;
    title.textContent = m.title;
    setLiz(m.setup, m.mood);
    nextBtn.style.display = 'none';
    cards.classList.remove('locked');
    cards.replaceChildren(
      ...deal.map((c, i) => {
        const b = el(
          'button',
          { class: 'sq1-card deal-in', style: `--rot:${ROT[i]}deg;animation-delay:${i * 70}ms`, 'data-testid': `sq1-choice-${i}` },
          icon(c.icon, { class: 'ico' }),
          el('span', { class: 'txt' }, c.text),
        );
        b.addEventListener('click', () => choose(i));
        b.addEventListener('animationend', (e) => e.animationName === 'sq1-deal' && b.classList.remove('deal-in'));
        return b;
      }),
    );
    later.after(0.6, () => cards.querySelectorAll('.deal-in').forEach((c) => c.classList.remove('deal-in')));
    host.hud.setTimer(timeLeft, 3);
  }

  function stamp(i: number, good: boolean, ...content: Array<Node | string>) {
    card(i)?.appendChild(el('span', { class: `sq1-stamp${good ? ' good' : ''}` }, ...content));
  }

  function choose(i: number) {
    if (phase !== 'choose' || struck.has(i) || !deal[i]) return;
    if (deal[i].real) succeed(i, 'REAL WES', icon('check'));
    else miss(i);
  }

  function succeed(i: number, ...label: Array<Node | string>) {
    phase = 'done';
    host.hud.setTimer(null);
    cards.classList.add('locked');
    deal.forEach((_, j) => card(j)?.classList.add(j === i ? 'picked' : 'faded'));
    card(i)?.classList.remove('hint');
    stamp(i, true, ...label);
    smiles++;
    dots.forEach((d, j) => d.classList.toggle('on', j < smiles));
    dots[smiles - 1]?.classList.add('pop');
    setLiz(deal[i].react, 'happy');
    host.audio.sfx('perfect');
    nextBtn.style.display = '';
  }

  function miss(i: number) {
    struck.add(i);
    card(i)?.classList.add('struck');
    stamp(i, false, 'CRINGE ALERT');
    setLiz(deal[i].react, 'mad');
    host.audio.sfx('bonk');
    slip();
  }

  function timeout() {
    setLiz(TIMEOUT_LINES[timeoutLine++ % TIMEOUT_LINES.length]);
    host.audio.sfx('error');
    slip();
  }

  /** A cliché or a freeze: costs a heart unless the boombox is playing. */
  function slip() {
    if (boombox.active) {
      floatText(cards, itemImg('boombox'), 'Boombox! No heart lost');
    } else {
      hearts--;
      slips++;
      host.hud.setLives(hearts, maxHearts);
      flash.classList.remove('on');
      void flash.offsetWidth;
      flash.classList.add('on');
      if (hearts <= 0) return lose();
    }
    phase = 'react';
    cards.classList.add('locked');
    host.hud.setTimer(SECONDS_PER_MOMENT, 3); // the fresh clock that starts after Liz's reaction
    later.after(1.6, () => {
      if (phase !== 'react') return;
      phase = 'choose';
      timeLeft = SECONDS_PER_MOMENT;
      lastTick = 0;
      cards.classList.remove('locked');
    });
  }

  function next() {
    if (phase !== 'done') return;
    host.audio.sfx('page');
    index++;
    if (index >= MOMENTS.length) return win();
    showMoment();
  }
  nextBtn.addEventListener('click', next);

  function win() {
    if (phase === 'over') return;
    phase = 'over';
    host.hud.setTimer(null);
    cards.classList.add('locked');
    host.banner('Just us. ♥');
    host.audio.sfx('star');
    later.after(1.5, () =>
      host.finish({
        outcome: 'win',
        stars: starsFor(slips),
        score: smiles,
        summary: slips === 0 ? 'Six moments, zero clichés. Just Wes being Wes.' : `Liz smiled through all six moments (${slips} cringe ${slips === 1 ? 'moment' : 'moments'}).`,
      }),
    );
  }

  function lose() {
    if (phase === 'over') return;
    phase = 'over';
    host.hud.setTimer(null);
    cards.classList.add('locked');
    host.banner('Too Hollywood!');
    host.audio.sfx('miss');
    later.after(1.6, () => host.finish({ outcome: 'lose', score: smiles }));
  }

  function itemUse(item: ItemId): boolean {
    if (phase === 'over' || phase === 'loading') return false;
    switch (item) {
      case 'cap': {
        if (phase !== 'choose' && phase !== 'react') return false;
        if (hinted) return false;
        const i = deal.findIndex((c) => c.real);
        hinted = true;
        card(i)?.classList.add('hint');
        card(i)?.appendChild(el('span', { class: 'sq1-hint' }, itemImg('cap'), 'Gut feeling'));
        return true;
      }
      case 'bat': {
        if (phase !== 'choose') return false;
        succeed(deal.findIndex((c) => c.real), itemImg('bat'), 'SKIPPED');
        return true;
      }
      case 'boombox':
        if (boombox.active || phase === 'done') return false;
        boombox.start(30);
        root.classList.add('boom');
        return true;
      case 'jersey':
        hearts++;
        maxHearts = Math.max(maxHearts, hearts);
        host.hud.setLives(hearts, maxHearts);
        return true;
    }
    return false;
  }

  return {
    async init(h) {
      host = h;
      backdrop = new Backdrop(h, BG, drawDiner);
      boombox = new Boombox(h.hud);
      await h.load([BG, ...portraitPaths([['liz', 'happy'], ['liz', 'mad'], ['liz', 'sad'], ['wes', 'happy']])]);
      if (destroyed) return;
      ask.prepend(faceEl(h, 'wes', 'happy'));
      h.dom.appendChild(root);
      frame = new FrameScale(h, root);
      frame.apply();
      offResize = h.stage.onResize(() => frame.apply());
      h.hud.setLives(hearts, maxHearts);
      showMoment();
    },

    update(dt) {
      later.update(dt);
      if (phase !== 'choose') return;
      // the boombox's thirty seconds only run while Wes can actually slip up
      const wasBoom = boombox.active;
      boombox.update(dt);
      if (wasBoom && !boombox.active) root.classList.remove('boom');
      timeLeft -= dt;
      host.hud.setTimer(timeLeft, 3);
      const whole = Math.ceil(timeLeft);
      if (whole <= 3 && whole > 0 && whole !== lastTick) {
        lastTick = whole;
        host.audio.sfx('tick');
      }
      if (timeLeft <= 0) timeout();
    },

    render(ctx) {
      backdrop.render(ctx);
    },

    onItemUse: itemUse,

    destroy() {
      destroyed = true;
      offResize?.();
      later.clear();
      boombox?.destroy();
      root.remove();
    },

    debugApi() {
      return {
        state: () => ({
          phase,
          moment: index,
          momentId: MOMENTS[index]?.id,
          hearts,
          maxHearts,
          smiles,
          slips,
          timeLeft,
          struck: [...struck],
          correct: deal.findIndex((c) => c.real),
          choices: deal.map((c) => c.text),
          boombox: boombox.left,
          hinted,
        }),
        choose: (i: number) => choose(i),
        next: () => next(),
        /** Run the moment's clock out on the next frame. */
        timeUp: () => {
          if (phase === 'choose') timeLeft = 0.001;
        },
        win: () => win(),
        lose: () => lose(),
      };
    },
  };
};

/** Procedural diner for when the painted background hasn't landed: flat fills, thin ink outlines. */
function drawDiner(c: CanvasRenderingContext2D, W: number, H: number) {
  const floorY = H * 0.74;
  ink(c);
  c.fillStyle = '#9be3c9';
  c.fillRect(0, 0, W, floorY);
  // windows with the night outside
  for (let x = W * 0.08; x < W - 120; x += 210) {
    c.fillStyle = '#fdfbf3';
    c.beginPath();
    roundRect(c, x - 6, 64, 172, 132, 18);
    c.fill();
    c.stroke();
    c.fillStyle = '#2f5fd0';
    c.beginPath();
    roundRect(c, x, 70, 160, 120, 14);
    c.fill();
    c.stroke();
    c.fillStyle = '#f8de4f';
    for (let s = 0; s < 6; s++) {
      c.beginPath();
      c.arc(x + 16 + ((s * 53) % 132), 84 + ((s * 37) % 70), 2.2, 0, Math.PI * 2);
      c.fill();
    }
  }
  // sign
  c.font = "46px 'Leckerli One', cursive";
  c.textAlign = 'center';
  c.lineWidth = 3;
  c.strokeText('Diner', W * 0.5, 248);
  c.fillStyle = '#f9b6c8';
  c.fillText('Diner', W * 0.5, 248);
  ink(c);
  // chrome strip + coral wainscot with pink panels
  c.fillStyle = '#e8eef5';
  c.fillRect(0, floorY - 70, W, 8);
  c.fillStyle = '#f7768e';
  c.fillRect(0, floorY - 62, W, 62);
  c.fillStyle = '#f9b6c8';
  for (let x = 12; x < W; x += 68) c.fillRect(x, floorY - 50, 44, 38);
  c.beginPath();
  for (const y of [floorY - 70, floorY - 62, floorY]) {
    c.moveTo(0, y);
    c.lineTo(W, y);
  }
  c.stroke();
  // checkered floor
  const t = 26;
  for (let y = floorY, r = 0; y < H; y += t, r++)
    for (let x = 0, k = r % 2; x < W; x += t, k++) {
      c.fillStyle = k % 2 ? '#2b2b3a' : '#fdfbf3';
      c.fillRect(x, y, t, t);
    }
  // booths
  c.fillStyle = '#d63a4f';
  for (let x = W * 0.04; x < W; x += W * 0.34) {
    c.beginPath();
    roundRect(c, x, floorY - 120, 130, 120, [22, 22, 4, 4]);
    c.fill();
    c.stroke();
  }
}

export default game;
