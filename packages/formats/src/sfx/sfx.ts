// Effect file (`Client/SFX/*.sfx`): the parts of one visual effect and their key frames. Copies CSfxBase::Load
// (Source/_Common/sfxbase.cpp:1719) and, per part type, the part's Load, Load2, Load3 and OldLoad:
//
//   Bill         Load :421   Load2 :456   OldLoad :496
//   Particle     Load :670   Load2 :739   Load3 :813   OldLoad :887
//   Mesh         Load :963   Load2 :998   (no Load3: the inline one is empty, sfxbase.h:206)   OldLoad :1040
//   CustomMesh   Load :1192  Load2 :1228  (same, sfxbase.h:221)   OldLoad :1268
//
// Layout, in the order the C++ reads it:
//
//   char magic[8]                    "SFX0.1  ", "SFX0.2  " or "SFX0.3  "; only the first 6 characters are compared
//                                    (:1729-1731). Anything else is an old file: the loader seeks back to 0 (:1778).
//   int partCount
//   per part:  int type              SFXPARTTYPE: 1 BILL, 2 PARTICLE, 3 MESH, 4 CUSTOMMESH (sfxbase.h:17-22)
//     head, by version:
//       old   str texture            one string is the name and the texture; texFrame = texLoop = 1, using TRUE
//       0.1   str texture;  WORD texFrame, texLoop                                         using TRUE
//       0.2+  str label;  str texture;  WORD texFrame, texLoop;  BOOL using
//     int billType, alphaType        SFXPARTBILLTYPE 1 BILL, 2 BOTTOM, 3 POLE, 4 NORMAL;
//                                    SFXPARTALPHATYPE 1 BLEND, 2 GLOW (sfxbase.h:23-32)
//     PARTICLE only:  the particle block (below)
//     int keyCount;  SfxKeyFrame key[keyCount]
//     CUSTOMMESH only:  int points
//
//   str                              int length, then that many bytes, no terminator (`char strTemp[255]`, with
//                                    `strTemp[length] = 0`: at most 254)
//   SfxKeyFrame                      WORD frame;  D3DXVECTOR3 pos, posRotate, scale, rotate;  int alpha
//
// Particle block (CSfxPartParticle):
//   WORD create, createNum, appear, keep, disappear
//   float startPosVar, startPosVarY, yLow, yHigh, xzLow, xzHigh
//   D3DXVECTOR3 accel, scale, scaleSpeed
//   0.2+ only:  D3DXVECTOR3 rotation, rotationLow, rotationHigh;  BOOL repeatScal;
//               0.3 only:  BOOL repeat;
//               float scalSpeedXLow, XHigh, YLow, YHigh, ZLow, ZHigh;  D3DXVECTOR3 scaleSpeed2, scaleEnd
//   older files leave all of those at zero / FALSE (CSfxPartParticle::Load, OldLoad).
//
// A 0.3 file reads PARTICLE parts with Load3 and every other part with Load2 (:1768-1772); a 0.2 file reads all with
// Load2, a 0.1 file with Load.
//
// The editor label of version 0.2 and up (`m_strName`) is not used by the game, and is CP949 in 140 parts of the
// shipped files, so it is skipped and not decoded. Texture names are the bytes up to the first NUL read as latin1
// (CString does the same with `strTemp`); they keep their case. `rotation` and `scaleSpeed2` are read by the loaders
// and never used by the client (only sfxbase.cpp touches them, and only to load them), so the result leaves them out.
// Vectors are in the file's coordinates, not converted to another handedness here.
//
// Keys: the loaders call AddKeyFrame (:44), which inserts in frame order and ignores a frame that is already there,
// then AdjustKeyFrame (:145), which overwrites the key at that frame with what was read. So the keys come out sorted
// and a repeated frame keeps the last data. The particle loaders read the frame into an `int` but only 2 bytes of it;
// both calls take a WORD, so the frame is the 16 bits read.
//
// The C++ checks almost none of the counts and enums. A part type with no class would use a null part, a string longer
// than the buffer would overflow it, a negative count would read nothing and carry on: all of those are a FormatError
// here, as is a bill or alpha type that is not one of the enum values.

import { BinaryReader } from '../binary/BinaryReader';
import type { Vec3 } from '../binary/BinaryReader';

const READER = 'readSfx';
const CPP_REF = 'Source/_Common/sfxbase.cpp:1719 CSfxBase::Load';

/** The first 6 characters of the 8-byte magic, per version (`strTemp2.Left(6)`). */
const MAGIC: readonly [string, Exclude<SfxVersion, 'old'>][] = [
  ['SFX0.1', '0.1'],
  ['SFX0.2', '0.2'],
  ['SFX0.3', '0.3'],
];
/** Bytes the loader reads for the magic (`file.Read( strTemp, 8 )`). */
const MAGIC_BYTES = 8;

/** SFXPARTTYPE (sfxbase.h:17). */
const PART_BILL = 1;
const PART_PARTICLE = 2;
const PART_MESH = 3;
const PART_CUSTOMMESH = 4;

