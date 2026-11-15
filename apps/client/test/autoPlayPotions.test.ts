import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '@flyffweb/protocol';
import { PotionPacer, countOf, findStack, pickPotion } from '../src/world/autoplay/potions';
import type { Gauges } from '../src/world/autoplay/potions';
import { defaultSettings } from '../src/world/autoplay/settings';

const HP_POT = 1001, MP_POT = 1002, FP_POT = 1003;

function bag(...items: Array<[objectId: number, itemId: number, count: number]>): Map<number, InventoryItem> {
  return new Map(items.map(([objectId, itemId, count]) => [objectId, { objectId, itemId, count }]));
}

function pots() {
  const s = defaultSettings().pots;
  s.enabled = true;
  s.rows.hp.itemIndex = HP_POT;
  s.rows.mp.itemIndex = MP_POT;
  s.rows.fp.itemIndex = FP_POT;
  return s;
}

const full: Gauges = { hp: 1000, maxHp: 1000, mp: 500, maxMp: 500, fp: 300, maxFp: 300 };
const ready = () => 0;
const ALL = bag([10, HP_POT, 5], [11, MP_POT, 5], [12, FP_POT, 5]);

describe('Auto pots: choice (custom, owner 2026-11-15)', () => {
  it('HP 49 % of max with below 50 → the HP stack', () => {
    expect(pickPotion(pots(), { ...full, hp: 490 }, ALL, ready, new PotionPacer(), 0)).toEqual({ row: 'hp', objectId: 10 });
  });

  it('HP 50 % → null', () => {
    expect(pickPotion(pots(), { ...full, hp: 500 }, ALL, ready, new PotionPacer(), 0)).toBeNull();
  });

  it('MP and HP both low → HP first; MP alone → MP; FP alone → FP', () => {
    expect(pickPotion(pots(), { ...full, hp: 100, mp: 10 }, ALL, ready, new PotionPacer(), 0)?.row).toBe('hp');
    expect(pickPotion(pots(), { ...full, mp: 10 }, ALL, ready, new PotionPacer(), 0)).toEqual({ row: 'mp', objectId: 11 });
    expect(pickPotion(pots(), { ...full, fp: 10 }, ALL, ready, new PotionPacer(), 0)).toEqual({ row: 'fp', objectId: 12 });
  });

  it('the stack\'s object id changes when the first runs out (Review Focus 2)', () => {
    const inv = bag([10, HP_POT, 0], [20, HP_POT, 7]);
    expect(pickPotion(pots(), { ...full, hp: 100 }, inv, ready, new PotionPacer(), 0)).toEqual({ row: 'hp', objectId: 20 });
    expect(findStack(inv, HP_POT)?.objectId).toBe(20);
    expect(countOf(bag([10, HP_POT, 3], [20, HP_POT, 7], [30, MP_POT, 2]), HP_POT)).toBe(10);
  });

  it('cooldownLeft 900 → null (food and pills keep their V15 cooldown)', () => {
    expect(pickPotion(pots(), { ...full, hp: 100 }, ALL, (id) => (id === HP_POT ? 900 : 0), new PotionPacer(), 0)).toBeNull();
  });

  it('row off → null; itemIndex 0 → null; inventory null → null; no stack → null; max 0 → null', () => {
    const off = pots(); off.rows.hp.on = false;
    expect(pickPotion(off, { ...full, hp: 100 }, ALL, ready, new PotionPacer(), 0)).toBeNull();
    const none = pots(); none.rows.hp.itemIndex = 0;
    expect(pickPotion(none, { ...full, hp: 100 }, ALL, ready, new PotionPacer(), 0)).toBeNull();
    expect(pickPotion(pots(), { ...full, hp: 100 }, null, ready, new PotionPacer(), 0)).toBeNull();
    expect(pickPotion(pots(), { ...full, hp: 100 }, bag([11, MP_POT, 5]), ready, new PotionPacer(), 0)).toBeNull();
    expect(pickPotion(pots(), { ...full, hp: 0, maxHp: 0 }, ALL, ready, new PotionPacer(), 0)).toBeNull();
  });
});

describe('Auto pots: pacing', () => {
  it('used at 0, value unchanged → refused at 700, allowed at 800', () => {
    const pacer = new PotionPacer();
    pacer.used('hp', 0, 400);
    expect(pacer.canUse('hp', 700, 400)).toBe(false);
    expect(pacer.canUse('hp', 800, 400)).toBe(true);
  });

  it('value changed at 300 → refused (500 ms floor), allowed at 500', () => {
    const pacer = new PotionPacer();
    pacer.used('hp', 0, 400);
    expect(pacer.canUse('hp', 300, 650)).toBe(false);
    expect(pacer.canUse('hp', 500, 650)).toBe(true);
  });

  it('each row is paced on its own', () => {
    const pacer = new PotionPacer();
    pacer.used('hp', 0, 400);
    expect(pacer.canUse('mp', 10, 50)).toBe(true);
  });

  it('pickPotion respects the pacer: an HP pot just used → MP may still go', () => {
    const pacer = new PotionPacer();
    pacer.used('hp', 0, 100);
    expect(pickPotion(pots(), { ...full, hp: 100, mp: 10 }, ALL, ready, pacer, 100)).toEqual({ row: 'mp', objectId: 11 });
  });
});
