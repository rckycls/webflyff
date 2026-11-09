// @vitest-environment jsdom
// pets R2: the raised pet's item: its numbers (pets/petStatus.ts), its icon and name in the bag, its tooltip (PutPetInfo,
// PutPetFeedPocket) and its buff icon (GetSystemPetTextureKey, PutPetTooltipInfo).

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItem } from '@flyffweb/protocol';
import { BuffStatus } from '../src/world/hud/buffStatus';
import { InventoryWindow } from '../src/world/hud/inventoryWindow';
import { itemTooltip } from '../src/world/items/itemTooltip';
import { OwnState } from '../src/world/OwnState';
import {
  availDestParam, itemIconOf, itemName, petBuffIcon, petBuffTooltip, petExpText, petIconKey, petMaxEnergy, petTitle,
} from '../src/world/pets/petStatus';
import { II_PET_EGG } from '../src/world/pets/raisedPet';
import { STARTER_EQUIPMENT } from './helpers/ownState';
import {
  EGG_SLOT, II_FEED_POCKET, II_TIGER, PETS, TIGER_C, art, ownAddObj, pet, petData, petItem, texts,
} from './helpers/petData';

afterEach(() => {
  document.body.replaceChildren();
});

// ---- the rules ---------------------------------------------------------------------------------------------------

describe('the raised pet\'s numbers (pets/petStatus.ts)', () => {
  it('names the icon by level: _00 for D and C, _01 for B and A, _02 for S, the egg\'s as it is (Item.cpp:81-117)', () => {
    const icon = 'ui/item/itm_petwhitetiger01.png';
    expect([0, 1, 2, 3, 4, 5].map((level) => petIconKey(icon, level))).toEqual([
      icon, 'ui/item/itm_petwhitetiger01_00.png', 'ui/item/itm_petwhitetiger01_00.png', 'ui/item/itm_petwhitetiger01_01.png',
      'ui/item/itm_petwhitetiger01_01.png', 'ui/item/itm_petwhitetiger01_02.png',
    ]);
    const data = petData();
    expect(itemIconOf(petItem(TIGER_C), data.itemProps.get(II_TIGER))).toBe('ui/item/itm_petwhitetiger01_00.png');
    expect(itemIconOf({}, data.itemProps.get(II_TIGER))).toBe(icon); // no pet: the egg's level
    expect(itemIconOf(petItem(TIGER_C), data.itemProps.get(502))).toBe(data.itemProps.get(502)!.icon); // not IK3_EGG
  });

  it('calls a pet item "<mover> Cage", or by the pet\'s own name, the egg too (Item.cpp:609-625)', () => {
    const data = petData();
    expect(itemName(petItem(TIGER_C), data.itemProps.get(II_TIGER)!, data)).toBe('White Tiger Cage');
    expect(itemName(petItem({ ...TIGER_C, name: 'Tigger' }), data.itemProps.get(II_TIGER)!, data)).toBe('Tigger Cage');
    expect(itemName(petItem(pet()), data.itemProps.get(II_PET_EGG)!, data)).toBe('Egg Cage');
    expect(itemName({}, data.itemProps.get(II_PET_EGG)!, data)).toBe('Pet Egg'); // no pet: the prop's
    // the window's title (PaintFrame): the egg item's prop name, a hatched pet's mover, its own name
    expect(petTitle(pet(), data.itemProps.get(II_PET_EGG)!, data)).toBe('Pet Egg');
    expect(petTitle(TIGER_C, data.itemProps.get(II_TIGER)!, data)).toBe('White Tiger');
    expect(petTitle({ ...TIGER_C, name: 'Tigger' }, data.itemProps.get(II_TIGER)!, data)).toBe('Tigger');
  });

  it('adds up the steps of each level reached (GetAvailDestParam), the energy and EXP limits', () => {
    expect(availDestParam(TIGER_C, PETS)).toEqual({ dst: 1, param: 1 + 4 });
    expect(availDestParam(pet(), PETS)).toEqual({ dst: 1, param: 0 }); // the egg: the kind's stat, nothing yet
    expect(availDestParam({ ...TIGER_C, kind: 7 }, PETS)).toEqual({ dst: 0, param: 0 }); // a kind the table lacks
    expect([0, 1, 2, 5].map((level) => petMaxEnergy(level, PETS))).toEqual([1, 180, 300, 1500]);
    // "%.2f%%" of (exp * 10000 / max) / 100, "99.99%" from 99.99 (OnDraw :601-608)
    expect(petExpText(12345, 100000)).toBe('12.34%');
    expect(petExpText(25000, 50000)).toBe('50.00%');
    expect(petExpText(99995, 100000)).toBe('99.99%');
    expect(petExpText(100000, 100000)).toBe('99.99%');
  });
});

// ---- the bag and the tooltip -------------------------------------------------------------------------------------

