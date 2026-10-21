import { Bytes } from '../../../../packages/formats/test/helpers/bytes';

// Hand-made `.lnd` files for the world stage tests, laid out the way CLandscape::LoadLandscape reads them
// (Source/_Common/lod.cpp:1266).

const HEIGHTS = 129 * 129;
const PATCHES = 16 * 16;
const LIGHT_TEXELS = 128 * 128;
/** name[64], dialog[32], characterKey[32], belligerence, extraFlag (Mover.cpp:2903-2907). */
const MOVER_EXTRA_BYTES = 64 + 32 + 32 + 4 + 4;

export interface TestObject {
  /** OT_OBJ (0) unless given; an OT_MOVER (5) record carries the 136 bytes CMover::Read takes after the common fields. */
  objType?: number;
  /** The file's x, y, z: CObj::Read multiplies x and z by 4 (OLD_MPU) after reading. */
  pos?: [number, number, number];
  scale?: [number, number, number];
  angle?: number;
  /** m_dwIndex: the id in mdlObj.inc / mdlDyna.inc. */
  index?: number;
}

export interface TestLayer {
  /** An id in Terrain.inc. */
  tex: number;
  /** ARGB of every light map texel; 0xff112233 unless given. */
  light?: number;
}

export interface TestLnd {
  /** 3 unless given. */
  version?: number;
  /** The x and y in the file's header, which the converter must ignore (R14). */
  headerX?: number;
  headerY?: number;
  /** height of cell `i`; `i * 0.5` unless given. */
  height?: (i: number) => number;
  layers?: TestLayer[];
  objects?: TestObject[];
  sfx?: TestObject[];
}

function object(o: TestObject): Uint8Array {
  const b = new Bytes().u32(o.objType ?? 0).f32(o.angle ?? 0);
  b.f32(0).f32(0).f32(0); // axis
  for (const v of o.pos ?? [0, 0, 0]) b.f32(v);
  for (const v of o.scale ?? [1, 1, 1]) b.f32(v);
  b.u32(o.objType ?? 0).u32(o.index ?? 1).u32(0).u32(0).u32(0); // type, index, motion, ai, ai2
  if (o.objType === 5) b.zeros(MOVER_EXTRA_BYTES);
  return b.build();
}

/** The bytes of one `.lnd`. SFX records are written as OT_SFX, which has no extra bytes. */
export function lndBytes(t: TestLnd = {}): Uint8Array {
  const version = t.version ?? 3;
  const b = new Bytes().u32(version);
  if (version >= 1) b.i32(t.headerX ?? 0).i32(t.headerY ?? 0);
  for (let i = 0; i < HEIGHTS; i++) b.f32(t.height?.(i) ?? i * 0.5);
  b.ramp(PATCHES * 2); // water: byWaterHeight, byWaterTexture per patch
  if (version >= 2) b.ramp(PATCHES, 40); // land attributes
  const layers = t.layers ?? [];
  b.u8(layers.length);
  for (const layer of layers) {
    b.u16(layer.tex);
    for (let i = 0; i < PATCHES; i++) b.u32(i % 2); // patchEnable: a BOOL per patch
    for (let i = 0; i < LIGHT_TEXELS; i++) b.u32(layer.light ?? 0xff112233);
  }
  const objects = t.objects ?? [];
  b.u32(objects.length);
  for (const o of objects) b.raw(object(o));
  if (t.sfx !== undefined) {
    b.u32(t.sfx.length);
    for (const o of t.sfx) b.raw(object({ ...o, objType: 3 }));
  }
  return b.build();
}
