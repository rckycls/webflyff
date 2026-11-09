// The raised pet in the world (pets R1, docs/superpowers/plans/2026-11-09-pets-rest.md; [R] =
// docs/superpowers/specs/2026-11-09-pets-research.md §2.3): the mover Neuz makes on its own for a player's summoned pet,
// which the server never hears of. The rules here are pure; `WorldState` keeps the movers.
//
//   Function                       File:lines                         what
//   CPet::GetIndex                 _Common/pet.cpp:390-401            the pet's model: the egg's, else its kind's by level
//   CPet::GetItemId                _Common/pet.h:147-152              the egg item, else its kind's
//   CMover::ProcessPet             _Common/Mover.cpp:10839-10929      the client half: made, deleted, the S sparkle
//   CAIEgg::MoveProcessIdle        _Common/pet.cpp:493-570            a point 1 m left or right of the owner
//   CMover::GetSpeed               _Common/MoverParam.cpp:3275-3285   the pet runs at its owner's speed
//   CWorld::PickObject_Fast        _Common/World3D.cpp:2703-2707      another player's pet is never picked

import { NULL_ID } from '@flyffweb/protocol';
import type { PetData, Vec3 } from '@flyffweb/protocol';
import type { WebPets } from '@flyffweb/formats';
import { angleToVector } from '../sim/ActionMover';

const f32 = Math.fround;

/** `enum PETLEVEL` (`_Common/pet.h:16`): the egg, then D, C, B, A, S. */
export const PetLevel = { EGG: 0, D: 1, C: 2, B: 3, A: 4, S: 5 } as const;

/**
 * Why a PET message came (`PF_*`, `_Common/pet.h:89-92`), which `CClientPet::m_nLevelup` keeps until the pet mover is
 * made again (`CMover::CreatePetSfx`, `Mover.cpp:11148-11178`): `LEVEL_UP` plays `PCSkillCastCheer.wav`, `LEVEL_DOWN`
 * nothing, `GET_AVAIL` hands the miracle window its two steps.
 */
export const PetFlag = { PET: 0, LEVEL_UP: 1, LEVEL_DOWN: 2, GET_AVAIL: 3 } as const;

/** `MI_PET_EGG` (`Resource/defineObj.h:1500`): the egg's mover. */
export const MI_PET_EGG = 731;
/** `II_PET_EGG` (`Resource/defineItem.h:3918`): the egg's item. */
export const II_PET_EGG = 21029;
/** `IK3_EGG` (`Resource/defineItemkind.h:180`): the egg and the hatched pets (`CItemElem::IsPet`, `Item.h:214`). */
export const IK3_EGG = 120;

/**
 * The object id of the pet mover made for the mover `ownerId`. Neuz adds it to the world with no id (`AddObj( pPet,
 * FALSE )`, its `GetId()` stays `NULL_ID`); the browser keys its movers by id, so it takes a negative one, which no server
 * id (an unsigned 32-bit number) can be, one for each owner (a mover has one pet at most, `CMover::m_pet`).
 */
export function petMoverId(ownerId: number): number {
  return -1 - ownerId;
}

/** A mover the browser made itself (a raised pet), with no server id. */
export function isClientMade(objectId: number): boolean {
  return objectId < 0;
}

/** The id the server is told for the mover `objectId`: `GetId()`, which is `NULL_ID` for one the client made. */
export function serverIdOf(objectId: number): number {
  return isClientMade(objectId) ? NULL_ID : objectId;
}

/**
 * `CPet::GetIndex` (`pet.cpp:390-401`): the egg's `MI_PET_EGG`, else the kind's model for D and C, for B and A, for S
 * (`m_adwIndex[0..2]`, `pets.json`). 0 for a kind the table lacks (the C++ reads through the NULL row), and without the
 * table: `ProcessPet` makes no pet for 0.
 */
export function petModelIndex(pet: Pick<PetData, 'kind' | 'level'>, pets: WebPets | undefined): number {
  if (pet.level === PetLevel.EGG) return MI_PET_EGG;
  const models = pets?.kinds[pet.kind]?.models;
  if (models === undefined) return 0;
  if (pet.level < PetLevel.B) return models[0];
  if (pet.level < PetLevel.S) return models[1];
  return models[2];
}

/** `CPet::GetItemId` (`pet.h:147-152`): `II_PET_EGG` for the egg, else the kind's item; null for a kind the table lacks. */
export function petItemId(pet: Pick<PetData, 'kind' | 'level'>, pets: WebPets | undefined): number | null {
  if (pet.level === PetLevel.EGG) return II_PET_EGG;
  return pets?.kinds[pet.kind]?.itemId ?? null;
}

/** What `CAIEgg::MoveProcessIdle` reads of the owner: its position and its two angles. */
export interface EggOwner {
  pos: Vec3;
  angle: number;
  angleX: number;
}

/**
 * `CAIEgg::MoveProcessIdle` (`pet.cpp:493-570`, `PETSTATE_IDLE`), each step: the two points 1 m to the owner's left and
 * right (its angle less and plus 90 degrees, kept in 0 to 360, along `-angleX`: `AngleToVector`) from the owner's place
 * on the land (`GetLandHeight` under it, `landHeight`), the one nearer the pet in 3D; null when the pet is within 1 m of
 * it on the ground (x and z), else that point, which `MoveToDst` walks the pet to (`SetDestPos( vPos, true, FALSE )`).
 * Floats as the C++ (`D3DXVec3LengthSq`, then `double`).
 */
export function eggDestination(owner: EggOwner, petPos: Vec3, landHeight: number): Vec3 | null {
  const base: Vec3 = [f32(owner.pos[0]), f32(landHeight), f32(owner.pos[2])];
  const side = (angle: number): Vec3 => {
    const v: Vec3 = [0, 0, 0];
    angleToVector(v, angle, f32(-owner.angleX), 1);
    return [f32(v[0] + base[0]), f32(v[1] + base[1]), f32(v[2] + base[2])];
  };
  let left = f32(owner.angle - 90);
  if (left < 0) left = f32(left + 360);
  let right = f32(owner.angle + 90);
  if (right > 360) right = f32(right - 360);
  const v1 = side(left);
  const v2 = side(right);
  const to = lengthSq(v1, petPos) < lengthSq(v2, petPos) ? v1 : v2;
  const dx = f32(to[0] - petPos[0]);
  const dz = f32(to[2] - petPos[2]);
  return f32(f32(dx * dx) + f32(dz * dz)) > 1 ? to : null;
}

/** `D3DXVec3LengthSq( &( a - b ) )` in floats. */
function lengthSq(a: Vec3, b: Vec3): number {
  const x = f32(a[0] - b[0]);
  const y = f32(a[1] - b[1]);
  const z = f32(a[2] - b[2]);
  return f32(f32(f32(x * x) + f32(y * y)) + f32(z * z));
}
