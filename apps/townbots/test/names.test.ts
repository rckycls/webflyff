import { describe, expect, it } from 'vitest';
import { validateCharacterName } from '@flyffweb/protocol';
import { BotNames, ignName } from '../src/names';

/** Made-up word lists (the real ones are private). */
const WORDS = { adjectives: ['Dark', 'Silent', 'Mad'], nouns: ['Slayer', 'Arrow', 'Wolf', 'Blade'], titles: ['Lord', 'Sir'] };

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** The words a name is made of (capital-led runs), and its digits. */
function parts(name: string): { words: string[]; digits: string } {
  const m = /^((?:[A-Z][a-z]+)+)(\d{2})?$/.exec(name);
  if (m === null) throw new Error(`${name} is not words and two digits`);
  return { words: m[1]!.match(/[A-Z][a-z]+/g)!, digits: m[2] ?? '' };
}

describe('ignName', () => {
  it('gives valid names of 1-3 words', () => {
    const random = seeded(11);
    const all = new Set([...WORDS.adjectives, ...WORDS.nouns, ...WORDS.titles]);
    const sizes = new Set<number>();
    let withDigits = 0;
    for (let i = 0; i < 500; i++) {
      const name = ignName(WORDS, random);
      expect(validateCharacterName(name)).toBeUndefined();
      const { words, digits } = parts(name);
      expect(words.length).toBeGreaterThanOrEqual(1);
      expect(words.length).toBeLessThanOrEqual(3);
      for (const w of words) expect(all.has(w)).toBe(true);
      sizes.add(words.length);
      if (digits !== '') withDigits++;
    }
    expect([...sizes].sort()).toEqual([1, 2, 3]);
    expect(withDigits).toBeGreaterThan(60);
    expect(withDigits).toBeLessThan(200);
  });

  it('takes lower-case words and stays within 16 letters with long ones', () => {
    const long = { adjectives: ['thunderous'], nouns: ['executioner', 'wolf'], titles: ['grandmaster'] };
    const random = seeded(3);
    for (let i = 0; i < 200; i++) {
      const name = ignName(long, random);
      expect(validateCharacterName(name)).toBeUndefined();
      expect(name[0]).toMatch(/[A-Z]/);
    }
  });
});

describe('BotNames', () => {
  it("knows each bot by its live name: a bot's new name in, its old one out", () => {
    const names = new BotNames();
    names.set('bot01', 'Abcd');
    names.set('bot02', 'Efgh');
    expect(names.has('ABCD')).toBe(true);
    names.set('bot01', 'DarkWolf');
    expect(names.has('abcd')).toBe(false);
    expect(names.has('darkwolf')).toBe(true);
    expect(names.has('Efgh')).toBe(true);
    expect(names.nameOf('bot01')).toBe('DarkWolf');
  });
});
