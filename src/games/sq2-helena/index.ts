/**
 * Side Quest 2, "Letting Go" (deck: moving forward).
 *
 * Three puzzles in Liz's kitchen with Liz and Helena, three shared hearts,
 * a short scene between each:
 *   1. Memory match (6 pairs of old and new memories). Every 3rd miss costs a heart.
 *   2. Sliding photo puzzle, 3×3. 90 s per try; time running out costs a heart and reshuffles.
 *   3. Word puzzle: tap the words of Wes's line in order. Every 2nd wrong tap costs a heart.
 *
 * Items: cap = hint (memory: peek a pair; slide/words: highlight the next
 * move for 12 s), bat = skip the current puzzle, boombox = 30 s without
 * losing hearts, jersey = one more heart.
 */
import type { ItemId } from '../../data/story';
import { asset, el } from '../../ui/dom';
import { icon } from '../../ui/icons';
import type { GameHost, MiniGame, MiniGameFactory } from '../types';
import { Backdrop, Boombox, faceEl, floatText, FrameScale, ink, itemImg, Later, portraitPaths, roundRect, setPortrait } from '../sq1-dinner/kit';
import {
  buildDeck,
  isNextWord,
  LESSON_WORDS,
  MEMORY_CARDS,
  MISSES_PER_HEART,
  scrambleWords,
  TALK,
  WRONG_TAPS_PER_HEART,
  type TalkLine,
} from './puzzles';
import { canMove, isSolved, move, scramble, solve, SOLVED, type Board } from './slide';
import './sq2.css';

const BG = 'img/bg/sq2-kitchen.webp';
const PHOTO = 'img/puzzles/family-photo.webp';
const START_HEARTS = 3;
const SLIDE_SECONDS = 90;
const HINT_SECONDS = 12;
const PUZZLES = [
  { title: 'Memory Lane', tip: `Match the pairs. Every ${ordinal(MISSES_PER_HEART)} miss costs a heart.` },
  { title: 'The Family Photo', tip: 'Tap a piece next to the gap to slide it. 90 seconds a try.' },
  { title: 'Finding the Words', tip: `Tap the words in order. Every ${ordinal(WRONG_TAPS_PER_HEART)} wrong tap costs a heart.` },
];
const CARD_BY_ID = new Map(MEMORY_CARDS.map((c) => [c.id, c]));
const SPEAKER = { liz: 'Liz', helena: 'Helena', wes: 'Wes' } as const;

type Phase = 'loading' | 'talk' | 'between' | 'memory' | 'slide' | 'words' | 'over';

