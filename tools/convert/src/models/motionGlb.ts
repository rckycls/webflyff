// Motion (`.ani`) to glTF: the skeleton's joint nodes (same names and rest pose as its skeleton glb) and one
// animation. The viewer loads the skeleton once and binds each motion's channels to it by node name.
//
// Keys: CMotion::AnimateBone (Source/_Common/Bone.cpp:656) builds a keyed bone's local matrix from the slerped
// quaternion and the lerped position of the two frames around the current one (rotation, then translation; no
// scale), so each key becomes a LINEAR translation and rotation sample. Frame i plays at i / motionFps(perSlerp)
// seconds. Rotations are normalized (R17: 103 keys of the client are not unit quaternions).
//
// Motions bind to their skeleton by bone index, as the C++ does (the motion's own bone names differ from the
// skeleton's in 95 client motions), so track i animates the node named after skeleton bone i.
//
// Tracks without keys get no channel (R19 as ruled for this task): the bone keeps the skeleton's rest pose. The C++
// uses the track's `defaultTm` instead; where the two differ is listed in the task report.

import type { Document, Node } from '@gltf-transform/core';
import { motionFps, toWebPosition, toWebQuaternion } from '@flyffweb/formats';
import type { BoneTrack, Motion, MotionKey, Skeleton } from '@flyffweb/formats';
import { addAccessor, newDocument, normalizeQuaternion, writeGlb } from './gltf';
import { addJointNodes, chrJoints } from './skeletonGlb';

export interface KeyedNode {
  node: Node;
  /** One key per frame. */
  keys: MotionKey[];
}

/** Bone track i drives `joints[i]`; tracks without keys drive nothing (R19). */
export function keyedJoints(tracks: BoneTrack[], joints: Node[]): KeyedNode[] {
  return tracks.flatMap((track, i) => (track.keys === null ? [] : [{ node: joints[i]!, keys: track.keys }]));
}

/**
 * Adds an animation called `name` that drives the translation and rotation of each target node from its keys, frame
 * i at i / motionFps(perSlerp) seconds. Every target must have the same number of keys. Adds nothing when there
 * are no targets.
 */
export function addKeyAnimation(doc: Document, name: string, targets: KeyedNode[], perSlerp: number): void {
  if (targets.length === 0) return;
  const fps = motionFps(perSlerp);
  if (!(fps > 0) || !Number.isFinite(fps)) {
    throw new Error(`${name}: perSlerp ${perSlerp} plays at ${fps} frames a second`);
  }
  const frames = targets[0]!.keys.length;
  if (targets.some((t) => t.keys.length !== frames)) throw new Error(`${name}: targets have different key counts`);

  const input = addAccessor(doc, 'SCALAR', Float32Array.from({ length: frames }, (_, i) => i / fps));
  const animation = doc.createAnimation(name);
  for (const { node, keys } of targets) {
    const translations = new Float32Array(frames * 3);
    const rotations = new Float32Array(frames * 4);
    keys.forEach((key, i) => {
      translations.set(toWebPosition(key.position), i * 3);
      rotations.set(normalizeQuaternion(toWebQuaternion(key.rotation)), i * 4);
    });
    const outputs = [
      ['translation', addAccessor(doc, 'VEC3', translations)],
      ['rotation', addAccessor(doc, 'VEC4', rotations)],
    ] as const;
    for (const [path, output] of outputs) {
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      const channel = doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler);
      animation.addSampler(sampler).addChannel(channel);
    }
  }
}

/**
 * `motion` as a glb: `skel`'s joint nodes and one animation named `name`. Throws when the motion has more bone tracks
 * than the skeleton has bones (track i animates bone i), or no track with keys.
 */
export async function buildMotionGlb(skel: Skeleton, motion: Motion, name: string): Promise<Uint8Array> {
  if (motion.tracks.length > skel.bones.length) {
    throw new Error(`${name}: ${motion.tracks.length} bone tracks, but the skeleton has ${skel.bones.length} bones`);
  }
  const doc = newDocument();
  const nodes = addJointNodes(doc, chrJoints(skel));
  const targets = keyedJoints(motion.tracks, nodes);
  if (targets.length === 0) throw new Error(`${name}: no bone of the motion has keys`);
  addKeyAnimation(doc, name, targets, motion.perSlerp);
  return writeGlb(doc);
}
