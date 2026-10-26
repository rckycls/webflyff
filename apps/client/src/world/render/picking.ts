// A tap on the drawing, turned into what it lands on: a mover, as `CWndWorld::PickObj` finds one with
// `CWorld::PickObject_Fast` (`WndWorld.cpp:6299-6351`, `World3D.cpp:2655-2733`), else the D3D point the own mover walks to.
// The camera's ray through the tapped point, in web coordinates as three.js draws, goes to the rules as the D3D ray
// `GetPickRay` makes (`vutil.cpp:577-595`); `pickMover` tests it against the movers' oriented bounding boxes, and
// `clientPointToVector` (`sim/pick.ts`) finds where it meets the land or a pickable object. A tap that lands on a mover
// selects it rather than walks (`CWndWorld::OnLButtonDown`, `WndWorld.cpp:6855-6993`: `SelectObj`, else `m_bFreeMove`).

import { toWebPosition } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/formats';
import type { ModelBox } from '@flyffweb/scene';
import type { Camera } from 'three';
import { Raycaster, Vector2, Vector3 } from 'three';
import type { Ground } from '../sim/collision';
import { intersectTri, sub, transformCoord, vecLength } from '../sim/d3dx';
import type { Matrix } from '../sim/d3dx';
import { FAR_PLANE, clientPointToVector } from '../sim/pick';

const f32 = Math.fround;

const raycaster = new Raycaster();
const ndc = new Vector2();
const forward = new Vector3();

/** A ray in D3D coordinates: where it starts (the camera) and which way it goes. */
export interface PickRay {
  orig: Vec3;
  /** `GetPickRay`'s direction: one unit along the view axis, not of length one. */
  dir: Vec3;
}

/**
 * `GetPickRay` (`vutil.cpp:577-595`) for a tap at (`ndcX`, `ndcY`) (normalized device coordinates of `camera`'s drawing,
 * as last drawn), in D3D coordinates: the web ray's z mirrored, as `toWebPosition` does the other way, and its direction
 * scaled to one unit along the camera's view axis (`v.z = 1`). Null where the point is not in front of the camera.
 */
export function pickRay(camera: Camera, ndcX: number, ndcY: number): PickRay | null {
  raycaster.setFromCamera(ndc.set(ndcX, ndcY), camera);
  const { origin, direction } = raycaster.ray;
  const along = direction.dot(camera.getWorldDirection(forward));
  if (!(along > 0)) return null;
  return {
    orig: toWebPosition([origin.x, origin.y, origin.z]),
    dir: toWebPosition([direction.x / along, direction.y / along, direction.z / along]),
  };
}

/**
 * `CMover::m_matWorld` of a mover drawn at `pos` turned `angle` degrees with scale `scale` (D3D, the 16 floats of a
 * `D3DXMATRIX` in memory order): `CObj::UpdateMatrix` (`Obj.cpp:139-175`) multiplies the scale, the rotation and the
 * translation that `CMover::Interpolate` keeps (`Mover.cpp:4135-4216`): `D3DXMatrixRotationYawPitchRoll( -m_fScrAngle,
 * -m_fScrAngleX, 0 )`, which is the turn about y alone while the pitch is 0 (a mover on the ground; the web client has no
 * flying), and `D3DXMatrixTranslation( m_vScrPos )`.
 */
export function moverMatrix(pos: Vec3, angle: number, scale: number): Float32Array {
  // D3DXToRadian( -m_fScrAngle ): the degrees times D3DX_PI / 180.0f, in floats
  const yaw = f32(f32(-angle) * f32(f32(Math.PI) / 180));
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  // scale * D3DXMatrixRotationY( yaw ) * translation: _11 = cos, _13 = -sin, _31 = sin, _33 = cos
  return new Float32Array([
    scale * c, 0, -scale * s, 0,
    0, scale, 0, 0,
    scale * s, 0, scale * c, 0,
    pos[0], pos[1], pos[2], 1,
  ]);
}

/**
 * A mover `pickMover` may take: its object ID, the box of its model (`CModel::m_vMin`, `m_vMax`, in the model's own D3D
 * space), the world matrix it is drawn with (`moverMatrix`), whether it is dead, and whether it is a player.
 */
export interface PickCandidate {
  objectId: number;
  box: ModelBox;
  world: Matrix;
  dead: boolean;
  isPlayer: boolean;
}

/** `CModel::IsNullBoundBox` (`Model.h:138`): a box with no size, or the one a model starts with (`m_vMin.x == 65535`). */
const isNullBox = ({ min, max }: ModelBox): boolean =>
  (min[0] === max[0] && min[1] === max[1] && min[2] === max[2]) || min[0] === 65535;

