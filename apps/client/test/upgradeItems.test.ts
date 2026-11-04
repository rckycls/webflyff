// The upgrade cursor's rules (2026-11-05): which materials start it, what each takes as its target and why it refuses
// one (CWndInventory::RunUpgrade, WndField.cpp:13284-13572), the smelt safety box, and the packet each sends.

import { describe, expect, it } from 'vitest';
import type { WebItemProp } from '@flyffweb/formats';
import type { InventoryItem } from '@flyffweb/protocol';
import { safetyConfirm, upgradeKindOf, upgradeRefusal, upgradeSend } from '../src/world/items/upgradeItems';

const prop = (over: Partial<WebItemProp>): WebItemProp => ({
  id: 1, name: 'x', packMax: 1, kind1: 3, kind2: 0, kind3: 0, handed: -1, part: -1, abilityMin: 0, abilityMax: 0,
  weaponType: -1, attackSpeed: -1, attackRange: -1, destParams: [-1, -1, -1], adjParams: [-1, -1, -1], sfxHit: -1,
  model: null, icon: null, ...over,
} as WebItemProp);
const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({ objectId: 12, itemId: 500, count: 1, ...over });

const SUNSTONE = prop({ id: 2035, kind3: 119 });
const ULTIMATE_GEM = prop({ id: 2034, kind3: 119 });
const MOONSTONE = prop({ id: 2036, kind3: 61 });
const FLAME = prop({ id: 3206, kind3: 37 });
const TOUCH = prop({ id: 3205, kind3: 37 });
const RIVER = prop({ id: 3211, kind3: 37 });
const SUIT_CARD = prop({ id: 3204, kind3: 62 });
const WEAPON_CARD = prop({ id: 26594, kind3: 63 });
const RANDOM_STR = prop({ id: 30012, kind3: 101 });
const AWAKE = prop({ id: 26461, kind3: 103, exeTarget: 21 });

const SWORD = prop({ id: 500, kind1: 1, kind2: 2, kind3: 3, part: 10 });
const SUIT = prop({ id: 502, kind1: 2, kind2: 7, kind3: 18, part: 2 });
const SHIELD = prop({ id: 503, kind1: 2, kind2: 8, kind3: 16, part: 9 });
const RING = prop({ id: 504, kind1: 2, kind2: 13, kind3: 23, part: 16 });
const POTION = prop({ id: 505, kind2: 12 });
const ULTIMATE_SWORD = prop({ id: 506, kind1: 1, kind2: 2, kind3: 3, part: 10, referStat1: 2 });

describe('upgradeKindOf (CWndInventory, WndField.cpp:2351-2398)', () => {
  it('the materials that start the cursor, and what each sends', () => {
    expect([SUNSTONE, MOONSTONE, FLAME].map(upgradeKindOf)).toEqual(['enchant', 'enchant', 'enchant']);
    expect(upgradeKindOf(ULTIMATE_GEM)).toBe('ultimate');
    expect([SUIT_CARD, WEAPON_CARD].map(upgradeKindOf)).toEqual(['piercing', 'piercing']);
    expect(upgradeKindOf(RANDOM_STR)).toBe('randomScroll');
    expect(upgradeKindOf(AWAKE)).toBe('target');
    expect(upgradeKindOf(POTION)).toBeNull();
  });
});

