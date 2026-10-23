import type { Vec3 } from '@flyffweb/protocol';
import type { Ground } from './collision';
import { add, dot, normalize, scale, sub, toFloats, vecLength } from './d3dx';
import { findTouchTriLine, touchedBy } from './object3d';

/**
 * The chase camera kept out of the terrain and the world's objects: `CWorld::CheckBound` (`Source/_Common/World3D.cpp`)
 * and the `CWorld::IntersectObjLine2` it calls (`WorldIntersect.cpp`), in D3D coordinates and floats.
 */

const f32 = Math.fround;

/** FOR_LINKMAP's `nRange` in `IntersectObjLine2` (`nRange = 5;`, `WorldIntersect.cpp:849-850`): the camera's reach. */
export const CAMERA_LINK_RANGE = 5;

/** `CheckBound` (`World3D.cpp:1697`, `__FIX_PICKING`): the camera keeps this far over the terrain. */
const CAMERA_OVER_TERRAIN = f32(0.6);

/**
 * `CWorld::CheckBound( &m_vPos, &m_vLookAt, ... )` (`World3D.cpp:1658-1777`): where the chase camera goes so that it
 * stays out of the terrain and the objects between it and `target` (`m_vLookAt`, which `CBackCamera::Process` puts
 * 0.4 over the mover, `Camera.cpp:388`): `camera` itself when nothing is in the way, else the nearer of the two finds.
 * Its distance from `target` is `CheckBound`'s `fLength` either way. The camera's easing back after a hit
 * (`m_bStart`, `m_fLength2`, `Camera.cpp:398-423`) is the camera's.
 *
 * The terrain: from 1 out toward the camera, a point every 0.1 for 10 times the distance (so up to 1 past the camera)
 * is tested against the terrain's height + 0.6 (`GetLandHeight`, 0 where no land is loaded). The water test (keeping
 * the camera out of water the mover is above, :1674-1721) is left out: `Ground` has no water. The objects:
 * `IntersectObjLine2` below.
 */
export function cameraBound(target: Vec3, camera: Vec3, ground: Ground): Vec3 {
  const dest = toFloats(target); // vDest
  const eye = toFloats(camera); // vPos
  const towards = sub(eye, dest);
  const length = vecLength(towards);
  const step = scale(normalize(towards), f32(1 / 10)); // tempVec /= 10 multiplies by 1.0f / 10
  let p = add(dest, scale(step, 10));
  let land: Vec3 | null = null;
  const count = Math.trunc(f32(length * 10));
  for (let i = 0; i < count; i++) {
    p = add(p, step);
    if (p[1] < f32(f32(ground.terrainHeight(p[0], p[2]) ?? 0) + CAMERA_OVER_TERRAIN)) {
      land = p;
      break;
    }
  }
  const object = intersectObjLine2(dest, eye, ground);
  if (land !== null && object !== null) {
    const toLand = sub(land, dest);
    const toObject = sub(object, dest);
    return dot(toLand, toLand) < dot(toObject, toObject) ? land : object;
  }
  return land ?? object ?? eye;
}

/**
 * `CWorld::IntersectObjLine2( &vIntersect, *vDest, *vPos, TRUE )` (`WorldIntersect.cpp:832-891`, `__CAM_FAST_RECOVER`)
 * on the world's objects around `from`: the nearest point where the line to `to` meets one, or null. A see-through
 * model (`trans`) is not tested at all (`bSkipTrans`, :854-855). After each hit the C++ sets the `Segment3`'s
 * direction to the end point itself (`segment.Direction = vTempEnd`, :875, :880), so the boxes of the objects after
 * the first hit are tested against the line `TestIntersectionOBB_Line` then makes, from the middle of this one out
 * half its length times the end point's position each way; that is copied. (The controls' loop, :922-951, is only
 * reached without a hit; left out: `Ground` holds no controls.)
 */
function intersectObjLine2(from: Vec3, to: Vec3, ground: Ground): Vec3 | null {
  const dir = sub(to, from);
  let lineStart = from;
  let lineEnd = to;
  let hit: Vec3 | null = null;
  let shortest = 0;
  for (const obj of ground.objectsNear(from[0], from[2], CAMERA_LINK_RANGE)) {
    if (obj.trans) continue;
    const inv = touchedBy(obj, lineStart, lineEnd);
    if (inv === null) continue;
    const t = findTouchTriLine(obj, inv, from, to);
    if (t === null) continue;
    if (hit === null || t < shortest) shortest = t;
    hit = add(from, scale(dir, shortest));
    // Segment3 (xUtil3D.cpp:296-302): the middle and half the length, then Origin -/+ Extent * Direction
    const middle = scale(add(from, to), 0.5);
    const reach = scale(to, f32(vecLength(dir) * 0.5));
    lineStart = sub(middle, reach);
    lineEnd = add(middle, reach);
  }
  return hit;
}
