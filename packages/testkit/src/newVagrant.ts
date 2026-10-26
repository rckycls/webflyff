import { NULL_ID } from '@flyffweb/protocol';
import type { InventoryItem, OwnCharacter, SkillSlot } from '@flyffweb/protocol';

/** `MAX_SKILL_JOB` (`_Common/Mover.h:96-100`, `__VER >= 10`): the length of `m_aJobSkill`. */
const MAX_SKILL_JOB = 45;

/**
 * The own data of a new male Vagrant, as the ADD_OBJ of its first login carries it. Character creation copies the
 * `BASE_VALUE_TBL` row into the character (`FROM BASE_VALUE_TBL`, `Database.sql:10358`), so the numbers are the row's
 * (`Database.sql:2741`): `m_nStr` to `m_nInt` 15 each, `m_nManaPoint` 63 and `m_nFatiguePoint` 32 (its HP is 230, which the
 * mover's `hitPoint` holds, not this), level 1 with `m_nExp1` 0, `m_nRemainGP` 0 and no death yet, and the inventory it
 * lists for a man, the slot first: the suit (502), the biscuit (2801), 5 town blink wings (4805), the gauntlets (506),
 * boots (510), the Wooden Sword (21) and 3 lollipops (2800).
 *
 * The skills do NOT come from the row's `m_aJobSkill`: that text is a legacy field the join never reads (its readers are
 * `DBConvert.cpp:193-210` and a conversion procedure). The join builds the mover with `InitProp` (`DbManagerJoin.cpp:186`)
 * and lays the `tblSkillPoint` rows over it by position (`GetSkill`, `DbManagerFun.cpp:1211-1233`, called at
 * `DbManagerJoin.cpp:330`). Character creation inserts three rows: the skills 1, 2 and 3 (`SI_VAG_ONE_CLEANHIT`, `_BRANDISH`
 * and `_OVERCUTTER`, `Resource/defineSkill.h:19-21`) at positions 0, 1 and 2 with `SkillLv` 0 (`Database.sql:10677-10682`).
 *
 * `InitProp` adds no others. It fills the slots with the job's skill IDs at level 0 only `if( m_nJob != -1 )`
 * (`Mover.cpp:1487-1499`, after the loop that leaves every slot `NULL_ID` with level 0, :1478-1485), and at that point of
 * the join `m_nJob` is still the -1 of `CMover::Init` (`Mover.cpp:253`): `GetBaseCharacter` reads it afterwards
 * (`DbManagerJoin.cpp:203`, `DbManagerFun.cpp:1045`). So the 42 other slots are empty, and the four `SI_GEN_EVE_*` skills
 * (317-320) that the job's table also lists (`CProject::LoadSkill`, `_Common/Project.cpp:375-400`) are in no slot of a new
 * character. (Were `m_nJob` set there, they would follow 1, 2, 3, which sort first by `dwReqDisLV` 3, 5 and 10; their own
 * order would be the CRT `qsort`'s on four equal keys, `dwReqDisLV` being `=` in all, `DatabaseServer/Project.cpp:97-106`.)
 *
 * A fresh object each call, so a test can change it.
 */
export function newVagrantOwn(): OwnCharacter {
  const skills: SkillSlot[] = Array.from({ length: MAX_SKILL_JOB }, (_, i) =>
    (i < 3 ? { skill: i + 1, level: 0 } : { skill: NULL_ID, level: 0 }));
  const inventory: InventoryItem[] = [
    { objectId: 0, itemId: 502, count: 1 }, { objectId: 1, itemId: 2801, count: 1 },
    { objectId: 2, itemId: 4805, count: 5 }, { objectId: 42, itemId: 506, count: 1 },
    { objectId: 43, itemId: 510, count: 1 }, { objectId: 44, itemId: 21, count: 1 },
    { objectId: 45, itemId: 2800, count: 3 },
  ];
  return {
    str: 15, sta: 15, dex: 15, int: 15, manaPoint: 63, fatiguePoint: 32, exp: 0n, skillLevel: 0, skillPoint: 0,
    deathExp: 0n, deathLevel: 0, remainGP: 0, skills, inventory, inventoryError: null,
  };
}
