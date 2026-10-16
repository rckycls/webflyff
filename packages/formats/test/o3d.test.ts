import { describe, expect, it } from 'vitest';
import { NO_BONE, readO3d } from '../src/index';
import type { GmObject } from '../src/index';
import { Bytes } from './helpers/bytes';
import { thrown } from './helpers/thrown';

// ---- byte builders: lay out files the way CObject3D::LoadObject / LoadGMObject / LoadTMAni read them ------------

const GMT_NORMAL = 0;
const GMT_SKIN = 1;
const GMT_BONE = 2;

/** 16 floats counting up from `from` (so a matrix read from the wrong place is noticed). */
const matrixFloats = (from: number): number[] => Array.from({ length: 16 }, (_, i) => from + i);

function putFloats(b: Bytes, ...values: number[]): Bytes {
  for (const v of values) b.f32(v);
  return b;
}

function putMatrix(b: Bytes, from: number): Bytes {
  return putFloats(b, ...matrixFloats(from));
}

/** A name field as ReadTM reads it: int length (NUL included), then that many bytes. */
function putName(b: Bytes, name: string): Bytes {
  b.i32(name.length + 1);
  for (let i = 0; i < name.length; i++) b.u8(name.charCodeAt(i));
  return b.u8(0);
}

interface MaterialSpec {
  texture: string;
  /** Stored name length, if not `texture.length + 1`; the bytes written are still the texture and a NUL, padded. */
  storedLength?: number;
}

interface BlockSpec {
  start: number;
  prims: number;
  material?: number;
  effect?: number;
  amount?: number;
  usedBones?: number[];
  /** Stored used-bone count, if not `usedBones.length`. */
  storedBoneCount?: number;
}

/** One skin vertex's blend data: weights and the two constant-register offsets packed in `matIdx`. */
interface SkinSpec {
  w1: number;
  w2: number;
  reg0: number;
  reg1: number;
}

interface GmSpec {
  type?: number;
  light?: boolean;
  usedBones?: number[];
  id?: number;
  parent?: number;
  parentType?: number;
  /** Vertex buffer size; positions etc. are made up from the vertex number. */
  vertices: number;
  /** Vertex list size (defaults to `vertices`). */
  vertexList?: number;
  indices: number[];
  /** Stored face count, if not `indices.length / 3`. */
  faces?: number;
  /** Vertex-list entry of each vertex (defaults to the vertex number). */
  listIndex?: number[];
  /** Per-vertex blend data, for skin objects. */
  skin?: SkinSpec[];
  /** Per-vertex-list-entry bone, or absent for no physique. */
  physique?: number[];
  /** null: the object stores no materials (bIsMaterial 0). */
  materials?: MaterialSpec[] | null;
  /** Stored material count, if not `materials.length`. */
  storedMaterialCount?: number;
  blocks: BlockSpec[];
  /** Normal objects in a file with frames: whether TM keys follow (the flag LoadTMAni reads). */
  tmKeys?: boolean;
}

interface BoneSpec {
  count: number;
  /** The stored m_bSendVS (default 1). ReadTM data follows the matrices when the file has frames. */
  sendVS?: number;
}

interface O3dSpec {
  name?: string;
  version?: number;
  id?: number;
  frameCount?: number;
  events?: number;
  collision?: GmSpec;
  lod?: boolean;
  bones?: BoneSpec;
  /** One list of objects per LOD group (1 group, or 3 with `lod`). */
  groups: GmSpec[][];
  /** Stored pool size, if not the sum of the group sizes. */
  poolSize?: number;
  /**
   * Version 21+: 'absent' ends the file before the attribute count, a number writes that count (and, when it equals
   * the frame count, that many attributes). Defaults to the frame count.
   */
  attributes?: 'absent' | number;
  trailing?: number;
}

