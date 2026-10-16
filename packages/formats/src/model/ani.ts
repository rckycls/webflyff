// Motion file (`Client/Model/*.ani`), copying CMotion::LoadMotion (Source/_Common/Bone.cpp:491) and, for the part
// shared with models that carry their own bone animation, CMotion::ReadTM (Bone.cpp:576). Layout, in the order the
// C++ reads it:
//
//   int version                      (VER_MOTION is 10: any other version is refused)
//   int id
//   float perSlerp                   frames advanced per 60 Hz tick
//   char reserved[32]
//   int boneCount, int frameCount    (frameCount must be above 0)
//   int hasPath;  if set: D3DXVECTOR3 path[frameCount]
//   ReadTM( boneCount, frameCount ):
//     boneCount x { int nameLength (NUL included, at most 32); char name[nameLength];
//                   D3DXMATRIX inverseTm, localTm; int parent }
//     int poolSize                   TM_ANIMATION entries that follow, in all
//     boneCount x { int flag;  flag == 1: TM_ANIMATION key[frameCount]   (D3DXQUATERNION x,y,z,w; D3DXVECTOR3)
//                              else:      D3DXMATRIX defaultTm }
//   MOTION_ATTR attr[frameCount]     { DWORD attr; int soundId; float frame }
//   int eventCount;  if above 0: D3DXVECTOR3 event[eventCount]   (the C++ has room for 4)
//
// CObject3D::LoadObject (Object3D.cpp:1009) calls the same ReadTM for models with a built-in bone animation, so
// `readTm` stops exactly where ReadTM does and leaves what LoadMotion reads around it to `readAni`.
//
// Matrices are returned as 16 floats in file order (D3DXMATRIX memory order), quaternions as x, y, z, w; neither is
// converted to another handedness here. The C++ only logs a frame pool size that does not match the keyed bones,
// but a pool smaller than the keys would overflow its buffer, so any mismatch is a FormatError here.

import { BinaryReader } from '../binary/BinaryReader';
import type { Vec3 } from '../binary/BinaryReader';

const READER = 'readAni';
const CPP_REF = 'Source/_Common/Bone.cpp:491 CMotion::LoadMotion';
const TM_CPP_REF = 'Source/_Common/Bone.cpp:576 CMotion::ReadTM';

/** VER_MOTION (Model.h:40). */
const MOTION_VERSION = 10;
/** sizeof(BONE::m_szName). */
const NAME_BYTES = 32;
/** Bytes between the perSlerp and the bone count (`Seek( 32, SEEK_CUR )`). */
const RESERVED_BYTES = 32;
/** sizeof(CMotion::m_vEvent) / sizeof(D3DXVECTOR3). */
const MAX_EVENTS = 4;
/** sizeof(TM_ANIMATION): quaternion (4 floats) and position (3 floats). */
const KEY_FLOATS = 7;
/** The fewest bytes a bone header can take: nameLength, 2 matrices, parent (the name itself can be empty). */
const MIN_BONE_HEADER_BYTES = 4 + 2 * 64 + 4;
/** Value of a bone's frame flag when it has a key for every frame (`nFrame == 1`). */
const HAS_KEYS = 1;

export interface MotionKey {
  position: Vec3;
  /** Quaternion as x, y, z, w. */
  rotation: [number, number, number, number];
}

/** One bone of a motion: the bone's header, which ReadTM reads first, and its animation. */
export interface BoneTrack {
  /** `m_pBoneInfo[i].m_szName`. */
  name: string;
  /** `m_pBoneInfo[i].m_nParentIdx`: index of the parent bone, or -1 for a root. */
  parent: number;
  /** `m_pBoneInfo[i].m_mInverseTM`. */
  inverseTm: Float32Array;
  /** `m_pBoneInfo[i].m_mLocalTM`. */
  localTm: Float32Array;
  /** One key per frame, or null when the bone is not animated and `defaultTm` applies. */
  keys: MotionKey[] | null;
  /** `m_pBoneFrame[i].m_mLocalTM`: the bone's local TM when it has no keys; null when it has. */
  defaultTm: Float32Array | null;
}

/** One entry of `m_pAttr`, one per frame. */
export interface MotionFrameAttribute {
  /** Flags: MA_HIT 1 (a blow lands), MA_SOUND 2 (a sound plays), MA_QUAKE 4 (the screen shakes). */
  attr: number;
  /** Sound resource id, for MA_SOUND. */
  soundId: number;
  /** Exact (fractional) frame the flags belong to. */
  frame: number;
}

export interface Motion {
  version: number;
  id: number;
  /** Frames advanced per 60 Hz tick; see `motionFps`. */
  perSlerp: number;
  frameCount: number;
  boneCount: number;
  tracks: BoneTrack[];
  /** One per frame. */
  frameAttributes: MotionFrameAttribute[];
  /** The root's position at each frame, for motions that store one. */
  path: Vec3[] | null;
  /** Event points (`m_vEvent`, `m_nMaxEvent` of them, at most 4). */
  events: Vec3[];
}

