import { describe, expect, it } from 'vitest';
import { validateCharacterName } from '@flyffweb/protocol';
import { pickNames, styleName } from '../src/names';
import { hasOneCapital } from '../src/settings';

/** A seeded stand-in for Math.random. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('styleName', () => {
  it('makes the letter at the random place capital, the rest lower case', () => {
    expect(styleName('Mikasa', () => 0.5)).toBe('mikAsa');
    expect(styleName('LUFFY', () => 0)).toBe('Luffy');
    expect(styleName('luffy', () => 0.999)).toBe('luffY');
  });

  it('always gives a name the game takes, with one capital', () => {
    const random = seeded(7);
    for (let i = 0; i < 200; i++) {
      const name = styleName(['tanjiro', 'nezuko', 'kaguya', 'violet', 'rimuru'][i % 5]!, random);
      expect(validateCharacterName(name)).toBeUndefined();
      expect(hasOneCapital(name)).toBe(true);
    }
  });
});

describe('pickNames', () => {
  it('skips names taken already, compared lower case, and names the game refuses', () => {
    const taken = new Set(['mikasa']);
    const picked = pickNames(['Mikasa', 'Ann', 'Levi7', 'Tanjiro', 'Kaguya'], 2, (name) => taken.has(name.toLowerCase()));
    expect(picked).toEqual(['Tanjiro', 'Kaguya']);
  });

  it('never gives the same name twice', () => {
    const picked = pickNames(['Rimuru', 'rimuru', 'Violet'], 2, () => false);
    expect(picked).toEqual(['Rimuru', 'Violet']);
  });

  it('throws when the list runs out', () => {
    expect(() => pickNames(['Rimuru'], 2, () => false)).toThrow(/names/);
  });
});
