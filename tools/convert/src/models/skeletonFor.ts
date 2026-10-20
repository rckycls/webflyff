// Which skeleton a model is drawn with, and which skeleton a motion animates.
//
// A model's skin objects, and its objects hung from a bone (parent type GMT_BONE), are drawn with the bones of the
// skeleton the CModelObject holds: its own (`m_pBaseBone`, stored in the .o3d) or, when it has none, the loaded
// `.chr` (CObject3D::SetExternBone, Source/_Common/Object3D.h:285; CObject3D::Animate, Object3D.cpp:2601 for
// bone-parented objects). The client loads that `.chr` by the mover's or item's own name
// (CModelMng::LoadModel, ModelMng.cpp:240-258: `<model>.chr`, for items only when it exists, e.g. wings and rides),
// and character parts use the player skeletons mvr_male / mvr_female.
//
// Rules, first match wins:
//   1. The model has its own bones                                   -> own
//   2. No skin object and no object hung from a bone                 -> none
//   3. part_m* / part_male*  -> mvr_male;  part_f* / part_female*    -> mvr_female
//   4. <model>.chr exists                                            -> chr
//   5. otherwise: "skinned model without skeleton" (thrown; the stage reports the model as failed)
//
// Rules 2 and 4 are wider than the task brief, which asked for "no skin objects" and "mvr_<x> with mvr_<x>.chr":
// 233 caps and two movers have no skin object but hang their mesh from a bone of the wearer's skeleton, and 11 rides
// (Item_RidRid*.o3d) are skinned to their own Item_RidRid*.chr. With the brief's rules the caps would float at the
// character's feet and the rides would fail. See the task report.

import type { O3dModel } from '@flyffweb/formats';

export type SkeletonChoice = { kind: 'own' } | { kind: 'chr'; chr: string } | { kind: 'none' };

/** GMT_BONE: an object's parent type when its parent is a skeleton bone. */
const GMT_BONE = 2;

/**
 * The skeleton `model` (file base name `o3dBase`, any case) is drawn with. `has(chrBase)` says whether
 * `Model/<chrBase>.chr` exists; it is asked with lower-case names, and `chr` in the result is lower case too.
 */
export function skeletonFor(o3dBase: string, model: O3dModel, has: (chrBase: string) => boolean): SkeletonChoice {
  if (model.baseBones !== null) return { kind: 'own' };
  const usesBones = model.lods.some((group) =>
    group.some((object) => object.kind === 'skin' || object.parentType === GMT_BONE),
  );
  if (!usesBones) return { kind: 'none' };
  const base = o3dBase.toLowerCase();
  if (/^part_(m|male)/.test(base)) return { kind: 'chr', chr: 'mvr_male' };
  if (/^part_(f|female)/.test(base)) return { kind: 'chr', chr: 'mvr_female' };
  if (has(base)) return { kind: 'chr', chr: base };
  throw new Error(
    `skinned model without skeleton: ${o3dBase} uses bones, but has none of its own and there is no ${base}.chr`,
  );
}

/**
 * The skeleton a motion file (base name `aniBase`) animates: the longest of `chrBases` that `aniBase` starts with,
 * followed by "_" (`Mvr_male_GenStand` -> `mvr_male`), ignoring case; null when none fits. Motion files are named
 * `<model>_<motion>.ani` (CModelMng::MakeMotionName, ModelMng.cpp:124). The result is the entry of `chrBases` as given.
 */
export function skeletonOfMotion(aniBase: string, chrBases: Iterable<string>): string | null {
  const name = aniBase.toLowerCase();
  let best: string | null = null;
  for (const chr of chrBases) {
    if (name.startsWith(`${chr.toLowerCase()}_`) && (best === null || chr.length > best.length)) best = chr;
  }
  return best;
}
