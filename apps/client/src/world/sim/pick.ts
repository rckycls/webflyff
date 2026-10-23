import type { Vec3 } from '@flyffweb/protocol';
import type { CollisionObject, Ground } from './collision';
import { add, cross, dot, intersectTri, normalize, scale, sub, vecLength } from './d3dx';
import { intersectRayTri } from './object3d';

/**
 * Where a tap on the world points: `CWorld::ClientPointToVector( ..., bObject TRUE )` (`Source/_Common/World3D.cpp:
 * 2318-2462`), which `CWndWorld::ControlGround` asks for the click's point (`WndWorldControlPlayer.cpp:314`), with the
 * `CWorld::PickObject` it calls (:2585-2653). D3D coordinates and floats, as `collision.ts`. `__VER` is 15, so
 * `__FIX_PICKING` is in; `__IAOBJ0622` (ships) is off.
 *
 * Simplified: the objects are tested on their collision meshes (`CollisionObject`), where Neuz tests the drawn mesh
 * (`CObj::Pick` with `bColl` FALSE); each is tested whole, without the model's box first (`IntersectBB`, which the
 * collision mesh's bounds stand in for in `object3d.ts` and would never turn a hit away); and of the objects the ray
 * meets the nearest is taken, where `PickObject` takes the first in its list of the objects on screen (`m_aobjCull`,
 * from its end), whose order is the renderer's.
 */

const f32 = Math.fround;

/** `CWorld::m_fFarPlane` (`World3D.cpp:50`). */
const FAR_PLANE = 512;
/** `fFarPlane /= 2` on the client (:2357-2360): how far from the camera the land is looked for. */
const LAND_REACH = FAR_PLANE / 2;
/** `D3DXVec3Length( &vPickRayAdd ) <= 0.000001f` (:2364): no way along the ray. */
const NO_STEP = f32(0.000001);

/**
 * The point a ray from the camera at `orig` along `dir` meets the world at, or null. `dir` is `GetPickRay`'s
 * (`vutil.cpp:577-595`): one unit along the camera's view axis, not of length one. `mpu` is the world's `m_iMPU`.
 *
 * The land (:2349-2416): from `orig` the ray is followed in steps of `dir` times `2 * MPU`, out to 256 m from the
 * camera. At each point on loaded land, the 3 x 3 cells of `MPU` around it, counted from the point itself (not from
 * the land's grid), are cut into two triangles at the land's height at their corners (`GetLandHeight`, 0 where no
 * land is loaded), and the nearest point any of them meets is kept (`D3DXIntersectTri`, either side: but land met
 * from below stops that row of cells, `__FIX_PICKING`).
 *
 * The objects (`PickObject` with `bOnlyTopPick`): those whose model picks (`CollisionObject.pick`, mdlObj.inc's
 * `bPick`) around each of the ray's points (`objectsNear`), each at the nearest of its triangles the ray meets
 * ahead. Then whichever of the two is nearer the camera (:2427-2455); an object only where no land is met.
 */
export function clientPointToVector(orig: Vec3, dir: Vec3, ground: Ground, mpu: number): Vec3 | null {
  const step = scale(dir, f32(mpu * 2));
  if (vecLength(step) <= NO_STEP) return null;
  const ray = normalize(step); // vRay, for __FIX_PICKING's test
  const height = (x: number, z: number): number => f32(ground.terrainHeight(x, z) ?? 0);
  const corner = (x: number, z: number): Vec3 => [x, height(x, z), z];
  const objects = new Set<CollisionObject>();
  let land: Vec3 | null = null;
  let nearest = FAR_PLANE; // fNearDist
  let at = orig; // vPickRayCur
  do {
    at = add(at, step);
    for (const object of ground.objectsNear(at[0], at[2])) if (object.pick) objects.add(object);
    if (ground.terrainHeight(at[0], at[2]) === null) continue; // VecInWorld, GetLandscape, isVisibile
    for (let z = -mpu; z <= mpu; z += mpu) {
      for (let x = -mpu; x <= mpu; x += mpu) {
        const cx = Math.trunc(f32(at[0] - x));
        const cz = Math.trunc(f32(at[2] - z));
        const v1 = corner(cx, cz);
        const v2 = corner(cx + mpu, cz);
        const v3 = corner(cx, cz + mpu);
        const v4 = corner(cx + mpu, cz + mpu);
        // the first triangle, else the second: one met but farther than the nearest yet hides the other
        let t = intersectTri(v1, v2, v3, orig, step);
        let normal = (): Vec3 => cross(sub(v1, v3), sub(v2, v3));
        if (t === null) {
          t = intersectTri(v2, v4, v3, orig, step);
          normal = () => cross(sub(v2, v3), sub(v4, v3));
        }
        if (t === null || !(t < nearest)) continue;
        if (dot(normalize(normal()), ray) < 0) break; // __FIX_PICKING: the land from below
        nearest = t;
        land = add(orig, scale(step, t));
      }
    }
  } while (vecLength(sub(orig, at)) < LAND_REACH);

  const object = pickObject(objects, orig, dir);
  if (object === null) return land;
  if (land === null) return object;
  const toObject = sub(object, orig);
  const toLand = sub(land, orig);
  return dot(toObject, toObject) < dot(toLand, toLand) ? object : land;
}

/** `PickObject`'s test (:2629-2650): the nearest point at which the ray meets one of `objects`, within the far plane. */
function pickObject(objects: Iterable<CollisionObject>, orig: Vec3, dir: Vec3): Vec3 | null {
  let nearest = FAR_PLANE;
  let found = false;
  for (const object of objects) {
    const t = intersectRayTri(object, orig, dir);
    if (t !== null && t < nearest) {
      nearest = t;
      found = true;
    }
  }
  return found ? add(orig, scale(dir, nearest)) : null;
}
