// The water catalog (2026-11-19): `data/terrainWater.json`, a `WebTerrainWater`, from Terrain.inc as CTerrainMng::LoadScript
// reads it (Source/_Common/TerrainMng.cpp:75). CLandscape::RenderWater (lod.cpp:932-1070) draws a patch's water with
// the frames of `m_pWaterIndexList[byWaterTexture >> 2]` and the cloud sea with Terrain.inc id 10; the textures stage
// has converted those files with the other terrain textures (World/TextureMid), so this names them by their keys.

import { CLOUD_TERRAIN_ID, readTerrainIndex } from '@flyffweb/formats';
import type { WebTerrainWater } from '@flyffweb/formats';
import { textureKey } from '../textures/convertTexture';
import { listed } from '../util';

export const TERRAIN_FILE = 'Terrain.inc';

export interface TerrainWaterEnv {
  /** Whether the file under this key was converted (in this run, or by an earlier one). */
  converted(key: string): boolean;
  warn(source: string, message: string): void;
}

/** The catalog of the text of Terrain.inc. A frame or cloud texture that was not converted is null, with one warning. */
export function buildTerrainWater(
  text: string,
  defines: ReadonlyMap<string, number>,
  env: TerrainWaterEnv,
): WebTerrainWater {
  const { textures, waterLists } = readTerrainIndex(text, defines, TERRAIN_FILE);
  const missing: string[] = [];
  const keyOf = (id: number): string | null => {
    const texture = textures.get(id);
    if (texture === undefined) return null;
    const key = textureKey('terrain', texture.file);
    if (env.converted(key)) return key;
    missing.push(texture.file);
    return null;
  };
  const water = waterLists.map((ids) => ids.map(keyOf));
  const cloud = keyOf(CLOUD_TERRAIN_ID);
  if (missing.length > 0) {
    env.warn(TERRAIN_FILE, `water textures not converted (not in World/TextureMid, failed, or left out by --only): ${listed(missing)}`);
  }
  return { water, cloud };
}
