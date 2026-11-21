import { describe, expect, it } from 'vitest';
import { validateCharacterName } from '@flyffweb/protocol';
import { BotNames, ignName } from '../src/names';

/** Made-up word lists (the real ones are private). */
const WORDS = {
  names: ['vorin', 'kaleth', 'zymra', 'drovel', 'quill'],
  words: ['grimvok', 'tessar', 'mordel', 'velith', 'vortex'],
  first: ['soru', 'blenk', 'ivra', 'kolt'],
  second: ['vane', 'drekka', 'lom', 'tarbis'],
};

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** A name with its look taken off: lower-cased, the digits read back as letters (s0ul is soul), no wrapper. */
function plain(name: string): { base: string; wrapped: boolean; digits: string } {
  // the longer opening first: xXxReaperxXx, then xXVortexXx (a word that ends in x)
  const pair = [['xXx', 'xXx'], ['xX', 'Xx'], ['zZ', 'Zz'], ['Oo', 'oO']]
    .find(([open, close]) => name.length > open!.length + close!.length && name.startsWith(open!) && name.endsWith(close!));
  const wrapped = pair !== undefined;
  let inner = pair === undefined ? name : name.slice(pair[0]!.length, name.length - pair[1]!.length);
  const tail = /^(.*[A-Za-z])(\d{2})$/.exec(inner);
  const digits = tail === null ? '' : tail[2]!;
  if (tail !== null) inner = tail[1]!;
  const base = inner.toLowerCase().replace(/4/g, 'a').replace(/3/g, 'e').replace(/1/g, 'i').replace(/0/g, 'o');
  return { base, wrapped, digits };
}

/** Whether `base` is one of the lists' names or words, two first-and-second words run together, or a word with a z. */
function fromWords(base: string): boolean {
  if (WORDS.names.includes(base) || WORDS.words.includes(base)) return true;
  if (base.endsWith('z') && WORDS.words.includes(base.slice(0, -1))) return true;
  return WORDS.first.some((f) => WORDS.second.some((s) => base === f + s));
}

describe('ignName', () => {
  const random = seeded(11);
  const made = Array.from({ length: 3000 }, () => ignName(WORDS, random));

  it("gives names the game takes, each made of the lists' words", () => {
    for (const name of made) {
      expect(validateCharacterName(name), name).toBeUndefined();
      expect(fromWords(plain(name).base), name).toBe(true);
    }
  });

  it('mixes clean names with the old cybercafe looks, the clean ones the most', () => {
    const share = (test: (name: string) => boolean): number => made.filter(test).length / made.length;
    // kael, vexor, soulreaver: all lower-case letters
    expect(share((n) => /^[a-z]+$/.test(n))).toBeGreaterThan(0.25);
    // Kael, DarkKenshi: capital-led words, no digits
    expect(share((n) => /^(?:[A-Z][a-z]+)+$/.test(n))).toBeGreaterThan(0.2);
    // xXDarkSoulXx, xXxReaperxXx, zZ...Zz, Oo...oO
    expect(share((n) => plain(n).wrapped)).toBeGreaterThan(0.05);
    expect(share((n) => plain(n).wrapped)).toBeLessThan(0.2);
    // s0ulhunter, SilentK1ller, d4rkness: a digit for a letter, now and then
    expect(share((n) => /\d/.test(n) && plain(n).digits === '')).toBeGreaterThan(0.08);
    // not every name has a digit
    expect(share((n) => /\d/.test(n))).toBeLessThan(0.35);
    // DeaTHBlAde, DeViLz: capitals inside the words
    expect(made.some((n) => !plain(n).wrapped && /[a-z][A-Z].*[a-z][A-Z]/.test(n))).toBe(true);
    // every look turns up: a z on a word, a wrapper of each kind
    expect(made.some((n) => /^[A-Z][a-z][A-Z][a-z]/.test(n) && n.endsWith('z'))).toBe(true);
    for (const wrapper of ['xX', 'xXx', 'zZ', 'Oo']) expect(made.some((n) => n.startsWith(wrapper) && plain(n).wrapped), wrapper).toBe(true);
  });

  it('never starts with a digit, and gives many different names', () => {
    for (const name of made) expect(name[0]).toMatch(/[A-Za-z]/);
    // 5 names, 4 words and 16 pairs here: the real lists hold hundreds
    expect(new Set(made.map((n) => n.toLowerCase())).size).toBeGreaterThan(200);
  });

  it('stays within 16 with long words', () => {
    const long = { names: ['zorbulanticus'], words: ['plimvaskeryx'], first: ['meganorbult'], second: ['trelvaskomer'] };
    const r = seeded(3);
    for (let i = 0; i < 300; i++) expect(validateCharacterName(ignName(long, r))).toBeUndefined();
  });
});

describe('BotNames', () => {
  it("knows each bot by its live name: a bot's new name in, its old one out", () => {
    const names = new BotNames();
    names.set('bot01', 'Abcd');
    names.set('bot02', 'Efgh');
    expect(names.has('ABCD')).toBe(true);
    names.set('bot01', 'ZorbyTrel');
    expect(names.has('abcd')).toBe(false);
    expect(names.has('zorbytrel')).toBe(true);
    expect(names.has('Efgh')).toBe(true);
    expect(names.nameOf('bot01')).toBe('ZorbyTrel');
  });
});