function gmBody(b: Bytes, g: GmSpec, type: number): void {
  const listCount = g.vertexList ?? g.vertices;
  b.f32(-1).f32(-2).f32(-3); // bbMin
  b.f32(1).f32(2).f32(3); // bbMax
  b.i32(1).i32(0).i32(1); // opacity, bump, rigid
  b.ramp(28, 50); // reserved
  b.i32(listCount).i32(g.vertices);
  b.i32(g.faces ?? g.indices.length / 3).i32(g.indices.length);
  for (let i = 0; i < listCount; i++) putFloats(b, 1000 + i, 2000 + i, 3000 + i);
  for (let v = 0; v < g.vertices; v++) {
    putFloats(b, v, v + 0.25, v + 0.5); // position
    if (type === GMT_SKIN) {
      const s = g.skin?.[v] ?? { w1: 1, w2: 0, reg0: 0, reg1: 0 };
      b.f32(s.w1).f32(s.w2).u16(s.reg0).u16(s.reg1);
    }
    putFloats(b, 10 + v, 20 + v, 30 + v); // normal
    putFloats(b, v / 10, 1 - v / 10); // uv
  }
  for (const i of g.indices) b.u16(i);
  for (let v = 0; v < g.vertices; v++) b.u16(g.listIndex?.[v] ?? v);
  if (g.physique) {
    b.i32(1);
    for (const p of g.physique) b.i32(p);
  } else {
    b.i32(0);
  }
  if (g.materials === null) {
    b.i32(0);
  } else {
    const materials = g.materials ?? [{ texture: 'Tex.dds' }];
    b.i32(1).i32(g.storedMaterialCount ?? materials.length);
    materials.forEach((m, i) => {
      for (let k = 0; k < 17; k++) b.f32(i * 100 + k); // D3DMATERIAL9: diffuse, ambient, specular, emissive, power
      const length = m.storedLength ?? m.texture.length + 1;
      b.i32(length);
      const text = new Uint8Array(Math.max(length, 0));
      for (let k = 0; k < m.texture.length && k < length; k++) text[k] = m.texture.charCodeAt(k);
      b.raw(text);
    });
  }
  b.i32(g.blocks.length);
  for (const blk of g.blocks) {
    const used = blk.usedBones ?? [];
    b.i32(blk.start).i32(blk.prims).i32(blk.material ?? 0);
    b.u32(blk.effect ?? 0).i32(blk.amount ?? 255).i32(blk.storedBoneCount ?? used.length);
    for (let k = 0; k < 28; k++) b.i32(k < used.length ? used[k] : 0x5a5a);
  }
}

function tmKeys(b: Bytes, frameCount: number, from: number): void {
  for (let f = 0; f < frameCount; f++) {
    putFloats(b, from + f, 0.2, 0.3, 0.4); // quaternion x, y, z, w
    putFloats(b, 10 * from + f, 20, 30); // position
  }
}

