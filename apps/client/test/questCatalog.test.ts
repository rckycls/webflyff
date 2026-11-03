import { describe, expect, it, vi } from 'vitest';
import { QUESTS_KEY, type WebQuest } from '@flyffweb/formats';
import { loadQuests } from '../src/world/quests/questCatalog';

const QUESTS: WebQuest[] = [
  { id: 151, title: 'The Path of the Mercenary', head: 6051, states: {} },
  { id: 6051, title: '1st Job Change', head: 6001, states: {} },
];
const store = (files: Record<string, unknown>) => ({
  url: (key: string) => (key in files ? `/assets/${key}` : null),
  json: async <T>(key: string): Promise<T> => {
    if (!(key in files)) throw new Error(`${key}: 404`);
    const value = files[key];
    if (value instanceof Error) throw value;
    return value as T;
  },
});

describe('loadQuests (data/quests.json, optional as the world map is)', () => {
  it('without a catalog the world still enters', async () => {
    const report = vi.fn();
    expect(await loadQuests(store({}), report)).toBeNull();
    expect(report).not.toHaveBeenCalled();
  });

  it('gives the quests by id', async () => {
    const report = vi.fn();
    const catalog = await loadQuests(store({ [QUESTS_KEY]: QUESTS }), report);
    expect(catalog?.get(151)?.title).toBe('The Path of the Mercenary');
    expect(catalog?.get(6051)?.head).toBe(6001);
    expect(report).not.toHaveBeenCalled();
  });

  it('a catalog that cannot be downloaded is said once, and the world goes on without it', async () => {
    const report = vi.fn();
    expect(await loadQuests(store({ [QUESTS_KEY]: new Error('quests.json: 500') }), report)).toBeNull();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]![0].message).toBe('quests.json: 500');
  });
});
