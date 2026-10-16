import { expect, it } from 'vitest';
import { motionFps, readAni, readChr } from '../../src/index';
import type { Motion } from '../../src/index';
import { describeClient, forEachClientFile } from '../helpers/client';

/** Reads the one file of `Client/Model` called `name` (any case) with `read`. */
function readModelFile<T>(name: string, read: (bytes: Uint8Array, file: string) => T): T {
  let result: T | undefined;
  const exactName = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const { count, failures } = forEachClientFile('Model', exactName, (bytes, file) => {
    result = read(bytes, file);
  });
  if (failures.length > 0) throw failures[0].error;
  if (count !== 1) throw new Error(`expected exactly one Model/${name}, found ${count}`);
  return result as T;
}

/** A short list for a failure message: the first `limit` entries, then how many more there are. */
function summarize(items: string[], limit = 12): string {
  const shown = items.slice(0, limit).join('; ');
  return items.length > limit ? `${shown}; ... (${items.length - limit} more)` : shown;
}

const failureText = (failures: { path: string; error: unknown }[]): string =>
  summarize(failures.map((f) => `${f.path}: ${f.error instanceof Error ? f.error.message : String(f.error)}`), 5);

const baseName = (file: string): string => file.replace(/^.*[\\/]/, '');
const histogram = (counts: Map<number, number>): Record<number, number> =>
  Object.fromEntries([...counts].sort(([a], [b]) => a - b));
const bump = (counts: Map<number, number>, key: number): void => void counts.set(key, (counts.get(key) ?? 0) + 1);

/** Rounds for a snapshot; the + 0 turns -0 into 0. */
const round4 = (v: number): number => Number(v.toFixed(4)) + 0;

const allFinite = (values: ArrayLike<number>): boolean => {
  for (let i = 0; i < values.length; i++) if (!Number.isFinite(values[i])) return false;
  return true;
};

const UNIT_TOLERANCE = 1e-3;
const isUnit = (q: ArrayLike<number>): boolean =>
  Math.abs(Math.hypot(q[0], q[1], q[2], q[3]) - 1) <= UNIT_TOLERANCE;

interface ChrScan {
  count: number;
  failures: { path: string; error: unknown }[];
  versions: Map<number, number>;
  boneCounts: { min: number; max: number };
  sendVS: Map<number, number>;
  /** Skeletons whose bone names are not all different, with the names that repeat. */
  repeatedNames: string[];
  /** Bones whose parent is at or after them in the list; AnimateBone needs a parent's matrix before its child's. */
  parentNotBefore: string[];
  /** Matrices or event points with a NaN or infinity. */
  notFinite: string[];
}

interface AniScan {
  count: number;
  failures: { path: string; error: unknown }[];
  perSlerp: { min: number; max: number };
  frameCounts: { min: number; max: number };
  boneCounts: { min: number; max: number };
  events: Map<number, number>;
  withPath: number;
  /** Tracks with keys / without, over all files. */
  keyedTracks: number;
  defaultTracks: number;
  /** Keys whose rotation is not within UNIT_TOLERANCE of length 1, and how many keys there are in all. */
  nonUnitKeys: number;
  keyCount: number;
  nonUnitFiles: string[];
  /** Tracks whose parent is at or after them in the list. */
  parentNotBefore: string[];
  /** Files with a NaN or infinity in a key, matrix, path, event or perSlerp. */
  notFinite: string[];
  /** Frames with an attribute flag set, and how many of them record a `frame` outside their own index. */
  flaggedFrames: number;
  attributeFrameMismatch: number;
}

let chrScan: ChrScan | undefined;
let aniScan: AniScan | undefined;

function scanSkeletons(): ChrScan {
  if (chrScan) return chrScan;
  const s: ChrScan = {
    count: 0,
    failures: [],
    versions: new Map(),
    boneCounts: { min: Infinity, max: 0 },
    sendVS: new Map(),
    repeatedNames: [],
    parentNotBefore: [],
    notFinite: [],
  };
  const result = forEachClientFile('Model', /\.chr$/i, (bytes, file) => {
    const skeleton = readChr(bytes, file);
    const name = baseName(file);
    bump(s.versions, skeleton.version);
    bump(s.sendVS, skeleton.sendVS ? 1 : 0);
    s.boneCounts.min = Math.min(s.boneCounts.min, skeleton.bones.length);
    s.boneCounts.max = Math.max(s.boneCounts.max, skeleton.bones.length);
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const b of skeleton.bones) (seen.has(b.name) ? repeated : seen).add(b.name);
    if (repeated.size > 0) s.repeatedNames.push(`${name}: ${[...repeated].join(', ')}`);
    skeleton.bones.forEach((b, i) => {
      if (b.parent >= i) s.parentNotBefore.push(`${name}: bone ${i} (${b.name}) parent ${b.parent}`);
    });
    const matrices = [
      ...skeleton.bones.flatMap((b) => [b.tm, b.inverseTm, b.localTm]),
      skeleton.localRH,
      skeleton.localShield,
      skeleton.localKnuckle,
      skeleton.localLH,
    ];
    if (!matrices.every(allFinite) || !skeleton.events.every(allFinite)) s.notFinite.push(name);
  });
  s.count = result.count;
  s.failures = result.failures;
  chrScan = s;
  return s;
}

