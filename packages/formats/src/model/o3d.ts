// Model file (`Client/Model/*.o3d`): character parts, monsters, world objects. Copies CObject3D::LoadObject
// (Source/_Common/Object3D.cpp:913), CObject3D::LoadGMObject (Object3D.cpp:1266) and CObject3D::LoadTMAni
// (Object3D.cpp:1494). Layout, in the order the C++ reads it:
//
//   char nameLength;  char name[nameLength]      each byte XOR 0xcd: the file's own name (64 or more is refused)
//   int version                                  (VER_MESH is 20: older files are refused)
//   int id
//   D3DXVECTOR3 force1, force2;  version 22+: D3DXVECTOR3 force3, force4       (sword-trail points)
//   float scrollU, scrollV;  char reserved[16]
//   D3DXVECTOR3 bbMin, bbMax;  float perSlerp;  int frameCount
//   int eventCount;  D3DXVECTOR3 event[eventCount]                            (m_vEvent holds MAX_MDL_EVENT, 8)
//   int hasCollision;  if set: GMOBJECT body of the collision mesh (below)
//   int lod                                      set: 3 LOD groups follow (high, medium, low), else 1
//   int boneCount;  if above 0: D3DXMATRIX bone[boneCount], inverse[boneCount];
//                               if frameCount > 0: CMotion::ReadTM( boneCount, frameCount )  (readTm, ani.ts)
//                               int sendVS
//   int poolSize                                 GMOBJECTs allocated for the groups together
//   per group: int objectCount;  per object:
//     int type                                   low WORD: GMTYPE (0 normal, 1 skin, 2 bone); bit 31: light
//     int usedBoneCount;  int usedBone[usedBoneCount]                         (m_UseBone holds MAX_VS_BONE, 28)
//     int id;  int parent;  if parent != -1: int parentType                   (0: an object of the group; 2: a bone)
//     D3DXMATRIX localTm                         relative to the parent
//     GMOBJECT body
//     normal objects of a file with frames (LoadTMAni): int hasKeys;  if set: TM_ANIMATION key[frameCount]
//   version 21+: int attributeCount;  if it equals frameCount: MOTION_ATTR attribute[frameCount]
//
// GMOBJECT body (LoadGMObject):
//   D3DXVECTOR3 bbMin, bbMax;  int opacity, bump, rigid;  char reserved[28]
//   int vertexListCount, vertexCount, faceCount, indexCount
//   D3DXVECTOR3 vertexList[vertexListCount]      one per position; the vertex buffer splits them by normal and uv
//   vertex[vertexCount]:  skin: SKINVERTEX { D3DXVECTOR3 pos; float w1, w2; DWORD matIdx; D3DXVECTOR3 normal; tu, tv }
//                         else: NORMALVERTEX { D3DXVECTOR3 pos; D3DXVECTOR3 normal; float tu, tv }
//   WORD index[indexCount];  WORD vertexListIndex[vertexCount]
//   int hasPhysique;  if set: int physique[vertexListCount]
//   int hasMaterial;  if set: int materialCount (a stored 0 reads 1 material);
//                             per material: D3DMATERIAL9;  int nameLength (NUL included);  char name[nameLength]
//   int blockCount (below 32);  MATERIAL_BLOCK block[blockCount]:
//     { int startIndex, primitiveCount, materialId;  DWORD effect;  int amount;  int usedBoneCount;  int usedBone[28] }
//
// The frame-attribute count: 2,810 of the 2,826 version 21 and 22 files end where it would start. LoadObject reads it
// anyway; reading a loose file at its end reads nothing and leaves the count at its initial 0, which equals the frame
// count only when there are no frames, and then no attributes are read either. So a file that ends there has none.
//
// Skin joints (CObject3D::RenderSkin, Object3D.cpp:3025, and the vertex shader in Neuz's WinMain.rc IDR_DATA1):
// matIdx is declared D3DDECLTYPE_SHORT2, so its low and high WORD are the vertex's two blend indices, and the shader
// uses each as `c[a0.x]`, a constant register. Bone matrices are 3 registers apart (`SetVertexShaderConstantF( i * 3,
// ... )`), so register 3n is palette slot n of 28. Slot n first holds bone n of the skeleton, when the skeleton is sent
// at once (CModelObject::Render for a .chr, CObject3D::SetShader for the model's own bones, both when m_bSendVS); then
// RenderSkin overwrites slots 0.. with the object's used-bone list, and before drawing each block, with the block's
// list. `skinJoints` replays that to give each vertex skeleton bone indices. A vertex drawn by several blocks must get
// the same bones from each (else no single pair of joints is right); one that no block draws gets the slots as they
// stand before the first block. Across the client this agrees, for every skin vertex, with the bone the exporter
// recorded in the physique, which CObject3D::IntersectRayTri skins with. A used-bone entry of -1 becomes NO_BONE.
//
// Names (file and texture) are the file's bytes read as latin1. Texture names keep their case (the C++ lowercases
// them). Matrices are 16 floats in file order (D3DXMATRIX memory order), not converted to another handedness here.
//
// The C++ checks almost none of the counts and indices; where a bad one would overrun its buffers or the vertex
// buffer, or leave a vertex without a single bone pair, it is a FormatError here.

