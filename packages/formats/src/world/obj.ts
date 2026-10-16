// World object records, copying ReadObj (Source/_Common/CreateObj.cpp:664) and the Read overrides it reaches:
//
//   CObj::Read         Source/_Common/Obj.cpp:471    every type; the fixed part of the record
//   CCtrl::Read        Source/_Common/Ctrl.cpp:85    OT_SFX, OT_ITEM, OT_SHIP (no Read of their own): just CObj::Read
//   CMover::Read       Source/_Common/Mover.cpp:2896 OT_MOVER: CObj::Read, then names and flags
//   CCommonCtrl::Read  Source/_Common/CommonCtrl.cpp:84 OT_CTRL: CObj::Read, then a version DWORD and a CCtrlElem
//
// and CObj::UpdateLocalMatrix (Source/_Common/Obj.cpp:126) for `objectLocalMatrix`.
//
// A record in a `.lnd` or `.dyo` file is, in file order (all little-endian):
//
//   u32 objType     ReadObj switches on this: OT_OBJ 0, OT_CTRL 2, OT_SFX 3, OT_ITEM 4, OT_MOVER 5, OT_SHIP 7
//   f32 angle       m_fAngle, degrees around Y
//   f32 axis[3]     vAxis: only x (m_fAngX) and z (m_fAngZ) are kept
//   f32 position[3] m_vPos
//   f32 scale[3]    m_vScale
//   u32 type        m_dwType (the same value as objType in every shipped file)
//   u32 index       m_dwIndex: the model/prop id for this type
//   u32 motion      dwMotion (a mover's m_dwMotion)
//   u32 ai          dwAIIntreface
//   u32 ai2         dwAI2
//   ... whatever CMover::Read / CCommonCtrl::Read take (`extraBytes` of them)
//
// Build options assumed, from Source/Neuz/VersionCommon.h: it hard-codes `#define __MAINSERVER` (line 3) and
// `__VER 15` (line 4), so the `#elif defined(__MAINSERVER)` branch (:471) is the one in effect. That branch does
// NOT define __BS_ADDOBJATTR_INVISIBLE (only the __INTERNALSERVER branch, :399, and the __TESTSERVER branch, :463,
// do), so CObj::Read (Obj.cpp:486-498) strips nothing from `type`, which keeps whatever bits the file holds.
// __VER >= 10 and >= 11 hold (CCommonCtrl::Read's 0x90000000 branch, UpdateLocalMatrix's __FIX_ROTATE). Code
// under __WORLDSERVER (CObj::Read's m_vLink and SetAIInterface) is not in the client build. What CMover::Read's
// UpdateParam and CCommonCtrl's CCtrlElem do with their fields is run-time state that no reader here needs.

import type { BinaryReader, Vec3 } from '../binary/BinaryReader';

/** Object types, Resource/define.h:80-89. Only OT_OBJ, OT_CTRL, OT_SFX, OT_ITEM, OT_MOVER and OT_SHIP can be read. */
export const OT = {
  OBJ: 0,
  ANI: 1,
  CTRL: 2,
  SFX: 3,
  ITEM: 4,
  MOVER: 5,
  REGION: 6,
  SHIP: 7,
  PATH: 8,
} as const;

/** `OLD_MPU`, Source/_Common/DefineCommon.cpp:11: CObj::Read multiplies the file's x and z by it (Obj.cpp:522). */
const OLD_MPU = 4;

/**
 * What CMover::Read takes (Mover.cpp:2903-2907): m_szName[MAX_NAME = 64] (Mover.h:32), szDialogFile[32]
 * (MAX_DIALOGFILENAME, Mover.cpp:124), m_szCharacterKey[32], then m_dwBelligerence and dwExtraFlag.
 */
const MOVER_EXTRA_BYTES = 64 + 32 + 32 + 4 + 4;

/** sizeof(CCtrlElem), CommonCtrl.h:15-62 with MAX_JOB = 32 (__VER >= 10); the comment at CommonCtrl.cpp:101 says 432 too. */
const CTRL_ELEM_SIZE = 432;
const CTRL_VERSION_ELEM = 0x80000000;
const CTRL_VERSION_ELEM_16_JOBS = 0x90000000;