function scanMotions(): AniScan {
  if (aniScan) return aniScan;
  const s: AniScan = {
    count: 0,
    failures: [],
    perSlerp: { min: Infinity, max: -Infinity },
    frameCounts: { min: Infinity, max: 0 },
    boneCounts: { min: Infinity, max: 0 },
    events: new Map(),
    withPath: 0,
    keyedTracks: 0,
    defaultTracks: 0,
    nonUnitKeys: 0,
    keyCount: 0,
    nonUnitFiles: [],
    parentNotBefore: [],
    notFinite: [],
    flaggedFrames: 0,
    attributeFrameMismatch: 0,
  };
  const result = forEachClientFile('Model', /\.ani$/i, (bytes, file) => {
    const motion = readAni(bytes, file);
    const name = baseName(file);
    s.perSlerp.min = Math.min(s.perSlerp.min, motion.perSlerp);
    s.perSlerp.max = Math.max(s.perSlerp.max, motion.perSlerp);
    s.frameCounts.min = Math.min(s.frameCounts.min, motion.frameCount);
    s.frameCounts.max = Math.max(s.frameCounts.max, motion.frameCount);
    s.boneCounts.min = Math.min(s.boneCounts.min, motion.boneCount);
    s.boneCounts.max = Math.max(s.boneCounts.max, motion.boneCount);
    bump(s.events, motion.events.length);
    if (motion.path) s.withPath++;

    let finite = Number.isFinite(motion.perSlerp);
    let nonUnit = 0;
    motion.tracks.forEach((t, i) => {
      if (t.parent >= i) s.parentNotBefore.push(`${name}: track ${i} (${t.name}) parent ${t.parent}`);
      finite &&= allFinite(t.inverseTm) && allFinite(t.localTm);
      if (t.keys) {
        s.keyedTracks++;
        for (const k of t.keys) {
          s.keyCount++;
          finite &&= allFinite(k.position) && allFinite(k.rotation);
          if (!isUnit(k.rotation)) nonUnit++;
        }
      } else {
        s.defaultTracks++;
        finite &&= allFinite(t.defaultTm!);
      }
    });
    finite &&= (motion.path ?? []).every(allFinite) && motion.events.every(allFinite);
    if (!finite) s.notFinite.push(name);
    s.nonUnitKeys += nonUnit;
    if (nonUnit > 0) s.nonUnitFiles.push(`${name}: ${nonUnit} keys`);
    motion.frameAttributes.forEach((a, f) => {
      if (a.attr === 0) return;
      s.flaggedFrames++;
      if (Math.floor(a.frame) !== f) s.attributeFrameMismatch++;
    });
  });
  s.count = result.count;
  s.failures = result.failures;
  aniScan = s;
  return s;
}

