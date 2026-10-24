// Puts a character together from separately converted glbs: one skeleton, any number of body parts, and the motion
// that drives them.
//
// Every part glb carries its own copy of the skeleton's joints and its own skin (models/modelGlb.ts in the converter).
// Here each part's skinned meshes are re-bound to the one shared skeleton by joint name (ruling R18 names joints the
// same in every glb of a skeleton), so one motion moves them all. A part keeps its own inverse bind matrices: they
// come from its .chr's Bone.inverseTm, which is not the inverse of the rest pose for 326 of the client's bones, so
// recomputing them from the shared skeleton would bend those parts.
//
// The converter also writes the part's bounding box on the scene of a part glb, and the skeleton's hand grips on the
// scene of a skeleton glb (`ModelBoxExtras`, `SkeletonGrips`; GLTFLoader puts a scene's extras in its `userData`). The
// character offers the union of its parts' boxes (`box()`) and the grips (`grips`), both in D3D space: they feed the
// picking and range rules and the place of a held weapon, not the drawing. A glb of an older conversion has neither.

import type { Material, Object3D } from 'three';
import { AnimationClip, AnimationMixer, Group, KeyframeTrack, Skeleton, SkinnedMesh } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ModelBoxExtras, MotionEvents, SkeletonGrips, Vec3 } from '@flyffweb/formats';
import type { TextureCache } from '../assets/loaders';
import { applyTextures } from '../assets/loaders';

/** The node every converted glb hangs its joints under (skeletonGlb.ts SKELETON_NODE). */
const SKELETON_NODE = 'skeleton';
/** The most detailed LOD of a model (modelGlb.ts); the character view draws this one. */
const LOD0 = 'lod0';

/** An axis-aligned box in a model's own D3D space: `CModelObject::m_vMin` and `m_vMax`. */
export interface ModelBox {
  min: Vec3;
  max: Vec3;
}

export interface AssembledCharacter {
  /** The shared skeleton and every part's lod0. */
  root: Object3D;
  /** An animation mixer on `root`: clips of the skeleton's motions bind to its joints by name. */
  mixer: AnimationMixer;
  /**
   * The model's box, in D3D coordinates and the model's own space (scale, rotation and position are the mover's): the
   * union of the boxes of the loaded parts, as CModelObject::LoadElement builds `m_vMin` / `m_vMax` (see
   * `unionModelBoxes`). A part of an older conversion has no box and adds nothing; with no box at all it is the empty
   * box, zero size at the origin. A new object each call.
   */
  box(): ModelBox;
  /**
   * Where a held item sits (`SkeletonGrips`: the hand and forearm bones and the four grip matrices, and which matrix
   * goes with which bone), from the skeleton glb; null for a skeleton glb of an older conversion (including the first,
   * whose grips had no forearm bones), and for a mover that has no skeleton.
   */
  readonly grips: SkeletonGrips | null;
  /** Gives the textures back to the cache and disposes the parts' geometry and materials. Safe to call twice. */
  release(): void;
}

const isVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && Number.isFinite(n));

const isMatrix = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length === 16 && value.every((n) => typeof n === 'number' && Number.isFinite(n));

const isBoneIndex = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * The box a converted model glb carries on its scene (`ModelBoxExtras`), copied; null for a glb without one (an older
 * conversion). Throws, naming `where`, when it has one that is not in the shape the converter writes.
 */
export function modelBoxOf(scene: Pick<Object3D, 'userData'>, where: string): ModelBox | null {
  const { bbMin, bbMax } = scene.userData as Partial<Record<keyof ModelBoxExtras, unknown>>;
  if (bbMin === undefined && bbMax === undefined) return null;
  if (!isVec3(bbMin) || !isVec3(bbMax)) throw new Error(`${where}: its box is not in the shape the converter writes`);
  return { min: [...bbMin], max: [...bbMax] };
}

/** A CModelObject's `m_vMin` and `m_vMax` before any part is loaded (ModelObject.cpp:77-78). */
const EMPTY_MIN = 65535;

/**
 * The box of a model made of parts with these boxes. CModelObject::LoadElement (ModelObject.cpp:738-743) starts from
 * 65535 and -65535 and, for each part and each of the six numbers alone, takes the part's minimum when it is lower
 * and its maximum when it is higher, so a box a file stores inverted (minimum above maximum on an axis; 82 models of
 * the client) stays inverted. No part (or none that moved the minimum x) leaves the model without a box,
 * CModel::IsNullBoundBox (Model.h:138): here the empty box, zero size at the origin. A new object each call.
 */
export function unionModelBoxes(boxes: readonly ModelBox[]): ModelBox {
  const min: Vec3 = [EMPTY_MIN, EMPTY_MIN, EMPTY_MIN];
  const max: Vec3 = [-EMPTY_MIN, -EMPTY_MIN, -EMPTY_MIN];
  for (const box of boxes) {
    for (let axis = 0; axis < 3; axis++) {
      if (box.min[axis]! < min[axis]!) min[axis] = box.min[axis]!;
      if (box.max[axis]! > max[axis]!) max[axis] = box.max[axis]!;
    }
  }
  return min[0] === EMPTY_MIN ? { min: [0, 0, 0], max: [0, 0, 0] } : { min, max };
}

