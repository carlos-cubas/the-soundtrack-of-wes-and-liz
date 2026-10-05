/**
 * Game host screen: runs one MiniGame on a full-screen canvas with the HUD,
 * pause menu, narration replay (orange) and the on-screen item button.
 */
import { app } from '../core/app';
import { audio } from '../core/audio';
import { Input } from '../core/input';
import { save } from '../core/save';
import { Stage } from '../core/stage';
import { ITEMS, type ItemId, type LevelDef } from '../data/story';
import { GAMES } from '../games/registry';
import type { GameHost, GameResult, MiniGame } from '../games/types';
import { asset, banner, button, el, getImage, glyph, iconButton, loadImage, modal, toast } from '../ui/dom';
import { Hud } from '../ui/hud';
import { openInventory } from './inventory';
import { replayNarration } from './narration';

export type PlayOutcome = GameResult | { outcome: 'quit' } | { outcome: 'restart' };

export function runGame(level: LevelDef): Promise<PlayOutcome> {
  return new Promise((resolve) => {
    const root = el('div', { class: 'screen play-screen', 'data-testid': `play-${level.id}` });
    const stage = new Stage(root);
    const dom = el('div', { class: 'game-dom' });
    root.appendChild(dom);
    const hud = new Hud(root);
    const input = new Input(stage);
    let game: MiniGame | null = null;
    /** True once init() resolved: input, items and frames only reach a ready game. */
    let ready = false;
    let finished = false;
    let paused = false;
    let raf = 0;
    let last = performance.now();
    let time = 0;
    let closeMenu: (() => void) | null = null;

    hud.setTitle(level.title);

    // ---- item button (side quests only) ----
    const itemBtn = el('button', { class: 'item-use', 'data-testid': 'item-use', style: 'display:none' });
    root.appendChild(itemBtn);
    const refreshItem = () => {
      const eq = save.data.equipped;
      if (level.kind !== 'side' || !eq) {
        itemBtn.style.display = 'none';
        return;
      }
      itemBtn.style.display = '';
      itemBtn.replaceChildren(
        el('img', { src: asset(ITEMS[eq].icon), alt: '' }),
        el('span', {}, `Use ${ITEMS[eq].name}`),
      );
    };
    itemBtn.addEventListener('click', () => {
      const eq = save.data.equipped;
      if (!eq || !game || !ready || paused || finished) return;
      const ok = game.onItemUse?.(eq) ?? false;
      if (ok) {
        save.useEquipped();
        audio.sfx('unlock');
        toast(root, `${ITEMS[eq].name} used!`);
        refreshItem();
      } else {
        audio.sfx('error');
        toast(root, `Can't use the ${ITEMS[eq].name} right now.`);
      }
    });
    refreshItem();

    // ---- pause menu ----
    const pauseBtn = iconButton('⏸', () => setPaused(true), { title: 'Pause', id: 'pause' });
    const narrBtn = el('button', { class: 'icon-btn', style: 'background:var(--btn-orange);color:#fff', title: 'Hear the narration', 'aria-label': 'Hear the narration', 'data-testid': 'hud-narration' }, glyph('🔊'));
    narrBtn.addEventListener('click', () => {
      audio.sfx('click');
      setPaused(true, false);
      replayNarration(root, level).then(() => setPaused(false));
    });
    hud.left.append(pauseBtn, narrBtn);

    function setPaused(p: boolean, showMenu = true) {
      if (finished || p === paused) return;
      paused = p;
      input.reset();
      game?.onPause?.(p);
      if (p && showMenu) openPauseMenu();
      if (!p) {
        closeMenu?.();
        closeMenu = null;
        menuOpen = false;
        last = performance.now();
      }
    }

    /** True while the pause menu itself (not a screen opened from it) is showing. */
    let menuOpen = false;
    function openPauseMenu() {
      menuOpen = true;
      const body = el(
        'div',
        {},
        el('h2', { class: 'title-text' }, 'Paused'),
        el('p', {}, `${level.label}: ${level.title}`),
        el(
          'div',
          { class: 'row' },
          button('Resume', () => setPaused(false), { color: 'green', icon: '▶', id: 'resume' }),
          button('Narration', () => {
            closeMenu?.();
            menuOpen = false;
            replayNarration(root, level).then(() => openPauseMenu());
          }, { color: 'orange', icon: '🔊' }),
          button('Inventory', () => {
            closeMenu?.();
            menuOpen = false;
            openInventory(root).then(() => {
              refreshItem();
              openPauseMenu();
            });
          }, { color: 'blue', icon: '🎒' }),
        ),
        el(
          'div',
          { class: 'row' },
          button('Restart', () => end({ outcome: 'restart' }), { color: 'gray', small: true, icon: '↻', id: 'restart' }),
          button('Quit to map', () => end({ outcome: 'quit' }), { color: 'gray', small: true, icon: '🗺', id: 'quit' }),
        ),
      );
      closeMenu = modal(root, body);
    }

    const onVis = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener('visibilitychange', onVis);
    // desktop: clicking away from the window pauses, and Esc or P toggles the pause menu
    const onWinBlur = () => setPaused(true);
    window.addEventListener('blur', onWinBlur);
    const onPauseKey = (e: KeyboardEvent) => {
      if (e.repeat || !ready || (e.code !== 'Escape' && e.code !== 'KeyP')) return;
      if (!paused) setPaused(true);
      else if (menuOpen) setPaused(false);
    };
    window.addEventListener('keydown', onPauseKey);
    // Same query as the CSS rotate hint: while it covers the game, pause it.
    const portrait = window.matchMedia('(max-aspect-ratio: 5/4)');
    const onOrient = () => {
      if (portrait.matches) setPaused(true);
    };
    portrait.addEventListener('change', onOrient);

    // ---- host ----
    const host: GameHost = {
      stage,
      input,
      audio,
      dom,
      hud,
      level,
      get speed() {
        return save.speedMultiplier();
      },
      get equipped(): ItemId | null {
        return save.data.equipped;
      },
      get time() {
        return time;
      },
      debug: app.debug,
      image: (p) => getImage(p),
      load: async (paths) => {
        await Promise.all(paths.map((p) => loadImage(p)));
      },
      banner: (t) => banner(root, t),
      toast: (t) => toast(root, t),
      finish: (r) => end(r),
    };

    function end(r: PlayOutcome) {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      closeMenu?.();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onWinBlur);
      window.removeEventListener('keydown', onPauseKey);
      portrait.removeEventListener('change', onOrient);
      try {
        game?.destroy();
      } catch (e) {
        console.error(e);
      }
      input.destroy();
      stage.destroy();
      hud.destroy();
      audio.setRain(false);
      delete (window as any).__game;
      // small delay lets win/lose banners breathe
      resolve(r);
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!game || !ready) return;
      if (!paused) {
        time += dt;
        try {
          game.update(dt);
        } catch (e) {
          console.error(e);
        }
        input.endFrame();
      }
      if (finished) return;
      const ctx = stage.begin();
      try {
        game.render(ctx);
      } catch (e) {
        console.error(e);
      }
    }

    app.show({
      el: root,
      destroy: () => {
        if (!finished) end({ outcome: 'quit' });
      },
    });

    GAMES[level.id]()
      .then(async (mod) => {
        game = mod.default(level);
        await game.init(host);
        if (finished) return;
        ready = true;
        (window as any).__game = {
          level: level.id,
          finish: (r: GameResult) => end(r),
          pause: () => setPaused(true),
          ...(game.debugApi?.() ?? {}),
        };
        audio.playMusic(level.music);
        last = performance.now();
        raf = requestAnimationFrame(frame);
      })
      .catch((e) => {
        console.error('Failed to start game', e);
        toast(root, 'Could not start this level.');
        end({ outcome: 'quit' });
      });
  });
}
