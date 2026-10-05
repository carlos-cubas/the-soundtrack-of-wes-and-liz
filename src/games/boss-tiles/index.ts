/**
 * Boss Level: Parking Ever After (Magic Tiles 3 + chapter eighteen).
 *
 * Tap the tiles in time with the beat. Every tile carries the next words
 * of Wes's confession rap, which lights up word by word in the karaoke
 * card. Misses rattle his nerves ("palms are sweaty"); if they run out he
 * chokes. Finish the song with enough points and Libby is won over.
 *
 * All timing comes from the audio clock (clock.ts). The beat is
 * synthesized and scheduled on that same clock (beat.ts), and the chart is
 * generated from its grid (chart.ts), so tiles, music and judging agree.
 */
import { save } from '../../core/save';
import { CONFESSION_RAP, type LevelDef } from '../../data/story';
import { button, el, wait } from '../../ui/dom';
import type { GameHost, MiniGame } from '../types';
import { Beat } from './beat';
import { BEAT, STEP, buildChart, type Tile } from './chart';
import { SongClock } from './clock';
import { BossRun, GOOD, PERFECT, WordState, starsFor, type Grade, type RunEvent } from './run';
import {
  CREAM,
  HIT_Y,
  INK,
  INK_TEXT,
  LEMON,
  SPEED,
  TILE_H,
  TILE_PAD,
  buildStatic,
  card as drawCard,
  inked,
  buildTileSprite,
  heartPath,
  laneAt,
  laneCenter,
  layout,
  layoutWords,
  roundRect,
  type Layout,
  type LineLayout,
} from './view';

/** Touch-to-event latency we forgive: taps are judged this much earlier. */
const TAP_LAG = 0.03;
/** On resume the song rewinds this far, so the tiles roll back in. */
const REWIND = 2 * BEAT;
/** Seconds a tile is on screen before it reaches the hit line. */
const LEAD = (HIT_Y + TILE_H) / SPEED;
const KEYS = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
const BG = 'img/bg/boss-night.webp';
const WES = 'img/sprites/wes.png';
const LIZ = 'img/sprites/liz.png';
const PINK = '#f9b6c8';
const CORAL = '#f7768e';
const MINT = '#9be3c9';
/** Karaoke card: height of the header row above the current line. */
const CARD_TOP = 32;
const TAGLINE = 'palms are sweaty';
/** The heart path from ui/icons.ts ('heart'), used here as a fillable meter. */
const HEART_PATH = 'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z';

type Phase = 'card' | 'song' | 'choke' | 'end';

interface Fx {
  kind: 'burst' | 'ripple' | 'word' | 'heart' | 'drop';
  x: number;
  y: number;
  /** Wall time it started, and how long it lives. */
  t: number;
  dur: number;
  text?: string;
  tx?: number;
  ty?: number;
  color?: string;
  vx?: number;
}