function o3dBytes(s: O3dSpec): Uint8Array {
  const name = s.name ?? 'Test.o3d';
  const version = s.version ?? 22;
  const frameCount = s.frameCount ?? 0;
  const b = new Bytes().u8(name.length);
  for (let i = 0; i < name.length; i++) b.u8(name.charCodeAt(i) ^ 0xcd);
  b.i32(version).i32(s.id ?? 77);
  putFloats(b, 1, 2, 3, 4, 5, 6); // force 1, 2
  if (version >= 22) putFloats(b, 7, 8, 9, 10, 11, 12); // force 3, 4
  putFloats(b, 0.5, -0.25); // scroll U, V
  b.ramp(16, 90); // reserved
  putFloats(b, -10, -20, -30, 10, 20, 30); // bbox
  b.f32(0.75).i32(frameCount);
  b.i32(s.events ?? 0);
  for (let i = 0; i < (s.events ?? 0); i++) putFloats(b, i, i + 0.5, i + 0.75);
  if (s.collision) {
    b.i32(1);
    gmBody(b, s.collision, GMT_NORMAL);
  } else {
    b.i32(0);
  }
  b.i32(s.lod ? 1 : 0);
  const boneCount = s.bones?.count ?? 0;
  b.i32(boneCount);
  if (boneCount > 0) {
    for (let i = 0; i < boneCount; i++) putMatrix(b, 100 * i);
    for (let i = 0; i < boneCount; i++) putMatrix(b, 100 * i + 50);
    if (frameCount > 0) {
      // ReadTM: one header per bone, the pool size, then the first bone keyed and the others default matrices
      for (let i = 0; i < boneCount; i++) {
        putName(b, `Bone${i}`);
        putMatrix(b, 5000 + i);
        putMatrix(b, 6000 + i);
        b.i32(i - 1);
      }
      b.i32(frameCount);
      for (let i = 0; i < boneCount; i++) {
        if (i === 0) {
          b.i32(1);
          tmKeys(b, frameCount, 40);
        } else {
          b.i32(0);
          putMatrix(b, 7000 + i);
        }
      }
    }
    b.i32(s.bones?.sendVS ?? 1);
  }
  b.i32(s.poolSize ?? s.groups.reduce((n, g) => n + g.length, 0));
  s.groups.forEach((group, gi) => {
    b.i32(group.length);
    group.forEach((g, oi) => {
      const type = g.type ?? GMT_NORMAL;
      b.u32((type | (g.light ? 0x80000000 : 0)) >>> 0);
      const used = g.usedBones ?? [];
      b.i32(used.length);
      for (const u of used) b.i32(u);
      b.i32(g.id ?? oi).i32(g.parent ?? -1);
      if ((g.parent ?? -1) !== -1) b.i32(g.parentType ?? GMT_NORMAL);
      putMatrix(b, 300 + 20 * oi + 100 * gi);
      gmBody(b, g, type);
      if (type === GMT_NORMAL && frameCount > 0) {
        b.i32(g.tmKeys ? 1 : 0);
        if (g.tmKeys) tmKeys(b, frameCount, oi);
      }
    });
  });
  if (version >= 21 && s.attributes !== 'absent') {
    const count = s.attributes ?? frameCount;
    b.i32(count);
    if (count === frameCount) {
      for (let f = 0; f < frameCount; f++) {
        b.u32(f % 2 ? 2 : 1).i32(100 + f).f32(f + 0.5); // MOTION_ATTR: attr, soundId, frame
      }
    }
  }
  if (s.trailing) b.zeros(s.trailing);
  return b.build();
}

/** A triangle of a normal object, with one material and one block over it. */
const triangle = (extra: Partial<GmSpec> = {}): GmSpec => ({
  vertices: 3,
  indices: [0, 1, 2],
  blocks: [{ start: 0, prims: 1 }],
  ...extra,
});

const floats = (a: ArrayLike<number> | null): number[] => Array.from(a ?? []);
const one = (s: O3dSpec, file = 'Test.o3d') => readO3d(o3dBytes(s), file);
const firstObject = (s: O3dSpec): GmObject => one(s).lods[0][0];
/** The message of the FormatError that reading `s` throws. */
const failure = (s: O3dSpec): string => thrown(() => one(s)).message;

// ---- header ------------------------------------------------------------------------------------------------------