/** `char strTemp[255]` holds the text and its terminator. */
const STRING_BUFFER = 255;
/** sizeof(SfxKeyFrame) as stored: WORD, four D3DXVECTOR3, int. */
const KEY_BYTES = 2 + 4 * 12 + 4;
/** The fewest bytes a part takes: type, an empty name, bill type, alpha type and key count (an old file's bill). */
const MIN_PART_BYTES = 5 * 4;

export type SfxVersion = 'old' | '0.1' | '0.2' | '0.3';

/** One SfxKeyFrame (sfxbase.h:53). For a CUSTOMMESH part `posRotate` holds the UV parameters and `scale` the radii. */
export interface SfxKey {
  /** WORD nFrame: the frame (game tick) the key sits at. */
  frame: number;
  pos: Vec3;
  /** Degrees; rotates `pos` about the local origin. */
  posRotate: Vec3;
  scale: Vec3;
  /** Degrees. */
  rotate: Vec3;
  /** 0 to 255 (a few shipped keys are above). */
  alpha: number;
}

/** The particle block of a PARTICLE part (CSfxPartParticle, sfxbase.h:142); see the layout above for the versions. */
export interface SfxParticle {
  /** Emit interval in frames (m_nParticleCreate); 0 is a single burst. */
  create: number;
  /** Particles per emission. */
  createNum: number;
  appear: number;
  keep: number;
  disappear: number;
  startPosVar: number;
  startPosVarY: number;
  yLow: number;
  yHigh: number;
  xzLow: number;
  xzHigh: number;
  accel: Vec3;
  scale: Vec3;
  scaleSpeed: Vec3;
  rotationLow: Vec3;
  rotationHigh: Vec3;
  repeatScal: boolean;
  repeat: boolean;
  /** m_fScalSpeedXLow, YLow, ZLow. */
  scaleSpeedLow: Vec3;
  /** m_fScalSpeedXHigh, YHigh, ZHigh. */
  scaleSpeedHigh: Vec3;
  scaleEnd: Vec3;
}

export interface SfxPart {
  /** SFXPARTTYPE: 1 BILL, 2 PARTICLE, 3 MESH, 4 CUSTOMMESH. */
  type: 1 | 2 | 3 | 4;
  /** m_strTex: a texture file name, or for a MESH part the model file name. */
  texture: string;
  /** m_nTexFrame: number of textures of the texture animation (1 when there is none). */
  texFrame: number;
  /** m_nTexLoop: frames one round of the texture animation takes. */
  texLoop: number;
  /** m_bUseing: false parts are not drawn. */
  using: boolean;
  /** SFXPARTBILLTYPE: 1 BILL, 2 BOTTOM, 3 POLE, 4 NORMAL. */
  billType: 1 | 2 | 3 | 4;
  /** SFXPARTALPHATYPE: 1 BLEND, 2 GLOW (additive). */
  alphaType: 1 | 2;
  /** Sorted by frame, one per frame. */
  keys: SfxKey[];
  /** The particle block of a PARTICLE part, else null. */
  particle: SfxParticle | null;
  /** m_nPoints of a CUSTOMMESH part (the ring has `points * 2 + 1` vertex pairs); 0 for the other part types. */
  points: number;
}

export interface SfxFile {
  version: SfxVersion;
  parts: SfxPart[];
}

/** Reads the int length of a `str` and checks it against the C++ buffer; the caller reads or skips the bytes. */
function stringLength(r: BinaryReader, what: string): number {
  const length = r.i32();
  if (length < 0 || length >= STRING_BUFFER) {
    r.fail(`${what}: string length ${length} does not fit the ${STRING_BUFFER}-byte buffer`);
  }
  return length;
}

/** A texture name: the bytes up to the first NUL, as latin1 (they are ASCII in every shipped file). */
function readText(r: BinaryReader, what: string): string {
  return r.fixedString(stringLength(r, what));
}

/** Reads `count` and checks that `count` entries of at least `size` bytes can follow. */
function readCount(r: BinaryReader, what: string, size: number): number {
  const count = r.i32();
  if (count < 0) r.fail(`${what} count ${count} is negative`);
  if (count * size > r.remaining()) {
    r.fail(`${what} count ${count} does not fit in the ${r.remaining()} bytes that remain`);
  }
  return count;
}

/** Reads one SfxKeyFrame, as every part's loaders do (CSfxPartBill::Load2, :456, and the others). */
function readKey(r: BinaryReader): SfxKey {
  return {
    frame: r.u16(),
    pos: r.vec3(),
    posRotate: r.vec3(),
    scale: r.vec3(),
    rotate: r.vec3(),
    alpha: r.i32(),
  };
}

/**
 * Reads the keys of a part, in the order AddKeyFrame / AdjustKeyFrame (sfxbase.cpp:44, :145) leave them: sorted by
 * frame, and a frame that comes again replaces the key already at that frame.
 */
function readKeys(r: BinaryReader, part: number): SfxKey[] {
  const count = readCount(r, `part ${part}: key`, KEY_BYTES);
  const keys: SfxKey[] = [];
  for (let i = 0; i < count; i++) {
    const key = readKey(r);
    let at = keys.length;
    while (at > 0 && keys[at - 1].frame >= key.frame) at--;
    if (at < keys.length && keys[at].frame === key.frame) keys[at] = key;
    else keys.splice(at, 0, key);
  }
  return keys;
}

