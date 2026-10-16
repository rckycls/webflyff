import { describe, expect, it } from 'vitest';
import { BinaryReader, motionFps, readAni, readChr, readTm } from '../src/index';
import { Bytes } from './helpers/bytes';
import { thrown } from './helpers/thrown';

// ---- byte builders: lay out files the way CBones::LoadBone / CMotion::LoadMotion read them ----------------------

/** 16 floats counting up from `from` (so a matrix read from the wrong place is noticed). */
const matrixFloats = (from: number): number[] => Array.from({ length: 16 }, (_, i) => from + i);

function putMatrix(b: Bytes, from: number): Bytes {
  for (const v of matrixFloats(from)) b.f32(v);
  return b;
}

/** A name field as the files store it: int length (NUL included), then that many bytes. */
function putName(b: Bytes, name: string): Bytes {
  b.i32(name.length + 1);
  for (let i = 0; i < name.length; i++) b.u8(name.charCodeAt(i));
  return b.u8(0);
}

interface BoneSpec {
  name: string;
  parent: number;
}

interface ChrSpec {
  version: number;
  id?: number;
  bones: BoneSpec[];
  sendVS?: number;
  /** Events and their parent indices, as many as the version stores (5: 4, 6 and up: 8). */
  eventCount?: number;
  /** Bytes after the last field the version reads. */
  trailing?: number;
}

function chrBytes(s: ChrSpec): Uint8Array {
  const b = new Bytes().i32(s.version).i32(s.id ?? 0).i32(s.bones.length);
  s.bones.forEach((bone, i) => {
    putName(b, bone.name);
    putMatrix(b, 100 * (i + 1)); // tm
    putMatrix(b, 100 * (i + 1) + 16); // inverse tm
    putMatrix(b, 100 * (i + 1) + 32); // local tm
    b.i32(bone.parent);
  });
  b.i32(s.sendVS ?? 1);
  putMatrix(b, 1000); // right hand
  putMatrix(b, 2000); // shield
  putMatrix(b, 3000); // knuckle
  if (s.version === 5 || s.version >= 6) {
    const n = s.version === 5 ? 4 : 8;
    for (let i = 0; i < n; i++) b.f32(10 * i).f32(10 * i + 1).f32(10 * i + 2);
    for (let i = 0; i < n; i++) b.i32(i);
  }
  if (s.version === 7) putMatrix(b, 4000); // left hand
  if (s.trailing) b.zeros(s.trailing);
  return b.build();
}

interface TrackSpec {
  name: string;
  parent: number;
  /** Number of frames to write keys for (the file's own `nFrame == 1` case), or absent for a default matrix. */
  keyed?: boolean;
}

/** What ReadTM reads: per-bone header, the pool size, then per bone a flag and either its keys or a matrix. */
function tmBytes(tracks: TrackSpec[], frameCount: number, poolOverride?: number): Uint8Array {
  const b = new Bytes();
  tracks.forEach((t, i) => {
    putName(b, t.name);
    putMatrix(b, 100 * i + 16); // inverse tm
    putMatrix(b, 100 * i + 32); // local tm
    b.i32(t.parent);
  });
  const keyedCount = tracks.filter((t) => t.keyed).length;
  b.i32(poolOverride ?? keyedCount * frameCount);
  tracks.forEach((t, i) => {
    if (t.keyed) {
      b.i32(1);
      for (let f = 0; f < frameCount; f++) {
        // D3DXQUATERNION x, y, z, w, then D3DXVECTOR3
        b.f32(0.1 * i + f).f32(0.2).f32(0.3).f32(0.4);
        b.f32(10 * i + f).f32(20 + f).f32(30);
      }
    } else {
      b.i32(0);
      putMatrix(b, 500 + 100 * i);
    }
  });
  return b.build();
}

