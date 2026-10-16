import { describe, expect, it } from 'vitest';
import {
  BinaryReader,
  HGT,
  MAP_SIZE,
  MAX_LAYER,
  NUM_PATCHES_PER_SIDE,
  PATCH_SIZE,
  cleanHeight,
  heightFlag,
  landFileName,
  objectLocalMatrix,
  readDyo,
  readLnd,
  readObjRecord,
} from '../src/index';
import type { WorldObjectRecord } from '../src/index';
import { Bytes } from './helpers/bytes';
import { thrown } from './helpers/thrown';

// ---- byte builders: lay out records the way the C++ writes them -------------------------------------------------

const OT = { OBJ: 0, ANI: 1, CTRL: 2, SFX: 3, ITEM: 4, MOVER: 5, REGION: 6, SHIP: 7, PATH: 8 } as const;

/** Bytes a CMover::Read takes after CObj::Read: name[64], dialog[32], characterKey[32], belligerence, extraFlag. */
const MOVER_EXTRA = 64 + 32 + 32 + 4 + 4;
/** sizeof(CCtrlElem) with MAX_JOB = 32 (CommonCtrl.h:15-62, Source's own comment: "432"). */
const CTRL_ELEM = 432;

interface ObjSpec {
  objType: number;
  angle?: number;
  axis?: [number, number, number];
  pos?: [number, number, number];
  scale?: [number, number, number];
  type?: number;
  index?: number;
  motion?: number;
  ai?: number;
  ai2?: number;
  /** What the type's own Read takes after the common fields. */
  extra?: Uint8Array;
}

function objBytes(o: ObjSpec): Uint8Array {
  const b = new Bytes().u32(o.objType).f32(o.angle ?? 0);
  for (const v of o.axis ?? [0, 0, 0]) b.f32(v);
  for (const v of o.pos ?? [0, 0, 0]) b.f32(v);
  for (const v of o.scale ?? [1, 1, 1]) b.f32(v);
  b.u32(o.type ?? o.objType)
    .u32(o.index ?? 1)
    .u32(o.motion ?? 0)
    .u32(o.ai ?? 0)
    .u32(o.ai2 ?? 0);
  if (o.extra) b.raw(o.extra);
  return b.build();
}

/** The fixed part of a record: objType, angle, axis, pos, scale, type, index, motion, ai, ai2. */
const BASE_RECORD = 4 + 4 + 12 + 12 + 12 + 4 * 5;

const moverExtra = (): Uint8Array => new Bytes().ramp(MOVER_EXTRA, 7).build();
const ctrlExtra = (version: number, payload: number): Uint8Array =>
  new Bytes().u32(version).ramp(payload, 3).build();

function reader(bytes: Uint8Array): BinaryReader {
  return new BinaryReader(bytes, { file: 'test.lnd', reader: 'readObjRecord', cppRef: 'ReadObj' });
}

interface LndSpec {
  version: number;
  x?: number;
  y?: number;
  layers?: { tex: number; enabled?: number[]; enableValue?: number }[];
  objects?: Uint8Array[];
  /** `undefined`: the file ends after the objects. */
  sfx?: Uint8Array[];
  trailing?: number[];
}

const HEIGHTS = (MAP_SIZE + 1) * (MAP_SIZE + 1);
const PATCHES = NUM_PATCHES_PER_SIDE * NUM_PATCHES_PER_SIDE;

