import type { ExpRow, JobProp, WebItemProp } from '@flyffweb/formats';

/**
 * The numbers Neuz works out for the own character from the server's base values: the maximum HP, MP and FP, the EXP
 * bar's text, the attack speed, and the ATK, DEF and critical the Character window shows. Pure functions, copied from
 * `CMover` (`Source/_Common/MoverParam.cpp`, `MoverAttack.cpp`) and `CWndCharInfo` / `CWndStatus`
 * (`Source/_Interface/WndField.cpp`) with `__VER` 15 and the top of `VersionCommon.h` (`__JEFF_11`, `__PROP_0827`).
 *
 * Floats as in `ActionMover.ts`: C `float` maths is `Math.fround` after every operation and an `(int)` cast is
 * `Math.trunc`; an `int` meeting a `float` is converted first, and the order of evaluation is the C++'s.
 *
 * `GetParam( dst, base )` (`MoverParam.cpp:2746-2757`) is `base` plus the adjustment of `m_adjParamAry[dst]`, which the
 * equipment, the buffs and the `SM_*` items fill. Here the adjustment is a `ParamAdjust`; `equipAdjust` makes the
 * equipment's part, and the formulas that read parameters take one. Left out until the pieces that need them come:
 *   - the buffs and the `SM_*` modes (`SM_ATTACK_UP`, `SM_ATTACK_UP1` in `RenderATK`);
 *   - the change parameters (`m_chgParamAry`, `dwChgParamVal`), which replace a value; the item catalog does not carry them;
 *   - the refine of an item (`GetAbilityOption`) and its expiry (`GetItemMultiplier`): items count as unrefined and live;
 *   - a left-hand weapon (`IsDualWeapon`): `Equipped` has none, so the one-weapon branches are taken;
 *   - the party bonus of `GetCriticalProb` (`m_idparty && MVRF_CRITICAL`, a per-hit flag).
 */

const f32 = Math.fround;
const GEAR_MULTIPLIER = 1; // Catalog values already include the Resource gear profile.

/** `DST_*` (`Resource/defineAttribute.h`): the destination parameters these formulas read, and the three that stand for two. */
export const Dst = {
  STR: 1,
  DEX: 2,
  INT: 3,
  STA: 4,
  YOY_DMG: 5,
  /** Piece 7 M2: the first jobs' buffs' (`Resource/defineAttribute.h`): Pan Barrier, Quick Step, Cat's Reflex. */
  BLOCK_RANGE: 8,
  SPEED: 11,
  BLOCK_MELEE: 14,
  BOW_DMG: 6,
  CHR_CHANCECRITICAL: 9,
  ABILITY_MIN: 12,
  ABILITY_MAX: 13,
  KNUCKLE_DMG: 21,
  ATTACKSPEED: 24,
  SWD_DMG: 25,
  ADJDEF: 26,
  AXE_DMG: 34,
  HP_MAX: 35,
  MP_MAX: 36,
  FP_MAX: 37,
  ADJ_HITRATE: 47,
  ATTACKSPEED_RATE: 51,
  HP_MAX_RATE: 52,
  MP_MAX_RATE: 53,
  FP_MAX_RATE: 54,
  CHR_DMG: 63,
  /** Piece 7 M2: Stone Hand's, Prevention's, and the bits of Dark Illusion's and Counter's. */
  CHR_CHANCESTUN: 57,
  AUTOHP: 58,
  CHRSTATE: 64,
  ATKPOWER_RATE: 66,
  JUMPING: 68,
  ADJDEF_RATE: 72,
  /** Piece 7 M2: `DST_SPELL_RATE` (`Resource/defineAttribute.h:325`): the cast time and speed. */
  SPELL_RATE: 75,
  ATKPOWER: 83,
  TWOHANDMASTER_DMG: 86,
  YOYOMASTER_DMG: 87,
  BOWMASTER_DMG: 88,
  KNUCKLEMASTER_DMG: 89,
  /** `DST_STAT_ALLUP`: +n to STR, DEX, INT and STA (`SetDestParam`, `MoverParam.cpp:2300-2305`). */
  STAT_ALLUP: 10003,
  /** `DST_HPDMG_UP`: `DST_HP_MAX` and `DST_CHR_DMG` (:2306-2309). */
  HPDMG_UP: 10004,
  /** `DST_DEFHITRATE_DOWN`: `DST_ADJDEF` and `DST_ADJ_HITRATE` (:2310-2313). */
  DEFHITRATE_DOWN: 10005,
} as const;

