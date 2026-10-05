/**
 * "The Liz and Wes Playlist": every song collected so far, written on the
 * hand-drawn CD from the deck. The red button plays a 30-second Apple
 * Music preview (needs internet).
 */
import { audio } from '../core/audio';
import { save } from '../core/save';
import { BONUS_SONGS, PLAYLIST_ORDER, SONGS, type SongId } from '../data/story';
import previews from '../data/previews.json';
import { cdPlaylist, closeX, recordSleeve, vinyl } from '../ui/decor';
import { asset, el, modal, toast } from '../ui/dom';
import { icon } from '../ui/icons';

// Only the 30-second audio previews come from Apple; no artwork is shown.
type Preview = { previewUrl?: string; trackViewUrl?: string };
const PREVIEWS = previews as Record<string, Preview>;

async function findPreview(id: SongId): Promise<Preview | null> {
  const known = PREVIEWS[id];
  if (known?.previewUrl) return known;
  try {
    const q = encodeURIComponent(SONGS[id].search);
    const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`);
    const data = await res.json();
    const hit = data.results?.[0];
    if (!hit?.previewUrl) return null;
    return { previewUrl: hit.previewUrl, trackViewUrl: hit.trackViewUrl };
  } catch {
    return null;
  }
}

/** Play a song preview; shows a toast if it can't (or, unless quiet, what's playing). */
export async function playSongPreview(parent: HTMLElement, id: SongId, onEnd?: () => void, opts: { quiet?: boolean } = {}): Promise<boolean> {
  const s = SONGS[id];
  const p = await findPreview(id);
  if (!p?.previewUrl) {
    toast(parent, 'Connect to the internet to hear song previews.');
    audio.sfx('error');
    return false;
  }
  const ok = await audio.playPreview(p.previewUrl, onEnd);
  if (ok && !opts.quiet) toast(parent, `Now playing: ${s.title} — ${s.artist}`);
  else if (!ok) toast(parent, 'Could not play the preview.');
  return ok;
}

/** Red play/stop button shared by the playlist, rewards and ending. */
export function songPlayButton(
  parent: HTMLElement,
  id: SongId,
  opts: { id?: string; label?: boolean; text?: string; onState?: (playing: boolean) => void } = {},
): HTMLButtonElement {
  const s = SONGS[id];
  const b = el('button', { class: `btn red play-btn${opts.label ? '' : ' round'}`, 'data-testid': opts.id ?? `play-${id}`, 'aria-label': `Play ${s.title}` });
  let playing = false;
  const set = (on: boolean) => {
    playing = on;
    b.classList.toggle('playing', on);
    b.setAttribute('aria-label', `${on ? 'Stop' : 'Play'} ${s.title}`);
    b.replaceChildren(el('span', { class: 'ico' }, icon(on ? 'stop' : 'play', { fill: 'currentColor' })), opts.label ? (on ? 'Stop' : opts.text ?? 'Play') : '');
    opts.onState?.(on);
  };
  set(false);
  b.addEventListener('click', async () => {
    audio.sfx('click');
    if (playing) {
      audio.stopPreview();
      set(false);
      return;
    }
    set(true);
    const ok = await playSongPreview(parent, id, () => set(false), { quiet: true });
    if (!ok) set(false);
  });
  return b;
}

export function openSoundtrack(parent: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    let playing: SongId | null = null;
    const complete = !!save.data.flags.gameComplete;
    const ids = [...PLAYLIST_ORDER, ...(complete ? BONUS_SONGS : [])];
    const count = ids.filter((id) => save.hasSong(id)).length;
    const cd = el('div', { class: 'st-cd' }, vinyl('st-vinyl'), cdPlaylist('st-cdimg'));
    const now = el('div', { class: 'st-now', 'aria-live': 'polite' });
    const rows = el('div', { class: 'playlist' });

    const renderNow = () => {
      cd.classList.toggle('spinning', !!playing);
      now.replaceChildren(
        ...(playing
          ? [el('span', { class: 'eq' }, el('i'), el('i'), el('i')), el('span', {}, el('b', {}, SONGS[playing].title), ` · ${SONGS[playing].artist}`)]
          : [el('span', {}, `${count} of ${ids.length} songs collected`)]),
      );
    };

    const row = (id: SongId, n: number) => {
      const s = SONGS[id];
      const have = save.hasSong(id);
      const isPlaying = playing === id;
      const btn = el('button', {
        class: `btn red round play-btn${isPlaying ? ' playing' : ''}`,
        'data-testid': `song-play-${id}`,
        'aria-label': `${isPlaying ? 'Stop' : 'Play'} ${have ? s.title : 'locked song'}`,
        title: have ? `Play ${s.title}` : 'Locked',
      }, el('span', { class: 'ico' }, icon(isPlaying ? 'stop' : 'play', { fill: 'currentColor' })));
      if (!have) btn.disabled = true;
      btn.addEventListener('click', async () => {
        audio.sfx('click');
        if (playing === id) {
          playing = null;
          audio.stopPreview();
          renderRows();
          return;
        }
        playing = id;
        renderRows();
        const ok = await playSongPreview(parent, id, () => {
          if (playing === id) playing = null;
          renderRows();
        }, { quiet: true });
        if (!ok && playing === id) {
          playing = null;
          renderRows();
        }
      });
      return el(
        'div',
        { class: `playlist-row${have ? '' : ' locked'}${isPlaying ? ' playing' : ''}`, 'data-testid': `song-${id}` },
        el('span', { class: 'pl-num' }, String(n + 1).padStart(2, '0')),
        have ? recordSleeve(id, 'pl-art', { mini: true }) : el('span', { class: 'art pl-art pl-lock' }, icon('lock')),
        el(
          'span',
          { class: 'pl-text' },
          el('span', { class: 'pl-title' }, have ? s.title : '? ? ?'),
          el('span', { class: 'pl-artist' }, have ? s.artist : `Earned in ${s.source.replace(/^Side Quest: /, 'the side quest ').replace(/^Secret: /, 'a secret: ')}`),
        ),
        isPlaying ? el('span', { class: 'eq small' }, el('i'), el('i'), el('i')) : null,
        btn,
      );
    };

    const renderRows = () => {
      const list: Node[] = PLAYLIST_ORDER.map((id, n) => row(id, n));
      list.push(el('div', { class: 'pl-section' }, complete ? 'Bonus tracks' : '+ 12 bonus tracks when you finish the story'));
      if (complete) list.push(...BONUS_SONGS.map((id, n) => row(id, PLAYLIST_ORDER.length + n)));
      rows.replaceChildren(...list);
      renderNow();
    };
    renderRows();

    const done = () => {
      audio.stopPreview();
      close();
      resolve();
    };
    const close = modal(
      parent,
      el(
        'div',
        { class: 'soundtrack', 'data-testid': 'soundtrack' },
        closeX(done, 'soundtrack-close'),
        el(
          'div',
          { class: 'st-side' },
          cd,
          now,
          el('p', { class: 'pl-note' }, 'Song previews courtesy of Apple Music'),
        ),
        el(
          'div',
          { class: 'st-main' },
          el('h2', { class: 'brush-title st-title' }, 'The Liz and Wes Playlist'),
          el('div', { class: 'paper lined st-paper scrollable' }, rows),
        ),
      ),
      { onBackdrop: done, class: 'panel st-panel' },
    );
  });
}

export { asset };
