/**
 * World map: Samira's hand-drawn map of the neighborhood. Tap a location
 * (deck: green button selects locations) to open its scrapbook card with
 * the level and/or side quest played there.
 *
 * The map keeps its aspect ratio: it fills the screen height (cropping a
 * hair on 16:9 phones) and sits on blue paper on wider phones. Pins live in
 * image space, so they stay on the buildings at every size.
 */
import { app } from '../core/app';
import { audio } from '../core/audio';
import { save } from '../core/save';
import { ITEMS, LEVELS, MAP_LOCS, SONGS, STORY_ORDER, type LevelId, type MapLocId } from '../data/story';
import { art, closeX, flower, tape } from '../ui/decor';
import { button, el, iconButton, modal } from '../ui/dom';
import { icon } from '../ui/icons';
import { playLevel, revealChucks } from './flow';
import { openInventory } from './inventory';
import { scenePolaroid } from './narration';
import { openSoundtrack } from './soundtrack';
import { showTitle } from './title';

const MAP_W = 2752;
const MAP_H = 1536;
/** Height of the HUD bar above the map on squarer screens (CSS .hud-bar). */
const BAR_H = 66;

const SHORT_NAMES: Record<MapLocId, string> = {
  lizHouse: "Liz's House",
  wesHouse: "Wes's House",
  gym: 'School Gym',
  wesCar: "Wesley's Car",
  stellas: "Stella's",
  mall: 'The Mall',
  ryno: "Ryno's House",
  secret: 'Secret Area',
  parking: 'Parking Spot',
};

/** Samira's hand-drawn place names, as map fractions [x0, y0, x1, y1] (the tip avoids them). */
const DRAWN_LABELS: Array<[number, number, number, number]> = [
  [0.09, 0.02, 0.2, 0.065], // School gym
  [0.355, 0.05, 0.425, 0.125], // Wesley's car
  [0.285, 0.47, 0.365, 0.6], // Secret Area
  [0.035, 0.9, 0.27, 1], // Elizabeth Buxbaum's House
  [0.42, 0.85, 0.535, 0.98], // Wesley Bennett's House
  [0.645, 0.9, 0.77, 0.975], // Ryno's House
];

/** Where each pin's label sits so it never runs off the map. */
const LABEL_SIDE: Partial<Record<MapLocId, 'right' | 'left' | 'above'>> = { parking: 'right' };
/** Small nudges (map fraction) that keep a pin clear of the home indicator. */
const PIN_NUDGE: Partial<Record<MapLocId, number>> = { parking: -0.035 };

