import type { ArReader } from '../ar/ArReader';
import type { OwnCharacter, SkillSlot } from './types';

/**
 * `MAX_SKILL_JOB` (`_Common/Mover.h:96-100`, the `__VER >= 10` branch): `MAX_JOB_SKILL` 3 + `MAX_EXPERT_SKILL` 20 +
 * `MAX_PRO_SKILL` 20 + `MAX_MASTER_SKILL` 1 + `MAX_HERO_SKILL` 1 (`Resource/defineJob.h:12-17`): the length of
 * `m_aJobSkill`.
 */
export const MAX_SKILL_JOB = 45;

/** What `OwnCharacter` holds before the skill array: the numbers `readOwnEquipment` reads on its way to the IDs. */
export type OwnNumbers = Omit<OwnCharacter, 'skills' | 'inventory'>;

/**
 * The rest of the own character's METHOD_NONE block (`CMover::Serialize`, `_Common/ObjSerializeOpt.cpp:509-640`),
 * from where `readOwnEquipment` stopped, after the `m_aEquipInfo[i].dwId` loop (:557-558): the skill array.
 * It completes `numbers` into the `OwnCharacter`, and leaves the reader at the end of the message.
 */
export function readOwnAfterEquipment(r: ArReader, numbers: OwnNumbers): OwnCharacter {
  const skills = readSkills(r);
  // The reader stops here, at the end of the skill array. The C++ goes on with `(BYTE&)m_nCheerPoint` and
  // `m_dwTickCheer` (:569-570), `m_nSlot` and the banks' gold and player IDs (:571-575), the HP bonus, the resists and
  // the angel's EXP and level (:577-583), then `m_Inventory.Serialize` (:585), the three banks, the pet, the pocket,
  // the honour titles and the buffs. None of them is read yet: they are skipped, and whatever reads them next
  // replaces this `skipRest`.
  r.skipRest();
  return { ...numbers, skills, inventory: null };
}

/**
 * `m_aJobSkill`: `ar.Read( (void*)m_aJobSkill, sizeof(SKILL) * ( MAX_SKILL_JOB ) )` (:561, and :565 when
 * `__SKILL_0205` is off: the same bytes), 45 `SKILL`s (`_Common/Item.h:308-314`) of `DWORD dwSkill` and `DWORD
 * dwLevel`, 8 bytes each, which `CAr::Read` copies as they are (360 bytes).
 */
function readSkills(r: ArReader): SkillSlot[] {
  const skills: SkillSlot[] = [];
  for (let i = 0; i < MAX_SKILL_JOB; i++) {
    const skill = r.u32(); // dwSkill: a SI_* ID, or NULL_ID in an empty slot
    const level = r.u32(); // dwLevel
    skills.push({ skill, level });
  }
  return skills;
}