/** `WT_*` (`Resource/defineAttribute.h:50-59`): `ItemProp::dwWeaponType`. */
export const WeaponType = {
  MELEE_SWD: 1,
  MELEE_AXE: 2,
  MELEE_STICK: 3,
  MELEE_KNUCKLE: 4,
  MELEE_STAFF: 5,
  MAGIC_WAND: 6,
  MELEE_YOYO: 20,
  RANGE_BOW: 21,
} as const;

/** `IK2_ARMOR` and `IK2_ARMORETC` (`Resource/defineItemkind.h:25-26`): the kinds whose ability is a defence (`SumEquipDefenseAbility`). */
const IK2_ARMOR = 7;
const IK2_ARMORETC = 8;
/** `MAX_ADJPARAMARY` (`Resource/defineAttribute.h:346`): the size of `m_adjParamAry`; `SetDestParam` ignores a parameter past it. */
const MAX_ADJPARAMARY = 94;
/** The destination parameters an item row holds: `dwDestParam1..3` (`__PROP_0827` is on, `VersionCommon.h:53`). */
const DEST_PARAMS_PER_ITEM = 3;

/** The stats as the formulas read them: `GetStr()`, `GetSta()`, `GetDex()` and `GetInt()` (`effectiveStats`), never below 1. */
export interface Stats { str: number; sta: number; dex: number; int: number }

/** What the own character wears, as `GetActiveHandItemProp` and `SumEquipDefenseAbility` see it. */
export interface Equipped {
  /** The item in the right hand (`PARTS_RWEAPON`), or null for none: the fists, `FISTS`. */
  weapon: WebItemProp | null;
  /** The other worn items; the ones of kind `IK2_ARMOR` or `IK2_ARMORETC` add to the defence. */
  armour: WebItemProp[];
}

/** `m_adjParamAry` as a sparse map: `DST_*` to the sum of the adjustments set on it. A parameter not in it is 0. */
export type ParamAdjust = ReadonlyMap<number, number>;

/** No adjustment at all: nothing equipped that changes a parameter, no buff. */
export const NO_ADJUST: ParamAdjust = new Map<number, number>();

/**
 * The item the right hand holds when nothing is equipped: `II_WEA_HAN_HAND`, the row `Resource/propItem.txt:382`
 * (`GetActiveHandItemProp`, `Mover.cpp:2930-2941`). `ability 1-2`, `WT_MELEE_STAFF`, `fAttackSpeed` 0.07, no
 * destination parameters.
 */
export const FISTS: Pick<WebItemProp, 'abilityMin' | 'abilityMax' | 'weaponType' | 'attackSpeed' | 'destParams' | 'adjParams'> = {
  abilityMin: 1,
  abilityMax: 2,
  weaponType: WeaponType.MELEE_STAFF,
  attackSpeed: f32(0.07),
  destParams: [-1, -1, -1],
  adjParams: [-1, -1, -1],
};

/**
 * `GetItemMultiplier` of an item with no refine that has not expired (`MoverAttack.cpp:2068-2099`): `fValue` starts at
 * 1.0f (`__VER >= 11`, no endurance, :2081-2082) and only a refine (`nOption`) changes it (:2092-2097).
 */
const ITEM_MULTIPLIER = 1;

/**
 * `CMover::GetParam` (`MoverParam.cpp:2746-2757`) without a change parameter: `base` plus what is adjusted on `dst`.
 */
export function getParam(adj: ParamAdjust, dst: number, base: number): number {
  return base + (adj.get(dst) ?? 0);
}

/**
 * What `SetDestParam( int nDstParameter, int nAdjParameterValue, ... )` (`MoverParam.cpp:2237-2509`) does to
 * `m_adjParamAry` for one parameter of an item: the three that stand for two split (:2300-2313), a negative or
 * out-of-range one is dropped (:2241-2247, :2438-2439), and an adjustment adds up unless it is 0 (:2441-2484). The
 * other special cases (state bits, chance and reflect parameters, recoveries, resists) touch parameters these
 * formulas do not read.
 */
