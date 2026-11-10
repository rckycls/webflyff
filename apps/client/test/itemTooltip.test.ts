import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '@flyffweb/protocol';
import type { ClientText } from '../src/world/gameData';
import { itemEtcOf, itemTooltip } from '../src/world/items/itemTooltip';
import type { ItemEtc, TooltipContext, TooltipLine } from '../src/world/items/itemTooltip';
import { SUIT, WOODEN_SWORD, itemProp } from './helpers/ownState';

// 2026-11-05: the item tooltip as Neuz writes it (CWndMgr::MakeToolTipText, WndManager.cpp:6550-6746). The awakening
// examples are the research's worked examples (docs/superpowers/specs/2026-11-05-item-tooltip-research.md §2.4), from
// randomoption.cpp's GetParam.

/** The English texts the tooltip reads (Resource/textClient.txt.txt), by TID. */
const TEXTS: Record<string, string> = {
  TID_GAME_TOOLTIP_ITEM_BINDS: 'Event Reward:', TID_TOOLTIP_EQUIPBIND_BEFORE: 'This item will be soul-linked once equipped.',
  TID_TOOLTIP_EQUIPBIND_AFTER: 'Soul-linked.', TID_TOOLTIP_PET_PICKUP: '[Pick-Up Pet]', TID_TOOLTIP_PET_REAR: '[Raised Pet]',
  TID_TOOLTIP_PET_BUFF: '[Buff Pet]', TID_GAME_TOOLTIP_ONEHANDWEAPON: 'One-handed weapon.',
  TID_GAME_TOOLTIP_TWOHANDWEAPON: 'Two-handed weapon.', TID_GAME_TOOLTIP_SEXMALE: 'SEX: Male', TID_GAME_TOOLTIP_SEXFEMALE: 'SEX: Female',
  TID_GAME_TOOLTIP_ATTACKRANGE2: 'Attack:', TID_GAME_TOOLTIP_DEFENSE_B: 'DEF', TID_GAME_TOOLTIP_ATTACKSPEED: 'Attack speed: %s',
  TID_GAME_VERYFAST: 'Very fast', TID_UPGRADE_FIRE: 'Fire', TID_UPGRADE_WATER: 'Water',
  TID_GAME_TOOLTIP_ELEC_RES: 'Electricity Resistance : %d', TID_GAME_TOOLTIP_FIRE_RES: 'Fire Resistance : %d',
  TID_GAME_TOOLTIP_WATER_RES: 'Water Resistance : %d', TID_GAME_TOOLTIP_WIND_RES: 'Wind Resistance : %d',
  TID_GAME_TOOLTIP_EARTH_RES: 'Earth Resistance : %d', TID_GAME_TOOLTIP_RECOVHP: 'HP Recovery: %d',
  TID_GAME_TOOLTIP_MAXRECOVER: 'Max. Recovery: %d', TID_GAME_COND_USE: 'Takes effect when player dies.',
  TID_TOOLTIP_ITEMTIME: 'Time Left', TID_TOOLTIP_DATE: '%d Day(s) %d Hr(s) %d Min(s) %d Sec(s)',
  TID_GAME_TOOLTIP_REGMERSER: 'Req Job: Mercenary', TID_GAME_TOOLTIP_KNIGHT_MASTER: 'Required Job: Master Knight',
  TID_GAME_TOOLTIP_REQLEVEL: 'Required Level : %d', TID_ITEM_INFO: 'Description: %s', TID_GAME_TOOLTIP_COST2: 'Price : %s',
  TID_GAME_TOOLTIP_SHELLCOST2: 'Selling Price : %s', TID_TOOLTIP_SET: 'Set Effect', TID_GAME_AWAKENING: 'Awakening Available',
  TID_GAME_BLESSING_CAPTION: 'Blessed Options',
  TID_GAME_BLESSING_WARNING: '※ Blessed items cannot be dropped, traded, or placed in a Bank.',
  TID_TOOLTIP_STR: 'STR', TID_TOOLTIP_DEX: 'DEX', TID_TOOLTIP_INT: 'INT', TID_TOOLTIP_STA: 'STA', TID_TOOLTIP_ATKSPEED: 'Attack Speed',
  TID_TOOLTIP_MAXHP: 'Max. HP', TID_TOOLTIP_ATKPOWER_VALUE: 'Attack', TID_TOOLTIP_DST_CRITICAL_RATE: 'Critical Chance',
  TID_TOOLTIP_DEFENCE: 'DEF', TID_TOOLTIP_SPEED: 'Speed', TID_TOOLTIP_ATKPOWER: 'Increased Attack', TID_GAME_TOOLTIPALLSTAT: 'All Stat',
  TID_TOOLTIP_HITRATE: 'Hit', TID_GAME_TOOLTIPBLOCKRATE: 'Block', TID_TOOLTIP_DST_HP_MAX_RATE: 'Increased HP',
  TID_GAME_TOOLTIPCONDITIONRATE: 'Add Magical Power', TID_TOOLTIP_DST_MELEE_STEALHP: 'Steal HP',
};
const texts = new Map<string, ClientText>(Object.entries(TEXTS).map(([id, text]) => [id, { id, text, color: 0xffffffff }]));