/** ["Level 3", "Level 4", "Level 5"] → "Levels 3, 4 and 5" */
function joinLabels(labels: string[]): string {
  if (labels.length > 1 && labels.every((l) => l.startsWith('Level '))) {
    const n = labels.map((l) => l.slice(6));
    return `Levels ${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
  }
  return labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}` : labels[0] ?? '';
}

export function shortPlace(loc: MapLocId): string {
  return SHORT_NAMES[loc] ?? MAP_LOCS[loc].name;
}

export function levelsAt(loc: MapLocId): LevelId[] {
  return (Object.keys(LEVELS) as LevelId[]).filter((id) => LEVELS[id].location === loc);
}

/** The next main-story level to play, for the "next" marker. */
export function nextStoryLevel(): LevelId | null {
  return STORY_ORDER.find((id) => !save.isDone(id) && save.isUnlocked(id)) ?? null;
}

type PinState = 'locked' | 'open' | 'next' | 'done' | 'secret';

function pinIcon(id: LevelId): Node | string {
  const L = LEVELS[id];
  return L.kind === 'boss' ? icon('heart', { fill: '#fff' }) : L.kind === 'side' ? '!' : id.slice(1);
}

function heartSvg(pct: number): string {
  const y = 24 - (24 * pct) / 100;
  return (
    `<svg viewBox="0 0 26 24" aria-hidden="true"><defs><clipPath id="hfill"><rect x="0" y="${y}" width="26" height="24"/></clipPath></defs>` +
    `<path d="M13 22 C4 15 0 11 0 6.5 C0 2.8 2.9 0 6.4 0 C9.2 0 11.4 1.6 13 4 C14.6 1.6 16.8 0 19.6 0 C23.1 0 26 2.8 26 6.5 C26 11 22 15 13 22 Z" fill="#fff" stroke="#f7768e" stroke-width="2"/>` +
    `<path clip-path="url(#hfill)" d="M13 22 C4 15 0 11 0 6.5 C0 2.8 2.9 0 6.4 0 C9.2 0 11.4 1.6 13 4 C14.6 1.6 16.8 0 19.6 0 C23.1 0 26 2.8 26 6.5 C26 11 22 15 13 22 Z" fill="#f7768e"/></svg>`
  );
}

export function showMap(opts: { completed?: LevelId; unlocked?: LevelId[] } = {}): void {
  audio.playMusic('map');
  const pins = el('div', { class: 'map-pins' });
  const sheet = el(
    'div',
    { class: 'map-sheet' },
    art('img/map.webp', 'map-img', () => el('div', { class: 'map-missing' }, 'Omaha, Nebraska')),
    tape('map-tape tl'),
    tape('map-tape tr'),
    pins,
  );
  const heart = el('div', { class: 'heart-meter', 'data-testid': 'heart-meter' });
  const invBtn = button('Inventory', () => void openInventory(root).then(renderTop), { color: 'blue', icon: '🎒', small: true, id: 'open-inventory' });
  // HUD sits in the map's empty corners (top-left, right column) so it never
  // covers Samira's drawings or a pin.
  const root = el(
    'div',
    { class: 'map-screen paper-screen fade-in', 'data-testid': 'map' },
    flower(0, 'map-deco left'),
    flower(1, 'map-deco right'),
    sheet,
    el('div', { class: 'map-top' }, iconButton('🏠', () => showTitle(), { title: 'Title screen', id: 'map-home' })),
    el(
      'div',
      { class: 'map-hud' },
      heart,
      button('Soundtrack', () => void openSoundtrack(root), { color: 'red', icon: '♫', small: true, id: 'open-soundtrack' }),
      invBtn,
    ),
  );

  const next = nextStoryLevel();
  const fresh = new Set(opts.unlocked ?? []);

  function renderTop() {
    const pct = Math.round(save.data.heart);
    heart.innerHTML = heartSvg(pct);
    heart.append(
      el(
        'span',
        { class: 'hm-col' },
        el('span', { class: 'hm-label' }, "Libby's heart"),
        el('span', { class: 'hm-row' }, el('span', { class: 'hm-bar' }, el('i', { style: `width:${pct}%` })), el('b', {}, `${pct}%`)),
      ),
    );
    heart.setAttribute('aria-label', `Libby's heart: ${pct}%`);
    const eq = save.data.equipped;
    invBtn.classList.toggle('has-item', !!eq);
    invBtn.querySelector('.inv-eq')?.remove();
    if (eq) invBtn.append(art(ITEMS[eq].icon, 'inv-eq', () => icon('check')));
  }

  function render() {
    pins.replaceChildren();
    let order = 0;
    for (const loc of Object.values(MAP_LOCS)) {
      const ids = levelsAt(loc.id);
      const chucks = loc.id === 'wesCar' && !!save.data.flags.chucksReady && save.data.chucks === 'none';
      if (!ids.length && !chucks) continue;
      const open = ids.filter((id) => save.isUnlocked(id) && !save.isDone(id));
      const done = ids.filter((id) => save.isDone(id));
      const state: PinState = chucks
        ? 'secret'
        : next && ids.includes(next)
          ? 'next'
          : open.length
            ? loc.id === 'secret'
              ? 'secret'
              : 'open'
            : done.length
              ? 'done'
              : 'locked';
      const glyph =
        state === 'secret' ? icon('sparkle', { fill: '#fff' }) : state === 'locked' ? icon('lock') : state === 'done' ? icon('star', { fill: '#fff' }) : pinIcon(state === 'next' ? next! : open[0]);
      const isNew = ids.some((u) => fresh.has(u));
      const isCompleted = !!opts.completed && ids.includes(opts.completed);
      const partial = state !== 'done' && done.length > 0;
      const pin = el(
        'button',
        {
          class: `map-pin ${state} lab-${LABEL_SIDE[loc.id] ?? 'below'}${isNew ? ' unlocking' : ''}${isCompleted ? ' completed' : ''}`,
          style: `left:${loc.x * 100}%;top:${(loc.y + (PIN_NUDGE[loc.id] ?? 0)) * 100}%;--delay:${isNew ? 0.5 + order++ * 0.35 : 0}s`,
          'data-testid': `pin-${loc.id}`,
          'data-state': state,
          'aria-label': `${loc.name}: ${state === 'locked' ? 'locked' : state === 'done' ? 'completed' : 'tap to play'}`,
        },
        el('span', { class: 'pin-dot' }, el('span', { class: 'pin-ico' }, glyph), partial ? el('span', { class: 'pin-star', 'aria-hidden': 'true' }, icon('star', { fill: '#fff', stroke: '#fff' })) : null),
        // locked places stay quiet: Samira's map already names every building
        state === 'locked' ? null : el('span', { class: 'pin-label' }, shortPlace(loc.id)),
        isNew ? el('span', { class: 'pin-burst' }) : null,
        isNew ? el('span', { class: 'pin-lock-old' }, icon('lock')) : null,
      );
      pin.addEventListener('click', () => {
        audio.sfx(state === 'locked' ? 'tap' : 'click');
        dismissTip();
        openLocation(loc.id, chucks);
      });
      pins.appendChild(pin);
    }
  }

  function rewardChips(id: LevelId): Node[] {
    const L = LEVELS[id];
    const chips: Node[] = [];
    const have = save.hasSong(L.song);
    chips.push(el('span', { class: `loc-chip song${have ? ' got' : ''}` }, icon('music'), have ? SONGS[L.song].title : 'New song'));
    if (L.item) {
      const st = save.data.items[L.item];
      chips.push(
        el(
          'span',
          { class: `loc-chip item${st !== 'none' ? ' got' : ''}`, title: L.itemRule ?? '' },
          art(ITEMS[L.item].icon, 'chip-ico', () => icon('star')),
          st !== 'none' ? ITEMS[L.item].name : `${ITEMS[L.item].name}: ${(L.itemRule ?? '').replace(/\.$/, '')}`,
        ),
      );
    }
    const stars = save.data.levels[id]?.bestStars;
    if (stars) chips.push(el('span', { class: 'loc-chip stars', 'aria-label': `${stars} stars` }, ...Array.from({ length: stars }, () => icon('star', { fill: 'currentColor' }))));
    return chips;
  }

  function openLocation(loc: MapLocId, chucks: boolean) {
    const ids = levelsAt(loc);
    const rows: HTMLElement[] = ids.map((id) => {
      const L = LEVELS[id];
      const unlocked = save.isUnlocked(id);
      const done = save.isDone(id);
      const need = L.requires.filter((r) => !save.isDone(r)).map((r) => LEVELS[r].label);
      return el(
        'div',
        { class: `loc-row ${L.kind}${unlocked ? '' : ' locked'}${done ? ' done' : ''}`, 'data-testid': `loc-row-${id}` },
        el(
          'div',
          { class: 'loc-info' },
          el('div', { class: 'loc-label' }, L.label, done ? el('span', { class: 'loc-done' }, icon('check'), 'done') : null),
          el('div', { class: 'loc-title' }, L.title),
          el('div', { class: 'loc-sub' }, unlocked ? `${L.chapter} · based on ${L.basedOn}` : `Finish ${joinLabels(need)} to unlock.`),
          unlocked ? el('div', { class: 'loc-chips' }, ...rewardChips(id)) : null,
        ),
        unlocked
          ? button(done ? 'Replay' : 'Play', () => {
              close();
              void playLevel(id);
            }, { color: 'green', icon: '▶', id: `play-level-${id}` })
          : el('span', { class: 'loc-lock', 'aria-label': 'Locked' }, icon('lock')),
      );
    });
    if (chucks) {
      rows.unshift(
        el(
          'div',
          { class: 'loc-row secret' },
          el('div', { class: 'loc-info' }, el('div', { class: 'loc-label' }, icon('sparkle', { fill: 'currentColor' }), 'Secret'), el('div', { class: 'loc-title' }, 'Something in the back seat…'), el('div', { class: 'loc-sub' }, 'You finished every side quest. Take a look!')),
          button('Look', () => {
            close();
            void revealChucks();
          }, { color: 'green', icon: '✨', id: 'reveal-chucks' }),
        ),
      );
    }
    const first = ids[0] ? LEVELS[ids[0]] : null;
    const close = modal(
      root,
      el(
        'div',
        { class: 'loc-card', 'data-testid': `loc-${loc}` },
        closeX(() => close(), 'loc-close'),
        el(
          'div',
          { class: 'loc-side' },
          first ? scenePolaroid(chucks ? { ...first, scene: 'img/scenes/chucks.webp' } : first, 'loc-photo') : null,
        ),
        el(
          'div',
          { class: 'loc-main' },
          el('h2', { class: 'brush-title loc-name' }, MAP_LOCS[loc].name),
          el('div', { class: 'loc-rows' }, ...rows),
        ),
      ),
      { onBackdrop: () => close(), class: 'panel loc-panel' },
    );
  }

  // ---- first-visit tip: point at the next pin
  let tip: HTMLElement | null = null;
  function dismissTip() {
    if (!tip) return;
    tip.classList.add('out');
    const t = tip;
    tip = null;
    setTimeout(() => t.remove(), 300);
    save.setFlag('mapTipSeen');
  }
  function showTip() {
    if (save.data.flags.mapTipSeen || !next) return;
    const target = pins.querySelector<HTMLElement>(`[data-testid="pin-${LEVELS[next].location}"]`);
    if (!target) return;
    tip = el(
      'div',
      { class: 'map-tip', 'data-testid': 'map-tip' },
      el('b', {}, 'Tap a place on the map!'),
      el('span', {}, el('i', { class: 'tip-green' }), 'Green means select. Start here.'),
    );
    tip.dataset.for = target.dataset.testid ?? '';
    pins.appendChild(tip);
    placeTip();
    setTimeout(() => root.addEventListener('pointerdown', dismissTip, { once: true }), 50);
  }

  /**
   * Put the tip next to its pin where it covers nothing: try each side and a
   * few alignments, score overlap with other pins, their labels, Samira's
   * hand-drawn labels and the HUD, and keep the clearest spot on screen.
   */
  function placeTip() {
    if (!tip) return;
    const target = pins.querySelector<HTMLElement>(`[data-testid="${tip.dataset.for}"]`);
    if (!target) return;
    const sr = sheet.getBoundingClientRect();
    const k = sr.width / (sheet.offsetWidth || sr.width || 1); // screen px per layout px
    const dot = target.querySelector('.pin-dot')!.getBoundingClientRect();
    const own = target.querySelector('.pin-label')?.getBoundingClientRect();
    const tw = tip.offsetWidth * k;
    const th = tip.offsetHeight * k;
    const gap = 16 * k;
    const pad = 6 * k;
    const box = (l: number, t: number, r: number, b: number) => ({ l, t, r, b });
    const fromRect = (r: DOMRect, m = 0) => box(r.left - m, r.top - m, r.right + m, r.bottom + m);
    const obstacles: Array<{ r: ReturnType<typeof box>; w: number }> = [];
    pins.querySelectorAll<HTMLElement>('.map-pin').forEach((p) => {
      for (const part of p.querySelectorAll('.pin-dot, .pin-label')) obstacles.push({ r: fromRect(part.getBoundingClientRect(), pad), w: p === target && part.classList.contains('pin-dot') ? 0 : 1 });
    });
    for (const [x0, y0, x1, y1] of DRAWN_LABELS) obstacles.push({ r: box(sr.left + x0 * sr.width, sr.top + y0 * sr.height, sr.left + x1 * sr.width, sr.top + y1 * sr.height), w: 0.35 });
    root.querySelectorAll('.map-top > *, .map-hud > *, .map-unlock').forEach((e) => obstacles.push({ r: fromRect(e.getBoundingClientRect(), pad), w: 2 }));
    // stay on the visible part of the drawing
    const vr = root.getBoundingClientRect();
    const bounds = box(Math.max(sr.left, vr.left) + pad, Math.max(sr.top, vr.top) + pad, Math.min(sr.right, vr.right) - pad, Math.min(sr.bottom, vr.bottom) - pad);
    const cx = (dot.left + dot.right) / 2;
    const cy = (dot.top + dot.bottom) / 2;
    const below = Math.max(dot.bottom, own?.bottom ?? 0) + gap;
    type Spot = { side: 'above' | 'below' | 'left' | 'right'; x: number; y: number };
    const spots: Spot[] = [];
    for (const f of [0.5, 0.18, 0.82]) {
      spots.push({ side: 'above', x: cx - tw * f, y: dot.top - gap - th });
      spots.push({ side: 'below', x: cx - tw * f, y: below });
    }
    for (const f of [0.5, 0.25, 0.75]) {
      spots.push({ side: 'right', x: dot.right + gap, y: cy - th * f });
      spots.push({ side: 'left', x: dot.left - gap - tw, y: cy - th * f });
    }
    let best: Spot | null = null;
    let bestScore = Infinity;
    spots.forEach((sp, i) => {
      const r = box(sp.x, sp.y, sp.x + tw, sp.y + th);
      const out = Math.max(0, bounds.l - r.l) + Math.max(0, r.r - bounds.r) + Math.max(0, bounds.t - r.t) + Math.max(0, r.b - bounds.b);
      let hit = 0;
      for (const o of obstacles) {
        const w = Math.max(0, Math.min(r.r, o.r.r) - Math.max(r.l, o.r.l));
        const h = Math.max(0, Math.min(r.b, o.r.b) - Math.max(r.t, o.r.t));
        hit += w * h * o.w;
      }
      const score = out * 1e5 + hit + i; // ties go to the earlier (preferred) spot
      if (score < bestScore) [best, bestScore] = [sp, score];
    });
    const sp = best!;
    tip.className = `map-tip side-${sp.side}${tip.classList.contains('out') ? ' out' : ''}`;
    tip.style.left = `${(sp.x - sr.left) / k}px`;
    tip.style.top = `${(sp.y - sr.top) / k}px`;
    // the arrow points at the pin's centre
    const along = sp.side === 'above' || sp.side === 'below' ? (cx - sp.x) / k : (cy - sp.y) / k;
    tip.style.setProperty('--arrow', `${Math.round(along)}px`);
  }

  // ---- fit the map (keep aspect ratio) and pin it in image space
  //   phones (wide): fill the height, crop at most a sliver at the sides;
  //                  the HUD column sits over the drawing's empty top right
  //   squarer (iPad): the whole drawing, contained below a HUD bar, on paper
  const layout = () => {
    const W = root.clientWidth || window.innerWidth;
    const H = root.clientHeight || window.innerHeight;
    const bar = W / H <= 1.6;
    root.classList.toggle('hud-bar', bar);
    let w: number, h: number, x0: number, y0: number;
    if (bar) {
      const cs = getComputedStyle(root);
      const px = (v: string) => parseFloat(cs.getPropertyValue(v)) || 0;
      const top = px('--safe-top') + BAR_H;
      const area = { x: px('--safe-left') + 14, y: top, w: W - px('--safe-left') - px('--safe-right') - 28, h: H - top - px('--safe-bottom') - 14 };
      const s = Math.min(area.w / MAP_W, area.h / MAP_H);
      w = MAP_W * s;
      h = MAP_H * s;
      x0 = area.x + (area.w - w) / 2;
      y0 = area.y + (area.h - h) / 2;
    } else {
      const xs = Object.values(MAP_LOCS).map((l) => l.x);
      const minX = Math.min(...xs) - 0.1;
      const maxX = Math.max(...xs) + 0.12;
      let s = H / MAP_H;
      if (MAP_W * s > W && (maxX - minX) * MAP_W * s > W) s = W / MAP_W;
      w = MAP_W * s;
      h = MAP_H * s;
      const mid = (minX + maxX) / 2;
      x0 = w > W ? Math.min(0, Math.max(W - w, W / 2 - mid * w)) : (W - w) / 2;
      y0 = (H - h) / 2;
    }
    sheet.style.cssText = `width:${w}px;height:${h}px;left:${x0}px;top:${y0}px`;
    root.style.setProperty('--mx', `${Math.max(0, x0)}px`);
    root.style.setProperty('--my', `${Math.max(0, H - y0 - h)}px`);
    root.classList.toggle('has-margins', bar || x0 > 40);
    placeTip();
  };
  const ro = new ResizeObserver(layout);

  renderTop();
  render();
  app.show({ el: root, destroy: () => ro.disconnect() });
  ro.observe(root);
  layout();
  showTip();

  if (opts.unlocked?.length) {
    setTimeout(() => audio.sfx('unlock'), 500);
    const names = [...new Set(opts.unlocked.map((u) => shortPlace(LEVELS[u].location)))];
    // a sticky note under the HUD column, so it never hides the pins it announces
    const banner = el(
      'div',
      { class: 'map-unlock paper', 'data-testid': 'unlock-toast', role: 'status', 'aria-label': `Unlocked: ${names.join(', ')}` },
      el('b', { class: 'brush-title' }, names.length > 1 ? 'New places!' : 'New place!'),
      ...names.map((n) => el('span', {}, el('i', { class: 'tip-green' }), n)),
    );
    root.appendChild(banner);
    setTimeout(() => banner.classList.add('out'), 3800);
    setTimeout(() => banner.remove(), 4300);
  }
}
