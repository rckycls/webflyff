// The Lord system's tables (2026-11-11, docs/superpowers/specs/2026-11-11-lord-research.md §2), as the owner's Resource has
// them. Short and fixed, so here rather than through the converter:
//
//   Resource/lordskill.txt:2-9        the 8 skills (id, type, name, description, target, buff item, cool down in minutes,
//                                     icon, passive, src sfx, dst sfx, range); `=` is NULL_ID
//   Resource/lordskill.txt.txt:1-18   their English names and descriptions (IDS_LORDSKILL_TXT_0000-0017)
//   Resource/lordevent.inc:1-28       the event tables: (rate, penya) for EXP and for the item drop
//   Client/Client/lordInfo.inc, lordcandidate.inc, lordrpInfo.inc   the help texts of the info, bid and refund windows

/** `definelordskill.h`: the skill ids. */
export const LordSkillId = { CHEERING: 0, BLESSING: 1, LOVE: 2, SHOUT: 3, RAGE: 4, SUMMON: 5, TELEPORT: 6, PARTY: 7 } as const;

/** `LTT_*` (`definelordskill.h:15-18`). */
export type LordTarget = 'none' | 'self' | 'other' | 'both';

export interface LordSkill {
  id: number;
  name: string;
  desc: string;
  target: LordTarget;
  /** The cool down in minutes (the DB server's tick is one minute). */
  cooltime: number;
  /** The icon file (`Icon` folder), as the converted UI names it (lower case, no extension). */
  icon: string;
  passive: boolean;
  /** The effects at the Lord and at the target (`CreateSfx`, `DPClient.cpp:17880-17900`), null for `=`. */
  srcSfx: number | null;
  dstSfx: number | null;
}

const skill = (id: number, name: string, desc: string, target: LordTarget, cooltime: number, src: number | null, dst: number | null,
  passive = false): LordSkill => ({ id, name, desc, target, cooltime, icon: `skill_sklking0${id + 1}`, passive, srcSfx: src, dstSfx: dst });

export const LORD_SKILLS: readonly LordSkill[] = [
  skill(0, "Lord's Cheer", 'Increases the EXP and item-drop rate of the character by up to 110%', 'both', 60, 1898, 1899),
  skill(1, "Lord's Blessing", 'Increases the attack power and defense power of the character by up to 110%', 'both', 60, 1900, 1901),
  skill(2, "Lord's Love", 'Increases every stat of the character by as much as 15', 'both', 60, 1902, 1903),
  skill(3, "Lord's Shout", 'Color of your shouting message is changed', 'self', 60, null, null),
  skill(4, "Lord's Anger", 'Ban a character from sending chat messages', 'other', 120, 1907, 1908),
  skill(5, "Lord's Call", 'Summon a character to the Lord', 'other', 60, 1904, 1905),
  skill(6, "Lord's Teleport", 'Teleport to a character', 'other', 10, 1906, null),
  skill(7, "Lord's Party", 'Duration of party skills increases by up to 400% (only when the Lord uses the party skills as a party leader)',
    'none', 0, null, null, true),
];

export const lordSkill = (id: number): LordSkill | undefined => LORD_SKILLS.find((s) => s.id === id);

/** `lordevent.inc`: (rate, penya) rows; the event's cost is the sum of the two rows chosen (`ILordEvent::GetCost`). */
const rows = (step: number): ReadonlyArray<readonly [number, number]> =>
  Array.from({ length: 11 }, (_, i) => [i * 0.05, i * step] as const);
export const LORD_EVENT_EXP = rows(100_000_000);
export const LORD_EVENT_DROP = rows(300_000_000);

/** `ILordEvent::GetCost` (`lord.cpp:484-491`): 0 for 0/0 or a row out of the tables. */
export function lordEventCost(expRow: number, dropRow: number): number {
  if (expRow === 0 && dropRow === 0) return 0;
  const e = LORD_EVENT_EXP[expRow], d = LORD_EVENT_DROP[dropRow];
  return e === undefined || d === undefined ? 0 : e[1] + d[1];
}

/** `CCandidate::nMinDeposit`, `nSetPledgeCost` (`lord.h:25`), `IElection::nMaxCandidates`, `nLevelRequirements` (`lord.h:57`). */
export const MIN_DEPOSIT = 100_000_000;
export const PLEDGE_COST = 1_000_000;
export const MAX_CANDIDATES = 10;
export const VOTE_LEVEL = 60;

/** `Client/Client/lordInfo.inc` (the Lord info window's text, `CWndLordInfo::OnInitialUpdate`, `WndLord.cpp:1092-1100`). */
export const LORD_INFO_TEXT = [
  "1. Lord's power and authority",
  '  (1) Govern the EXP and Item Drop rate increase event in the server',
  '  (2) Gain 45% of the tax',
  '  (3) Special skills for Lord',
  '  (4) Custom items for Lord (Costume, Cloak, Pick-up Pet, Riding)',
  ' 2. Ruling period : 2 weeks',
  ' 3. How to be Lord',
  '  (1) Condition of Lord candidate : From Master to Hero',
  '  (2) Get the highest votes',
  '   - From level 60 character and higher are eligible to vote',
  ' 4. Candidate entry and vote',
  "  (1) Apply through 'Candidate entry' menu during the candidacy period. (At least 1 billion Penya)",
  '  (2) Your bid must be within the top 10, and the top 10 users can issue their own pledge',
  '',
  '  (3) Gain votes from users.',
  '  (4) The highest votes will be Lord',
  ' 5. Process',
  '  * Every 2 weeks according to the ruling period of Lord',
  '  (1) Firday (00:00) ~ Friday 23:59 <1Day>',
  '   - candidacy starts',
  '   - candidacy starts for Hero, Master',
  '  (2) Saturday (00:00) ~ Sunday 23:59 <2Days>',
  '   - Confirm top 10 highest bid Lord candidates and announce it',
  '   - Issuing manifesto ',
  '   - Level 60 and above players start voting ',
  '  (3) Monday midnight (00:00)',
  '   - Vote finish',
  '   - Winner become Lord and announcement',
].join('\n');

/** `Client/Client/lordcandidate.inc` (the bid window's text, `CWndLordTender::OnInitialUpdate`, `WndLord.cpp:376-384`). */
export const LORD_CANDIDATE_TEXT = [
  'Minimum bid is 100,000,000 Penya, and the top 10 bidders will be candidates for Lord.',
  'If you fail to be the candidate, your bid(Penya) will be returned to your mail box. A 2% commission will be deducted during the vote.',
  '',
  'Bid money returned for the candidates is as below. ',
  ' -   1st, 2nd: 100% (Elected as Lord)',
  ' -   3rd:  80%',
  ' -   4th:  60%',
  ' -   5th:  40%',
  ' -   6th:  20%',
  ' - 7,8,9,10th: None',
  '',
  'Bid money returned for the candidate will be executed right after the Lord is selected.',
].join('\n');
