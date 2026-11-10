// 2026-11-10: Ultimate_GemAbility.txt as Load_GemAbility reads it (_Common/UltimateWeapon.cpp:46-102).
import { describe, expect, it } from 'vitest';
import { readGemAbility } from '../src/data/ultimateCatalog';

const DEFINES = new Map([
  ['DST_HP_MAX', 44], ['DST_ATKPOWER', 23], ['II_GEN_MAT_TOPAZ', 2033], ['II_GEN_MAT_TOPAZ01', 2041],
  ['II_GEN_MAT_RUBY', 2032], ['II_GEN_MAT_RUBY01', 2040], ['II_GEN_MAT_TOPAZ02', 2046],
]);

const FILE = [
  '// ABILITY \u0080 comment',
  '/* a block',
  '   comment */',
  'ABILITY\tDST_HP_MAX',
  '{',
  '\tII_GEN_MAT_TOPAZ\tII_GEN_MAT_TOPAZ01\t228\t455\t683\t910\t1365',
  '\tII_GEN_MAT_RUBY\t\tII_GEN_MAT_RUBY01\t455\t910\t1365\t1820\t2730',
  '}',
  'ABILITY DST_ATKPOWER {',
  '  II_GEN_MAT_TOPAZ II_GEN_MAT_TOPAZ02 13 25 38 50 75',
  '}\t\t',
  '//아이템 레벨에 따른 보석 종류',
  'LEVEL_GEM',
  '{',
  '\t//아이템ID\t\t최소\t최대레벨',
  '\tII_GEN_MAT_TOPAZ\t60\t70',
  '\tII_GEN_MAT_RUBY\t\t71\t85',
  '}',
].join('\r\n');

describe('readGemAbility', () => {
  it('reads each ABILITY block\'s DST and jewels, and LEVEL_GEM\'s rows', () => {
    expect(readGemAbility(FILE, DEFINES)).toEqual({
      abilities: [
        { dst: 44, jewels: [{ jewel: 2033, ability: 2041, values: [228, 455, 683, 910, 1365] }, { jewel: 2032, ability: 2040, values: [455, 910, 1365, 1820, 2730] }] },
        { dst: 23, jewels: [{ jewel: 2033, ability: 2046, values: [13, 25, 38, 50, 75] }] },
      ],
      levelGems: [{ jewel: 2033, min: 60, max: 70 }, { jewel: 2032, min: 71, max: 85 }],
    });
  });

  it('refuses a name the defines lack and a missing number', () => {
    expect(() => readGemAbility('LEVEL_GEM { II_GEN_MAT_NONE 1 2 }', DEFINES)).toThrow(/II_GEN_MAT_NONE/);
    expect(() => readGemAbility('ABILITY DST_HP_MAX { II_GEN_MAT_TOPAZ II_GEN_MAT_TOPAZ01 1 2 }', DEFINES)).toThrow(/number/);
  });
});