describe('readO3d header', () => {
  it('reads the XOR 0xcd name, version, id, force points, scroll, box, perSlerp and frame count', () => {
    const m = one({ name: 'Obj_Test.o3d', version: 22, groups: [[]] }, 'C:\\x\\Obj_Test.o3d');
    expect(m.file).toBe('C:\\x\\Obj_Test.o3d');
    expect(m.internalName).toBe('Obj_Test.o3d');
    expect(m.version).toBe(22);
    expect(m.id).toBe(77);
    expect(m.forces).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
    ]);
    expect([m.scrollU, m.scrollV]).toEqual([0.5, -0.25]);
    expect(m.bbMin).toEqual([-10, -20, -30]);
    expect(m.bbMax).toEqual([10, 20, 30]);
    expect(m.perSlerp).toBe(0.75);
    expect(m.frameCount).toBe(0);
    expect(m.lods).toEqual([[]]);
    expect(m.collision).toBeNull();
    expect(m.baseBones).toBeNull();
    expect(m.motion).toBeNull();
    expect(m.sendVS).toBeNull();
  });

  it('reads only two force points before version 22', () => {
    const m = one({ version: 21, groups: [[]] });
    expect(m.forces).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it('nameMatches compares the stored name with the file name like strcmpi: any case, path stripped', () => {
    expect(one({ name: 'obj_TEST.O3D', groups: [[]] }, 'some/dir/Obj_Test.o3d').nameMatches).toBe(true);
    expect(one({ name: 'Obj_Test.o3d', groups: [[]] }, 'C:\\dir\\Obj_Test.o3d').nameMatches).toBe(true);
    expect(one({ name: 'Obj_Other.o3d', groups: [[]] }, 'dir/Obj_Test.o3d').nameMatches).toBe(false);
  });

  it('nameMatches folds only ASCII letters, like strcmpi in the C locale', () => {
    expect(one({ name: 'Obj_\u00c0.o3d', groups: [[]] }, 'Obj_\u00e0.o3d').nameMatches).toBe(false);
  });

  it('returns a file whose stored name differs instead of refusing it as Neuz does', () => {
    const m = one({ name: 'Part_fAss01Cap.o3d', groups: [[triangle()]] }, 'Part_fCloSailor01Hat.o3d');
    expect(m.nameMatches).toBe(false);
    expect(m.lods[0]).toHaveLength(1);
  });

  it('refuses a name of 64 characters or more, as LoadObject does', () => {
    const name = `${'a'.repeat(60)}.o3d`;
    expect(failure({ name, groups: [[]] })).toMatch(/name length 64/);
  });

  it('refuses versions older than VER_MESH (20)', () => {
    const e = thrown(() => one({ version: 19, groups: [[]] }));
    expect(e.message).toMatch(/version 19/);
    expect(e.reader).toBe('readO3d');
    expect(e.cppRef).toMatch(/Object3D\.cpp:913/);
  });

  it('reads the event points', () => {
    expect(one({ events: 2, groups: [[]] }).events).toEqual([
      [0, 0.5, 0.75],
      [1, 1.5, 1.75],
    ]);
  });

  it('refuses more event points than m_vEvent holds (8)', () => {
    expect(failure({ events: 9, groups: [[]] })).toMatch(/event count 9/);
  });

  it('fails on bytes after the end', () => {
    expect(failure({ groups: [[]], trailing: 2 })).toMatch(/2 bytes left/);
  });
});

// ---- frame attributes ----------------------------------------------------------------------------------------------

describe('readO3d frame attributes', () => {
  it('reads none in version 20, which does not store them', () => {
    expect(one({ version: 20, frameCount: 2, groups: [[]] }).frameAttributes).toBeNull();
  });

  it('reads them from version 21 when the stored count equals the frame count', () => {
    const m = one({ version: 21, frameCount: 2, groups: [[]] });
    expect(m.frameAttributes).toEqual([
      { attr: 1, soundId: 100, frame: 0.5 },
      { attr: 2, soundId: 101, frame: 1.5 },
    ]);
  });

  it('reads none when the stored count differs from the frame count', () => {
    expect(one({ version: 21, frameCount: 2, attributes: 0, groups: [[]] }).frameAttributes).toBeNull();
  });

  it('reads none for a file without frames (m_pAttr stays NULL)', () => {
    expect(one({ version: 21, frameCount: 0, groups: [[]] }).frameAttributes).toBeNull();
  });

  it('reads none when the file ends before the count, which the C++ reads as its initial 0', () => {
    expect(one({ version: 22, frameCount: 2, attributes: 'absent', groups: [[]] }).frameAttributes).toBeNull();
    expect(one({ version: 22, frameCount: 0, attributes: 'absent', groups: [[]] }).frameAttributes).toBeNull();
  });
});

// ---- geometry ------------------------------------------------------------------------------------------------------