function setDestParam(adj: Map<number, number>, dst: number, value: number): void {
  if (dst < 0) return;
  switch (dst) {
    case Dst.STAT_ALLUP:
      for (const stat of [Dst.STR, Dst.DEX, Dst.INT, Dst.STA]) setDestParam(adj, stat, value);
      return;
    case Dst.HPDMG_UP:
      setDestParam(adj, Dst.HP_MAX, value);
      setDestParam(adj, Dst.CHR_DMG, value);
      return;
    case Dst.DEFHITRATE_DOWN:
      setDestParam(adj, Dst.ADJDEF, value);
      setDestParam(adj, Dst.ADJ_HITRATE, value);
      return;
  }
  if (dst >= MAX_ADJPARAMARY) return;
  if (value !== 0) adj.set(dst, (adj.get(dst) ?? 0) + value);
}

/**
 * The adjustments the worn items make: `SetEquipDstParam` (`MoverParam.cpp:1903-1915`) sets the destination
 * parameters of each item (`SetDestParam( int nItemIdx, ... )`, :2221-2232: the columns whose `dwDestParam` is not
 * -1, up to three). The fists have none.
 */
export function equipAdjust(eq: Equipped): ParamAdjust {
  const adj = new Map<number, number>();
  const worn = eq.weapon === null ? eq.armour : [eq.weapon, ...eq.armour];
  for (const item of worn) {
    for (let i = 0; i < DEST_PARAMS_PER_ITEM; i++) {
      const dst = item.destParams[i];
      if (dst === undefined || dst === -1) continue;
      setDestParam(adj, dst, (item.adjParams[i] ?? 0) * GEAR_MULTIPLIER);
    }
  }
  return adj;
}

/**
 * `GetStr()`, `GetDex()`, `GetInt()` and `GetSta()` (`MoverParam.cpp:3163-3246`): the base stat plus
 * `GetParam( DST_*, 0 )`, and at least 1 (`__JEFF_11`). `base` is what the server sends (`m_nStr` and the others).
 */
export function effectiveStats(base: Stats, adj: ParamAdjust): Stats {
  const stat = (value: number, dst: number): number => Math.max(1, value + getParam(adj, dst, 0));
  return {
    str: stat(base.str, Dst.STR),
    sta: stat(base.sta, Dst.STA),
    dex: stat(base.dex, Dst.DEX),
    int: stat(base.int, Dst.INT),
  };
}

/**
 * The end every maximum shares (`GetMaxHitPoint`, `GetMaxManaPoint`, `GetMaxFatiguePoint`, `MoverParam.cpp:2788-2839`):
 * `GetParam( DST_*_MAX, origin )` times `1.0f + (float)GetParam( DST_*_MAX_RATE, 0 ) / (float)100`, cut to an int, and
 * at least 1 (`__JEFF_11`).
 */
function maxPoint(origin: number, adj: ParamAdjust, maxDst: number, rateDst: number): number {
  const nResult = getParam(adj, maxDst, origin);
  const nFactor = getParam(adj, rateDst, 0);
  const factor = f32(1 + f32(nFactor / 100));
  return Math.max(1, Math.trunc(f32(f32(nResult) * factor)));
}

/**
 * `CMover::GetMaxHitPoint` of a player (`MoverParam.cpp:2788-2805`) over `GetMaxOriginHitPoint( FALSE )`
 * (:2856-2875): `a = fFactorMaxHP * level / 2`, `b = a * ((level + 1) / 4) * (1 + STA / 50) + STA * 10`, `(int)(b + 80)`.
 */
export function maxHitPoint(job: JobProp, level: number, s: Stats, adj: ParamAdjust = NO_ADJUST): number {
  const a = f32(f32(job.factorMaxHP * level) / 2);
  const b = f32(f32(f32(a * f32(f32(level + 1) / 4)) * f32(1 + f32(s.sta / 50))) + f32(s.sta * 10));
  const origin = Math.trunc(f32(b + 80));
  return maxPoint(origin, adj, Dst.HP_MAX, Dst.HP_MAX_RATE);
}

