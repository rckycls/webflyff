// The JSON files the converter writes next to the tiles and models, and the viewer reads. Types only: the shapes
// are the contract, `tiles` and the asset index map logical keys to content-hashed file names
// (`<webName>.<first 10 hex of sha256>.<ext>`, global constraints).

import type { Vec3 } from '../binary/BinaryReader';

/** Every converted file by logical key (such as `models/obj_tree.glb`), mapped to its hashed path. */
export interface AssetIndex {
  version: 1;
  /** Logical key to hashed path. */
  files: Record<string, string>;
}

/** One world, ready to stream: what the viewer needs before it asks for the first tile. */
export interface WorldManifest {
  name: string;
  /** Landscape tiles across and down (`WorldInfo.size`). */
  size: [number, number];
  /** "Meter per unit" (`WorldInfo.mpu`). */
  mpu: number;
  /** Cells per tile side (`MAP_SIZE`), always 128. */
  mapSize: 128;
  /** `WorldInfo.ambient`: D3DCOLOR 0xAARRGGBB. */
  ambient: number;
  /** `WorldInfo.bgColor`: D3DCOLOR 0xAARRGGBB. */
  bgColor: number;
  /** `WorldInfo.fog`: start and end distance, and density. */
  fog: { start: number; end: number; density: number };
  /** `WorldInfo.camera`, with the position already in web space (`toWebPosition`). */
  camera: { position: Vec3; angle: number; angleX: number };
  /** Logical keys; `WebTileLayer.texture` indexes this. */
  terrainTextures: string[];
  /** Logical keys; `WebTileObject.model` indexes this. */
  models: string[];
  /**
   * Parallel to `models`: the model turns see-through between the camera and the player (`MODELELEM::m_bTrans`, the
   * `bTrans` column of mdlObj.inc, `CModelMng::LoadScript`, ModelMng.cpp:398), so the chase camera's object test
   * passes through it. Missing in a manifest written before it existed; a missing entry is false.
   */
  modelTrans?: boolean[];
  /** Tile `"x_y"` to its hashed path. A tile the world does not have is simply absent. */
  tiles: Record<string, string>;
}