function lndBytes(s: LndSpec): Uint8Array {
  const b = new Bytes().u32(s.version);
  if (s.version >= 1) b.i32(s.x ?? 0).i32(s.y ?? 0);
  for (let i = 0; i < HEIGHTS; i++) b.f32(i * 0.25);
  b.ramp(PATCHES * 2); // WATERHEIGHT { byWaterHeight, byWaterTexture } per patch
  if (s.version >= 2) b.raw(new Uint8Array(PATCHES).fill(0xcd)); // land attributes
  const layers = s.layers ?? [];
  b.u8(layers.length);
  for (const layer of layers) {
    b.u16(layer.tex);
    const enabled = new Set(layer.enabled ?? []);
    for (let i = 0; i < PATCHES; i++) b.u32(enabled.has(i) ? (layer.enableValue ?? 1) : 0);
    for (let i = 0; i < MAP_SIZE * MAP_SIZE; i++) b.u32((0xff000000 | i) >>> 0);
  }
  b.u32((s.objects ?? []).length);
  for (const o of s.objects ?? []) b.raw(o);
  if (s.sfx) {
    b.u32(s.sfx.length);
    for (const o of s.sfx) b.raw(o);
  }
  for (const t of s.trailing ?? []) b.u8(t);
  return b.build();
}

// ---- constants and small helpers ----------------------------------------------------------------------------------

describe('terrain constants', () => {
  it('match landscape.h', () => {
    expect(MAP_SIZE).toBe(128);
    expect(NUM_PATCHES_PER_SIDE).toBe(16);
    expect(PATCH_SIZE).toBe(8);
    expect(MAX_LAYER).toBe(20);
    expect(HGT).toEqual({ NOWALK: 1000, NOFLY: 2000, NOMOVE: 3000, DIE: 4000 });
  });
});

describe('cleanHeight / heightFlag', () => {
  it('cleanHeight strips flags', () => {
    expect(cleanHeight(12.5)).toBe(12.5);
    expect(cleanHeight(1012.5)).toBe(12.5);
    expect(cleanHeight(2012.5)).toBe(12.5);
    expect(cleanHeight(3012.5)).toBe(12.5);
    expect(cleanHeight(4012.5)).toBe(12.5);
  });

  it('heightFlag names the flag: DIE first, then NOMOVE, NOFLY, NOWALK', () => {
    expect(heightFlag(12.5)).toBe(0);
    expect(heightFlag(1012.5)).toBe(1);
    expect(heightFlag(2012.5)).toBe(2);
    expect(heightFlag(3012.5)).toBe(3);
    expect(heightFlag(4012.5)).toBe(4);
  });

  it('flag ranges start exactly on the HGT_* constants, and negative heights are never flagged', () => {
    expect(heightFlag(999.75)).toBe(0);
    expect(heightFlag(1000)).toBe(1);
    expect(cleanHeight(1000)).toBe(0);
    expect(heightFlag(1999.5)).toBe(1);
    expect(heightFlag(2000)).toBe(2);
    expect(heightFlag(2999.5)).toBe(2);
    expect(heightFlag(3000)).toBe(3);
    expect(heightFlag(3999.5)).toBe(3);
    expect(heightFlag(4000)).toBe(4);
    expect(heightFlag(-5)).toBe(0);
    expect(cleanHeight(-5)).toBe(-5);
  });
});

describe('landFileName', () => {
  it('pads', () => {
    expect(landFileName('WdMadrigal', 1, 4)).toBe('WdMadrigal01-04.lnd');
    expect(landFileName('WdMadrigal', 12, 0)).toBe('WdMadrigal12-00.lnd');
  });

  it('does not truncate a coordinate of three digits (%02d)', () => {
    expect(landFileName('WdBig', 100, 7)).toBe('WdBig100-07.lnd');
  });
});

// ---- object records -----------------------------------------------------------------------------------------------