import { BinaryReader } from '../binary/BinaryReader';
import type { Vec3 } from '../binary/BinaryReader';
import { readFrameAttributes, readMotionKeys, readTm } from './ani';
import type { BoneTrack, MotionFrameAttribute, MotionKey } from './ani';

const READER = 'readO3d';
const CPP_REF = 'Source/_Common/Object3D.cpp:913 CObject3D::LoadObject';
const GM_CPP_REF = 'Object3D.cpp:1266 CObject3D::LoadGMObject';

/** VER_MESH (Model.h:39): the oldest model version the client reads. */
const MIN_VERSION = 20;
/** The first version with force points 3 and 4 (`nVer >= 22`). */
const FOUR_FORCES_VERSION = 22;
/** The first version that stores frame attributes (`nVer >= 21`). */
const ATTRIBUTES_VERSION = 21;
/** LoadObject refuses a stored name this long or longer (`cLen >= 64`). */
const MAX_NAME_LENGTH = 64;
const NAME_KEY = 0xcd;
/** Bytes skipped after the scroll speeds, and in a GMOBJECT body after its flags. */
const RESERVED_BYTES = 16;
const GM_RESERVED_BYTES = 28;
/** MAX_MDL_EVENT (Bone.h:22). */
const MAX_EVENTS = 8;
/** MAX_GROUP: LOD groups of a model with LOD. */
const LOD_GROUPS = 3;
/** MAX_VS_BONE (Bone.h:7): bone matrices that fit the vertex shader's constant registers. */
const MAX_VS_BONE = 28;
/** Constant registers per bone matrix (a transposed 4x3). */
const REGISTERS_PER_BONE = 3;
/** sizeof(MATERIAL::strBitMapFileName) and of LoadGMObject's szBitmap, NULs included. */
const TEXTURE_NAME_BYTES = 64;
const TEXTURE_BUFFER_BYTES = 256;
/** sizeof(GMOBJECT::m_MaterialAry) / sizeof(MATERIAL). */
const MAX_MATERIALS = 16;
/** LoadGMObject fails at this many material blocks. */
const MAX_BLOCKS = 32;
/** sizeof(SKINVERTEX), sizeof(NORMALVERTEX). */
const SKIN_VERTEX_BYTES = 44;
const NORMAL_VERTEX_BYTES = 32;
/** sizeof(D3DXMATRIX). */
const MATRIX_BYTES = 64;
/** sizeof(D3DMATERIAL9) / sizeof(float): diffuse, ambient, specular, emissive (r, g, b, a each), power. */
const MATERIAL_FLOATS = 17;

/**
 * The `skinJoints` value of a palette slot whose used-bone list entry is -1, a bone the exporter did not have. The
 * C++ then skins with the matrices just before the bone arrays (`pmBonesInv[-1] * pBone[-1]`), which is undefined.
 * One object of the client does this: the low LOD of Part_mJstSet03Upper.o3d, where 13 vertices blend such a slot
 * with a weight above 0 (their physique is -1 too, or the vertex's other bone).
 */
export const NO_BONE = 0xffff;