interface AniSpec {
  version?: number;
  id?: number;
  perSlerp?: number;
  tracks: TrackSpec[];
  frameCount: number;
  path?: boolean;
  /** Event count to store; its coordinates follow. */
  eventCount?: number;
  trailing?: number;
  poolOverride?: number;
}

function aniBytes(s: AniSpec): Uint8Array {
  const b = new Bytes()
    .i32(s.version ?? 10)
    .i32(s.id ?? 7)
    .f32(s.perSlerp ?? 0.5)
    .ramp(32, 200) // reserved
    .i32(s.tracks.length)
    .i32(s.frameCount)
    .i32(s.path ? 1 : 0);
  if (s.path) for (let f = 0; f < s.frameCount; f++) b.f32(f).f32(f + 0.25).f32(f + 0.5);
  b.raw(tmBytes(s.tracks, s.frameCount, s.poolOverride));
  for (let f = 0; f < s.frameCount; f++) b.u32(f % 2 ? 0x2 : 0x5).i32(100 + f).f32(f + 0.5); // MOTION_ATTR
  b.i32(s.eventCount ?? 0);
  for (let i = 0; i < (s.eventCount ?? 0); i++) b.f32(i).f32(i + 0.5).f32(i + 0.75);
  if (s.trailing) b.zeros(s.trailing);
  return b.build();
}

const ctx = { file: 'test.ani', reader: 'readTm', cppRef: 'CMotion::ReadTM' };
const sameFloats = (a: Float32Array, expected: number[]): void => {
  expect(Array.from(a)).toEqual(expected);
};

// ---- motionFps -------------------------------------------------------------------------------------------------

describe('motionFps', () => {
  it('is 60 ticks a second times perSlerp', () => {
    expect(motionFps(0.5)).toBe(30);
    expect(motionFps(1)).toBe(60);
  });

  it('truncates perSlerp to 3 decimals, as CModelObject::LoadMotion does', () => {
    expect(motionFps(0.4567)).toBeCloseTo(27.36, 10);
    expect(motionFps(0.9999)).toBeCloseTo(59.94, 10);
  });

  it('truncates the way the C++ float arithmetic does for the float32 values stored in files', () => {
    // Float32 0.7 is 0.69999998807...; in double arithmetic 0.7f * 1000 would truncate to 699, in float to 700.
    expect(motionFps(Math.fround(0.7))).toBeCloseTo(42, 10);
    expect(motionFps(Math.fround(0.35))).toBeCloseTo(21, 10);
  });
});

// ---- readTm ----------------------------------------------------------------------------------------------------

