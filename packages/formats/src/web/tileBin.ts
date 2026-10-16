// The terrain tile file the converter writes (`tiles/<x>_<y>.<hash>.bin`) and the viewer streams. Not a client
// format: there is no C++ to copy, so the layout below is the whole contract, and `encodeTileBin` and
// `decodeTileBin` are its only two implementations. Little-endian throughout:
//
//   "FWT1"                       magic
//   u16 version                  1
//   u16 x, u16 y                 tile column and row
//   f32 heights[129 * 129]       raw, as the .lnd holds them (HGT_* flags still added)
//   u32 waterLen, u8 water[]     raw WATERHEIGHT bytes from the .lnd (2 per patch)
//   u8 landAttr[256]
//   u8 layerCount                so at most 255 layers; real tiles have up to 33 (MAX_LAYER is not a limit)
//   per layer:  u16 texture, u8 patchEnable[256], u8 light[128 * 128 * 4]   (light is RGBA)
//   u32 objectCount
//   per object: u16 model, f32 matrix[16]                                   (matrix is web, column-major)
//
// Errors: `decodeTileBin` reads untrusted bytes and throws FormatError (no C++ reference exists, so `cppRef` is
// 'n/a'); `encodeTileBin` checks its caller's data and throws RangeError for anything that would not survive a
// round trip.

import { BinaryReader } from '../binary/BinaryReader';
import { FormatError } from '../errors';

const READER = 'decodeTileBin';
const NO_CPP_REF = 'n/a';

const MAGIC = [0x46, 0x57, 0x54, 0x31] as const; // "FWT1"
const VERSION = 1;

/** The tile is 128 cells square, so 129 * 129 heights; 16 * 16 patches; one RGBA texel per cell per layer. */
const HEIGHT_COUNT = 129 * 129;
const PATCH_COUNT = 16 * 16;
const LIGHT_BYTES = 128 * 128 * 4;
const MATRIX_FLOATS = 16;

const U16_MAX = 0xffff;
const MAX_LAYERS = 0xff;

const HEADER_BYTES = MAGIC.length + 2 + 2 + 2;
const LAYER_BYTES = 2 + PATCH_COUNT + LIGHT_BYTES;
const OBJECT_BYTES = 2 + MATRIX_FLOATS * 4;

export interface WebTileLayer {
  /** Index into `manifest.terrainTextures`. */
  texture: number;
  /** One byte per patch (0 or 1), 16 x 16, row by row. */
  patchEnable: Uint8Array;
  /** RGBA, 128 x 128 texels, row by row (`argbToRgba` of the .lnd's light map). */
  light: Uint8Array;
}

export interface WebTileObject {
  /** Index into `manifest.models`; 0xffff when the object's model could not be resolved. */
  model: number;
  /** Web space, column-major (`toWebMatrix` of the object's local matrix). */
  matrix: Float32Array;
}

export interface WebTile {
  /**
   * The tile's column and row, from the .lnd's file name: the header fields inside the file are unreliable (36
   * shipped files disagree with their names), so the caller passes the name's numbers and the codec stores them.
   */
  x: number;
  y: number;
  /** Raw, 129 * 129. */
  heights: Float32Array;
  /** Raw WATERHEIGHT bytes from the .lnd. */
  water: Uint8Array;
  /** 256. */
  landAttr: Uint8Array;
  layers: WebTileLayer[];
  objects: WebTileObject[];
}

/** An ARGB DWORD (D3DCOLOR 0xAARRGGBB, as the .lnd's light maps hold them) per texel to bytes `[R, G, B, A]`. */
export function argbToRgba(lightMap: Uint32Array): Uint8Array {
  const out = new Uint8Array(lightMap.length * 4);
  for (let i = 0; i < lightMap.length; i++) {
    const argb = lightMap[i]!;
    out[i * 4] = (argb >>> 16) & 0xff;
    out[i * 4 + 1] = (argb >>> 8) & 0xff;
    out[i * 4 + 2] = argb & 0xff;
    out[i * 4 + 3] = argb >>> 24;
  }
  return out;
}

function checkU16(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0 || value > U16_MAX) {
    throw new RangeError(`encodeTileBin: ${what} ${value} is not a u16 (0 to ${U16_MAX})`);
  }
}

function checkLength(array: { length: number }, expected: number, what: string): void {
  if (array.length !== expected) {
    throw new RangeError(`encodeTileBin: ${what} has ${array.length} elements, expected ${expected}`);
  }
}

