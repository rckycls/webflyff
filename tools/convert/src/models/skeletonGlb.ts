// Skeleton (`.chr`) to glTF: the bone hierarchy as nodes, nothing else.
//
// Rest pose: the client starts every skeleton from the bones' object-space TM (CModelObject::LoadBone,
// Source/_Common/ModelObject.cpp:548, `m_mUpdateBone[i] = m_pBones[i].m_mTM`), and only CMotion::AnimateBone
// (Bone.cpp:656) replaces it, bone by bone. The stored `localTm` is never read for drawing (only for effect
// positions, ModelObject.cpp:2442) and disagrees with `tm` relative to the parent on 249 of the client's 8,239 bones.
// So a node's local transform is its bone's `tm` relative to its parent's `tm`: at rest every joint's world matrix is
// exactly `Bone.tm`, which is what the skin's inverse bind matrices (`Bone.inverseTm`) were made against.
//
// Node names (R18): a bone's name when no other bone of its skeleton has it, else `<name>#<bone index>`. The model,
// skeleton and motion glbs all name joints this way, so the viewer can bind them by name. The joints hang under one
// root node named SKELETON_NODE, so the joints of a skeleton with several root bones still share a root (glTF
// skins require one).

import type { Document, Node } from '@gltf-transform/core';
import type { Skeleton } from '@flyffweb/formats';
import { invert, multiply, newDocument, setTransform, webMatrix, writeGlb } from './gltf';
import type { Mat4 } from './gltf';

/** The node every glb puts the joint hierarchy under. */
export const SKELETON_NODE = 'skeleton';

/** R18: the glTF node name of each bone of `skel`, by bone index. */
export function boneNodeNames(skel: Skeleton): string[] {
  const counts = new Map<string, number>();
  for (const bone of skel.bones) counts.set(bone.name, (counts.get(bone.name) ?? 0) + 1);
  return skel.bones.map((bone, i) => (counts.get(bone.name)! > 1 ? `${bone.name}#${i}` : bone.name));
}

/** One joint to build: its node name, parent index (-1 for a root) and rest world matrix (web space). */
export interface Joint {
  name: string;
  parent: number;
  world: Mat4;
}

/** The joints of a `.chr` skeleton. */
export function chrJoints(skel: Skeleton): Joint[] {
  const names = boneNodeNames(skel);
  return skel.bones.map((bone, i) => ({ name: names[i]!, parent: bone.parent, world: webMatrix(bone.tm) }));
}

/** Throws unless every parent is -1 or another joint, and following parents always ends at a root. */
function checkTree(joints: Joint[]): void {
  joints.forEach((joint, i) => {
    let at = i;
    for (let steps = 0; at !== -1; steps++) {
      const parent = joints[at]!.parent;
      if (parent !== -1 && (parent < 0 || parent >= joints.length || !Number.isInteger(parent))) {
        throw new Error(`bone ${at} (${joints[at]!.name}): parent ${parent} is not one of the ${joints.length} bones`);
      }
      if (steps > joints.length) throw new Error(`bone ${i} (${joint.name}): its parents form a loop`);
      at = parent;
    }
  });
}

/**
 * Adds the joint hierarchy to the default scene of `doc`, under a node named SKELETON_NODE, and returns the joint
 * nodes by joint index. Each node's TRS is its rest world matrix relative to its parent's.
 */
export function addJointNodes(doc: Document, joints: Joint[]): Node[] {
  checkTree(joints);
  const root = doc.createNode(SKELETON_NODE);
  doc.getRoot().getDefaultScene()!.addChild(root);
  const nodes = joints.map((joint) => doc.createNode(joint.name));
  joints.forEach((joint, i) => {
    const parent = joint.parent === -1 ? null : joints[joint.parent]!;
    setTransform(nodes[i]!, parent === null ? joint.world : multiply(invert(parent.world), joint.world));
    (parent === null ? root : nodes[joint.parent]!).addChild(nodes[i]!);
  });
  return nodes;
}

/** `skel` as a glb holding only its joint nodes. */
export async function buildSkeletonGlb(skel: Skeleton): Promise<Uint8Array> {
  const doc = newDocument();
  addJointNodes(doc, chrJoints(skel));
  return writeGlb(doc);
}
