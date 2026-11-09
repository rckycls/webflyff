// 2026-11-09, the raised pets: pet.inc (CPetProperty::LoadScript, Source/_Common/pet.cpp:124-240) and the extra texture
// sets of their models (CObject3D::LoadTextureEx, Source/_Common/Object3D.cpp:2477-2508).

import { describe, expect, it } from 'vitest';
import { readPetInc, textureExKey, textureExName } from '../src/index';
import { thrown } from './helpers/thrown';

/** Script text with the CRLF line ends the shipped files use. */
function script(...lines: string[]): string {
  return lines.join('\r\n') + '\r\n';
}

describe('readPetInc', () => {
  const DEFINES = new Map([
    ['DST_STR', 1], ['DST_STA', 2], ['DST_MP_MAX_RATE', 77],
    ['II_PET_WHITETIGER01', 21000], ['II_PET_BARBARYLION01', 21001], ['II_PET_MANAUNICORN01', 21007],
    ['MI_PET_WHITETIGER01', 300], ['MI_PET_WHITETIGER01_1', 301], ['MI_PET_WHITETIGER01_2', 302],
    ['MI_PET_BARBARYLION01', 303], ['MI_PET_BARBARYLION01_1', 304], ['MI_PET_BARBARYLION01_2', 305],
    ['MI_PET_MANAUNICORN01', 321], ['MI_PET_MANAUNICORN01_1', 322], ['MI_PET_MANAUNICORN01_2', 323],
    ['PK_MAX', 3],
  ]);
  // the owner's file, cut down: its tabs, comments and spacing
  const FILE = script(
    'AvailDestParam\t// comment',
    '{',
    '//\t??\t\t??1\t??2',
    '\tDST_STR\t\t1\t2\t4\t7\t11\t16\t22\t29\t37\tII_PET_WHITETIGER01\tMI_PET_WHITETIGER01\tMI_PET_WHITETIGER01_1\tMI_PET_WHITETIGER01_2\t900',
    '\tDST_STA\t\t1\t2\t4\t7\t11\t16\t22\t29\t37\tII_PET_BARBARYLION01\tMI_PET_BARBARYLION01\tMI_PET_BARBARYLION01_1\tMI_PET_BARBARYLION01_2\t1100',
    '\tDST_MP_MAX_RATE\t1\t2\t4\t7\t11\t16\t22\t29\t37\tII_PET_MANAUNICORN01\tMI_PET_MANAUNICORN01\tMI_PET_MANAUNICORN01_1\tMI_PET_MANAUNICORN01_2\t1675',
    '}',
    '',
    'FeedEnergy\t0\t// npc',
    '{\t\t\t\t',
    '\t1\t575\t          7\t 14',
    '\t576\t823              18\t 35',
    '\t10000\t2147483647\t250\t500',
    '}\t\t\t\t',
    '',
    'FeedEnergy\t1',
    '{',
    '\t1\t575\t\t28    28',
    '\t10000\t2147483647    1000  1000',
    '}',
    '',
    'IncrementExp\t// of 100,000',
    '{\t',
    '\t250\t// 0.25%\t// D',
    '\t125\t// C',
    '\t62\t// B',
    '\t31\t// A',
    '}',
    '',
    'MaxEnergy',
    '{',
    '\t180\t// D',
    '\t300',
    '\t420',
    '\t600',
    '\t1500\t// S',
    '}',
    '',
    'Penalty',
    '{',
    '\t0.16\t\t\t0\t// D',
    '\t0.08\t\t\t0',
    '\t0.04\t\t\t0',
    '\t0.02\t\t\t0',
    '\t0\t\t\t0\t// S',
    '}',
  );

  it('reads each kind: its stat, its nine steps, its item, its three models and its hatch weight, kinds[PK_*]', () => {
    const { kinds } = readPetInc(FILE, DEFINES);
    const steps = [1, 2, 4, 7, 11, 16, 22, 29, 37];
    expect(kinds).toEqual([
      { kind: 0, dst: 1, steps, itemId: 21000, models: [300, 301, 302], hatchWeight: 900 },
      { kind: 1, dst: 2, steps, itemId: 21001, models: [303, 304, 305], hatchWeight: 1100 },
      { kind: 2, dst: 77, steps, itemId: 21007, models: [321, 322, 323], hatchWeight: 1675 },
    ]);
  });

  it('reads the two food tables, the EXP a minute, the most energy and the release penalty (a C float) by level', () => {
    const pets = readPetInc(FILE, DEFINES);
    expect(pets.feedEnergy).toEqual([
      [
        { costMin: 1, costMax: 575, energyMin: 7, energyMax: 14 },
        { costMin: 576, costMax: 823, energyMin: 18, energyMax: 35 },
        { costMin: 10000, costMax: 2147483647, energyMin: 250, energyMax: 500 },
      ],
      [
        { costMin: 1, costMax: 575, energyMin: 28, energyMax: 28 },
        { costMin: 10000, costMax: 2147483647, energyMin: 1000, energyMax: 1000 },
      ],
    ]);
    expect(pets.incrementExp).toEqual([250, 125, 62, 31]);
    expect(pets.maxEnergy).toEqual([180, 300, 420, 600, 1500]);
    expect(pets.penalty).toEqual([
      { exp: Math.fround(0.16), energy: 0 },
      { exp: Math.fround(0.08), energy: 0 },
      { exp: Math.fround(0.04), energy: 0 },
      { exp: Math.fround(0.02), energy: 0 },
      { exp: 0, energy: 0 },
    ]);
  });

  it('gives empty tables for the blocks the file lacks, and passes over words it does not know', () => {
    const pets = readPetInc(script('LevelupAvail', '{', '\t10000\t0\t0', '}', 'MaxEnergy { 180 }'), DEFINES);
    expect(pets).toEqual({ kinds: [], feedEnergy: [[], []], incrementExp: [], maxEnergy: [180], penalty: [] });
  });

  it('a second FeedEnergy block of an index adds its rows; a second table block fills from the start again', () => {
    const pets = readPetInc(
      script('FeedEnergy 1 { 1 2 3 4 }', 'FeedEnergy 1 { 5 6 7 8 }', 'MaxEnergy { 1 2 3 }', 'MaxEnergy { 9 }'),
      DEFINES,
    );
    expect(pets.feedEnergy[1]).toEqual([
      { costMin: 1, costMax: 2, energyMin: 3, energyMax: 4 },
      { costMin: 5, costMax: 6, energyMin: 7, energyMax: 8 },
    ]);
    expect(pets.maxEnergy).toEqual([9, 2, 3]);
  });

  it('throws where the C++ asserts or writes past its tables', () => {
    const fourKinds = script(
      'AvailDestParam {',
      ...[0, 1, 2, 3].map(() => 'DST_STR 1 2 4 7 11 16 22 29 37 II_PET_WHITETIGER01 MI_PET_WHITETIGER01 MI_PET_WHITETIGER01_1 MI_PET_WHITETIGER01_2 900'),
      '}',
    );
    expect(thrown(() => readPetInc(fourKinds, DEFINES)).message).toContain('more than 3 kinds (PK_MAX)');
    expect(thrown(() => readPetInc('FeedEnergy 2 { }', DEFINES)).message).toContain('FeedEnergy 2 is not 0 or 1');
    expect(thrown(() => readPetInc('IncrementExp { 1 2 3 4 5 6 }', DEFINES)).message).toContain('more than 5 IncrementExp rows');
    expect(thrown(() => readPetInc('MaxEnergy { 1 2 3 4 5 6 7 }', DEFINES)).message).toContain('more than 6 MaxEnergy rows');
    expect(thrown(() => readPetInc('Penalty { 0 0 0 0 0 0 0 0 0 0 0 0 }', DEFINES)).message).toContain('more than 5 Penalty rows');
    // a block that never closes, and a name that is not defined
    expect(thrown(() => readPetInc('MaxEnergy { 1 2', DEFINES)).message).toContain('the end of the script');
    expect(thrown(() => readPetInc('AvailDestParam { DST_NOPE', DEFINES)).message).toContain('DST_NOPE');
  });
});

describe('textureExName and textureExKey (CObject3D::LoadTextureEx, Object3D.cpp:2477-2508)', () => {
  it('puts -et and the set in two digits after the title, then the extension', () => {
    expect(textureExName('Mvr_PetWhiteTiger01.dds', 1)).toBe('Mvr_PetWhiteTiger01-et01.dds');
    expect(textureExName('Mvr_Bang-01.DDS', 4)).toBe('Mvr_Bang-01-et04.DDS');
  });

  it('cuts the title at the first dot and takes the extension after the last (GetFileTitle, GetFileExt), past a path', () => {
    expect(textureExName('a.b.tga', 2)).toBe('a-et02.tga');
    expect(textureExName('Model\\TextureMid\\x.dds', 3)).toBe('x-et03.dds');
  });

  it('gives the key of the set from a model texture key, as the textures stage names the file', () => {
    expect(textureExKey('textures/mvr_petwhitetiger01.dds.ktx2', 2)).toBe('textures/mvr_petwhitetiger01-et02.dds.ktx2');
    expect(() => textureExKey('textures/terrain/grass.dds.ktx2', 1)).toThrow(RangeError);
  });
});