/**
 * The grips a skeleton glb carries on its scene (`SkeletonGrips`), copied; null for a glb without them (an older
 * conversion), and for one whose grips have the hands but neither forearm (the first conversion): the shield hangs
 * from the left forearm bone and the knuckle weapon from the right one (ModelObject.cpp:1134-1142), so such grips
 * cannot place them and count as absent. Throws when the grips are in a shape the converter does not write (a forearm
 * index that is present but not a bone index, or only one of the two).
 */
function gripsOf(scene: Pick<Object3D, 'userData'>): SkeletonGrips | null {
  const written: unknown = scene.userData.grips;
  if (written === undefined) return null;
  if (typeof written !== 'object' || written === null) {
    throw new Error("the skeleton glb's grips are not in the shape the converter writes");
  }
  const { rHand, lHand, rArm, lArm, localRH, localLH, localShield, localKnuckle } = written as Record<
    keyof SkeletonGrips,
    unknown
  >;
  const notWritten = new Error("the skeleton glb's grips are not in the shape the converter writes");
  if (
    !isBoneIndex(rHand) ||
    !isBoneIndex(lHand) ||
    !isMatrix(localRH) ||
    !isMatrix(localLH) ||
    !isMatrix(localShield) ||
    !isMatrix(localKnuckle)
  ) {
    throw notWritten;
  }
  if (rArm === undefined && lArm === undefined) return null; // the first conversion: both hands, no forearm
  if (!isBoneIndex(rArm) || !isBoneIndex(lArm)) throw notWritten;
  return {
    rHand,
    lHand,
    rArm,
    lArm,
    localRH: [...localRH],
    localLH: [...localLH],
    localShield: [...localShield],
    localKnuckle: [...localKnuckle],
  };
}

/**
 * Assembles `skeleton` (a skeleton glb) and `parts` (part glbs of that skeleton). Resolves once every part has its
 * textures. Throws when the skeleton has no `skeleton` node or has grips in a shape the converter does not write, a
 * part has no `lod0` node, has a box in such a shape, or is skinned to a joint the skeleton does not have; the message
 * names the part by its index in `parts`.
 */
export async function assembleCharacter(
  skeleton: Pick<GLTF, 'scene'>,
  parts: readonly Pick<GLTF, 'scene'>[],
  cache: Pick<TextureCache, 'acquire' | 'release'>,
): Promise<AssembledCharacter> {
  const joints = skeleton.scene.getObjectByName(SKELETON_NODE);
  if (joints === undefined) throw new Error(`the skeleton glb has no "${SKELETON_NODE}" node`);
  const bonesByName = new Map<string, Object3D>();
  joints.traverse((joint) => bonesByName.set(joint.name, joint));
  const grips = gripsOf(skeleton.scene);

  // Checked and re-bound before anything is acquired, so a failure leaves nothing to give back.
  const partBoxes: ModelBox[] = [];
  const lods = parts.map((part, i) => {
    const lod = part.scene.getObjectByName(LOD0);
    if (lod === undefined) throw new Error(`part ${i} has no "${LOD0}" node`);
    const box = modelBoxOf(part.scene, `part ${i}`);
    if (box !== null) partBoxes.push(box);
    lod.traverse((object) => {
      if (object instanceof SkinnedMesh) rebind(object, bonesByName, `part ${i}`);
    });
    return lod;
  });

  const root = new Group();
  root.name = 'character';
  root.add(joints);
  for (const lod of lods) root.add(lod);

  const keys = (await Promise.all(lods.map((lod) => applyTextures(lod, cache)))).flat();
  const mixer = new AnimationMixer(root);

  let released = false;
  return {
    root,
    mixer,
    grips,
    box() {
      // The held item joins here (Task 14): a weapon is loaded into the same CModelObject as the parts, so its box is
      // unioned into m_vMin / m_vMax like theirs (ModelObject.cpp:735-744, where a comment notes that a human holding
      // a spear has the spear in the box). Its own box, as its glb carries it, goes into this list.
      return unionModelBoxes(partBoxes);
    },
    release() {
      if (released) return;
      released = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      for (const key of keys) cache.release(key);
      const materials = new Set<Material>();
      root.traverse((object) => {
        if (!(object instanceof SkinnedMesh)) return;
        object.geometry.dispose();
        object.skeleton.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
        }
      });
      // A material's map belongs to the texture cache: dispose() leaves textures alone.
      for (const material of materials) material.dispose();
    },
  };
}

