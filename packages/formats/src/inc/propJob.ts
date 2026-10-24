// Job properties (`propJob.inc`), copying CProject::LoadPropJob (Source/_Common/Project.cpp:4808). A list of rows
// read token by token (CScript), each the job and 17 floats:
//
//   JOB_VAGRANT  75.0  0.9  0.3  0.3  1.0  1.2  0.5  0.5  4.5  5.5  0.8  3.0  5.0  6.0  0.2  4.2  1.0
//
// The 17 numbers are the members of JobProp (ProjectCmn.h:405-423, `m_aPropJob`): the attack speed base, the factors
// of the maximum HP, MP and FP, of the defence and of the three recoveries, the ATK factor of each weapon type, the
// blocking factor and the critical factor. The first column is a `JOB_*` define (defineJob.h) and the C++ files the
// row under its value: `m_aPropJob[nJob]`.

import { ScriptReader } from '../script/cscript';

export interface JobProp {
  /** The first column as written: the `JOB_*` word (`JOB_VAGRANT`). */
  name: string;
  /** `fAttackSpeed`: the job's base of the attack speed formula (`CMover::GetAttackSpeed`, MoverAttack.cpp:159). */
  attackSpeed: number;
  /** `fFactorMaxHP`: the factor of the maximum HP (MoverParam.cpp:2871). */
  factorMaxHP: number;
  /** `fFactorMaxMP`: the factor of the maximum MP (MoverParam.cpp:2904). */
  factorMaxMP: number;
  /** `fFactorMaxFP`: the factor of the maximum FP (MoverParam.cpp:2932). */
  factorMaxFP: number;
  /** `fFactorDef`: the factor of the physical defence. */
  factorDef: number;
  /** `fFactorHPRecovery`: the factor of the HP recovery. */
  factorHPRecovery: number;
  /** `fFactorMPRecovery`: the factor of the MP recovery. */
  factorMPRecovery: number;
  /** `fFactorFPRecovery`: the factor of the FP recovery. */
  factorFPRecovery: number;
  /** `fMeleeSWD`: the ATK factor of `WT_MELEE_SWD`. */
  meleeSWD: number;
  /** `fMeleeAXE`: the ATK factor of `WT_MELEE_AXE`. */
  meleeAXE: number;
  /** `fMeleeSTAFF`: the ATK factor of `WT_MELEE_STAFF` (the fists too). */
  meleeSTAFF: number;
  /** `fMeleeSTICK`: the ATK factor of `WT_MELEE_STICK`. */
  meleeSTICK: number;
  /** `fMeleeKNUCKLE`: the ATK factor of `WT_MELEE_KNUCKLE`. */
  meleeKNUCKLE: number;
  /** `fMagicWAND`: the ATK factor of `WT_MAGIC_WAND`. */
  magicWAND: number;
  /** `fBlocking`: the blocking factor. */
  blocking: number;
  /** `fMeleeYOYO`: the ATK factor of the yo-yo. */
  meleeYOYO: number;
  /** `fCritical`: the critical factor. */
  critical: number;
}

const READER = 'readPropJob';
const CPP_REF = 'Source/_Common/Project.cpp:4808 CProject::LoadPropJob';

/**
 * Reads the text of `propJob.inc` (see `decodeScript`) into the job properties, `jobs[JOB_*]`. The numbers are
 * stored as C `float` (`Math.fround`, as `GetFloat` returns a float).
 *
 * The C++ files each row under the value of its first column, `JOB_*`. This reader takes no defines, so it files
 * the rows in the order they stand, which is the same for the shipped file (it lists JOB_VAGRANT to
 * JOB_ELEMENTOR_HERO in order, 0 to 31). Pass `defines` (see `loadDefines`) to have every row's name checked
 * against its place; a first column written as a number has to be its row either way. A row out of order, a name
 * that is not defined, a row that stops early and a word where a float goes throw a FormatError (the C++ files the
 * row under another job, or reads 0 and carries on).
 */
export function readPropJob(
  text: string,
  file = 'propJob.inc',
  defines?: ReadonlyMap<string, number>,
): JobProp[] {
  // the names stay names: the ScriptReader gets no defines, so `JOB_VAGRANT` reaches the loop as written
  const r = new ScriptReader(text, new Map(), new Map(), { file, reader: READER, cppRef: CPP_REF });
  const jobs: JobProp[] = [];

  for (let first = r.tokenOrEnd(); first !== undefined; first = r.tokenOrEnd()) { // tok == FINISHED ends the table
    const row = jobs.length;
    const name = first.text;
    if (first.kind === 'number') {
      if (!/^\d+$/.test(name) || Number(name) !== row) {
        r.fail(`row ${row} is job ${name}: the rows have to be in JOB_* order, as this reader files them by row`, first);
      }
    } else if (first.kind === 'ident') {
      const value = defines?.get(name);
      if (defines !== undefined && value === undefined) r.fail(`${name} is not a #define (defineJob.h)`, first);
      if (value !== undefined && value !== row) {
        r.fail(`${name} is job ${value}, but it is row ${row}: the rows have to be in JOB_* order`, first);
      }
    } else {
      r.fail(`expected a job name (JOB_*), found ${first.kind} "${name}"`, first);
    }

    // the properties of an object literal are evaluated in order: the order of Project.cpp:4827-4843
    const float = (column: string): number => Math.fround(r.float(`${column} of ${name}`));
    jobs.push({
      name,
      attackSpeed: float('fAttackSpeed'),
      factorMaxHP: float('fFactorMaxHP'),
      factorMaxMP: float('fFactorMaxMP'),
      factorMaxFP: float('fFactorMaxFP'),
      factorDef: float('fFactorDef'),
      factorHPRecovery: float('fFactorHPRecovery'),
      factorMPRecovery: float('fFactorMPRecovery'),
      factorFPRecovery: float('fFactorFPRecovery'),
      meleeSWD: float('fMeleeSWD'),
      meleeAXE: float('fMeleeAXE'),
      meleeSTAFF: float('fMeleeSTAFF'),
      meleeSTICK: float('fMeleeSTICK'),
      meleeKNUCKLE: float('fMeleeKNUCKLE'),
      magicWAND: float('fMagicWAND'),
      blocking: float('fBlocking'),
      meleeYOYO: float('fMeleeYOYO'),
      critical: float('fCritical'),
    });
  }

  return jobs;
}
