// The flight collision and the server's corrections in the air (Piece 7 M5, [R §3, §5]). Floats as in `ActionMover.ts`.
//
//   collideFly       CActionMover::ProcessCollisionFly          Source/_AIInterface/ActionMoverCollision.cpp:21-121
//   reflect          CWorld::ProcessCollisionReflection          Source/_Common/WorldIntersect.cpp:629-708
//   fullHeight       CWorld::GetFullHeight                       WorldIntersect.cpp:12-56
//   forcedSet2       CActionMover::ForcedSet2                    Source/_AIInterface/ActionMoverMsg.cpp:56-75
//   halfForcedSet    CActionMover::HalfForcedSet                 ActionMoverMsg.cpp:77-83
//   approachFlight   CMover::ProcessMove's chase in the air      Source/_Common/MoverMove.cpp:428-439
//   getDegreeX       GetDegreeX                                  Source/_Common/Obj.h:306-322
//
// Left out, as in `collision.ts`: the ships (`linkAirShip`) and the controls; the world server's quarter-length test.

import type { FlightReport, Vec3 } from '@flyffweb/protocol';
import { getDegree } from './ActionMover';
import { HAttr } from './collision';
import type { Ground } from './collision';
import { ActMsg, ObjStaF } from './constants';
import { add, dot, faceNormal, normalize, scale, sub, transformCoord, vecLength } from './d3dx';
import { flightActMsg } from './flight';
import type { FlightState } from './flight';
import { boxEntry, findTouchTriIndex, intersectRayTri, rotationOfObject, touchedBy } from './object3d';

const f32 = Math.fround;

/** `m_fMaxHeight` and `m_fMinHeight` (`World.cpp:90-91`): the ceiling, and the floor over cloud. */
const MAX_HEIGHT = 200;
const MIN_HEIGHT = 85;
/** `WTYPE_CLOUD` (`landscape.h:41`). */
const WTYPE_CLOUD = 1;
/** `WLD_EXTRA_WIDTH` (`World.h:34`): how far from the world's edge a flier is kept. */
const WLD_EXTRA_WIDTH = 10;
/** `vStart.y += 0.5f`: the broom's height over the rider's feet. */
const BROOM_HEIGHT = f32(0.5);
/** The objects' test line is made at least this long (`fLen < 0.65f`). */
const MIN_TEST_LENGTH = f32(0.65);
/** A reflected move keeps 0.7 of itself. */
const REFLECTED_KEEP = f32(0.7);
/** `GetFullHeight`'s line straight down (`vDir( 0, -2000, 0 )`) and its first nearest distance. */
const DOWN: Vec3 = [0, -2000, 0];
const FAR = f32(4194304);
/** `D3DXToDegree` with `D3DX_PI` `3.141592654f`. */
const DEGREES_PER_RADIAN = f32(180 / f32(3.141592654));
/** `FOR_LINKMAP`'s `nRange` in these tests (`int nRange = 0`). */
const LINK_RANGE = 0;

/**
 * `ProcessCollisionReflection`: the move `dir` from `pos` against the world's objects; at the first triangle met, `out`
 * becomes its reflection `D + 2(-D·N)N`, tested again from `pos` up to 3 more times. True when something was met (`out`
 * is left as it was when nothing was).
 */
function reflect(out: Vec3, pos: Vec3, dir: Vec3, ground: Ground, count: number): boolean {
  const end = add(pos, dir);
  const objects = ground.objectsNear(pos[0], pos[2], LINK_RANGE);
  for (let k = 0; k < objects.length; k++) {
    const obj = objects[k]!;
    const inv = touchedBy(obj, pos, end);
    if (inv === null) continue;
    const tri = findTouchTriIndex(obj, inv, pos, end);
    if (tri === null) continue;
    const n = normalize(transformCoord(faceNormal(obj.triangles, tri), rotationOfObject(obj)));
    const lengthN = dot([-dir[0], -dir[1], -dir[2]], n);
    const reflected = add(dir, scale(n, f32(lengthN * 2)));
    out[0] = reflected[0];
    out[1] = reflected[1];
    out[2] = reflected[2];
    if (count++ < 3) reflect(out, pos, [out[0], out[1], out[2]], ground, count);
    return true;
  }
  return false;
}