describe('readTm', () => {
  const tracks: TrackSpec[] = [
    { name: 'Bip01', parent: -1, keyed: true },
    { name: 'Bip01 Pelvis', parent: 0 },
    { name: 'Bip01 Spine', parent: 1, keyed: true },
  ];

  it('reads the bone headers, then keys for the bones that have them and a default matrix for the others', () => {
    const bytes = tmBytes(tracks, 2);
    const r = new BinaryReader(bytes, ctx);
    const out = readTm(r, 3, 2);

    expect(out.map((t) => [t.name, t.parent])).toEqual([
      ['Bip01', -1],
      ['Bip01 Pelvis', 0],
      ['Bip01 Spine', 1],
    ]);
    sameFloats(out[1].inverseTm, matrixFloats(116));
    sameFloats(out[1].localTm, matrixFloats(132));

    expect(out[0].defaultTm).toBeNull();
    expect(out[0].keys).toHaveLength(2);
    // x, y, z, w then position; frame 1 of bone 0
    expect(out[0].keys![1].rotation.map((v) => Number(v.toFixed(4)))).toEqual([1, 0.2, 0.3, 0.4]);
    expect(out[0].keys![1].position).toEqual([1, 21, 30]);

    expect(out[1].keys).toBeNull();
    sameFloats(out[1].defaultTm!, matrixFloats(600));

    expect(out[2].keys![0].position).toEqual([20, 20, 30]);
    expect(r.remaining()).toBe(0);
  });

  it('consumes exactly what ReadTM does and nothing after it', () => {
    const tail = [0xde, 0xad, 0xbe, 0xef];
    const bytes = new Bytes().raw(tmBytes(tracks, 2)).raw(new Uint8Array(tail)).build();
    const r = new BinaryReader(bytes, ctx);
    readTm(r, 3, 2);
    expect(r.remaining()).toBe(4);
    expect(r.u32()).toBe(0xefbeadde);
  });

  it('copies matrices out of the input buffer', () => {
    const bytes = tmBytes(tracks, 2);
    const out = readTm(new BinaryReader(bytes, ctx), 3, 2);
    bytes.fill(0);
    expect(out[1].defaultTm![0]).toBe(500 + 100);
  });

  it('reads no tracks for no bones', () => {
    const r = new BinaryReader(new Bytes().i32(0).build(), ctx);
    expect(readTm(r, 0, 5)).toEqual([]);
    expect(r.remaining()).toBe(0);
  });

  it('treats any frame flag other than 1 as "no keys, default matrix", as ReadTM does', () => {
    const b = new Bytes();
    putName(b, 'Bip01');
    putMatrix(b, 0);
    putMatrix(b, 16);
    b.i32(-1).i32(0).i32(5);
    putMatrix(b, 900);
    const out = readTm(new BinaryReader(b.build(), ctx), 1, 3);
    expect(out[0].keys).toBeNull();
    sameFloats(out[0].defaultTm!, matrixFloats(900));
  });

  it('fails when the pool size disagrees with the frames the bones have', () => {
    for (const pool of [1, 3, 5]) {
      const e = thrown(() => readTm(new BinaryReader(tmBytes(tracks, 2, pool), ctx), 3, 2));
      expect(e.message).toMatch(/frame/);
    }
  });

  it('fails on a bone name longer than the 32 bytes the C++ stores', () => {
    const b = new Bytes();
    b.i32(33).zeros(33 + 2 * 64 + 4 + 4 + 64); // a whole bone, so only the name is wrong
    const e = thrown(() => readTm(new BinaryReader(b.build(), ctx), 1, 1));
    expect(e.message).toMatch(/name/);
  });

  it('fails on a parent that is not -1 and not a bone of the list', () => {
    for (const parent of [-2, 3, 99]) {
      const bad = tracks.map((t, i) => (i === 1 ? { ...t, parent } : t));
      const e = thrown(() => readTm(new BinaryReader(tmBytes(bad, 2), ctx), 3, 2));
      expect(e.message).toMatch(/parent/);
    }
  });

  it('fails on a negative bone or frame count', () => {
    thrown(() => readTm(new BinaryReader(new Uint8Array(64), ctx), -1, 2));
    thrown(() => readTm(new BinaryReader(new Uint8Array(64), ctx), 1, -2));
  });

  it('fails, without allocating, when the keys run past the end of the data', () => {
    const bytes = tmBytes(tracks, 2);
    const e = thrown(() => readTm(new BinaryReader(bytes.subarray(0, bytes.length - 3), ctx), 3, 2));
    expect(e.offset).toBeGreaterThan(0);
    // a frame count far beyond the data must be refused before 28 * count bytes are allocated
    thrown(() => readTm(new BinaryReader(tmBytes(tracks, 2), ctx), 3, 0x3fffffff));
  });
});

// ---- readAni ---------------------------------------------------------------------------------------------------

