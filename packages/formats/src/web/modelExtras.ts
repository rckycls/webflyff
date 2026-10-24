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
}

/**
 * `extras.grips` of a skeleton glb's scene: where a held item sits, from the `.chr` (`CBones::LoadBone`, Bone.cpp:76).
 * `rHand` and `lHand` are the skeleton's bone indices of the hands (`m_nRHandIdx` / `m_nLHandIdx`, 0 when no bone is
 * named like one). The matrices are the 16 floats of a D3DXMATRIX in memory order, the item's transform relative to
 * the bone it hangs from (`CModelObject::Render`, ModelObject.cpp:1134-1142): `localRH` for an item on the right hand,
 * `localLH` on the left hand, `localShield` on the left forearm bone and `localKnuckle` on the right forearm bone.
 */
export interface SkeletonGrips {
  rHand: number;
  lHand: number;
  localRH: number[];
  localLH: number[];
  localShield: number[];
  localKnuckle: number[];
}

/** `extras` of a skeleton glb's scene. */
export interface SkeletonExtras {
  grips: SkeletonGrips;
}
