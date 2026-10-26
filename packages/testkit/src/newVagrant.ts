import { NULL_ID } from '@flyffweb/protocol';
import type { InventoryItem, OwnCharacter, SkillSlot } from '@flyffweb/protocol';

/** `MAX_SKILL_JOB` (`_Common/Mover.h:96-100`, `__VER >= 10`): the length of `m_aJobSkill`. */
const MAX_SKILL_JOB = 45;

/**
 * The own data of a new male Vagrant, as the ADD_OBJ of its first login carries it: the `m_nStr` to `m_nInt` of the
 * `BASE_VALUE_TBL` row (`Database.sql:2741`, 15 each), its `m_nManaPoint` 63 and `m_nFatiguePoint` 32 (the row's HP is
 * 230, which the mover's `hitPoint` holds, not this), level 1 with `m_nExp1` 0, `m_nRemainGP` 0 and no death yet.
 *
 * The skills: the row's `m_aJobSkill` lists `dwExp,dwLevel,dwSkill,bStop` (the order `DBConvert.cpp:199-202` reads), so
 * slots 0 to 2 are the Vagrant's `SI_VAG_ONE_CLEANHIT`, `_BRANDISH` and `_OVERCUTTER` (1 to 3, `Resource/defineSkill.h:19-21`)
 * at level 1; the other 42 hold no skill (`NULL_ID`, level 0, as `CMover::InitProp` leaves a slot,
 * `_Common/Mover.cpp:1482-1485`). The inventory: the row's `m_Inventory` for a man, the slot first: the suit (502), the
 * biscuit (2801), 5 town blink wings (4805), the gauntlets (506), boots (510), the Wooden Sword (21) and 3 lollipops
 * (2800).
 *
 * A fresh object each call, so a test can change it.
 */
export function newVagrantOwn(): OwnCharacter {
  const skills: SkillSlot[] = Array.from({ length: MAX_SKILL_JOB }, (_, i) =>
    (i < 3 ? { skill: i + 1, level: 1 } : { skill: NULL_ID, level: 0 }));
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
