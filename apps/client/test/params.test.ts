import { describe, expect, it } from 'vitest';
import type { ExpRow, JobProp, WebItemProp } from '@flyffweb/formats';
import {
  Dst,
  FISTS,
  NO_ADJUST,
  WeaponType,
  attackShown,
  attackSpeed,
  criticalShown,
  defenceShown,
  effectiveStats,
  equipAdjust,
  expNeeded,
  expPercent,
  expPercentText,
  getParam,
  maxFatiguePoint,
  maxHitPoint,
  maxManaPoint,
  monsterMaxHitPoint,
} from '../src/world/sim/params';
import type { Equipped, ParamAdjust, Stats } from '../src/world/sim/params';

const f32 = Math.fround;

/** `JOB_VAGRANT`, `Resource/propJob.inc:3`, the numbers as `GetFloat` stores them (C `float`). */
const VAGRANT: JobProp = {
  name: 'JOB_VAGRANT', attackSpeed: 75, factorMaxHP: f32(0.9), factorMaxMP: f32(0.3), factorMaxFP: f32(0.3),
  factorDef: 1, factorHPRecovery: f32(1.2), factorMPRecovery: 0.5, factorFPRecovery: 0.5, meleeSWD: 4.5, meleeAXE: 5.5,
  meleeSTAFF: f32(0.8), meleeSTICK: 3, meleeKNUCKLE: 5, magicWAND: 6, blocking: f32(0.2), meleeYOYO: f32(4.2),
  critical: 1,
};

/** The stats of a new character (`Obj.cpp:165`): 15 in each. */
const S15: Stats = { str: 15, sta: 15, dex: 15, int: 15 };

/** An item row with only the columns these formulas read; the rest as an armour with no destination parameters has them. */
const item = (over: Partial<WebItemProp>): WebItemProp => ({
  id: 0, name: '', kind1: 2, kind2: 7, kind3: 18, handed: -1, part: 2, abilityMin: 0, abilityMax: 0, weaponType: -1,
  attackSpeed: -1, attackRange: -1, destParams: [-1, -1, -1], adjParams: [-1, -1, -1], sfxHit: -1, model: null,
  icon: null, ...over,
});

/** `II_WEA_SWO_WOODEN`, `Resource/propItem.txt:701`: `IK1_WEAPON IK2_WEAPON_DIRECT IK3_SWORD`, `HD_ONE`, `PARTS_RWEAPON`, 3-4, `WT_MELEE_SWD`, 0.085. */
const WOODEN_SWORD = item({
  id: 21, name: 'Wooden Sword', kind1: 1, kind2: 2, kind3: 2, handed: 1, part: 10, abilityMin: 3, abilityMax: 4,
  weaponType: WeaponType.MELEE_SWD, attackSpeed: f32(0.085), attackRange: 1, sfxHit: 20,
});
/** `II_ARM_M_VAG_SUIT01`, `propItem.txt:564`: `IK2_ARMOR`, `PARTS_UPPER_BODY`, defence 8-10. */
const SUIT = item({ id: 502, name: 'Cotton Suit', kind2: 7, kind3: 18, part: 2, abilityMin: 8, abilityMax: 10 });
/** `II_ARM_M_VAG_GAUNTLET01`, `propItem.txt:241`: `IK2_ARMORETC`, `PARTS_HAND`, defence 5-7. */
const GAUNTLET = item({ id: 506, name: 'Cotton Gauntlet', kind2: 8, kind3: 19, part: 4, abilityMin: 5, abilityMax: 7 });
/** `II_ARM_M_VAG_BOOTS01`, `propItem.txt:40`: `IK2_ARMORETC`, `PARTS_FOOT`, defence 4-5. */
const BOOTS = item({ id: 510, name: 'Cotton Boots', kind2: 8, kind3: 20, part: 5, abilityMin: 4, abilityMax: 5 });

const NAKED: Equipped = { weapon: null, armour: [] };
const STARTER: Equipped = { weapon: WOODEN_SWORD, armour: [SUIT, GAUNTLET, BOOTS] };

/** The adjustments of `m_adjParamAry`, from pairs. */
const adjOf = (...pairs: [number, number][]): ParamAdjust => new Map(pairs);