describe('readAni', () => {
  const tracks: TrackSpec[] = [
    { name: 'Bip01', parent: -1, keyed: true },
    { name: 'Bip01 Pelvis', parent: 0 },
  ];

  it('reads the header, tracks, frame attributes and events', () => {
    const m = readAni(aniBytes({ tracks, frameCount: 3, perSlerp: 0.75, id: 42, eventCount: 2 }), 'a.ani');
    expect(m.version).toBe(10);
    expect(m.id).toBe(42);
    expect(m.perSlerp).toBe(0.75);
    expect(m.frameCount).toBe(3);
    expect(m.boneCount).toBe(2);
    expect(m.tracks).toHaveLength(2);
    expect(m.tracks[0].keys).toHaveLength(3);
    expect(m.tracks[1].keys).toBeNull();
    expect(m.path).toBeNull();
    expect(m.frameAttributes).toEqual([
      { attr: 5, soundId: 100, frame: 0.5 },
      { attr: 2, soundId: 101, frame: 1.5 },
      { attr: 5, soundId: 102, frame: 2.5 },
    ]);
    expect(m.events).toEqual([
      [0, 0.5, 0.75],
      [1, 1.5, 1.75],
    ]);
  });

  it('reads one position per frame when the file has a path', () => {
    const m = readAni(aniBytes({ tracks, frameCount: 3, path: true }), 'a.ani');
    expect(m.path).toEqual([
      [0, 0.25, 0.5],
      [1, 1.25, 1.5],
      [2, 2.25, 2.5],
    ]);
    expect(m.tracks[0].keys).toHaveLength(3);
  });

  it('accepts four events, the most the C++ has room for', () => {
    expect(readAni(aniBytes({ tracks, frameCount: 1, eventCount: 4 }), 'a.ani').events).toHaveLength(4);
  });

  it('reads a file with no bones', () => {
    const m = readAni(aniBytes({ tracks: [], frameCount: 2 }), 'a.ani');
    expect(m.boneCount).toBe(0);
    expect(m.tracks).toEqual([]);
    expect(m.frameAttributes).toHaveLength(2);
  });

  it('names the file, reader and C++ function in every error', () => {
    const e = thrown(() => readAni(aniBytes({ tracks, frameCount: 3, version: 9 }), 'Client/Model/x.ani'));
    expect(e.file).toBe('Client/Model/x.ani');
    expect(e.reader).toBe('readAni');
    expect(e.cppRef).toContain('Bone.cpp:491');
    expect(e.message).toMatch(/version 9/);
  });

  it('fails on any version but 10', () => {
    for (const version of [0, 4, 9, 11]) {
      thrown(() => readAni(aniBytes({ tracks, frameCount: 1, version }), 'a.ani'));
    }
  });

  it('fails on a frame count of 0 or less', () => {
    for (const frameCount of [0, -1]) {
      const bytes = aniBytes({ tracks: [], frameCount: 1 });
      new DataView(bytes.buffer).setInt32(4 + 4 + 4 + 32 + 4, frameCount, true);
      const e = thrown(() => readAni(bytes, 'a.ani'));
      expect(e.message).toMatch(/frame count/);
    }
  });

  it('fails on bytes left after the events', () => {
    const e = thrown(() => readAni(aniBytes({ tracks, frameCount: 2, trailing: 1 }), 'a.ani'));
    expect(e.message).toMatch(/1 byte left/);
  });

  it('fails when the file is cut short anywhere', () => {
    const bytes = aniBytes({ tracks, frameCount: 2, path: true, eventCount: 1 });
    for (let cut = 0; cut < bytes.length; cut += 7) {
      thrown(() => readAni(bytes.subarray(0, cut), 'a.ani'));
    }
  });

  it('fails on more events than the 4 the C++ has room for, and on a negative count', () => {
    for (const eventCount of [5, 100, -1]) {
      const bytes = aniBytes({ tracks, frameCount: 1 });
      // the event count is the last 4 bytes of a file with no events
      new DataView(bytes.buffer).setInt32(bytes.length - 4, eventCount, true);
      const e = thrown(() => readAni(bytes, 'a.ani'));
      expect(e.message).toMatch(/event/);
    }
  });

  it('fails when the frame pool size disagrees with the keyed bones', () => {
    thrown(() => readAni(aniBytes({ tracks, frameCount: 3, poolOverride: 4 }), 'a.ani'));
  });
});

