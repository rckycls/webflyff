// Motion (`.ani`) to glTF: the skeleton's joint nodes (same names and rest pose as its skeleton glb) and one
// animation. The viewer loads the skeleton once and binds each motion's channels to it by node name.
//
// CMotion::AnimateBone (Source/_Common/Bone.cpp:656) sets every bone's local matrix each frame:
//   - a bone with keys: from the slerped quaternion and the lerped position of the two frames around the current one
//     (rotation, then translation; no scale). Each key becomes a LINEAR translation and rotation sample, frame i at
//     i / motionFps(perSlerp) seconds, rotations normalized (R17: 103 keys of the client are not unit quaternions),
//     plus a constant scale of 1 (R28), since the node's rest scale is not always 1.
//   - a bone without keys: the track's `defaultTm` (Bone.cpp:773), which often differs from the skeleton's rest pose.
//     It becomes constant translation, rotation and scale channels (R27, R28).
// So every track drives its bone's translation, rotation and scale for the whole clip. A constant channel has a key
// at 0 and one at the clip's end, (frames - 1) / fps, so it does not change the clip's length.
//
// Motions bind to their skeleton by bone index, as the C++ does (the motion's own bone names differ from the
// skeleton's in 95 client motions), so track i animates the node named after skeleton bone i.

import type { Document, Node } from '@gltf-transform/core';
import { motionFps, toWebPosition, toWebQuaternion } from '@flyffweb/formats';
import type { BoneTrack, Motion, MotionKey, Skeleton } from '@flyffweb/formats';
import { addAccessor, d3dTrs, newDocument, normalizeQuaternion, writeGlb } from './gltf';
import type { Quat, Vec3 } from './gltf';
import { addJointNodes, chrJoints } from './skeletonGlb';

/** What an animation does to one node. */
export interface AnimatedNode {
  node: Node;
  /** One value per frame, or one for the whole clip. */
  translations: Vec3[];
  rotations: Quat[];
  /** A scale for the whole clip, or null to leave the node's own scale alone. */
  scale: Vec3 | null;
}

/** Per-frame translations and rotations from TM keys, in web space. */
export function fromKeys(keys: MotionKey[]): Pick<AnimatedNode, 'translations' | 'rotations'> {
  return {
    translations: keys.map((key) => toWebPosition(key.position)),
    rotations: keys.map((key) => normalizeQuaternion(toWebQuaternion(key.rotation))),
  };
}

/** Bone track i drives `joints[i]`: its keys and scale 1, or its `defaultTm` when it has none (R27, R28). */
export function boneTargets(tracks: BoneTrack[], joints: Node[]): AnimatedNode[] {
  return tracks.map((track, i) => {
    const node = joints[i]!;
    if (track.keys !== null) return { node, ...fromKeys(track.keys), scale: [1, 1, 1] };
    if (track.defaultTm === null) throw new Error(`bone track ${i} (${track.name}) has neither keys nor a TM`);
    const pose = d3dTrs(track.defaultTm);
    return { node, translations: [pose.translation], rotations: [pose.rotation], scale: pose.scale };
  });
}

/**
 * Adds an animation called `name` of `frames` frames driving `targets`: per-frame values play frame i at
 * i / motionFps(perSlerp) seconds; a single value holds for the whole clip. Adds nothing when there are no targets.
 */
export function addKeyAnimation(
  doc: Document,
  name: string,
  targets: AnimatedNode[],
  frames: number,
  perSlerp: number,
): void {
  if (targets.length === 0) return;
  const fps = motionFps(perSlerp);
  if (!(fps > 0) || !Number.isFinite(fps)) {
    throw new Error(`${name}: perSlerp ${perSlerp} plays at ${fps} frames a second`);
  }
  if (!Number.isInteger(frames) || frames < 1) throw new Error(`${name}: ${frames} frames`);

  // Inputs are shared by every sampler of the animation, made when first needed.
  let everyFrame: ReturnType<typeof addAccessor> | undefined;
  let wholeClip: ReturnType<typeof addAccessor> | undefined;
  const inputFor = (count: number): ReturnType<typeof addAccessor> => {
    if (count === frames) {
      return (everyFrame ??= addAccessor(doc, 'SCALAR', Float32Array.from({ length: frames }, (_, i) => i / fps)));
    }
    const ends = frames > 1 ? [0, (frames - 1) / fps] : [0];
    return (wholeClip ??= addAccessor(doc, 'SCALAR', Float32Array.from(ends)));
  };

  const animation = doc.createAnimation(name);
  const addChannel = (node: Node, path: 'translation' | 'rotation' | 'scale', values: number[][]): void => {
    if (values.length !== 1 && values.length !== frames) {
      throw new Error(`${name}: ${node.getName()} ${path} has ${values.length} values for ${frames} frames`);
    }
    const input = inputFor(values.length);
    const repeated = values.length === 1 ? Array.from({ length: input.getCount() }, () => values[0]!) : values;
    const output = addAccessor(doc, values[0]!.length === 4 ? 'VEC4' : 'VEC3', Float32Array.from(repeated.flat()));
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    animation.addSampler(sampler).addChannel(
      doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler),
    );
  };
  for (const { node, translations, rotations, scale } of targets) {
    addChannel(node, 'translation', translations);
    addChannel(node, 'rotation', rotations);
    if (scale !== null) addChannel(node, 'scale', [scale]);
  }
}

/**
 * `motion` as a glb: `skel`'s joint nodes and one animation named `name`. Throws when the motion has more bone tracks
 * than the skeleton has bones (track i animates bone i), or none.
 */
export async function buildMotionGlb(skel: Skeleton, motion: Motion, name: string): Promise<Uint8Array> {
  if (motion.tracks.length > skel.bones.length) {
    throw new Error(`${name}: ${motion.tracks.length} bone tracks, but the skeleton has ${skel.bones.length} bones`);
  }
  if (motion.tracks.length === 0) throw new Error(`${name}: the motion has no bone tracks`);
  const doc = newDocument();
  const nodes = addJointNodes(doc, chrJoints(skel));
  addKeyAnimation(doc, name, boneTargets(motion.tracks, nodes), motion.frameCount, motion.perSlerp);
  return writeGlb(doc);
}
