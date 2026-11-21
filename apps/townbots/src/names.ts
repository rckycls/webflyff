// The bots' names: new ones in the style of a 2005-2009 MMORPG player's (owner, 2026-11-21: kael, vexor, DarkKenshi,
// s0ulhunter, DeaTHBlAde, xXxReaperxXx, DeViLz), made from the settings' private word lists, and the live names of
// every bot (a bot renames itself now and then: `rename.ts`).
import { validateCharacterName } from '@flyffweb/protocol';

/**
 * The word lists a name is made of (`TownBotsSettings.names`): `names` stand alone (kael, raizen), `words` too and take
 * the louder looks (darkness, reaper), and a `first` and a `second` run together (soul + reaver, silent + killer).
 */
export interface NameWords {
  names: readonly string[];
  words: readonly string[];
  first: readonly string[];
  second: readonly string[];
}

/** Tries for a name that fits 4-16 letters before the plain fallback. */
const TRIES = 20;
/** The letters an old player wrote as digits. */
const LEET: Readonly<Record<string, string>> = { a: '4', e: '3', i: '1', o: '0' };
/** The wrappers with their closing halves and shares: xXDarkSoulXx, xXxReaperxXx, zZ...Zz, Oo...oO. */
const WRAPPERS: ReadonlyArray<readonly [string, string, number]> = [['xX', 'Xx', 0.5], ['xXx', 'xXx', 0.25], ['zZ', 'Zz', 0.125], ['Oo', 'oO', 0.125]];

const pick = (list: readonly string[], random: () => number): string => list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;
const lower = (word: string): string => word.toLowerCase();
const cap = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/** One letter after the first written as its digit (s0ulhunter, SilentK1ller); the word as it is when none can be. */
function leet(word: string, random: () => number): string {
  const at = [...word].map((c, i) => (i > 0 && LEET[c.toLowerCase()] !== undefined ? i : -1)).filter((i) => i > 0);
  if (at.length === 0) return word;
  const i = at[Math.min(at.length - 1, Math.floor(random() * at.length))]!;
  return word.slice(0, i) + LEET[word[i]!.toLowerCase()]! + word.slice(i + 1);
}

/** Capitals thrown in (DeaTHBlAde): the first letter most times, then about one letter in three. */
function wildCaps(word: string, random: () => number): string {
  return [...word.toLowerCase()].map((c, i) => (random() < (i === 0 ? 0.7 : 0.35) ? c.toUpperCase() : c)).join('');
}

/** Capitals and small letters by turns, and a z (DeViLz). */
function altCaps(word: string): string {
  return [...word.toLowerCase()].map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c)).join('') + 'z';
}

/** Two digits on the end, as some did (raizen19). */
const digits = (random: () => number): string => String(10 + Math.floor(random() * 90));

/** A first and a second word that differ. */
function pair(words: NameWords, random: () => number): [string, string] {
  const first = pick(words.first, random);
  let second = pick(words.second, random);
  for (let i = 0; i < 3 && lower(second) === lower(first); i++) second = pick(words.second, random);
  return [first, second];
}

/** A name in one of the looks, maybe too long for the game (`ignName` tries again). */
function styled(words: NameWords, random: () => number): string {
  const roll = random();
  const look = random();
  if (roll < 0.34) {
    // kael, Raizen, K1llua, valen19
    const name = pick(words.names, random);
    return look < 0.5 ? lower(name) : look < 0.85 ? cap(name) : look < 0.93 ? leet(cap(name), random) : lower(name) + digits(random);
  }
  if (roll < 0.64) {
    // DarkKenshi, soulreaver, s0ulhunter, SilentK1ller, DeaTHBlAde
    const [a, b] = pair(words, random);
    if (look < 0.4) return cap(a) + cap(b);
    if (look < 0.65) return lower(a) + lower(b);
    if (look < 0.82) return random() < 0.5 ? leet(lower(a) + lower(b), random) : cap(a) + leet(cap(b), random);
    if (look < 0.94) return wildCaps(a + b, random);
    return cap(a) + cap(b) + digits(random);
  }
  if (roll < 0.88) {
    // noct, d4rkness, shad0w, Reaper, DeViLz
    const word = pick(words.words, random);
    return look < 0.3 ? lower(word) : look < 0.55 ? leet(lower(word), random) : look < 0.75 ? cap(word) : look < 0.9 ? altCaps(word) : wildCaps(word, random);
  }
  // xXDarkSoulXx, xXxReaperxXx
  let w = random();
  const [open, close] = WRAPPERS.find(([, , share]) => (w -= share) < 0) ?? WRAPPERS[0]!;
  const inner = look < 0.4 ? cap(pick(words.words, random)) : look < 0.7 ? cap(pick(words.names, random)) : pair(words, random).map(cap).join('');
  return open + inner + close;
}

/** A new name in one of the old looks; always one the game takes (`validateCharacterName`: 4 to 16 letters and digits, a letter first). */
export function ignName(words: NameWords, random: () => number): string {
  for (let i = 0; i < TRIES; i++) {
    const name = styled(words, random);
    if (validateCharacterName(name) === undefined) return name;
  }
  // long words every time: a name, cut to fit, and two digits
  return cap(pick(words.names, random)).slice(0, 14) + digits(random);
}

/** Every bot's live name by its account (lower-cased): a bot's new name comes in, its old one goes out. */
export class BotNames {
  private readonly byAccount = new Map<string, string>();
  private readonly shown = new Map<string, string>();
  private readonly names = new Set<string>();

  set(account: string, name: string): void {
    const old = this.byAccount.get(account);
    if (old !== undefined) this.names.delete(old);
    const lower = name.toLowerCase();
    this.byAccount.set(account, lower);
    this.shown.set(account, name);
    this.names.add(lower);
  }

  /** Whether `name` is a bot's (any case). */
  has(name: string): boolean {
    return this.names.has(name.toLowerCase());
  }

  /** The bot's name as the game shows it. */
  nameOf(account: string): string | undefined {
    return this.shown.get(account);
  }
}
