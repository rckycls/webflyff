// The job change's two messages (Piece 7 M2, [R §1]):
//
//   CDPClient::OnSetChangeJob       Neuz/DPClient.cpp:3600-3678       SET_JOB_SKILL, the own character
//   CDPClient::OnSetNearChangeJob   Neuz/DPClient.cpp:3680-3725       SET_NEAR_JOB_SKILL, another mover in view
//   CUser::AddSetChangeJob          WORLDSERVER/User.cpp:1181-1197    what the first carries
//   CUserMng::AddNearSetChangeJob   WORLDSERVER/User.cpp:5111-5134    what the second carries

import type { ArReader } from '../ar/ArReader';
import type { SkillSlot } from './types';
import { readSkills } from './own';
import type { MessageOf } from './types';

/** `MAX_JOB` (`Resource/defineJob.h:90`, `__VER >= 10`): the length of the unused `dwJobLv` array. */
const MAX_JOB = 32;
/** `MAX_PROFESSIONAL` and `MAX_HERO` (`defineJob.h:63`, :86): a master is 16 to 23, a hero 24 to 31. */
const MAX_PROFESSIONAL = 16;
const MAX_HERO = 32;
/** `MAX_EXPERT_SKILL` 20 and `MAX_PRO_SKILL + MAX_MASTER_SKILL` 21 (`defineJob.h:13-16`): the slots the near one carries. */
const EXPERT_SKILLS = 20;
const MASTER_SKILLS = 21;

/**
 * SET_JOB_SKILL: `ar >> nJob`, then `ar.Read( m_aJobSkill, sizeof(SKILL) * 45 )` and `ar.Read( dwJobLv, sizeof(DWORD) *
 * MAX_JOB )`, which Neuz drops (`OnSetChangeJob`, :3605-3619). The server writes all 45 slots and 32 zeros
 * (`AddSetChangeJob`).
 */
export function readSetJobSkill(r: ArReader): MessageOf<'setJobSkill'> {
  const job = r.i32();
  const skills = readSkills(r);
  r.bytes(4 * MAX_JOB); // dwJobLv[MAX_JOB], unused
  return { type: 'setJobSkill', job, skills };
}

/**
 * SET_NEAR_JOB_SKILL: `ar >> nJob`, then the skills the server writes (`AddNearSetChangeJob`, :5116-5124): a master's or
 * a hero's 21 slots from slot 20 (`MAX_PRO_SKILL + MAX_MASTER_SKILL`), anyone else's 20 from slot 3 (`MAX_EXPERT_SKILL`).
 * No job levels follow. Neuz reads the same for a mover in view (:3687-3697); for one not in view it reads 22 for a hero
 * (:3664-3666), more than the server sent, which this reader does not copy.
 */
export function readSetNearJobSkill(r: ArReader): MessageOf<'setNearJobSkill'> {
  const job = r.i32();
  const count = job >= MAX_PROFESSIONAL && job < MAX_HERO ? MASTER_SKILLS : EXPERT_SKILLS;
  const skills: SkillSlot[] = [];
  for (let i = 0; i < count; i++) {
    const skill = r.u32();
    const level = r.u32();
    skills.push({ skill, level });
  }
  return { type: 'setNearJobSkill', job, skills };
}
