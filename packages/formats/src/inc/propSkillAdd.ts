// The levels of the skills (`propSkillAdd.csv`), copying CProject::LoadPropAddSkill (Source/_Common/Project.cpp:2522-2611),
// which runs after propSkill.txt is loaded. A comma-separated table, one row per level of a skill, 36 columns:
//
//   SA_CLEANHIT_L01,SI_VAG_ONE_CLEANHIT,1,10,11,=,=,150,=, ... ,5,=,=,=,=,=,=,=,4,0,600
//
// Every number is read with `script.GetNumber( TRUE )`, the comma mode of CScanner::GetToken (scanner.cpp:575-675): a cell
// runs up to the next comma or the end of the line, the white space around it is dropped, and the names in it are the
// #defines of the headers (the `SA_*` id, the `SI_*` skill, `DST_*` ...). `=` is NULL_ID. The columns are the members of
// AddSkillProp (ProjectCmn.h:99-161); this keeps the ones the client reads: the row's id and skill, the level, the MP and FP
// the level costs, the cool-down and the number of hits. The rest (the ability range, the dest params, the casting time ...)
// is server business and is read and dropped.
//
// `CProject::GetAddSkillProp( dwSubDefine, level )` (Project.cpp:879-896) takes the row `dwSubDefine + level - 1` of the
// array `SetAtGrow( id )` fills: the id of a row is its place, so a skill's levels are the rows from its `subDefine` on.

import { FormatError } from '../errors';

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

/** NULL_ID (`=`) as `GetNumber` returns it: an int, so -1. */
const NULL_ID = -1;

/** C `atoi`, as MSVC has it: white space, a sign, digits; 0 when there are none; out of range clamps. */
function atoi(text: string): number {
  const m = /^[\s]*([+-]?\d+)/.exec(text);
  return m === null ? 0 : Math.max(-2147483648, Math.min(2147483647, parseInt(m[1]!, 10)));
}

/** `iswhite` (scanner.cpp:20): 0x01 to 0x20. */
const isWhite = (c: string | undefined): boolean => c !== undefined && c > '\0' && c <= ' ';

/**
 * CScanner::GetToken in comma mode (scanner.cpp:575-675) with CScript::GetToken's replacement of a name by its #define
 * (Script.cpp:184-239) and CScanner::GetNumber( TRUE ) (scanner.cpp:852-902) on top.
 */
class CommaReader {
  private pos = 0;
  private line = 1;
  /** Where the last cell read starts, for an error. */
  private at = { line: 1, offset: 0 };

  constructor(
    private readonly text: string,
    private readonly defines: ReadonlyMap<string, number>,
    private readonly file: string,
  ) {}

  /**
   * The text of the next cell, or undefined at the end of the script (`tok == FINISHED`): white space and the `//` and
   * the block comments before it are skipped first (scanner.cpp:588-632).
   */
  private cell(): string | undefined {
    const t = this.text;
    let p = this.pos;
    const advance = (to: number): void => {
      for (; p < to; p++) if (t[p] === '\n') this.line++;
    };
    for (;;) {
      advance(this.skipWhite(p));
      if (t[p] !== '/') break;
      if (t[p + 1] === '/') {
        // a line comment runs to the carriage return, and the two characters of the line end go with it (:594-601)
        let end = p + 2;
        while (end < t.length && t[end] !== '\r') end++;
        advance(Math.min(end + (t[end] === '\r' ? 2 : 0), t.length));
      } else if (t[p + 1] === '*') {
        let end = p + 2;
        for (;;) {
          while (end < t.length && t[end] !== '*') end++;
          if (end >= t.length) {
            this.pos = t.length;
            return undefined;
          }
          end++;
          if (t[end] === '/') break;
        }
        advance(end + 1);
      } else {
        break; // a lone slash starts a cell
      }
    }
    if (p >= t.length) {
      this.pos = p;
      return undefined;
    }

    this.at = { line: this.line, offset: p };
    let cell = '';
    if (t[p] === '"') {
      // a quoted cell runs to the closing quote or the end of the line (:647-654)
      p++;
      while (p < t.length && t[p] !== '"' && t[p] !== '\r') cell += t[p++];
      p++;
    } else {
      while (p < t.length && t[p] !== ',' && t[p] !== '\r') cell += t[p++];
    }
    if (t[p] === ',' || t[p] === '\r') p++; // the comma, or the carriage return of the line end
    this.pos = Math.min(p, t.length);
    while (cell !== '' && isWhite(cell[cell.length - 1])) cell = cell.slice(0, -1);
    return cell;
  }

  private skipWhite(from: number): number {
    let p = from;
    while (p < this.text.length && isWhite(this.text[p])) p++;
    return p;
  }

  /** True when the next read finds the end of the script. */
  done(): boolean {
    const p = this.pos;
    const line = this.line;
    const at = this.at;
    const found = this.cell() === undefined;
    this.pos = p;
    this.line = line;
    this.at = at;
    return found;
  }

  fail(message: string, where = this.at): never {
    throw new FormatError(message, {
      file: this.file, offset: where.offset, unit: 'char', line: where.line, reader: READER, cppRef: CPP_REF,
    });
  }

  /**
   * CScanner::GetNumber( TRUE ). A name is replaced by its #define; one that is not defined throws (the C++ shows
   * "<name> Not Found." and reads 0). A hex number throws: in comma mode the token keeps its `0x`, which GetNumber then
   * reads as digits (:855-872). The end of the script throws, where the C++ returns 0.
   */
  number(what: string): number {
    const cell = this.cell();
    if (cell === undefined) {
      return this.fail(`expected ${what}, found the end of the script`, { line: this.line, offset: this.text.length });
    }
    if (/^0x/.test(cell)) this.fail(`"${cell}" is a hex number, which comma mode does not read as one (in ${what})`);
    const value = this.defines.get(cell);
    if (value !== undefined) return value;
    if (cell === '') return 0;
    switch (cell[0]) {
      case '=':
        return NULL_ID;
      case '-':
      case '+':
        return atoi(cell); // comma mode: the sign is part of the cell, not a token of its own
      default:
        if (cell[0]! >= '0' && cell[0]! <= '9') return atoi(cell);
        return this.fail(`"${cell}" is not a #define (in ${what})`);
    }
  }
}

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
  const r = new CommaReader(text, defines, file);
  const rows: SkillAddProp[] = [];

  while (!r.done()) {
    const id = r.number('dwID');
    if (id === 0) {
      if (!r.done()) r.fail('a row with id 0: LoadPropAddSkill stops reading here and ignores the rest of the table');
      break;
    }
    // the order of Project.cpp:2533-2579; the columns not kept are read to move on
    const skip = (count: number, what: string): void => {
      for (let i = 0; i < count; i++) r.number(what);
    };
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