/**
 * `CWorld::GetFullHeight`: the height under `pos`, a line 2000 down: the nearest object whose box it meets, where the
 * line meets that object's mesh; else (no box met, or the nearest one's mesh missed) the land's height, 0 where none
 * is loaded.
 */
export function fullHeight(ground: Ground, pos: Vec3): number {
  const from: Vec3 = [f32(pos[0]), f32(pos[1]), f32(pos[2])];
  const end = add(from, DOWN);
  let nearest = FAR;
  let found: (typeof objects)[number] | null = null;
  const objects = ground.objectsNear(from[0], from[2], LINK_RANGE);
  for (let k = 0; k < objects.length; k++) {
    const at = boxEntry(objects[k]!, from, end);
    if (at === null) continue;
    const off = sub(at, from);
    const d = dot(off, off);
    if (d < nearest) {
      nearest = d;
      found = objects[k]!;
    }
  }
  if (found !== null) {
    const t = intersectRayTri(found, from, DOWN);
    if (t !== null) return f32(from[1] + f32(t * DOWN[1]));
  }
  return f32(ground.terrainHeight(from[0], from[2]) ?? 0);
}

/** `CWorld::ClipX` and `ClipZ`: 10 m inside the world's edge, where the ground knows it. */
function clip(v: number, size: number | undefined): number {
  if (size === undefined) return v;
  if (v < WLD_EXTRA_WIDTH) return WLD_EXTRA_WIDTH;
  const max = f32(size - WLD_EXTRA_WIDTH);
  return v > max ? max : v;
}

/**
 * `ProcessCollisionFly` on `s.pos`, for the tick's move `deltaAccu` (`m_vDeltaAccu`). `worldFly` is the world's `fly`
 * (`CWorld::m_bFly`); `objects` is `CanCollisionFly` (the own player, or a mover with no destination): only then are the
 * world's objects tested, a hit reflecting the move at 0.7 (and setting `s.delta`). Then y, x and z are added, x and z
 * clipped to the world; NOMOVE land takes back its own axis, DIE land kills (`died`), and NOFLY land (any land of a world
 * without flight) takes back the whole step and the ride (`unequip`, Neuz's `UnequipRide`). Last the height: at most
 * 200; over cloud water with no land under it at least 85; else at least the height under it (`GetFullHeight`), which
 * counts as a collision. `s.delta.y` is not changed by the floor. A mover with no thrust and no move is left alone.
 */
