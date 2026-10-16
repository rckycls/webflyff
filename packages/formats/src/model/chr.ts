// Skeleton file (`Client/Model/*.chr`), copying CBones::LoadBone (Source/_Common/Bone.cpp:76). Layout, in the order
// the C++ reads it:
//
//   int version                      (VER_BONE is 4: older files are refused)
//   int id
//   int boneCount
//   boneCount x { int nameLength (NUL included); char name[nameLength];
//                 D3DXMATRIX tm, inverseTm, localTm; int parent }
//   int sendVS
//   D3DXMATRIX localRH, localShield, localKnuckle
//   version 5:   D3DXVECTOR3 event[4];  int eventParent[4]
//   version 6+:  D3DXVECTOR3 event[8];  int eventParent[8]     (MAX_MDL_EVENT)
//   version 7:   D3DXMATRIX localLH
//
// A version above 7 reads like 7 but without localLH (the C++ tests `nVer == 7`). Matrices are returned as 16 floats
// in file order (D3DXMATRIX memory order) and are not converted to another handedness here.
//
// The BONE struct stores the name in char[32], which bounds nameLength; the parent is stored as a pointer into the
// bone array, which bounds it to -1 or a bone of the list. The C++ checks neither, so here both are FormatErrors.
//
// Names are the file's bytes read as latin1 (BinaryReader.fixedString), not decoded from CP949. Two bones of
// mvr_CrownBubble have Korean in their names, which therefore look garbled, but readAni reads them the same way,
// so a skeleton and its motions still agree on every name.

import { BinaryReader } from '../binary/BinaryReader';
import type { Vec3 } from '../binary/BinaryReader';

const READER = 'readChr';
const CPP_REF = 'Source/_Common/Bone.cpp:76 CBones::LoadBone';

/** VER_BONE (Model.h:38): the oldest skeleton version the client reads. */
const MIN_VERSION = 4;
/** sizeof(BONE::m_szName). */
const NAME_BYTES = 32;
/** The fewest bytes a bone can take: nameLength, 3 matrices, parent (the name itself can be empty). */
const MIN_BONE_BYTES = 4 + 3 * 64 + 4;
/** How many characters the bone name must be preceded by for the hand and forearm checks (`"Bip01 "`). */
const NAME_PREFIX = 6;

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export interface Bone {
  name: string;
  /** Index of the parent bone, or -1 for a root. */
  parent: number;
  /** World (object) TM: the bone's bind pose. */
  tm: Float32Array;
  /** Inverse of the node TM, for skinning. */
  inverseTm: Float32Array;
  localTm: Float32Array;
}

export interface Skeleton {
  version: number;
  id: number;
  bones: Bone[];
  /** `m_bSendVS`: the bones fit the vertex shader's constant registers (MAX_VS_BONE, 28), so they are sent at once. */
  sendVS: boolean;
  /** Weapon grip matrices (`m_mLocalRH`, `m_mLocalShield`, `m_mLocalKnuckle`). */
  localRH: Float32Array;
  localShield: Float32Array;
  localKnuckle: Float32Array;
  /** `m_mLocalLH`. Only version 7 files store it; any other version gets the identity, the C++ default. */
  localLH: Float32Array;
  /** Event points (`m_vEvent`): none in version 4, 4 in version 5, 8 from version 6 on. */
  events: Vec3[];
  /** Bone each event point is relative to (`m_nEventParentIdx`); same length as `events`. */
  eventParents: number[];
  /**
   * Index of the last bone whose name, after its first 6 characters, is "R Hand" / "L Hand" / "R ForeArm" /
   * "L ForeArm" (any case). Like the C++ (CBones::Init), 0 when no bone matches.
   */
  rHandIdx: number;
  lHandIdx: number;
  rArmIdx: number;
  lArmIdx: number;
}

/** Reads a whole `.chr` file; `file` only labels errors. */
export function readChr(bytes: Uint8Array, file: string): Skeleton {
  const r = new BinaryReader(bytes, { file, reader: READER, cppRef: CPP_REF });

  const version = r.i32();
  if (version < MIN_VERSION) {
    r.fail(`version ${version} is older than the oldest the client reads (${MIN_VERSION})`);
  }
  const id = r.i32();
  const boneCount = r.i32();
  if (boneCount < 0 || boneCount * MIN_BONE_BYTES > r.remaining()) {
    r.fail(`bone count ${boneCount} does not fit in the ${r.remaining()} bytes that remain`);
  }

  const bones: Bone[] = [];
  let rHandIdx = 0;
  let lHandIdx = 0;
  let rArmIdx = 0;
  let lArmIdx = 0;
  for (let i = 0; i < boneCount; i++) {
    const nameLength = r.i32();
    if (nameLength < 0 || nameLength > NAME_BYTES) {
      r.fail(`bone ${i}: name length ${nameLength} does not fit the ${NAME_BYTES}-byte name field`);
    }
    const name = r.fixedString(nameLength);
    const tm = r.mat4();
    const inverseTm = r.mat4();
    const localTm = r.mat4();
    const parent = r.i32();
    if (parent < -1 || parent >= boneCount) {
      r.fail(`bone ${i} (${name}): parent ${parent} is not -1 or one of the ${boneCount} bones`);
    }
    bones.push({ name, parent, tm, inverseTm, localTm });

    // strcmpi( m_szName + 6, ... ): the part of the name after "Bip01 "
    const part = name.slice(NAME_PREFIX).toLowerCase();
    if (part === 'r hand') rHandIdx = i;
    if (part === 'l hand') lHandIdx = i;
    if (part === 'l forearm') lArmIdx = i;
    if (part === 'r forearm') rArmIdx = i;
  }

  const sendVS = r.i32() !== 0;
  const localRH = r.mat4();
  const localShield = r.mat4();
  const localKnuckle = r.mat4();

  const events: Vec3[] = [];
  const eventParents: number[] = [];
  if (version >= 5) {
    const eventCount = version === 5 ? 4 : 8;
    for (let i = 0; i < eventCount; i++) events.push(r.vec3());
    for (let i = 0; i < eventCount; i++) eventParents.push(r.i32());
  }
  const localLH = version === 7 ? r.mat4() : Float32Array.from(IDENTITY);

  r.expectEnd();
  return {
    version,
    id,
    bones,
    sendVS,
    localRH,
    localShield,
    localKnuckle,
    localLH,
    events,
    eventParents,
    rHandIdx,
    lHandIdx,
    rArmIdx,
    lArmIdx,
  };
}
