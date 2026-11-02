// The world map's catalog (`data/worldMap.json`, Piece 6 M1) from what CWorldMap reads (Source/Neuz/WorldMap.cpp): the
// eight pictures and their world rectangles, which the C++ writes in code; Madrigal's continent outlines
// (`World/WdMadrigal/WdMadrigal.wld.cnt`, CContinent::Init); each continent's monster icons
// (`Theme/Default/texMapMonster_*.inc`, CMonsterInfoPack::LoadScript); and the buttons' frames (`texMapButton.inc`).
//
// The scripts and the outline file are loose files of the client folder, which CResFile::Open takes before the packs
// (_Common/File.cpp:273-290), so they are read from there, not from the packs.

import { readFileSync } from 'node:fs';
import {
  decodeImage, decodeScript, readContinents, readMapMonsterPack, readTexturePack,
} from '@flyffweb/formats';
import type { WebWorldMap, WebWorldMapEntry } from '@flyffweb/formats';
import type { ClientFs } from '../ClientFs';
import { iconKeyOf } from '../output/keys';

const THEME_DIR = 'Theme/Default';
export const WORLD_MAP_CNT = 'World/WdMadrigal/WdMadrigal.wld.cnt';

/**
 * The maps in `m_strMapStringList`'s order (WorldMap.cpp:197-209), their rectangles (`WorldPosToMapPos`, :1394-1461,
 * the same as `RenderPlayer`'s, :615-711), the continent each shows (`CContinent::GetMapNo`, Continent.cpp:414-430) and
 * its monster script (`m_strMonScript[index - 1]`, :214-225).
 */
const MAPS: ReadonlyArray<{
  picture: string; bounds: [number, number, number, number]; continent: number | null; script: string | null;
}> = [
  { picture: 'WORLD_Flyff.dds', bounds: [0, 1298, 11800, 9757], continent: null, script: null },
  { picture: 'WORLD_Darkon12.dds', bounds: [2355, 2019, 7187, 5814], continent: 241, script: 'texMapMonster_Darkon12.inc' },
  { picture: 'WORLD_Darkon3.dds', bounds: [985, 1621, 5754, 5149], continent: 242, script: 'texMapMonster_Darkon3.inc' },
  { picture: 'WORLD_Ricis.dds', bounds: [8080, 3200, 10280, 5000], continent: 3, script: 'texMapMonster_Ricis.inc' },
  { picture: 'WORLD_Saint.dds', bounds: [6854, 1580, 10600, 4430], continent: 2, script: 'texMapMonster_Saint.inc' },
  { picture: 'WORLD_Flaris.dds', bounds: [5500, 2540, 9200, 5130], continent: 1, script: 'texMapMonster_Flaris.inc' },
  { picture: 'WORLD_harmonin.dds', bounds: [4795, 4587, 8391, 7236], continent: 243, script: 'texMapMonster_Harmonin.inc' },
  { picture: 'WORLD_Estia.dds', bounds: [5150, 5573, 9890, 9158], continent: 4, script: 'texMapMonster_Estia.inc' },
];

/** WI_WORLD_MADRIGAL (Resource/defineWorld.h:5), when the defines do not have it. */
const MADRIGAL = 1;

export interface WorldMapEnv {
  client: ClientFs;
  defines: ReadonlyMap<string, number>;
  warn(source: string, message: string): void;
  /** Told the size of each file read. */
  counted?(bytes: number): void;
}

/**
 * Builds the catalog, or null (with one warning) when the client folder has no continent file. A monster script that is
 * missing or cannot be read leaves its map without monsters, with one warning; the buttons' script and the outline file
 * must read.
 */
export function buildWorldMap(env: WorldMapEnv): WebWorldMap | null {
  const loose = (dir: string, name: string): Uint8Array | null => {
    const file = env.client.find(dir, name);
    if (file === null) return null;
    const bytes = new Uint8Array(readFileSync(file));
    env.counted?.(bytes.length);
    return bytes;
  };
  const [cntDir, cntName] = [WORLD_MAP_CNT.slice(0, WORLD_MAP_CNT.lastIndexOf('/')), WORLD_MAP_CNT.slice(WORLD_MAP_CNT.lastIndexOf('/') + 1)];
  const cnt = loose(cntDir, cntName);
  if (cnt === null) {
    env.warn(WORLD_MAP_CNT, 'not in the client folder, so there is no world map catalog');
    return null;
  }
  const mapOf = new Map(MAPS.flatMap((m, index) => (m.continent === null ? [] : [[m.continent, index] as const])));
  const continents = readContinents(decodeScript(cnt), WORLD_MAP_CNT)
    .filter((c) => !c.town && mapOf.has(c.id))
    .map((c) => ({ id: c.id, map: mapOf.get(c.id)!, ring: c.ring }));

  const maps: WebWorldMapEntry[] = MAPS.map((m, index) => ({
    index,
    picture: iconKeyOf(m.picture),
    bounds: { x1: Math.fround(m.bounds[0]), z1: Math.fround(m.bounds[1]), x2: Math.fround(m.bounds[2]), z2: Math.fround(m.bounds[3]) },
    continent: m.continent,
    monsters: m.script === null ? null : monstersOf(env, loose, m.script),
  }));

  const buttonScript = loose(THEME_DIR, 'texMapButton.inc');
  if (buttonScript === null) throw new Error(`Client/${THEME_DIR}/texMapButton.inc not found`);
  const buttonText = decodeScript(buttonScript);
  const sheetName = readTexturePack(buttonText, 'texMapButton.inc').texture;
  const sheet = loose(THEME_DIR, sheetName);
  if (sheet === null) throw new Error(`texMapButton.inc names "${sheetName}", which is not in Client/${THEME_DIR}`);
  const { width, height } = decodeImage(sheet, sheetName);

  return {
    world: env.defines.get('WI_WORLD_MADRIGAL') ?? MADRIGAL,
    maps,
    continents,
    buttons: { sheet: iconKeyOf(sheetName), frames: readTexturePack(buttonText, 'texMapButton.inc', { width, height }).frames
      .map(({ x, y, w, h }) => ({ x, y, w, h })) },
    arrow: iconKeyOf('ImgMapArrow.bmp'),
    tooltipTiles: Array.from({ length: 9 }, (_, i) => iconKeyOf(`WndTooltipTile0${i}.tga`)),
  };
}

function monstersOf(
  env: WorldMapEnv, loose: (dir: string, name: string) => Uint8Array | null, script: string,
): WebWorldMapEntry['monsters'] {
  const source = `${THEME_DIR}/${script}`;
  try {
    const raw = loose(THEME_DIR, script);
    if (raw === null) {
      env.warn(source, 'not in the client folder: that map has no monster icons');
      return null;
    }
    const text = decodeScript(raw);
    const texture = /texture\s+"([^"]+)"/.exec(text)?.[1];
    if (texture === undefined) throw new Error('it names no texture');
    const sheet = loose(THEME_DIR, texture);
    if (sheet === null) throw new Error(`it names "${texture}", which is not in Client/${THEME_DIR}`);
    const pack = readMapMonsterPack(text, env.defines, script, decodeImage(sheet, texture));
    return { sheet: iconKeyOf(pack.texture), frames: pack.frames, rows: pack.rows };
  } catch (error) {
    env.warn(source, `not read, so that map has no monster icons: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
