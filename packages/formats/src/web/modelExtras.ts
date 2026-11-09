// What the converter writes on the scene of a model glb and of a skeleton glb (tools/convert/src/models/modelGlb.ts,
// skeletonGlb.ts) and the scene reads back from the scene's userData, where GLTFLoader puts a scene's extras
// (`assembleCharacter`, packages/scene/src/character/assemble.ts). Types only: the shape is the contract. Both are in
// D3D space, as the files store them: not converted to the web's handedness, since they feed rules, not drawing.

import type { Vec3 } from '../binary/BinaryReader';

/**
 * `extras` of a model glb's scene: the box of the `.o3d` file. It is `CObject3D::m_vBBMin` / `m_vBBMax`, the
 * "representative bounding box" in the file header (Object3D.cpp:980-981), which `CModelObject::LoadElement` unions
 * over every part it loads (ModelObject.cpp:738-744). It is the whole model's box: not the union of the boxes of its
 * objects, which are in object space and differ from it for 3,164 of the client's 4,199 models. Some files store a
 * minimum above the maximum on an axis; the box is written as stored.
 */
export interface ModelBoxExtras {
  bbMin: Vec3;
  bbMax: Vec3;
  /**
   * 2026-11-09: a weapon's sword-trail points `m_vForce1..4` (D3D, as stored), written when the first two are set
   * (`x != 0`, as `CreateParticle` tests them, ModelObject.cpp): the line the upgrade and element glow runs along.
   */
  forces?: Vec3[];
}

/**
 * `extras.grips` of a skeleton glb's scene: where a held item sits, from the `.chr` (`CBones::LoadBone`, Bone.cpp:76).
 * `rHand`, `lHand`, `rArm` and `lArm` are the skeleton's bone indices of the hands and the forearms (`m_nRHandIdx`,
 * `m_nLHandIdx`, `m_nRArmIdx`, `m_nLArmIdx`, found by name at Bone.cpp:123-129; 0 when no bone is named like one).
 * The matrices are the 16 floats of a D3DXMATRIX in memory order, the item's transform relative to the bone it hangs
 * from. `CModelObject::Render` (ModelObject.cpp:1134-1142) tests the bone a part hangs from in this order, and
 * `SetParent` (:906-915) copies the matrix with the same pairing:
 *   - the right hand (`rHand`)    -> `localRH`
 *   - the left hand (`lHand`)     -> `localLH`
 *   - the LEFT forearm (`lArm`)   -> `localShield`
 *   - the RIGHT forearm (`rArm`)  -> `localKnuckle`
 * So a shield is attached to the left forearm bone and a knuckle weapon to the right forearm bone, not to a hand.
 */
export interface SkeletonGrips {
  rHand: number;
  lHand: number;
  rArm: number;
  lArm: number;
  localRH: number[];
  localLH: number[];
  localShield: number[];
  localKnuckle: number[];
}

/** `extras` of a skeleton glb's scene. */
export interface SkeletonExtras {
  grips: SkeletonGrips;
}
