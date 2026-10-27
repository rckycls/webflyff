import type { ArReader } from '../ar/ArReader';
import { readSkills } from './own';
import type { MessageOf } from './types';

/**
 * USESKILL: `CDPClient::OnUseSkill` (`Neuz/DPClient.cpp:3894`): `ar >> dwSkill >> dwLevel; ar >> id >> nUseType >>
 * nCastingTime;` (`DWORD`, `DWORD`, `OBJID`, `int`, `int`). `CUserMng::AddUseSkill` (`WORLDSERVER/User.cpp:4540`)
 * writes them to everyone in view of the caster, the caster included, with the caster as the message's object ID.
 * `dwSkill` is the skill's real `SI_*` ID (`CMover::DoUseSkill` is given it with `nIdx` -1, `_Common/MoverSkill.cpp:165`),
 * not the index into `m_aJobSkill` that USESKILL going the other way carries.
 */
export function readUseSkill(r: ArReader): MessageOf<'useSkill'> {
  const skill = r.u32();
  const level = r.u32();
  const targetId = r.u32();
  const useType = r.i32();
  const castingTime = r.i32();
  return { type: 'useSkill', skill, level, targetId, useType, castingTime };
}

/**
 * CLEAR_USESKILL: `CDPClient::OnClearUseSkill` (`Neuz/DPClient.cpp:3952`) takes only the object ID, so there are no
 * fields. The world server sends it when `CMover::DoUseSkill` refuses a USESKILL (`CDPSrvr::OnUseSkill`,
 * `WORLDSERVER/DPSrvrLux.cpp:96`, through `CUser::AddHdr`, `User.cpp:655`, which writes the object ID and the type).
 */
export function readClearUseSkill(): MessageOf<'clearUseSkill'> {
  return { type: 'clearUseSkill' };
}

/**
 * DOUSESKILLPOINT: `CDPClient::OnDoUseSkillPoint` (`Neuz/DPClient.cpp:14730`): for each of the `MAX_SKILL_JOB` skills `ar
 * >> dwSkill >> dwLevel`, then `ar >> g_pPlayer->m_nSkillPoint` (an `int`). `CUser::AddDoUseSkillPoint`
 * (`WORLDSERVER/User.cpp:6566`) writes them; `CDPSrvr::OnDoUseSkillPoint` answers a spend with the array it was sent
 * (`WORLDSERVER/DPSrvr.cpp:1162`), a master level-up (`_Common/MoverSkill.cpp:88`) or the legend skill's hero level
 * (`DPSrvr.cpp:8453`) with the server's own. Neuz sets the level of the skill it finds by `dwSkill`; the reader gives
 * the pairs as they are (`readSkills`), an empty slot with `dwSkill` `NULL_ID`.
 */
export function readDoUseSkillPoint(r: ArReader): MessageOf<'doUseSkillPoint'> {
  const skills = readSkills(r);
  const skillPoint = r.i32();
  return { type: 'doUseSkillPoint', skills, skillPoint };
}

/**
 * INITSKILLPOINT: `CDPClient::OnInitSkillPoint` (`Neuz/DPClient.cpp:14687`): `int nSkillPoint; ar >> nSkillPoint`.
 * `CUser::AddInitSkill` (`WORLDSERVER/User.cpp:6554`) writes `m_nSkillPoint` after the "recurrence" scroll
 * (`CMover::DoUseItemSystem`, `_Common/MoverSkill.cpp:2211-2217`).
 */
export function readInitSkillPoint(r: ArReader): MessageOf<'initSkillPoint'> {
  return { type: 'initSkillPoint', skillPoint: r.i32() };
}

/**
 * SETACTIONPOINT: `CDPClient::OnSetActionPoint` (`Neuz/DPClient.cpp:15798`): `int nAP; ar >> nAP`.
 * `CUser::AddSetActionPoint` (`WORLDSERVER/UserLux.cpp:206`) writes `NULL_ID` as the object ID.
 */
export function readSetActionPoint(r: ArReader): MessageOf<'setActionPoint'> {
  return { type: 'setActionPoint', actionPoint: r.i32() };
}

/** ENDSKILLQUEUE: `CDPClient::OnEndSkillQueue` (`Neuz/DPClient.cpp:15791`) takes only the object ID: no fields. */
export function readEndSkillQueue(): MessageOf<'endSkillQueue'> {
  return { type: 'endSkillQueue' };
}

/**
 * CREATESFXOBJ: `CDPClient::OnCreateSfxObj` (`Neuz/DPClient.cpp:4038`): `ar >> dwSfxObj >> x >> y >> z; ar >> bFlag;`
 * (`DWORD`, three `float`, `BOOL`: 4 bytes). `CUserMng::AddCreateSfxObj` (`WORLDSERVER/User.cpp:5016`) writes the object it
 * is called for as the message's object ID, and `x`, `y`, `z` and `bFlag` default to 0 (`User.h:864`). The reader gives
 * the position as it is: Neuz makes it the effect's absolute place only `if( x || y || z )`, else the object's, and
 * when that object is not in view it still makes the effect at the absolute position if there is one, and nothing if
 * there is not (`DPClient.cpp:4062-4066`).
 */
export function readCreateSfxObj(r: ArReader): MessageOf<'createSfxObj'> {
  const sfxId = r.u32();
  const pos = r.vec3();
  const flag = r.i32();
  return { type: 'createSfxObj', sfxId, pos, flag };
}