const SET = {
  id: 1, name: 'Darkness Set',
  elems: [{ itemId: 1001, part: 6 }, { itemId: 1002, part: 2 }, { itemId: 1003, part: 4 }],
  avail: [{ dst: 1, adj: 5, count: 2 }, { dst: 1, adj: 3, count: 2 }, { dst: 35, adj: 100, count: 3 }],
};
const ETC: ItemEtc = {
  setOf: new Map(SET.elems.map((elem) => [elem.itemId, SET])),
  piercing: new Map([[2001, [{ dst: 66, adj: 3 }]], [2002, [{ dst: 1, adj: -5 }]]]),
  accessories: new Map([[2100, Array.from({ length: 21 }, (_, i) => (i === 2 ? [{ dst: 35, adj: 40 }] : []))]]),
};
const PROPS = new Map([
  [1001, itemProp({ id: 1001, name: 'Darkness Hat', part: 6 })],
  [1002, itemProp({ id: 1002, name: 'Darkness Suit', part: 2 })],
  [1003, itemProp({ id: 1003, name: 'Darkness Gloves', part: 4 })],
]);
const DATA = { texts, itemProps: PROPS, itemEtc: ETC };
const OTHER: TooltipContext = { flag: 'other', viewer: null };

const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({ objectId: 1, itemId: 502, count: 1, ...over });
/** The lines as text, a run per line joined. */
const textOf = (lines: TooltipLine[]): string[] => lines.map((line) => line.map((run) => run.text).join(''));
/** The line whose text is `text`, for its colours and styles. */
const lineOf = (lines: TooltipLine[], text: string): TooltipLine => {
  const found = lines.find((line) => line.map((run) => run.text).join('') === text);
  if (found === undefined) throw new Error(`no line "${text}" in ${JSON.stringify(textOf(lines))}`);
  return found;
};