/** `ExpTable.inc:4-20`, rows 0 to 16 (`nExp1 nExp2 dwLPPoint nLimitExp`; the row's place is the level). */
const EXP_ROWS: ExpRow[] = [
  [0, 0, 0, 0], [0, 1, 0, 16], [14, 1, 2, 18], [20, 2, 2, 21], [36, 2, 2, 25], [90, 3, 2, 30], [152, 4, 2, 35],
  [250, 4, 2, 42], [352, 5, 2, 49], [480, 5, 2, 58], [591, 6, 2, 69], [743, 6, 2, 84], [973, 7, 2, 102],
  [1290, 8, 2, 123], [1632, 9, 2, 145], [1928, 10, 2, 170], [2340, 12, 2, 195],
].map(([exp1, exp2, lpPoint, limitExp]) => ({
  exp1: BigInt(exp1!), exp2: BigInt(exp2!), lpPoint: lpPoint!, limitExp: BigInt(limitExp!),
}));

describe('getParam, equipAdjust and effectiveStats (CMover::GetParam, SetDestParam, GetStr)', () => {
  it('adds the adjustment of a parameter to the base, and leaves a base with none alone', () => {
    const adj = adjOf([Dst.STR, 3], [Dst.ADJDEF, -2]);
    expect(getParam(adj, Dst.STR, 15)).toBe(18);
    expect(getParam(adj, Dst.ADJDEF, 0)).toBe(-2);
    expect(getParam(adj, Dst.DEX, 15)).toBe(15);
    expect(getParam(NO_ADJUST, Dst.STR, 15)).toBe(15);
  });

  it('sums the destination parameters of the weapon and the armour, skipping the unused columns', () => {
    const ring = item({ destParams: [Dst.ADJDEF, Dst.STR, -1], adjParams: [5, 3, -1] });
    const boots = item({ destParams: [Dst.ADJDEF, -1, Dst.HP_MAX], adjParams: [1, -1, 40] });
    const sword = item({ destParams: [Dst.ATKPOWER, -1, -1], adjParams: [4, -1, -1] });
    const adj = equipAdjust({ weapon: sword, armour: [ring, boots] });
    expect(new Map(adj)).toEqual(new Map([[Dst.ATKPOWER, 4], [Dst.ADJDEF, 6], [Dst.STR, 3], [Dst.HP_MAX, 40]]));
    expect(equipAdjust(NAKED).size).toBe(0);
    expect(equipAdjust(STARTER).size).toBe(0); // the starter items change nothing
  });

  it('splits the three destination parameters that stand for two (SetDestParam)', () => {
    const all = item({ destParams: [Dst.STAT_ALLUP, Dst.HPDMG_UP, Dst.DEFHITRATE_DOWN], adjParams: [2, 7, 3] });
    expect(new Map(equipAdjust({ weapon: null, armour: [all] }))).toEqual(new Map([
      [Dst.STR, 2], [Dst.DEX, 2], [Dst.INT, 2], [Dst.STA, 2],
      [Dst.HP_MAX, 7], [Dst.CHR_DMG, 7],
      [Dst.ADJDEF, 3], [Dst.ADJ_HITRATE, 3],
    ]));
  });

  it('keeps no entry for a zero adjustment or a parameter past MAX_ADJPARAMARY (94), and a negative one counts', () => {
    const odd = item({ destParams: [Dst.STR, 94, Dst.ADJDEF], adjParams: [0, 5, -3] });
    expect(new Map(equipAdjust({ weapon: null, armour: [odd] }))).toEqual(new Map([[Dst.ADJDEF, -3]]));
  });

  it('GetStr: the base plus DST_STR, and at least 1 (__JEFF_11)', () => {
    const adj = adjOf([Dst.STR, 3], [Dst.STA, -20], [Dst.DEX, -14]);
    expect(effectiveStats(S15, adj)).toEqual({ str: 18, sta: 1, dex: 1, int: 15 });
    expect(effectiveStats({ str: 0, sta: 15, dex: 15, int: 15 }, NO_ADJUST).str).toBe(1);
    expect(effectiveStats(S15, NO_ADJUST)).toEqual(S15);
  });
});

