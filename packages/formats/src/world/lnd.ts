// Terrain tile (`Client/World/<World>/<World>XX-YY.lnd`), copying CLandscape::LoadLandscape
// (Source/_Common/lod.cpp:1266), plus the height flags of CPatch::CalculateBound (lod.cpp:140-151) and the file
// name of CWorld::ReadWorld (WorldFile.cpp:832; the client builds the same name at :980, and passes the column
// and row on as LoadLandscape's xx and yy).
//
// File layout, little-endian, in the order LoadLandscape reads it:
//
//   u32 version
//   i32 x, i32 y                  version >= 1 (xLand, yLand)
//   f32 heights[129 * 129]        (MAP_SIZE + 1) squared, row by row; HGT_* flags are added to the value
//   WATERHEIGHT water[256]        { u8 byWaterHeight, u8 byWaterTexture } per patch
//   u8 landAttr[256]              version >= 2 (m_aLandAttr)
//   u8 layerCount
//   layers: u16 textureId, BOOL patchEnable[256] (u32 each), u32 lightMap[128 * 128]
//   u32 objectCount, then ReadObj records (obj.ts)
//   u32 sfxObjectCount, then ReadObj records     optional: a file may end after the objects (:1398)
//
// Build options assumed (Source/Neuz/VersionCommon.h): __16BITLIGHT only changes how the light map is kept in
// video memory (the file always holds MAP_SIZE * MAP_SIZE DWORDs per layer, :1307-1323); __LAYER_1021 is only
// defined in WORLDSERVER/VersionCommon.h, and no function that reads these files branches on it.
//
// What LoadLandscape does with the data after reading it is not part of the format and is left to the converter:
//   - NewLayer (:1597) returns the layer that already has the same texture id, so a second layer with that id
//     overwrites the first one's patch flags and light map instead of adding a layer;
//   - a layer whose texture cannot be loaded is dropped (:1326-1340);
//   - objects whose model cannot be set up are dropped, and the tile offset is added to object positions
//     (`+= xx * LANDREALSCALE`, :1358-1359), which needs the world's MPU.

import { BinaryReader } from '../binary/BinaryReader';
import { readObjRecordOrFail } from './obj';
import type { WorldObjectRecord } from './obj';

/** landscape.h:6-8: the tile is MAP_SIZE cells square, cut into NUM_PATCHES_PER_SIDE patches of PATCH_SIZE cells. */
export const MAP_SIZE = 128;
export const NUM_PATCHES_PER_SIDE = 16;
export const PATCH_SIZE = 8;
/** landscape.h:23. Nothing in the C++ uses it, and shipped tiles have up to 33 layers. */
export const MAX_LAYER = 20;
/** landscape.h:29-32: added to a height to mark the cell. */
export const HGT = { NOWALK: 1000, NOFLY: 2000, NOMOVE: 3000, DIE: 4000 } as const;

const PATCHES = NUM_PATCHES_PER_SIDE * NUM_PATCHES_PER_SIDE;
const READER = 'readLnd';
const CPP_REF = 'Source/_Common/lod.cpp:1266 CLandscape::LoadLandscape';

export interface LandLayer {
  /** m_nTex: an id in Terrain.inc. */
  textureId: number;
  /** One byte (0 or 1) per patch, 16 x 16, row by row; the file holds a BOOL (4 bytes) for each. */
  patchEnable: Uint8Array;
  /** MAP_SIZE * MAP_SIZE light map texels as the file holds them: D3DCOLOR 0xAARRGGBB, row by row. */
  lightMap: Uint32Array;
}

export interface LandTile {
  version: number;
  /** xLand: the tile's column in the world. 0 in a version 0 file, which has none. */
  x: number;
  /** yLand: the tile's row in the world. 0 in a version 0 file. */
  y: number;
  /** (MAP_SIZE + 1) ^ 2 heights as stored, with any HGT_* flag still added; see `cleanHeight` and `heightFlag`. */
  heights: Float32Array;
  /** 256 WATERHEIGHT records of two bytes each, in file order: byWaterHeight, byWaterTexture, patch by patch. */
  water: Uint8Array;
  /**
   * m_aLandAttr, one byte per patch. Version 2 files have it as 0xCD (uninitialised memory) except the first 4
   * bytes, which LoadLandscape clears (see readLnd); version 0 and 1 files have none and get zeros. Many version
   * 3 patches hold 0xCD as well.
   */
  landAttr: Uint8Array;
  layers: LandLayer[];
  objects: WorldObjectRecord[];
  sfxObjects: WorldObjectRecord[];
}