function ordinal(n: number) {
  return n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

const game: MiniGameFactory = () => {
  let host: GameHost;
  let backdrop: Backdrop;
  let boombox: Boombox;
  const later = new Later();
  const offResize: Array<() => void> = [];
  let frame: FrameScale;

  let phase: Phase = 'loading';
  let destroyed = false;
  let puzzle = 0;
  let hearts = START_HEARTS;
  let maxHearts = START_HEARTS;
  let lost = 0;
  let hintLeft = 0;

  // memory
  let deck: string[] = [];
  let matched = new Set<number>();
  let open: number[] = [];
  let misses = 0;
  let memLock = false;
  // slide
  let board: Board = SOLVED.slice();
  let slideLeft = SLIDE_SECONDS;
  let slideMoves = 0;
  let slideDone = false;
  let photoUrl = '';
  // words
  let words: string[] = [];
  let used = new Set<number>();
  let built = 0;
  let wrongTaps = 0;

  // ---- DOM ----
  const kicker = el('div', { class: 'sq2-kicker' });
  const title = el('h2', { class: 'sq2-title title-text' });
  const tip = el('div', { class: 'sq2-tip' });
  const extra = el('div', { class: 'sq2-extra' });
  const heading = el('div', { class: 'sq2-heading', 'data-testid': 'sq2-heading', style: 'display:none' }, kicker, title);
  const side = el('div', { class: 'sq2-side' }, heading, tip, extra);
  const boardEl = el('div', { class: 'sq2-board' });
  const talkImg = el('img', { class: 'sq2-talk-portrait', alt: '', draggable: 'false' });
  const talkName = el('div', { class: 'sq2-talk-name' });
  const talkText = el('div', { class: 'sq2-talk-text', 'data-testid': 'sq2-talk-text' });
  const talkNext = el('button', { class: 'btn green sq2-talk-next', 'data-testid': 'sq2-next' }, 'Next', icon('play', { fill: 'currentColor' }));
  const talk = el(
    'div',
    { class: 'sq2-talk', 'data-testid': 'sq2-talk', style: 'display:none' },
    talkImg,
    el('div', { class: 'paper sq2-talk-card' }, el('div', { class: 'tape' }), talkName, talkText, talkNext),
  );
  const flash = el('div', { class: 'sq2-flash' });
  const root = el('div', { class: 'sq2', 'data-testid': 'sq2' }, side, boardEl, talk, flash);
  // a wrong tap's shake (and tint) clears once it has played
  root.addEventListener('animationend', (e) => (e.target as HTMLElement).classList?.remove('nope', 'pop-in'));

  // ------------------------------------------------------------ talk
  let lines: TalkLine[] = [];
  let lineAt = 0;
  let afterTalk: () => void = () => {};

  function say(list: TalkLine[], then: () => void) {
    phase = 'talk';
    lines = list;
    lineAt = 0;
    afterTalk = then;
    host.hud.setTimer(null);
    talk.style.display = '';
    talk.classList.remove('fade-in');
    void talk.offsetWidth;
    talk.classList.add('fade-in');
    showLine();
  }

  function showLine() {
    const l = lines[lineAt];
    talkImg.className = `sq2-talk-portrait who-${l.who}`;
    setPortrait(talkImg, host, l.who, l.mood);
    talkName.textContent = SPEAKER[l.who];
    talkText.textContent = l.text;
  }

  function nextLine() {
    if (phase !== 'talk') return;
    host.audio.sfx('page');
    lineAt++;
    if (lineAt < lines.length) return showLine();
    talk.style.display = 'none';
    afterTalk();
  }
  talk.addEventListener('click', nextLine);

  // ------------------------------------------------------------ shared
  function header(p: number) {
    puzzle = p;
    heading.style.display = '';
    kicker.textContent = `Puzzle ${p + 1} of 3`;
    title.textContent = PUZZLES[p].title;
    tip.textContent = PUZZLES[p].tip;
    hintLeft = 0;
    extra.replaceChildren();
    boardEl.replaceChildren();
    boardEl.className = 'sq2-board';
    host.banner(`Puzzle ${p + 1}!`);
  }

  /** A mistake that costs a heart (unless the boombox is playing). Returns false if the game ended. */
  function hurt(saved: Array<Node | string> = [itemImg('boombox'), 'Boombox! No heart lost']): boolean {
    if (boombox.active) {
      floatText(boardEl, ...saved);
      return true;
    }
    hearts--;
    lost++;
    host.hud.setLives(hearts, maxHearts);
    flash.classList.remove('on');
    void flash.offsetWidth;
    flash.classList.add('on');
    host.audio.sfx('hit');
    if (hearts <= 0) {
      lose();
      return false;
    }
    return true;
  }

  function solved() {
    hintLeft = 0;
    host.audio.sfx('perfect');
    const p = puzzle;
    phase = 'between'; // freeze input until the next scene starts
    later.after(1.3, () => {
      if (phase !== 'between') return;
      if (p === 0) say(TALK.afterMemory, startSlide);
      else if (p === 1) say(TALK.afterSlide, startWords);
      else win();
    });
  }

  function fit() {
    // measured on screen (scaled), sized in design px
    const box = boardEl.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const r = { width: box.width / frame.k, height: box.height / frame.k };
    const gap = 8;
    const cell = Math.floor(Math.min((r.height - gap * 2) / 3, (r.width - gap * 3) / 4));
    boardEl.style.setProperty('--cell', `${Math.max(44, cell)}px`);
    boardEl.style.setProperty('--size', `${Math.floor(Math.max(150, Math.min(r.height, r.width, 340)))}px`);
  }

  // ------------------------------------------------------------ 1. memory
  const memNote = el('div', { class: 'paper lined sq2-note', 'data-testid': 'sq2-memory-line' });
  const missEl = el('div', { class: 'sq2-misses' });

  function setNote(who: TalkLine['who'] | null, text: string, mood?: string) {
    memNote.classList.toggle('blank', !who);
    memNote.replaceChildren(
      ...(who ? [faceEl(host, who, mood, 'sq2-note-face')] : []),
      el('div', {}, who ? el('b', {}, SPEAKER[who]) : null, text),
    );
  }

  function renderMisses() {
    const k = misses % MISSES_PER_HEART;
    missEl.replaceChildren(
      el('span', {}, 'Misses'),
      ...Array.from({ length: MISSES_PER_HEART }, (_, i) => el('i', { class: i < k ? 'on' : '' })),
    );
  }

  function startMemory() {
    header(0);
    phase = 'memory';
    deck = buildDeck();
    matched = new Set();
    open = [];
    misses = 0;
    memLock = false;
    setNote(null, 'Every pair brings back a memory.');
    renderMisses();
    extra.append(missEl, memNote);
    boardEl.classList.add('memory');
    const grid = el('div', { class: 'sq2-memory' });
    deck.forEach((id, i) => {
      const c = CARD_BY_ID.get(id)!;
      const img = host.image(c.img);
      const front = img
        ? el('span', { class: 'sq2-front' }, el('img', { src: asset(c.img), alt: c.label, draggable: 'false' }), el('small', {}, c.label))
        : el('span', { class: 'sq2-front drawn' }, el('span', { class: 'initial' }, c.label.split(' ').pop()![0].toUpperCase()), el('small', {}, c.label));
      const b = el(
        'button',
        { class: 'sq2-card', 'data-testid': `sq2-card-${i}`, 'aria-label': `Card ${i + 1}`, style: `--rot:${((i * 37) % 7) - 3}deg` },
        el('span', { class: 'sq2-card-in' }, el('span', { class: 'sq2-back' }), front),
      );
      b.addEventListener('click', () => flip(i));
      grid.appendChild(b);
    });
    boardEl.appendChild(grid);
    requestAnimationFrame(fit);
  }

  const cardEl = (i: number) => boardEl.querySelector<HTMLElement>(`[data-testid="sq2-card-${i}"]`);

  function flip(i: number) {
    if (phase !== 'memory' || memLock || matched.has(i) || open.includes(i)) return;
    host.audio.sfx('tap');
    open.push(i);
    cardEl(i)?.classList.add('up');
    if (open.length < 2) return;
    const [a, b] = open;
    if (deck[a] === deck[b]) {
      open = [];
      matched.add(a).add(b);
      for (const j of [a, b]) cardEl(j)?.classList.add('matched');
      const c = CARD_BY_ID.get(deck[a])!;
      setNote(c.who, c.line, c.mood);
      memNote.classList.remove('pop-in');
      void memNote.offsetWidth;
      memNote.classList.add('pop-in');
      host.audio.sfx('collect');
      if (matched.size === deck.length) solved();
      return;
    }
    misses++;
    renderMisses();
    host.audio.sfx('miss');
    memLock = true;
    if (misses % MISSES_PER_HEART === 0 && !hurt()) return;
    later.after(0.85, () => {
      if (phase !== 'memory') return; // skipped with the bat meanwhile
      for (const j of [a, b]) cardEl(j)?.classList.remove('up');
      open = [];
      memLock = false;
    });
  }

  /** Cap: flash a matching pair (the partner of the open card, if one is open). */
  function peekPair(): boolean {
    if (memLock) return false;
    const target = open.length === 1 ? deck[open[0]] : deck.find((_, i) => !matched.has(i));
    if (!target) return false;
    const pair = deck.map((id, i) => (id === target && !matched.has(i) && !open.includes(i) ? i : -1)).filter((i) => i >= 0);
    memLock = true;
    for (const j of pair) cardEl(j)?.classList.add('up', 'peek');
    later.after(1.5, () => {
      for (const j of pair) cardEl(j)?.classList.remove('peek');
      if (phase !== 'memory') return; // skipped with the bat meanwhile
      for (const j of pair) cardEl(j)?.classList.remove('up');
      memLock = false;
    });
    return true;
  }

  // ------------------------------------------------------------ 2. slide
  const moveEl = el('div', { class: 'sq2-misses' });

  function startSlide() {
    header(1);
    phase = 'slide';
    slideMoves = 0;
    slideDone = false;
    const ref = el('div', { class: 'polaroid sq2-ref' }, el('img', { src: photoUrl, alt: 'The family photo' }), el('span', {}, 'Dad, Helena & me'));
    extra.append(moveEl, ref);
    boardEl.classList.add('slide');
    const frame = el('div', { class: 'sq2-slide', 'data-testid': 'sq2-slide' });
    for (let v = 1; v <= 9; v++) {
      const home = v - 1;
      const t = el(
        'button',
        {
          class: `sq2-tile${v === 9 ? ' last' : ''}`,
          'data-testid': `sq2-tile-${v}`,
          'aria-label': `Piece ${v}`,
          style: `background-image:url("${photoUrl}");background-position:${(home % 3) * 50}% ${Math.floor(home / 3) * 50}%`,
        },
        v === 9 ? null : el('span', {}, String(v)),
      );
      if (v !== 9) t.addEventListener('click', () => slideTile(v));
      frame.appendChild(t);
    }
    boardEl.appendChild(frame);
    reshuffle();
    requestAnimationFrame(fit);
  }

  function reshuffle() {
    board = scramble(20 + Math.floor(Math.random() * 11));
    slideLeft = SLIDE_SECONDS;
    placeTiles();
  }

  function placeTiles() {
    board.forEach((v, cell) => {
      if (!v) return;
      const t = boardEl.querySelector<HTMLElement>(`[data-testid="sq2-tile-${v}"]`);
      t?.style.setProperty('--x', String(cell % 3));
      t?.style.setProperty('--y', String(Math.floor(cell / 3)));
    });
    moveEl.textContent = `Moves: ${slideMoves}`;
    markSlideHint();
  }

  function slideTile(v: number) {
    if (phase !== 'slide' || slideDone) return;
    const cell = board.indexOf(v);
    if (!canMove(board, cell)) {
      const t = boardEl.querySelector<HTMLElement>(`[data-testid="sq2-tile-${v}"]`);
      t?.classList.remove('nope');
      void t?.offsetWidth;
      t?.classList.add('nope');
      return;
    }
    board = move(board, cell)!;
    slideMoves++;
    host.audio.sfx('swish');
    placeTiles();
    if (isSolved(board)) finishSlide();
  }

  function finishSlide() {
    slideDone = true;
    host.hud.setTimer(null);
    boardEl.querySelector('.sq2-slide')?.classList.add('done');
    solved();
  }

  function markSlideHint() {
    boardEl.querySelectorAll('.sq2-tile.hint').forEach((t) => t.classList.remove('hint'));
    if (hintLeft <= 0 || phase !== 'slide' || slideDone) return;
    const next = solve(board)?.[0];
    if (next !== undefined) boardEl.querySelector(`[data-testid="sq2-tile-${board[next]}"]`)?.classList.add('hint');
  }

  // ------------------------------------------------------------ 3. words
  const strip = el('div', { class: 'paper lined sq2-strip', 'data-testid': 'sq2-sentence' });
  const wrongEl = el('div', { class: 'sq2-misses' });

  function renderWrong() {
    const k = wrongTaps % WRONG_TAPS_PER_HEART;
    wrongEl.replaceChildren(
      el('span', {}, 'Oops'),
      ...Array.from({ length: WRONG_TAPS_PER_HEART }, (_, i) => el('i', { class: i < k ? 'on' : '' })),
    );
  }

  function startWords() {
    header(2);
    phase = 'words';
    words = scrambleWords();
    used = new Set();
    built = 0;
    wrongTaps = 0;
    renderWrong();
    extra.append(wrongEl, el('div', { class: 'polaroid sq2-wes' }, faceEl(host, 'wes', 'happy', 'square'), el('span', {}, 'Wes, choosing his words')));
    boardEl.classList.add('words');
    strip.replaceChildren(...LESSON_WORDS.map(() => el('span', { class: 'slot' })));
    const pool = el('div', { class: 'sq2-pool' });
    const fonts = ['f-marker', 'f-serif', 'f-hand', 'f-serif', 'f-marker', 'f-hand'];
    words.forEach((w, i) => {
      const b = el(
        'button',
        { class: `sq2-word ${fonts[i % fonts.length]}`, 'data-testid': `sq2-word-${i}`, 'data-word': w, style: `--rot:${((i * 53) % 9) - 4}deg` },
        w,
      );
      b.addEventListener('click', () => tapWord(i));
      pool.appendChild(b);
    });
    boardEl.append(strip, pool);
    markWordSlots();
  }

  function markWordSlots() {
    strip.querySelectorAll('.slot').forEach((s, i) => s.classList.toggle('next', i === built));
    boardEl.querySelectorAll('.sq2-word.hint').forEach((t) => t.classList.remove('hint'));
    if (hintLeft > 0 && phase === 'words') {
      const i = words.findIndex((w, j) => !used.has(j) && isNextWord(built, w));
      if (i >= 0) boardEl.querySelector(`[data-testid="sq2-word-${i}"]`)?.classList.add('hint');
    }
  }

  function tapWord(i: number) {
    if (phase !== 'words' || used.has(i)) return;
    const b = boardEl.querySelector<HTMLElement>(`[data-testid="sq2-word-${i}"]`);
    if (isNextWord(built, words[i])) {
      used.add(i);
      b?.classList.add('used');
      const slot = strip.children[built] as HTMLElement;
      slot.textContent = LESSON_WORDS[built];
      slot.classList.add('filled');
      built++;
      host.audio.sfx('pop');
      markWordSlots();
      if (built === LESSON_WORDS.length) {
        strip.classList.add('done');
        solved();
      }
      return;
    }
    wrongTaps++;
    renderWrong();
    host.audio.sfx('error');
    b?.classList.remove('nope');
    void b?.offsetWidth;
    b?.classList.add('nope');
    if (wrongTaps % WRONG_TAPS_PER_HEART === 0) hurt();
  }

  // ------------------------------------------------------------ end
  function skipPuzzle() {
    if (phase === 'memory') {
      deck.forEach((_, i) => {
        matched.add(i);
        cardEl(i)?.classList.add('up', 'matched');
      });
      open = [];
      setNote('liz', 'Okay, okay. I remember all of them.', 'happy');
      solved();
    } else if (phase === 'slide') {
      board = SOLVED.slice();
      placeTiles();
      finishSlide();
    } else if (phase === 'words') {
      used = new Set(words.map((_, i) => i));
      boardEl.querySelectorAll('.sq2-word').forEach((b) => b.classList.add('used'));
      LESSON_WORDS.forEach((w, i) => {
        const s = strip.children[i] as HTMLElement;
        s.textContent = w;
        s.classList.add('filled');
      });
      built = LESSON_WORDS.length;
      markWordSlots();
      strip.classList.add('done');
      solved();
    }
  }

  function win() {
    if (phase === 'over') return;
    phase = 'over';
    host.hud.setTimer(null);
    host.banner('Letting go ♥');
    host.audio.sfx('star');
    later.after(1.6, () =>
      host.finish({
        outcome: 'win',
        stars: Math.max(1, 5 - lost),
        score: hearts,
        summary: lost === 0 ? 'Three puzzles, not a single heart lost.' : `Three puzzles solved with ${hearts} ${hearts === 1 ? 'heart' : 'hearts'} to spare.`,
      }),
    );
  }

  function lose() {
    if (phase === 'over') return;
    phase = 'over';
    host.hud.setTimer(null);
    talk.style.display = 'none';
    host.banner('Not yet…');
    host.audio.sfx('miss');
    later.after(1.6, () => host.finish({ outcome: 'lose', score: puzzle }));
  }

  function itemUse(item: ItemId): boolean {
    const playing = phase === 'memory' || phase === 'slide' || phase === 'words';
    switch (item) {
      case 'cap':
        if (!playing || hintLeft > 0) return false;
        if (phase === 'memory') return peekPair();
        hintLeft = HINT_SECONDS;
        if (phase === 'slide') markSlideHint();
        else markWordSlots();
        return true;
      case 'bat':
        if (!playing) return false;
        skipPuzzle();
        return true;
      case 'boombox':
        if (!playing || boombox.active) return false;
        boombox.start(30);
        root.classList.add('boom');
        return true;
      case 'jersey':
        if (!playing) return false;
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
      backdrop = new Backdrop(h, BG, drawKitchen, 0.12);
      boombox = new Boombox(h.hud);
      await h.load([
        BG,
        PHOTO,
        ...MEMORY_CARDS.map((c) => c.img),
        ...portraitPaths([['liz', 'sad'], ['liz', 'happy'], ['helena', 'happy'], ['wes', 'happy']]),
      ]);
      if (destroyed) return;
      photoUrl = h.image(PHOTO) ? asset(PHOTO) : drawFamilyPhoto();
      h.dom.appendChild(root);
      frame = new FrameScale(h, root);
      frame.apply();
      h.hud.setLives(hearts, maxHearts);
      offResize.push(
        h.stage.onResize(() => {
          frame.apply();
          requestAnimationFrame(fit);
        }),
      );
      say(TALK.intro, startMemory);
    },

    update(dt) {
      later.update(dt);
      // the boombox's thirty seconds only run during the puzzles, not the scenes between them
      if (phase === 'memory' || phase === 'slide' || phase === 'words') {
        const wasBoom = boombox.active;
        boombox.update(dt);
        if (wasBoom && !boombox.active) root.classList.remove('boom');
      }
      if (hintLeft > 0) {
        hintLeft -= dt;
        if (hintLeft <= 0) {
          markSlideHint();
          markWordSlots();
        }
      }
      if (phase === 'slide' && !slideDone) {
        slideLeft -= dt;
        host.hud.setTimer(slideLeft, 10);
        if (slideLeft <= 0) {
          if (!boombox.active) floatText(boardEl, icon('timer'), "Time's up! Reshuffling…");
          if (hurt([icon('timer'), "Time's up!", itemImg('boombox'), 'No heart lost'])) reshuffle();
        }
      }
    },

    render(ctx) {
      backdrop.render(ctx);
    },

    onItemUse: itemUse,

    destroy() {
      destroyed = true;
      later.clear();
      for (const off of offResize) off();
      boombox?.destroy();
      root.remove();
    },

    debugApi() {
      return {
        state: () => {
          const path = phase === 'slide' && !slideDone ? solve(board) : null;
          return {
            phase,
            puzzle,
            hearts,
            maxHearts,
            lost,
            line: phase === 'talk' ? lineAt : -1,
            deck: deck.slice(),
            matched: [...matched],
            misses,
            board: board.slice(),
            slideLeft,
            nextTile: path && path.length ? board[path[0]] : null,
            solutionLength: path ? path.length : null,
            words: words.slice(),
            built,
            nextWord: LESSON_WORDS[built] ?? null,
            wrongTaps,
            hintLeft,
            boombox: boombox.left,
          };
        },
        next: () => nextLine(),
        solve: () => skipPuzzle(),
        /** Run the slide puzzle's clock out on the next frame. */
        timeUp: () => {
          if (phase === 'slide' && !slideDone) slideLeft = 0.001;
        },
        win: () => win(),
        lose: () => lose(),
      };
    },
  };
};

/** Procedural kitchen for when the painted background hasn't landed: flat fills, thin ink outlines. */
function drawKitchen(c: CanvasRenderingContext2D, W: number, H: number) {
  const counterY = H * 0.7;
  ink(c);
  c.fillStyle = '#fff1c9';
  c.fillRect(0, 0, W, counterY);
  // window with curtains
  const wx = W * 0.5 - 120;
  c.fillStyle = '#fdfbf3';
  c.fillRect(wx - 10, 60, 260, 180);
  c.strokeRect(wx - 10, 60, 260, 180);
  c.fillStyle = '#7ed2fe';
  c.fillRect(wx, 70, 240, 160);
  c.strokeRect(wx, 70, 240, 160);
  c.fillStyle = '#9be3c9';
  c.beginPath();
  c.ellipse(wx + 70, 230, 90, 34, 0, Math.PI, 0);
  c.fill();
  c.stroke();
  c.fillStyle = '#f7768e';
  for (const [x, dir] of [[wx - 22, 1], [wx + 262, -1]] as const) {
    c.beginPath();
    c.moveTo(x, 54);
    c.lineTo(x + 44 * dir, 54);
    c.quadraticCurveTo(x + 18 * dir, 150, x + 34 * dir, 250);
    c.lineTo(x, 250);
    c.closePath();
    c.fill();
    c.stroke();
  }
  // upper cabinets
  for (const x of [W * 0.03, W * 0.15, W * 0.74, W * 0.86]) {
    c.fillStyle = '#9be3c9';
    c.beginPath();
    roundRect(c, x, 50, W * 0.11, 120, 8);
    c.fill();
    c.stroke();
    c.fillStyle = '#3a3340';
    c.beginPath();
    c.arc(x + W * 0.055, 150, 4, 0, Math.PI * 2);
    c.fill();
  }
  // backsplash tiles
  const t = 22;
  for (let y = counterY - 66; y < counterY; y += t)
    for (let x = 0; x < W; x += t) {
      c.fillStyle = ((x + y) / t) % 2 ? '#fdfbf3' : '#cfeefe';
      c.fillRect(x, y, t, t);
    }
  // counter + lower cabinets
  c.fillStyle = '#e8d3a8';
  c.fillRect(0, counterY - 4, W, 16);
  c.strokeRect(-2, counterY - 4, W + 4, 16);
  c.fillStyle = '#f9b6c8';
  c.fillRect(0, counterY + 12, W, H - counterY);
  for (let x = 12; x < W; x += 120) c.strokeRect(x, counterY + 26, 100, H - counterY - 40);
  // teapot on the counter
  c.fillStyle = '#2f5fd0';
  c.beginPath();
  c.ellipse(W * 0.82, counterY - 22, 26, 20, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
}

/** Drawn stand-in for the family photo (Liz, her dad, Helena): flat fills, thin ink outlines. */
function drawFamilyPhoto(): string {
  const S = 600;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d')!;
  ink(c, 4);
  c.fillStyle = '#7ed2fe';
  c.fillRect(0, 0, S, S * 0.62);
  c.fillStyle = '#9be3c9';
  c.fillRect(0, S * 0.62, S, S * 0.38);
  c.beginPath();
  c.moveTo(0, S * 0.62);
  c.lineTo(S, S * 0.62);
  c.stroke();
  c.fillStyle = '#f8de4f';
  c.beginPath();
  c.arc(510, 90, 52, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = '#fff';
  for (const [x, y] of [[90, 80], [260, 50]]) {
    c.beginPath();
    c.arc(x - 30, y + 6, 22, Math.PI * 0.5, Math.PI * 1.5);
    c.arc(x + 4, y - 10, 30, Math.PI, 0);
    c.arc(x + 44, y + 4, 22, Math.PI * 1.5, Math.PI * 0.5);
    c.closePath();
    c.fill();
    c.stroke();
  }
  c.fillStyle = '#f7768e';
  heart(c, 300, 150, 34);
  c.stroke();
  const person = (x: number, h: number, hair: string, shirt: string, skin: string, style: 'long' | 'bob' | 'short') => {
    const top = 560 - h;
    const shape = (draw: () => void, fill: string) => {
      c.fillStyle = fill;
      c.beginPath();
      draw();
      c.fill();
      c.stroke();
    };
    shape(() => roundRect(c, x - 62, top + 112, 124, h, [50, 50, 10, 10]), shirt);
    if (style === 'long') shape(() => c.ellipse(x, top + 90, 62, 92, 0, 0, Math.PI * 2), hair);
    else if (style === 'bob') shape(() => c.ellipse(x, top + 64, 58, 62, 0, 0, Math.PI * 2), hair);
    shape(() => c.arc(x, top + 60, 46, 0, Math.PI * 2), skin);
    shape(() => {
      c.ellipse(x, top + 26, 48, style === 'short' ? 22 : 26, 0, Math.PI, 0);
      c.closePath();
    }, hair);
    c.fillStyle = '#3a3340';
    c.beginPath();
    c.arc(x - 16, top + 58, 5, 0, Math.PI * 2);
    c.arc(x + 16, top + 58, 5, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(x, top + 70, 16, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
  };
  person(130, 330, '#6b4a2f', '#2f5fd0', '#f1c7a5', 'short');
  person(470, 310, '#efcb7f', '#f3ead2', '#f6d6c0', 'bob');
  person(300, 270, '#e8692f', '#f29bb0', '#f6d2b8', 'long');
  c.fillStyle = '#fdfbf3';
  for (const [x, y] of [[40, 540], [560, 520], [230, 580], [380, 585]]) {
    c.beginPath();
    c.arc(x, y, 10, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  return cv.toDataURL('image/png');
}

function heart(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath();
  c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.4, y, x - s * 0.6, y - s * 0.9, x, y - s * 0.25);
  c.bezierCurveTo(x + s * 0.6, y - s * 0.9, x + s * 1.4, y, x, y + s * 0.9);
  c.fill();
}

export default game;