describe('maximum HP, MP and FP (GetMaxHitPoint, GetMaxManaPoint, GetMaxFatiguePoint)', () => {
  // the reference table: a Vagrant with 15 in each stat
  it.each([
    [1, 230, 63, 32],
    [2, 230, 63, 32],
    [8, 240, 67, 36],
    [15, 265, 71, 40],
  ])('level %i: HP %i, MP %i, FP %i', (level, hp, mp, fp) => {
    expect(maxHitPoint(VAGRANT, level, S15)).toBe(hp);
    expect(maxManaPoint(VAGRANT, level, S15)).toBe(mp);
    expect(maxFatiguePoint(VAGRANT, level, S15)).toBe(fp);
  });

  it('level 15 with STA 45: HP 581 and FP 103, MP as before', () => {
    const s: Stats = { ...S15, sta: 45 };
    expect(maxHitPoint(VAGRANT, 15, s)).toBe(581);
    expect(maxFatiguePoint(VAGRANT, 15, s)).toBe(103);
    expect(maxManaPoint(VAGRANT, 15, s)).toBe(71);
  });

  it('level 15 with INT 20: MP 85, HP and FP as before', () => {
    const s: Stats = { ...S15, int: 20 };
    expect(maxManaPoint(VAGRANT, 15, s)).toBe(85);
    expect(maxHitPoint(VAGRANT, 15, s)).toBe(265);
    expect(maxFatiguePoint(VAGRANT, 15, s)).toBe(40);
  });

  it('adds DST_*_MAX to the base number, then multiplies by 1 + DST_*_MAX_RATE / 100, all cut to an int', () => {
    // 230 + 100 = 330; 330 * (1.0f + 10 / 100.0f) = 363
    expect(maxHitPoint(VAGRANT, 1, S15, adjOf([Dst.HP_MAX, 100], [Dst.HP_MAX_RATE, 10]))).toBe(363);
    // 63 + 7 = 70; 70 * (1.0f + 50 / 100.0f) = 105
    expect(maxManaPoint(VAGRANT, 1, S15, adjOf([Dst.MP_MAX, 7], [Dst.MP_MAX_RATE, 50]))).toBe(105);
    // 32 + 8 = 40; 40 * (1.0f + -25 / 100.0f) = 30
    expect(maxFatiguePoint(VAGRANT, 1, S15, adjOf([Dst.FP_MAX, 8], [Dst.FP_MAX_RATE, -25]))).toBe(30);
  });

  it('is never below 1 (__JEFF_11)', () => {
    expect(maxHitPoint(VAGRANT, 1, S15, adjOf([Dst.HP_MAX, -1000]))).toBe(1);
    expect(maxManaPoint(VAGRANT, 1, S15, adjOf([Dst.MP_MAX_RATE, -100]))).toBe(1);
    expect(maxFatiguePoint(VAGRANT, 1, S15, adjOf([Dst.FP_MAX, -1000]))).toBe(1);
  });
});

describe('monsterMaxHitPoint (GetMaxOriginHitPoint for a monster, MONSTERPROP percent)', () => {
  it('is dwAddHp when the rate is 100', () => {
    expect(monsterMaxHitPoint(120, 100)).toBe(120); // MI_AIBATT1: dwAddHp 120
  });

  it('scales by the percent as a float and cuts to an int', () => {
    expect(monsterMaxHitPoint(120, 150)).toBe(180);
    expect(monsterMaxHitPoint(120, 50)).toBe(60);
    expect(monsterMaxHitPoint(120, 33)).toBe(39); // 120 * 0.33f = 39.6
  });

  it('is never below 1 (__JEFF_11)', () => {
    expect(monsterMaxHitPoint(0, 100)).toBe(1);
    expect(monsterMaxHitPoint(120, 0)).toBe(1);
  });
});