/** The triangles of `CModel::IntersectBB`'s `anIntexTable` (`Model.cpp:119-127`): corner indices, three to a triangle. */
const BB_TRIANGLES = [
  0, 1, 2, 0, 2, 3,
  0, 4, 5, 0, 5, 1,
  4, 5, 6, 4, 6, 7,
  3, 2, 6, 3, 6, 7,
  0, 3, 7, 0, 7, 4,
  1, 2, 6, 1, 6, 5,
] as const;

/** `SetBB` (`xUtil3D.cpp:26-59`): the eight corners of a box, the top four first (`y` max), each four from `min` x and z. */
function boxCorners({ min, max }: ModelBox): Vec3[] {
  return [
    [min[0], max[1], min[2]], [max[0], max[1], min[2]], [max[0], max[1], max[2]], [min[0], max[1], max[2]],
    [min[0], min[1], min[2]], [max[0], min[1], min[2]], [max[0], min[1], max[2]], [min[0], min[1], max[2]],
  ];
}

/**
 * `CModel::IntersectBB` (`Model.cpp:104-144`): the 12 triangles of the box, its corners moved by `world`
 * (`D3DXVec3TransformCoord`), each tried in the table's order against the ray from `orig` along `dir` with
 * `D3DXIntersectTri`, either side. The distance (in lengths of `dir`) of the first triangle the ray meets ahead of
 * `orig`, which is not always the nearer face of the box; null if it meets none.
 */
export function intersectBB(orig: Vec3, dir: Vec3, world: Matrix, box: ModelBox): number | null {
  const corners = boxCorners(box).map((corner) => transformCoord(corner, world));
  for (let i = 0; i < BB_TRIANGLES.length; i += 3) {
    const t = intersectTri(corners[BB_TRIANGLES[i]!]!, corners[BB_TRIANGLES[i + 1]!]!, corners[BB_TRIANGLES[i + 2]!]!, orig, dir);
    if (t !== null) return t;
  }
  return null;
}

/**
 * `CWorld::PickObject_Fast` for movers (`World3D.cpp:2655-2733`), `bBoundBox` TRUE, the own mover not among the
 * `candidates`: the mover whose box the ray from `orig` along `dir` (`pickRay`) hits and whose origin is nearest the ray's
 * start, or null. Of the candidates, a non-player that is dead is left out (:2698-2702, `IsDie`; a dead player is
 * not, as only `bOnlyNPC`, the Tab key's, leaves players out), and so is a model with no box (`IsNullBoundBox`). They are
 * tried from the nearest origin (the list is sorted far to near by `m_fDistCamera`, :671 and :758, and picked from its
 * end, :2717), so it is not the box hit nearest that wins; the first one hit within `farPlane` (`CWorld::m_fFarPlane`,
 * in lengths of `dir`) is the pick (:2723-2728), a hit at or past it being passed over.
 *
 * Neuz measures the distance to the object's `GetPos()` (the rules' position); here it is the matrix's translation, the
 * place the mover is drawn, which `CMover::Interpolate` keeps within an eighth of a step of it. Not modelled: the cull
 * (`m_aobjCull`: what the frustum and the model's draw distance leave out is not tested), which the caller's list stands
 * in for with the movers it draws.
 */
export function pickMover(orig: Vec3, dir: Vec3, candidates: readonly PickCandidate[], farPlane: number): number | null {
  const near: Array<{ candidate: PickCandidate; distance: number }> = [];
  for (const candidate of candidates) {
    if (!candidate.isPlayer && candidate.dead) continue;
    if (isNullBox(candidate.box)) continue;
    const { world } = candidate;
    near.push({ candidate, distance: vecLength(sub([world[12]!, world[13]!, world[14]!], orig)) });
  }
  near.sort((a, b) => a.distance - b.distance); // stable: candidates at one distance stay in the order given
  for (const { candidate } of near) {
    const hit = intersectBB(orig, dir, candidate.world, candidate.box);
    if (hit !== null && hit < farPlane) return candidate.objectId;
  }
  return null;
}

/** What a tap lands on: a mover (its object ID), or a point of the land or an object (D3D). */
export type TapHit = { mover: number } | { point: Vec3 };

/**
 * What a tap at (`ndcX`, `ndcY`) of `camera`'s drawing lands on, for `OnLButtonDown` (`WndWorld.cpp:6855-6993`): the
 * mover `pickMover` finds among `candidates`, else where the ray meets the land or the objects (`clientPointToVector`,
 * `ground` and `mpu` the world's, D3D). Null where the ray meets nothing within reach.
 */
export function pickTap(
  camera: Camera, ndcX: number, ndcY: number, ground: Ground, mpu: number, candidates: readonly PickCandidate[],
): TapHit | null {
  const ray = pickRay(camera, ndcX, ndcY);
  if (ray === null) return null;
  const mover = pickMover(ray.orig, ray.dir, candidates, FAR_PLANE);
  if (mover !== null) return { mover };
  const point = clientPointToVector(ray.orig, ray.dir, ground, mpu);
  return point === null ? null : { point };
}
