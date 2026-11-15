import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '@flyffweb/protocol';
import { AutoPlay } from '../src/world/autoplay/controller';
import type { AutoPlayHooks } from '../src/world/autoplay/controller';
import type { Gauges } from '../src/world/autoplay/potions';
import { defaultSettings } from '../src/world/autoplay/settings';
import type { AutoPlaySettings } from '../src/world/autoplay/settings';

const HP_POT = 1001;

/** Fake hooks around a little world state the tests change. */
function world() {
  const state = {
    now: 0,
    worldId: 1,
    inDuel: false,
    alive: true,
    gauges: { hp: 1000, maxHp: 1000, mp: 500, maxMp: 500, fp: 300, maxFp: 300 } as Gauges,
    inventory: new Map<number, InventoryItem>([[10, { objectId: 10, itemId: HP_POT, count: 3 }]]),
    used: [] as number[],
    said: [] as string[],
    saved: [] as AutoPlaySettings[],
  };
  const hooks: AutoPlayHooks = {
    now: () => state.now,
    worldId: () => state.worldId,
    inDuel: () => state.inDuel,
    alive: () => state.alive,
    gauges: () => state.gauges,
    inventory: () => state.inventory,
    cooldownLeft: () => 0,
    useItem: (objectId) => { state.used.push(objectId); return true; },
    say: (text) => { state.said.push(text); },
    save: (s) => { state.saved.push(structuredClone(s)); },
  };
  return { state, hooks };
}

function potsOn(): AutoPlaySettings {
  const s = defaultSettings();
  s.pots.enabled = true;
  s.pots.rows.hp.itemIndex = HP_POT;
  return s;
}

describe('AutoPlay controller: auto pots (custom, owner 2026-11-15)', () => {
  it('pots on, HP low → useItem with the stack id', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, potsOn());
    state.gauges = { ...state.gauges, hp: 300 };
    play.step();
    expect(state.used).toEqual([10]);
  });

  it('paces: two steps in a row use one item', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, potsOn());
    state.gauges = { ...state.gauges, hp: 300 };
    play.step();
    state.now = 16;
    play.step();
    expect(state.used).toEqual([10]);
    state.now = 816;
    play.step();
    expect(state.used).toEqual([10, 10]);
  });

  it('pots off → nothing', () => {
    const { state, hooks } = world();
    const s = potsOn(); s.pots.enabled = false;
    const play = new AutoPlay(hooks, s);
    state.gauges = { ...state.gauges, hp: 300 };
    play.step();
    expect(state.used).toEqual([]);
  });

  it('dead → nothing', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, potsOn());
    state.gauges = { ...state.gauges, hp: 0 };
    state.alive = false;
    play.step();
    expect(state.used).toEqual([]);
  });

  it('world 208 → nothing; in a duel → nothing', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, potsOn());
    state.gauges = { ...state.gauges, hp: 300 };
    state.worldId = 208;
    play.step();
    state.worldId = 1;
    state.inDuel = true;
    play.step();
    expect(state.used).toEqual([]);
  });

  it('count 0 → one "no HP items left" line, not repeated each step; again after a refill runs out', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, potsOn());
    state.inventory = new Map();
    play.step();
    play.step();
    expect(state.said).toEqual(['Auto pots: no HP items left.']);
    state.inventory = new Map([[11, { objectId: 11, itemId: HP_POT, count: 1 }]]);
    play.step();
    state.inventory = new Map();
    play.step();
    expect(state.said).toEqual(['Auto pots: no HP items left.', 'Auto pots: no HP items left.']);
  });

  it('saved() hands the current settings to the save hook', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, potsOn());
    play.settings.pots.rows.hp.below = 70;
    play.saved();
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0]!.pots.rows.hp.below).toBe(70);
  });
});
