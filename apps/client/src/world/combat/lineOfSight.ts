// The line of sight a skill, a wand's shot, a bow's and a yoyo's swing test on arrival (Piece 4's skill use, moved here
// in Piece 7 M2 for the attack loop to share):
//
//   CWorld::IntersectObjLine   _Common/WorldIntersect.cpp:745-813   a line against the world objects' collision meshes
//   ProcessMoveArrival         _Common/MoverMove.cpp:83-92          a skill's, 0.5 m over the feet
//   CMover::DoAttackMagic      _Common/MoverSkill.cpp:3230-3241     the wand's
//   CMover::DoAttackRange      MoverSkill.cpp:3301-3316             the bow's
//   ProcessMoveArrival         MoverMove.cpp:189-200                the yoyo's

import type { Vec3 } from '@flyffweb/protocol';
import { CAMERA_LINK_RANGE } from '../sim/camera';
import type { Ground } from '../sim/collision';
import { findTouchTriLine, touchedBy } from '../sim/object3d';

const f32 = Math.fround;

/** `vStart.y += 0.5f; vEnd.y += 0.5f` (`MoverMove.cpp:83-84`): the line runs half a metre over the feet. */
export const SIGHT_RAISE = f32(0.5);

/**
 * `g_WorldMng()->IntersectObjLine( NULL, vStart, vEnd, FALSE, FALSE )` from `from` to `to`, each half a metre up: whether
 * the line meets a world object's collision mesh, see-through ones included (`bSkipTrans` FALSE), not the terrain
 * (`bWithTerrain` FALSE). Neuz tests every object drawn this frame (`m_aobjCull`); here the objects the chase camera's test
 * takes around `from` (`CAMERA_LINK_RANGE`), which hold every one a line of a few metres from it can meet. No ground: no
 * object is in the way.
 */
export function sightBlocked(ground: Ground | undefined, from: Vec3, to: Vec3): boolean {
  if (ground === undefined) return false;
  const up = (p: Vec3): Vec3 => [p[0], f32(p[1] + SIGHT_RAISE), p[2]];
  const start = up(from);
  const end = up(to);
  for (const obj of ground.objectsNear(start[0], start[2], CAMERA_LINK_RANGE)) {
    const inv = touchedBy(obj, start, end);
    if (inv !== null && findTouchTriLine(obj, inv, start, end) !== null) return true;
  }
  return false;
}