export function collideFly(
  s: FlightState, deltaAccu: Vec3, ground: Ground, worldFly: boolean, objects: boolean,
): { collided: boolean; unequip: boolean; died: boolean } {
  let collided = false;
  let unequip = false;
  let died = false;
  if (s.accPower === 0 && deltaAccu[0] === 0 && deltaAccu[1] === 0 && deltaAccu[2] === 0) {
    return { collided, unequip, died };
  }
  const pos = s.pos;
  const start: Vec3 = [pos[0], f32(pos[1] + BROOM_HEIGHT), pos[2]];
  let delta: Vec3 = [deltaAccu[0], deltaAccu[1], deltaAccu[2]];

  if (objects) {
    let dir: Vec3 = [deltaAccu[0], deltaAccu[1], deltaAccu[2]];
    const length = vecLength(dir);
    if (length > f32(0.001)) {
      let r = 1;
      if (length < MIN_TEST_LENGTH) {
        r = f32(MIN_TEST_LENGTH / length);
        dir = scale(dir, r);
      }
      collided = reflect(delta, start, dir, ground, 0);
      if (collided) {
        delta = scale(scale(delta, f32(1 / r)), REFLECTED_KEEP); // vDelta /= fR; vDelta *= 0.7f
        s.delta[0] = delta[0];
        s.delta[1] = delta[1];
        s.delta[2] = delta[2];
      }
    }
  }

  pos[1] = f32(pos[1] + delta[1]);
  pos[0] = clip(f32(pos[0] + delta[0]), ground.extent?.[0]);
  if (ground.landAttr(pos[0], pos[2]) === HAttr.NOMOVE) pos[0] = f32(pos[0] - delta[0]);
  pos[2] = clip(f32(pos[2] + delta[2]), ground.extent?.[1]);
  const attr = worldFly ? ground.landAttr(pos[0], pos[2]) : HAttr.NOFLY;
  if (attr === HAttr.NOMOVE) {
    pos[2] = f32(pos[2] - delta[2]);
  } else if (attr === HAttr.DIE) {
    died = true;
  } else if (attr === HAttr.NOFLY) {
    pos[0] = f32(pos[0] - delta[0]);
    pos[2] = f32(pos[2] - delta[2]);
    pos[1] = f32(pos[1] - delta[1]);
    unequip = true;
  }

  const height = fullHeight(ground, [pos[0], f32(pos[1] + 1), pos[2]]);
  if (pos[1] > MAX_HEIGHT) {
    pos[1] = MAX_HEIGHT;
  } else if (ground.waterTexture?.(pos[0], pos[2]) === WTYPE_CLOUD && height === 0) {
    if (pos[1] < MIN_HEIGHT) pos[1] = MIN_HEIGHT;
  } else if (pos[1] < height) {
    pos[1] = height;
    collided = true;
  }
  return { collided, unequip, died };
}

/**
 * `ForcedSet2`: the server's report of a flier taken whole (move, thrust, turn, state and flags), unless it would flip
 * the mover between flying (`flying`) and walking. True when taken. (The caller keeps `nMotionEx`, and `DefaultSet`'s
 * `m_fCrrSpd = 0`.)
 */
export function forcedSet2(s: FlightState, r: FlightReport, flying: boolean): boolean {
  if (((r.stateFlag & ObjStaF.FLY) !== 0) !== flying) return false;
  s.delta[0] = r.delta[0];
  s.delta[1] = r.delta[1];
  s.delta[2] = r.delta[2];
  s.accPower = r.accPower;
  s.turnAngle = r.turnAngle;
  s.state = r.state >>> 0;
  s.stateFlag = r.stateFlag >>> 0;
  return true;
}

/** `HalfForcedSet`: only the move, the thrust and the turn. */
export function halfForcedSet(s: FlightState, r: FlightReport): void {
  s.delta[0] = r.delta[0];
  s.delta[1] = r.delta[1];
  s.delta[2] = r.delta[2];
  s.accPower = r.accPower;
  s.turnAngle = r.turnAngle;
}

/** `GetDegreeX`: the pitch from `src` to `dest`, negative (nose up) for a point above, within ±90. */
export function getDegreeX(dest: Vec3, src: Vec3): number {
  const yDist = f32(dest[1] - src[1]);
  const xz = vecLength([f32(dest[0] - src[0]), 0, f32(dest[2] - src[2])]);
  let a = -f32(f32(Math.atan2(yDist, -xz)) * DEGREES_PER_RADIAN);
  if (a > 90) a = f32(180 - a);
  else if (a < -90) a = f32(-180 - a);
  return a;
}

/**
 * One tick of the ghost's chase in the air (`CMover::ProcessMove`, `MoverMove.cpp:428-439`): while frames remain
 * (`m_uRemnantCorrFrm`), `m_fDistance` is the distance to `dest` and TURNMOVE turns toward it with
 * `(int)GetDegree` and `(int)GetDegreeX`. Returns the frames left after this one.
 */
export function approachFlight(s: FlightState, dest: Vec3, remnant: number): number {
  if (remnant <= 0) return 0;
  const distance = vecLength(sub(dest, s.pos));
  flightActMsg(
    s, ActMsg.TURNMOVE, Math.trunc(getDegree(dest, s.pos)), Math.trunc(getDegreeX(dest, s.pos)), remnant, distance,
  );
  return remnant - 1;
}
