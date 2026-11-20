// The bots' names: a name from the private list, all lower case but one letter made capital at a random place
// (owner, 2026-11-20). The game's name check ignores case, so a name is taken whatever its capitals.
import { validateCharacterName } from '@flyffweb/protocol';

/** `base` lower case, with the letter at `floor(random() * length)` made capital. */
export function styleName(base: string, random: () => number): string {
  const lower = base.toLowerCase();
  const at = Math.min(lower.length - 1, Math.floor(random() * lower.length));
  return lower.slice(0, at) + lower.charAt(at).toUpperCase() + lower.slice(at + 1);
}

/** The list in a random order (Fisher-Yates). */
export function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * The first `count` names of `list`, in order, that the game takes (letters only, 4 to 16), that nobody has
 * (`taken`, given the name as listed) and that are not picked already (compared lower case). Throws when the list runs out.
 */
export function pickNames(list: readonly string[], count: number, taken: (name: string) => boolean): string[] {
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (picked.length === count) break;
    const name = raw.trim();
    const key = name.toLowerCase();
    if (seen.has(key) || !/^[A-Za-z]+$/.test(name) || validateCharacterName(name) !== undefined || taken(name)) continue;
    seen.add(key);
    picked.push(name);
  }
  if (picked.length < count) throw new Error(`only ${picked.length} of the ${count} names needed are free: add names to the list`);
  return picked;
}