describe('EXP (GetMaxExp1, GetExpPercent and the status window text)', () => {
  it('the EXP needed at a level is the next row of the table', () => {
    expect([1, 2, 3, 4, 5].map((level) => expNeeded(EXP_ROWS, level))).toEqual([14n, 20n, 36n, 90n, 152n]);
    expect(expNeeded(EXP_ROWS, 14)).toBe(1928n);
    expect(expNeeded(EXP_ROWS, 15)).toBe(2340n);
  });

  it('throws where the table has no row for the next level', () => {
    expect(() => expNeeded(EXP_ROWS, 16)).toThrow(RangeError);
    expect(() => expNeeded(EXP_ROWS, -2)).toThrow(RangeError);
  });

  it('GetExpPercent counts 0.01 % units, cut', () => {
    expect(expPercent(7n, 14n)).toBe(5000);
    expect(expPercent(1n, 3n)).toBe(3333);
    expect(expPercent(0n, 14n)).toBe(0);
  });

  it('shows two decimals', () => {
    expect(expPercentText(7n, 14n)).toBe('50.00%');
    expect(expPercentText(0n, 14n)).toBe('0.00%');
    expect(expPercentText(1n, 3n)).toBe('33.33%');
    expect(expPercentText(9998n, 10000n)).toBe('99.98%');
  });

  it('never shows 100.00: from 99.99 up it shows 99.99', () => {
    expect(expPercentText(13999n, 14000n)).toBe('99.99%');
    expect(expPercentText(9999n, 10000n)).toBe('99.99%');
    expect(expPercentText(14n, 14n)).toBe('99.99%');
  });

  it('works with EXP past 32 bits', () => {
    expect(expPercentText(3_000_000_000n, 6_000_000_000n)).toBe('50.00%');
  });
});

describe('attackSpeed (GetAttackSpeed)', () => {
  it('fists (0.07), level 1, DEX 15: A 76, 42%', () => {
    const r = attackSpeed(VAGRANT, f32(0.07), 1, 15);
    expect(r.a).toBe(76);
    expect(r.speed).toBe(f32(0.8416128754615784));
    expect(r.shown).toBe(42);
  });

  it('Wooden Sword (0.085), level 1, DEX 15: A 77, 42%', () => {
    const r = attackSpeed(VAGRANT, f32(0.085), 1, 15);
    expect(r.a).toBe(77);
    expect(r.speed).toBe(f32(0.8432520031929016));
    expect(r.shown).toBe(42);
  });

  it('Wooden Sword, level 15, DEX 45: A 87, 47%', () => {
    const r = attackSpeed(VAGRANT, f32(0.085), 15, 45);
    expect(r.a).toBe(87);
    expect(r.speed).toBe(f32(0.9412389993667603));
    expect(r.shown).toBe(47);
  });

  it('adds a weight from the table of 18 by A / 10, the first for A below 10 and the last from 170 on', () => {
    const PLUS = [0.08, 0.16, 0.24, 0.32, 0.40, 0.48, 0.56, 0.64, 0.72, 0.80, 0.88, 0.96, 1.04, 1.12, 1.20, 1.30, 1.38, 1.50];
    // a job whose base speed is A + 3 and a weapon that adds nothing: A = int(base + 0 - 3)
    const withA = (a: number): JobProp => ({ ...VAGRANT, attackSpeed: a + 3 });
    for (const [a, index] of [[-3, 0], [0, 0], [9, 0], [10, 1], [75, 7], [109, 10], [150, 15], [159, 15], [160, 16], [170, 17], [180, 17]] as const) {
      // from A 160 the speed passes 2.0, so 1.0 is taken off by DST_ATTACKSPEED to see the weight
      const taken = a >= 160 ? -1000 : 0;
      const r = attackSpeed(withA(a), 0, 1, 15, taken === 0 ? NO_ADJUST : adjOf([Dst.ATTACKSPEED, taken]));
      expect(r.a, `A ${a}`).toBe(a);
      const speed = f32(f32(f32(50 / f32(200 - a)) / 2) + f32(PLUS[index]!));
      expect(r.speed, `speed at A ${a}`).toBe(f32(speed + f32(taken / 1000)));
    }
  });

  it('puts 187 for an A of 187.5 or more, and keeps the speed at 2.0', () => {
    // 75 + 1.0 * (4 * 40 + 1 / 8) - 3 = 232.125
    const r = attackSpeed(VAGRANT, 1, 1, 40);
    expect(r.a).toBe(187);
    expect(r.speed).toBe(2);
    expect(r.shown).toBe(100);
    // an A of 187 is under 187.5, so it stands; its 50 / 13 / 2 + 1.5 = 3.42 is cut to 2.0
    const edge = attackSpeed({ ...VAGRANT, attackSpeed: 190 }, 0, 1, 15);
    expect(edge.a).toBe(187);
    expect(edge.speed).toBe(2);
  });

  it('adds DST_ATTACKSPEED / 1000, then DST_ATTACKSPEED_RATE percent of it when that is above 0', () => {
    const base = f32(0.8416128754615784); // fists, level 1, DEX 15
    const plus = attackSpeed(VAGRANT, f32(0.07), 1, 15, adjOf([Dst.ATTACKSPEED, 100]));
    expect(plus.speed).toBe(f32(base + f32(100 / 1000)));
    const rate = attackSpeed(VAGRANT, f32(0.07), 1, 15, adjOf([Dst.ATTACKSPEED_RATE, 10]));
    expect(rate.speed).toBe(f32(base + f32(f32(base * 10) / 100)));
    // a rate of 0 or below changes nothing
    expect(attackSpeed(VAGRANT, f32(0.07), 1, 15, adjOf([Dst.ATTACKSPEED_RATE, -10])).speed).toBe(base);
  });

  it('keeps the speed from 0.1 to 2.0', () => {
    const low = attackSpeed(VAGRANT, f32(0.07), 1, 15, adjOf([Dst.ATTACKSPEED, -5000]));
    expect(low.speed).toBe(f32(0.1));
    expect(low.shown).toBe(5);
    expect(attackSpeed(VAGRANT, f32(0.07), 1, 15, adjOf([Dst.ATTACKSPEED, 5000])).speed).toBe(2);
  });
});