describe('the item tooltip: the awakening (PutAwakeningBlessing, WndManager.cpp:4719-4830)', () => {
  const suit = { ...SUIT, endurance: 100 };

  it('an awakened suit: three options, blue, no caption; Attack Speed is /2/10 with a space after (example A)', () => {
    const lines = itemTooltip(item({ randomOption: 0x08cfa184b0041400n }), suit, DATA, OTHER);
    expect(textOf(lines).slice(-3)).toEqual(['STR +20', 'Attack Speed +15% ', 'Max. HP +250']);
    for (const text of ['STR +20', 'Max. HP +250']) expect(lineOf(lines, text)).toEqual([{ text, color: 0x0000ff }]);
    expect(textOf(lines)).not.toContain('"Awakening Available"');
  });

  it('a suit not awakened yet says so, in quotes', () => {
    expect(textOf(itemTooltip(item(), suit, DATA, OTHER)).at(-1)).toBe('"Awakening Available"');
  });

  it('a protected gauntlet: its options struck through, a negative one with -, and (-5) after the required level (example B)', () => {
    const gauntlet = itemProp({ id: 700, name: 'Gauntlet', kind3: 19, part: 4, abilityMin: 5, abilityMax: 6, endurance: 100, limitLevel: 60 });
    const lines = itemTooltip(item({ itemId: 700, randomOption: 0x600000983d4c6400n }), gauntlet, DATA,
      { flag: 'other', viewer: { sex: 0, job: 1, level: 56 } });
    expect(lineOf(lines, 'Attack +100')).toEqual([{ text: 'Attack +100', color: 0x0000ff, strike: true }]);
    expect(lineOf(lines, 'Critical Chance -15%')).toEqual([{ text: 'Critical Chance -15%', color: 0x0000ff, strike: true }]);
    expect(textOf(lines)).not.toContain('"Awakening Available"');
    // 60 - 5 = 55 is the level that counts, so level 56 can wear it
    expect(lineOf(lines, 'Required Level : 60(-5)')).toEqual([
      { text: 'Required Level : 60', color: 0x000000 }, { text: '(-5)', color: 0xff4200 },
    ]);
  });

  it('a blessed cloak: the caption, its options, and the red warning (example C)', () => {
    const cloak = itemProp({ id: 800, name: 'Cloak', kind2: 8, kind3: 24, part: 8 });
    const lines = itemTooltip(item({ itemId: 800, randomOption: 0x000000b028685000n }), cloak, DATA, OTHER);
    expect(textOf(lines).slice(-4)).toEqual([
      'Blessed Options', 'DEF +80', 'Speed +10%', '※ Blessed items cannot be dropped, traded, or placed in a Bank.',
    ]);
    expect(lines.at(-1)).toEqual([{ text: '※ Blessed items cannot be dropped, traded, or placed in a Bank.', color: 0xff0000 }]);
  });

  it('a fashion item with no blessing, and an item that cannot be awakened, say nothing of it', () => {
    const hat = itemProp({ id: 801, name: 'Hat', kind2: 10, kind3: 26, part: 26 });
    expect(textOf(itemTooltip(item({ itemId: 801 }), hat, DATA, OTHER))).not.toContain('Blessed Options');
    const potion = itemProp({ id: 802, name: 'Potion', kind1: 3, kind2: 12, kind3: 30, part: -1 });
    expect(textOf(itemTooltip(item({ itemId: 802 }), potion, DATA, OTHER)).join('|')).not.toMatch(/Awakening/);
  });
});