// ---- readChr ---------------------------------------------------------------------------------------------------

describe('readChr', () => {
  const bones: BoneSpec[] = [
    { name: 'Bip01', parent: -1 },
    { name: 'Bip01 Pelvis', parent: 0 },
    { name: 'Bip01 R Hand', parent: 1 },
    { name: 'Bip01 L Hand', parent: 1 },
    { name: 'Bip01 R ForeArm', parent: 1 },
    { name: 'Bip01 L ForeArm', parent: 1 },
  ];

  it('reads the bones: names, parents and the three matrices', () => {
    const s = readChr(chrBytes({ version: 7, id: 9, bones }), 'a.chr');
    expect(s.version).toBe(7);
    expect(s.id).toBe(9);
    expect(s.bones.map((b) => [b.name, b.parent])).toEqual(bones.map((b) => [b.name, b.parent]));
    sameFloats(s.bones[2].tm, matrixFloats(300));
    sameFloats(s.bones[2].inverseTm, matrixFloats(316));
    sameFloats(s.bones[2].localTm, matrixFloats(332));
    expect(s.sendVS).toBe(true);
  });

  it('reads sendVS as a flag', () => {
    expect(readChr(chrBytes({ version: 4, bones, sendVS: 0 }), 'a.chr').sendVS).toBe(false);
    expect(readChr(chrBytes({ version: 4, bones, sendVS: 1 }), 'a.chr').sendVS).toBe(true);
  });

  it('reads the weapon matrices in the order the C++ does: right hand, shield, knuckle', () => {
    const s = readChr(chrBytes({ version: 4, bones }), 'a.chr');
    sameFloats(s.localRH, matrixFloats(1000));
    sameFloats(s.localShield, matrixFloats(2000));
    sameFloats(s.localKnuckle, matrixFloats(3000));
  });

  it('version 4 has no events and no left-hand matrix (identity, the C++ default)', () => {
    const s = readChr(chrBytes({ version: 4, bones }), 'a.chr');
    expect(s.events).toEqual([]);
    expect(s.eventParents).toEqual([]);
    sameFloats(s.localLH, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('version 5 has 4 events, each with a parent bone index', () => {
    const s = readChr(chrBytes({ version: 5, bones }), 'a.chr');
    expect(s.events).toEqual([
      [0, 1, 2],
      [10, 11, 12],
      [20, 21, 22],
      [30, 31, 32],
    ]);
    expect(s.eventParents).toEqual([0, 1, 2, 3]);
    sameFloats(s.localLH, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('version 6 has 8 events', () => {
    const s = readChr(chrBytes({ version: 6, bones }), 'a.chr');
    expect(s.events).toHaveLength(8);
    expect(s.events[7]).toEqual([70, 71, 72]);
    expect(s.eventParents).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    sameFloats(s.localLH, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('version 7 adds the left-hand matrix', () => {
    const s = readChr(chrBytes({ version: 7, bones }), 'a.chr');
    expect(s.events).toHaveLength(8);
    sameFloats(s.localLH, matrixFloats(4000));
  });

  it('finds the hand and forearm bones by the name after the first 6 characters, ignoring case', () => {
    const s = readChr(chrBytes({ version: 7, bones }), 'a.chr');
    expect([s.rHandIdx, s.lHandIdx, s.rArmIdx, s.lArmIdx]).toEqual([2, 3, 4, 5]);
    const upper = bones.map((b) => ({ ...b, name: b.name.toUpperCase() }));
    const t = readChr(chrBytes({ version: 7, bones: upper }), 'a.chr');
    expect([t.rHandIdx, t.lHandIdx, t.rArmIdx, t.lArmIdx]).toEqual([2, 3, 4, 5]);
  });

  it('leaves those indices 0 when no bone has the name, and keeps the last match', () => {
    const none = readChr(chrBytes({ version: 7, bones: bones.slice(0, 2) }), 'a.chr');
    expect([none.rHandIdx, none.lHandIdx, none.rArmIdx, none.lArmIdx]).toEqual([0, 0, 0, 0]);
    const twice = readChr(
      chrBytes({ version: 7, bones: [...bones.slice(0, 3), { name: 'Bip02 R Hand', parent: 1 }] }),
      'a.chr',
    );
    expect(twice.rHandIdx).toBe(3);
  });

  it('does not match a name that merely contains the hand name', () => {
    const odd = [{ name: 'Bip01', parent: -1 }, { name: 'Bip01 R Hand1', parent: 0 }, { name: 'R Hand', parent: 0 }];
    const s = readChr(chrBytes({ version: 7, bones: odd }), 'a.chr');
    expect(s.rHandIdx).toBe(0);
  });

  it('reads a file with no bones', () => {
    const s = readChr(chrBytes({ version: 7, bones: [] }), 'a.chr');
    expect(s.bones).toEqual([]);
  });

  it('names the file, reader and C++ function in every error', () => {
    const e = thrown(() => readChr(chrBytes({ version: 3, bones }), 'Client/Model/x.chr'));
    expect(e.file).toBe('Client/Model/x.chr');
    expect(e.reader).toBe('readChr');
    expect(e.cppRef).toContain('Bone.cpp:76');
    expect(e.message).toMatch(/version 3/);
  });

  it('fails on a version below 4', () => {
    for (const version of [-1, 0, 3]) thrown(() => readChr(chrBytes({ version, bones }), 'a.chr'));
  });

  it('accepts a version above 7, which reads like 7 without the left-hand matrix', () => {
    const s = readChr(chrBytes({ version: 8, bones }), 'a.chr');
    expect(s.events).toHaveLength(8);
    sameFloats(s.localLH, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('fails on a parent that is not -1 and not a bone of the list', () => {
    for (const parent of [-2, 6, 1000]) {
      const bad = bones.map((b, i) => (i === 3 ? { ...b, parent } : b));
      const e = thrown(() => readChr(chrBytes({ version: 7, bones: bad }), 'a.chr'));
      expect(e.message).toMatch(/parent/);
    }
  });

  it('fails on a bone name longer than the 32 bytes the C++ stores', () => {
    const long = [{ name: 'x'.repeat(32), parent: -1 }]; // 32 characters + NUL = 33
    const e = thrown(() => readChr(chrBytes({ version: 7, bones: long }), 'a.chr'));
    expect(e.message).toMatch(/name/);
    const ok = [{ name: 'x'.repeat(31), parent: -1 }]; // 31 + NUL = 32 fits
    expect(readChr(chrBytes({ version: 7, bones: ok }), 'a.chr').bones[0].name).toBe('x'.repeat(31));
  });

  it('fails on a negative bone count and on a count the data cannot hold', () => {
    const bytes = chrBytes({ version: 7, bones });
    new DataView(bytes.buffer).setInt32(8, -1, true);
    thrown(() => readChr(bytes, 'a.chr'));
    new DataView(bytes.buffer).setInt32(8, 0x7fffffff, true);
    thrown(() => readChr(bytes, 'a.chr'));
  });

  it('fails on bytes left at the end, and on a file cut short anywhere', () => {
    const e = thrown(() => readChr(chrBytes({ version: 7, bones, trailing: 3 }), 'a.chr'));
    expect(e.message).toMatch(/3 bytes left/);
    const bytes = chrBytes({ version: 7, bones });
    for (let cut = 0; cut < bytes.length; cut += 11) thrown(() => readChr(bytes.subarray(0, cut), 'a.chr'));
  });

  it('returns each matrix as 16 floats (the D3DXMATRIX as stored)', () => {
    const s = readChr(chrBytes({ version: 7, bones }), 'a.chr');
    for (const bone of s.bones) {
      expect([bone.tm.length, bone.inverseTm.length, bone.localTm.length]).toEqual([16, 16, 16]);
    }
  });
});