/** Binds `mesh` to the bones of `bonesByName` named like its own, keeping its inverse bind and bind matrices. */
function rebind(mesh: SkinnedMesh, bonesByName: ReadonlyMap<string, Object3D>, where: string): void {
  const own = mesh.skeleton;
  const bones = own.bones.map((bone) => {
    const shared = bonesByName.get(bone.name);
    if (shared === undefined) throw new Error(`${where} is skinned to joint "${bone.name}", which the skeleton lacks`);
    return shared;
  });
  // Skeleton wants Bone[], but only reads matrixWorld: the skeleton glb's joints are plain nodes (no skin there).
  mesh.bind(new Skeleton(bones as Skeleton['bones'], own.boneInverses.map((m) => m.clone())), mesh.bindMatrix);
  own.dispose();
  // three.js computes a skinned mesh's bounds once, in whatever pose it is in then; the motion moves it out of them.
  mesh.frustumCulled = false;
}

export interface LoopedMotion {
  /** The clip with frame 0 appended after its last frame. */
  clip: AnimationClip;
  /** The motion's frames (before the appended one). */
  frames: number;
  /** The clip time of frame `n`, exactly the key time the converter wrote; `n` wraps around `frames`. */
  frameTime(n: number): number;
  /** The frames the motion marks with a hit, a sound or a quake (`MotionEvents` tells what a frame number is). */
  events: MotionEvents;
}

const isNumbers = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((n) => typeof n === 'number');

/** `value` when it has the shape the converter writes (`MotionEvents`), else null. */
function readEvents(value: unknown): MotionEvents | null {
  if (typeof value !== 'object' || value === null) return null;
  const { hit, sound, quake, frames, perSlerp } = value as Record<string, unknown>;
  const pairs = Array.isArray(sound) && sound.every((pair) => isNumbers(pair) && pair.length === 2);
  if (!isNumbers(hit) || !pairs || !isNumbers(quake) || typeof frames !== 'number' || typeof perSlerp !== 'number') {
    return null;
  }
  return { hit, sound: sound as MotionEvents['sound'], quake, frames, perSlerp };
}

/**
 * The events of `clip`, which GLTFLoader reads from the animation's extras into `clip.userData`. A clip without them
 * (a motion of an older conversion) has no marked frames: empty lists, its own `frames`, and the `perSlerp` its key
 * times give (frame i is at i / (60 * perSlerp) s, with perSlerp cut to 3 decimals as `motionFps` does; 0 when there
 * is a single frame, which has no speed). Throws when the events are not in the shape the converter writes.
 */
function eventsOf(clip: AnimationClip, frames: number, lastTime: number): MotionEvents {
  const written: unknown = clip.userData.events;
  if (written === undefined) {
    const perSlerp = frames > 1 && lastTime > 0 ? Math.round(((frames - 1) / lastTime / 60) * 1000) / 1000 : 0;
    return { hit: [], sound: [], quake: [], frames, perSlerp };
  }
  const events = readEvents(written);
  if (events === null) throw new Error(`motion ${clip.name}: its events are not in the shape the converter writes`);
  return events;
}

/**
 * A motion clip made to loop as the client loops it. A converted motion of N frames plays frame i at i / fps, so it
 * lasts (N - 1) / fps; looping, CModel::GetNextFrame (Source/_Common/Model.cpp:82-86) makes frame 0 the frame after
 * N - 1, so the last frame blends back into the first over one more frame. Here every track gets frame 0's value
 * again at N / fps. The frame step is read from the track with the most keys (a bone with keys has one per frame; a
 * bone held still has two, at 0 and at the end). A motion of a single frame is left as it is. The motion's `events`
 * come from the clip's userData (see `eventsOf`).
 */
export function loopMotion(clip: AnimationClip): LoopedMotion {
  let keyed: KeyframeTrack | undefined;
  for (const track of clip.tracks) if (keyed === undefined || track.times.length > keyed.times.length) keyed = track;
  const frames = Math.max(1, keyed?.times.length ?? 0);
  const events = eventsOf(clip, frames, keyed?.times[frames - 1] ?? 0);
  if (keyed === undefined || frames < 2) return { clip, frames, frameTime: () => 0, events };

  const times = keyed.times;
  const end = (times[frames - 1]! / (frames - 1)) * frames;
  const tracks = clip.tracks.map((track) => {
    const size = track.getValueSize();
    const values = new (track.values.constructor as Float32ArrayConstructor)(track.values.length + size);
    values.set(track.values);
    values.set(track.values.subarray(0, size), track.values.length);
    const looped = Float32Array.from([...track.times, end]);
    const Track = track.constructor as new (
      name: string,
      times: ArrayLike<number>,
      values: ArrayLike<number>,
      interpolation: ReturnType<KeyframeTrack['getInterpolation']>,
    ) => KeyframeTrack;
    return new Track(track.name, looped, values, track.getInterpolation());
  });

  return {
    clip: new AnimationClip(clip.name, -1, tracks),
    frames,
    frameTime: (n) => times[((n % frames) + frames) % frames]!,
    events,
  };
}
