// 2026-11-15 (item tooltip gaps): the parts of Neuz's item tooltip FlyffWeb had left out, line by line
// (docs/superpowers/specs/2026-11-15-item-tooltip-gaps-research.md): the cool-down (PutCoolTime), an item's own time left
// (PutKeepTime), the guild cloak's name (PutItemName), the couple ring's name (PutCommand), the tax (PutItemGold), the
// feed pocket's time, and the comparison tooltips' "[ Equipped ]" line and items (PutToolTipItemAndSubToolTip).

import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '@flyffweb/protocol';
import type { ClientText } from '../src/world/gameData';
import { comparisonItems, itemTooltip } from '../src/world/items/itemTooltip';
import type { TooltipContext, TooltipLine } from '../src/world/items/itemTooltip';
import { SUIT, WOODEN_SWORD, itemProp } from './helpers/ownState';

const TEXTS: Record<string, string> = {
  TID_TOOLTIP_COOLTIME: 'Waiting Time for reuse: %.2d:%.2d', TID_TOOLTIP_PERIOD: 'Period', TID_TOOLTIP_ITEMTIME: 'Time Left',
  TID_GAME_COND_USE: 'Takes effect when player dies.', TID_ITEM_INFO: 'Description: %s', TID_GUILD_CLOAK: '%s Guild Cloak',
  TID_ITEM_COUPLERING_DESC: 'The name of %s was carved into the ring.', TID_GAME_TOOLTIP_ITEM_BINDS: 'Event Reward:',
  TID_GAME_TOOLTIP_COST2: 'Price : %s', TID_GAME_TOOLTIP_SHELLCOST2: 'Selling Price : %s', TID_GAME_TAX_RATE: 'Before tax price : %s',
  TID_GAME_REDCHIP: 'Red Chip', TID_GAME_EQUIPED_ITEM: 'Equipped', TID_GAME_TOOLTIP_DEFENSE_B: 'DEF',
  TID_GAME_AWAKENING: 'Awakening Available',
};
const texts = new Map<string, ClientText>(Object.entries(TEXTS).map(([id, text]) => [id, { id, text, color: 0xffffffff }]));
const DATA = { texts, itemProps: new Map() };
const OTHER: TooltipContext = { flag: 'other', viewer: null };

const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({ objectId: 1, itemId: 900, count: 1, ...over });
const textOf = (lines: TooltipLine[]): string[] => lines.map((line) => line.map((run) => run.text).join(''));
const lineOf = (lines: TooltipLine[], text: string): TooltipLine => {
  const found = lines.find((line) => line.map((run) => run.text).join('') === text);
  if (found === undefined) throw new Error(`no line "${text}" in ${JSON.stringify(textOf(lines))}`);
  return found;
};

/** A food with a cool-down and a duration (IK2_FOOD 14). */
const FOOD = itemProp({ id: 900, name: 'Cake', kind1: 3, kind2: 14, kind3: 30, part: -1, circleTime: 60, cooldownMs: 90_000, description: 'Sweet.' });
/** A scroll with no duration of its prop (a premium item: its time is the item's own). */
const SCROLL = itemProp({ id: 901, name: 'Scroll', kind1: 3, kind2: 15, kind3: 30, part: -1, description: 'Reads well.' });

describe('PutCoolTime (WndManager.cpp:5814-5831): the wait of the item\'s cool-down group', () => {
  it('in black, mm:ss of (end - now + 500) / 1000, after the vis lines and before the time lines', () => {
    const lines = itemTooltip(item(), FOOD, DATA, { ...OTHER, cooldownLeft: 64_600 });
    expect(textOf(lines)).toEqual(['Cake', 'Waiting Time for reuse: 01:05', 'Time Left : 1m', 'Description: Sweet.']);
    expect(lineOf(lines, 'Waiting Time for reuse: 01:05')).toEqual([{ text: 'Waiting Time for reuse: 01:05', color: 0x000000 }]);
  });

  it('nothing when the group does not wait', () => {
    expect(textOf(itemTooltip(item(), FOOD, DATA, { ...OTHER, cooldownLeft: 0 }))).not.toContain('Waiting Time for reuse: 00:00');
    expect(textOf(itemTooltip(item(), FOOD, DATA, OTHER)).join('|')).not.toMatch(/Waiting/);
  });
});

