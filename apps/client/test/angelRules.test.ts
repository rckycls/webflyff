// Summon Angel's rules (2026-11-10, world/angel/angelRules.ts; docs/superpowers/specs/2026-11-10-summon-angel-research.md):
// the slots as CWndSummonAngel fills them, the rates it shows, START's text, and the angel's EXP target.

import { describe, expect, it } from 'vitest';
import {
  ANGELS, AngelSlots, angelPercent, angelTarget, isAngelBuff, rateText, stoneRow, summonRates,
} from '../src/world/angel/angelRules';

const SUN = 2035, MOON = 2036, EVENT_SUN = 2082, EVENT_MOON = 2083;
const EXP = Array.from({ length: 30 }, (_, level) => ({ exp1: BigInt(level * 1000 + 17), exp2: 0n, lpPoint: 0, limitExp: 0n }));

describe('the stones and their rows', () => {
  it('Sunstone (and the event one) go in slots 0-9, Moonstone (and the event one) in 10-19 (OnDropIcon, :256-269)', () => {
    expect([stoneRow(SUN), stoneRow(EVENT_SUN), stoneRow(MOON), stoneRow(EVENT_MOON), stoneRow(2034)]).toEqual([0, 0, 10, 10, null]);
  });
});

describe('the rates (SummonRateRefresh, :503-520)', () => {
  it('green n, blue 2n, red 100 - 3n, white n / 10; "%0.1f"', () => {
    expect(summonRates(0)).toEqual({ red: 100, blue: 0, green: 0, white: 0 });
    expect(summonRates(3)).toEqual({ red: 91, blue: 6, green: 3, white: 0.3 });
    expect(summonRates(20)).toEqual({ red: 40, blue: 40, green: 20, white: 2 });
    expect([rateText(91), rateText(0), rateText(40)]).toEqual(['91.0', '0.0', '40.0']);
  });
});

describe('AngelSlots (m_MatDie)', () => {
  it('a drop on an empty slot of its row takes one piece; on the other row nothing; with none free "overflow"', () => {
    const s = new AngelSlots();
    expect(s.drop(2, { objectId: 7, itemId: SUN }, 5, false)).toEqual({ result: 'valid', put: [2] });
    expect(s.drop(12, { objectId: 7, itemId: SUN }, 4, false)).toEqual({ result: 'invalid', put: [] }); // the Moonstone row
    expect(s.drop(2, { objectId: 8, itemId: SUN }, 4, false)).toEqual({ result: 'invalid', put: [] }); // a filled slot
    expect(s.drop(3, { objectId: 7, itemId: SUN }, 0, false)).toEqual({ result: 'overflow', put: [] });
    expect(s.drop(4, { objectId: 9, itemId: 500 }, 1, false)).toEqual({ result: 'invalid', put: [] });
    expect(s.counts()).toEqual({ orichalcum: 1, moonstone: 0, total: 1 });
  });

  it('a shift-drop fills the empty slots of its row from the left, as many as there are free pieces (SetDie, :312-338)', () => {
    const s = new AngelSlots();
    s.drop(11, { objectId: 4, itemId: MOON }, 9, false);
    expect(s.drop(15, { objectId: 4, itemId: MOON }, 3, true)).toEqual({ result: 'valid', put: [10, 12, 13] });
    expect(s.drop(16, { objectId: 5, itemId: EVENT_MOON }, 20, true).put).toEqual([14, 15, 16, 17, 18, 19]);
    expect(s.counts()).toEqual({ orichalcum: 0, moonstone: 10, total: 10 });
  });

  it('the bag\'s double-click: the first empty slot of the stone\'s row, none when the row is full (:358-389)', () => {
    const s = new AngelSlots();
    expect(s.fromBag({ objectId: 3, itemId: SUN })).toBe(0);
    expect(s.fromBag({ objectId: 3, itemId: SUN })).toBe(1);
    expect(s.fromBag({ objectId: 6, itemId: MOON })).toBe(10);
    for (let i = 2; i < 10; i++) s.fromBag({ objectId: 3, itemId: SUN });
    expect(s.fromBag({ objectId: 3, itemId: SUN })).toBeNull();
    expect(s.fromBag({ objectId: 9, itemId: 500 })).toBeNull();
  });

  it('a slot\'s double-click takes its piece out; clear lets every piece go (one id a piece)', () => {
    const s = new AngelSlots();
    s.fromBag({ objectId: 3, itemId: SUN });
    s.fromBag({ objectId: 3, itemId: SUN });
    s.fromBag({ objectId: 6, itemId: MOON });
    expect(s.remove(1)).toBe(3);
    expect(s.remove(1)).toBeNull();
    expect(s.clear()).toEqual([3, 6]);
    expect(s.counts().total).toBe(0);
  });

  it('START\'s stacks: each object once, in the order of the slots, with its count (OnChildNotify, :441-474)', () => {
    const s = new AngelSlots();
    s.fromBag({ objectId: 6, itemId: SUN });
    s.fromBag({ objectId: 3, itemId: SUN });
    s.fromBag({ objectId: 6, itemId: SUN });
    s.fromBag({ objectId: 8, itemId: MOON });
    expect(s.stacks()).toEqual([{ objectId: 6, count: 2 }, { objectId: 3, count: 1 }, { objectId: 8, count: 1 }]);
  });
});

describe('the angel', () => {
  it('the four angels: their model and their particle kind (propItem.txt:4129-4132; Mover.cpp:3580-3586)', () => {
    expect(ANGELS.get(30035)).toEqual({ model: 'mvr_angelred', particle: 16 });
    expect(ANGELS.get(30036)).toEqual({ model: 'mvr_angelblue', particle: 13 });
    expect(ANGELS.get(30037)).toEqual({ model: 'mvr_angelgreen', particle: 22 });
    expect(ANGELS.get(30038)).toEqual({ model: 'mvr_angelwhite', particle: 19 });
    expect(isAngelBuff({ kind3: 95 })).toBe(true);
    expect(isAngelBuff({ kind3: 94 })).toBe(false);
  });

  it('its target is nExp1 of its level / 100 * nAdjParamVal1 (100 when out of 1..100), its percent rounds down', () => {
    expect(angelTarget(60, 12, EXP)).toBe((12017n / 100n) * 60n);
    expect(angelTarget(0, 12, EXP)).toBe(12000n);
    expect(angelTarget(101, 12, EXP)).toBe(12000n);
    expect(angelTarget(30, 99, EXP)).toBe(0n); // past the table
    expect(angelPercent(3605n, 7200n)).toBe(50);
    expect(angelPercent(7200n, 7200n)).toBe(100);
    expect(angelPercent(5n, 0n)).toBe(0);
  });
});
