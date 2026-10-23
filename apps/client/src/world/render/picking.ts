// A tap on the drawing, turned into the D3D point the own mover walks to: the camera's ray through the tapped point,
// in web coordinates as three.js draws, goes to the rules as the D3D ray `GetPickRay` makes (`vutil.cpp:577-595`), and
// `clientPointToVector` (`sim/pick.ts`) finds where it meets the land or a pickable object. A mover nearer along the
// ray than that point takes the tap instead, as `CWndWorld::OnLButtonDown` selects the mover under the cursor rather
// than walk (`WndWorld.cpp:6878-6993`, `SelectObj`): which, targeting being Piece 4's, does nothing yet.

import { toWebPosition } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/formats';
import type { Camera } from 'three';
import { Raycaster, Vector2, Vector3 } from 'three';
import type { Ground } from '../sim/collision';
import { clientPointToVector } from '../sim/pick';

const raycaster = new Raycaster();
const ndc = new Vector2();
const forward = new Vector3();

/**
 * The D3D point a tap at (`ndcX`, `ndcY`) (normalized device coordinates of `camera`'s drawing, as last drawn) sends
 * the own mover to, or null: where the ray meets nothing within reach, or where `moverAt` says a mover is nearer along
 * it (the distance from the camera at which the ray meets the nearest mover drawn, the own one left out, or null).
 * `ground` and `mpu` are the world's (`Ground`, D3D).
 */
export function pickGround(
  camera: Camera, ndcX: number, ndcY: number, ground: Ground, mpu: number,
  moverAt: (raycaster: Raycaster) => number | null,
): Vec3 | null {
  raycaster.setFromCamera(ndc.set(ndcX, ndcY), camera);
  const { origin, direction } = raycaster.ray;
  // GetPickRay's direction is one unit along the view axis (v.z = 1), not of length one
  const along = direction.dot(camera.getWorldDirection(forward));
  if (!(along > 0)) return null;
  // web to D3D: z mirrored, as toWebPosition does the other way
  const orig = toWebPosition([origin.x, origin.y, origin.z]);
  const dir = toWebPosition([direction.x / along, direction.y / along, direction.z / along]);
  const point = clientPointToVector(orig, dir, ground, mpu);
  const mover = moverAt(raycaster);
  if (mover === null) return point;
  // the mirror between D3D and web keeps distances
  if (point === null || mover < Math.hypot(point[0] - orig[0], point[1] - orig[1], point[2] - orig[2])) return null;
  return point;
}