describe('criticalShown (GetCriticalProb)', () => {
  it('is DEX / 10 as an int, times the job factor, cut: 1 % for a new Vagrant', () => {
    expect(criticalShown(VAGRANT, S15)).toBe(1);
    expect(criticalShown(VAGRANT, { ...S15, dex: 45 })).toBe(4);
    expect(criticalShown(VAGRANT, { ...S15, dex: 9 })).toBe(0);
    // 35 / 10 = 3; 3 * 1.5f = 4.5 -> 4
    expect(criticalShown({ ...VAGRANT, critical: 1.5 }, { ...S15, dex: 35 })).toBe(4);
  });

  it('adds DST_CHR_CHANCECRITICAL and is never below 0', () => {
    expect(criticalShown(VAGRANT, S15, adjOf([Dst.CHR_CHANCECRITICAL, 3]))).toBe(4);
    expect(criticalShown(VAGRANT, S15, adjOf([Dst.CHR_CHANCECRITICAL, -5]))).toBe(0);
  });
});

describe('attackShown and defenceShown with nothing equipped (RenderATK, GetShowDefense)', () => {
  // the reference table: naked ATK / DEF / critical at levels 1, 8, 15
  it.each([
    [1, 8, 0, 1],
    [8, 15, 5, 1],
    [15, 23, 10, 1],
  ])('level %i: ATK %i, DEF %i, critical %i %%', (level, atk, def, crit) => {
    expect(attackShown(VAGRANT, level, S15, NAKED)).toBe(atk);
    expect(defenceShown(VAGRANT, level, S15, NAKED)).toBe(def);
    expect(criticalShown(VAGRANT, S15)).toBe(crit);
  });

  it('the fists are the row of II_WEA_HAN_HAND (propItem.txt:382): 1-2, WT_MELEE_STAFF, 0.07', () => {
    expect(FISTS).toMatchObject({
      abilityMin: 1, abilityMax: 2, weaponType: WeaponType.MELEE_STAFF, attackSpeed: f32(0.07),
      destParams: [-1, -1, -1], adjParams: [-1, -1, -1],
    });
  });
});

