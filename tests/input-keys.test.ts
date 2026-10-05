import { describe, expect, it } from 'vitest';
import { keyLabel } from '../src/core/input';
import { LEVELS } from '../src/data/story';

describe('keyboard hints', () => {
  it('labels key codes the way a keycap reads', () => {
    expect(keyLabel('Space')).toBe('Space');
    expect(keyLabel('KeyZ')).toBe('Z');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('Enter')).toBe('Enter');
  });

  it('lists keys for every level that has keyboard controls', () => {
    for (const id of ['l1', 'l3', 'l5', 'boss', 'sq3'] as const) {
      const keys = LEVELS[id].keys;
      expect(keys?.length, id).toBeGreaterThan(0);
      for (const k of keys!) {
        expect(k.keys.length, id).toBeGreaterThan(0);
        expect(k.does.trim(), id).not.toBe('');
      }
    }
  });
});