describe('readO3d geometry objects', () => {
  it('reads a normal object: header, transform, vertex buffer, indices, vertex list, material and block', () => {
    const o = firstObject({
      groups: [
        [
          triangle({
            id: 9,
            materials: [{ texture: 'Obj_Tex01.DDS' }],
            blocks: [{ start: 0, prims: 1, effect: 6, amount: 200 }],
          }),
        ],
      ],
    });
    expect(o.kind).toBe('normal');
    expect(o.id).toBe(9);
    expect(o.light).toBe(false);
    expect(o.parentId).toBe(-1);
    expect(o.parentType).toBe(-1);
    expect(floats(o.transform)).toEqual(matrixFloats(300));
    expect(o.bbMin).toEqual([-1, -2, -3]);
    expect(o.bbMax).toEqual([1, 2, 3]);
    expect([o.opacity, o.bump, o.rigid]).toEqual([true, false, true]);
    expect(floats(o.positions)).toEqual([0, 0.25, 0.5, 1, 1.25, 1.5, 2, 2.25, 2.5]);
    expect(floats(o.normals)).toEqual([10, 20, 30, 11, 21, 31, 12, 22, 32]);
    expect(floats(o.uvs)).toEqual([0, 1, 0.1, 0.9, 0.2, 0.8].map(Math.fround));
    expect(floats(o.indices)).toEqual([0, 1, 2]);
    expect(floats(o.vertexList)).toEqual([1000, 2000, 3000, 1001, 2001, 3001, 1002, 2002, 3002]);
    expect(floats(o.vertexListIndices)).toEqual([0, 1, 2]);
    expect(o.physique).toBeNull();
    expect(o.skinWeights).toBeNull();
    expect(o.skinJoints).toBeNull();
    expect(o.usedBones).toEqual([]);
    expect(o.materials).toEqual([
      {
        texture: 'Obj_Tex01.DDS',
        diffuse: [0, 1, 2, 3],
        ambient: [4, 5, 6, 7],
        specular: [8, 9, 10, 11],
        emissive: [12, 13, 14, 15],
        power: 16,
      },
    ]);
    expect(o.blocks).toEqual([
      { startIndex: 0, primitiveCount: 1, materialId: 0, effect: 6, amount: 200, usedBones: [] },
    ]);
    expect(o.tmFrames).toBeNull();
  });

  it('reads the light flag from bit 31 of the type', () => {
    expect(firstObject({ groups: [[triangle({ light: true })]] }).light).toBe(true);
  });

  it('reads a bone-type object with the normal vertex layout', () => {
    const o = firstObject({ groups: [[triangle({ type: GMT_BONE })]] });
    expect(o.kind).toBe('bone');
    expect(floats(o.normals)).toEqual([10, 20, 30, 11, 21, 31, 12, 22, 32]);
  });

  it('refuses an unknown object type', () => {
    expect(failure({ groups: [[triangle({ type: 3 })]] })).toMatch(/type 3/);
  });

  it('reads a parent: an earlier object of the group, or a bone', () => {
    const m = one({
      groups: [
        [triangle(), triangle({ parent: 0, parentType: GMT_NORMAL }), triangle({ parent: 5, parentType: GMT_BONE })],
      ],
    });
    expect(m.lods[0].map((o) => [o.parentId, o.parentType])).toEqual([
      [-1, -1],
      [0, GMT_NORMAL],
      [5, GMT_BONE],
    ]);
  });

  it('refuses a normal parent outside the group and a parent type that is neither normal nor bone', () => {
    expect(failure({ groups: [[triangle({ parent: 1, parentType: GMT_NORMAL })]] })).toMatch(/parent 1/);
    expect(failure({ groups: [[triangle({ parent: 0, parentType: GMT_SKIN })]] })).toMatch(/parent type 1/);
  });

  it('reads the physique: one bone per vertex-list entry', () => {
    const o = firstObject({ groups: [[triangle({ vertexList: 2, listIndex: [0, 1, 1], physique: [4, 7] })]] });
    expect(floats(o.physique)).toEqual([4, 7]);
    expect(floats(o.vertexListIndices)).toEqual([0, 1, 1]);
  });

  it('reads one material when the stored count is 0, as LoadGMObject does', () => {
    const o = firstObject({ groups: [[triangle({ materials: [{ texture: 'a.dds' }], storedMaterialCount: 0 })]] });
    expect(o.materials.map((m) => m.texture)).toEqual(['a.dds']);
  });

  it('reads no materials when the object stores none', () => {
    expect(firstObject({ groups: [[triangle({ materials: null })]] }).materials).toEqual([]);
  });

  it('reads an empty texture name', () => {
    expect(firstObject({ groups: [[triangle({ materials: [{ texture: '' }] })]] }).materials[0].texture).toBe('');
  });

  it('refuses more materials than m_MaterialAry holds (16)', () => {
    const materials = Array.from({ length: 17 }, () => ({ texture: 'a.dds' }));
    expect(failure({ groups: [[triangle({ materials })]] })).toMatch(/17 materials/);
  });

  it('refuses a texture name that does not fit the C++ buffers', () => {
    expect(failure({ groups: [[triangle({ materials: [{ texture: 'a.dds', storedLength: 0 }] })]] })).toMatch(
      /texture name length 0/,
    );
    expect(failure({ groups: [[triangle({ materials: [{ texture: `${'x'.repeat(60)}.dds` }] })]] })).toMatch(/64-byte/);
  });

  it('refuses a block that references a missing material', () => {
    expect(failure({ groups: [[triangle({ blocks: [{ start: 0, prims: 1, material: 1 }] })]] })).toMatch(/material 1/);
  });

  it('refuses 32 blocks or more, where LoadGMObject fails', () => {
    const blocks = Array.from({ length: 32 }, () => ({ start: 0, prims: 1 }));
    expect(failure({ groups: [[triangle({ blocks })]] })).toMatch(/32 material blocks/);
  });

  it('refuses a block that runs past the index buffer', () => {
    expect(failure({ groups: [[triangle({ blocks: [{ start: 3, prims: 1 }] })]] })).toMatch(/block 0/);
  });

  it('refuses an index past the vertex buffer and a vertex-list index past the vertex list', () => {
    expect(failure({ groups: [[triangle({ indices: [0, 1, 3] })]] })).toMatch(/index 3/);
    expect(failure({ groups: [[triangle({ listIndex: [0, 1, 3] })]] })).toMatch(/vertex-list index 3/);
  });

  it('refuses a face count that does not match the index count', () => {
    expect(failure({ groups: [[triangle({ faces: 2 })]] })).toMatch(/2 faces/);
  });

  it('refuses more used bones than MAX_VS_BONE (28)', () => {
    const usedBones = Array.from({ length: 29 }, (_, i) => i);
    expect(failure({ groups: [[triangle({ type: GMT_SKIN, usedBones })]] })).toMatch(/29 used bones/);
    expect(failure({ groups: [[triangle({ blocks: [{ start: 0, prims: 1, storedBoneCount: 29 }] })]] })).toMatch(
      /29 used bones/,
    );
  });
});

