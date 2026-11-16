import { describe, expect, it } from 'vitest';
import { clampSettings, defaultSettings, loadSettings, saveSettings } from '../src/world/autoplay/settings';

/** A Storage stand-in holding its items in a map. */
function fakeStore(): Storage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    get length() { return items.size; },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => { items.delete(key); },
    setItem: (key, value) => { items.set(key, value); },
  };
}

const throwing = {
  getItem: (): string | null => { throw new Error('blocked'); },
  setItem: (): void => { throw new Error('blocked'); },
};

describe('Auto Play settings (custom, owner 2026-11-15)', () => {
  it('defaults match the spec', () => {
    const s = defaultSettings();
    expect(s.version).toBe(1);
    expect(s.farm).toEqual({ radius: 15, loot: true, stopAfterMin: 0, avoidGiants: true, only: [] });
    expect(s.pots.enabled).toBe(false);
    expect(s.pots.rows.hp).toEqual({ itemIndex: 0, below: 50, on: true });
    expect(s.pots.rows.mp).toEqual({ itemIndex: 0, below: 30, on: true });
    expect(s.pots.rows.fp).toEqual({ itemIndex: 0, below: 30, on: true });
    expect(s.skills).toEqual({ actionSlot: true, ready: [], buffs: [] });
    expect(s.loot).toEqual({ mask: 0xff }); // custom (owner 2026-11-16): the loot filter, every kind
  });

  it('the loot filter: a store from before it reads as every kind; a bad mask too', () => {
    const old = defaultSettings() as unknown as Record<string, unknown>;
    delete old.loot;
    expect(clampSettings(old).loot.mask).toBe(0xff);
    expect(clampSettings({ ...defaultSettings(), loot: { mask: 0x15 } }).loot.mask).toBe(0x15);
    expect(clampSettings({ ...defaultSettings(), loot: { mask: 0 } }).loot.mask).toBe(0);
    expect(clampSettings({ ...defaultSettings(), loot: { mask: 999 } }).loot.mask).toBe(0xff);
    expect(clampSettings({ ...defaultSettings(), loot: 'x' }).loot.mask).toBe(0xff);
  });

  it('round-trips through a fake store under flyffweb.autoPlay.<id>', () => {
    const store = fakeStore();
    const s = defaultSettings();
    s.farm.radius = 25;
    s.pots.rows.hp.itemIndex = 1001;
    s.skills.ready = [3, 4];
    s.skills.buffs = [{ kind: 'item', index: 2001 }];
    saveSettings(store, 77, s);
    expect([...store.items.keys()]).toEqual(['flyffweb.autoPlay.77']);
    expect(loadSettings(store, 77)).toEqual(s);
    expect(loadSettings(store, 78)).toEqual(defaultSettings());
  });

  it('bad JSON gives defaults', () => {
    const store = fakeStore();
    store.setItem('flyffweb.autoPlay.5', '{not json');
    expect(loadSettings(store, 5)).toEqual(defaultSettings());
  });

  it('a throwing store gives defaults and save does not throw', () => {
    expect(loadSettings(throwing, 5)).toEqual(defaultSettings());
    expect(() => saveSettings(throwing, 5, defaultSettings())).not.toThrow();
    expect(loadSettings(null, 5)).toEqual(defaultSettings());
    expect(() => saveSettings(null, 5, defaultSettings())).not.toThrow();
  });

  it('radius 17 → 15, 99 → 30, 1 → 5', () => {
    const at = (radius: unknown) => clampSettings({ ...defaultSettings(), farm: { radius, loot: true, stopAfterMin: 0 } }).farm.radius;
    expect(at(17)).toBe(15);
    expect(at(99)).toBe(30);
    expect(at(1)).toBe(5);
    expect(at('x')).toBe(15);
  });

  it('below 7 → 10, 93 → 90, 52 → 50', () => {
    const at = (below: unknown) => {
      const raw = defaultSettings() as unknown as { pots: { rows: { mp: { below: unknown } } } };
      raw.pots.rows.mp.below = below;
      return clampSettings(raw).pots.rows.mp.below;
    };
    expect(at(7)).toBe(10);
    expect(at(93)).toBe(90);
    expect(at(52)).toBe(50);
  });

  it('6 ready skills → first 4, 10 buffs → first 8, bad entries dropped', () => {
    const raw = defaultSettings() as unknown as { skills: { ready: unknown[]; buffs: unknown[] } };
    raw.skills.ready = [1, 2, 'x', 3, 4, 5, 6];
    raw.skills.buffs = [...Array.from({ length: 10 }, (_, i) => ({ kind: 'skill', index: i + 1 })), { kind: 'bad', index: 1 }];
    const s = clampSettings(raw);
    expect(s.skills.ready).toEqual([1, 2, 3, 4]);
    expect(s.skills.buffs).toHaveLength(8);
    expect(s.skills.buffs[0]).toEqual({ kind: 'skill', index: 1 });
  });

  it('stop after: 0 stays off, 30 → 60, 900 → 720, 125 → 120', () => {
    const at = (stopAfterMin: unknown) => clampSettings({ ...defaultSettings(), farm: { radius: 15, loot: true, stopAfterMin } }).farm.stopAfterMin;
    expect(at(0)).toBe(0);
    expect(at(30)).toBe(60);
    expect(at(900)).toBe(720);
    expect(at(125)).toBe(120);
  });

  it('version 2 data → defaults', () => {
    expect(clampSettings({ ...defaultSettings(), version: 2 })).toEqual(defaultSettings());
    expect(clampSettings(null)).toEqual(defaultSettings());
  });
});

describe('Auto Play settings: skill slot 0 (review fix 2026-11-15)', () => {
  it('a ready skill or a buff skill in job-skill slot 0 is kept; an item index 0 is not', () => {
    const raw = defaultSettings() as unknown as { skills: { ready: unknown[]; buffs: unknown[] } };
    raw.skills.ready = [0, 3];
    raw.skills.buffs = [{ kind: 'skill', index: 0 }, { kind: 'item', index: 0 }, { kind: 'item', index: 2001 }];
    const s = clampSettings(raw);
    expect(s.skills.ready).toEqual([0, 3]);
    expect(s.skills.buffs).toEqual([{ kind: 'skill', index: 0 }, { kind: 'item', index: 2001 }]);
  });
});

describe('Auto Play settings: avoid giants, chosen monsters (owner 2026-11-17)', () => {
  it('avoidGiants is a boolean (default true); only keeps up to 16 monster indexes', () => {
    const raw = defaultSettings() as unknown as { farm: Record<string, unknown> };
    raw.farm.avoidGiants = false;
    raw.farm.only = [20, 'x', -1, 21, ...Array.from({ length: 20 }, (_, i) => 100 + i)];
    const s = clampSettings(raw);
    expect(s.farm.avoidGiants).toBe(false);
    expect(s.farm.only.slice(0, 3)).toEqual([20, 21, 100]);
    expect(s.farm.only).toHaveLength(16);
    const old = defaultSettings() as unknown as { farm: Record<string, unknown> };
    delete old.farm.avoidGiants;
    delete old.farm.only;
    expect(clampSettings(old).farm).toMatchObject({ avoidGiants: true, only: [] });
  });
});
