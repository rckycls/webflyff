// The levels of the skills (`propSkillAdd.csv`), copying CProject::LoadPropAddSkill (Source/_Common/Project.cpp:2522-2611),
// which runs after propSkill.txt is loaded. A comma-separated table, one row per level of a skill, 36 columns:
//
//   SA_CLEANHIT_L01,SI_VAG_ONE_CLEANHIT,1,10,11,=,=,150,=, ... ,5,=,=,=,=,=,=,=,4,0,600
//
// Every number is read with `script.GetNumber( TRUE )`, the comma mode that CommaReader (script/commaReader.ts) copies: a cell
// runs up to the next comma or the end of the line, the white space around it is dropped, and the names in it are the
// #defines of the headers (the `SA_*` id, the `SI_*` skill, `DST_*` ...). `=` is NULL_ID. The columns are the members of
// AddSkillProp (ProjectCmn.h:99-161); this keeps the ones the client reads: the row's id and skill, the level, the MP and FP
// the level costs, the cool-down and the number of hits. The rest (the ability range, the dest params, the casting time ...)
// is server business and is read and dropped.
//
// `CProject::GetAddSkillProp( dwSubDefine, level )` (Project.cpp:879-896) takes the row `dwSubDefine + level - 1` of the
// array `SetAtGrow( id )` fills: the id of a row is its place, so a skill's levels are the rows from its `subDefine` on.

import { CommaReader } from '../script/commaReader';
import { NULL_ID } from '../script/cscript';

/** One row of propSkillAdd.csv (`AddSkillProp`). A -1 is a `=` cell, NULL_ID. */
export interface SkillAddProp {
  /** `dwID`: the `SA_*` id, which is also the row's place in `m_aPropAddSkill`. */
  id: number;
  /** `dwName`: the skill the level belongs to, an `SI_*` id. */
  skill: number;
  /** `dwSkillLvl`: the level. */
  level: number;
  /** `nReqMp`: the MP a use costs at this level (a signed int in the C++). */
  reqMp: number;
  /** `nReqFp`: the FP a use costs at this level. */
  reqFp: number;
  /**
   * `dwCooldown`: the cool-down after a use. A row that gives none (`=`) takes the `dwSkillReady` of its skill's row in
   * propSkill.txt (Project.cpp:2587-2596); -1 when that is `=` as well.
   */
  cooldown: number;
  /** `nSkillCount`: how many hits (or projectiles) a use makes; -1 when the row gives none. */
  skillCount: number;
}

const READER = 'readPropSkillAdd';
const CPP_REF = 'Source/_Common/Project.cpp:2522 CProject::LoadPropAddSkill';

/**
 * Reads the text of `propSkillAdd.csv` (see `decodeScript`) into the rows of `m_aPropAddSkill`, in file order. A repeated
 * id is returned again: the C++ keeps the last (CFixedArray::SetAtGrow), so fill a lookup in file order.
 *
 * `skills` are the rows of propSkill.txt by skill id, what `GetSkillProp( dwName )` finds; a level whose cool-down is `=`
 * takes its skill's `skillReady`. A skill that has no row there leaves the cool-down as it is.
 *
 * The C++ stops at the first row whose id is 0 (the end of the file reads as one, Project.cpp:2528-2532); a 0 that is
 * followed by more text throws here, where the C++ would silently drop the rest of the table. A name that is not a define
 * and a row that stops early throw as well (the C++ logs and reads 0).
 */
export function readPropSkillAdd(
  text: string,
  defines: ReadonlyMap<string, number>,
  skills: ReadonlyMap<number, { skillReady: number }>,
  file = 'propSkillAdd.csv',
): SkillAddProp[] {
  const r = new CommaReader(text, defines, { file, reader: READER, cppRef: CPP_REF });
  const rows: SkillAddProp[] = [];
  // the columns not kept are read to move on
  const skip = (count: number, what: string): void => {
    for (let i = 0; i < count; i++) r.number(what);
  };

  while (!r.done()) {
    const id = r.number('dwID');
    if (id === 0) {
      if (!r.done()) r.fail('a row with id 0: LoadPropAddSkill stops reading here and ignores the rest of the table');
      break;
    }
    // the order of Project.cpp:2533-2579
    const skill = r.number('dwName');
    const level = r.number('dwSkillLvl');
    skip(4, 'dwAbilityMin to dwAbilityMaxPVP'); // dwAbilityMin, dwAbilityMax, dwAbilityMinPVP, dwAbilityMaxPVP
    skip(4, 'dwAttackSpeed to nProbabilityPVP'); // dwAttackSpeed, dwDmgShift, nProbability, nProbabilityPVP
    skip(1, 'dwTaunt');
    skip(6, 'dwDestParam1 to dwChgParamVal2'); // dwDestParam 1 and 2, nAdjParamVal 1 and 2, dwChgParamVal 1 and 2
    skip(3, 'nDestData1');
    skip(3, 'dwActiveSkill to dwActiveSkillRatePVP'); // dwActiveSkill, dwActiveSkillRate, dwActiveSkillRatePVP
    const reqMp = r.number('nReqMp');
    const reqFp = r.number('nReqFp');
    let cooldown = r.number('dwCooldown');
    skip(1, 'dwCastingTime');
    skip(4, 'dwSkillRange to dwSkillTime'); // dwSkillRange, dwCircleTime, dwPainTime, dwSkillTime
    const skillCount = r.number('nSkillCount');
    skip(3, 'dwSkillExp to dwComboSkillTime'); // dwSkillExp, dwExp, dwComboSkillTime

    // dwCooldown == dwDefault (0xFFFFFFFF): the cool-down of the skill (Project.cpp:2587-2596)
    if (cooldown === NULL_ID) cooldown = skills.get(skill)?.skillReady ?? cooldown;

    rows.push({ id, skill, level, reqMp, reqFp, cooldown, skillCount });
  }
  return rows;
}
