// The bots' names: new ones in an old gamer's style (1 to 3 words run together, now and then two digits), made from
// the settings' private word lists, and the live names of every bot (a bot renames itself now and then: `rename.ts`).
import { validateCharacterName } from '@flyffweb/protocol';

/** The word lists a name is made of (`TownBotsSettings.names`). */
export interface NameWords { adjectives: readonly string[]; nouns: readonly string[]; titles: readonly string[] }

/** Tries for a name that fits 4-16 letters before the plain fallback. */
const TRIES = 20;

const pick = (list: readonly string[], random: () => number): string => list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;
const cap = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/**
 * A name of 1 to 3 words run together, each capital-led: a noun, an adjective and a noun, a title and a noun, or an
 * adjective and two nouns; one in four ends with two digits. Always one the game takes (`validateCharacterName`).
 */
export function ignName(words: NameWords, random: () => number): string {
  for (let i = 0; i < TRIES; i++) {
    const roll = random();
    const parts = roll < 0.15 ? [pick(words.nouns, random)]
      : roll < 0.55 ? [pick(words.adjectives, random), pick(words.nouns, random)]
        : roll < 0.75 ? [pick(words.titles, random), pick(words.nouns, random)]
          : [pick(words.adjectives, random), pick(words.nouns, random), pick(words.nouns, random)];
    if (parts.length === 3 && parts[1] === parts[2]) continue;
    let name = parts.map(cap).join('');
    if (random() < 0.25) name += String(10 + Math.floor(random() * 90));
    if (validateCharacterName(name) === undefined) return name;
  }
  // long words every time: one noun, cut to fit, and two digits
  return cap(pick(words.nouns, random)).slice(0, 14) + String(10 + Math.floor(random() * 90));
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
