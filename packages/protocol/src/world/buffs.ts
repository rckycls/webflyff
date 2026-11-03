// The buffs' messages (Piece 7 M2, [R §10]); every one goes to all in view of the mover, the mover included:
//
//   CDPClient::OnSetSkillState            Neuz/DPClient.cpp:14158-14181   SETSKILLSTATE: AddBuff on the target
//   CDPClient::OnRemoveSkillInfluence     DPClient.cpp:14993-15003        REMOVESKILLINFULENCE: RemoveBuff
//   CDPClient::OnRemoveAllSkillInfluence  DPClient.cpp:15005-15010        REMOVEALLSKILLINFULENCE: RemoveCommonBuffs
//   CDPClient::OnSetDestParam             DPClient.cpp:3271-3281          SETDESTPARAM: a live buff's stat change
//   CDPClient::OnResetDestParam           DPClient.cpp:3283-3293          RESETDESTPARAM: its end
//   CDPClient::OnResetDestParamSync       DPClient.cpp:3296-3305          RESETDESTPARAM_SYNC: DST_SPEED's total
//   CBuffMgr::Serialize                   _Common/buff.cpp:901-933        the buffs of an ADD_OBJ

import type { ArReader } from '../ar/ArReader';
import type { AddedBuff, MessageOf } from './types';

/** `BUFF_ITEM2` (`_Common/buff.h`): its level is the seconds it has left, a 32-bit `time_t` (`CBuffItem2::SerializeLevel`). */
const BUFF_ITEM2 = 3;

/** `ar >> idTarget >> wType >> wID >> dwLevel >> dwTime` (a `BUFF_ITEM2`'s level signed: its seconds left). */
export function readSetSkillState(r: ArReader): MessageOf<'setSkillState'> {
  const targetId = r.u32();
  const buffType = r.u16();
  const id = r.u16();
  const level = buffType === BUFF_ITEM2 ? r.i32() : r.u32();
  const time = r.u32();
  return { type: 'setSkillState', targetId, buffType, id, level, time };
}

export function readRemoveSkillInfluence(r: ArReader): MessageOf<'removeSkillInfluence'> {
  const buffType = r.u16();
  const id = r.u16();
  return { type: 'removeSkillInfluence', buffType, id };
}

export function readRemoveAllSkillInfluence(): MessageOf<'removeAllSkillInfluence'> {
  return { type: 'removeAllSkillInfluence' };
}

export function readSetDestParam(r: ArReader): MessageOf<'setDestParam'> {
  const dst = r.i32();
  const adj = r.i32();
  const chg = r.i32();
  return { type: 'setDestParam', dst, adj, chg };
}

export function readResetDestParam(r: ArReader): MessageOf<'resetDestParam'> {
  const dst = r.i32();
  const adj = r.i32();
  return { type: 'resetDestParam', dst, adj };
}

export function readResetDestParamSync(r: ArReader): MessageOf<'resetDestParamSync'> {
  const dst = r.i32();
  const adj = r.i32();
  const total = r.i32();
  return { type: 'resetDestParamSync', dst, adj, total };
}

/**
 * `m_buffs.Serialize( ar )` (`__BUFF_1107`, `ObjSerializeOpt.cpp:758`): `CBuffMgr::Serialize` (`_Common/buff.cpp:901`)
 * reads the count (`size_t`, 4 bytes on x86), then per buff `WORD wType` and `IBuff::Serialize` (:124): `m_wId`
 * (`WORD`), the level (`DWORD m_dwLevel`; a `BUFF_ITEM2`'s `time_t`, 4 bytes too: `_USE_32BIT_TIME_T`) and the time left
 * (`DWORD`, ms).
 */
export function readBuffs(r: ArReader): AddedBuff[] {
  const count = r.u32();
  const buffs: AddedBuff[] = [];
  for (let i = 0; i < count; i++) {
    const buffType = r.u16();
    const id = r.u16();
    const level = buffType === BUFF_ITEM2 ? r.i32() : r.u32();
    const timeLeft = r.u32();
    buffs.push({ buffType, id, level, timeLeft });
  }
  return buffs;
}
