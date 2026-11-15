import { describe, expect, it } from 'vitest';
import { farmBlocked, potsBlocked } from '../src/world/autoplay/zones';

describe('Auto Play zones (custom, owner 2026-11-15: open fields only, no pots in PvP)', () => {
  it('Madrigal (1) farms and allows pots', () => {
    expect(farmBlocked(1, false)).toBe(false);
    expect(potsBlocked(1, false)).toBe(false);
  });

  it('the Arena, siege, Quiz, 1:1 guild war, instances, secret rooms and the master dungeon block farming', () => {
    for (const id of [208, 202, 211, 241, 242, 243, 244, 121, 122, 123, 124, 125, 151, 160, 167, 200]) {
      expect(farmBlocked(id, false), `world ${id}`).toBe(true);
    }
  });

  it('a duel blocks both', () => {
    expect(farmBlocked(1, true)).toBe(true);
    expect(potsBlocked(1, true)).toBe(true);
  });

  it('pots: the Quiz and instances allowed; the Arena, siege and 1:1 guild war blocked', () => {
    for (const id of [211, 121, 151, 200]) expect(potsBlocked(id, false), `world ${id}`).toBe(false);
    for (const id of [208, 202, 241, 244]) expect(potsBlocked(id, false), `world ${id}`).toBe(true);
  });
});