/**
 * `CMover::GetMaxManaPoint` of a player (`MoverParam.cpp:2808-2822`) over `GetMaxOriginManaPoint( FALSE )`
 * (:2889-2908): `(int)( (((level * 2 + INT * 8) * factor) + 22) + INT * factor )`.
 */
export function maxManaPoint(job: JobProp, level: number, s: Stats, adj: ParamAdjust = NO_ADJUST): number {
  const factor = job.factorMaxMP;
  const inner = f32(f32(f32(level * 2) + f32(s.int * 8)) * factor);
  const origin = Math.trunc(f32(f32(inner + 22) + f32(s.int * factor)));
  return maxPoint(origin, adj, Dst.MP_MAX, Dst.MP_MAX_RATE);
}

/**
 * `CMover::GetMaxFatiguePoint` of a player (`MoverParam.cpp:2825-2839`) over `GetMaxOriginFatiguePoint( FALSE )`
 * (:2910-2937): `(int)( ((level * 2 + STA * 6) * factor) + STA * factor )`.
 */
export function maxFatiguePoint(job: JobProp, level: number, s: Stats, adj: ParamAdjust = NO_ADJUST): number {
  const factor = job.factorMaxFP;
  const inner = f32(f32(f32(level * 2) + f32(s.sta * 6)) * factor);
  const origin = Math.trunc(f32(inner + f32(s.sta * factor)));
  return maxPoint(origin, adj, Dst.FP_MAX, Dst.FP_MAX_RATE);
}

/**
 * `CMover::GetMaxHitPoint` of a monster (`MoverParam.cpp:2788-2805`) over `GetMaxOriginHitPoint` (:2876-2884):
 * `int( dwAddHp * prj.m_fMonsterHitpointRate * pMoverProp->m_fHitPoint_Rate )`. The first rate is 1.0f unless the back-end
 * system changed it. At the join the server sends it to game masters only (`CUser::AddGameSetting`, `User.cpp:6508-6520`);
 * a change made while the world runs goes to everyone (`DBBackEndSystem.cpp:77-79` sends the settings to all players, the
 * world server's `OnBaseGameSetting` answers with `CUserMng::AddGameRate`, `DPDatabaseClient.cpp:1704-1725` and
 * `User.cpp:5228-5236`, an `AddBlock` to all; Neuz keeps it, `DPClient.cpp:6551-6553`). This client does not read
 * GAMERATE and takes 1.0f. The second rate is the MONSTERPROP percent over 100.0f (`CDPClient::OnMonsterProp`,
 * `DPClient.cpp:6660`), 1.0f when none came (`ratePercent` 100).
 */
export function monsterMaxHitPoint(addHp: number, ratePercent: number): number {
  const monsterRate = 1;
  const hitPointRate = f32(ratePercent / 100);
  const origin = Math.trunc(f32(f32(f32(addHp) * monsterRate) * hitPointRate));
  return maxPoint(origin, NO_ADJUST, Dst.HP_MAX, Dst.HP_MAX_RATE);
}

/**
 * `CMover::GetMaxExp1` (`Mover.h:1108`): the EXP a character of `level` needs to reach the next, `nExp1` of the
 * row after the level's (`m_aExpCharacter[ m_nLevel + 1 ]`). Throws a RangeError when the table has no such row.
 */
export function expNeeded(exp: readonly ExpRow[], level: number): bigint {
  const row = exp[level + 1];
  if (row === undefined) throw new RangeError(`the EXP table has no row ${level + 1} (the next level of ${level})`);
  return row.exp1;
}

/** `EXPINTEGER nExpResult = GetExp1() * (EXPINTEGER)10000 / GetMaxExp1()` (`MoverParam.cpp:488`, `WndField.cpp:10617`). */
function expResult(exp: bigint, needed: bigint): bigint {
  return exp * 10000n / needed;
}

/** `CMover::GetExpPercent` (`MoverParam.cpp:484-491`): `(int)( GetExp1() * 10000 / GetMaxExp1() )`, in units of 0.01 %. */
export function expPercent(exp: bigint, needed: bigint): number {
  return Number(BigInt.asIntN(32, expResult(exp, needed)));
}

