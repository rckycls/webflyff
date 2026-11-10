// 2026-11-10: the Arena (`__JEFF_11_4`, on in the owner's Neuz and WorldServer: `Source/Neuz/VersionCommon.h:99`,
// `Source/WORLDSERVER/VersionCommon.h:112`). Where players may hit each other: the one place in the browser.
//
//   CWorld::IsArena          _Common/World.h:414-415              the world is WI_WORLD_ARENA
//   CMover::IsArenaTarget    _Common/MoverAttack.cpp:1953-1972    in the Arena, the target and the attacker both within
//                                                                 the circle of (490, 507), d² <= 1246 by whole metres
//   CMover::IsAttackAble     _Common/Mover.cpp:6500-6517          a player is attackable when g_eLocal's EVE_18 is on and
//                                                                 it is an arena target (no duel, war, school or PK here)
//
// EVE_18 comes from the `18` line of `Program/WorldServer.ini` (`WorldServer.cpp:540-544`) in SNAPSHOTTYPE_FLYFF_EVENT
// (`CDPClient::OnFlyffEvent`, `Neuz/DPClient.cpp:6183-6190`), which the browser does not read: the owner's ini has the
// line, so it is taken as on. `EVE_PK` (`//PK`) is off there: no PK anywhere.
//
// research: docs/superpowers/specs/2026-11-10-arena-tower-research.md §3.

import type { Vec3 } from '@flyffweb/protocol';

/** `WI_WORLD_ARENA` (`Resource/defineWorld.h:63`), "WdArena" (`Resource/World.inc:21`). */
export const WI_WORLD_ARENA = 208;
/** The fight circle's centre and its squared radius in whole metres (`MoverAttack.cpp:1958-1966`). */
export const ARENA_CENTER = { x: 490, z: 507 } as const;
const ARENA_RADIUS_SQ = 1246;

/** `CWorld::IsArena()`. */
export function isArena(worldId: number): boolean {
  return worldId === WI_WORLD_ARENA;
}

/**
 * `( (int)( x - 490 ) )² + ( (int)( z - 507 ) )² <= 1246`: the int cast truncates toward zero (`HighRateProfile::Bounded`,
 * `_Common/HighRateProfile.h:14-21`, a safe `static_cast<int>`; NaN counts 0).
 */
function inCircle(pos: Vec3): boolean {
  const whole = (value: number): number => (Number.isNaN(value) ? 0 : Math.trunc(value));
  const dx = whole(pos[0] - ARENA_CENTER.x);
  const dz = whole(pos[2] - ARENA_CENTER.z);
  return dx * dx + dz * dz <= ARENA_RADIUS_SQ;
}

/**
 * `CMover::IsArenaTarget( pMover )` for the attacker standing at `own` in the world `worldId` and the target at `target`:
 * in the Arena only, and both inside the circle.
 */
export function isArenaTarget(worldId: number, own: Vec3, target: Vec3): boolean {
  return isArena(worldId) && inCircle(target) && inCircle(own);
}