/** One placed object, as the C++ holds it right after ReadObj returns (so `position` is already scaled, see below). */
export interface WorldObjectRecord {
  /** The first DWORD, the one ReadObj switches on (an `OT` value). */
  objType: number;
  /** m_fAngle, degrees around Y (the matrix uses its negative). */
  angle: number;
  /** vAxis as stored; CObj::Read keeps only x (m_fAngX) and z (m_fAngZ). */
  axis: Vec3;
  /**
   * m_vPos after CObj::Read: the file's x and z times OLD_MPU (4), y as stored. Still local to the file: a `.lnd`
   * tile adds `tileX * LANDREALSCALE` (= 128 * the world's MPU) to x and `tileY * LANDREALSCALE` to z afterwards
   * (lod.cpp:1358-1359; :1406-1407 for SFX objects), which needs the `.wld`, so readLnd does not.
   */
  position: Vec3;
  scale: Vec3;
  /** m_dwType, as stored (nothing is stripped, see the build options above). */
  type: number;
  /** m_dwIndex. */
  index: number;
  /** dwMotion. */
  motion: number;
  /** dwAIIntreface. */
  ai: number;
  /** dwAI2. */
  ai2: number;
  /**
   * Bytes the type's own Read took after the fixed fields: 0 for OT_OBJ, OT_SFX, OT_ITEM and OT_SHIP; 136 for
   * OT_MOVER; for OT_CTRL the version DWORD plus 432, 368 or 392 bytes of CCtrlElem.
   */
  extraBytes: number;
}

function isReadableType(objType: number): boolean {
  return (
    objType === OT.OBJ ||
    objType === OT.CTRL ||
    objType === OT.SFX ||
    objType === OT.ITEM ||
    objType === OT.MOVER ||
    objType === OT.SHIP
  );
}

/** Everything after the objType DWORD: CObj::Read, then the type's own Read. */
function readRecordBody(r: BinaryReader, objType: number): WorldObjectRecord {
  // CObj::Read, Obj.cpp:471
  const angle = r.f32();
  const axis = r.vec3();
  const [px, py, pz] = r.vec3();
  const scale = r.vec3();
  const type = r.u32();
  const index = r.u32();
  const motion = r.u32();
  const ai = r.u32();
  const ai2 = r.u32();
  // Obj.cpp:522-523, the position code after the AI fields: m_vPos.x *= OLD_MPU; m_vPos.z *= OLD_MPU.
  const position: Vec3 = [px * OLD_MPU, py, pz * OLD_MPU];

  const afterCommon = r.offset;
  if (objType === OT.MOVER) {
    // CMover::Read (Mover.cpp:2896) after CObj::Read: name, dialog file, character key, belligerence, extra flag.
    r.skip(MOVER_EXTRA_BYTES);
  } else if (objType === OT.CTRL) {
    // CCommonCtrl::Read, CommonCtrl.cpp:84-115. The DWORD is a version marker or, in the oldest files, CCtrlElem's
    // own first member (m_dwSet).
    const version = r.u32();
    if (version === CTRL_VERSION_ELEM) {
      r.skip(CTRL_ELEM_SIZE);
    } else if (version === CTRL_VERSION_ELEM_16_JOBS) {
      // __VER >= 10: Read(pCtrlElem, 88), then Read(pCtrlElem + 152, sizeof - 152): the 64 bytes between are the 16
      // job slots that a 16-job file does not have.
      r.skip(88 + (CTRL_ELEM_SIZE - 152));
    } else {
      r.skip(CTRL_ELEM_SIZE - 4 * 10);
    }
  }

  return { objType, angle, axis, position, scale, type, index, motion, ai, ai2, extraBytes: r.offset - afterCommon };
}

/**
 * Reads one record, as ReadObj does. Returns null for an object type ReadObj does not make (anything but OT_OBJ,
 * OT_CTRL, OT_SFX, OT_ITEM, OT_MOVER, OT_SHIP; OT_SFX is made only because the client build has CSfx), after
 * consuming just the type DWORD, like the C++. The caller decides what that means.
 */
export function readObjRecord(r: BinaryReader): WorldObjectRecord | null {
  const objType = r.u32();
  return isReadableType(objType) ? readRecordBody(r, objType) : null;
}