/**
 * The EXP text of the status window (`CWndStatus::OnDraw`, `WndField.cpp:10617-10622`): `fExp = (float)nExpResult /
 * 100.0f`, then `"99.99%"` from `fExp >= 99.99f` (so that `%.2f` cannot round up to 100.00), else `"%.2f%%"`.
 */
export function expPercentText(exp: bigint, needed: bigint): string {
  const fExp = f32(f32(Number(expResult(exp, needed))) / 100);
  if (fExp >= f32(99.99)) return '99.99%';
  return `${fExp.toFixed(2)}%`;
}

/** The weights of `GetAttackSpeedPlusValue` (`MoverAttack.cpp:72-88`), as C `float`. */
const ATTACK_SPEED_PLUS = [
  0.08, 0.16, 0.24, 0.32, 0.40, 0.48, 0.56, 0.64, 0.72, 0.80, 0.88, 0.96, 1.04, 1.12, 1.20, 1.30, 1.38, 1.50,
].map(f32);

/** `GetAttackSpeedPlusValue( n )`: the table entry `n / 10`, from the first to the last (:72-88). */
function attackSpeedPlusValue(n: number): number {
  const index = Math.min(Math.max(Math.trunc(n / 10), 0), ATTACK_SPEED_PLUS.length - 1);
  return ATTACK_SPEED_PLUS[index]!;
}

/**
 * `CMover::GetAttackSpeed` (`MoverAttack.cpp:159-192`). `weaponSpeed` is the held item's `fAttackSpeed` (`FISTS` for
 * none), `dex` is `GetDex()`. `a` is the A of the formula after its cap at 187; `speed` is the float result, from 0.1
 * to 2.0; `shown` is the percent the Character window prints, `int( fAttackSpeed * 100.0f ) / 2` (`WndField.cpp:3240`).
 */
export function attackSpeed(
  job: JobProp,
  weaponSpeed: number,
  level: number,
  dex: number,
  adj: ParamAdjust = NO_ADJUST,
): { a: number; speed: number; shown: number } {
  // int A = int( fAttackSpeed + ( fItem * ( 4.0f * GetDex() + GetLevel() / 8.0f ) ) - 3.0f );
  const fromStats = f32(f32(4 * dex) + f32(level / 8));
  let a = Math.trunc(f32(f32(job.attackSpeed + f32(weaponSpeed * fromStats)) - 3));
  if (f32(187.5) <= a) a = 187;

  // fSpeed = ( ( 50.0f / (200.f - A) ) / 2.0f ) + GetAttackSpeedPlusValue( A );
  let speed = f32(f32(f32(50 / f32(200 - a)) / 2) + attackSpeedPlusValue(a));

  speed = f32(speed + f32(getParam(adj, Dst.ATTACKSPEED, 0) / 1000));
  const rate = getParam(adj, Dst.ATTACKSPEED_RATE, 0);
  if (0 < rate) speed = f32(speed + f32(f32(speed * rate) / 100));

  if (speed < f32(0.1)) speed = f32(0.1);
  if (speed > 2) speed = 2;

  return { a, speed, shown: Math.trunc(Math.trunc(f32(speed * 100)) / 2) };
}

/**
 * `(int)( ( stat - minus ) * factor + level * perLevel )` in floats: the shape of the lines of `GetWeaponATK`
 * (`MoverAttack.cpp:379-401`, the `float( ... ) + float( ... )` of each).
 */
function statAtk(stat: number, minus: number, factor: number, level: number, perLevel: number): number {
  return Math.trunc(f32(f32((stat - minus) * factor) + f32(level * f32(perLevel))));
}

/**
 * `CMover::GetPlusWeaponATK` (`MoverAttack.cpp:287-333`): the damage parameters of the weapon type, then the master
 * parameters of a single weapon (`__VER >= 10`, :308-330; `IsDualWeapon()` is false here).
 */
