/**
 * Save data: progress, inventory, songs. Persisted to localStorage.
 *
 * Inventory rules from the deck: the cap, bat, boombox and jersey can each
 * be equipped and used only once. One item is equipped at a time; using it
 * from the on-screen item button consumes it. The hidden Chuck
 * Taylors are permanent and toggle double speed.
 */
import { LEVELS, SIDE_QUESTS, type ItemId, type LevelId, type SongId } from '../data/story';

export type ItemState = 'none' | 'owned' | 'used';

export interface LevelRecord {
  done: boolean;
  plays: number;
  bestStars?: number;
  bestScore?: number;
  /** Level-specific outcome flags, e.g. { noHit: true }. */
  flags?: Record<string, boolean>;
}

export interface SaveData {
  version: 1;
  levels: Partial<Record<LevelId, LevelRecord>>;
  songs: SongId[];
  /** Songs whose reward screen has been claimed (blue button). */
  items: Record<ItemId, ItemState>;
  equipped: ItemId | null;
  chucks: 'none' | 'found';
  chucksOn: boolean;
  /** Libby's heart, 0..100. Grows with levels and side quests. */
  heart: number;
  flags: Record<string, boolean>;
  settings: { music: boolean; sfx: boolean; voice: boolean; autoNarrate: boolean };
}

const KEY = 'wes-liz-save-v1';

export function freshSave(): SaveData {
  return {
    version: 1,
    levels: {},
    songs: [],
    items: { cap: 'none', bat: 'none', boombox: 'none', jersey: 'none' },
    equipped: null,
    chucks: 'none',
    chucksOn: false,
    heart: 0,
    flags: {},
    settings: { music: true, sfx: true, voice: true, autoNarrate: false },
  };
}

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const data = JSON.parse(raw) as SaveData;
    const base = freshSave();
    return {
      ...base,
      ...data,
      items: { ...base.items, ...data.items },
      settings: { ...base.settings, ...data.settings },
      flags: { ...data.flags },
      levels: { ...data.levels },
    };
  } catch {
    return freshSave();
  }
}

type Listener = (s: SaveData) => void;

class SaveStore {
  data: SaveData = load();
  private listeners: Listener[] = [];

  persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* private mode / quota: keep playing in memory */
    }
    for (const fn of this.listeners) fn(this.data);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((f) => f !== fn));
  }

  reset(): void {
    const settings = this.data.settings;
    this.data = freshSave();
    this.data.settings = settings;
    this.persist();
  }

  hasProgress(): boolean {
    return Object.keys(this.data.levels).length > 0 || this.data.flags.prologueSeen === true;
  }

  // --------------------------------------------------------------- levels
  isDone(id: LevelId): boolean {
    return !!this.data.levels[id]?.done;
  }

  isUnlocked(id: LevelId): boolean {
    return LEVELS[id].requires.every((r) => this.isDone(r));
  }

  record(id: LevelId): LevelRecord {
    return (this.data.levels[id] ??= { done: false, plays: 0 });
  }

  // ---------------------------------------------------------------- songs
  hasSong(id: SongId): boolean {
    return this.data.songs.includes(id);
  }

  addSong(id: SongId): boolean {
    if (this.hasSong(id)) return false;
    this.data.songs.push(id);
    this.persist();
    return true;
  }

  // ---------------------------------------------------------------- items
  grantItem(id: ItemId): boolean {
    if (this.data.items[id] !== 'none') return false;
    this.data.items[id] = 'owned';
    this.persist();
    return true;
  }

  /** Equip an owned, unused item (replaces any other equipped item). */
  equip(id: ItemId | null): void {
    if (id && this.data.items[id] !== 'owned') return;
    this.data.equipped = id;
    this.persist();
  }

  /** Consume the equipped item. Returns the item used, or null. */
  useEquipped(): ItemId | null {
    const id = this.data.equipped;
    if (!id || this.data.items[id] !== 'owned') return null;
    this.data.items[id] = 'used';
    this.data.equipped = null;
    this.persist();
    return id;
  }

  findChucks(): void {
    this.data.chucks = 'found';
    this.data.chucksOn = true;
    this.persist();
  }

  setChucks(on: boolean): void {
    if (this.data.chucks !== 'found') return;
    this.data.chucksOn = on;
    this.persist();
  }

  speedMultiplier(): number {
    return this.data.chucks === 'found' && this.data.chucksOn ? 2 : 1;
  }

  allSideQuestsDone(): boolean {
    return SIDE_QUESTS.every((id) => this.isDone(id));
  }

  addHeart(n: number): void {
    this.data.heart = Math.max(0, Math.min(100, this.data.heart + n));
    this.persist();
  }

  setFlag(name: string, v = true): void {
    this.data.flags[name] = v;
    this.persist();
  }
}

export const save = new SaveStore();