describeClient('skeletons (.chr) and motions (.ani)', () => {
  it('reads mvr_male.chr: bones with unique names, each parented to an earlier bone or none', () => {
    const skeleton = readModelFile('mvr_male.chr', readChr);
    expect(skeleton.bones.length).toBeGreaterThan(0);
    const names = skeleton.bones.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
    skeleton.bones.forEach((b, i) => {
      expect(b.parent === -1 || (b.parent >= 0 && b.parent < i)).toBe(true);
    });
  });

  it('reads Mvr_male_GenStand.ani: as many bones as mvr_male.chr, frames, unit rotations', () => {
    const skeleton = readModelFile('mvr_male.chr', readChr);
    const motion = readModelFile('Mvr_male_GenStand.ani', readAni);
    expect(motion.boneCount).toBe(skeleton.bones.length);
    expect(motion.tracks).toHaveLength(skeleton.bones.length);
    expect(motion.frameCount).toBeGreaterThan(0);
    for (const track of motion.tracks) {
      for (const key of track.keys ?? []) {
        expect(Math.hypot(...key.rotation)).toBeCloseTo(1, 3);
      }
    }
  });

  it("a motion repeats its skeleton's bone names and parents", () => {
    // The .ani carries its own copy of the hierarchy (CMotion::m_pBoneInfo), which agrees with the .chr. Its inverse
    // and local TMs do not: they are from the pose the motion was exported in (mvr_male: all 30 bones differ from
    // the .chr by up to 0.7), whereas the client skins with the .chr's (ModelObject.cpp:549).
    const skeleton = readModelFile('mvr_male.chr', readChr);
    const motion = readModelFile('Mvr_male_GenStand.ani', readAni);
    expect(motion.tracks.map((t) => [t.name, t.parent])).toEqual(skeleton.bones.map((b) => [b.name, b.parent]));
  });

  it('a motion spells bone names as its skeleton does, even the Korean ones of mvr_CrownBubble', () => {
    const skeleton = readModelFile('mvr_CrownBubble.chr', readChr);
    const motion = readModelFile('mvr_CrownBubble_GenIdle1.ani', readAni);
    expect(skeleton.bones.some((b) => /[^ -]/.test(b.name))).toBe(true);
    expect(motion.tracks.map((t) => [t.name, t.parent])).toEqual(skeleton.bones.map((b) => [b.name, b.parent]));
  });

  it('every .chr in Client/Model reads to its last byte', () => {
    const s = scanSkeletons();
    expect(s.count).toBe(303);
    expect(failureText(s.failures)).toBe('');
    expect(s.failures).toHaveLength(0);
    // the shipped versions; 4 has no events, 5 four, 6 and 7 eight (7 adds the left-hand matrix)
    expect(histogram(s.versions)).toEqual({ 4: 32, 5: 32, 6: 14, 7: 225 });
  });

  it('every .ani in Client/Model reads to its last byte', () => {
    const s = scanMotions();
    expect(s.count).toBe(2931);
    expect(failureText(s.failures)).toBe('');
    expect(s.failures).toHaveLength(0);
  });

  it('bone names are unique in all but four skeletons, so bones are told apart by index, not by name', () => {
    expect(scanSkeletons().repeatedNames).toEqual([
      'Mvr_Gongury.chr: Bone11',
      'Mvr_MaDaAgent.chr: Bip01 L juria 1',
      'Mvr_MaFlJuria.chr: Bip01 L juria 1',
      'mvr_crownIblis.chr: Bone13',
    ]);
  });

  it('every bone comes after its parent', () => {
    expect(summarize(scanSkeletons().parentNotBefore)).toBe('');
  });

  it('every motion lists a bone after its parent', () => {
    expect(summarize(scanMotions().parentNotBefore)).toBe('');
  });

  it('skeleton matrices and event points are finite', () => {
    expect(summarize(scanSkeletons().notFinite)).toBe('');
  });

  it('motion keys, matrices, paths and events are finite', () => {
    expect(summarize(scanMotions().notFinite)).toBe('');
  });

  it('key rotations are unit quaternions within 1e-3, except three tracks in two files', () => {
    // mvr_redmantis_stand.ani track 0 (Bone01) has length 1.040 at all 31 frames; mvr_Trilipy_atk1.ani tracks 10 and
    // 13 (Bone16, Bone13) are (0, 0, 0, 0.642) and (0, 0, 0, 0.652) at all 36 frames. Every other key is within
    // 0.00004 of length 1. A converter has to normalize before writing glTF.
    const s = scanMotions();
    expect(s.keyCount).toBeGreaterThan(1000000);
    expect(s.nonUnitFiles.sort()).toEqual(['mvr_Trilipy_atk1.ani: 72 keys', 'mvr_redmantis_stand.ani: 31 keys']);
    expect(s.nonUnitKeys).toBe(103);
  });

  it('a frame attribute records a position within its own frame', () => {
    const s = scanMotions();
    expect(s.flaggedFrames).toBeGreaterThan(0);
    expect(s.attributeFrameMismatch).toBe(0);
  });

  it('scan summary', () => {
    const c = scanSkeletons();
    const a = scanMotions();
    expect({
      skeletons: { count: c.count, boneCounts: c.boneCounts, sendVS: histogram(c.sendVS) },
      motions: {
        count: a.count,
        perSlerp: a.perSlerp,
        frameCounts: a.frameCounts,
        boneCounts: a.boneCounts,
        events: histogram(a.events),
        withPath: a.withPath,
        keyedTracks: a.keyedTracks,
        defaultTracks: a.defaultTracks,
        flaggedFrames: a.flaggedFrames,
        keyCount: a.keyCount,
      },
    }).toMatchSnapshot();
  });

  it('mvr_male.chr summary', () => {
    const skeleton = readModelFile('mvr_male.chr', readChr);
    expect({
      version: skeleton.version,
      id: skeleton.id,
      sendVS: skeleton.sendVS,
      bones: skeleton.bones.map((b) => `${b.parent} ${b.name}`),
      hands: [skeleton.rHandIdx, skeleton.lHandIdx, skeleton.rArmIdx, skeleton.lArmIdx],
      events: skeleton.events,
      eventParents: skeleton.eventParents,
    }).toMatchSnapshot();
  });

  it('Mvr_male_GenStand.ani summary', () => {
    const motion: Motion = readModelFile('Mvr_male_GenStand.ani', readAni);
    const first = motion.tracks[0].keys?.[0] ?? null;
    expect({
      version: motion.version,
      id: motion.id,
      perSlerp: motion.perSlerp,
      fps: motionFps(motion.perSlerp),
      frameCount: motion.frameCount,
      boneCount: motion.boneCount,
      keyedTracks: motion.tracks.filter((t) => t.keys !== null).length,
      path: motion.path,
      events: motion.events,
      frameAttributes: motion.frameAttributes.filter((a) => a.attr !== 0),
      firstKeyOfTrack0: first && {
        position: first.position.map(round4),
        rotation: first.rotation.map(round4),
      },
    }).toMatchSnapshot();
  });
});