// ---- skinning ------------------------------------------------------------------------------------------------------

describe('readO3d skin objects', () => {
  const skinTriangle = (skin: SkinSpec[], extra: Partial<GmSpec> = {}): GmSpec => ({
    type: GMT_SKIN,
    vertices: 3,
    indices: [0, 1, 2],
    skin,
    physique: [0, 0, 0],
    blocks: [{ start: 0, prims: 1 }],
    ...extra,
  });
  // matIdx holds constant-register offsets: palette slot n is register 3n (SetVertexShaderConstantF( i * 3, ... ))
  const slots = (a: number, b: number, w1 = 0.75): SkinSpec => ({ w1, w2: 1 - w1, reg0: 3 * a, reg1: 3 * b });

  it('reads the weights and maps palette slots through the object used-bone list', () => {
    const o = firstObject({
      groups: [[skinTriangle([slots(0, 1), slots(1, 2), slots(2, 0, 1)], { usedBones: [10, 20, 30] })]],
    });
    expect(o.kind).toBe('skin');
    expect(floats(o.skinWeights)).toEqual([0.75, 0.25, 0.75, 0.25, 1, 0]);
    expect(floats(o.skinJoints)).toEqual([10, 20, 20, 30, 30, 10]);
    expect(o.usedBones).toEqual([10, 20, 30]);
    expect(floats(o.positions)).toEqual([0, 0.25, 0.5, 1, 1.25, 1.5, 2, 2.25, 2.5]);
    expect(floats(o.normals)).toEqual([10, 20, 30, 11, 21, 31, 12, 22, 32]);
  });

  it('maps palette slots through the used-bone list of the block that draws the vertex', () => {
    const o = firstObject({
      groups: [
        [
          {
            type: GMT_SKIN,
            vertices: 4,
            indices: [0, 1, 2, 1, 3, 2],
            skin: [slots(0, 0), slots(1, 1), slots(0, 1), slots(1, 1)],
            physique: [0, 0, 0, 0],
            materials: [{ texture: 'a.dds' }, { texture: 'b.dds' }],
            blocks: [
              { start: 0, prims: 1, usedBones: [5, 6] },
              // vertices 1 and 2 again: slot 1 resolves to 6 as before, slot 0 (vertex 2's first) to 5 as before
              { start: 3, prims: 1, material: 1, usedBones: [5, 6, 7] },
            ],
          },
        ],
      ],
    });
    expect(floats(o.skinJoints)).toEqual([5, 5, 6, 6, 5, 6, 6, 6]);
    expect(o.blocks.map((b) => b.usedBones)).toEqual([
      [5, 6],
      [5, 6, 7],
    ]);
  });

  it('a block list replaces the slots it covers and leaves the others as the object list set them', () => {
    const o = firstObject({
      groups: [
        [
          skinTriangle([slots(0, 2), slots(1, 2), slots(2, 2)], {
            usedBones: [10, 20, 30],
            blocks: [{ start: 0, prims: 1, usedBones: [8] }],
          }),
        ],
      ],
    });
    expect(floats(o.skinJoints)).toEqual([8, 30, 20, 30, 30, 30]);
  });

  it('slots no list sets are the skeleton bones of the same number (a skeleton sent at once, m_bSendVS)', () => {
    const o = firstObject({ groups: [[skinTriangle([slots(0, 4), slots(12, 3), slots(27, 0)])]] });
    expect(floats(o.skinJoints)).toEqual([0, 4, 12, 3, 27, 0]);
  });

  it('maps a vertex no block draws through the slots as they stand before the first block', () => {
    const o = firstObject({
      groups: [
        [
          skinTriangle([slots(0, 1), slots(1, 0), slots(0, 0), slots(1, 1)], {
            vertices: 4,
            physique: [0, 0, 0, 0],
            usedBones: [3, 4],
            blocks: [{ start: 0, prims: 1, usedBones: [8, 9] }],
          }),
        ],
      ],
    });
    expect(floats(o.skinJoints)).toEqual([8, 9, 9, 8, 8, 8, 4, 4]);
  });

  it('maps a used bone of -1 (the exporter had no bone) to NO_BONE, keeping -1 in the list', () => {
    const o = firstObject({
      groups: [[skinTriangle([slots(0, 1), slots(1, 1), slots(1, 0)], { usedBones: [-1, 7] })]],
    });
    expect(floats(o.skinJoints)).toEqual([NO_BONE, 7, 7, 7, 7, NO_BONE]);
    expect(o.usedBones).toEqual([-1, 7]);
  });

  it('refuses a used bone below -1', () => {
    const triangleTo = (usedBones: number[]) => skinTriangle([slots(0, 0), slots(0, 0), slots(0, 0)], { usedBones });
    expect(failure({ groups: [[triangleTo([-2])]] })).toMatch(/used bone -2/);
  });

  it('refuses a vertex whose slot resolves to different bones in two blocks', () => {
    const e = thrown(() =>
      one({
        groups: [
          [
            {
              type: GMT_SKIN,
              vertices: 3,
              indices: [0, 1, 2, 0, 1, 2],
              skin: [slots(0, 0), slots(0, 0), slots(0, 0)],
              physique: [0, 0, 0],
              blocks: [
                { start: 0, prims: 1, usedBones: [5] },
                { start: 3, prims: 1, usedBones: [6] },
              ],
            },
          ],
        ],
      }),
    );
    expect(e.message).toMatch(/vertex 0/);
  });

  it('refuses a register offset that is not a palette slot', () => {
    const notASlot = { w1: 1, w2: 0, reg0: 4, reg1: 0 };
    expect(failure({ groups: [[skinTriangle([slots(0, 0), notASlot, slots(0, 0)])]] })).toMatch(/register 4/);
    expect(failure({ groups: [[skinTriangle([slots(0, 0), slots(28, 0), slots(0, 0)])]] })).toMatch(/register 84/);
  });
});

