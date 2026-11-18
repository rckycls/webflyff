// 2026-11-19 (water): what the browser needs to draw a tile's water and cloud sea, which CLandscape::RenderWater
// (Source/_Common/lod.cpp:932-1070) draws from each patch's WATERHEIGHT (`WebTile.water`, two bytes a patch):
//
//   byWaterTexture & 3 == WTYPE_WATER (2)   a water quad at byWaterHeight metres, showing the frames of water list
//                                           byWaterTexture >> 2 (lod.cpp:382, :424-427)
//   byWaterTexture == WTYPE_CLOUD (1)       the cloud sea: two quads at 40 and 80 metres, Terrain.inc id 10 (lod.cpp:507,
//                                           :1036-1063); byWaterHeight is not used
//
// The texture keys come from Terrain.inc, so they are a converted file of their own (the converter's `data` stage).

/** The water catalog, a `WebTerrainWater`. Optional: not one of GAME_DATA_KEYS (no water is drawn without it). */
export const TERRAIN_WATER_KEY = 'data/terrainWater.json';

/** `WTYPE_NONE`, `WTYPE_CLOUD` and `WTYPE_WATER` (landscape.h:40-42). */
export const WTYPE_NONE = 0;
export const WTYPE_CLOUD = 1;
export const WTYPE_WATER = 2;

/** `MASK_WATERFRAME` (landscape.h:101): the bits of `byWaterTexture` that pick the water list, shifted down by 2. */
export const MASK_WATERFRAME = 0xfc;

/** Terrain.inc's id of the cloud sea's texture, hard-coded in CLandscape::RenderWater (lod.cpp:1044). */
export const CLOUD_TERRAIN_ID = 10;

export interface WebTerrainWater {
  /**
   * Per water list of Terrain.inc (`m_pWaterIndexList`, in file order), the texture keys of its frames in order
   * (`textures/terrain/<web name>.ktx2`), null for a frame whose texture was not converted.
   */
  water: (string | null)[][];
  /** The cloud sea's texture key (Terrain.inc id 10), null when it has none or it was not converted. */
  cloud: string | null;
}

/**
 * What a patch's `byWaterTexture` draws: `{ kind: 'water', list }` for WTYPE_WATER in its low two bits (the list is the
 * byte shifted down by two), `{ kind: 'cloud' }` for exactly WTYPE_CLOUD, and null for anything else, as
 * MakeWaterVertexBuffer tests it (lod.cpp:424, :507).
 */
export function waterOfPatch(byWaterTexture: number): { kind: 'water'; list: number } | { kind: 'cloud' } | null {
  if ((byWaterTexture & ~MASK_WATERFRAME & 0xff) === WTYPE_WATER) return { kind: 'water', list: byWaterTexture >> 2 };
  if (byWaterTexture === WTYPE_CLOUD) return { kind: 'cloud' };
  return null;
}