describe('the pet item in the bag (CWndItemCtrl) and its tooltip (PutPetInfo, PutPetFeedPocket)', () => {
  function bag(item: InventoryItem, inUse = false): InventoryWindow {
    const data = petData();
    const own = new OwnState(data, ownAddObj(item.pet ?? pet(), false), STARTER_EQUIPMENT);
    own.inventory!.set(item.objectId, item);
    const ui = new InventoryWindow(art, data, {
      use: vi.fn(), equip: vi.fn(), drop: vi.fn(), move: vi.fn(), shortcut: vi.fn(), inUse: (id) => inUse && id === item.objectId,
    });
    document.body.append(ui.frame.element);
    ui.toggle(own);
    return ui;
  }
  const cellOf = (ui: InventoryWindow): HTMLElement => {
    const cells = [...ui.frame.element.querySelectorAll<HTMLElement>('[data-bag-slot]')];
    return cells.find((cell) => cell.getAttribute('aria-label')?.includes('Cage'))!;
  };

  it('draws the icon by level and says the "Cage" name; the summoned one faded, a dead one tinted red', () => {
    let ui = bag(petItem({ ...TIGER_C, level: 3 }));
    let cell = cellOf(ui);
    expect(cell.getAttribute('aria-label')).toMatch(/^White Tiger Cage ×1/);
    expect(cell.querySelector('img')!.getAttribute('src')).toBe('/assets/ui/item/itm_petwhitetiger01_01.png');
    expect(cell.classList.contains('is-in-use')).toBe(false);
    expect(cell.querySelector('.inventory-expired')).toBeNull();
    ui.dispose();
    ui = bag(petItem(TIGER_C, { flag: 1 }), true);
    cell = cellOf(ui);
    expect(cell.classList.contains('is-in-use')).toBe(true);
    expect(cell.querySelector<HTMLElement>('.inventory-expired')!.style.getPropertyValue('mask-image'))
      .toContain('/assets/ui/item/itm_petwhitetiger01_00.png');
    ui.dispose();
  });

  it('a hatched pet: name, grade, bonus, steps, EXP, life and energy, then its awakening (PutPetInfo :5285-5446)', () => {
    const data = petData();
    const lines = itemTooltip(petItem(TIGER_C), data.itemProps.get(II_TIGER)!, data, { flag: 'inventory', viewer: null });
    expect(texts(lines)).toEqual([
      'White Tiger Cage', 'Level : C Level', 'Bonus : STR +5', '(Lv1/Lv3)', 'Exp : 12.34%', 'Life : 3', 'P.Hp : 150 / 300',
      'White Tiger\'s words.', '"Awakenable"',
    ]);
    expect(lines[0]![0]).toMatchObject({ color: 0x2e70a9, bold: true });
    expect(lines[1]![0]!.color).toBe(0x009e00);
    expect(lines[3]!.map((run) => run.color)).toEqual([0x00c8ff, 0x007fff, 0x00c8ff, 0x007fff, 0x00c8ff]);
  });

  it('an egg: the kind line, its grade and EXP; a dead one says so (no awakening below C)', () => {
    const data = petData();
    const egg = petItem(pet({ exp: 25000 }), { flag: 1 });
    expect(texts(itemTooltip(egg, data.itemProps.get(II_PET_EGG)!, data, { flag: 'inventory', viewer: null }))).toEqual([
      'Egg Cage', '[Raised Pet] (Death)', 'Level : Egg', 'Exp : 50.00%', 'Pet Egg\'s words.',
    ]);
  });

  it('the feed pocket: how to use it, or whether it is on and the food in the bag (PutPetFeedPocket :5448-5590)', () => {
    const data = petData();
    const prop = data.itemProps.get(II_FEED_POCKET)!;
    const pocket: InventoryItem = { objectId: 7, itemId: II_FEED_POCKET, count: 1 };
    expect(texts(itemTooltip(pocket, prop, data, { flag: 'inventory', viewer: null })))
      .toEqual(['Pet Feed Pocket', 'Double-click to use.']);
    const used = { ...pocket, keepTime: 3600 };
    const on = { flag: 'inventory' as const, viewer: null, hasBuff: (type: number, id: number) => type === 0 && id === II_FEED_POCKET, countOf: () => 12 };
    expect(texts(itemTooltip(used, prop, data, on))).toEqual(['Pet Feed Pocket (Active)', 'Pet food count: 12', 'Eats the food in the bag.']);
    expect(texts(itemTooltip(used, prop, data, { ...on, hasBuff: () => false })))
      .toEqual(['Pet Feed Pocket (Inactive)', 'Eats the food in the bag.']);
  });

  it('is not drawn again for the pet\'s numbers (PET_STATE, PET_SET_EXP, PET_FEED); its open tooltip shows them', () => {
    // the server sends PET_STATE about once a second (ProcessPetEnergy, Mover.cpp:11028-11112): the bag and the shop
    // keep their cells, the tooltip and the Use/Equip panel; the name and level (SET_PET_NAME, PET) are the bag's
    const data = petData();
    const own = new OwnState(data, ownAddObj(TIGER_C, true), STARTER_EQUIPMENT);
    const ui = new InventoryWindow(art, data, { use: vi.fn(), equip: vi.fn(), drop: vi.fn(), move: vi.fn(), shortcut: vi.fn() });
    document.body.append(ui.frame.element);
    ui.toggle(own);
    const cell = cellOf(ui);
    cell.dispatchEvent(new MouseEvent('mouseenter'));
    const details = ui.frame.element.querySelector('.inventory-details')!;
    expect(details.textContent).toContain('P.Hp : 150 / 300');
    const revision = own.inventoryRevision, petRevision = own.petRevision;
    own.apply({ type: 'petState', itemObjectId: EGG_SLOT, life: 3, energy: 120, exp: 12345 }, own.objectId);
    own.apply({ type: 'petSetExp', exp: 20000 }, own.objectId);
    own.apply({ type: 'petFeed', energy: 140 }, own.objectId);
    expect(own.inventoryRevision).toBe(revision);
    expect(own.petRevision).toBe(petRevision + 3);
    ui.update(own);
    expect(cellOf(ui)).toBe(cell);
    expect(ui.frame.element.querySelector('.inventory-details')).toBe(details);
    expect(details.textContent).toContain('P.Hp : 140 / 300');
    expect(details.textContent).toContain('Exp : 20.00%');
    own.apply({ type: 'setPetName', name: 'Tigger' }, own.objectId);
    expect(own.inventoryRevision).toBe(revision + 1);
    own.apply({ type: 'pet', pet: { ...TIGER_C, level: 3 }, flag: 1 }, own.objectId);
    expect(own.inventoryRevision).toBe(revision + 2);
    ui.update(own);
    expect(cellOf(ui).getAttribute('aria-label')).toMatch(/^White Tiger Cage/); // PET's whole pet: its name ''
    ui.dispose();
  });
});

