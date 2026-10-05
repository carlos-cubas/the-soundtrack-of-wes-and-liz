/**
 * Level 4: Dress to Impress. Wes picks outfits for Liz at the mall, three
 * themed rounds of two minutes each, and Jocelyn judges every look out of
 * five stars. Five stars in at least two rounds earns her blessing.
 *
 * Mostly DOM: a paper doll (SVG layers, doll.ts) on the left, the wardrobe
 * on the right. The canvas only paints the boutique behind them.
 */
import './l4.css';
import { asset, button, el } from '../../ui/dom';
import type { GameHost, GameResult, MiniGame, MiniGameFactory } from '../types';
import { HEAD_T, VIEWBOX, bodySvg, faceSvg, headScaled, headSvg, nextUid, outfitLayers, thumbSvg } from './doll';
import { jocelynSvg, type Mood } from './jocelyn';
import { THEMES, judge, type Verdict } from './judge';
import {
  CATEGORIES,
  LAYERS,
  emptyOutfit,
  item,
  itemsIn,
  outfitFrom,
  outfitToSpec,
  takeOff,
  wear,
  wearing,
  worn,
  type Category,
  type Layer,
  type Outfit,
  type OutfitSpec,
} from './wardrobe';

const ROUND_TIME = 120;
const ROUNDS = THEMES.length;
const NEED_FIVES = 2;
/** Verdict card timing (seconds): first star, then one star per gap. */
const STAR_DELAY = 0.35;
const STAR_GAP = 0.26;
const BG = 'img/bg/l4-mall.webp';
const PORTRAIT: Record<Mood, string> = {
  neutral: 'img/portraits/jocelyn.webp',
  happy: 'img/portraits/jocelyn-happy.webp',
  mad: 'img/portraits/jocelyn-mad.webp',
};
const SVG_NS = 'http://www.w3.org/2000/svg';
/**
 * The UI is laid out in phone pixels. A taller frame (an iPad, letterboxed by
 * core/stage) gets the same layout at this logical height, scaled up evenly.
 */
const LAYOUT_H = 400;
const SCALE_ABOVE_H = 480;

const ICON = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const TAB_ICONS: Record<Category, string> = {
  hair: ICON('<path d="M12 2C6.5 2 4.5 6.5 4.5 11c0 4-1.5 6.5-2.5 9 3 1 5.5 0 6.5-2.5V11c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5v6.5c1 2.5 3.5 3.5 6.5 2.5-1-2.5-2.5-5-2.5-9C19.5 6.5 17.5 2 12 2Z" fill="currentColor"/>'),
  top: ICON('<path d="M8 3 3 6l2 5 2-1v11h10V10l2 1 2-5-5-3q-4 3-8 0Z" fill="currentColor"/>'),
  bottom: ICON('<path d="M6 3h12l1.5 18H14l-2-11-2 11H4.5Z" fill="currentColor"/>'),
  dress: ICON('<path d="M9 2v4l-2 5-3 10h16l-3-10-2-5V2h-2q-1 3-2 0Z" fill="currentColor"/>'),
  shoes: ICON('<path d="M3 16V9h5l3 3 7 1q4 1 3 5H3Z" fill="currentColor"/>'),
  extra: ICON('<path d="M12 12 4 6v12Zm0 0 8-6v12Z" fill="currentColor"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>'),
};
/** Where sparkles burst when a piece goes on, as % of the doll box height. */
const SPARKLE_Y: Record<Category, number> = { hair: 12, top: 38, bottom: 62, dress: 50, shoes: 93, extra: 42 };

