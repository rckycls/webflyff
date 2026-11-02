import { describe, expect, it } from 'vitest';
import { readContinents, readMapMonsterPack, readTexturePack } from '../src/index';
import { thrown } from './helpers/thrown';

// Cut from Client/World/WdMadrigal/WdMadrigal.wld.cnt: the Flaris block (:3-19), and a block like Estia_envir
// (:115-135), whose C_useRealData 0 makes CContinent::Init skip it to its END.
const FLARIS = `WORLD WdMadrigal.wld

Continent BEGIN
C_useEnvir 0
C_useRealData 1
C_name Flaris
C_id 1
VERTEX 6159 0 3407
VERTEX 6350 0 3825
VERTEX 6736 0 4649
VERTEX 7246 0 4570
VERTEX 8258 0 5022
VERTEX 8213 0 4367
VERTEX 8021 0 4037
VERTEX 8017 0 3496
VERTEX 7245 0 2685
VERTEX 6783 0 2631
VERTEX 6366 0 2922
Continent END
`;
const ENVIR = `
Continent BEGIN
C_useEnvir 1
C_useRealData 0
C_name Estia_envir
C_id 0
C_ambient  1.000  1.000  1.000
VERTEX 6886 257 6554
VERTEX 6208 233 8056
Continent END
`;
const block = (id: number, extra = '', vertices = 'VERTEX 1.9 5 2.7\nVERTEX 10 5 0\nVERTEX 0 5 10'): string =>
  `\nContinent BEGIN\nC_useRealData 1\nC_id ${id}\n${extra}${vertices}\nContinent END\n`;

describe('readContinents (CContinent::Init, Continent.cpp:29-104)', () => {
  it('reads a polygon as truncated integer x/z points, closed by its first point', () => {
    const [flaris] = readContinents(FLARIS, 'WdMadrigal.wld.cnt');
    expect(flaris!.id).toBe(1);
    expect(flaris!.town).toBe(false);
    expect(flaris!.ring).toHaveLength(12);
    expect(flaris!.ring[0]).toEqual([6159, 3407]);
    expect(flaris!.ring[11]).toEqual([6159, 3407]);
    expect(readContinents(block(5), 'x.cnt')[0]!.ring[0]).toEqual([1, 2]);
  });

  it('skips a C_useRealData 0 block to its END, and the blocks after it are read', () => {
    const all = readContinents(FLARIS + ENVIR + block(4), 'WdMadrigal.wld.cnt');
    expect(all.map((c) => c.id)).toEqual([1, 4]);
  });

  it('keeps the first of a repeated id, sorts by id, and keeps towns apart', () => {
    const all = readContinents(block(241) + block(3, '', 'VERTEX 7 0 7') + block(3) + block(2, 'TOWN 1\n'), 'x.cnt');
    expect(all.filter((c) => !c.town).map((c) => c.id)).toEqual([3, 241]);
    expect(all.find((c) => c.id === 3)!.ring[0]).toEqual([7, 7]);
    expect(all.filter((c) => c.town).map((c) => c.id)).toEqual([2]);
  });

  it('throws a FormatError naming the file for a VERTEX cut short', () => {
    expect(thrown(() => readContinents('Continent BEGIN\nVERTEX 1 2', 'bad.cnt')).message).toContain('bad.cnt');
  });
});