describe('PutKeepTime\'s second half (WndManager.cpp:5859-5956): the item\'s own time left', () => {
  it('the time from its end, short, then "Period", in green (the owner\'s short durations)', () => {
    const lines = itemTooltip(item({ itemId: 901, keepTime: 5000 }), SCROLL, DATA, { ...OTHER, now: 1000, keepEnd: 1000 + 90061 });
    expect(textOf(lines)).toEqual(['Scroll', '1d1h Period', 'Description: Reads well.']);
    expect(lineOf(lines, '1d1h Period')).toEqual([{ text: '1d1h Period', color: 0x00c800 }]);
  });

  it('without an end kept (another window\'s item), the seconds it had left when it came', () => {
    expect(textOf(itemTooltip(item({ itemId: 901, keepTime: 3600 }), SCROLL, DATA, { ...OTHER, now: 50 }))).toContain('1h Period');
  });

  it('"Period" alone once its time is past; nothing when expired, or with no time of its own', () => {
    expect(textOf(itemTooltip(item({ itemId: 901, keepTime: 10 }), SCROLL, DATA, { ...OTHER, now: 500, keepEnd: 400 })))
      .toEqual(['Scroll', 'Period', 'Description: Reads well.']);
    expect(textOf(itemTooltip(item({ itemId: 901, keepTime: 10, flag: 0x01 }), SCROLL, DATA, { ...OTHER, now: 0, keepEnd: 400 })))
      .toEqual(['Scroll', 'Description: Reads well.']);
    expect(textOf(itemTooltip(item({ itemId: 901 }), SCROLL, DATA, OTHER))).toEqual(['Scroll', 'Description: Reads well.']);
  });

  it('a ticket (IK3_TICKET 122) the same', () => {
    const ticket = itemProp({ id: 902, name: 'Ticket', kind1: 3, kind2: 15, kind3: 122, part: -1 });
    expect(textOf(itemTooltip(item({ itemId: 902, keepTime: 1 }), ticket, DATA, { ...OTHER, now: 0, keepEnd: 7200 })))
      .toEqual(['Ticket', '2h Period']);
  });
});

describe('PutItemName (WndManager.cpp:4575-4588): a guild cloak\'s name', () => {
  const CLOAK = itemProp({ id: 4600, name: 'Guild Cloak', kind1: 2, kind2: 9, kind3: 24, part: 8 });
  const guildName = (id: number): string | undefined => (id === 77 ? 'Lions' : undefined);

  it('"%s Guild Cloak" with the guild the cloak was made for, bold, in the name colour', () => {
    const lines = itemTooltip(item({ itemId: 4600, guildId: 77 }), CLOAK, DATA, { ...OTHER, guildName });
    expect(lines[0]).toEqual([{ text: 'Lions Guild Cloak', color: 0x2e70a9, bold: true }]);
    // after the "binds" prefix, as strTemp + str
    const bound = itemTooltip(item({ itemId: 4600, guildId: 77, flag: 0x02 }), CLOAK, DATA, { ...OTHER, guildName });
    expect(textOf(bound)[0]).toBe('Event Reward: Lions Guild Cloak');
  });

  it('the prop\'s name for a guild not known, a guild war\'s dragon cloak, or a cloak of no guild', () => {
    expect(textOf(itemTooltip(item({ itemId: 4600, guildId: 5 }), CLOAK, DATA, { ...OTHER, guildName }))[0]).toBe('Guild Cloak');
    const dragon = { ...CLOAK, id: 4703, name: 'Dragon Cloak' };
    expect(textOf(itemTooltip(item({ itemId: 4703, guildId: 77 }), dragon, DATA, { ...OTHER, guildName }))[0]).toBe('Dragon Cloak');
    expect(textOf(itemTooltip(item({ itemId: 4600 }), CLOAK, DATA, { ...OTHER, guildName }))[0]).toBe('Guild Cloak');
  });
});

