// The world map's catalog (`data/worldMap.json`, Piece 6 M1): what CWorldMap (Source/Neuz/WorldMap.cpp) draws and tests,
// read by the converter's data stage. Optional: it is not one of GAME_DATA_KEYS, so a client converted before it still
// logs in, and only the map is missing.
//
// Three different numbers: a map index (0-7, the pictures of `m_strMapStringList`, :197-209), a continent id (`C_id` of
// WdMadrigal.wld.cnt, ContinentDef.h) and a world id (World.inc; the map is only for `world`).

import type { MapFrame, MapMonsterRow } from '../inc/mapMonsterPack';

export const WORLD_MAP_KEY = 'data/worldMap.json';

export interface WebWorldMapEntry {
  /** The map index: 0 World, 1 Darkon12, 2 Darkon3, 3 Ricis, 4 Saint, 5 Flaris, 6 Harmonin, 7 Estia. */
  index: number;
  /** The picture's UI key (`ui/world_flaris.png`), 1280x960. */
  picture: string;
  /** The world rectangle the picture shows (`WorldPosToMapPos`, :1394-1461): x1..x2 east, z1 bottom..z2 top. */
  bounds: { x1: number; z1: number; x2: number; z2: number };
  /** The continent it is the map of (`C_id`); null for map 0. */
  continent: number | null;
  /** The monster icons (`m_strMonScript[index - 1]`, :214-225); null for map 0 and for a script that could not be read. */
  monsters: { sheet: string; frames: MapFrame[]; rows: MapMonsterRow[] } | null;
}

export interface WebWorldMap {
  /** The world the map is for: WI_WORLD_MADRIGAL (`CContinent::GetMapNo`, Continent.cpp:407-412). */
  world: number;
  maps: WebWorldMapEntry[];
  /** The continents' outlines (towns left out), in ascending id: the order `GetContinent` tests them in. */
  continents: Array<{ id: number; map: number; ring: Array<[number, number]> }>;
  /** `texMapButton.inc`: 27 frames, three per button (normal, hover, selected), and the sheet's UI key. */
  buttons: { sheet: string; frames: MapFrame[] };
  /** The player's arrow (`ImgMapArrow.bmp`). */
  arrow: string;
  /** The tooltip's 9-slice frame (`WndTooltipTile00-08.tga`), in order. */
  tooltipTiles: string[];
}
