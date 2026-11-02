import fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClientFs } from '../src/ClientFs';
import { buildWorldMap } from '../src/data/worldMapCatalog';
import { bmp24 } from './helpers/images';
import { makeTempDir, writeFakeClient } from './helpers/fakeClient';

const picture = (width: number, height: number): Uint8Array =>
  bmp24(width, height, Array.from({ length: width * height }, () => [255, 0, 255]));

const CNT = `WORLD WdMadrigal.wld
Continent BEGIN
C_useRealData 1
C_name Flaris
C_id 1
VERTEX 6159 0 3407
VERTEX 6350 0 3825
VERTEX 7245 0 2685
Continent END
Continent BEGIN
C_useRealData 1
C_name Darkon12
C_id 241
VERTEX 2400 0 2100
VERTEX 2400 0 5000
VERTEX 6000 0 5000
Continent END
`;
const FLARIS_MONSTERS = `number 3
texture "TexMapMonster_Flaris.bmp" 0xffff00ff
serialize 3 40 40 0 0 0 0
4 MI_AIBATT1 MI_AIBATT2 MI_AIBATT3 MI_AIBATT4 436 760 II_GEN_GEM_GEM_TWINKLESTONE
1 MI_AIBATT1 500 700 0
1 MI_AIBATT2 510 710 II_GEN_GEM_GEM_TWINKLESTONE`;
const BUTTONS = `MULTI_LANGUAGE\nnumber 27\ntexture "TexMapButton.bmp" 0xffff00ff\n${
  Array.from({ length: 9 }, (_, i) => `serialize 3 228 88 0 ${88 * i} 0 0`).join('\n')}`;
const DEFINES = new Map([
  ['MI_AIBATT1', 20], ['MI_AIBATT2', 21], ['MI_AIBATT3', 22], ['MI_AIBATT4', 23], ['II_GEN_GEM_GEM_TWINKLESTONE', 2900],
  ['WI_WORLD_MADRIGAL', 1],
]);

describe('the world map catalog (CWorldMap, CContinent, CMonsterInfoPack)', () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTempDir('flyffweb-worldmap-');
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function build(loose: Record<string, string | Uint8Array>) {
    await writeFakeClient(root, { loose });
    const warnings: string[] = [];
    const map = buildWorldMap({ client: await ClientFs.open(root), defines: DEFINES, warn: (source, message) => {
      warnings.push(`${source}: ${message}`);
    } });
    return { map, warnings };
  }

  const FULL = {
    'World/WdMadrigal/WdMadrigal.wld.cnt': CNT,
    'Theme/Default/texMapMonster_Flaris.inc': FLARIS_MONSTERS,
    'Theme/Default/TexMapMonster_Flaris.bmp': picture(120, 200),
    // six movers: m_dwMonsterId holds five, so this script is refused
    'Theme/Default/texMapMonster_Darkon12.inc':
      'number 1\ntexture "TexMapMonster_Darkon12.bmp" 0xffff00ff\nserialize 1 40 40 0 0 0 0\n6 1 2 3 4 5 6 10 10 0',
    'Theme/Default/TexMapMonster_Darkon12.bmp': picture(120, 240),
    'Theme/Default/texMapButton.inc': BUTTONS,
    'Theme/Default/TexMapButton.bmp': picture(684, 788),
  };

  it('gives the eight maps in WorldMap.cpp\'s order, with their bounds and continents', async () => {
    const { map } = await build(FULL);
    expect(map).not.toBeNull();
    expect(map!.world).toBe(1);
    expect(map!.maps.map((m) => m.picture)).toEqual([
      'ui/world_flyff.png', 'ui/world_darkon12.png', 'ui/world_darkon3.png', 'ui/world_ricis.png', 'ui/world_saint.png',
      'ui/world_flaris.png', 'ui/world_harmonin.png', 'ui/world_estia.png',
    ]);
    expect(map!.maps[0]!.bounds).toEqual({ x1: 0, z1: 1298, x2: 11800, z2: 9757 });
    expect(map!.maps[5]!.bounds).toEqual({ x1: 5500, z1: 2540, x2: 9200, z2: 5130 });
    expect(map!.maps.map((m) => m.continent)).toEqual([null, 241, 242, 3, 2, 1, 243, 4]);
  });

  it('pairs each continent outline with its map (CContinent::GetMapNo, Continent.cpp:414-430)', async () => {
    const { map } = await build(FULL);
    expect(map!.continents.map((c) => [c.id, c.map])).toEqual([[1, 5], [241, 1]]);
    expect(map!.continents[0]!.ring[0]).toEqual([6159, 3407]);
  });

  it('keeps a map\'s monster rows, and the buttons\' 27 frames', async () => {
    const { map } = await build(FULL);
    const flaris = map!.maps[5]!.monsters!;
    expect(flaris.sheet).toBe('ui/texmapmonster_flaris.png');
    expect(flaris.rows).toHaveLength(3);
    expect(flaris.rows[0]).toEqual({ movers: [20, 21, 22, 23], x: 436, y: 760, drop: 2900 });
    expect(flaris.frames[2]).toEqual({ x: 80, y: 0, w: 40, h: 40 });
    // the sheet's own size (m_size), which the frames need not fill: 3 frames of a 120x200 picture
    expect(flaris.size).toEqual({ width: 120, height: 200 });
    expect(map!.buttons.sheet).toBe('ui/texmapbutton.png');
    expect(map!.buttons.frames).toHaveLength(27);
    expect(map!.arrow).toBe('ui/imgmaparrow.png');
    expect(map!.tooltipTiles).toHaveLength(9);
    expect(map!.tooltipTiles[0]).toBe('ui/wndtooltiptile00.png');
  });

  it('leaves a script that cannot be read, or is missing, without monsters, and says so once each', async () => {
    const { map, warnings } = await build(FULL);
    expect(map!.maps[1]!.monsters).toBeNull(); // the six-mover Darkon12 script
    expect(map!.maps[2]!.monsters).toBeNull(); // no Darkon3 script at all
    expect(map!.maps[0]!.monsters).toBeNull();
    expect(warnings.filter((w) => /darkon12/i.test(w))).toHaveLength(1);
    expect(warnings.filter((w) => /darkon3/i.test(w))).toHaveLength(1);
  });

  it('gives no catalog, and one warning, without the continent file', async () => {
    const { map, warnings } = await build({ 'Theme/Default/texMapButton.inc': BUTTONS });
    expect(map).toBeNull();
    expect(warnings).toHaveLength(1);
  });
});
