import { describe, expect, it } from 'vitest';
import { MOOD_PORTRAITS, portraitPath } from '../src/data/portraits';
import { SPEAKER_NAMES } from '../src/data/story';

// every portrait image shipped in public/img/portraits, as 'img/portraits/<id>.webp'
const onDisk = new Set(
  Object.keys(import.meta.glob('../public/img/portraits/*.webp')).map((p) => p.replace('../public/', '')),
);
const ids = [...onDisk].map((p) => p.slice('img/portraits/'.length, -'.webp'.length));
const speakers = new Set(Object.keys(SPEAKER_NAMES));

describe('portraits', () => {
  it('lists exactly the mood variants that exist on disk', () => {
    expect(new Set(ids.filter((id) => !speakers.has(id)))).toEqual(new Set(MOOD_PORTRAITS));
  });

  it('every mood variant belongs to a speaker with a base portrait', () => {
    for (const v of MOOD_PORTRAITS) {
      const who = [...speakers].filter((s) => v.startsWith(`${s}-`)).sort((a, b) => b.length - a.length)[0];
      expect(who, v).toBeDefined();
      expect(ids, v).toContain(who);
    }
  });

  it('resolves to a file that exists, falling back to the base portrait', () => {
    expect(portraitPath('wes-kid', 'happy')).toBe('img/portraits/wes-kid.webp');
    expect(portraitPath('liz-kid', 'mad')).toBe('img/portraits/liz-kid-mad.webp');
    expect(portraitPath('liz')).toBe('img/portraits/liz.webp');
    for (const who of ids.filter((id) => speakers.has(id))) {
      for (const mood of [undefined, 'happy', 'sad', 'mad']) {
        expect(onDisk.has(portraitPath(who, mood)), `${who} ${mood}`).toBe(true);
      }
    }
  });
});
