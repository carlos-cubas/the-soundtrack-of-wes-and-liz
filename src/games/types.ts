/**
 * The contract every mini game implements. See docs/SPEC.md.
 *
 * A game draws on a canvas in virtual units: `host.stage.W` wide (about
 * 711–870 depending on the phone) by 400 tall, landscape. Games that are
 * mostly UI (dress-up, puzzles, dialogue choices) may build DOM inside
 * `host.dom` instead and leave `render` mostly empty.
 */
import type { AudioEngine } from '../core/audio';
import type { Input } from '../core/input';
import type { Stage } from '../core/stage';
import type { ItemId, LevelDef } from '../data/story';
import type { Hud } from '../ui/hud';

export interface GameResult {
  /**
   * win  = objective met.
   * lose = failed; the player is offered a retry.
   * alt  = finished with the story's alternative outcome (Level 5: Liz got
   *        hit, so Wes drives her to the hospital). Counts as complete.
   */
  outcome: 'win' | 'lose' | 'alt';
  /** 0..5 rating, if the game has one. */
  stars?: number;
  score?: number;
  /** Outcome flags read by reward rules, e.g. { noHit: true }, { allHigh: true }. */
  flags?: Record<string, boolean>;
  /** One line for the result card ("Escaped with 4.2s to spare!"). */
  summary?: string;
}

export interface GameHost {
  readonly stage: Stage;
  readonly input: Input;
  readonly audio: AudioEngine;
  /** DOM layer above the canvas (pointer-events enabled on children). */
  readonly dom: HTMLElement;
  readonly hud: Hud;
  readonly level: LevelDef;
  /** 2 when the Chuck Taylors are equipped, else 1. Multiply movement speed. */
  readonly speed: number;
  /** Equipped side-quest item (cap, bat, boombox, jersey) or null. */
  readonly equipped: ItemId | null;
  /** Seconds of unpaused play since the game started. */
  readonly time: number;
  readonly debug: boolean;
  /** Synchronously get a preloaded image (null if missing: draw a fallback). */
  image(path: string): HTMLImageElement | null;
  /** Preload images; never rejects. */
  load(paths: string[]): Promise<void>;
  /** Big animated banner text. */
  banner(text: string): void;
  toast(text: string): void;
  /** End the game. Safe to call once; later calls are ignored. */
  finish(result: GameResult): void;
}

export interface MiniGame {
  /** Called once before the first frame. Preload assets here. */
  init(host: GameHost): void | Promise<void>;
  /** dt in seconds, clamped to at most 1/20. Not called while paused. */
  update(dt: number): void;
  /** Draw the frame. The transform is already set to virtual units. */
  render(ctx: CanvasRenderingContext2D): void;
  /**
   * The player pressed the item button with `item` equipped (side quests).
   * Return true if the item took effect; the host then consumes it.
   */
  onItemUse?(item: ItemId): boolean;
  onPause?(paused: boolean): void;
  destroy(): void;
  /** Hooks for automated tests, exposed as window.__game. */
  debugApi?(): Record<string, unknown>;
}

export type MiniGameFactory = (level: LevelDef) => MiniGame;
