// The own player's wand and bow shots and the reports of its missiles (Piece 7 M2, [R §5]):
//
//   CDPClient::SendMagicAttack   Neuz/DPClient.cpp:9841-9846    the wand's shot on arrival, with its charge
//   CDPClient::SendRangeAttack   Neuz/DPClient.cpp:9848-9853    the bow's shot on arrival, with its charge
//   CDPClient::SendSfxID         Neuz/DPClient.cpp:9876-9883    a missile made at the motion's hit frame
//   CDPClient::SendSfxHit        Neuz/DPClient.cpp:11230-11236  a missile landed: the server deals its damage then
//   CDPClient::SendSfxClear      Neuz/DPClient.cpp:11238-11245  a missile lost without a hit

import { NULL_ID, PacketType } from '../constants';
import { clientPacket } from './packet';

/** `OBJMSG_ATK_RANGE1` and `OBJMSG_ATK_MAGIC1` (`_Common/MoverMsg.h:142-143`): the only messages the two shots carry. */
const OBJMSG_ATK_RANGE1 = 35;
const OBJMSG_ATK_MAGIC1 = 36;

/**
 * MAGIC_ATTACK: `SendMagicAttack( OBJMSG_ATK_MAGIC1, id, 0, 0, nMagicPower, m_idSfxHit )` (`_Common/MoverSkill.cpp:
 * 3271-3274`): `ar << dwAtkMsg << objid << nParam2 << nParam3 << nMagicPower << idSfxHit`. `sfxHitId` is the counter
 * before this shot's missile (`m_idSfxHit`, pre-incremented later at the hit frame).
 */
export function encodeMagicAttack(targetId: number, power: number, sfxHitId: number): Uint8Array {
  return clientPacket(PacketType.MAGIC_ATTACK).u32(OBJMSG_ATK_MAGIC1).u32(targetId).i32(0).i32(0).i32(power).i32(sfxHitId)
    .toBytes();
}

/**
 * RANGE_ATTACK: `SendRangeAttack( OBJMSG_ATK_RANGE1, id, dwItemID, m_idSfxHit )` (`MoverSkill.cpp:3375-3376`): `ar <<
 * dwAtkMsg << objid << dwItemID << idSfxHit`. For a player `dwItemID` is the charge 0-4, which `ProcessMoveArrival`
 * passes in that argument (`_Common/MoverMove.cpp:238`), never an item.
 */
export function encodeRangeAttack(targetId: number, power: number, sfxHitId: number): Uint8Array {
  return clientPacket(PacketType.RANGE_ATTACK).u32(OBJMSG_ATK_RANGE1).u32(targetId).u32(power).i32(sfxHitId).toBytes();
}

/**
 * SFX_ID: `ar << idTarget << idSfxHit << dwType << dwSkill << nMaxDmgCnt`, `nMaxDmgCnt` raised to 1 when it is 0 or less
 * (:9878-9879). `type` is the `AF_*` of the shot (`AF_MAGIC` for a wand, `AF_GENERIC | AF_RANGE` for a bow; a skill's
 * `AF_MELEESKILL` or `AF_MAGICSKILL`); `skill` and `maxDmgCnt` default as `DPClient.h:229` has them.
 */
export function encodeSfxId(targetId: number, sfxHitId: number, type: number, skill = NULL_ID, maxDmgCnt = 1): Uint8Array {
  return clientPacket(PacketType.SFX_ID).u32(targetId).i32(sfxHitId).u32(type).u32(skill).i32(Math.max(maxDmgCnt, 1))
    .toBytes();
}

/**
 * SFX_HIT: `ar << idSfxHit << nMagicPower << dwSkill << idAttacker << nDmgCnt << fDmgAngle << fDmgPower`, as
 * `CSfx::DamageToTarget` calls it for a plain missile (`_Common/SfxObj.cpp:126-127`): the last three 0.
 */
export function encodeSfxHit(
  sfxHitId: number, power: number, skill: number, attackerId: number, dmgCnt = 0, dmgAngle = 0, dmgPower = 0,
): Uint8Array {
  return clientPacket(PacketType.SFX_HIT).i32(sfxHitId).i32(power).u32(skill).u32(attackerId).i32(dmgCnt).f32(dmgAngle)
    .f32(dmgPower).toBytes();
}

/** SFX_CLEAR: `ar << idSfxHit << idMover`, from `~CSfx` for a missile that never hit (`SfxObj.cpp:44-55`). */
export function encodeSfxClear(sfxHitId: number, moverId: number): Uint8Array {
  return clientPacket(PacketType.SFX_CLEAR).i32(sfxHitId).u32(moverId).toBytes();
}