/**
 * readObjRecord for callers that cannot go on after an unknown type: lod.cpp:1355 would use the NULL it gets, and
 * the bytes after it in a `.dyo` are ignored by the C++ but a reader has to account for every byte. Throws a
 * FormatError at the start of the record.
 */
export function readObjRecordOrFail(r: BinaryReader): WorldObjectRecord {
  const start = r.offset;
  const objType = r.u32();
  if (!isReadableType(objType)) {
    r.offset = start;
    r.fail(`unknown object type ${objType} (ReadObj makes no object for it)`);
  }
  return readRecordBody(r, objType);
}

// ---- the local matrix -------------------------------------------------------------------------------------------

type Matrix = Float32Array;

// D3DX matrices: row-major D3DXMATRIX (_11, _12, ... _44), row vectors, left-handed. Every helper stores float32,
// like the D3DXMATRIX it builds.

function matIdentity(): Matrix {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** D3DXMatrixScaling. */
function matScaling(x: number, y: number, z: number): Matrix {
  const m = matIdentity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}

/** D3DXMatrixTranslation. */
function matTranslation(x: number, y: number, z: number): Matrix {
  const m = matIdentity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

/** D3DXMatrixRotationX: _22 = cos, _23 = sin, _32 = -sin, _33 = cos. */
function matRotationX(angle: number): Matrix {
  const [s, c] = [Math.sin(angle), Math.cos(angle)];
  const m = matIdentity();
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

/** D3DXMatrixRotationY: _11 = cos, _13 = -sin, _31 = sin, _33 = cos. */
function matRotationY(angle: number): Matrix {
  const [s, c] = [Math.sin(angle), Math.cos(angle)];
  const m = matIdentity();
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

/** D3DXMatrixRotationZ: _11 = cos, _12 = sin, _21 = -sin, _22 = cos. */
function matRotationZ(angle: number): Matrix {
  const [s, c] = [Math.sin(angle), Math.cos(angle)];
  const m = matIdentity();
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}

/** D3DXMatrixMultiply: `a` is applied first, then `b` (row vectors). */
function matMultiply(a: Matrix, b: Matrix): Matrix {
  const out = new Float32Array(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[row * 4 + k] * b[k * 4 + col];
      out[row * 4 + col] = sum;
    }
  }
  return out;
}

/** D3DXMatrixRotationYawPitchRoll: roll about Z first, then pitch about X, then yaw about Y. */
function matYawPitchRoll(yaw: number, pitch: number, roll: number): Matrix {
  return matMultiply(matMultiply(matRotationZ(roll), matRotationX(pitch)), matRotationY(yaw));
}

/** D3DXToRadian (d3dx9math.h): `degree * (D3DX_PI / 180.0f)`, in float. */
function toRadian(degree: number): number {
  return Math.fround(degree * Math.fround(Math.fround(Math.PI) / 180));
}

/**
 * CObj::m_matWorld as CObj::UpdateLocalMatrix (Obj.cpp:126) and UpdateMatrix (:139) build it: scale * rotation *
 * translation, in that order (D3DXMatrixMultiply, row vectors), as the 16 floats of a D3DXMATRIX in memory order
 * (_11, _12, ... _44; the translation is _41, _42, _43 = elements 12 to 14). Left-handed D3D space, and still
 * local to the tile: add the tile's origin to the translation to get the world position.
 *
 * The rotation is D3DXMatrixRotationYawPitchRoll(yaw = ToRadian(-angle), pitch = ToRadian(-axis.x), roll =
 * ToRadian(axis.z)); the roll is not negated because __VER >= 11 (__FIX_ROTATE), and axis.y is never used.
 */
export function objectLocalMatrix(rec: WorldObjectRecord): Float32Array {
  const scale = matScaling(rec.scale[0], rec.scale[1], rec.scale[2]);
  const rotation = matYawPitchRoll(toRadian(-rec.angle), toRadian(-rec.axis[0]), toRadian(rec.axis[2]));
  const translation = matTranslation(rec.position[0], rec.position[1], rec.position[2]);
  return matMultiply(matMultiply(scale, rotation), translation);
}