describe('attackShown and defenceShown with the starter equipment', () => {
  /*
   * ATK of a Vagrant, level 1, STR 15, with the Wooden Sword (RenderATK, WndField.cpp:4057-4098, through
   * GetHitMinMax, MoverAttack.cpp:415-461). `float` maths, `(int)` cuts:
   *   1. the weapon's row: dwAbilityMin 3, dwAbilityMax 4, dwWeaponType WT_MELEE_SWD.
   *   2. min = 3 * 2 = 6, max = 4 * 2 = 8 (:433-434). The sword has no DST_ABILITY_MIN/MAX: 6 and 8 (:436-437).
   *   3. GetWeaponATK( WT_MELEE_SWD ) (:379-381) = (int)( float((15 - 12) * 4.5f) + float(1 * 1.1f) )
   *      = (int)( 13.5f + 1.1f ) = (int)14.6f = 14. GetPlusWeaponATK( SWD ) (:292-294, :324-326): DST_SWD_DMG and
   *      DST_TWOHANDMASTER_DMG are 0. nPlus = 14 + DST_CHR_DMG 0 = 14 (:439).
   *   4. min = 6 + 14 = 20, max = 8 + 14 = 22 (:440-441).
   *   5. a weapon is worn: f = GetItemMultiplier = 1.0f (no refine, __VER >= 11 has no endurance: :2082-2098):
   *      (int)(20 * 1.0f) = 20, (int)(22 * 1.0f) = 22 (:443-449). The refine is 0: nothing added (:451-461).
   *   6. nATK = (20 + 22) / 2 = 21 (:4079). No SM_ATTACK_UP, DST_ATKPOWER_RATE 0, GetWeaponPlusDamage 0 (:120-123, :127-141),
   *      DST_ATKPOWER 0: 21.
   * At level 15: GetWeaponATK = (int)( 13.5f + float(15 * 1.1f) ) = (int)( 13.5f + 16.5f ) = 30, so min = 36, max = 38
   * and nATK = 37.
   *
   * DEF with the suit (8-10), the gauntlet (5-7) and the boots (4-5) (GetShowDefense, MoverAttack.cpp:226-233, through
   * CalcDefense :517-526 and CalcDefenseCore :576-601), STA 15:
   *   1. UpdateParam -> SumEquipDefenseAbility (MoverParam.cpp:1919-1969): the suit is IK2_ARMOR, the other two
   *      IK2_ARMORETC, so all count; f = 1.0f, no refine: nMin = 8 + 5 + 4 = 17, nMax = 10 + 7 + 5 = 22. No
   *      DST_ABILITY_MIN/MAX: m_nDefenseMin 17, m_nDefenseMax 22.
   *   2. GetDefenseByItem( FALSE ) = 17 + (22 - 17) / 2 = 17 + 2 = 19 (MoverAttack.cpp:217-224).
   *   3. CalcDefenseCore, the generic branch, fFactorDef 1.0f (:587-594), level 1:
   *      (int)( (((1 * 2) + (15 / 2)) / 2.8f - 4) + ((15 - 14) * 1.0f) )
   *      = (int)( ((2 + 7) / 2.8f - 4) + 1.0f ) = (int)( (3.2142859f - 4) + 1.0f ) = (int)0.21428585f = 0.
   *   4. += GetDefenseByItem / 4 = 19 / 4 = 4 (:595); += DST_ADJDEF 0 (:596): 4. Not below 0.
   *   5. CalcDefense: (int)( 4 * GetDEFMultiplier ), the multiplier 1.0f * (1.0f + (float)0 / 100.0f) = 1.0f
   *      (:496-513): 4.
   * At level 15: (int)( ((30 + 7) / 2.8f - 4) + 1.0f ) = (int)( (13.214286f - 4) + 1.0f ) = (int)10.214286f = 10;
   * 10 + 4 = 14; (int)(14 * 1.0f) = 14.
   */
  it('level 1: ATK 21, DEF 4', () => {
    expect(attackShown(VAGRANT, 1, S15, STARTER)).toBe(21);
    expect(defenceShown(VAGRANT, 1, S15, STARTER)).toBe(4);
  });

  it('level 15: ATK 37, DEF 14', () => {
    expect(attackShown(VAGRANT, 15, S15, STARTER)).toBe(37);
    expect(defenceShown(VAGRANT, 15, S15, STARTER)).toBe(14);
  });

  it('the armour does not change the ATK, the sword does not change the DEF', () => {
    expect(attackShown(VAGRANT, 1, S15, { weapon: WOODEN_SWORD, armour: [] })).toBe(21);
    expect(attackShown(VAGRANT, 1, S15, { weapon: null, armour: [SUIT, GAUNTLET, BOOTS] })).toBe(8);
    expect(defenceShown(VAGRANT, 1, S15, { weapon: WOODEN_SWORD, armour: [] })).toBe(0);
    expect(defenceShown(VAGRANT, 1, S15, { weapon: null, armour: [SUIT, GAUNTLET, BOOTS] })).toBe(4);
  });
});