// ---- model-level structure -------------------------------------------------------------------------------------

describe('readO3d structure', () => {
  it('reads the collision mesh: geometry only, no header, transform or animation', () => {
    const m = one({ collision: triangle({ materials: null }), groups: [[triangle()]] });
    const c = m.collision!;
    expect(c.kind).toBe('normal');
    expect([c.id, c.parentId, c.parentType]).toEqual([-1, -1, -1]);
    expect(floats(c.transform)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(floats(c.indices)).toEqual([0, 1, 2]);
    expect(m.lods[0]).toHaveLength(1);
  });

  it('reads three LOD groups when the LOD flag is set', () => {
    const m = one({ lod: true, groups: [[triangle(), triangle()], [triangle()], [triangle()]] });
    expect(m.lods.map((g) => g.length)).toEqual([2, 1, 1]);
    expect(floats(m.lods[1][0].transform)).toEqual(matrixFloats(400));
    expect(floats(m.lods[2][0].transform)).toEqual(matrixFloats(500));
  });

  it('refuses groups with more objects than the pool size', () => {
    const groups = [[triangle(), triangle()], [triangle()], [triangle()]];
    expect(failure({ lod: true, poolSize: 3, groups })).toMatch(/pool/);
  });

  it('reads the base bones, their inverses and the send-at-once flag', () => {
    const m = one({ bones: { count: 2, sendVS: 0 }, groups: [[]] });
    expect(m.baseBones!.map((b) => [floats(b.tm)[0], floats(b.inverseTm)[0]])).toEqual([
      [0, 50],
      [100, 150],
    ]);
    expect(m.sendVS).toBe(false);
    expect(m.motion).toBeNull();
  });

  it('reads the built-in bone animation with ReadTM when the model has bones and frames', () => {
    const m = one({ frameCount: 2, bones: { count: 2 }, groups: [[]] });
    expect(m.sendVS).toBe(true);
    expect(m.motion!.map((t) => [t.name, t.parent, t.keys?.length ?? null])).toEqual([
      ['Bone0', -1, 2],
      ['Bone1', 0, null],
    ]);
    expect(m.motion![0].keys![1]).toEqual({ rotation: [41, 0.2, 0.3, 0.4].map(Math.fround), position: [401, 20, 30] });
  });

  it('reads TM keys for normal objects of a file with frames, when their flag is set', () => {
    const m = one({ frameCount: 2, groups: [[triangle({ tmKeys: true }), triangle({ tmKeys: false })]] });
    expect(m.lods[0][0].tmFrames).toEqual([
      { rotation: [0, 0.2, 0.3, 0.4].map(Math.fround), position: [0, 20, 30] },
      { rotation: [1, 0.2, 0.3, 0.4].map(Math.fround), position: [1, 20, 30] },
    ]);
    expect(m.lods[0][1].tmFrames).toBeNull();
  });

  it('reads no TM flag for skin objects of a file with frames', () => {
    const m = one({
      frameCount: 2,
      groups: [[triangle({ type: GMT_SKIN, physique: [0, 0, 0] })]],
    });
    expect(m.lods[0][0].tmFrames).toBeNull();
  });

  it('every error names the file, the offset and the C++ function', () => {
    const e = thrown(() => one({ groups: [[triangle({ type: 3 })]] }, 'Model/x.o3d'));
    expect(e.file).toBe('Model/x.o3d');
    expect(e.offset).toBeGreaterThan(0);
    expect(e.reader).toBe('readO3d');
  });
});
