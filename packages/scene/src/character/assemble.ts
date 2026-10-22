// Puts a character together from separately converted glbs: one skeleton, any number of body parts, and the motion
// that drives them.
//
// Every part glb carries its own copy of the skeleton's joints and its own skin (models/modelGlb.ts in the converter).
// Here each part's skinned meshes are re-bound to the one shared skeleton by joint name (ruling R18 names joints the
// same in every glb of a skeleton), so one motion moves them all. A part keeps its own inverse bind matrices: they
// come from its .chr's Bone.inverseTm, which is not the inverse of the rest pose for 326 of the client's bones, so
// recomputing them from the shared skeleton would bend those parts.

import type { Material, Object3D } from 'three';
import { AnimationClip, AnimationMixer, Group, KeyframeTrack, Skeleton, SkinnedMesh } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { TextureCache } from '../assets/loaders';
import { applyTextures } from '../assets/loaders';

/** The node every converted glb hangs its joints under (skeletonGlb.ts SKELETON_NODE). */
const SKELETON_NODE = 'skeleton';
/** The most detailed LOD of a model (modelGlb.ts); the character view draws this one. */
const LOD0 = 'lod0';

export interface AssembledCharacter {
  /** The shared skeleton and every part's lod0. */
  root: Object3D;
  /** An animation mixer on `root`: clips of the skeleton's motions bind to its joints by name. */
  mixer: AnimationMixer;
  /** Gives the textures back to the cache and disposes the parts' geometry and materials. Safe to call twice. */
  release(): void;
}

/**
 * Assembles `skeleton` (a skeleton glb) and `parts` (part glbs of that skeleton). Resolves once every part has its
 * textures. Throws when the skeleton has no `skeleton` node, a part has no `lod0` node, or a part is skinned to a
 * joint the skeleton does not have; the message names the part by its index in `parts`.
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

  // Checked and re-bound before anything is acquired, so a failure leaves nothing to give back.
  const lods = parts.map((part, i) => {
    const lod = part.scene.getObjectByName(LOD0);
    if (lod === undefined) throw new Error(`part ${i} has no "${LOD0}" node`);
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
}

/**
 * A motion clip made to loop as the client loops it. A converted motion of N frames plays frame i at i / fps, so it
 * lasts (N - 1) / fps; looping, CModel::GetNextFrame (Source/_Common/Model.cpp:82-86) makes frame 0 the frame after
 * N - 1, so the last frame blends back into the first over one more frame. Here every track gets frame 0's value
 * again at N / fps. The frame step is read from the track with the most keys (a bone with keys has one per frame; a
 * bone held still has two, at 0 and at the end). A motion of a single frame is left as it is.
 */
export function loopMotion(clip: AnimationClip): LoopedMotion {
  let keyed: KeyframeTrack | undefined;
  for (const track of clip.tracks) if (keyed === undefined || track.times.length > keyed.times.length) keyed = track;
  const frames = Math.max(1, keyed?.times.length ?? 0);
  if (keyed === undefined || frames < 2) return { clip, frames, frameTime: () => 0 };

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
  };
}