describe('the item tooltip: the lines before the awakening', () => {
  it('the name: bold in its colour, the refine on the same line, the sockets in purple; "Event Reward:" when bound', () => {
    const sword = { ...WOODEN_SWORD, referStat1: 1, endurance: 100 };
    const lines = itemTooltip(item({ itemId: 21, abilityOption: 7, piercing: [2001, 0, 0], flag: 2 }), sword, DATA, OTHER);
    expect(lines[0]).toEqual([
      { text: 'Event Reward: Wooden Sword', color: 0x005d00, bold: true },
      { text: ' +7', color: 0x005d00, bold: true },
      { text: '    (1/3)', color: 0xb200ff },
    ]);
  });

  it('a weapon: hands, min~max with the refine in float32, attack speed (PutItemMinMax, PutItemSpeed)', () => {
    // 100 at +3: 100 * 1.06f is 105.99999, so 105, then + (int)pow( 3, 1.5 ) = 5
    const sword = { ...WOODEN_SWORD, abilityMin: 100, abilityMax: 125, endurance: 100 };
    const lines = itemTooltip(item({ itemId: 21, abilityOption: 3 }), sword, DATA, OTHER);
    expect(textOf(lines).slice(1, 4)).toEqual(['One-handed weapon.', 'Attack: 110 ~ 137', 'Attack speed: Very fast']);
    // an expired item: the multiplier is 0, so only the refine's bonus shows, in grey
    const expired = itemTooltip(item({ itemId: 21, abilityOption: 3, flag: 1 }), sword, DATA, OTHER);
    expect(lineOf(expired, 'Attack: 5 ~ 5')[1]).toEqual({ text: ' 5 ~ 5', color: 0x808080 });
  });

  it('gear: element, base resistances, stats with no space before the number, STAT_ALLUP as four lines', () => {
    const armour = { ...SUIT, endurance: 100, resists: [10, 0, 0, 0, 29], destParams: [10003, 11, -1], adjParams: [2, -5, -1] };
    const lines = itemTooltip(item({ resist: 1, resistOption: 4 }), armour, DATA, OTHER);
    expect(textOf(lines).slice(1)).toEqual([
      'DEF 8 ~ 10', 'Fire+4', 'Electricity Resistance : 10', 'Earth Resistance : 29', 'STR+2', 'DEX+2', 'INT+2', 'STA+2', 'Speed-5%',
      '"Awakening Available"',
    ]);
  });

  it('gear with no min~max keeps the empty line PutItemMinMax pushes', () => {
    expect(textOf(itemTooltip(item(), SUIT, DATA, OTHER))).toEqual(['Cotton Suit', '', '"Awakening Available"']);
  });

  it('an accessory adds its refine stats to its own (CAccessoryProperty::GetDst)', () => {
    const ring = itemProp({ id: 2100, name: 'Ring', kind1: 2, kind2: 13, kind3: 23, part: 20, destParams: [1, -1, -1], adjParams: [5, -1, -1] });
    expect(textOf(itemTooltip(item({ itemId: 2100, abilityOption: 2 }), ring, DATA, OTHER))).toEqual(['Ring +2', 'STR+5', 'Max. HP+40']);
  });

  it('a potion: its recovery and the most it can heal, once a valid pair (PutMedicine)', () => {
    const potion = itemProp({ id: 802, name: 'Potion', kind1: 3, kind2: 12, kind3: 30, part: -1, abilityMin: 300, destParams: [38, -1, -1], adjParams: [150, -1, -1] });
    expect(textOf(itemTooltip(item({ itemId: 802 }), potion, DATA, OTHER))).toEqual(['Potion', 'HP Recovery: 150', 'Max. Recovery: 300']);
  });

  it('the sex, job and level lines are orange when the viewer fails them (PutSex, PutJob, PutLevel)', () => {
    const armour = { ...SUIT, sex: 1, job: 1, limitLevel: 30 };
    const vagrant = { flag: 'other' as const, viewer: { sex: 0, job: 0, level: 15 } };
    const lines = itemTooltip(item(), armour, DATA, vagrant);
    for (const text of ['SEX: Female', 'Req Job: Mercenary', 'Required Level : 30']) expect(lineOf(lines, text)[0]!.color).toBe(0xff4200);
    // a Master Knight (16) may wear a Mercenary's item (16 = 1 * 2 + 14), and a Master any lower job's level
    const master = itemTooltip(item(), { ...armour, sex: 0 }, DATA, { flag: 'other', viewer: { sex: 0, job: 16, level: 1 } });
    for (const text of ['SEX: Male', 'Req Job: Mercenary', 'Required Level : 30']) expect(lineOf(master, text)[0]!.color).toBe(0x000000);
  });

  it('the duration of the prop, and the description (PutKeepTime, PutCommand)', () => {
    const scroll = itemProp({ id: 900, name: 'Scroll', kind1: 3, kind2: 15, kind3: 30, part: -1, circleTime: 90061, description: 'Reads well.' });
    expect(textOf(itemTooltip(item({ itemId: 900 }), scroll, DATA, OTHER))).toEqual([
      'Scroll', 'Time Left : 1 Day(s) 1 Hr(s) 1 Min(s) 1 Sec(s)', 'Description: Reads well.',
    ]);
  });

  it('the price: the buy price in the shop, the selling price (a quarter) in the bag while a shop is open (PutItemGold)', () => {
    const potion = itemProp({ id: 802, name: 'Potion', kind1: 3, kind2: 12, kind3: 30, part: -1, cost: 12345 });
    expect(textOf(itemTooltip(item({ itemId: 802 }), potion, DATA, { flag: 'shop', viewer: null })).at(-1)).toBe('Price : 12,345');
    expect(textOf(itemTooltip(item({ itemId: 802 }), potion, DATA, { flag: 'inventory', viewer: null, shopOpen: true })).at(-1))
      .toBe('Selling Price : 3,086');
    expect(textOf(itemTooltip(item({ itemId: 802 }), potion, DATA, { flag: 'inventory', viewer: null })).join('|')).not.toMatch(/Price/);
    // a refined item costs more: (int)( 1000 + 1000 * ( 0.1f + 3 * 3 / 18.0f ) ) = 1600
    const sword = { ...WOODEN_SWORD, cost: 1000 };
    expect(textOf(itemTooltip(item({ itemId: 21, abilityOption: 3 }), sword, DATA, { flag: 'shop', viewer: null }))).toContain('Price : 1,600');
  });

  it('a set piece: the set, the pieces worn in blue, and the effects of the pieces worn added up by DST (PutSetItemOpt)', () => {
    const worn = new Map([[6, item({ itemId: 1001 })], [2, item({ itemId: 1002 })]]);
    const lines = itemTooltip(item({ itemId: 1002 }), PROPS.get(1002)!, DATA, { flag: 'other', viewer: null, worn: (part) => worn.get(part) });
    // a blank line before the set's name (the format starts with two new lines); a suit's awakening line comes after
    expect(textOf(lines).slice(-8)).toEqual([
      '', '', 'Darkness Set (2/3)', '   Darkness Hat', '   Darkness Suit', '   Darkness Gloves', 'Set Effect: STR +8', '"Awakening Available"',
    ]);
    expect(lineOf(lines, '   Darkness Hat')[0]!.color).toBe(0x0000cc);
    expect(lineOf(lines, '   Darkness Gloves')[0]!.color).toBe(0xb2b2b2);
    expect(lineOf(lines, 'Set Effect: STR +8')[0]!.color).toBe(0xff9d00);
  });

  it('the socket cards: added up by DST, rates with %+d, the others with a literal + (PutPiercingOpt)', () => {
    const sword = { ...WOODEN_SWORD, endurance: 100 };
    const lines = itemTooltip(item({ itemId: 21, piercing: [2001, 2001, 2002] }), sword, DATA, OTHER);
    expect(textOf(lines).slice(-3)).toEqual(['Increased Attack+6%', 'STR+-5', '"Awakening Available"']);
    expect(lineOf(lines, 'Increased Attack+6%')[0]!.color).toBe(0xb200ff);
  });

  it('the set +N bonus on a worn suit, the lowest refine of suit, gloves, boots and cap (PutEnchantOpt)', () => {
    const worn = new Map([2, 4, 5, 6].map((part) => [part, item({ abilityOption: part === 5 ? 5 : 7 })]));
    const ctx: TooltipContext = { flag: 'inventory', viewer: null, worn: (part) => worn.get(part), isWorn: true };
    const lines = itemTooltip(item({ abilityOption: 7 }), { ...SUIT, endurance: 100 }, DATA, ctx);
    expect(textOf(lines)).toEqual(expect.arrayContaining(['Hit+50%', 'Block+15%', 'Increased HP+25%', 'Add Magical Power+25', 'All Stat+5']));
    // not on a suit in the bag
    expect(textOf(itemTooltip(item({ abilityOption: 7 }), { ...SUIT, endurance: 100 }, DATA, { ...ctx, isWorn: false }))).not.toContain('Hit+50%');
  });

  it('the equip-bind line in red, before and after (IP_FLAG_EQUIP_BIND)', () => {
    const bound = { ...SUIT, flag: 4 };
    expect(lineOf(itemTooltip(item(), bound, DATA, OTHER), 'This item will be soul-linked once equipped.')[0]!.color).toBe(0xff0000);
    const lines = itemTooltip(item({ flag: 2 }), bound, DATA, OTHER);
    expect(textOf(lines)).toContain('Soul-linked.');
    // its name has no "Event Reward:" (the prefix tests dwFlag != IP_FLAG_EQUIP_BIND)
    expect(textOf(lines)[0]).toBe('Cotton Suit');
  });
});