// Cut from Client/Theme/Default/texMapMonster_Ricis.inc (a drop of 0 in its third row) and texMapMonster_Darkon3.inc
// (a row of 5 movers, :32).
const RICIS = `// number 삽입 이미지 개수
number 6
texture "TexMapMonster_Ricis.bmp" 0xffff00ff
serialize 3 40 40  0   0 0 0
4 MI_SCOPICON1 MI_SCOPICON2 MI_SCOPICON3 MI_SCOPICON4 610 505 II_GEN_GEM_GEM_SCOTOOTH
4 MI_TOMBSTONEBEARER1 MI_TOMBSTONEBEARER2 MI_TOMBSTONEBEARER3 MI_TOMBSTONEBEARER4 375 285 II_GEN_GEM_GEM_TOMBMARBLE
4 MI_FLBYRIGEN1 MI_FLBYRIGEN2 MI_FLBYRIGEN3 MI_FLBYRIGEN4 430 550 0

serialize 3 40 40  0   40 0 0
4 MI_BASQUE1 MI_BASQUE2 MI_BASQUE3 MI_BASQUE4 745 275 II_GEN_GEM_GEM_GOLDENFIST
4 MI_PRANKSTER1 MI_PRANKSTER2 MI_PRANKSTER3 MI_PRANKSTER4 785 545  II_GEN_GEM_GEM_ORBRIN
4 MI_WHEELEM1 MI_WHEELEM2 MI_WHEELEM3 MI_WHEELEM4 915 395 II_GEN_GEM_GEM_GOLDENCUP`;
const names = [...RICIS.matchAll(/\b(MI_\w+|II_\w+)/g)].map((m) => m[1]!);
const DEFINES = new Map([...new Set(names)].map((name, i): [string, number] => [name, 100 + i]));
const RICIS_SIZE = { width: 120, height: 80 };

describe('readMapMonsterPack (CMonsterInfoPack::LoadScript, WorldMap.cpp:1513-1651)', () => {
  it('cuts each serialize\'s frames from the sheet and reads its rows, as authored', () => {
    const pack = readMapMonsterPack(RICIS, DEFINES, 'texMapMonster_Ricis.inc', RICIS_SIZE);
    expect(pack.texture).toBe('TexMapMonster_Ricis.bmp');
    expect(pack.colorKey).toBe(0xffff00ff);
    expect(pack.frames).toHaveLength(6);
    expect(pack.frames[4]).toEqual({ x: 40, y: 40, w: 40, h: 40 });
    expect(pack.rows).toHaveLength(6);
    expect(pack.rows[0]).toEqual({
      movers: ['MI_SCOPICON1', 'MI_SCOPICON2', 'MI_SCOPICON3', 'MI_SCOPICON4'].map((n) => DEFINES.get(n)),
      x: 610, y: 505, drop: DEFINES.get('II_GEN_GEM_GEM_SCOTOOTH'),
    });
    expect(pack.rows[2]!.drop).toBe(0);
    expect(pack.rows[4]!.x).toBe(785);
  });

  it('reads a row of 5 movers, and refuses 6 (m_dwMonsterId[5], WorldMap.h:13-19)', () => {
    const five = 'number 1\ntexture "s.bmp" 0xffff00ff\nserialize 1 40 40 0 0 0 0\n5 1 2 3 4 5 795 611 9';
    expect(readMapMonsterPack(five, new Map(), 'five.inc', RICIS_SIZE).rows[0]!.movers).toEqual([1, 2, 3, 4, 5]);
    const six = 'number 1\ntexture "s.bmp" 0xffff00ff\nserialize 1 40 40 0 0 0 0\n6 1 2 3 4 5 6 795 611 9';
    expect(thrown(() => readMapMonsterPack(six, new Map(), 'six.inc', RICIS_SIZE)).message).toContain('six.inc');
  });

  it('refuses more frames than its number (the C++ Error and FALSE)', () => {
    const over = RICIS.replace('number 6', 'number 4');
    expect(thrown(() => readMapMonsterPack(over, DEFINES, 'over.inc', RICIS_SIZE)).message).toContain('over.inc');
  });
});

describe('texMapButton.inc through readTexturePack', () => {
  it('gives the 27 button frames, the last at y 704', () => {
    const rows = Array.from({ length: 9 }, (_, i) => `serialize 3 228 88 0 ${88 * i} 0 0`).join('\n');
    const pack = readTexturePack(`MULTI_LANGUAGE\nnumber 27\ntexture "TexMapButton.bmp" 0xffff00ff\n${rows}`,
      'texMapButton.inc', { width: 684, height: 788 });
    expect(pack.frames).toHaveLength(27);
    expect(pack.frames[26]).toMatchObject({ x: 456, y: 704, w: 228, h: 88 });
  });
});