/**
 * Frames per second a motion plays at in the client. Frames advance by `perSlerp` per tick (Model.cpp:31) at 60
 * ticks a second (FRAME_PER_SEC, timer.h:133), and CModelObject::LoadMotion (ModelObject.cpp:582) first cuts
 * perSlerp to 3 decimals: `(float)((int)(perSlerp * 1000.0f)) / 1000.0f`. That multiplication happens in float,
 * hence the `fround`: a float32 perSlerp of 0.7 is 0.69999998..., and only the rounded product reaches 700.
 */
export function motionFps(perSlerp: number): number {
  return (60 * Math.trunc(Math.fround(perSlerp * 1000))) / 1000;
}

/**
 * Reads what CMotion::ReadTM reads from `r`, which stands just past the path in `readAni` (or past the base bone
 * matrices in a model file): one header and one animation per bone. The reader is left at the byte after the last
 * bone's animation.
 */
export function readTm(r: BinaryReader, boneCount: number, frameCount: number): BoneTrack[] {
  if (boneCount < 0 || frameCount < 0) {
    r.fail(`${TM_CPP_REF}: negative count (${boneCount} bones, ${frameCount} frames)`);
  }
  if (boneCount * MIN_BONE_HEADER_BYTES > r.remaining()) {
    r.fail(`${TM_CPP_REF}: ${boneCount} bone headers do not fit in the ${r.remaining()} bytes that remain`);
  }

  const headers: Pick<BoneTrack, 'name' | 'parent' | 'inverseTm' | 'localTm'>[] = [];
  for (let i = 0; i < boneCount; i++) {
    const nameLength = r.i32();
    if (nameLength < 0 || nameLength > NAME_BYTES) {
      r.fail(`${TM_CPP_REF}: bone ${i}: name length ${nameLength} does not fit the ${NAME_BYTES}-byte name field`);
    }
    const name = r.fixedString(nameLength);
    const inverseTm = r.mat4();
    const localTm = r.mat4();
    const parent = r.i32();
    if (parent < -1 || parent >= boneCount) {
      r.fail(`${TM_CPP_REF}: bone ${i} (${name}): parent ${parent} is not -1 or one of the ${boneCount} bones`);
    }
    headers.push({ name, parent, inverseTm, localTm });
  }

  const poolSize = r.i32();
  const tracks: BoneTrack[] = [];
  let keyedFrames = 0;
  for (let i = 0; i < boneCount; i++) {
    if (r.i32() === HAS_KEYS) {
      const raw = r.f32Array(frameCount * KEY_FLOATS);
      const keys: MotionKey[] = [];
      for (let f = 0; f < frameCount; f++) {
        const at = f * KEY_FLOATS;
        keys.push({
          rotation: [raw[at], raw[at + 1], raw[at + 2], raw[at + 3]],
          position: [raw[at + 4], raw[at + 5], raw[at + 6]],
        });
      }
      keyedFrames += frameCount;
      tracks.push({ ...headers[i], keys, defaultTm: null });
    } else {
      tracks.push({ ...headers[i], keys: null, defaultTm: r.mat4() });
    }
  }
  if (keyedFrames !== poolSize) {
    r.fail(
      `${TM_CPP_REF}: frame pool size ${poolSize} does not match the ${keyedFrames} frames of the bones that have keys`,
    );
  }
  return tracks;
}

/** Reads a whole `.ani` file; `file` only labels errors. */
export function readAni(bytes: Uint8Array, file: string): Motion {
  const r = new BinaryReader(bytes, { file, reader: READER, cppRef: CPP_REF });

  const version = r.i32();
  if (version !== MOTION_VERSION) {
    r.fail(`version ${version} is not the one the client reads (${MOTION_VERSION})`);
  }
  const id = r.i32();
  const perSlerp = r.f32();
  r.skip(RESERVED_BYTES);
  const boneCount = r.i32();
  const frameCount = r.i32();
  if (frameCount <= 0) {
    r.fail(`frame count ${frameCount} is not above 0`);
  }

  let path: Vec3[] | null = null;
  if (r.i32() !== 0) {
    const raw = r.f32Array(frameCount * 3);
    path = [];
    for (let f = 0; f < frameCount; f++) path.push([raw[f * 3], raw[f * 3 + 1], raw[f * 3 + 2]]);
  }

  const tracks = readTm(r, boneCount, frameCount);

  const frameAttributes: MotionFrameAttribute[] = [];
  for (let f = 0; f < frameCount; f++) {
    frameAttributes.push({ attr: r.u32(), soundId: r.i32(), frame: r.f32() });
  }

  const eventCount = r.i32();
  if (eventCount < 0 || eventCount > MAX_EVENTS) {
    r.fail(`event count ${eventCount} is not between 0 and ${MAX_EVENTS}`);
  }
  const events: Vec3[] = [];
  for (let i = 0; i < eventCount; i++) events.push(r.vec3());

  r.expectEnd();
  return { version, id, perSlerp, frameCount, boneCount, tracks, frameAttributes, path, events };
}
