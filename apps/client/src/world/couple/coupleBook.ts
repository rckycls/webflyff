// 2026-11-15 (social): the own couple, as Neuz keeps it (docs/2026-11-15-social-research.md §2). V15 has one system,
// "Couple"; there is no marriage.
//
//   CCoupleHelper::OnCouple ... OnAddCoupleExperience   Neuz/couplehelper.cpp:37-111   the couple, a proposal received
//                                                                                     (the OK/Cancel box), the couple
//                                                                                     made (S02), broken up (S03), its EXP
//                                                                                     (COUPLE_LEVELUP)
//   CCouple                                             _Common/couple.cpp:78-135     EXP, the two players, the level
//   CCoupleProperty                                     couple.cpp:280-390            the level table, the skills, the rate
//   Resource/couple.inc                                 :1-53, :160-175               the EXP totals; SkillKind, SkillLevel

import type { CoupleMessage } from '@flyffweb/protocol';

/** `CCouple::eMaxLevel` (`_Common/couple.h:14`). */
export const MAX_COUPLE_LEVEL = 21;

/** `Resource/couple.inc` `Level`: the EXP each level starts at, levels 1-50 (only 1-21 are reached). */
export const COUPLE_EXP: readonly number[] = [
  0, 2880, 5986, 9336, 12949, 16845, 21047, 25579, 30466, 35737, 41422, 47553, 54165, 61296, 68986, 77281, 86226, 95873,
  106277, 117498, 129600, 142651, 156727, 171907, 188279, 205936, 224978, 245515, 267664, 291550, 317312,
  ...Array<number>(19).fill(100000),
];

/** `SkillKind`: II_COUPLE_BUFF_POWER_01, _BLESS_01, _MIRACLE_01 (`Resource/defineItem.h:5187-5193`). */
export const COUPLE_SKILL_KINDS: readonly number[] = [26720, 26730, 26740];

/** `SkillLevel`: from the couple level in the first column, each kind's skill level (0 none). */
const SKILL_LEVELS: ReadonlyArray<readonly [number, number, number, number]> = [
  [1, 0, 0, 0], [6, 1, 0, 0], [11, 2, 1, 0], [16, 3, 1, 0], [21, 4, 2, 1],
];

/** `IK3_COUPLE_BUFF` (`Resource/defineItemkind.h`): the couple skills' kind, whose buff tooltip shows no time. */
export const IK3_COUPLE_BUFF = 133;

/** `CCoupleProperty::GetLevel( nExperience )` (couple.cpp:342-350): the first level whose total is over it, else 1. */
export function coupleLevel(exp: number): number {
  for (let i = 0; i < COUPLE_EXP.length; i++) if (exp < COUPLE_EXP[i]!) return i;
  return 1;
}

/** `GetExperienceRate( nLevel, nExperience )` (couple.cpp:377-384): 0 at the last level. */
export function coupleExpRate(level: number, exp: number): number {
  if (level === MAX_COUPLE_LEVEL || level < 1) return 0;
  const total = COUPLE_EXP[level - 1]!;
  const next = COUPLE_EXP[level]!;
  return next - total === 0 ? 0 : Math.fround((exp - total) / (next - total));
}

/** The gauge's rate as `CWndCoupleTabInfo::OnDraw` bumps it, so a small start shows (`WndField.cpp:23300-23304`). */
export function shownCoupleRate(rate: number): number {
  if (rate > 0 && rate < 0.04) return 0.05;
  if (rate >= 0.04 && rate <= 0.075) return 0.075;
  return rate;
}

/**
 * `CCoupleProperty::GetSkill( nLevel )` as `LoadSkillLevel` fills it (couple.cpp:317-340): each kind's skill item at that
 * couple level, 0 for none (the kind's item + its skill level - 1; a level the table lacks keeps the one before).
 */
export function coupleSkillsAt(level: number): number[] {
  let row = SKILL_LEVELS[0]!;
  for (const candidate of SKILL_LEVELS) if (candidate[0] <= level) row = candidate;
  return COUPLE_SKILL_KINDS.map((kind, i) => {
    const skillLevel = row[i + 1]!;
    return skillLevel === 0 ? 0 : kind + skillLevel - 1;
  });
}

export interface Couple {
  exp: number;
  first: number;
  second: number;
  level: number;
}

/** What a couple snapshot asks of the screen. */
export type CoupleEvent =
  /** A proposal: the OK/Cancel box with TID_GAME_RECEIVEPROPOSAL and the proposer's name. */
  | { kind: 'proposal'; proposerId: number; name: string }
  /** A line in the chat: the text's TID and its arguments, in its colour. */
  | { kind: 'line'; tid: string; args: Array<string | number> }
  /** The couple changed: the window draws it again. */
  | { kind: 'changed' }
  /** A player whose data the window will want (`GetPlayerString`, the query). */
  | { kind: 'query'; playerId: number };

export class CoupleBook {
  private value: Couple | null = null;

  get couple(): Readonly<Couple> | null {
    return this.value;
  }

  /** `CCouple::GetPartner( idPlayer )`: the other player, or null with no couple. */
  partnerOf(ownPlayerId: number): number | null {
    const couple = this.value;
    if (couple === null) return null;
    return couple.first === ownPlayerId ? couple.second : couple.first;
  }

  /** Forgets the couple (a log-out; `CCoupleHelper::Clear`). */
  reset(): void {
    this.value = null;
  }

  apply(message: CoupleMessage, ownPlayerId: number): CoupleEvent[] {
    switch (message.type) {
      case 'couple': {
        this.value = { exp: message.exp, first: message.first, second: message.second, level: coupleLevel(message.exp) };
        const partner = this.partnerOf(ownPlayerId);
        return [...(partner === null ? [] : [{ kind: 'query', playerId: partner } as const]), { kind: 'changed' }];
      }
      case 'proposeResult':
        return [{ kind: 'query', playerId: message.proposerId }, { kind: 'proposal', proposerId: message.proposerId, name: message.name }];
      case 'coupleResult':
        this.value = { exp: 0, first: ownPlayerId, second: message.partnerId, level: 1 };
        return [{ kind: 'query', playerId: message.partnerId }, { kind: 'line', tid: 'TID_GAME_COUPLE_S02', args: [message.name] },
          { kind: 'changed' }];
      case 'decoupleResult':
        if (this.value === null) return [];
        this.value = null;
        return [{ kind: 'line', tid: 'TID_GAME_COUPLE_S03', args: [] }, { kind: 'changed' }];
      case 'addCoupleExperience': {
        const couple = this.value;
        if (couple === null) return [];
        // CCouple::AddExperience (couple.cpp:96-103): nothing at the last level; a new level says so
        if (couple.level === MAX_COUPLE_LEVEL) return [];
        couple.exp += message.exp;
        const before = couple.level;
        couple.level = coupleLevel(couple.exp);
        return couple.level !== before
          ? [{ kind: 'line', tid: 'TID_GAME_COUPLE_LEVELUP', args: [couple.level] }, { kind: 'changed' }]
          : [{ kind: 'changed' }];
      }
      default:
        return [];
    }
  }
}
