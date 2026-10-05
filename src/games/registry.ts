/** Lazy-loaded mini games, one folder per level. */
import type { LevelId } from '../data/story';
import type { MiniGameFactory } from './types';

type Loader = () => Promise<{ default: MiniGameFactory }>;

export const GAMES: Record<LevelId, Loader> = {
  l1: () => import('./l1-frog'),
  l2: () => import('./l2-gnome'),
  l3: () => import('./l3-maze'),
  l4: () => import('./l4-dress'),
  l5: () => import('./l5-dodge'),
  l6: () => import('./l6-ketchup'),
  boss: () => import('./boss-tiles'),
  sq1: () => import('./sq1-dinner'),
  sq2: () => import('./sq2-helena'),
  sq3: () => import('./sq3-storm'),
};