function plusWeaponAtk(weaponType: number, adj: ParamAdjust): number {
  let atk = 0;
  switch (weaponType) {
    case WeaponType.MELEE_SWD: atk = getParam(adj, Dst.SWD_DMG, 0); break;
    case WeaponType.MELEE_AXE: atk = getParam(adj, Dst.AXE_DMG, 0); break;
    case WeaponType.MELEE_KNUCKLE: atk = getParam(adj, Dst.KNUCKLE_DMG, 0); break;
    case WeaponType.MELEE_YOYO: atk = getParam(adj, Dst.YOY_DMG, 0); break;
    case WeaponType.RANGE_BOW: atk = getParam(adj, Dst.BOW_DMG, 0); break;
  }
  switch (weaponType) {
    case WeaponType.MELEE_KNUCKLE: atk += getParam(adj, Dst.KNUCKLEMASTER_DMG, 0); break;
    case WeaponType.MELEE_YOYO: atk += getParam(adj, Dst.YOYOMASTER_DMG, 0); break;
    case WeaponType.RANGE_BOW: atk += getParam(adj, Dst.BOWMASTER_DMG, 0); break;
    case WeaponType.MELEE_SWD:
    case WeaponType.MELEE_AXE: atk += getParam(adj, Dst.TWOHANDMASTER_DMG, 0); break;
  }
  return atk;
}

/** `CMover::GetWeaponATK` (`MoverAttack.cpp:374-411`) for a player: the part of the weapon's damage that the stats and level give. */
function weaponAtk(job: JobProp, level: number, s: Stats, weaponType: number, adj: ParamAdjust): number {
  let atk = 0;
  switch (weaponType) {
    case WeaponType.MELEE_SWD: atk = statAtk(s.str, 12, job.meleeSWD, level, 1.1); break;
    case WeaponType.MELEE_AXE: atk = statAtk(s.str, 12, job.meleeAXE, level, 1.2); break;
    case WeaponType.MELEE_STAFF: atk = statAtk(s.str, 10, job.meleeSTAFF, level, 1.1); break;
    case WeaponType.MELEE_STICK: atk = statAtk(s.str, 10, job.meleeSTICK, level, 1.3); break;
    case WeaponType.MELEE_KNUCKLE: atk = statAtk(s.str, 10, job.meleeKNUCKLE, level, 1.2); break;
    case WeaponType.MAGIC_WAND: atk = statAtk(s.int, 10, job.magicWAND, level, 1.2); break;
    case WeaponType.MELEE_YOYO: atk = statAtk(s.str, 12, job.meleeYOYO, level, 1.1); break;
    case WeaponType.RANGE_BOW: {
      // (int)( (((GetDex()-14)*4.0f + (GetLevel()*1.3f) + (GetStr()*0.2f)) * 0.7f) )
      const sum = f32(f32(f32((s.dex - 14) * 4) + f32(level * f32(1.3))) + f32(s.str * f32(0.2)));
      atk = Math.trunc(f32(sum * f32(0.7)));
      break;
    }
  }
  return atk + plusWeaponAtk(weaponType, adj);
}

/**
 * The ATK the Character window prints: `CWndCharInfo::RenderATK` (`WndField.cpp:4057-4098`) over
 * `CMover::GetHitMinMax` of a player (`MoverAttack.cpp:415-461`). One number, the mean of the damage range. `adj`
 * defaults to the equipment's parameters.
 *
 * The range: the held item's `dwAbilityMin * 2` and `dwAbilityMax * 2` through `DST_ABILITY_MIN/MAX`, plus
 * `GetWeaponATK` and `DST_CHR_DMG`; times the item multiplier when a weapon is worn (the fists are not an item). The
 * window then takes `(min + max) / 2`, adds `DST_ATKPOWER_RATE` percent of it when above 0, `GetWeaponPlusDamage`
 * (always 0, :120-141) and `DST_ATKPOWER`, and keeps it at 0 or more (`__JEFF_11`).
 */