describe('upgradeRefusal (RunUpgrade, WndField.cpp:13284-13572)', () => {
  it('Sunstone takes weapons and armour; the Ultimate gem only an ultimate weapon', () => {
    expect(upgradeRefusal(SUNSTONE, SWORD, item())).toBeNull();
    expect(upgradeRefusal(SUNSTONE, SHIELD, item())).toBeNull();
    expect(upgradeRefusal(SUNSTONE, RING, item())).toBe('TID_GAME_NOTEQUALITEM');
    expect(upgradeRefusal(SUNSTONE, POTION, item())).toBe('TID_GAME_NOTEQUALITEM');
    expect(upgradeRefusal(ULTIMATE_GEM, SWORD, item())).toBe('TID_GAME_NOTEQUALITEM');
    expect(upgradeRefusal(ULTIMATE_GEM, ULTIMATE_SWORD, item())).toBeNull();
  });

  it('Moonstone takes jewellery and the collector', () => {
    expect(upgradeRefusal(MOONSTONE, RING, item())).toBeNull();
    expect(upgradeRefusal(MOONSTONE, prop({ id: 26452, kind2: 18 }), item())).toBeNull();
    expect(upgradeRefusal(MOONSTONE, SWORD, item())).toBe('TID_GAME_NOTEQUALITEM');
  });

  it("an element card: a suit or a weapon, one element, and only the element's own card", () => {
    expect(upgradeRefusal(FLAME, SWORD, item())).toBeNull();
    expect(upgradeRefusal(FLAME, SUIT, item({ resist: 1 }))).toBeNull();
    expect(upgradeRefusal(FLAME, SHIELD, item())).toBe('TID_GAME_NOTEQUALITEM');
    expect(upgradeRefusal(RIVER, SWORD, item({ resist: 1 }))).toBe('TID_UPGRADE_ERROR_TWOELEMENT');
    expect(upgradeRefusal(TOUCH, SWORD, item())).toBe('TID_UPGRADE_ERROR_WRONGUPLEVEL');
  });

  it('a socket card: its kind of item, and an empty socket', () => {
    expect(upgradeRefusal(SUIT_CARD, SUIT, item({ piercing: [0, 0] }))).toBeNull();
    expect(upgradeRefusal(SUIT_CARD, SWORD, item({ piercing: [0] }))).toBe('TID_PIERCING_POSSIBLE_ITEM');
    expect(upgradeRefusal(WEAPON_CARD, SHIELD, item({ piercing: [0] }))).toBeNull();
    expect(upgradeRefusal(WEAPON_CARD, SWORD, item({ piercing: [3500] }))).toBe('TID_PIERCING_ERROR_NOPIERCING');
    expect(upgradeRefusal(WEAPON_CARD, SWORD, item())).toBe('TID_PIERCING_ERROR_NOPIERCING');
  });

  it('a random scroll: weapons and armour; an EXT_ITEM item: anything (the server judges)', () => {
    expect(upgradeRefusal(RANDOM_STR, SWORD, item())).toBeNull();
    expect(upgradeRefusal(RANDOM_STR, SHIELD, item())).toBeNull();
    expect(upgradeRefusal(RANDOM_STR, RING, item())).toBe('TID_GAME_RANDOMSCROLL_ERROR');
    expect(upgradeRefusal(AWAKE, POTION, item())).toBeNull();
  });
});

describe('safetyConfirm (the smelt safety box, WndItemCtrl.cpp:852-922)', () => {
  const none = (): boolean => false;
  it('asks from +3 without the protection scroll on', () => {
    expect(safetyConfirm(SUNSTONE, SWORD, item({ abilityOption: 3 }), none)).toBe('TID_GAME_SMELT_SAFETY_CONFIRM_NORMAL');
    expect(safetyConfirm(SUNSTONE, SWORD, item({ abilityOption: 2 }), none)).toBeNull();
    expect(safetyConfirm(SUNSTONE, SWORD, item({ abilityOption: 5 }), (id) => id === 10464)).toBeNull();
    expect(safetyConfirm(ULTIMATE_GEM, ULTIMATE_SWORD, item(), none)).toBe('TID_GAME_SMELT_SAFETY_CONFIRM_HIGHEST');
    expect(safetyConfirm(MOONSTONE, RING, item({ abilityOption: 3 }), none)).toBe('TID_GAME_SMELT_SAFETY_CONFIRM_ACCESSARY');
    expect(safetyConfirm(MOONSTONE, RING, item({ abilityOption: 3 }), (id) => id === 26473)).toBeNull();
    expect(safetyConfirm(FLAME, SWORD, item({ resistOption: 3 }), none)).toBe('TID_GAME_SMELT_SAFETY_CONFIRM_NORMAL');
    expect(safetyConfirm(RANDOM_STR, SWORD, item({ abilityOption: 9 }), none)).toBeNull();
  });
});

describe('upgradeSend (CWndInventory::Process, WndField.cpp:1664-1745)', () => {
  it('each kind its packet, with the ids in its order', () => {
    expect(upgradeSend('enchant', 3, 12)).toEqual({ packet: 'enchant', first: 12, second: 3 });
    expect(upgradeSend('ultimate', 3, 12)).toEqual({ packet: 'ultimateEnchantWeapon', first: 12, second: 3 });
    expect(upgradeSend('piercing', 4, 12)).toEqual({ packet: 'piercing', first: 12, second: 4 });
    expect(upgradeSend('randomScroll', 5, 12)).toEqual({ packet: 'randomScroll', first: 12, second: 5 });
    expect(upgradeSend('target', 6, 12)).toEqual({ packet: 'doUseItemTarget', first: 6, second: 12 });
  });
});