describe('itemEtcOf: data/itemEtc.json as the tooltip looks it up', () => {
  it('an item names the first set that lists it (CSetItemFinder: map::insert keeps the first), cards and accessories by id', () => {
    const other = { ...SET, id: 2, name: 'Other Set', elems: [{ itemId: 1001, part: 6 }, { itemId: 1004, part: 5 }] };
    const etc = itemEtcOf({
      sets: [SET, other], piercing: [{ itemId: 2001, params: [{ dst: 66, adj: 3 }] }],
      accessories: [{ itemId: 2100, levels: [[{ dst: 1, adj: 5 }]] }],
    });
    expect(etc.setOf.get(1001)?.name).toBe('Darkness Set');
    expect(etc.setOf.get(1004)?.name).toBe('Other Set');
    expect(etc.piercing.get(2001)).toEqual([{ dst: 66, adj: 3 }]);
    expect(etc.accessories.get(2100)?.[0]).toEqual([{ dst: 1, adj: 5 }]);
    expect(itemEtcOf({ sets: [], piercing: [] }).accessories.size).toBe(0);
  });
});

describe('the item tooltip: an Ultimate weapon\'s set jewels (2026-11-10, jewels research §4)', () => {
  const ULTIMATE = {
    abilities: [
      { dst: 35, jewels: [{ jewel: 2032, ability: 2040, values: [455, 910, 1365, 1820, 2730] }] },
      { dst: 83, jewels: [{ jewel: 2032, ability: 2045, values: [25, 50, 75, 100, 150] }] },
      { dst: 81, jewels: [{ jewel: 2032, ability: 2055, values: [10, 15, 25, 30, 45] }] },
    ],
    levelGems: [], descriptions: {},
  };
  const sword = { ...WOODEN_SWORD, name: 'Ultimate Sword', referStat1: 2, endurance: 100 };

  it('the name makes room for the icon; the jewels\' stats end it in red, steal HP in % (PutItemName, PutAddedOpt)', () => {
    const lines = itemTooltip(item({ ultimate: [2045, 2040, 2045, 2055, 0] }), sword, { ...DATA, ultimate: ULTIMATE }, OTHER);
    expect(textOf(lines)[0]).toBe('             Ultimate Sword');
    // in rising DST order (the C++ map): HP 35, steal HP 81, ATK 83
    expect(textOf(lines).slice(-3)).toEqual(['Max. HP+455', 'Steal HP+10%', 'Attack+50']);
    expect(lineOf(lines, 'Attack+50')).toEqual([{ text: 'Attack+50', color: 0xff0000 }]);
  });

  it('a weapon not Ultimate has neither; nor has an Ultimate one without the catalog', () => {
    expect(textOf(itemTooltip(item({ ultimate: [2045] }), { ...sword, referStat1: 1 }, { ...DATA, ultimate: ULTIMATE }, OTHER))[0])
      .toBe('Ultimate Sword');
    expect(textOf(itemTooltip(item({ ultimate: [2045] }), sword, DATA, OTHER)).at(-1)).not.toBe('Attack+25');
  });
});