export default (level: LevelDef): MiniGame => {
  let host: GameHost;
  const chart = buildChart(CONFESSION_RAP);
  const tiles = chart.tiles;
  const lastEnd = tiles.reduce((m, t) => Math.max(m, t.t + t.hold), 0);
  const sideQuests = (['sq1', 'sq2', 'sq3'] as const).filter((id) => save.isDone(id)).length;
  const run = new BossRun(chart, sideQuests);
  const trust = 70 - run.thresholdPct;

  let phase: Phase = 'card';
  let starting = false;
  let destroyed = false;
  /**
   * The song is stopped while still in the 'song' phase: the host paused,
   * the phone turned to portrait, or iOS interrupted the audio. Resuming
   * rewinds a little and restarts the beat (see unfreeze).
   */
  let frozen = false;
  let resumeCard: HTMLElement | null = null;
  let audioCtx: AudioContext | null = null;
  let L: Layout;
  let staticLayer: HTMLCanvasElement | null = null;
  let tileSprite: HTMLCanvasElement | null = null;
  let missSprite: HTMLCanvasElement | null = null;
  let clock: SongClock | null = null;
  let beat: Beat | null = null;
  /** Song seconds the player is hearing (frozen while paused). */
  let pos = 0;
  let paused = false;
  /** Wall seconds of unpaused play, for animations. */
  let wall = 0;
  let endAt = 0;
  let first = true;
  let card: HTMLElement | null = null;
  let offResize: (() => void) | null = null;

  const evs: RunEvent[] = [];
  const fx: Fx[] = [];
  let pop: { text: string; color: string; t: number } | null = null;
  const laneGlow = [0, 0, 0, 0];
  const laneBad = [0, 0, 0, 0];
  const pointerLane = new Map<number, number>();
  let hitCount = 0;
  let lastHitAt = -1;
  let lastHud = '';
  let scrollIdx = 0;
  let shownLine = 0;
  let lineAt = 0;
  let heartFullShown = false;
  let heartChip: HTMLElement | null = null;
  let heartLabel: HTMLElement | null = null;
  let heartFill: SVGRectElement | null = null;
  let scoreLen = 0;
  let nextDrop = 0;
  let chokeAt = 0;
  let lastTap = { x: -1, lane: -1 };

  // autoplay (debug): taps every tile on time through real pointer events
  let auto = false;
  let autoIdx = 0;
  let autoId = 7000;
  const autoUps: Array<{ at: number; id: number }> = [];

  // caches rebuilt on resize
  let tileFont = new Float32Array(tiles.length);
  const lineCache = new Map<number, LineLayout>();
  const nextCache = new Map<number, LineLayout>();
  let curFont = 22;
  let cardH = 180;
  /** Wes and Libby are drawn the same height, fitting under the karaoke card. */
  let charH = 180;
  let NL: ReturnType<typeof nervesLayout>;
  let cardNow = 0;

  // ------------------------------------------------------------- helpers
  const stamp = (e: Event) => {
    const now = performance.now();
    return e.timeStamp > 0 && Math.abs(now - e.timeStamp) < 1000 ? e.timeStamp : now;
  };

  function rebuild(): void {
    L = layout(host.stage);
    staticLayer = buildStatic(host.stage, L, host.image(BG));
    tileSprite = buildTileSprite(host.stage, L, 'black');
    missSprite = buildTileSprite(host.stage, L, 'miss');
    tileFont = new Float32Array(tiles.length);
    lineCache.clear();
    nextCache.clear();
    curFont = L.kw < 190 ? 18 : L.kw < 230 ? 20 : 22;
    // the tallest the karaoke card gets; Wes and Libby fit under it
    const ctx = host.stage.ctx;
    let maxCur = 0;
    let maxNext = 0;
    for (let i = 0; i < chart.lines.length; i++) {
      maxCur = Math.max(maxCur, lineLayout(ctx, i).height);
      maxNext = Math.max(maxNext, nextLayout(ctx, i).height);
    }
    cardH = CARD_TOP + maxCur + 12 + maxNext + 8;
    charH = Math.max(100, Math.min(215, 398 - (L.ky + cardH + 6)));
    NL = nervesLayout(ctx);
    fitHud();
  }

  /**
   * The nerves card's rows for the left column's width: the tagline and the
   * accuracy readout sit beside their partners when they fit, else wrap
   * onto their own rows (shrinking a little first).
   */
  function nervesLayout(ctx: CanvasRenderingContext2D) {
    const w = Math.max(60, L.lw - 12);
    const inner = w - 4;
    const fit = (text: string, family: string, max: number, min: number, width: number) => {
      let px = max;
      ctx.font = `${px}px ${family}`;
      while (px > min && ctx.measureText(text).width > width) ctx.font = `${--px}px ${family}`;
      return { px, w: ctx.measureText(text).width };
    };
    ctx.save();
    const nerves = fit('Nerves', "'Patrick Hand'", 17, 17, inner);
    let tag = fit(TAGLINE, "'Pacifico'", 14, 14, inner);
    const tagInline = nerves.w + 10 + tag.w <= inner;
    if (!tagInline) tag = fit(TAGLINE, "'Pacifico'", 14, 10, inner);
    let acc = fit('Accuracy 100%', "'Patrick Hand'", 15, 15, inner);
    let need = fit(`Libby needs ${run.thresholdPct}%`, "'Patrick Hand'", 15, 15, inner);
    const accInline = acc.w + 10 + need.w <= inner;
    if (!accInline) {
      acc = fit('Accuracy 100%', "'Patrick Hand'", 15, 11, inner);
      need = fit(`Libby needs ${run.thresholdPct}%`, "'Patrick Hand'", 15, 11, inner);
    }
    ctx.restore();
    const top = L.ky;
    const yNerves = top + 21;
    const yTag = tagInline ? yNerves : yNerves + 18;
    const yBar = yTag + 8;
    const yAcc = yBar + 14 + 18;
    const yNeed = accInline ? yAcc : yAcc + 17;
    return { w, tagPx: tag.px, tagInline, accPx: acc.px, needPx: need.px, accInline, yNerves, yTag, yBar, yAcc, yNeed, h: yNeed + 9 - top };
  }

  /** Word boxes of line `i` as the current line (large). */
  function lineLayout(ctx: CanvasRenderingContext2D, i: number): LineLayout {
    let l = lineCache.get(i);
    if (!l) {
      ctx.save();
      ctx.font = `${curFont}px 'Patrick Hand'`;
      l = layoutWords(ctx, chart.lines[i], L.kw - 24, curFont + 5);
      ctx.restore();
      lineCache.set(i, l);
    }
    return l;
  }

  /** The line being performed: the next tile still to come (with a short grace after a line ends). */
  function currentLine(p: number): number {
    for (const t of tiles) if (t.t + t.hold >= p - 0.3) return t.line;
    return chart.lines.length - 1;
  }

  // ------------------------------------------------------------ the song
  /** Resume the AudioContext (inside the tap that called us), waiting at most 600 ms. */
  async function wakeAudio(): Promise<void> {
    host.audio.unlock();
    const ctx = host.audio.ctx;
    if (ctx && ctx.state !== 'running') await Promise.race([ctx.resume().catch(() => {}), wait(600)]);
    if (destroyed) return;
    if (ctx && ctx !== audioCtx) {
      audioCtx?.removeEventListener('statechange', onAudioState);
      audioCtx = ctx;
      ctx.addEventListener('statechange', onAudioState);
    }
  }

  async function startSong(): Promise<void> {
    if (phase !== 'card' || starting || paused) return;
    starting = true;
    host.audio.stopMusic();
    await wakeAudio();
    starting = false;
    if (destroyed || phase !== 'card') return;
    card?.remove();
    card = null;
    phase = 'song';
    host.hud.setTitle(null);
    if (paused) {
      frozen = true; // the host paused during the wait; Resume starts the song
      return;
    }
    play(0);
  }

  /**
   * (Re)start the music and clock at song position `from`. The clock is
   * rebuilt each time, so it picks up audio that came back since.
   */
  function play(from: number): void {
    beat?.stop();
    beat = null;
    const ctx = host.audio.ctx;
    clock = new SongClock(ctx && ctx.state === 'running' ? ctx : null);
    const t0 = clock.start(from);
    if (clock.source === 'audio' && ctx) {
      beat = new Beat(ctx, host.audio.musicBus(), chart);
      beat.start(t0, from / STEP);
    }
    pos = from;
    scrollIdx = 0;
    if (auto) syncAuto();
  }

  /** Stop the song where it is; held tiles count as held (not the player's fault). */
  function freeze(): void {
    if (phase !== 'song' || frozen) return;
    frozen = true;
    if (clock) pos = clock.tick(performance.now());
    beat?.stop();
    beat = null;
    run.interrupt(pos, evs);
    pointerLane.clear();
    autoUps.length = 0;
    handleEvents();
    if (!paused) showResumeCard();
  }

  async function unfreeze(): Promise<void> {
    if (!frozen || paused || destroyed) return;
    if (portrait()) {
      showResumeCard();
      return;
    }
    resumeCard?.remove();
    resumeCard = null;
    await wakeAudio();
    if (!frozen || paused || destroyed) return;
    frozen = false;
    play(Math.max(0, pos - REWIND));
    pop = { text: 'Ready…', color: '#fdfbf3', t: wall };
  }

  /** Turned to portrait: the lanes don't fit and the host shows its rotate hint. */
  const portrait = () => host.stage.W < host.stage.H;

  /** iOS can suspend audio (a call, Siri, an alarm) without hiding the page. */
  const onAudioState = () => {
    if (!audioCtx || phase !== 'song' || paused || frozen) return;
    if (audioCtx.state !== 'running') freeze();
    else if (clock?.source === 'wall') play(clock.tick(performance.now())); // audio came up late: switch to it
  };

  const onBlur = () => pointerLane.clear();

  function showResumeCard(): void {
    if (resumeCard || destroyed) return;
    resumeCard = el(
      'div',
      { class: 'overlay fade-in', 'data-testid': 'boss-resume' },
      el(
        'div',
        { class: 'paper modal pop-in', style: 'max-width:360px;padding:18px 22px 14px' },
        el('div', { class: 'tape' }),
        el('h2', { class: 'title-text', style: 'font-size:28px' }, 'Deep breath…'),
        el('p', {}, 'The song stopped. Ready when you are.'),
        el('div', { class: 'row' }, button('Keep going', () => void unfreeze(), { color: 'green', icon: '▶', id: 'boss-continue' })),
      ),
    );
    host.dom.appendChild(resumeCard);
  }

  function choke(): void {
    phase = 'choke';
    chokeAt = wall;
    beat?.choke();
    beat = null;
    run.interrupt(pos, evs);
    pointerLane.clear();
    autoUps.length = 0;
    handleEvents();
    host.banner('I choked…');
    endAt = wall + 2.2;
  }

  function endSong(): void {
    phase = 'end';
    endAt = wall + 3;
    if (run.passed) {
      host.banner('Confession complete!');
      host.audio.sfx('star');
      for (let i = 0; i < 26; i++) {
        fx.push({ kind: 'heart', x: L.kx + L.kw / 2 + (Math.random() - 0.5) * 80, y: 330 + Math.random() * 40, t: wall + Math.random() * 0.8, dur: 1.8, vx: (Math.random() - 0.5) * 60, color: Math.random() < 0.5 ? CORAL : PINK });
      }
    } else {
      host.banner("The words won't come out…");
    }
  }

  function finalize(): void {
    beat?.stop(0.5);
    beat = null;
    const pct = Math.round(run.pct);
    if (phase === 'choke') {
      host.finish({ outcome: 'lose', score: run.score, summary: 'I choked…' });
    } else if (run.passed) {
      host.finish({
        outcome: 'win',
        score: run.score,
        stars: starsFor(run.pct),
        summary: `Confession complete: ${pct}% of the rap, best combo ${run.maxCombo}.`,
      });
    } else {
      host.finish({ outcome: 'lose', score: run.score, summary: `Only ${pct}% of the confession came out. Libby needed ${run.thresholdPct}%.` });
    }
  }

  // ------------------------------------------------------------- events
  function gradeColor(g: Grade | 'miss'): string {
    return g === 'perfect' ? LEMON : g === 'great' ? '#7fdcff' : CORAL;
  }

  function handleEvents(): void {
    for (const e of evs) {
      if (e.kind === 'hit') {
        const x = laneCenter(L, e.tile.lane);
        fx.push({ kind: 'burst', x, y: HIT_Y, t: wall, dur: 0.3, color: gradeColor(e.grade) });
        const target = wordTarget(e.tile);
        fx.push({ kind: 'word', x, y: HIT_Y - 6, tx: target.x, ty: target.y, t: wall, dur: 0.5, text: e.tile.text });
        pop = { text: e.grade === 'perfect' ? 'Perfect!' : 'Great', color: gradeColor(e.grade), t: wall };
        lastHitAt = wall;
        pluck(e.tile, e.grade === 'perfect');
        if (run.combo > 0 && run.combo % 10 === 0) fx.push({ kind: 'heart', x: L.kx + L.kw / 2, y: 330, t: wall, dur: 1.6, vx: 0, color: CORAL });
      } else if (e.kind === 'miss') {
        pop = { text: 'Miss', color: CORAL, t: wall };
        beat?.muffle();
      } else if (e.kind === 'empty') {
        laneBad[e.lane] = 1;
      } else if (e.kind === 'holdEnd' && e.full) {
        fx.push({ kind: 'burst', x: laneCenter(L, e.tile.lane), y: HIT_Y, t: wall, dur: 0.35, color: LEMON });
      }
    }
    evs.length = 0;
  }

  /** A soft note in key on each hit, landing on the beat if the tap was early. */
  function pluck(tile: Tile, bright: boolean): void {
    const ctx = host.audio.ctx;
    if (!beat || !ctx || !clock) return;
    const at = Math.max(ctx.currentTime, clock.origin + tile.t);
    host.audio.tone({ freq: beat.hitHz(tile.step, hitCount++), time: at, dur: 0.09, wave: 'triangle', gain: bright ? 0.07 : 0.045, attack: 0.003, release: 0.16 });
  }

  /** Where a hit word flies to: its spot in the karaoke card. */
  function wordTarget(tile: Tile): { x: number; y: number } {
    if (tile.line !== shownLine) return { x: L.kx + L.kw / 2, y: L.ky + 20 };
    const lay = lineLayout(host.stage.ctx, tile.line);
    const b = lay.boxes[tile.w0 - chart.lineWord0[tile.line]];
    return b ? { x: L.kx + 12 + b.x + b.w / 2, y: L.ky + CARD_TOP + curFont * 0.55 + b.y } : { x: L.kx + L.kw / 2, y: L.ky + 40 };
  }

  // -------------------------------------------------------------- input
  function down(lane: number, id: number, at: number, x: number, y: number): void {
    if (phase !== 'song' || paused || frozen || !clock) return;
    fx.push({ kind: 'ripple', x, y, t: wall, dur: 0.35 });
    laneGlow[lane] = 1;
    pointerLane.set(id, lane);
    run.tap(lane, clock.at(at) - TAP_LAG, evs);
    handleEvents();
  }

  function up(id: number, at: number): void {
    const lane = pointerLane.get(id);
    if (lane === undefined) return;
    pointerLane.delete(id);
    if (phase !== 'song' || paused || frozen || !clock) return;
    for (const l of pointerLane.values()) if (l === lane) return; // another finger still on it
    if (run.holding[lane] >= 0) {
      run.release(lane, clock.at(at) - TAP_LAG, evs);
      handleEvents();
    }
  }

  const onPointerDown = (e: PointerEvent) => {
    const v = host.stage.toVirtual(e.clientX, e.clientY);
    const lane = laneAt(L, v.x);
    lastTap = { x: v.x, lane };
    if (lane >= 0) down(lane, e.pointerId, stamp(e), v.x, v.y);
  };
  const onPointerUp = (e: PointerEvent) => up(e.pointerId, stamp(e));
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (phase === 'card' && !paused && (e.code === 'Space' || e.code === 'Enter')) {
      void startSong();
      return;
    }
    const lane = KEYS.indexOf(e.code);
    if (lane >= 0) down(lane, -1 - lane, stamp(e), laneCenter(L, lane), HIT_Y);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const lane = KEYS.indexOf(e.code);
    if (lane >= 0) up(-1 - lane, stamp(e));
  };

  function dispatch(type: 'pointerdown' | 'pointerup', id: number, lane: number): void {
    const c = host.stage.canvas;
    const r = c.getBoundingClientRect();
    const s = host.stage.scale;
    const init = { pointerId: id, clientX: r.left + laneCenter(L, lane) * s, clientY: r.top + (HIT_Y + 24) * s, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: false };
    c.dispatchEvent(new PointerEvent(type, init));
  }

  function syncAuto(): void {
    autoIdx = run.result.findIndex((r) => r === 'pending');
    if (autoIdx < 0) autoIdx = tiles.length;
    autoUps.length = 0;
  }

  function autoplayStep(): void {
    while (autoIdx < tiles.length && tiles[autoIdx].t + TAP_LAG <= pos + 0.008) {
      const tile = tiles[autoIdx++];
      if (run.result[tile.i] !== 'pending') continue;
      const id = autoId++;
      dispatch('pointerdown', id, tile.lane);
      autoUps.push({ at: tile.t + (tile.hold || 0.07), id });
    }
    for (let i = autoUps.length - 1; i >= 0; i--) {
      if (autoUps[i].at + TAP_LAG <= pos) {
        const u = autoUps[i];
        autoUps.splice(i, 1);
        const lane = pointerLane.get(u.id);
        if (lane !== undefined) dispatch('pointerup', u.id, lane);
      }
    }
  }

  // ------------------------------------------------------------ the card
  function showCard(): void {
    const pct = run.thresholdPct;
    card = el(
      'div',
      { class: 'overlay fade-in', 'data-testid': 'boss-card' },
      el(
        'div',
        { class: 'paper modal pop-in', style: 'max-width:440px;padding:18px 22px 14px' },
        el('div', { class: 'tape' }),
        el('h2', { class: 'title-text', style: 'font-size:30px' }, level.title),
        el('p', {}, 'Tap the black tiles as they hit the line. Hold the long ones to the end.'),
        el('p', {}, 'Every hit adds the next words of your confession.'),
        el('p', { style: 'font-size:21px' }, el('b', {}, `Win Libby's heart: score ${pct}%`)),
        el(
          'p',
          { style: `color:${trust > 0 ? '#c2410c' : '#64748b'};font-size:17px` },
          `Libby's trust: +${trust}% from side quests` + (sideQuests < 3 ? ` (${sideQuests}/3 done)` : ''),
        ),
        el('div', { class: 'row' }, button('Start', () => void startSong(), { color: 'green', icon: '▶', id: 'boss-start' })),
      ),
    );
    host.dom.appendChild(card);
  }

  // ------------------------------------------------------------- drawing
  function drawTiles(ctx: CanvasRenderingContext2D, p: number): void {
    const tMax = p + LEAD + 0.05;
    while (scrollIdx < tiles.length && tiles[scrollIdx].t + tiles[scrollIdx].hold < p - 1.2) scrollIdx++;
    const w = L.laneW - 8;
    const fade = phase === 'choke' ? Math.max(0, 1 - (wall - chokeAt) / 1.2) : 1;
    if (fade <= 0) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = scrollIdx; i < tiles.length; i++) {
      const tile = tiles[i];
      if (tile.t > tMax) break;
      const r = run.result[i];
      if (r === 'perfect' || r === 'great') continue;
      const x = L.x0 + tile.lane * L.laneW + 4;
      let y = HIT_Y - (tile.t - p) * SPEED;
      let alpha = fade;
      if (r === 'miss') {
        alpha = fade * Math.max(0, 1 - (y - HIT_Y) / 70);
        if (alpha <= 0 && !tile.hold) continue;
      }
      ctx.globalAlpha = alpha;
      if (tile.hold) {
        const tail = HIT_Y - (tile.t + tile.hold - p) * SPEED;
        if (r === 'holding') y = HIT_Y;
        const top = tail - TILE_H / 2;
        const bottom = y + TILE_H / 2;
        if (bottom < 0 || top > 400) continue;
        roundRect(ctx, x, top, w, bottom - top, 8);
        inked(ctx, r === 'holding' ? LEMON : r === 'miss' ? '#e0566f' : '#3b3570', 2, r === 'miss' ? '#7a1f2c' : '#121018');
        // the string you hold along
        ctx.fillStyle = r === 'holding' ? INK : CREAM;
        ctx.globalAlpha = alpha * (r === 'holding' ? 0.8 : 0.6);
        ctx.fillRect(x + w / 2 - 1.5, top + 8, 3, Math.max(0, bottom - top - TILE_H - 4));
        ctx.globalAlpha = alpha;
        if (r !== 'holding') ctx.drawImage(r === 'miss' ? missSprite! : tileSprite!, x - TILE_PAD, y - TILE_H / 2 - TILE_PAD, w + TILE_PAD * 2, TILE_H + TILE_PAD * 2);
      } else {
        ctx.drawImage(r === 'miss' ? missSprite! : tileSprite!, x - TILE_PAD, y - TILE_H / 2 - TILE_PAD, w + TILE_PAD * 2, TILE_H + TILE_PAD * 2);
      }
      // the word(s) on the tile
      let fs = tileFont[i];
      if (!fs) {
        fs = Math.round(TILE_H * 0.4);
        ctx.font = `${fs}px 'Patrick Hand'`;
        while (fs > 12 && ctx.measureText(tile.text).width > w - 10) {
          fs--;
          ctx.font = `${fs}px 'Patrick Hand'`;
        }
        tileFont[i] = fs;
      }
      ctx.font = `${fs}px 'Patrick Hand'`;
      ctx.fillStyle = r === 'holding' ? INK_TEXT : CREAM;
      ctx.fillText(tile.text, x + w / 2, y + 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawLanesFx(ctx: CanvasRenderingContext2D, p: number): void {
    // the hit band pulses with the beat
    const b = p / BEAT;
    if (phase === 'song' && b >= 0) {
      const ph = b - Math.floor(b);
      const down = Math.floor(b) % 4 === 0;
      ctx.globalAlpha = Math.pow(1 - ph, 3) * (down ? 0.45 : 0.25);
      ctx.fillStyle = LEMON;
      ctx.fillRect(L.x0, HIT_Y - TILE_H / 2, L.x1 - L.x0, TILE_H);
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < 4; i++) {
      const held = run.holding[i] >= 0;
      const gl = held ? 1 : laneGlow[i];
      if (gl > 0.01) {
        // a pressed lane: one flat tint up from the hit line
        ctx.globalAlpha = gl * (held ? 0.4 : 0.22);
        ctx.fillStyle = held ? LEMON : '#2f5fd0';
        ctx.fillRect(L.x0 + i * L.laneW + 1, HIT_Y - 150, L.laneW - 2, 150 + TILE_H / 2);
        ctx.globalAlpha = 1;
      }
      if (laneBad[i] > 0.01) {
        ctx.globalAlpha = laneBad[i] * 0.35;
        ctx.fillStyle = CORAL;
        ctx.fillRect(L.x0 + i * L.laneW + 1, HIT_Y - TILE_H / 2, L.laneW - 2, TILE_H);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawFx(ctx: CanvasRenderingContext2D): void {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      const k = (wall - f.t) / f.dur;
      if (k >= 1) {
        fx.splice(i, 1);
        continue;
      }
      if (k < 0) continue;
      if (f.kind === 'burst') {
        // the hit flash grows up and down but never out of its own lane
        const w = Math.min(L.laneW - 2, (L.laneW - 8) * (1 + k * 0.12));
        const h = TILE_H * (1 + k * 0.45);
        roundRect(ctx, f.x - w / 2, f.y - h / 2, w, h, 9);
        ctx.globalAlpha = (1 - k) * 0.6;
        ctx.fillStyle = f.color ?? LEMON;
        ctx.fill();
        ctx.globalAlpha = 1 - k;
        inked(ctx, null, 2);
      } else if (f.kind === 'ripple') {
        ctx.globalAlpha = (1 - k) * 0.55;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 8 + k * 30, 0, Math.PI * 2);
        inked(ctx, null, 1.8);
      } else if (f.kind === 'word') {
        const e = k * k * (3 - 2 * k);
        const x = f.x + (f.tx! - f.x) * e;
        const y = f.y + (f.ty! - f.y) * e - Math.sin(k * Math.PI) * 40;
        ctx.globalAlpha = k < 0.8 ? 1 : (1 - k) / 0.2;
        ctx.font = `${Math.round(19 - 4 * e)}px 'Patrick Hand'`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = INK;
        ctx.strokeText(f.text!, x, y);
        ctx.fillStyle = LEMON;
        ctx.fillText(f.text!, x, y);
      } else if (f.kind === 'heart') {
        const y = f.y - k * 150;
        const x = f.x + (f.vx ?? 0) * k + Math.sin((wall - f.t) * 5) * 6;
        ctx.globalAlpha = 1 - k;
        heartPath(ctx, x, y, 9 + 6 * (1 - k));
        inked(ctx, f.color ?? CORAL, 1.4);
      } else if (f.kind === 'drop') {
        ctx.globalAlpha = 1 - k;
        const y = f.y + k * k * 40;
        ctx.beginPath();
        ctx.moveTo(f.x, y - 5);
        ctx.quadraticCurveTo(f.x + 4, y + 2, f.x, y + 4);
        ctx.quadraticCurveTo(f.x - 4, y + 2, f.x, y - 5);
        inked(ctx, '#9fdcff', 1.2);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawCenterText(ctx: CanvasRenderingContext2D, p: number): void {
    const cx = (L.x0 + L.x1) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // count-in
    const b = p / BEAT;
    if (phase === 'song' && b >= 0 && b < 8) {
      const ph = b - Math.floor(b);
      if (b >= 4) {
        const label = ['3', '2', '1', 'Go!'][Math.floor(b) - 4];
        const s = 1 + Math.max(0, 0.35 - ph) * 1.2;
        ctx.save();
        ctx.translate(cx, 190);
        ctx.scale(s, s);
        ctx.globalAlpha = 1 - ph * 0.6;
        ctx.font = "54px 'Leckerli One'";
        ctx.lineWidth = 6;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = INK;
        ctx.strokeText(label, 0, 0);
        ctx.fillStyle = LEMON;
        ctx.fillText(label, 0, 0);
        ctx.restore();
      } else {
        ctx.globalAlpha = Math.min(1, b);
        ctx.font = "20px 'Pacifico'";
        ctx.fillStyle = '#d9465f';
        ctx.fillText('Libby is listening…', cx, 190);
      }
      ctx.globalAlpha = 1;
    }
    // combo
    if (run.combo >= 4 && phase === 'song') {
      const bounce = 1 + 0.22 * Math.max(0, 1 - (wall - lastHitAt) / 0.12);
      ctx.save();
      ctx.translate(cx, 104);
      ctx.scale(bounce, bounce);
      ctx.globalAlpha = 0.3;
      ctx.font = "44px 'Leckerli One'";
      ctx.fillStyle = INK_TEXT;
      ctx.fillText(String(run.combo), 0, 0);
      ctx.globalAlpha = 0.55;
      ctx.font = "14px 'Patrick Hand'";
      ctx.fillStyle = '#d9465f';
      ctx.fillText('COMBO', 0, 28);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // judgement pop
    if (pop) {
      const k = (wall - pop.t) / 0.55;
      if (k >= 1) pop = null;
      else {
        const s = k < 0.15 ? 1.3 - k * 2 : 1;
        ctx.save();
        ctx.translate(cx, HIT_Y - 78);
        ctx.scale(s, s);
        ctx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
        ctx.font = "26px 'Leckerli One'";
        ctx.lineWidth = 5;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = INK;
        ctx.strokeText(pop.text, 0, 0);
        ctx.fillStyle = pop.color;
        ctx.fillText(pop.text, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawSprite(ctx: CanvasRenderingContext2D, path: string, cx: number, bottom: number, h: number, fallback: string): void {
    const img = host.image(path);
    if (img && img.naturalWidth) {
      const w = (img.naturalWidth / img.naturalHeight) * h;
      ctx.drawImage(img, cx - w / 2, bottom - h, w, h);
      return;
    }
    // simple silhouette until the art lands
    roundRect(ctx, cx - 24, bottom - h + 44, 48, h - 44, 14);
    inked(ctx, '#2f5fd0');
    ctx.beginPath();
    ctx.arc(cx, bottom - h + 22, 18, 0, Math.PI * 2);
    inked(ctx, '#f1c7a5');
    ctx.beginPath();
    ctx.arc(cx, bottom - h + 16, 19, Math.PI, 0);
    inked(ctx, fallback);
  }

  function drawLeft(ctx: CanvasRenderingContext2D, p: number): void {
    const x = L.lx + 6;
    const { w } = NL;
    const n = run.nerves / 100;
    drawCard(ctx, x - 6, L.ky, w + 12, NL.h);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = "17px 'Patrick Hand'";
    ctx.fillStyle = INK_TEXT;
    ctx.fillText('Nerves', x + 2, NL.yNerves);
    ctx.font = `${NL.tagPx}px 'Pacifico'`;
    ctx.fillStyle = '#d9465f';
    ctx.textAlign = NL.tagInline ? 'right' : 'left';
    ctx.fillText(TAGLINE, NL.tagInline ? x + w - 2 : x + 2, NL.yTag);
    roundRect(ctx, x, NL.yBar, w, 14, 7);
    ctx.fillStyle = '#ece6d6';
    ctx.fill();
    if (n > 0) {
      const pulse = n < 0.3 ? 0.6 + 0.4 * Math.sin(wall * 12) : 1;
      ctx.globalAlpha = pulse;
      roundRect(ctx, x, NL.yBar, Math.max(14, w * n), 14, 7);
      ctx.fillStyle = n > 0.6 ? MINT : n > 0.3 ? LEMON : CORAL;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    roundRect(ctx, x, NL.yBar, w, 14, 7);
    inked(ctx, null, 1.6);
    // on track? accuracy so far against what Libby needs
    const judgedMax = judgedPoints();
    const acc = judgedMax ? Math.round((100 * run.score) / judgedMax) : 100;
    ctx.textAlign = 'left';
    ctx.font = `${NL.accPx}px 'Patrick Hand'`;
    ctx.fillStyle = acc >= run.thresholdPct ? '#1f8a5b' : '#d9465f';
    ctx.fillText(`Accuracy ${acc}%`, x + 2, NL.yAcc);
    ctx.textAlign = NL.accInline ? 'right' : 'left';
    ctx.font = `${NL.needPx}px 'Patrick Hand'`;
    ctx.fillStyle = 'rgba(43,43,58,0.6)';
    ctx.fillText(`Libby needs ${run.thresholdPct}%`, NL.accInline ? x + w - 2 : x + 2, NL.yNeed);
    // Wes, bobbing to the beat, shaking when nervous
    const b = p / BEAT;
    const ph = b - Math.floor(b);
    const bob = phase === 'song' && b > 0 ? Math.pow(1 - ph, 2) * 3 : 0;
    const shake = n < 0.35 ? Math.sin(wall * 47) * (0.35 - n) * 10 : 0;
    const cx = L.lx + L.lw / 2 + shake;
    const h = charH;
    drawSprite(ctx, WES, cx, 398 + bob * 0.3, h - bob, '#2a211c');
    if (n < 0.5 && phase === 'song' && wall > nextDrop) {
      nextDrop = wall + 0.25 + n;
      fx.push({ kind: 'drop', x: cx + (Math.random() - 0.5) * 34, y: 398 - h + 28, t: wall, dur: 0.6 });
    }
  }

  function drawKaraoke(ctx: CanvasRenderingContext2D, p: number): void {
    const li = phase === 'card' ? 0 : currentLine(p);
    if (li !== shownLine) {
      shownLine = li;
      lineAt = wall;
    }
    const { kx, ky, kw } = L;
    const lay = lineLayout(ctx, li);
    const next = li + 1 < chart.lines.length ? nextLayout(ctx, li + 1) : null;
    // the card hugs its two lines, easing between sizes
    const want = Math.min(cardH, CARD_TOP + lay.height + (next ? 12 + next.height : 0) + 8);
    cardNow = cardNow ? cardNow + (want - cardNow) * 0.2 : want;
    const ch = cardNow;
    drawCard(ctx, kx, ky, kw, ch, 14);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = "14px 'Pacifico'";
    ctx.fillStyle = '#d9465f';
    ctx.fillText("Wes's confession", kx + 12, ky + 21);
    ctx.textAlign = 'right';
    ctx.font = "15px 'Patrick Hand'";
    ctx.fillStyle = 'rgba(43,43,58,0.5)';
    ctx.fillText(`${li + 1}/${chart.lines.length}`, kx + kw - 12, ky + 20);

    // current line, word by word: highlighted gold when hit, faded when missed
    const e = Math.min(1, (wall - lineAt) / 0.25);
    const w0 = chart.lineWord0[li];
    const nextTile = tiles.find((t) => run.result[t.i] === 'pending');
    ctx.font = `${curFont}px 'Patrick Hand'`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const oy = ky + CARD_TOP + curFont * 0.55 + (1 - e) * 14;
    ctx.globalAlpha = e;
    for (let i = 0; i < lay.boxes.length; i++) {
      const b = lay.boxes[i];
      const word = chart.lines[li][i];
      const st = run.words[w0 + i];
      const bx = kx + 12 + b.x;
      const by = oy + b.y;
      if (st === WordState.Hit) {
        // one highlighter stroke across neighbouring hit words on the same row
        const nb = lay.boxes[i + 1];
        const joined = nb && nb.y === b.y && run.words[w0 + i + 1] === WordState.Hit;
        roundRect(ctx, bx - 3, by - curFont * 0.5, joined ? nb.x - b.x + 4 : b.w + 6, curFont * 1.02, 4);
        ctx.fillStyle = LEMON;
        ctx.fill();
        ctx.fillStyle = INK_TEXT;
      } else if (st === WordState.Missed) {
        ctx.fillStyle = 'rgba(43,43,58,0.22)';
      } else {
        const isNext = nextTile && w0 + i >= nextTile.w0 && w0 + i < nextTile.w1;
        if (isNext) {
          ctx.fillStyle = CORAL;
          ctx.fillRect(bx, by + curFont * 0.48, b.w, 2.5);
        }
        ctx.fillStyle = isNext ? INK_TEXT : 'rgba(43,43,58,0.55)';
      }
      ctx.fillText(word, bx, by);
    }
    ctx.globalAlpha = 1;

    // next line, small
    if (next) {
      ctx.font = "15px 'Patrick Hand'";
      const ny = ky + ch - 6 - next.height + 9;
      ctx.fillStyle = 'rgba(58,51,64,0.25)';
      ctx.fillRect(kx + 12, ny - 14, kw - 24, 1);
      ctx.fillStyle = 'rgba(43,43,58,0.42)';
      for (let i = 0; i < next.boxes.length; i++) {
        const b = next.boxes[i];
        ctx.fillText(chart.lines[li + 1][i], kx + 12 + b.x, ny + b.y);
      }
    }

    // Libby, listening below the card
    drawSprite(ctx, LIZ, kx + kw / 2, 398, charH, '#e8692f');
  }

  /** Word boxes of line `i` as the next line (small). */
  function nextLayout(ctx: CanvasRenderingContext2D, i: number): LineLayout {
    let l = nextCache.get(i);
    if (!l) {
      ctx.save();
      ctx.font = "15px 'Patrick Hand'";
      l = layoutWords(ctx, chart.lines[i], L.kw - 24, 18);
      ctx.restore();
      nextCache.set(i, l);
    }
    return l;
  }

  function updateHud(): void {
    const s = `${run.score}|${run.thresholdScore}`;
    if (s === lastHud) return;
    lastHud = s;
    const score = `★ ${run.score.toLocaleString('en-US')}`;
    host.hud.setScore(score);
    if (!heartChip) buildHeartChip();
    const frac = Math.min(1, run.score / run.thresholdScore);
    heartFill!.setAttribute('y', String(20 - frac * 13.8));
    heartFill!.setAttribute('height', String(frac * 13.8 + 0.4));
    heartChip!.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    // the score chip widens as digits arrive, which pushes the heart left
    if (score.length !== scoreLen) {
      scoreLen = score.length;
      fitHud();
    }
    if (run.passed && !heartFullShown && phase === 'song') {
      heartFullShown = true;
      host.toast("Libby's heart is full! Finish the song!");
    }
  }

  /** "Libby's heart": a line-art heart that fills as the score nears what she needs. */
  function buildHeartChip(): void {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ico-svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.width = svg.style.height = '26px';
    const clip = document.createElementNS(ns, 'clipPath');
    clip.id = 'boss-heart-clip';
    const shape = document.createElementNS(ns, 'path');
    shape.setAttribute('d', HEART_PATH);
    clip.appendChild(shape);
    const defs = document.createElementNS(ns, 'defs');
    defs.appendChild(clip);
    heartFill = document.createElementNS(ns, 'rect');
    heartFill.setAttribute('x', '0');
    heartFill.setAttribute('width', '24');
    heartFill.setAttribute('fill', CORAL);
    heartFill.setAttribute('clip-path', 'url(#boss-heart-clip)');
    const outline = document.createElementNS(ns, 'path');
    outline.setAttribute('d', HEART_PATH);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', INK);
    outline.setAttribute('stroke-width', '2');
    outline.setAttribute('stroke-linejoin', 'round');
    svg.append(defs, heartFill, outline);
    heartLabel = el('span', {}, "Libby's heart");
    heartChip = el(
      'div',
      { class: 'hud-chip', 'data-testid': 'boss-heart', role: 'meter', 'aria-label': "Libby's heart", 'aria-valuemin': 0, 'aria-valuemax': 100 },
      svg,
      heartLabel,
    );
    host.hud.custom().appendChild(heartChip);
  }

  /** Keep the HUD's right-hand chips off the lanes: drop the heart's label if it would cross them. */
  function fitHud(): void {
    if (!heartChip || !heartLabel) return;
    const r = host.stage.canvas.getBoundingClientRect();
    const lanesRight = r.left + (L.x1 + 4) * host.stage.scale;
    heartLabel.style.display = '';
    if (heartChip.getBoundingClientRect().left < lanesRight) heartLabel.style.display = 'none';
  }

  /** Max points of the tiles judged so far (for the accuracy readout). */
  let judgedCache = { n: -1, pts: 0 };
  function judgedPoints(): number {
    let n = run.judged * 8;
    for (const h of run.holding) if (h >= 0) n++;
    if (n === judgedCache.n) return judgedCache.pts;
    let pts = 0;
    for (const t of tiles) {
      const r = run.result[t.i];
      if (r === 'pending') continue;
      pts += 100;
      if (t.hold && r !== 'holding') pts += 50;
    }
    judgedCache = { n, pts };
    return pts;
  }

  // ---------------------------------------------------------------- game
  const game: MiniGame = {
    async init(h) {
      host = h;
      await host.load([BG, WES, LIZ]);
      if (destroyed) return;
      rebuild();
      offResize = host.stage.onResize(rebuild);
      host.stage.canvas.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
      updateHud();
      showCard();
    },

    update(dt) {
      wall += dt;
      if (first) {
        // the host starts the level's music track after init; the beat replaces it
        first = false;
        host.audio.stopMusic();
      }
      if (phase === 'song' && portrait()) freeze();
      if (phase === 'song' && clock && !frozen) {
        pos = clock.tick(performance.now());
        beat?.pump();
        if (auto) autoplayStep();
        run.advance(pos - TAP_LAG, evs);
        handleEvents();
        if (run.choked) choke();
        else if (run.finished && pos >= lastEnd + 0.3) endSong();
      } else if ((phase === 'choke' || phase === 'end') && wall >= endAt) {
        finalize();
      } else if (phase === 'end') {
        pos = clock ? clock.tick(performance.now()) : pos;
      }
      const k = Math.exp(-dt * 9);
      for (let i = 0; i < 4; i++) {
        laneGlow[i] *= k;
        laneBad[i] *= k;
      }
      updateHud();
    },

    render(ctx) {
      const { W, H } = host.stage;
      if (!staticLayer || L.W !== W) rebuild();
      ctx.drawImage(staticLayer!, 0, 0, W, H);
      const p = pos;
      drawLanesFx(ctx, p);
      drawCenterText(ctx, p);
      drawTiles(ctx, p);
      drawFx(ctx);
      drawLeft(ctx, p);
      drawKaraoke(ctx, p);
    },

    onPause(p) {
      paused = p;
      if (phase !== 'song') return;
      if (p) {
        freeze();
        resumeCard?.remove();
        resumeCard = null;
      } else {
        void unfreeze();
      }
    },

    destroy() {
      destroyed = true;
      beat?.stop();
      beat = null;
      card?.remove();
      resumeCard?.remove();
      audioCtx?.removeEventListener('statechange', onAudioState);
      offResize?.();
      host.stage.canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },

    debugApi() {
      return {
        state: () => {
          const next = tiles.filter((t) => run.result[t.i] === 'pending').slice(0, 4);
          return {
            phase,
            pos,
            beat: pos / BEAT,
            paused,
            frozen,
            clock: clock?.source ?? null,
            audio: host.audio.ctx?.state ?? null,
            score: run.score,
            maxScore: run.maxScore,
            threshold: run.thresholdScore,
            thresholdPct: run.thresholdPct,
            pct: run.pct,
            nerves: run.nerves,
            combo: run.combo,
            maxCombo: run.maxCombo,
            perfects: run.perfects,
            greats: run.greats,
            misses: run.misses,
            empties: run.empties,
            holdsDone: run.holdsDone,
            judged: run.judged,
            tiles: tiles.length,
            line: shownLine,
            duration: chart.duration,
            autoplay: auto,
            next: next.map((t) => ({ t: t.t, lane: t.lane, hold: t.hold, text: t.text })),
            layout: {
              W: L.W,
              safe: host.stage.safe,
              laneW: L.laneW,
              x0: L.x0,
              x1: L.x1,
              lw: L.lw,
              kx: L.kx,
              ky: L.ky,
              kw: L.kw,
              curFont,
              cardH,
              charH,
              nervesCardH: NL.h,
              tileH: TILE_H,
              speed: SPEED,
              perfect: PERFECT,
              good: GOOD,
              heartLabel: heartLabel?.style.display !== 'none',
            },
            lastTap,
            /** Lane centres and the hit line in client pixels, for test scripts. */
            touch: (() => {
              const r = host.stage.canvas.getBoundingClientRect();
              const k = host.stage.scale;
              return { lanes: [0, 1, 2, 3].map((l) => r.left + laneCenter(L, l) * k), y: r.top + (HIT_Y + 24) * k };
            })(),
          };
        },
        autoplay: (on = true) => {
          auto = on;
          syncAuto();
        },
        start: () => startSong(),
        /** Every tile's time, lane and hold (for scripted real-input playtests). */
        chart: () => tiles.map((t) => ({ t: t.t, lane: t.lane, hold: t.hold })),
        /** Jump to song second `sec`, counting earlier tiles as perfect (for screenshots). */
        seek: (sec: number) => {
          if (phase !== 'song' || frozen) return;
          run.interrupt(pos, evs);
          evs.length = 0;
          pointerLane.clear();
          run.skipTo(sec);
          play(sec);
        },
        /** Render the beat offline; returns 16-bit mono PCM as base64 (for timing analysis). */
        renderBeat: async () => {
          const buf = await Beat.renderOffline(chart);
          const d = buf.getChannelData(0);
          const pcm = new Int16Array(d.length);
          let peak = 0;
          for (let i = 0; i < d.length; i++) {
            peak = Math.max(peak, Math.abs(d[i]));
            pcm[i] = Math.max(-32768, Math.min(32767, Math.round(d[i] * 32767)));
          }
          const bytes = new Uint8Array(pcm.buffer);
          let bin = '';
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return { sampleRate: buf.sampleRate, peak, pcm: btoa(bin), bpm: 60 / BEAT, sections: chart.sections, outroBar: chart.outroBar };
        },
        /** Simulate an iOS audio interruption. */
        suspendAudio: () => host.audio.ctx?.suspend(),
        win: () => host.finish({ outcome: 'win', score: run.maxScore, stars: 5, summary: 'Confession complete!' }),
        lose: () => host.finish({ outcome: 'lose', score: run.score, summary: 'I choked…' }),
      };
    },
  };
  return game;
};