describe('PutCommand (WndManager.cpp:6160-6195): a couple ring\'s carved name', () => {
  const RING = itemProp({ id: 3600, name: 'Couple Ring', kind1: 3, kind2: 15, kind3: 30, part: -1, description: 'Warps to the couple.' });
  const playerName = (id: number): string | undefined => (id === 1234 ? 'Juliet' : undefined);

  it('the partner (m_iRandomOptItemId) by name, in the description line', () => {
    const lines = itemTooltip(item({ itemId: 3600, randomOption: 1234n }), RING, DATA, { ...OTHER, playerName });
    expect(textOf(lines).at(-1)).toBe('Description: The name of Juliet was carved into the ring.');
    for (const id of [3601, 18186]) {
      expect(textOf(itemTooltip(item({ itemId: id, randomOption: 1234n }), { ...RING, id }, DATA, { ...OTHER, playerName })).at(-1))
        .toBe('Description: The name of Juliet was carved into the ring.');
    }
  });

  it('an empty name while the player data is not in yet; the prop\'s description when not carved', () => {
    expect(textOf(itemTooltip(item({ itemId: 3600, randomOption: 99n }), RING, DATA, { ...OTHER, playerName })).at(-1))
      .toBe('Description: The name of  was carved into the ring.');
    expect(textOf(itemTooltip(item({ itemId: 3600 }), RING, DATA, { ...OTHER, playerName })).at(-1)).toBe('Description: Warps to the couple.');
  });
});

describe('PutItemGold\'s tax (WndManager.cpp:5676-5805, CTax)', () => {
  const POTION = itemProp({ id: 802, name: 'Potion', kind1: 3, kind2: 12, kind3: 30, part: -1, cost: 1000 });
  const SHOP: TooltipContext = { flag: 'shop', viewer: null, tax: { purchase: Math.fround(Math.fround(5 * Math.fround(0.1)) * Math.fround(0.1)), sales: 0.1 } };

  it('the shop price with the purchase tax, then "Before tax price" in the TID\'s grey', () => {
    const lines = itemTooltip(item({ itemId: 802 }), POTION, DATA, SHOP);
    expect(textOf(lines).slice(-2)).toEqual(['Price : 1,050', 'Before tax price : 1,000']);
    expect(lineOf(lines, 'Before tax price : 1,000')).toEqual([{ text: 'Before tax price : 1,000', color: 0x808080 }]);
  });

  it('the selling price less the sales tax while a shop is open, and the line', () => {
    const lines = itemTooltip(item({ itemId: 802 }), POTION, DATA, { flag: 'inventory', viewer: null, shopOpen: true, tax: { purchase: 0, sales: 0.1 } });
    expect(textOf(lines).slice(-2)).toEqual(['Selling Price : 225', 'Before tax price : 250']);
  });

  it('the line shows at 0 % too; not off every continent, nor at a Red Chip merchant', () => {
    expect(textOf(itemTooltip(item({ itemId: 802 }), POTION, DATA, { ...SHOP, tax: { purchase: 0, sales: 0 } })).slice(-2))
      .toEqual(['Price : 1,000', 'Before tax price : 1,000']);
    expect(textOf(itemTooltip(item({ itemId: 802 }), POTION, DATA, { ...SHOP, tax: null })).at(-1)).toBe('Price : 1,000');
    const box = { ...POTION, referValue1: 500 };
    expect(textOf(itemTooltip(item({ itemId: 802 }), box, DATA, { ...SHOP, chipVendor: true })).at(-1)).toBe('Price : 500 Red Chip');
  });

  it('perin, the red chip and the two awakening scrolls have no tax; perin costs PERIN_VALUE', () => {
    for (const id of [26460, 26461, 20024]) {
      expect(textOf(itemTooltip(item({ itemId: id }), { ...POTION, id }, DATA, SHOP)).at(-1)).toBe('Price : 1,000');
    }
    expect(textOf(itemTooltip(item({ itemId: 26456 }), { ...POTION, id: 26456 }, DATA, SHOP)).at(-1)).toBe('Price : 100,000,000');
  });
});