const GMT_NORMAL = 0;
const GMT_BONE = 2;
const KINDS = ['normal', 'skin', 'bone'] as const;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export type GmObjectKind = (typeof KINDS)[number];

/** A D3DCOLORVALUE: r, g, b, a. */
export type Rgba = [number, number, number, number];

/** One entry of a mesh object's material list (`m_MaterialAry`). */
export interface O3dMaterial {
  /** Texture file name as stored, case kept (the C++ lowercases it); '' when the material has none. */
  texture: string;
  diffuse: Rgba;
  ambient: Rgba;
  specular: Rgba;
  emissive: Rgba;
  power: number;
}

/** A run of triangles drawn with one material (MATERIAL_BLOCK). */
export interface MaterialBlock {
  /** First index (into `indices`) of the run: `DrawIndexedPrimitive`'s StartIndex. */
  startIndex: number;
  /** Triangles in the run, 3 indices each. */
  primitiveCount: number;
  /** Index into the object's `materials` (m_nTextureID). */
  materialId: number;
  /** XE_* render flags (m_dwEffect), e.g. two-sided, opacity, reflection. */
  effect: number;
  /** Opacity (m_nAmount), 0 to 255. */
  amount: number;
  /** Skeleton bones the block's palette slots hold (m_UseBone), -1 for none (see NO_BONE); empty when it sets none. */
  usedBones: number[];
}

/** One mesh object (GMOBJECT). */
export interface GmObject {
  kind: GmObjectKind;
  /** m_nID; -1 for the collision mesh, which stores none. */
  id: number;
  /** Bit 31 of the stored type (m_bLight). */
  light: boolean;
  /** The parent: an object of the same LOD group (parentType 0) or a skeleton bone (parentType 2); -1 for none. */
  parentId: number;
  /** GMT_NORMAL (0) or GMT_BONE (2); -1 when there is no parent (the file then stores no type). */
  parentType: number;
  /** m_mLocalTM, relative to the parent. The collision mesh stores none: identity. */
  transform: Float32Array;
  bbMin: Vec3;
  bbMax: Vec3;
  opacity: boolean;
  bump: boolean;
  rigid: boolean;
  /** Skeleton bones the object's palette slots hold (m_UseBone), -1 for none (see NO_BONE); empty when it sets none. */
  usedBones: number[];
  /** Vertex buffer: 3 floats per vertex. */
  positions: Float32Array;
  /** 3 floats per vertex. */
  normals: Float32Array;
  /** tu, tv per vertex. */
  uvs: Float32Array;
  /** Skin objects: w1, w2 per vertex; null for the others. */
  skinWeights: Float32Array | null;
  /**
   * Skin objects: the two skeleton bone indices each vertex blends (see the top of this file), or NO_BONE where the
   * used-bone list says -1; null for the others.
   */
  skinJoints: Uint16Array | null;
  /** Triangle list, 3 per face, into the vertex buffer. */
  indices: Uint16Array;
  /** m_pVertexList: 3 floats per distinct position. */
  vertexList: Float32Array;
  /** m_pIIB: the vertex-list entry of each vertex. */
  vertexListIndices: Uint16Array;
  /** m_pPhysiqueVertex: one skeleton bone (or -1) per vertex-list entry; null when the object stores none. */
  physique: Int32Array | null;
  materials: O3dMaterial[];
  blocks: MaterialBlock[];
  /** Normal objects of a file with frames: one key (m_pFrame) per frame, or null when the object has none. */
  tmFrames: MotionKey[] | null;
}