describe('readObjRecord', () => {
  it('reads the common fields (CObj::Read) and scales x and z by OLD_MPU = 4', () => {
    const bytes = objBytes({
      objType: OT.OBJ,
      angle: 33.5,
      axis: [10, 20, 30],
      pos: [1.5, 100, -2.25],
      scale: [2, 3, 4],
      type: OT.OBJ,
      index: 77,
      motion: 5,
      ai: 6,
      ai2: 7,
    });
    expect(bytes.length).toBe(BASE_RECORD);
    const r = reader(bytes);
    expect(readObjRecord(r)).toEqual<WorldObjectRecord>({
      objType: 0,
      angle: 33.5,
      axis: [10, 20, 30],
      position: [6, 100, -9], // x and z times 4, y untouched
      scale: [2, 3, 4],
      type: 0,
      index: 77,
      motion: 5,
      ai: 6,
      ai2: 7,
      extraBytes: 0,
    });
    r.expectEnd();
  });

  it('keeps objType (the DWORD ReadObj switches on) apart from type (the one CObj::Read reads)', () => {
    const rec = readObjRecord(reader(objBytes({ objType: OT.CTRL, type: 0x1234, extra: ctrlExtra(0x80000000, CTRL_ELEM) })));
    expect(rec).not.toBeNull();
    expect(rec!.objType).toBe(OT.CTRL);
    expect(rec!.type).toBe(0x1234);
  });

  it.each([
    ['OT_ITEM', OT.ITEM],
    ['OT_SFX', OT.SFX],
    ['OT_SHIP', OT.SHIP],
  ])('%s has no Read of its own: only the common fields', (_name, objType) => {
    const r = reader(objBytes({ objType, index: 9 }));
    const rec = readObjRecord(r);
    expect(rec).not.toBeNull();
    expect(rec!.objType).toBe(objType);
    expect(rec!.index).toBe(9);
    expect(rec!.extraBytes).toBe(0);
    r.expectEnd();
  });

  it('OT_MOVER takes name, dialog file, character key, belligerence and extra flag after the common fields', () => {
    const r = reader(new Bytes().raw(objBytes({ objType: OT.MOVER, index: 4, extra: moverExtra() })).u32(0xabcd).build());
    const rec = readObjRecord(r);
    expect(rec!.objType).toBe(OT.MOVER);
    expect(rec!.index).toBe(4);
    expect(rec!.extraBytes).toBe(MOVER_EXTRA);
    expect(r.remaining()).toBe(4); // the next record's first DWORD is untouched
  });

  it.each([
    ['0x80000000: the whole CCtrlElem', 0x80000000, CTRL_ELEM],
    ['0x90000000: 88 bytes, then everything after the 64 bytes of new job slots (__VER >= 10)', 0x90000000, 88 + (CTRL_ELEM - 152)],
    ['any other value is m_dwSet itself; sizeof(CCtrlElem) - 40 bytes follow', 0x00000003, CTRL_ELEM - 40],
  ])('OT_CTRL (CCommonCtrl::Read), version %s', (_name, version, payload) => {
    const r = reader(new Bytes().raw(objBytes({ objType: OT.CTRL, extra: ctrlExtra(version, payload) })).u32(0xabcd).build());
    const rec = readObjRecord(r);
    expect(rec!.objType).toBe(OT.CTRL);
    expect(rec!.extraBytes).toBe(4 + payload);
    expect(r.remaining()).toBe(4);
  });

  it.each([OT.ANI, OT.REGION, OT.PATH, 9, 99, 0xffffffff])(
    'returns null for the unknown object type %i after consuming only its DWORD, as ReadObj does',
    (objType) => {
      const r = reader(new Bytes().u32(objType).ramp(40).build());
      expect(readObjRecord(r)).toBeNull();
      expect(r.offset).toBe(4);
    },
  );

  it('throws a FormatError when the record is cut short', () => {
    const whole = objBytes({ objType: OT.MOVER, extra: moverExtra() });
    for (const cut of [2, BASE_RECORD - 1, BASE_RECORD + 10, whole.length - 1]) {
      const e = thrown(() => readObjRecord(reader(whole.subarray(0, cut))));
      expect(e.file).toBe('test.lnd');
    }
  });
});

// ---- the local matrix ---------------------------------------------------------------------------------------------