describe('PutPetFeedPocket\'s time (WndManager.cpp:5448-5545)', () => {
  const POCKET = itemProp({ id: 21035, name: 'Pet Feed Pocket', kind1: 3, kind2: 15, kind3: 30, part: -1 });
  const TEXT2 = new Map(texts);
  for (const [id, text] of [['TID_GAME_POCKETUSING', '(Active)'], ['TID_GAME_POCKET_NOTUSING', '(Inactive)'],
    ['TID_GAME_PET_FEED_COUNT', 'Pet food count:'], ['TID_GAME_PET_FEEDPOCKET', 'Eats the food in the bag.']] as const) {
    TEXT2.set(id, { id, text, color: 0xffffffff });
  }
  const data = { texts: TEXT2, itemProps: new Map() };

  it('on: its time in red after the name line, then the food; off: its time in green', () => {
    const used = item({ itemId: 21035, keepTime: 1 });
    const on: TooltipContext = { ...OTHER, now: 0, keepEnd: 3 * 3600, hasBuff: () => true, countOf: () => 12 };
    const lines = itemTooltip(used, POCKET, data, on);
    expect(textOf(lines)).toEqual(['Pet Feed Pocket (Active)', '3h Period', 'Pet food count: 12', 'Eats the food in the bag.']);
    expect(lineOf(lines, '3h Period')).toEqual([{ text: '3h Period', color: 0xff1414 }]);
    const off = itemTooltip(used, POCKET, data, { ...on, hasBuff: () => false });
    expect(textOf(off)).toEqual(['Pet Feed Pocket (Inactive)', '3h Period', 'Eats the food in the bag.']);
    expect(lineOf(off, '3h Period')).toEqual([{ text: '3h Period', color: 0x00c800 }]);
  });
});

describe('the comparison tooltips (PutToolTipItemAndSubToolTip :6413-6497, PutEquipItemText :7709-7714)', () => {
  it('a sub tooltip starts with "[ Equipped ]", bold and black, on its own line', () => {
    const lines = itemTooltip(item({ itemId: 502 }), { ...SUIT, endurance: 100 }, DATA, { ...OTHER, equipped: true });
    expect(lines[0]).toEqual([{ text: '[ Equipped ]', color: 0x000000, bold: true }]);
    expect(textOf(lines)[1]).toBe('Cotton Suit');
  });

  const worn = (parts: Record<number, number>) => (part: number): InventoryItem | undefined =>
    parts[part] === undefined ? undefined : item({ objectId: 42 + part, itemId: parts[part] });
  const ids = (list: InventoryItem[]): number[] => list.map((each) => each.itemId);

  it('the item worn on the part, for gear, jewellery, rides and wigs only', () => {
    expect(ids(comparisonItems(SUIT, worn({ 2: 503 })))).toEqual([503]);
    expect(ids(comparisonItems(SUIT, worn({})))).toEqual([]);
    const wig = itemProp({ id: 950, name: 'Wig', kind1: 2, kind2: 32, kind3: 0, part: 26 });
    expect(ids(comparisonItems(wig, worn({ 26: 951 })))).toEqual([951]);
    // a potion (IK2_POTION 12) and an item with no part have none
    const potion = itemProp({ id: 802, name: 'Potion', kind1: 3, kind2: 12, kind3: 30, part: -1 });
    expect(ids(comparisonItems(potion, worn({ 2: 503 })))).toEqual([]);
  });

  it('a right-hand weapon: both hands when both are held, else the hand that holds one', () => {
    expect(ids(comparisonItems(WOODEN_SWORD, worn({ 10: 22, 9: 23 })))).toEqual([22, 23]);
    expect(ids(comparisonItems(WOODEN_SWORD, worn({ 10: 22 })))).toEqual([22]);
    expect(ids(comparisonItems(WOODEN_SWORD, worn({ 9: 23 })))).toEqual([23]);
  });

  it('rings and earrings: both when both are worn, else the one worn', () => {
    const ring = itemProp({ id: 960, name: 'Ring', kind1: 2, kind2: 13, kind3: 0, part: 20 });
    expect(ids(comparisonItems(ring, worn({ 20: 961, 21: 962 })))).toEqual([961, 962]);
    expect(ids(comparisonItems(ring, worn({ 21: 962 })))).toEqual([962]);
    const earring = { ...ring, part: 22 };
    expect(ids(comparisonItems(earring, worn({ 22: 963, 23: 964 })))).toEqual([963, 964]);
    expect(ids(comparisonItems(earring, worn({ 22: 963 })))).toEqual([963]);
  });
});