export interface O3dModel {
  /** The path given to readO3d. */
  file: string;
  /** The name stored in the file. */
  internalName: string;
  /** Whether the stored name is the file's own (strcmpi); Neuz refuses the file when not (Object3D.cpp:951). */
  nameMatches: boolean;
  version: number;
  id: number;
  /** Sword-trail points m_vForce1..4: 2 before version 22, 4 from then on. */
  forces: Vec3[];
  /** Texture scroll speeds m_fScrlU, m_fScrlV. */
  scrollU: number;
  scrollV: number;
  bbMin: Vec3;
  bbMax: Vec3;
  /** Frames advanced per 60 Hz tick. */
  perSlerp: number;
  /** Frames of the model's own animation (bones or object TM keys); 0 when it has none. */
  frameCount: number;
  events: Vec3[];
  /** The collision mesh, or null when the model has none. */
  collision: GmObject | null;
  /** One list of objects per LOD group: length 1, or 3 (high, medium, low) when the model has LOD. */
  lods: GmObject[][];
  /** The model's own skeleton (m_pBaseBone, m_pBaseBoneInv), or null when it has none. */
  baseBones: { tm: Float32Array; inverseTm: Float32Array }[] | null;
  /** The animation of the model's own skeleton, when it has bones and frames. */
  motion: BoneTrack[] | null;
  /** m_bSendVS of the model's own skeleton; null when it has none. */
  sendVS: boolean | null;
  /** One per frame, when stored (version 21+, attribute count equal to the frame count, and frames). */
  frameAttributes: MotionFrameAttribute[] | null;
}

/** Strcmpi in the C locale folds only ASCII letters. */
const asciiLower = (s: string): string => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
const baseName = (file: string): string => file.replace(/^.*[\\/]/, '');

/** Reads a whole `.o3d` file; `file` labels errors and is compared with the stored name. */
export function readO3d(bytes: Uint8Array, file: string): O3dModel {
  const r = new BinaryReader(bytes, { file, reader: READER, cppRef: CPP_REF });

  const nameLength = r.i8();
  if (nameLength < 0 || nameLength >= MAX_NAME_LENGTH) {
    r.fail(`name length ${nameLength} is not below ${MAX_NAME_LENGTH}`);
  }
  let internalName = '';
  for (const c of r.bytes(nameLength)) {
    const decoded = c ^ NAME_KEY;
    if (decoded === 0) break; // the C++ compares it as a C string
    internalName += String.fromCharCode(decoded);
  }
  const nameMatches = asciiLower(internalName) === asciiLower(baseName(file));

  const version = r.i32();
  if (version < MIN_VERSION) {
    r.fail(`version ${version} is older than the oldest the client reads (${MIN_VERSION})`);
  }
  const id = r.i32();
  const forces = [r.vec3(), r.vec3()];
  if (version >= FOUR_FORCES_VERSION) forces.push(r.vec3(), r.vec3());
  const scrollU = r.f32();
  const scrollV = r.f32();
  r.skip(RESERVED_BYTES);
  const bbMin = r.vec3();
  const bbMax = r.vec3();
  const perSlerp = r.f32();
  const frameCount = r.i32();
  if (frameCount < 0) r.fail(`frame count ${frameCount} is negative`);

  const eventCount = r.i32();
  if (eventCount < 0 || eventCount > MAX_EVENTS) {
    r.fail(`event count ${eventCount} is not between 0 and ${MAX_EVENTS}`);
  }
  const events: Vec3[] = [];
  for (let i = 0; i < eventCount; i++) events.push(r.vec3());

  const collision =
    r.i32() !== 0
      ? readGmBody(r, 'normal', 'collision mesh', {
          id: -1,
          light: false,
          parentId: -1,
          parentType: -1,
          transform: Float32Array.from(IDENTITY),
          usedBones: [],
        })
      : null;
  const groupCount = r.i32() !== 0 ? LOD_GROUPS : 1;

  const boneCount = r.i32();
  let baseBones: O3dModel['baseBones'] = null;
  let motion: BoneTrack[] | null = null;
  let sendVS: boolean | null = null;
  if (boneCount < 0 || boneCount * 2 * MATRIX_BYTES > r.remaining()) {
    r.fail(`bone count ${boneCount} does not fit in the ${r.remaining()} bytes that remain`);
  }
  if (boneCount > 0) {
    const tms: Float32Array[] = [];
    for (let i = 0; i < boneCount; i++) tms.push(r.mat4());
    const inverses: Float32Array[] = [];
    for (let i = 0; i < boneCount; i++) inverses.push(r.mat4());
    baseBones = tms.map((tm, i) => ({ tm, inverseTm: inverses[i] }));
    if (frameCount > 0) motion = readTm(r, boneCount, frameCount);
    sendVS = r.i32() !== 0;
  }

  const poolSize = r.i32();
  let pooled = 0;
  const lods: GmObject[][] = [];
  for (let g = 0; g < groupCount; g++) {
    const objectCount = r.i32();
    if (objectCount < 0) r.fail(`LOD group ${g}: object count ${objectCount} is negative`);
    pooled += objectCount;
    if (pooled > poolSize) r.fail(`LOD group ${g}: ${pooled} objects overflow the pool of ${poolSize}`);
    const group: GmObject[] = [];
    for (let j = 0; j < objectCount; j++) {
      group.push(readObject(r, `LOD group ${g} object ${j}`, objectCount, frameCount));
    }
    lods.push(group);
  }

  let frameAttributes: MotionFrameAttribute[] | null = null;
  // A file that ends before the count has none: see the top of this file.
  if (version >= ATTRIBUTES_VERSION && r.remaining() > 0) {
    const attributeCount = r.i32();
    if (attributeCount === frameCount && frameCount > 0) frameAttributes = readFrameAttributes(r, frameCount);
  }

  r.expectEnd();
  return {
    file,
    internalName,
    nameMatches,
    version,
    id,
    forces,
    scrollU,
    scrollV,
    bbMin,
    bbMax,
    perSlerp,
    frameCount,
    events,
    collision,
    lods,
    baseBones,
    motion,
    sendVS,
    frameAttributes,
  };
}