const factory: MiniGameFactory = () => {
  let host: GameHost;
  let round = 0;
  let phase: 'dress' | 'judging' | 'done' = 'dress';
  let timeLeft = ROUND_TIME;
  let lastSecond = -1;
  let lastShown = -1;
  let outfit: Outfit = emptyOutfit();
  const results: Verdict[] = [];
  let tab: Category = 'top';
  let focus: Partial<Record<Category, string>> = {};
  const lastVariant: Record<string, number> = {};
  const timeouts = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timeouts.delete(id);
      fn();
    }, ms);
    timeouts.add(id);
  };
  /** The verdict card's star reveal, driven by update() so it waits while paused. */
  let reveal: { t: number; shown: number; stars: HTMLElement[]; v: Verdict; done: () => void } | null = null;

  // ---- DOM ----
  let root: HTMLElement;
  let themeEl: HTMLElement;
  let dollBox: HTMLElement;
  let dollInner: SVGGElement;
  let paintEl: SVGGElement;
  const layerEls: Partial<Record<Layer, SVGGElement>> = {};
  let tabsEl: HTMLElement;
  let gridEl: HTMLElement;
  let swatchEl: HTMLElement;
  let footLabel: HTMLElement;
  let panelEl: HTMLElement;
  let judgeEl: HTMLElement | null = null;
  /** Mouse players read "Click", phones keep "Tap". */
  const TAP = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches ? 'Click' : 'Tap';

  const theme = () => THEMES[round];

  function build() {
    themeEl = el('div', { class: 'l4-theme', 'data-testid': 'l4-theme' });

    // paper doll
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', VIEWBOX);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Liz');
    dollInner = document.createElementNS(SVG_NS, 'g');
    dollInner.setAttribute('class', 'l4-sway');
    for (const l of LAYERS) {
      const g = document.createElementNS(SVG_NS, 'g');
      if (headScaled(l)) g.setAttribute('transform', HEAD_T);
      layerEls[l] = g;
      dollInner.appendChild(g);
    }
    layerEls.body!.innerHTML = bodySvg();
    // the face keeps its own static group so the blink animation never restarts
    layerEls.face!.innerHTML = `<g>${headSvg()}${faceSvg()}</g><g></g>`;
    paintEl = layerEls.face!.lastElementChild as SVGGElement;
    svg.appendChild(dollInner);
    dollBox = el('div', { class: 'l4-doll-box', 'data-testid': 'l4-doll' });
    dollBox.appendChild(svg);
    const stage = el('div', { class: 'l4-stage' }, el('div', { class: 'l4-mirror' }), el('div', { class: 'l4-rug' }), dollBox);

    // wardrobe
    tabsEl = el('div', { class: 'l4-tabs', role: 'tablist' });
    for (const c of CATEGORIES) {
      const b = el('button', { class: 'l4-tab', role: 'tab', 'data-testid': `l4-tab-${c.id}`, 'aria-label': c.label, html: TAB_ICONS[c.id] }, el('span', {}, c.label));
      b.addEventListener('click', () => selectTab(c.id));
      tabsEl.appendChild(b);
    }
    // Left/Right arrows move between tabs (keyboard players)
    tabsEl.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const i = CATEGORIES.findIndex((c) => c.id === tab);
      const n = CATEGORIES[(i + (e.key === 'ArrowRight' ? 1 : CATEGORIES.length - 1)) % CATEGORIES.length].id;
      selectTab(n);
      (tabsEl.querySelector(`[data-testid="l4-tab-${n}"]`) as HTMLElement | null)?.focus();
    });
    gridEl = el('div', { class: 'l4-grid scrollable', 'data-testid': 'l4-grid' });
    swatchEl = el('div', { class: 'l4-swatches', 'data-testid': 'l4-swatches' });
    footLabel = el('div', { class: 'l4-foot-label' });
    const reset = el('button', {
      class: 'l4-reset',
      'aria-label': 'Start over',
      title: 'Start over',
      'data-testid': 'l4-reset',
      html: ICON('<path d="M5 12a7 7 0 1 0 2.1-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M4 3.5v5h5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
    });
    reset.addEventListener('click', () => {
      if (phase !== 'dress') return;
      host.audio.sfx('back');
      outfit = emptyOutfit();
      focus = {};
      refreshAll();
    });
    const submit = button('Show Jocelyn', () => submit_('button'), { color: 'green', icon: '✓', id: 'l4-submit' });
    submit.classList.add('l4-submit');
    const panel = (panelEl = el(
      'div',
      { class: 'l4-panel paper' },
      el('div', { class: 'tape l4-tape-l' }),
      el('div', { class: 'tape l4-tape-r' }),
      tabsEl,
      gridEl,
      el('div', { class: 'l4-foot' }, swatchEl, footLabel, reset, submit),
    ));

    root = el('div', { class: 'l4', 'data-testid': 'l4-root' }, themeEl, stage, panel);
    // Core input cancels Space at the window, which would stop Space pressing a focused button.
    root.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && (e.target as HTMLElement).closest('button')) e.stopPropagation();
    });
    host.dom.appendChild(root);
    fitScale();
    offResize = host.stage.onResize(fitScale);
  }

  let offResize: (() => void) | null = null;
  let pausedFocus: string | null = null;
  function fitScale() {
    const { width, height } = host.dom.getBoundingClientRect();
    const k = height > SCALE_ABOVE_H ? height / LAYOUT_H : 1;
    root.classList.toggle('scaled', k > 1);
    root.style.width = k > 1 ? `${width / k}px` : '';
    root.style.height = k > 1 ? `${height / k}px` : '';
    root.style.transform = k > 1 ? `scale(${k})` : '';
  }

  // ---- rendering ----

  function refreshDoll() {
    const layers = outfitLayers(outfit, nextUid());
    for (const l of LAYERS) {
      if (l === 'body') continue;
      const target = l === 'face' ? paintEl : layerEls[l]!;
      target.innerHTML = layers[l] ?? '';
    }
  }

  /** The item the colour swatches act on: last tapped in this tab, else what's worn. */
  function focusId(): string | null {
    const f = focus[tab];
    if (f && (wearing(outfit, f) || item(f).cat === tab)) return f;
    const w = worn(outfit).filter((p) => item(p.id).cat === tab);
    return w.length ? w[w.length - 1].id : null;
  }

  function selectTab(c: Category) {
    if (tab === c || phase !== 'dress') return;
    host.audio.sfx('tap');
    tab = c;
    gridEl.scrollTop = 0;
    refreshPanel();
  }

  /** testid of the focused control if it's one of ours (so a rebuild can hand focus back). */
  function focusedTestId(): string | null {
    const a = document.activeElement as HTMLElement | null;
    return a && root.contains(a) ? (a.dataset.testid ?? null) : null;
  }

  function refocus(testid: string | null) {
    if (testid) (root.querySelector(`[data-testid="${testid}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
  }

  function refreshPanel() {
    const had = focusedTestId();
    for (const b of tabsEl.children) {
      const id = (b as HTMLElement).dataset.testid!.replace('l4-tab-', '') as Category;
      b.classList.toggle('on', id === tab);
      b.setAttribute('aria-selected', String(id === tab));
      b.classList.toggle('worn', id !== 'hair' && worn(outfit).some((p) => item(p.id).cat === id));
    }

    gridEl.replaceChildren(
      ...itemsIn(tab).map((it) => {
        const w = wearing(outfit, it.id);
        const vi = w?.v ?? lastVariant[it.id] ?? 0;
        const tile = el(
          'button',
          {
            class: `l4-tile${w ? ' on' : ''}`,
            'data-testid': `l4-item-${it.id}`,
            'aria-pressed': String(!!w),
            'aria-label': `${it.name}${it.variants.length > 1 ? `, ${it.variants[vi].name}` : ''}`,
          },
          el('div', { class: 'th', html: thumbSvg(it, vi) }),
          el('div', { class: 'nm' }, it.name),
          it.special ? el('div', { class: 'sticker' }, "Wes's pick") : null,
        );
        tile.addEventListener('click', () => onTile(it.id));
        return tile;
      }),
    );

    const fid = focusId();
    const focused = fid ? item(fid) : null;
    const w = fid ? wearing(outfit, fid) : null;
    const cur = focused ? (w?.v ?? lastVariant[focused.id] ?? 0) : 0;
    const many = !!focused && focused.variants.length > 1;
    swatchEl.replaceChildren(
      ...(many
        ? focused!.variants.map((vr, i) => {
            const [a, b] = vr.c;
            const bg = b ? `linear-gradient(135deg, ${a} 50%, ${b} 50%)` : a;
            const sw = el('button', { class: `l4-sw${i === cur ? ' on' : ''}`, 'aria-label': vr.name, title: vr.name, 'data-testid': `l4-var-${i}` }, el('i', { style: `background:${bg}` }));
            sw.addEventListener('click', () => onSwatch(focused!.id, i));
            return sw;
          })
        : []),
    );
    let hint = tab === 'extra' ? 'One of each kind' : 'to try it on';
    if (focused) hint = !w ? `${TAP} to try it on` : focused.cat !== 'hair' ? `${TAP} again to take off` : many ? 'Pick a color' : 'Or try another style';
    footLabel.replaceChildren(
      el('b', {}, focused ? `${focused.name}${many ? ` · ${focused.variants[cur].name}` : ''}` : tab === 'extra' ? 'Mix and match' : `${TAP} a piece`),
      el('small', {}, hint),
    );
    refocus(had);
  }

  function refreshAll() {
    refreshDoll();
    refreshPanel();
  }

  function refreshTheme() {
    const th = theme();
    themeEl.replaceChildren(
      el('div', { class: 'tape' }),
      el('div', { class: 'l4-theme-t' }, el('span', { class: 'l4-theme-k' }, `Round ${round + 1} of ${ROUNDS}`), th.title),
      el('div', { class: 'l4-theme-s' }, `${th.sub} · ${th.hint}`),
    );
    themeEl.classList.remove('pop');
    void themeEl.offsetWidth;
    themeEl.classList.add('pop');
  }

  function bounce(cat: Category) {
    dollBox.classList.remove('bounce');
    void dollBox.offsetWidth;
    dollBox.classList.add('bounce');
    for (let i = 0; i < 5; i++) {
      const s = el('span', {
        class: 'l4-sparkle',
        style: `left:${18 + Math.random() * 64}%;top:${SPARKLE_Y[cat] + (Math.random() - 0.5) * 14}%;animation-delay:${i * 50}ms;color:${i % 2 ? '#ffe80f' : '#f7768e'}`,
      }, '✦');
      dollBox.appendChild(s);
      later(() => s.remove(), 900);
    }
  }

  // ---- interaction ----

  function onTile(id: string) {
    if (phase !== 'dress') return;
    const it = item(id);
    focus[tab] = id;
    const w = wearing(outfit, id);
    if (w && it.cat !== 'hair') {
      outfit = takeOff(outfit, id);
      host.audio.sfx('back');
    } else if (!w) {
      outfit = wear(outfit, { id, v: lastVariant[id] ?? 0 });
      host.audio.sfx('grab');
      bounce(it.cat);
    } else {
      host.audio.sfx('tap');
    }
    refreshAll();
  }

  function onSwatch(id: string, v: number) {
    if (phase !== 'dress') return;
    lastVariant[id] = v;
    outfit = wear(outfit, { id, v });
    host.audio.sfx('tap');
    bounce(item(id).cat);
    refreshAll();
  }

  // ---- rounds ----

  function startRound(i: number) {
    round = i;
    phase = 'dress';
    timeLeft = ROUND_TIME;
    lastSecond = -1;
    lastShown = -1;
    outfit = emptyOutfit();
    focus = {};
    for (const k of Object.keys(lastVariant)) delete lastVariant[k];
    tab = 'top';
    gridEl.scrollTop = 0;
    const fromVerdict = focusedTestId() === 'l4-next';
    panelEl.inert = false;
    judgeEl?.remove();
    judgeEl = null;
    reveal = null;
    refreshTheme();
    refreshAll();
    if (fromVerdict) refocus('l4-tab-top');
    host.hud.setTimer(timeLeft, 10);
    host.banner(`Round ${i + 1}!`);
  }

  const fives = () => results.filter((r) => r.stars === 5).length;
  /** Decided: either the last round is done or two fives are out of reach. */
  const decided = () => results.length === ROUNDS || fives() + (ROUNDS - results.length) < NEED_FIVES;

  function submit_(why: 'button' | 'time' | 'debug') {
    if (phase !== 'dress') return;
    phase = 'judging';
    if (why === 'time') host.toast("Time's up!");
    host.audio.sfx('camera');
    const v = judge(outfit, theme());
    results.push(v);
    showVerdict(v);
  }

  function portrait(mood: Mood): HTMLElement {
    const path = host.image(PORTRAIT[mood]) ? PORTRAIT[mood] : host.image(PORTRAIT.neutral) ? PORTRAIT.neutral : null;
    if (path) return el('img', { src: asset(path), alt: 'Jocelyn', draggable: 'false' });
    return el('div', { class: 'l4-jo-svg', html: jocelynSvg(mood) });
  }

  function showVerdict(v: Verdict) {
    const th = theme();
    const stars = Array.from({ length: 5 }, (_, i) => el('span', { class: `l4-star${i < v.stars ? ' got' : ''}` }, '★'));
    const bubble = el('div', { class: 'l4-bubble', 'data-testid': 'l4-comment' }, v.comment);
    const checks = el(
      'ul',
      { class: 'l4-checks' },
      ...v.checks.map((c) => el('li', { class: c.ok ? 'ok' : 'no' }, el('b', {}, c.label), el('span', {}, c.why))),
    );
    const tally = el(
      'div',
      { class: 'l4-tally' },
      ...THEMES.map((_, i) => {
        const r = results[i];
        return el('span', { class: r ? (r.stars === 5 ? 'five' : 'done') : '' }, r ? `R${i + 1} ${r.stars}★` : `R${i + 1} –`);
      }),
    );
    const end = decided();
    const won = fives() >= NEED_FIVES;
    const verdict = end
      ? el('div', { class: `l4-verdict ${won ? 'yes' : 'no'}`, 'data-testid': 'l4-verdict' }, won ? 'Blessing granted!' : 'No blessing… yet.')
      : null;
    const next = button(end ? "Jocelyn's verdict" : 'Next round', () => onNext(), { color: end && !won ? 'gray' : 'green', icon: '▶', id: 'l4-next' });
    next.style.visibility = 'hidden';

    const card = el(
      'div',
      { class: 'l4-card paper', 'data-testid': 'l4-judge', 'data-stars': v.stars },
      el('div', { class: 'tape' }),
      el('div', { class: 'l4-portrait' }, portrait(v.mood), el('div', { class: 'l4-name' }, 'Jocelyn'), tally),
      el(
        'div',
        { class: 'l4-body' },
        el('div', { class: 'l4-jhead' }, `Round ${round + 1} · ${th.title}`),
        el('div', { class: 'l4-stars', 'aria-label': `${v.stars} of 5 stars` }, ...stars),
        bubble,
        checks,
        el('div', { class: 'l4-jfoot' }, verdict, next),
      ),
    );
    judgeEl = el('div', { class: 'l4-judge' }, card);
    root.appendChild(judgeEl);
    host.hud.setTimer(null);
    // the wardrobe sits behind the card: keep keyboard focus out of it
    const hadFocus = focusedTestId() !== null;
    panelEl.inert = true;

    // reveal: stars one by one, then her comment and the scorecard (see update)
    reveal = {
      t: 0,
      shown: 0,
      stars,
      v,
      done: () => {
        bubble.classList.add('in');
        checks.classList.add('in');
        verdict?.classList.add('in');
        next.style.visibility = '';
        if (hadFocus) next.focus({ preventScroll: true });
        host.audio.sfx(end && won ? 'cheer' : v.stars === 5 ? 'perfect' : v.stars <= 2 ? 'miss' : 'pop');
        if (v.stars === 5) confetti(card);
        if (host.audio.hasVoice('jocelyn', v.comment)) void host.audio.speak(v.comment, { who: 'jocelyn' });
      },
    };
  }

  function stepReveal(dt: number) {
    if (!reveal) return;
    reveal.t += dt;
    while (reveal.shown < 5 && reveal.t >= STAR_DELAY + reveal.shown * STAR_GAP) {
      reveal.stars[reveal.shown].classList.add('in');
      if (reveal.shown < reveal.v.stars) host.audio.sfx('star');
      reveal.shown++;
    }
    if (reveal.t >= STAR_DELAY + 5 * STAR_GAP) {
      const done = reveal.done;
      reveal = null;
      done();
    }
  }

  function confetti(card: HTMLElement) {
    const colors = ['#ffe80f', '#f7768e', '#7ed2fe', '#9be3c9', '#f9b6c8'];
    for (let i = 0; i < 18; i++) {
      const c = el(
        'span',
        {
          class: 'l4-confetti',
          style: `left:${Math.random() * 100}%;color:${colors[i % colors.length]};animation-delay:${Math.random() * 300}ms;--dx:${(Math.random() - 0.5) * 80}px;--rot:${(Math.random() - 0.5) * 540}deg`,
        },
        i % 3 ? '★' : '♥',
      );
      card.appendChild(c);
      later(() => c.remove(), 2200);
    }
  }

  function onNext() {
    if (phase !== 'judging') return;
    if (decided()) finishGame();
    else startRound(round + 1);
  }

  function resultNow(): GameResult {
    const n = fives();
    const avg = results.length ? results.reduce((s, r) => s + r.stars, 0) / results.length : 1;
    const tally = results.map((r) => `${r.stars}★`).join(', ');
    return n >= NEED_FIVES
      ? { outcome: 'win', stars: Math.round(avg), score: n, flags: { allFive: n === ROUNDS }, summary: `Five stars in ${n} of ${ROUNDS} rounds (${tally}). Jocelyn approves!` }
      : { outcome: 'lose', stars: Math.max(1, Math.round(avg)), score: n, summary: `Five stars in ${n} of ${results.length} rounds. Jocelyn needs ${NEED_FIVES}.` };
  }

  function finishGame() {
    phase = 'done';
    host.finish(resultNow());
  }

  // ---- background (canvas) ----

  let bgCache: HTMLCanvasElement | null = null;
  let bgKey = '';

  function paintBoutique(c: CanvasRenderingContext2D, W: number, H: number) {
    c.fillStyle = '#fbdfe9';
    c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,0.38)';
    for (let x = 8; x < W; x += 34) c.fillRect(x, 0, 13, 316);
    c.fillStyle = '#fff4f7';
    c.fillRect(0, 0, W, 9);
    // floor
    c.fillStyle = '#f3dcc3';
    c.fillRect(0, 316, W, H - 316);
    c.fillStyle = '#fff6ef';
    c.fillRect(0, 310, W, 7);
    c.strokeStyle = 'rgba(160,110,70,0.16)';
    c.lineWidth = 1.2;
    for (let y = 334, row = 0; y < H; y += 20, row++) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      for (let x = (row % 2) * 30; x < W; x += 60) {
        c.moveTo(x, y - 20);
        c.lineTo(x, y);
      }
      c.stroke();
    }
    // string lights
    const bulbs = ['#ffe80f', '#f7768e', '#7ed2fe', '#9be3c9'];
    c.strokeStyle = 'rgba(80,70,90,0.45)';
    c.lineWidth = 1.2;
    for (let x0 = 0; x0 < W; x0 += 180) {
      c.beginPath();
      c.moveTo(x0, 56);
      c.quadraticCurveTo(x0 + 90, 86, x0 + 180, 56);
      c.stroke();
      for (let k = 1; k < 6; k++) {
        const t = k / 6;
        const x = x0 + 180 * t;
        const y = 56 + 2 * t * (1 - t) * 30 + 5;
        c.fillStyle = 'rgba(255,240,180,0.35)';
        c.beginPath();
        c.arc(x, y, 7, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = bulbs[(k + x0 / 180) % bulbs.length];
        c.beginPath();
        c.ellipse(x, y, 3, 4.2, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  function background(ctx: CanvasRenderingContext2D) {
    const { W, H, scale, dpr } = host.stage;
    const img = host.image(BG);
    const k = scale * dpr;
    const key = `${W.toFixed(1)}|${k.toFixed(2)}|${img ? 1 : 0}`;
    if (key !== bgKey || !bgCache) {
      bgCache = document.createElement('canvas');
      bgCache.width = Math.max(1, Math.ceil(W * k));
      bgCache.height = Math.max(1, Math.ceil(H * k));
      const c = bgCache.getContext('2d')!;
      c.scale(k, k);
      if (img) {
        const s = Math.max(W / img.width, H / img.height);
        c.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
        c.fillStyle = 'rgba(255,236,244,0.18)';
        c.fillRect(0, 0, W, H);
      } else {
        paintBoutique(c, W, H);
      }
      bgKey = key;
    }
    ctx.drawImage(bgCache, 0, 0, W, H);
  }

  // ---- MiniGame ----

  const game: MiniGame = {
    async init(h) {
      host = h;
      await h.load([BG, ...Object.values(PORTRAIT)]);
      h.hud.setTitle(null);
      build();
      startRound(0);
    },

    update(dt) {
      stepReveal(dt);
      if (phase !== 'dress') return;
      timeLeft = Math.max(0, timeLeft - dt);
      const shown = Math.floor(timeLeft * 10);
      if (shown !== lastShown) {
        lastShown = shown;
        host.hud.setTimer(timeLeft, 10);
      }
      const sec = Math.ceil(timeLeft);
      if (sec !== lastSecond) {
        if (sec <= 10 && sec > 0 && lastSecond !== -1) host.audio.sfx('tick');
        lastSecond = sec;
      }
      if (timeLeft <= 0) submit_('time');
    },

    render(ctx) {
      background(ctx);
    },

    onPause(paused) {
      // nothing behind the pause menu may take clicks or keyboard focus
      if (!root) return;
      if (paused) pausedFocus = focusedTestId();
      root.inert = paused;
      if (!paused) refocus(pausedFocus);
    },

    destroy() {
      for (const t of timeouts) clearTimeout(t);
      timeouts.clear();
      reveal = null;
      offResize?.();
      root?.remove();
      bgCache = null;
    },

    debugApi: () => ({
      state: () => ({
        round: round + 1,
        phase,
        theme: theme().id,
        timeLeft,
        tab,
        outfit: outfitToSpec(outfit),
        stars: phase === 'dress' ? null : results[results.length - 1]?.stars ?? null,
        results: results.map((r) => r.stars),
        preview: judge(outfit, theme()).stars,
      }),
      /** Dress Liz directly: { top: 'teamtee:0', bottom: 'jeans', shoes: 'chucks', extras: ['foamfinger'] }. */
      dress: (spec: OutfitSpec) => {
        if (phase !== 'dress') return null;
        outfit = outfitFrom(spec);
        refreshAll();
        return judge(outfit, theme()).stars;
      },
      submit: () => submit_('debug'),
      next: () => onNext(),
      setTime: (s: number) => {
        timeLeft = s;
      },
      win: () => {
        phase = 'done';
        host.finish({ outcome: 'win', stars: 5, score: 3, flags: { allFive: true }, summary: 'Debug win.' });
      },
      lose: () => {
        phase = 'done';
        host.finish({ outcome: 'lose', stars: 1, score: 0, summary: 'Debug lose.' });
      },
    }),
  };
  return game;
};

export default factory;
