import type { ExpRow, JobProp, WebItemProp } from '@flyffweb/formats';
import type { AddedMover } from '@flyffweb/protocol';
import { newVagrantOwn } from '@flyffweb/testkit';
import type { GameData } from '../../src/world/gameData';
import { OwnState } from '../../src/world/OwnState';
import { addedPlayer, gameDataOf } from './movers';

const f32 = Math.fround;

/** The object ID of the own character in these tests. */
export const OWN_ID = 9;

/** `JOB_VAGRANT`, `Resource/propJob.inc:3`, the numbers as `GetFloat` stores them (C `float`). */
export const VAGRANT: JobProp = {
  name: 'JOB_VAGRANT', attackSpeed: 75, factorMaxHP: f32(0.9), factorMaxMP: f32(0.3), factorMaxFP: f32(0.3),
  factorDef: 1, factorHPRecovery: f32(1.2), factorMPRecovery: 0.5, factorFPRecovery: 0.5, meleeSWD: 4.5, meleeAXE: 5.5,
  meleeSTAFF: f32(0.8), meleeSTICK: 3, meleeKNUCKLE: 5, magicWAND: 6, blocking: f32(0.2), meleeYOYO: f32(4.2),
  critical: 1,
};

/** `ExpTable.inc:4-20`, rows 0 to 16 (`nExp1 nExp2 dwLPPoint nLimitExp`; the row's place is the level). */
export const EXP_ROWS: ExpRow[] = [
  [0, 0, 0, 0], [0, 1, 0, 16], [14, 1, 2, 18], [20, 2, 2, 21], [36, 2, 2, 25], [90, 3, 2, 30], [152, 4, 2, 35],
  [250, 4, 2, 42], [352, 5, 2, 49], [480, 5, 2, 58], [591, 6, 2, 69], [743, 6, 2, 84], [973, 7, 2, 102],
  [1290, 8, 2, 123], [1632, 9, 2, 145], [1928, 10, 2, 170], [2340, 12, 2, 195],
].map(([exp1, exp2, lpPoint, limitExp]) => ({
  exp1: BigInt(exp1!), exp2: BigInt(exp2!), lpPoint: lpPoint!, limitExp: BigInt(limitExp!),
}));

/** An item row with only the columns these tests read; the rest as an armour with no destination parameters has them. */
export const itemProp = (over: Partial<WebItemProp>): WebItemProp => ({
  id: 0, name: '', kind1: 2, kind2: 7, kind3: 18, handed: -1, part: 2, abilityMin: 0, abilityMax: 0, weaponType: -1,
  attackSpeed: -1, attackRange: -1, destParams: [-1, -1, -1], adjParams: [-1, -1, -1], sfxHit: -1, model: null,
  icon: null, packMax: 1, ...over,
});

/** `II_WEA_SWO_WOODEN`, `Resource/propItem.txt:701`: `IK1_WEAPON IK2_WEAPON_DIRECT IK3_SWORD`, `HD_ONE`, `PARTS_RWEAPON`, 3-4, `WT_MELEE_SWD`, 0.085. */
export const WOODEN_SWORD = itemProp({
  id: 21, name: 'Wooden Sword', kind1: 1, kind2: 2, kind3: 2, handed: 1, part: 10, abilityMin: 3, abilityMax: 4,
  weaponType: 1, attackSpeed: f32(0.085), attackRange: 1, sfxHit: 20,
});
/** `II_ARM_M_VAG_SUIT01`, `propItem.txt:564`: `IK2_ARMOR`, `PARTS_UPPER_BODY`, defence 8-10. */
export const SUIT = itemProp({ id: 502, name: 'Cotton Suit', kind2: 7, kind3: 18, part: 2, abilityMin: 8, abilityMax: 10 });
/** `II_ARM_M_VAG_GAUNTLET01`, `propItem.txt:241`: `IK2_ARMORETC`, `PARTS_HAND`, defence 5-7. */
export const GAUNTLET = itemProp({ id: 506, name: 'Cotton Gauntlet', kind2: 8, kind3: 19, part: 4, abilityMin: 5, abilityMax: 7 });
/** `II_ARM_M_VAG_BOOTS01`, `propItem.txt:40`: `IK2_ARMORETC`, `PARTS_FOOT`, defence 4-5. */
export const BOOTS = itemProp({ id: 510, name: 'Cotton Boots', kind2: 8, kind3: 20, part: 5, abilityMin: 4, abilityMax: 5 });

/** What the lobby lists a new character as wearing (the item IDs of `PLAYER_LIST`'s equipment). */
export const STARTER_EQUIPMENT = [502, 506, 510, 21];

/** The catalogs a Vagrant's numbers need: the job row, the EXP table and the starter items' rows. */
export function ownGameData(parts: Partial<GameData> = {}): GameData {
  return gameDataOf({
    jobs: [VAGRANT],
    exp: EXP_ROWS,
    itemProps: new Map([WOODEN_SWORD, SUIT, GAUNTLET, BOOTS].map((prop) => [prop.id, prop])),
    ...parts,
  });
}

/**
 * The ADD_OBJ of the own character: a Vagrant of `level` with a new Vagrant's numbers (`newVagrantOwn`), and the HP the
 * `BASE_VALUE_TBL` row gives (230).
 */
export function ownAdded(level = 1, own = newVagrantOwn(), hitPoint = 230): AddedMover {
  return addedPlayer(OWN_ID, { self: true, job: 0, level, own }, { hitPoint });
}

/** The own state of a new Vagrant at `level`, wearing the starter items unless `equipment` says otherwise. */
export function newVagrant(
  level = 1, equipment: number[] = STARTER_EQUIPMENT, data: GameData = ownGameData(),
): OwnState {
  return new OwnState(data, ownAdded(level), equipment);
}
