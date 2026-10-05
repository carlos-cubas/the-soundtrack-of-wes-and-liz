/**
 * Level flow: narration → how to play → game → result → rewards → outro → map.
 * Reward rules from the deck live here.
 */
import { audio } from '../core/audio';
import { save } from '../core/save';
import { BONUS_SONGS, CHUCKS_REVEAL, LEVELS, type ItemId, type LevelId } from '../data/story';
import type { GameResult } from '../games/types';
import { showDialogue } from './dialogue';
import { showEnding } from './ending';
import { showMap } from './map';
import { showNarration } from './narration';
import { runGame } from './play';
import { showResult } from './result';
import { showRewards, type Reward } from './reward';

/** Which item a level grants for a given result (deck rules). */
export function itemFor(id: LevelId, r: GameResult): ItemId | null {
  switch (id) {
    case 'l3':
      return r.outcome === 'win' ? 'bat' : null; // escape the maze on time
    case 'l4':
      return r.outcome === 'win' ? 'boombox' : null; // 5 stars in 2 of 3 rounds
    case 'l5':
      return r.flags?.noHit ? 'cap' : null; // all ten rounds without a hit
    case 'l6':
      return r.flags?.allHigh ? 'jersey' : null; // high rating on all five
    default:
      return null;
  }
}

/** Apply a completed result to the save and list what the player earned. */
export function applyResult(id: LevelId, r: GameResult): { rewards: Reward[]; unlocked: LevelId[] } {
  const level = LEVELS[id];
  const before = (Object.keys(LEVELS) as LevelId[]).filter((l) => save.isUnlocked(l));
  const rec = save.record(id);
  const first = !rec.done;
  rec.done = true;
  rec.plays++;
  if (r.stars !== undefined) rec.bestStars = Math.max(rec.bestStars ?? 0, r.stars);
  if (r.score !== undefined) rec.bestScore = Math.max(rec.bestScore ?? 0, r.score);
  rec.flags = { ...rec.flags, ...r.flags };

  const rewards: Reward[] = [];
  if (!save.hasSong(level.song)) rewards.push({ kind: 'song', id: level.song });
  const item = itemFor(id, r);
  if (item && save.data.items[item] === 'none') rewards.push({ kind: 'item', id: item });

  if (first) save.addHeart(level.kind === 'side' ? 15 : level.kind === 'boss' ? 0 : 10);
  if (id === 'l4' && r.outcome === 'win') save.setFlag('jocelynBlessing');
  if (id === 'l5' && r.outcome === 'alt') save.setFlag('noseHit');
  if (save.allSideQuestsDone() && save.data.chucks === 'none') save.setFlag('chucksReady');
  if (id === 'boss') {
    save.setFlag('gameComplete');
    for (const b of BONUS_SONGS) if (!save.hasSong(b)) save.data.songs.push(b);
  }
  save.persist();
  const unlocked = (Object.keys(LEVELS) as LevelId[]).filter((l) => save.isUnlocked(l) && !before.includes(l));
  return { rewards, unlocked };
}

export async function playLevel(id: LevelId): Promise<void> {
  const level = LEVELS[id];
  // decode the level's music while the narration is on screen
  void audio.preloadMusic?.(level.music);
  const go = await showNarration(level, { howTo: true });
  if (go === 'back') return showMap();
  for (;;) {
    const r = await runGame(level);
    if (r.outcome === 'quit') return showMap();
    if (r.outcome === 'restart') continue;
    if (r.outcome === 'lose') {
      const choice = await showResult(level, r);
      if (choice === 'retry') continue;
      return showMap();
    }
    const { rewards, unlocked } = applyResult(id, r);
    await showResult(level, r);
    if (rewards.length) await showRewards(rewards);
    const outro = r.outcome === 'alt' && level.outroAlt ? level.outroAlt : level.outro;
    await showDialogue(outro, { scene: level.scene });
    if (id === 'boss') return showEnding();
    return showMap({ completed: id, unlocked });
  }
}

/** The hidden Chuck Taylors, found in the back of Wesley's car. */
export async function revealChucks(): Promise<void> {
  await showDialogue(CHUCKS_REVEAL, { scene: 'img/scenes/chucks.webp' });
  save.findChucks();
  save.setFlag('chucksReady', false);
  const rewards: Reward[] = [{ kind: 'chucks' }];
  if (!save.hasSong('paperrings')) rewards.push({ kind: 'song', id: 'paperrings' });
  await showRewards(rewards);
  return showMap();
}