// ---- the buff bar ------------------------------------------------------------------------------------------------

describe('BUFF_PET in the buff bar (GetSystemPetTextureKey, PutPetTooltipInfo)', () => {
  const buff = (buffType: number, id: number) => ({ buffType, id, level: 5, leftMs: 0, totalMs: 0 });

  it('picks the pet item\'s icon by the own pet\'s level; a hatched pet\'s item has none at the egg\'s level', () => {
    const data = petData();
    expect(petBuffIcon(data.itemProps.get(II_TIGER)!, 5)).toBe('ui/item/itm_petwhitetiger01_02.png');
    expect(petBuffIcon(data.itemProps.get(II_TIGER)!, 3)).toBe('ui/item/itm_petwhitetiger01_01.png');
    expect(petBuffIcon(data.itemProps.get(II_TIGER)!, 0)).toBeNull();
    expect(petBuffIcon(data.itemProps.get(II_TIGER)!, null)).toBeNull();
    expect(petBuffIcon(data.itemProps.get(II_PET_EGG)!, 0)).toBe('ui/item/itm_petegg.png');
  });

  it('shows it among the item buffs in the map\'s order, with no time, and the pet\'s tooltip', () => {
    const data = petData();
    let level: number | null = 5;
    const status = new BuffStatus(art, document, {
      items: data.itemProps, petLevel: () => level,
      petTooltip: () => petBuffTooltip(petItem({ ...TIGER_C, level: 5, availLevels: [1, 3, 2, 1, 9, 0] }), data.itemProps.get(II_TIGER)!, data),
    });
    document.body.append(status.element);
    status.update([buff(3, 100), buff(2, II_TIGER), buff(0, 30000)], new Map(), 0);
    const icons = [...status.element.querySelectorAll<HTMLElement>('.hud-buff')];
    expect(icons.map((icon) => icon.querySelector('img')!.getAttribute('src'))).toEqual([
      '/assets/ui/item/itm_eel.png', '/assets/ui/item/itm_petwhitetiger01_02.png', '/assets/ui/item/itm_charm.png',
    ]);
    expect(icons[1]!.querySelector('.hud-buff-time, .hud-buff-seconds')).toBeNull();
    expect(icons[1]!.style.opacity).toBe(String(192 / 255));
    expect(icons[1]!.title.split('\n')).toEqual(['White Tiger Cage', 'Level : S Level', 'Bonus : STR +45', '(Lv1/Lv3/Lv2/Lv1/Lv9)']);
    level = 0; // a hatched pet's item at the egg's level has no texture: left out
    status.update([buff(2, II_TIGER)], new Map(), 1);
    expect(status.element.hidden).toBe(true);
    status.dispose();
  });
});