/** An enum field of a part: the C++ reads any int, but a value outside the enum has no meaning to the renderer. */
function readEnum<T extends number>(r: BinaryReader, part: number, what: string, max: number): T {
  const value = r.i32();
  if (value < 1 || value > max) r.fail(`part ${part}: ${what} ${value} is not between 1 and ${max}`);
  return value as T;
}

/** The particle block of CSfxPartParticle::Load / OldLoad (old, 0.1), Load2 (0.2) and Load3 (0.3), :670-950. */
function readParticle(r: BinaryReader, version: SfxVersion): SfxParticle {
  const create = r.u16();
  const createNum = r.u16();
  const appear = r.u16();
  const keep = r.u16();
  const disappear = r.u16();
  const startPosVar = r.f32();
  const startPosVarY = r.f32();
  const yLow = r.f32();
  const yHigh = r.f32();
  const xzLow = r.f32();
  const xzHigh = r.f32();
  const accel = r.vec3();
  const scale = r.vec3();
  const scaleSpeed = r.vec3();

  const particle: SfxParticle = {
    create,
    createNum,
    appear,
    keep,
    disappear,
    startPosVar,
    startPosVarY,
    yLow,
    yHigh,
    xzLow,
    xzHigh,
    accel,
    scale,
    scaleSpeed,
    rotationLow: [0, 0, 0],
    rotationHigh: [0, 0, 0],
    repeatScal: false,
    repeat: false,
    scaleSpeedLow: [0, 0, 0],
    scaleSpeedHigh: [0, 0, 0],
    scaleEnd: [0, 0, 0],
  };
  if (version === 'old' || version === '0.1') return particle;

  r.vec3(); // m_vRotation: read by Load2 / Load3, never used afterwards
  particle.rotationLow = r.vec3();
  particle.rotationHigh = r.vec3();
  particle.repeatScal = r.i32() !== 0;
  if (version === '0.3') particle.repeat = r.i32() !== 0; // Load2 sets m_bRepeat = FALSE instead
  // m_fScalSpeedXLow, XHigh, YLow, YHigh, ZLow, ZHigh, in that order
  const scaleXLow = r.f32();
  const scaleXHigh = r.f32();
  const scaleYLow = r.f32();
  const scaleYHigh = r.f32();
  const scaleZLow = r.f32();
  const scaleZHigh = r.f32();
  particle.scaleSpeedLow = [scaleXLow, scaleYLow, scaleZLow];
  particle.scaleSpeedHigh = [scaleXHigh, scaleYHigh, scaleZHigh];
  r.vec3(); // m_vScaleSpeed2: read, never used afterwards
  particle.scaleEnd = r.vec3();
  return particle;
}

/** Reads one part: `AddPart( type )`, then the part's loader for the file's version. */
function readPart(r: BinaryReader, version: SfxVersion, index: number): SfxPart {
  const type = r.i32();
  if (type !== PART_BILL && type !== PART_PARTICLE && type !== PART_MESH && type !== PART_CUSTOMMESH) {
    r.fail(`part ${index}: type ${type} is not one of the four part types (1 to 4)`);
  }

  let texture: string;
  let texFrame = 1;
  let texLoop = 1;
  let using = true;
  const what = `part ${index}`;
  if (version === 'old') {
    texture = readText(r, what);
  } else if (version === '0.1') {
    texture = readText(r, what);
    texFrame = r.u16();
    texLoop = r.u16();
  } else {
    r.skip(stringLength(r, `${what} label`));
    texture = readText(r, what);
    texFrame = r.u16();
    texLoop = r.u16();
    using = r.i32() !== 0;
  }
  const billType = readEnum<1 | 2 | 3 | 4>(r, index, 'bill type', 4);
  const alphaType = readEnum<1 | 2>(r, index, 'alpha type', 2);
  const particle = type === PART_PARTICLE ? readParticle(r, version) : null;
  const keys = readKeys(r, index);
  const points = type === PART_CUSTOMMESH ? r.i32() : 0;
  return { type, texture, texFrame, texLoop, using, billType, alphaType, keys, particle, points };
}

/** Reads a whole `.sfx` file; `file` only labels errors. */
export function readSfx(bytes: Uint8Array, file: string): SfxFile {
  const r = new BinaryReader(bytes, { file, reader: READER, cppRef: CPP_REF });

  let version: SfxVersion = 'old';
  for (const [magic, found] of MAGIC) {
    if (bytes.length >= magic.length && [...magic].every((c, i) => bytes[i] === c.charCodeAt(0))) {
      version = found;
      r.skip(MAGIC_BYTES);
      break;
    }
  }

  const partCount = readCount(r, 'part', MIN_PART_BYTES);
  const parts: SfxPart[] = [];
  for (let i = 0; i < partCount; i++) parts.push(readPart(r, version, i));

  r.expectEnd();
  return { version, parts };
}
