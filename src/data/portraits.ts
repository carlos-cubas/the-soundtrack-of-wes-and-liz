/**
 * Which character portraits exist in public/img/portraits, so screens only
 * request files that are there (a missing mood falls back to the base
 * portrait without a 404). tests/portraits.test.ts keeps this in sync.
 */

/** `${who}-${mood}` variants that have their own image. */
export const MOOD_PORTRAITS: ReadonlySet<string> = new Set([
  'helena-happy',
  'jocelyn-happy',
  'jocelyn-mad',
  'liz-happy',
  'liz-kid-mad',
  'liz-mad',
  'liz-sad',
  'wes-happy',
]);

/** A character's portrait: the mood variant when one exists, else the base portrait. */
export function portraitPath(who: string, mood?: string): string {
  const id = mood && MOOD_PORTRAITS.has(`${who}-${mood}`) ? `${who}-${mood}` : who;
  return `img/portraits/${id}.webp`;
}