/** What LoadObject reads around an object's body; the collision mesh gets fixed values instead. */
type ObjectHeader = Pick<GmObject, 'id' | 'light' | 'parentId' | 'parentType' | 'transform' | 'usedBones'>;

/** One object of a LOD group: its header (LoadObject), body (LoadGMObject) and TM keys (LoadTMAni). */
function readObject(r: BinaryReader, where: string, groupSize: number, frameCount: number): GmObject {
  const type = r.u32();
  const kind = KINDS[type & 0xffff];
  if (kind === undefined) r.fail(`${where}: type ${type & 0xffff} is not normal (0), skin (1) or bone (2)`);
  const light = (type & 0x80000000) !== 0;
  const usedBones = readUsedBones(r, r.i32(), 'count', where);
  const id = r.i32();
  const parentId = r.i32();
  let parentType = -1;
  if (parentId !== -1) {
    parentType = r.i32();
    if (parentType === GMT_NORMAL) {
      // the C++ points m_pParent at the group's object of that index
      if (parentId < 0 || parentId >= groupSize) {
        r.fail(`${where}: parent ${parentId} is not one of the ${groupSize} objects of its group`);
      }
    } else if (parentType === GMT_BONE) {
      if (parentId < 0) r.fail(`${where}: parent bone ${parentId} is negative`);
    } else {
      r.fail(`${where}: parent type ${parentType} is not normal (0) or bone (2)`);
    }
  }
  const transform = r.mat4();

  const object = readGmBody(r, kind, where, { id, light, parentId, parentType, transform, usedBones });
  if (kind === 'normal' && frameCount > 0 && r.i32() !== 0) object.tmFrames = readMotionKeys(r, frameCount);
  return object;
}

/**
 * A used-bone list (m_UseBone) of `count` bones. An object stores just those (`stored` 'count'); a block stores the
 * whole MAX_VS_BONE array (`stored` 'all'), of which the rest is unused. Bones must fit `skinJoints` (Uint16Array).
 */
function readUsedBones(r: BinaryReader, count: number, stored: 'count' | 'all', where: string): number[] {
  if (count < 0 || count > MAX_VS_BONE) {
    r.fail(`${where}: ${count} used bones do not fit m_UseBone (${MAX_VS_BONE})`);
  }
  const entries = r.u32Array(stored === 'all' ? MAX_VS_BONE : count);
  const used = Array.from(entries.subarray(0, count), (v) => v | 0);
  const bad = used.find((b) => b < -1 || b >= NO_BONE);
  if (bad !== undefined) r.fail(`${where}: used bone ${bad} is neither a bone index nor -1`);
  return used;
}