describe('attackShown: the weapon types (GetWeaponATK, MoverAttack.cpp:374-411)', () => {
  // level 12, STR 30, DEX 30, INT 25, a weapon of 2-3 (min 4, max 6, mean 5), so ATK = GetWeaponATK + 5:
  //   SWD    (30 - 12) * 4.5f + 12 * 1.1f           = 81 + 13.2             = 94.2 -> 94
  //   AXE    (30 - 12) * 5.5f + 12 * 1.2f           = 99 + 14.4             = 113.4 -> 113
  //   STAFF  (30 - 10) * 0.8f + 12 * 1.1f           = 16 + 13.2             = 29.2 -> 29
  //   STICK  (30 - 10) * 3.0f + 12 * 1.3f           = 60 + 15.6             = 75.6 -> 75
  //   KNUCKLE (30 - 10) * 5.0f + 12 * 1.2f          = 100 + 14.4            = 114.4 -> 114
  //   WAND   (25 - 10) * 6.0f + 12 * 1.2f           = 90 + 14.4             = 104.4 -> 104
  //   YOYO   (30 - 12) * 4.2f + 12 * 1.1f           = 75.6 + 13.2           = 88.8 -> 88
  //   BOW    (((30 - 14) * 4.0f) + 12 * 1.3f + 30 * 0.2f) * 0.7f = (64 + 15.6 + 6) * 0.7 = 59.92 -> 59
  const stats: Stats = { str: 30, sta: 15, dex: 30, int: 25 };
  it.each([
    ['WT_MELEE_SWD', WeaponType.MELEE_SWD, 99],
    ['WT_MELEE_AXE', WeaponType.MELEE_AXE, 118],
    ['WT_MELEE_STAFF', WeaponType.MELEE_STAFF, 34],
    ['WT_MELEE_STICK', WeaponType.MELEE_STICK, 80],
    ['WT_MELEE_KNUCKLE', WeaponType.MELEE_KNUCKLE, 119],
    ['WT_MAGIC_WAND', WeaponType.MAGIC_WAND, 109],
    ['WT_MELEE_YOYO', WeaponType.MELEE_YOYO, 93],
    ['WT_RANGE_BOW', WeaponType.RANGE_BOW, 64],
  ])('%s', (_name, weaponType, atk) => {
    const weapon = item({ kind1: 1, kind2: 2, part: 10, abilityMin: 2, abilityMax: 3, weaponType });
    expect(attackShown(VAGRANT, 12, stats, { weapon, armour: [] })).toBe(atk);
  });

  it('a weapon of another kind adds nothing from the stats', () => {
    const weapon = item({ kind1: 1, kind2: 2, part: 10, abilityMin: 2, abilityMax: 3, weaponType: -1 });
    expect(attackShown(VAGRANT, 12, S15, { weapon, armour: [] })).toBe(5);
  });
});