export function attackShown(job: JobProp, level: number, s: Stats, eq: Equipped, adj: ParamAdjust = equipAdjust(eq)): number {
  const held = eq.weapon ?? FISTS;
  let min = getParam(adj, Dst.ABILITY_MIN, held.abilityMin * 2 * (eq.weapon ? GEAR_MULTIPLIER : 1));
  let max = getParam(adj, Dst.ABILITY_MAX, held.abilityMax * 2 * (eq.weapon ? GEAR_MULTIPLIER : 1));

  const plus = weaponAtk(job, level, s, held.weaponType, adj) + getParam(adj, Dst.CHR_DMG, 0);
  min += plus;
  max += plus;

  if (eq.weapon !== null) {
    min = Math.trunc(f32(min * ITEM_MULTIPLIER));
    max = Math.trunc(f32(max * ITEM_MULTIPLIER));
    // the refine adds (int)pow( option, 1.5f ) to both (:451-461): 0 for an unrefined weapon
  }

  let atk = Math.trunc((min + max) / 2);
  const rate = getParam(adj, Dst.ATKPOWER_RATE, 0);
  if (0 < rate) atk += Math.trunc((atk * rate) / 100);
  atk += getParam(adj, Dst.ATKPOWER, 0);
  return Math.max(0, atk);
}

/**
 * The DEF the Character window prints: `CMover::GetShowDefense( FALSE )` (`MoverAttack.cpp:226-233`) through
 * `CalcDefense` (:517-526) and `CalcDefenseCore`'s generic branch (:585-601). `adj` defaults to the equipment's parameters.
 *
 * The item part: `UpdateParam` sums the worn armour (`SumEquipDefenseAbility`, `MoverParam.cpp:1919-1969`, the items of
 * kind `IK2_ARMOR` and `IK2_ARMORETC`) through `DST_ABILITY_MIN/MAX` into `m_nDefenseMin/Max`, and
 * `GetDefenseByItem( FALSE )` is `min + (max - min) / 2` (:217-224).
 */
export function defenceShown(job: JobProp, level: number, s: Stats, eq: Equipped, adj: ParamAdjust = equipAdjust(eq)): number {
  let defenseMin = 0;
  let defenseMax = 0;
  for (const item of eq.armour) {
    if (item.kind2 !== IK2_ARMOR && item.kind2 !== IK2_ARMORETC) continue;
    // nMin += (int)( dwAbilityMin * f ) + nOptionVal, nOptionVal 0 without a refine
    defenseMin += Math.trunc(f32(item.abilityMin * ITEM_MULTIPLIER * GEAR_MULTIPLIER));
    defenseMax += Math.trunc(f32(item.abilityMax * ITEM_MULTIPLIER * GEAR_MULTIPLIER));
  }
  defenseMin = getParam(adj, Dst.ABILITY_MIN, defenseMin);
  defenseMax = getParam(adj, Dst.ABILITY_MAX, defenseMax);
  const byItem = defenseMin + Math.trunc((defenseMax - defenseMin) / 2);

  // nDefense = (int)( ((((GetLevel()*2) + (GetSta()/2)) / 2.8f ) - 4) + ((GetSta()-14) * fFactor) );
  const fromStats = f32(f32(f32(level * 2 + Math.trunc(s.sta / 2)) / f32(2.8)) - 4);
  let defense = Math.trunc(f32(fromStats + f32((s.sta - 14) * job.factorDef)));
  defense += Math.trunc(byItem / 4);
  defense += getParam(adj, Dst.ADJDEF, 0);
  defense = Math.max(0, defense);

  // CalcDefense: (int)( nDefense * GetDEFMultiplier ), 1.0f * (1.0f + (float)GetParam( DST_ADJDEF_RATE, 0 ) / 100.0f) (:496-513)
  const multiplier = f32(1 + f32(getParam(adj, Dst.ADJDEF_RATE, 0) / 100));
  return Math.trunc(f32(defense * multiplier));
}

/**
 * The critical the Character window prints: `CMover::GetCriticalProb` (`MoverAttack.cpp:612-652`) for a player,
 * `"%d%%"` (`WndField.cpp:3223`): `DEX / 10` as an int, `(int)( n * fCritical )`, `DST_CHR_CHANCECRITICAL`, and 0 or
 * more (`__JEFF_11`).
 */
export function criticalShown(job: JobProp, s: Stats, adj: ParamAdjust = NO_ADJUST): number {
  let prob = Math.trunc(s.dex / 10);
  prob = Math.trunc(f32(prob * job.critical));
  prob = getParam(adj, Dst.CHR_CHANCECRITICAL, prob);
  return Math.max(0, prob);
}