/** D3DXMatrixRotationYawPitchRoll written out (row vectors, left-handed): the closed form, not a product of rotations. */
function yawPitchRoll(yaw: number, pitch: number, roll: number): number[] {
  const [sy, cy, sp, cp, sr, cr] = [Math.sin(yaw), Math.cos(yaw), Math.sin(pitch), Math.cos(pitch), Math.sin(roll), Math.cos(roll)];
  return [
    sr * sp * sy + cr * cy, sr * cp, sr * sp * cy - cr * sy, 0,
    cr * sp * sy - sr * cy, cr * cp, cr * sp * cy + sr * sy, 0,
    cp * sy, -sp, cp * cy, 0,
    0, 0, 0, 1,
  ];
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

function record(over: Partial<WorldObjectRecord>): WorldObjectRecord {
  return {
    objType: 0,
    angle: 0,
    axis: [0, 0, 0],
    position: [0, 0, 0],
    scale: [1, 1, 1],
    type: 0,
    index: 1,
    motion: 0,
    ai: 0,
    ai2: 0,
    extraBytes: 0,
    ...over,
  };
}

function expectMatrix(actual: Float32Array, expected: number[]): void {
  expect(actual).toBeInstanceOf(Float32Array);
  expect(actual.length).toBe(16);
  expected.forEach((v, i) => expect(actual[i], `element ${i}`).toBeCloseTo(v, 5));
}

describe('objectLocalMatrix', () => {
  it('is the identity for an object at the origin, unrotated and unscaled', () => {
    expectMatrix(objectLocalMatrix(record({})), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('puts the position in the last row (D3DXMatrixTranslation, row vectors)', () => {
    const m = objectLocalMatrix(record({ position: [5, 6, 7] }));
    expect([m[12], m[13], m[14], m[15]]).toEqual([5, 6, 7, 1]);
  });

  it('turns a quarter around Y like D3DXMatrixRotationY(90 deg): _13 = -1, _31 = 1', () => {
    // UpdateLocalMatrix passes yaw = ToRadian(-m_fAngle), so a file angle of -90 is a yaw of +90 degrees.
    const m = objectLocalMatrix(record({ angle: -90 }));
    expect(m[2]).toBeCloseTo(-1, 6); // _13
    expect(m[8]).toBeCloseTo(1, 6); // _31
    expect(m[0]).toBeCloseTo(0, 6); // _11
    expect(m[10]).toBeCloseTo(0, 6); // _33
    expect(m[5]).toBe(1); // _22
  });

  it('negates the angle: a file angle of +90 gives _13 = +1, _31 = -1', () => {
    const m = objectLocalMatrix(record({ angle: 90 }));
    expect(m[2]).toBeCloseTo(1, 6);
    expect(m[8]).toBeCloseTo(-1, 6);
  });

  it('rotates by yaw -angle, pitch -axis.x and roll +axis.z (__VER >= 11, __FIX_ROTATE), then scales rows and translates', () => {
    const rec = record({ angle: 30, axis: [10, 99, 20], scale: [2, 3, 4], position: [5, 6, 7] });
    const rot = yawPitchRoll(rad(-30), rad(-10), rad(20));
    const expected = [
      ...rot.slice(0, 4).map((v, i) => (i < 3 ? v * 2 : v)),
      ...rot.slice(4, 8).map((v, i) => (i < 3 ? v * 3 : v)),
      ...rot.slice(8, 12).map((v, i) => (i < 3 ? v * 4 : v)),
      5, 6, 7, 1,
    ];
    expectMatrix(objectLocalMatrix(rec), expected);
  });

  it('ignores axis.y, as CObj::Read does (only m_fAngX and m_fAngZ are taken from the axis)', () => {
    expectMatrix(objectLocalMatrix(record({ axis: [0, 45, 0] })), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('is the matrix scale * rotation * translation: scaling does not move the position', () => {
    const m = objectLocalMatrix(record({ scale: [2, 3, 4], position: [10, 20, 30] }));
    expectMatrix(m, [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 10, 20, 30, 1]);
  });
});

// ---- .lnd tiles ---------------------------------------------------------------------------------------------------

describe('readLnd', () => {
  const plain = (x: number, z: number, index = 3): Uint8Array => objBytes({ objType: OT.OBJ, pos: [x, 1, z], index });

  it('reads a version 3 tile: header, heights, water, land attributes, layers, objects', () => {
    const tile = readLnd(
      lndBytes({
        version: 3,
        x: 4,
        y: 9,
        layers: [
          { tex: 12, enabled: [0, 255] },
          { tex: 513, enabled: [1, 16] },
        ],
        objects: [plain(1, 2, 10), plain(3, 4, 11)],
      }),
      'WdTest04-09.lnd',
    );
    expect(tile.version).toBe(3);
    expect([tile.x, tile.y]).toEqual([4, 9]);

    expect(tile.heights).toBeInstanceOf(Float32Array);
    expect(tile.heights.length).toBe(16641);
    expect(tile.heights[1]).toBe(0.25);
    expect(tile.heights[16640]).toBe(4160);

    // WATERHEIGHT is two bytes per patch, so 512 bytes in file order
    expect(tile.water.length).toBe(512);
    expect(Array.from(tile.water.subarray(0, 4))).toEqual([0, 1, 2, 3]);
    expect(tile.landAttr.length).toBe(256);
    expect(tile.landAttr.every((v) => v === 0xcd)).toBe(true);

    expect(tile.layers.map((l) => l.textureId)).toEqual([12, 513]);
    const [first, second] = tile.layers;
    expect(first.patchEnable).toBeInstanceOf(Uint8Array);
    expect(first.patchEnable.length).toBe(256);
    expect(first.patchEnable[0]).toBe(1);
    expect(first.patchEnable[255]).toBe(1);
    expect(first.patchEnable[1]).toBe(0);
    expect(second.patchEnable[1]).toBe(1);
    expect(second.patchEnable[16]).toBe(1);
    expect(second.patchEnable[0]).toBe(0);
    expect(first.lightMap).toBeInstanceOf(Uint32Array);
    expect(first.lightMap.length).toBe(16384);
    expect(first.lightMap[0]).toBe(0xff000000);
    expect(first.lightMap[16383]).toBe(0xff003fff);

    expect(tile.objects.map((o) => [o.index, ...o.position])).toEqual([
      [10, 4, 1, 8],
      [11, 12, 1, 16],
    ]);
    expect(tile.sfxObjects).toEqual([]);
  });

  it('reports a patch enable (a BOOL) as 0 or 1 whatever non-zero value the file holds', () => {
    const tile = readLnd(lndBytes({ version: 3, layers: [{ tex: 1, enabled: [7], enableValue: 0xffffffff }] }), 't.lnd');
    expect(tile.layers[0].patchEnable[7]).toBe(1);
    expect(tile.layers[0].patchEnable[6]).toBe(0);
  });

  it('reads a tile with no layers and no objects', () => {
    const tile = readLnd(lndBytes({ version: 3 }), 't.lnd');
    expect(tile.layers).toEqual([]);
    expect(tile.objects).toEqual([]);
    expect(tile.sfxObjects).toEqual([]);
  });

  it('version 2: the land attributes follow the water, and ZeroMemory(sizeof(256)) clears only the first 4 bytes', () => {
    const tile = readLnd(lndBytes({ version: 2, x: 1, y: 2 }), 't.lnd');
    expect([tile.x, tile.y]).toEqual([1, 2]);
    expect(Array.from(tile.landAttr.subarray(0, 6))).toEqual([0, 0, 0, 0, 0xcd, 0xcd]);
    expect(tile.landAttr.length).toBe(256);
  });

  it('version 1: x and y are in the file, but there is no land attribute block', () => {
    const tile = readLnd(lndBytes({ version: 1, x: 7, y: 8, layers: [{ tex: 5 }], objects: [plain(1, 1)] }), 't.lnd');
    expect([tile.x, tile.y]).toEqual([7, 8]);
    expect(tile.landAttr).toEqual(new Uint8Array(256));
    expect(tile.layers.map((l) => l.textureId)).toEqual([5]);
    expect(tile.objects.length).toBe(1);
  });

  it('version 0: no x and y either (they read as 0)', () => {
    const tile = readLnd(lndBytes({ version: 0, layers: [{ tex: 5 }], objects: [plain(1, 1)] }), 't.lnd');
    expect(tile.version).toBe(0);
    expect([tile.x, tile.y]).toEqual([0, 0]);
    expect(tile.landAttr).toEqual(new Uint8Array(256));
    expect(tile.heights[1]).toBe(0.25);
    expect(tile.layers.length).toBe(1);
    expect(tile.objects.length).toBe(1);
  });

  it('reads the SFX object section that follows the objects', () => {
    const tile = readLnd(
      lndBytes({
        version: 3,
        objects: [plain(1, 1)],
        sfx: [objBytes({ objType: OT.SFX, pos: [2, 3, 4], index: 21 }), objBytes({ objType: OT.SFX, index: 22 })],
      }),
      't.lnd',
    );
    expect(tile.objects.length).toBe(1);
    expect(tile.sfxObjects.map((o) => o.index)).toEqual([21, 22]);
    expect(tile.sfxObjects[0].position).toEqual([8, 3, 16]);
  });

  it('an empty SFX section (a count of 0) is fine', () => {
    expect(readLnd(lndBytes({ version: 3, sfx: [] }), 't.lnd').sfxObjects).toEqual([]);
  });

  it('reads movers and controls among the objects (their longer records keep the next one aligned)', () => {
    const tile = readLnd(
      lndBytes({
        version: 3,
        objects: [
          objBytes({ objType: OT.MOVER, index: 1, extra: moverExtra() }),
          objBytes({ objType: OT.CTRL, index: 2, extra: ctrlExtra(0x90000000, 88 + (CTRL_ELEM - 152)) }),
          plain(5, 5, 3),
        ],
      }),
      't.lnd',
    );
    expect(tile.objects.map((o) => [o.objType, o.index, o.extraBytes])).toEqual([
      [OT.MOVER, 1, MOVER_EXTRA],
      [OT.CTRL, 2, 4 + 88 + (CTRL_ELEM - 152)],
      [OT.OBJ, 3, 0],
    ]);
  });

  it('throws a FormatError that names the file, reader and lod.cpp when bytes are left over', () => {
    const e = thrown(() => readLnd(lndBytes({ version: 3, objects: [plain(1, 1)], sfx: [], trailing: [0] }), 'WdTest00-00.lnd'));
    expect(e.file).toBe('WdTest00-00.lnd');
    expect(e.reader).toBe('readLnd');
    expect(e.cppRef).toContain('lod.cpp:1266');
    expect(e.message).toContain('expected end');
  });

  it('throws when the file ends inside the SFX count (1 to 3 bytes after the objects)', () => {
    for (const n of [1, 2, 3]) {
      const e = thrown(() => readLnd(lndBytes({ version: 3, objects: [plain(1, 1)], trailing: Array(n).fill(0) }), 't.lnd'));
      expect(e.reader).toBe('readLnd');
    }
  });

  it('throws on an unknown object type, where the C++ would dereference NULL', () => {
    const e = thrown(() => readLnd(lndBytes({ version: 3, objects: [objBytes({ objType: OT.ANI })] }), 't.lnd'));
    expect(e.message).toContain('unknown object type 1');
    // reported at the start of the record: right after the object count, which ends a tile with no objects
    expect(e.offset).toBe(lndBytes({ version: 3 }).length);
  });

  it('throws when the file is truncated, wherever it is cut', () => {
    const whole = lndBytes({ version: 3, layers: [{ tex: 2 }], objects: [plain(1, 1)] });
    for (const cut of [0, 3, 11, 5000, 70000, whole.length - 70000, whole.length - 10]) {
      const e = thrown(() => readLnd(whole.subarray(0, cut), 'cut.lnd'));
      expect(e.file).toBe('cut.lnd');
      expect(e.reader).toBe('readLnd');
    }
  });
});

// ---- .dyo ---------------------------------------------------------------------------------------------------------

/** The 0xFFFFFFFF type DWORD every shipped `.dyo` ends with: ReadObj makes no object of it, which ends LoadObject's loop. */
const DYO_END = (): Bytes => new Bytes().u32(0xffffffff);

describe('readDyo', () => {
  it('reads records up to the 0xFFFFFFFF that ends the list, and that must be the end of the file', () => {
    const bytes = new Bytes()
      .raw(objBytes({ objType: OT.OBJ, index: 1, pos: [1, 2, 3] }))
      .raw(objBytes({ objType: OT.MOVER, index: 2, extra: moverExtra() }))
      .raw(objBytes({ objType: OT.CTRL, index: 3, extra: ctrlExtra(0x80000000, CTRL_ELEM) }))
      .raw(DYO_END().build())
      .build();
    const records = readDyo(bytes, 'WdTest.dyo');
    expect(records.map((o) => [o.objType, o.index])).toEqual([
      [OT.OBJ, 1],
      [OT.MOVER, 2],
      [OT.CTRL, 3],
    ]);
    expect(records[0].position).toEqual([4, 2, 12]);
  });

  it('a file of only the terminator has no records (the shipped files of worlds without objects)', () => {
    expect(readDyo(DYO_END().build(), 'WdTest.dyo')).toEqual([]);
  });

  it('throws when the file has no terminator, whether it is empty or stops after a record', () => {
    for (const bytes of [new Uint8Array(0), objBytes({ objType: OT.OBJ })]) {
      const e = thrown(() => readDyo(bytes, 'WdTest.dyo'));
      expect(e.file).toBe('WdTest.dyo');
      expect(e.reader).toBe('readDyo');
      expect(e.cppRef).toContain('WorldFile.cpp:297');
      expect(e.message).toContain('0xFFFFFFFF');
      expect(e.offset).toBe(bytes.length);
    }
  });

  it('throws when bytes follow the terminator, which the C++ would never read', () => {
    const bytes = new Bytes().raw(objBytes({ objType: OT.OBJ })).raw(DYO_END().build()).ramp(5).build();
    const e = thrown(() => readDyo(bytes, 'WdTest.dyo'));
    expect(e.message).toContain('5 bytes left');
    expect(e.offset).toBe(BASE_RECORD + 4);
  });

  it('throws on an unknown object type other than the terminator, at the start of its record', () => {
    const bytes = new Bytes().raw(objBytes({ objType: OT.OBJ })).u32(OT.REGION).ramp(10).raw(DYO_END().build()).build();
    const e = thrown(() => readDyo(bytes, 'WdTest.dyo'));
    expect(e.message).toContain('unknown object type 6');
    expect(e.offset).toBe(BASE_RECORD);
  });

  it('throws when the last record is cut short', () => {
    const bytes = new Bytes().raw(objBytes({ objType: OT.OBJ })).raw(objBytes({ objType: OT.OBJ }).subarray(0, 30)).build();
    expect(thrown(() => readDyo(bytes, 'WdTest.dyo')).reader).toBe('readDyo');
  });

  it('throws when 1 to 3 bytes stand where the next type DWORD should be', () => {
    for (const n of [1, 2, 3]) {
      const bytes = new Bytes().raw(objBytes({ objType: OT.OBJ })).ramp(n).build();
      expect(thrown(() => readDyo(bytes, 'WdTest.dyo')).reader).toBe('readDyo');
    }
  });
});