function validate(t: WebTile): void {
  checkU16(t.x, 'tile x');
  checkU16(t.y, 'tile y');
  checkLength(t.heights, HEIGHT_COUNT, 'heights');
  checkLength(t.landAttr, PATCH_COUNT, 'landAttr');
  if (t.layers.length > MAX_LAYERS) {
    throw new RangeError(
      `encodeTileBin: ${t.layers.length} layers, but the layer count is one byte (at most ${MAX_LAYERS})`,
    );
  }
  t.layers.forEach((layer, i) => {
    checkU16(layer.texture, `layer ${i} texture`);
    checkLength(layer.patchEnable, PATCH_COUNT, `layer ${i} patchEnable`);
    checkLength(layer.light, LIGHT_BYTES, `layer ${i} light`);
  });
  t.objects.forEach((object, i) => {
    checkU16(object.model, `object ${i} model`);
    checkLength(object.matrix, MATRIX_FLOATS, `object ${i} matrix`);
  });
}

export function encodeTileBin(t: WebTile): Uint8Array {
  validate(t);

  const size =
    HEADER_BYTES +
    HEIGHT_COUNT * 4 +
    4 +
    t.water.length +
    PATCH_COUNT +
    1 +
    t.layers.length * LAYER_BYTES +
    4 +
    t.objects.length * OBJECT_BYTES;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let at = 0;

  const putFloats = (floats: ArrayLike<number>): void => {
    for (let i = 0; i < floats.length; i++, at += 4) view.setFloat32(at, floats[i]!, true);
  };
  const putBytes = (bytes: Uint8Array): void => {
    out.set(bytes, at);
    at += bytes.length;
  };

  out.set(MAGIC, at);
  at += MAGIC.length;
  view.setUint16(at, VERSION, true);
  view.setUint16(at + 2, t.x, true);
  view.setUint16(at + 4, t.y, true);
  at += 6;
  putFloats(t.heights);
  view.setUint32(at, t.water.length, true);
  at += 4;
  putBytes(t.water);
  putBytes(t.landAttr);
  out[at++] = t.layers.length;
  for (const layer of t.layers) {
    view.setUint16(at, layer.texture, true);
    at += 2;
    putBytes(layer.patchEnable);
    putBytes(layer.light);
  }
  view.setUint32(at, t.objects.length, true);
  at += 4;
  for (const object of t.objects) {
    view.setUint16(at, object.model, true);
    at += 2;
    putFloats(object.matrix);
  }
  return out;
}

/**
 * Reads a tile written by `encodeTileBin`. Every array in the result is a copy; none is a view into `bytes`.
 * `file` only labels errors (the URL or path the bytes came from).
 */
export function decodeTileBin(bytes: Uint8Array, file = '<tile.bin>'): WebTile {
  const r = new BinaryReader(bytes, { file, reader: READER, cppRef: NO_CPP_REF });
  const failAt = (offset: number, message: string): never => {
    throw new FormatError(message, { file, offset, reader: READER, cppRef: NO_CPP_REF });
  };

  const magic = r.bytes(MAGIC.length);
  if (!MAGIC.every((b, i) => magic[i] === b)) {
    const hex = (list: ArrayLike<number>): string => Array.from(list, (b) => b.toString(16).padStart(2, '0')).join(' ');
    failAt(0, `bad magic ${hex(magic)}, expected ${hex(MAGIC)} ("FWT1")`);
  }
  const versionAt = r.offset;
  const version = r.u16();
  if (version !== VERSION) {
    failAt(versionAt, `unsupported version ${version}, this reader reads version ${VERSION}`);
  }
  const x = r.u16();
  const y = r.u16();
  const heights = r.f32Array(HEIGHT_COUNT);
  const water = r.bytes(r.u32());
  const landAttr = r.bytes(PATCH_COUNT);

  const layerCount = r.u8();
  if (layerCount * LAYER_BYTES > r.remaining()) {
    r.fail(`${layerCount} layers need ${layerCount * LAYER_BYTES} bytes but only ${r.remaining()} remain`);
  }
  const layers: WebTileLayer[] = [];
  for (let i = 0; i < layerCount; i++) {
    layers.push({ texture: r.u16(), patchEnable: r.bytes(PATCH_COUNT), light: r.bytes(LIGHT_BYTES) });
  }

  const objectCount = r.u32();
  if (objectCount * OBJECT_BYTES > r.remaining()) {
    r.fail(`${objectCount} objects need ${objectCount * OBJECT_BYTES} bytes but only ${r.remaining()} remain`);
  }
  const objects: WebTileObject[] = [];
  for (let i = 0; i < objectCount; i++) {
    objects.push({ model: r.u16(), matrix: r.f32Array(MATRIX_FLOATS) });
  }

  r.expectEnd();
  return { x, y, heights, water, landAttr, layers, objects };
}