describe('attackShown: destination parameters (GetParam in GetHitMinMax and RenderATK)', () => {
  // level 1, STR 15, the Wooden Sword: min 6, max 8, nPlus 14 (see above): 21
  it('DST_ABILITY_MIN and DST_ABILITY_MAX change the weapon row before the stat part is added', () => {
    // min 6 + 2 = 8, max 8; plus 14: 22 and 22; (22 + 22) / 2 = 22
    expect(attackShown(VAGRANT, 1, S15, STARTER, adjOf([Dst.ABILITY_MIN, 2]))).toBe(22);
    // min 6, max 8 + 4 = 12; plus 14: 20 and 26; (20 + 26) / 2 = 23
    expect(attackShown(VAGRANT, 1, S15, STARTER, adjOf([Dst.ABILITY_MAX, 4]))).toBe(23);
  });

  it('DST_CHR_DMG and the sword and two-hand damage add to the stat part', () => {
    // nPlus = 14 + 3: min 23, max 25: 24
    expect(attackShown(VAGRANT, 1, S15, STARTER, adjOf([Dst.CHR_DMG, 3]))).toBe(24);
    // nPlus = 14 + DST_SWD_DMG 3 + DST_TWOHANDMASTER_DMG 2 = 19: min 25, max 27: 26
    expect(attackShown(VAGRANT, 1, S15, STARTER, adjOf([Dst.SWD_DMG, 3], [Dst.TWOHANDMASTER_DMG, 2]))).toBe(26);
    // an axe-only parameter does not count for a sword
    expect(attackShown(VAGRANT, 1, S15, STARTER, adjOf([Dst.AXE_DMG, 9]))).toBe(21);
  });

  it('DST_ATKPOWER_RATE percent of the mean when above 0, then DST_ATKPOWER, and not below 0', () => {
    // 21 + 21 * 10 / 100 = 23
    expect(attackShown(VAGRANT, 1, S15, STARTER, adjOf([Dst.ATKPOWER_RATE, 10]))).toBe(23);
    // a rate of 0 or below changes nothing
    expect(attackShown(VAGRANT, 1, S15, STARTER, adjOf([Dst.ATKPOWER_RATE, -10]))).toBe(21);
    // 23 + 4 = 27
    expect(attackShown(VAGRANT, 1, S15, STARTER, adjOf([Dst.ATKPOWER_RATE, 10], [Dst.ATKPOWER, 4]))).toBe(27);
    expect(attackShown(VAGRANT, 1, S15, STARTER, adjOf([Dst.ATKPOWER, -100]))).toBe(0);
  });

  it('takes the parameters of the equipped items when none are given', () => {
    const sword = { ...WOODEN_SWORD, destParams: [Dst.ATKPOWER, -1, -1], adjParams: [4, -1, -1] };
    expect(attackShown(VAGRANT, 1, S15, { weapon: sword, armour: [] })).toBe(25);
    // given, they stand in place of the items'
    expect(attackShown(VAGRANT, 1, S15, { weapon: sword, armour: [] }, NO_ADJUST)).toBe(21);
  });
});

describe('defenceShown: destination parameters', () => {
  it('only IK2_ARMOR and IK2_ARMORETC items add to the defence range', () => {
    expect(defenceShown(VAGRANT, 1, S15, { weapon: null, armour: [WOODEN_SWORD, SUIT] })).toBe(2); // 8 + (10 - 8) / 2 = 9; 9 / 4 = 2
  });

  it('DST_ABILITY_MIN and DST_ABILITY_MAX change the sum of the armour (UpdateParam)', () => {
    // range 17-22 -> 17 + 6 = 23 and 22: 23 + (22 - 23) / 2 = 23 + 0 = 23; 23 / 4 = 5
    expect(defenceShown(VAGRANT, 1, S15, STARTER, adjOf([Dst.ABILITY_MIN, 6]))).toBe(5);
  });

  it('DST_ADJDEF adds after the item part, and DST_ADJDEF_RATE multiplies the end', () => {
    // level 15: 10 + 19 / 4 = 14; + 5 = 19
    expect(defenceShown(VAGRANT, 15, S15, STARTER, adjOf([Dst.ADJDEF, 5]))).toBe(19);
    // (int)( 14 * (1.0f + 10 / 100.0f) ) = (int)15.4 = 15
    expect(defenceShown(VAGRANT, 15, S15, STARTER, adjOf([Dst.ADJDEF_RATE, 10]))).toBe(15);
    expect(defenceShown(VAGRANT, 15, S15, STARTER, adjOf([Dst.ADJDEF_RATE, -50]))).toBe(7);
  });

  it('is not below 0 before the multiplier (__JEFF_11)', () => {
    expect(defenceShown(VAGRANT, 1, S15, NAKED, adjOf([Dst.ADJDEF, -9]))).toBe(0);
  });

  it('uses STA for the stat part: (level * 2 + STA / 2) / 2.8f - 4 + (STA - 14) * factor', () => {
    // level 15, STA 45: (int)( ((30 + 22) / 2.8f - 4) + (45 - 14) * 1.0f ) = (int)( 14.571428f + 31.0f ) = 45
    expect(defenceShown(VAGRANT, 15, { ...S15, sta: 45 }, NAKED)).toBe(45);
    // the job's factor: (45 - 14) * 2.5f = 77.5; 14.571428 + 77.5 = 92.07 -> 92
    expect(defenceShown({ ...VAGRANT, factorDef: 2.5 }, 15, { ...S15, sta: 45 }, NAKED)).toBe(92);
  });
});
