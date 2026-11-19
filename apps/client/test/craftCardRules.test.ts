// custom (owner 2026-11-19): Bozman's Craft Card's rules, the web copy of the World's (outer repo
// Source/WORLDSERVER/CraftCard.h), used only to show the chance and to fill the slots. Values from
// docs/superpowers/specs/2026-11-19-craft-card-design.md.
import { describe, expect, it } from 'vitest';
import type { WebItemProp } from '@flyffweb/formats';
import {
  CRAFT_STONE, CRAFT_STONE_PROP, affordableTries, cardInput, craftChance, isTopCard, maxTries, withCraftStone,
} from '../src/world/items/craftCardRules';

const letter = (c: string): number => c.charCodeAt(0);

describe('craftChance', () => {
  it('gives the owner\'s three examples', () => {
    expect(craftChance([3255])).toBe(10);
    expect(craftChance([3207])).toBe(20);
    expect(craftChance([3207, 3255])).toBe(35);
  });

  it('adds 5 for each card after the first and never passes 90', () => {
    expect(craftChance([3204, 3204, 3204])).toBe(25);
    expect(craftChance([3204, 3209, 3214, 3219, 3224])).toBe(45);
    expect(craftChance([3255, 3256, 3257])).toBe(40);
    expect(craftChance([3207, 3207])).toBe(45);
    expect(craftChance([3207, 3207, 3207])).toBe(70);
    expect(craftChance([3207, 3207, 3207, 3207])).toBe(90);
    expect(craftChance([3207, 3212, 3217, 3222, 3227])).toBe(90);
    expect(craftChance([])).toBe(0);
  });

  it('counts weapon B and C as 4% and 3%', () => {
    expect(craftChance([26596, 26595])).toBe(35);
    expect(craftChance([26594])).toBe(5);
  });
});

describe('cardInput and isTopCard', () => {
  it('knows the 30 inputs by kind and points', () => {
    expect(cardInput(3204)).toEqual({ kind: 'suit', points: 5 });
    expect(cardInput(3255)).toEqual({ kind: 'suit', points: 10 });
    expect(cardInput(3227)).toEqual({ kind: 'suit', points: 20 });
    expect(cardInput(26594)).toEqual({ kind: 'weapon', points: 5 });
    expect(cardInput(26611)).toEqual({ kind: 'weapon', points: 10 });
    expect(cardInput(26612)).toEqual({ kind: 'weapon', points: 20 });
  });

  it('takes no top card, no seghope card and no stone', () => {
    for (const id of [3208, 26597, 3237, 3500, 20280]) expect(cardInput(id)).toBeNull();
    expect(isTopCard(3208)).toBe(true);
    expect(isTopCard(3228)).toBe(true);
    expect(isTopCard(26613)).toBe(true);
    expect(isTopCard(3207)).toBe(false);
  });
});

describe('maxTries', () => {
  it('follows the VIP letter: A 5, B 10, C 15, E 20; game masters 20; others 1', () => {
    expect(maxTries(letter('A'))).toBe(5);
    expect(maxTries(letter('B'))).toBe(10);
    expect(maxTries(letter('C'))).toBe(15);
    expect(maxTries(letter('E'))).toBe(20);
    expect(maxTries(letter('F'))).toBe(1);
    expect(maxTries(letter('D'))).toBe(1);
    expect(maxTries(letter('L'))).toBe(20);
    expect(maxTries(letter('Z'))).toBe(20);
  });
});

describe('affordableTries', () => {
  it('affordableTries counts a stack used twice', () => {
    const counts = new Map([[1, 12], [2, 7], [3, 2]]);
    expect(affordableTries(1, [2, 2, 3, null, null], (id) => counts.get(id) ?? 0)).toBe(2);
    expect(affordableTries(1, [2, 2, null, null, null], (id) => counts.get(id) ?? 0)).toBe(3);
  });

  it('is 0 with no stone or no card', () => {
    const counts = new Map([[1, 12], [2, 7]]);
    expect(affordableTries(null, [2, null, null, null, null], (id) => counts.get(id) ?? 0)).toBe(0);
    expect(affordableTries(1, [null, null, null, null, null], (id) => counts.get(id) ?? 0)).toBe(0);
  });
});

describe('withCraftStone', () => {
  it('adds 20280 once and keeps a converted one', () => {
    const props = withCraftStone(new Map<number, WebItemProp>());
    expect(props.get(CRAFT_STONE)).toMatchObject({
      id: 20280, name: 'Craft Stone', packMax: 99, icon: 'ui/item/itm_genmatsupminera.png',
      dropModel: 'models/item_genmatsupresour.glb',
    });
    const converted = { ...CRAFT_STONE_PROP, name: 'Converted' };
    expect(withCraftStone(new Map([[CRAFT_STONE, converted]])).get(CRAFT_STONE)?.name).toBe('Converted');
  });
});