/** The part LoadGMObject reads: geometry, physique, materials and blocks. */
function readGmBody(r: BinaryReader, kind: GmObjectKind, where: string, header: ObjectHeader): GmObject {
  const fail = (msg: string): never => r.fail(`${GM_CPP_REF}: ${where}: ${msg}`);

  const bbMin = r.vec3();
  const bbMax = r.vec3();
  const opacity = r.i32() !== 0;
  const bump = r.i32() !== 0;
  const rigid = r.i32() !== 0;
  r.skip(GM_RESERVED_BYTES);
  const listCount = r.i32();
  const vertexCount = r.i32();
  const faceCount = r.i32();
  const indexCount = r.i32();
  if (indexCount !== faceCount * 3) fail(`${indexCount} indices are not 3 for each of the ${faceCount} faces`);

  const vertexList = r.f32Array(listCount * 3);
  const skin = kind === 'skin';
  const raw = r.bytes(vertexCount * (skin ? SKIN_VERTEX_BYTES : NORMAL_VERTEX_BYTES));
  const vertices = splitVertices(raw, vertexCount, skin);

  const indices = r.u16Array(indexCount);
  indices.forEach((v, k) => {
    if (v >= vertexCount) fail(`index ${v} (at ${k}) is not one of the ${vertexCount} vertices`);
  });
  const vertexListIndices = r.u16Array(vertexCount);
  vertexListIndices.forEach((v, k) => {
    if (v >= listCount) fail(`vertex-list index ${v} of vertex ${k} is not one of the ${listCount} entries`);
  });
  const physique = r.i32() !== 0 ? new Int32Array(r.u32Array(listCount).buffer) : null;

  const materials: O3dMaterial[] = [];
  if (r.i32() !== 0) {
    let materialCount = r.i32();
    if (materialCount === 0) materialCount = 1; // as LoadGMObject does
    if (materialCount < 0 || materialCount > MAX_MATERIALS) {
      fail(`${materialCount} materials do not fit m_MaterialAry (${MAX_MATERIALS})`);
    }
    for (let i = 0; i < materialCount; i++) materials.push(readMaterial(r, `material ${i}`, fail));
  }

  const blockCount = r.i32();
  if (blockCount < 0 || blockCount >= MAX_BLOCKS) {
    fail(`${blockCount} material blocks: LoadGMObject takes up to ${MAX_BLOCKS - 1}`);
  }
  const blocks: MaterialBlock[] = [];
  for (let b = 0; b < blockCount; b++) {
    const startIndex = r.i32();
    const primitiveCount = r.i32();
    const materialId = r.i32();
    const effect = r.u32();
    const amount = r.i32();
    const usedBones = readUsedBones(r, r.i32(), 'all', `${where} block ${b}`);
    if (startIndex < 0 || primitiveCount < 0 || startIndex + primitiveCount * 3 > indexCount) {
      fail(`block ${b}: ${primitiveCount} triangles from index ${startIndex} run past the ${indexCount} indices`);
    }
    if (materials.length > 0 && (materialId < 0 || materialId >= materials.length)) {
      fail(`block ${b}: material ${materialId} is not one of the ${materials.length} materials`);
    }
    blocks.push({ startIndex, primitiveCount, materialId, effect, amount, usedBones });
  }

  const skinJoints = skin ? mapSkinJoints(vertices.palette!, indices, header.usedBones, blocks, fail) : null;

  return {
    kind,
    ...header,
    bbMin,
    bbMax,
    opacity,
    bump,
    rigid,
    positions: vertices.positions,
    normals: vertices.normals,
    uvs: vertices.uvs,
    skinWeights: vertices.weights,
    skinJoints,
    indices,
    vertexList,
    vertexListIndices,
    physique,
    materials,
    blocks,
    tmFrames: null,
  };
}

