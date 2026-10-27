import { GAME_DATA_KEYS } from '@flyffweb/formats';

/**
 * The converter's catalogs as `loadGameData` finds them once parsed: every key of `GAME_DATA_KEYS`, empty (and the
 * three name colours of PKSetting.inc) unless a test gives its own under `parts`.
 */
export function catalogFiles(parts: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [GAME_DATA_KEYS.movers]: [],
    [GAME_DATA_KEYS.items]: [],
    [GAME_DATA_KEYS.npcs]: [],
    [GAME_DATA_KEYS.nameColors]: { general: 0xffffffff, chaotic: 0xffff0000, ready: 0xffffc0cb },
    [GAME_DATA_KEYS.honorTitles]: {},
    [GAME_DATA_KEYS.worlds]: {},
    [GAME_DATA_KEYS.itemProps]: [],
    [GAME_DATA_KEYS.jobs]: [],
    [GAME_DATA_KEYS.exp]: [],
    [GAME_DATA_KEYS.texts]: {},
    [GAME_DATA_KEYS.effectsIndex]: {},
    [GAME_DATA_KEYS.skills]: [],
    ...parts,
  };
}

/**
 * An asset store over `files`, as `loadGameData` uses one: `url` answers for the keys the index lists, `json` reads
 * them (and notes each key asked for). `unreadable` keys are listed but cannot be read, as after three failed tries.
 */
export function storeOf(files: Record<string, unknown>, unreadable: string[] = []) {
  const asked: string[] = [];
  return {
    asked,
    url: (key: string): string | null => (key in files || unreadable.includes(key) ? `/assets/${key}` : null),
    json: async <T>(key: string): Promise<T> => {
      asked.push(key);
      if (!(key in files)) throw new Error(`no ${key}`);
      return files[key] as T;
    },
  };
}
