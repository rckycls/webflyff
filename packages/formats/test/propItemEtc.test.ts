import { describe, expect, it } from 'vitest';
import { readAccessories, readPropItemEtc } from '../src/index';
import { thrown } from './helpers/thrown';

/** Script text with the CRLF line ends the shipped files use. */
function script(...lines: string[]): string {
  return lines.join('\r\n') + '\r\n';
}

// 2026-11-05: the set items and the socket cards the item tooltip shows (CProject::LoadPiercingAvail,
// Source/_Common/Project.cpp:4137-4229)
describe('readPropItemEtc', () => {
  const DEFINES = new Map([
    ['II_ARM_M_CHR_DARKNESS01HAT', 1001], ['II_ARM_M_CHR_DARKNESS01SUIT', 1002], ['II_ARM_M_CHR_DARKNESS01GLOVE', 1003],
    ['II_GEN_MAT_CARD_FIRE1', 2001], ['II_GEN_MAT_CARD_WATER1', 2002],
    ['PARTS_CAP', 6], ['PARTS_UPPER_BODY', 2], ['PARTS_HAND', 4],
    ['DST_STR', 1], ['DST_HP_MAX', 35], ['DST_ADJDEF', 26], ['DST_ATKPOWER_RATE', 66],
  ]);
  const STRINGS = new Map([['IDS_PROPITEMETC_INC_000001', 'Darkness Set'], ['IDS_PROPITEMETC_INC_000000', 'Example']]);
  const FILE = script(
    '/*',
    'SetItem\t\t1\tIDS_PROPITEMETC_INC_000000',
    '{ Elem { II_X PARTS_Y } }',
    '*/',
    '// a set: its pieces, then what 2 and 3 of them give, written out of order',
    'SetItem\t\t1\tIDS_PROPITEMETC_INC_000001',
    '{',
    '\tElem',
    '\t{',
    '\t\tII_ARM_M_CHR_DARKNESS01HAT\t\tPARTS_CAP',
    '\t\tII_ARM_M_CHR_DARKNESS01SUIT\t\tPARTS_UPPER_BODY',
    '\t\tII_ARM_M_CHR_DARKNESS01GLOVE\tPARTS_HAND',
    '\t}',
    '\tAvail',
    '\t{',
    '\t\tDST_HP_MAX\t\t100\t3',
    '\t\tDST_STR\t\t\t5\t2',
    '\t\tDST_ADJDEF\t\t-10\t2',
    '\t}',
    '}',
    '',
    'Piercing\tII_GEN_MAT_CARD_FIRE1',
    '{',
    '\tDST_ATKPOWER_RATE\t3',
    '}',
    'Piercing\tII_GEN_MAT_CARD_WATER1',
    '{',
    '\tDST_HP_MAX\t50',
    '\tDST_ADJDEF\t4',
    '}',
    'Piercing\tII_GEN_MAT_CARD_FIRE1',
    '{',
    '\tDST_STR\t1',
    '}',
  );

  it('reads each set: its id, its name through the string table, its pieces, and its effects sorted by the count they need', () => {
    const { sets } = readPropItemEtc(FILE, DEFINES, STRINGS);
    expect(sets).toEqual([{
      id: 1,
      name: 'Darkness Set',
      elems: [{ itemId: 1001, part: 6 }, { itemId: 1002, part: 2 }, { itemId: 1003, part: 4 }],
      // CSetItem::SortItemAvail swaps any pair out of order (not a stable sort): 3, 2, 2 becomes 2, 2, 3 by swapping
      // the first with the second, then the (new) second with the third
      avail: [{ dst: 1, adj: 5, count: 2 }, { dst: 26, adj: -10, count: 2 }, { dst: 35, adj: 100, count: 3 }],
    }]);
  });

  it('reads the socket cards, the blocks of one card added together in file order (AddPiercingAvail)', () => {
    const { piercing } = readPropItemEtc(FILE, DEFINES, STRINGS);
    expect(piercing).toEqual([
      { itemId: 2001, params: [{ dst: 66, adj: 3 }, { dst: 1, adj: 1 }] },
      { itemId: 2002, params: [{ dst: 35, adj: 50 }, { dst: 26, adj: 4 }] },
    ]);
  });

  it('returns nothing for a file of comments, and throws for a word it does not know', () => {
    expect(readPropItemEtc(script('// nothing', '/* SetItem 1 X { } */'), DEFINES, STRINGS)).toEqual({ sets: [], piercing: [] });
    expect(thrown(() => readPropItemEtc(script('Piercing II_NOT_DEFINED', '{', '}'), DEFINES, STRINGS)).message)
      .toMatch(/II_NOT_DEFINED/);
  });
});

// 2026-11-05: the refine stats of the rings, earrings and necklaces (CAccessoryProperty::LoadScript,
// Source/_Common/accessory.cpp:39-90), which the tooltip adds to the item's own (PutBaseItemOpt)
describe('readAccessories', () => {
  const DEFINES = new Map([['II_GEN_JEW_RIN_STRRING', 2100], ['II_GEN_JEW_EAR_TWO', 2101], ['DST_STR', 1], ['DST_HP_MAX', 35]]);
  const FILE = script(
    '// the chances of a refine, which the tooltip does not need',
    'Probability',
    '{',
    '\t1000 900',
    '}',
    'Accessory',
    '{',
    '\tII_GEN_JEW_RIN_STRRING // a ring',
    '\t{',
    '\t\t0\t{\tDST_STR\t5\t}',
    '\t\t2\t{\tDST_STR\t15\tDST_HP_MAX\t40\t}',
    '\t}',
    '\tII_GEN_JEW_EAR_TWO',
    '\t{',
    '\t\t1\t{\tDST_HP_MAX\t10\t}',
    '\t}',
    '}',
  );

  it('reads each accessory: by refine level 0 to 20, what it gives (an empty list for a level the file skips)', () => {
    const accessories = readAccessories(FILE, DEFINES);
    expect(accessories).toHaveLength(2);
    expect(accessories[0]!.itemId).toBe(2100);
    expect(accessories[0]!.levels).toHaveLength(21);
    expect(accessories[0]!.levels.slice(0, 3)).toEqual([
      [{ dst: 1, adj: 5 }], [], [{ dst: 1, adj: 15 }, { dst: 35, adj: 40 }],
    ]);
    expect(accessories[1]).toEqual({ itemId: 2101, levels: Array.from({ length: 21 }, (_, i) => (i === 1 ? [{ dst: 35, adj: 10 }] : [])) });
  });

  it('throws for a refine level outside 0 to 20 (the C++ asserts)', () => {
    expect(() => readAccessories(script('Accessory', '{', 'II_GEN_JEW_EAR_TWO', '{', '21 { DST_STR 1 }', '}', '}'), DEFINES)).toThrow(/21/);
  });
});