/**
 * The height with its HGT_* flag taken off, as CPatch::CalculateBound does (lod.cpp:140-151): a height from 1000
 * up carries a flag, and the highest threshold it reaches (DIE, NOMOVE, NOFLY, NOWALK) is the one subtracted.
 */
export function cleanHeight(h: number): number {
  if (h >= HGT.NOWALK) {
    if (h >= HGT.DIE) return h - HGT.DIE;
    if (h >= HGT.NOMOVE) return h - HGT.NOMOVE;
    if (h >= HGT.NOFLY) return h - HGT.NOFLY;
    return h - HGT.NOWALK;
  }
  return h;
}

/**
 * The flag in a height, as `cleanHeight` finds it: HATTR_NONE 0, HATTR_NOWALK 1, HATTR_NOFLY 2, HATTR_NOMOVE 3,
 * HATTR_DIE 4 (landscape.h:34-38).
 */
export function heightFlag(h: number): 0 | 1 | 2 | 3 | 4 {
  if (h >= HGT.DIE) return 4;
  if (h >= HGT.NOMOVE) return 3;
  if (h >= HGT.NOFLY) return 2;
  if (h >= HGT.NOWALK) return 1;
  return 0;
}

/**
 * The tile's file name, `%s%02d-%02d.lnd` (WorldFile.cpp:832): `landFileName('WdMadrigal', 1, 4)` is
 * `WdMadrigal01-04.lnd`.
 */
export function landFileName(world: string, x: number, y: number): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${world}${pad(x)}-${pad(y)}.lnd`;
}

/**
 * Reads a whole `.lnd` file; `file` only labels errors. Every byte must be used, so a file with anything after
 * the last SFX object (or with 1 to 3 bytes where the SFX count would be) throws.
 *
 * Two places differ from the C++ where it reads memory the file does not set:
 *  - version 2: `ZeroMemory( m_aLandAttr, sizeof( NUM_PATCHES_PER_SIDE * NUM_PATCHES_PER_SIDE ) )` (lod.cpp:1289)
 *    takes the size of an int expression, 4, so only the first 4 land attribute bytes are cleared. That is copied.
 *  - version 0 and 1: the same call clears 4 bytes and leaves the other 252 as the constructor left them. Here
 *    they are all 0.
 *
 * An object of a type ReadObj makes no object for throws: lod.cpp:1355 would go on to use the NULL.
 */
export function readLnd(bytes: Uint8Array, file: string): LandTile {
  const r = new BinaryReader(bytes, { file, reader: READER, cppRef: CPP_REF });

  const version = r.u32();
  let x = 0;
  let y = 0;
  if (version >= 1) {
    x = r.i32();
    y = r.i32();
  }
  const heights = r.f32Array((MAP_SIZE + 1) * (MAP_SIZE + 1));
  const water = r.bytes(PATCHES * 2);
  const landAttr = version >= 2 ? r.bytes(PATCHES) : new Uint8Array(PATCHES);
  if (version === 2) landAttr.fill(0, 0, 4); // lod.cpp:1289, see above

  const layerCount = r.u8();
  const layers: LandLayer[] = [];
  for (let i = 0; i < layerCount; i++) {
    const textureId = r.u16();
    const patchEnable = Uint8Array.from(r.u32Array(PATCHES), (v) => (v === 0 ? 0 : 1));
    const lightMap = r.u32Array(MAP_SIZE * MAP_SIZE);
    layers.push({ textureId, patchEnable, lightMap });
  }

  const objects = readObjects(r);
  // The SFX objects are read only `if( size )`, i.e. if the file has a count to read (lod.cpp:1398).
  const sfxObjects = r.remaining() > 0 ? readObjects(r) : [];
  r.expectEnd();

  return { version, x, y, heights, water, landAttr, layers, objects, sfxObjects };
}

function readObjects(r: BinaryReader): WorldObjectRecord[] {
  const count = r.u32();
  const out: WorldObjectRecord[] = [];
  for (let i = 0; i < count; i++) out.push(readObjRecordOrFail(r));
  return out;
}