function readMaterial(r: BinaryReader, where: string, fail: (msg: string) => never): O3dMaterial {
  const m = r.f32Array(MATERIAL_FLOATS);
  const nameLength = r.i32();
  // A length of 0 would leave szBitmap holding whatever it held before; above 256 it would overrun szBitmap.
  if (nameLength <= 0 || nameLength > TEXTURE_BUFFER_BYTES) {
    fail(`${where}: texture name length ${nameLength} is not between 1 and ${TEXTURE_BUFFER_BYTES}`);
  }
  const name = r.bytes(nameLength);
  const end = name.indexOf(0);
  if (end < 0) fail(`${where}: texture name has no NUL in its ${nameLength} bytes`);
  if (end + 1 > TEXTURE_NAME_BYTES) {
    fail(`${where}: texture name of ${end} characters does not fit the ${TEXTURE_NAME_BYTES}-byte strBitMapFileName`);
  }
  return {
    texture: String.fromCharCode(...name.subarray(0, end)),
    diffuse: [m[0], m[1], m[2], m[3]],
    ambient: [m[4], m[5], m[6], m[7]],
    specular: [m[8], m[9], m[10], m[11]],
    emissive: [m[12], m[13], m[14], m[15]],
    power: m[16],
  };
}

interface Vertices {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  weights: Float32Array | null;
  /** Skin vertices: the two WORDs of matIdx, constant-register offsets. */
  palette: Uint16Array | null;
}

/** Splits SKINVERTEX or NORMALVERTEX records into one array per attribute. */
function splitVertices(raw: Uint8Array, count: number, skin: boolean): Vertices {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const stride = skin ? SKIN_VERTEX_BYTES : NORMAL_VERTEX_BYTES;
  // offsets within the record (Object3D.h SKINVERTEX / NORMALVERTEX)
  const normalAt = skin ? 24 : 12;
  const uvAt = skin ? 36 : 24;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const weights = skin ? new Float32Array(count * 2) : null;
  const palette = skin ? new Uint16Array(count * 2) : null;
  for (let v = 0; v < count; v++) {
    const at = v * stride;
    for (let k = 0; k < 3; k++) {
      positions[v * 3 + k] = view.getFloat32(at + k * 4, true);
      normals[v * 3 + k] = view.getFloat32(at + normalAt + k * 4, true);
    }
    uvs[v * 2] = view.getFloat32(at + uvAt, true);
    uvs[v * 2 + 1] = view.getFloat32(at + uvAt + 4, true);
    if (weights && palette) {
      weights[v * 2] = view.getFloat32(at + 12, true);
      weights[v * 2 + 1] = view.getFloat32(at + 16, true);
      palette[v * 2] = view.getUint16(at + 20, true);
      palette[v * 2 + 1] = view.getUint16(at + 22, true);
    }
  }
  return { positions, normals, uvs, weights, palette };
}

/**
 * Replays the palette slots as RenderSkin sets them (see the top of this file) to turn each vertex's two register
 * offsets into skeleton bone indices.
 */
function mapSkinJoints(
  palette: Uint16Array,
  indices: Uint16Array,
  objectBones: number[],
  blocks: MaterialBlock[],
  fail: (msg: string) => never,
): Uint16Array {
  const slotOf = new Uint8Array(palette.length);
  palette.forEach((register, k) => {
    if (register % REGISTERS_PER_BONE !== 0 || register >= MAX_VS_BONE * REGISTERS_PER_BONE) {
      fail(`vertex ${k >> 1}: register ${register} does not start one of the ${MAX_VS_BONE} bone matrices`);
    }
    slotOf[k] = register / REGISTERS_PER_BONE;
  });

  const joint = (bone: number): number => (bone === -1 ? NO_BONE : bone);
  const slots = Array.from({ length: MAX_VS_BONE }, (_, i) => i); // a skeleton sent at once
  objectBones.forEach((bone, i) => (slots[i] = joint(bone)));
  const beforeBlocks = [...slots];

  const joints = new Int32Array(palette.length).fill(-1);
  for (const block of blocks) {
    block.usedBones.forEach((bone, i) => (slots[i] = joint(bone)));
    const end = block.startIndex + block.primitiveCount * 3;
    for (let i = block.startIndex; i < end; i++) {
      const v = indices[i];
      for (let k = v * 2; k < v * 2 + 2; k++) {
        const bone = slots[slotOf[k]];
        if (joints[k] === -1) joints[k] = bone;
        else if (joints[k] !== bone) {
          fail(`vertex ${v}: blocks map its palette slot ${slotOf[k]} to bones ${joints[k]} and ${bone}`);
        }
      }
    }
  }
  return Uint16Array.from(joints, (bone, k) => (bone === -1 ? beforeBlocks[slotOf[k]] : bone));
}
