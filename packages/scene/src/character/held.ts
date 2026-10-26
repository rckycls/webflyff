// Weapons and shields in the hand, where Neuz draws them.
//
// CMover::UpdateParts (Source/_Common/MoverEquip.cpp:279) loads a held item into the mover's CModelObject as one more
// element (LoadElement, :371) and hangs it from a bone with CModelObject::SetParent (ModelObject.cpp:893-916), which
// copies the skeleton's grip matrix of that bone (`m_mLocalRH`, `m_mLocalLH`, `m_mLocalShield`, `m_mLocalKnuckle`).
// Which bone is the client's to say (`slot`, see `BONE_OF`). CModelObject::Render (ModelObject.cpp:1131-1142) then draws
// the element with
//   m1 = local * m_mUpdateBone[bone] * mWorld
// the grip matrix, then the bone as the motion has it, then the mover; the item's own objects keep their TM under m1
// (pObject3D->Render, :1203), which the converter bakes into the vertices (modelGlb.ts). Here the item hangs under the
// bone's joint through a node whose matrix is the grip matrix in web space: three.js then draws it at
// joint.matrixWorld * grip, the same product for column vectors, and it follows the motion with the joint.
//
// LoadElement also unions the item's box into the model's (ModelObject.cpp:735-744, whose comment notes that a human
// holding a spear has the spear in the box), so the item's box goes into the character's (`addBox`).

import type { Object3D } from 'three';
import { Group, Matrix4, SkinnedMesh } from 'three';
import { toWebMatrix } from '@flyffweb/formats';
import type { SkeletonGrips } from '@flyffweb/formats';
import type { AssembledCharacter } from './assemble';
import { modelBoxOf } from './assemble';

/**
 * Where an item is held: the bone UpdateParts hangs it from (MoverEquip.cpp:378-425).
 *   - `right`: the right hand, a right-hand weapon (`default`, :399-400; a yoyo too, :393-394);
 *   - `left`: the left hand, a left-hand weapon (PARTS_LWEAPON, :410-414), a bow (:390-391), a yoyo's second copy
 *     (:395-396);
 *   - `shield`: the left forearm, a shield (PARTS_SHIELD, :419-422);
 *   - `knuckle`: the right forearm, a knuckle weapon (IK3_KNUCKLEHAMMER, :386-387).
 */
export type HeldSlot = 'right' | 'left' | 'shield' | 'knuckle';

/** The bone of each slot, as UpdateParts names it: GetRHandIdx, GetLHandIdx, GetLArmIdx, GetRArmIdx. */
const BONE_OF: Record<HeldSlot, 'rHand' | 'lHand' | 'lArm' | 'rArm'> = {
  right: 'rHand',
  left: 'lHand',
  shield: 'lArm',
  knuckle: 'rArm',
};

/**
 * The grip matrix of each bone, in the order Render tests them (ModelObject.cpp:1135-1142): the first whose bone is the
 * one the item hangs from is the one drawn. SetParent copied every matrix whose bone it is (:905-915), so where two
 * grips share a bone (a skeleton without bones named like the hands keeps both at 0, Bone.cpp:34, :122-125) the earlier
 * test wins.
 */
const GRIP_ORDER = [
  ['rHand', 'localRH'],
  ['lHand', 'localLH'],
  ['lArm', 'localShield'],
  ['rArm', 'localKnuckle'],
] as const;

/** The name of the node an item hangs from; what is below it is a held item, not a part of the body. */
const GRIP = 'grip';

/**
 * Hangs `item` from the hand (or forearm) of `slot`, as CModelObject::Render draws a held part, and puts its box into the
 * character's. `item` is the item's model, its glb's scene as GLTFLoader gives it: its box is in its userData
 * (`ModelBoxExtras`), and an item of an older conversion has none, so it adds nothing to the character's. Throws, with
 * nothing held, when the character has no grips (an older conversion, or a model without a skeleton), its skeleton has
 * no such bone, or the item's box is not in the shape the converter writes.
 */
export function attachHeld(character: AssembledCharacter, item: Object3D, slot: HeldSlot): void {
  const { grips } = character;
  if (grips === null) throw new Error('the skeleton has no grips (a conversion older than the held items)');
  const bone = grips[BONE_OF[slot]];
  const joint = jointOf(character, bone);
  const box = modelBoxOf(item, 'the held item');

  const grip = new Group();
  grip.name = GRIP;
  grip.matrix.copy(gripMatrix(grips, bone));
  grip.matrixAutoUpdate = false;
  grip.add(item);
  joint.add(grip);
  if (box !== null) character.addBox(box);
}

/**
 * The grip matrix Render multiplies an item hung from `bone` by, in web space. The last row is taken as 0, 0, 0, 1, as
 * the converter takes it for the bones (`webMatrix`, tools/convert/src/models/gltf.ts): the files store 1.0000001 there.
 */
function gripMatrix(grips: SkeletonGrips, bone: number): Matrix4 {
  const [, local] = GRIP_ORDER.find(([at]) => grips[at] === bone)!;
  const m = new Matrix4().fromArray(toWebMatrix(Float32Array.from(grips[local])));
  m.elements[3] = 0;
  m.elements[7] = 0;
  m.elements[11] = 0;
  m.elements[15] = 1;
  return m;
}

/**
 * The joint of bone `index` of the character's skeleton. A body part's skinned mesh lists every bone of its `.chr` in
 * bone order (the converter's skin joins the joints by bone index, modelGlb.ts), and assembleCharacter re-binds it to
 * the shared joints keeping that order, so its `skeleton.bones[index]` is the joint. A held item hanging from a grip
 * is no part of the body and is not looked in.
 */
function jointOf(character: AssembledCharacter, index: number): Object3D {
  const joint = bodyMesh(character.root)?.skeleton.bones[index];
  if (joint === undefined) throw new Error(`the skeleton has no bone ${index} to hold an item with`);
  return joint;
}

/** The first skinned mesh under `object` that is not part of a held item. */
function bodyMesh(object: Object3D): SkinnedMesh | null {
  if (object instanceof SkinnedMesh) return object;
  for (const child of object.children) {
    if (child.name === GRIP) continue;
    const mesh = bodyMesh(child);
    if (mesh !== null) return mesh;
  }
  return null;
}
