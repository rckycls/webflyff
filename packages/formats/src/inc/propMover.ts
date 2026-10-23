// Mover properties (`propMover.txt`), copying CProject::LoadPropMover (Source/_Common/ProjectCmn.cpp:112). A
// tab-separated table, one mover per row, read token by token (CScript, so a name column holding an `IDS_*` key
// gives the string-table text and `MI_*`, `AII_*`, `BELLI_*` ... are #defines; `=` is an empty cell):
//
//   dwID  szName  dwAI  dwStr ... fSpeed ...  (the columns are listed in MOVER_COLUMNS, in the order of the C++)
//
// Of the 83 columns this keeps the id (the `MI_*` define, which `mdlDyna.inc` also uses to find the mover's
// model), the name, the AI (`AII_*`), the speed and whether it flies (`dwFlying`); the rest are read and dropped. Build flags of the client:
// `__VER >= 9` (fFrame, dwOrthograde) and `__S1108_BACK_END_SYSTEM` (dwUseable), both on in Neuz/VersionCommon.h.

import { ScriptReader } from '../script/cscript';

export interface MoverProp {
  /** The mover's id: the `MI_*` define of the first column (`MoverProp::dwID`). */
  index: number;
  /** `szName`: the string-table text of the name column (empty for movers whose string is empty). */
  name: string;
  /** `fSpeed` as the table gives it (0.1 for the player movers). Mover.cpp:1521 copies it to m_pActMover->m_fSpeed. */
  speed: number;
  /** `dwAI`: an `AII_*` value (AII_MOVER, AII_MONSTER ...). */
  ai: number;
  /**
   * `dwFlying == 1`: a flying monster (`OBJTYPE_FLYING`, CMover::InitProp, Mover.cpp:1538), which
   * CActionMover::ProcessCollision moves with the flying rules (`IsFly() || pProp->dwFlying == 1`, ActionMover.cpp:183).
   */
  flying: boolean;
}

const READER = 'readPropMover';
const CPP_REF = 'Source/_Common/ProjectCmn.cpp:112 CProject::LoadPropMover';

/** MAX_PROPMOVER (Source/_Common/ProjectCmn.h:36): ids are 0..1999. */
const MAX_PROPMOVER = 2000;

type Kind = 'int' | 'float' | 'int64';
type Column = readonly [name: string, kind: Kind];

const ints = (...names: string[]): Column[] => names.map((name) => [name, 'int']);
const floats = (...names: string[]): Column[] => names.map((name) => [name, 'float']);

/** The columns after szName, in the order LoadPropMover reads them (ProjectCmn.cpp:163-268). */
const MOVER_COLUMNS: readonly Column[] = [
  ...ints('dwAI', 'dwStr', 'dwSta', 'dwDex', 'dwInt', 'dwHR', 'dwER', 'dwRace', 'dwBelligerence', 'dwGender'),
  ...ints('dwLevel', 'dwFlightLevel', 'dwSize', 'dwClass', 'bIfParts', 'nChaotic'),
  ...ints('dwUseable', 'dwActionRadius', 'dwAtkMin', 'dwAtkMax', 'dwAtk1', 'dwAtk2', 'dwAtk3', 'dwAtk4'),
  ...floats('fFrame'), // __VER >= 9; the C++ maps -1 to 1.0, which `=` gives here as -1 and nobody reads
  ...ints('dwOrthograde', 'dwThrustRate', 'dwChestRate', 'dwHeadRate', 'dwArmRate', 'dwLegRate'),
  ...ints('dwAttackSpeed', 'dwReAttackDelay', 'dwAddHp', 'dwAddMp', 'dwNaturalArmor', 'nAbrasion', 'nHardness'),
  ...ints('dwAdjAtkDelay', 'eElementType', 'wElementAtk', 'dwHideLevel'),
  ...floats('fSpeed'),
  ...ints('dwShelter', 'dwFlying', 'dwJumpIng', 'dwAirJump', 'bTaming', 'dwResisMgic'),
  ...floats('fResistElecricity', 'fResistFire', 'fResistWind', 'fResistWater', 'fResistEarth'),
  ...ints('dwCash', 'dwSourceMaterial', 'dwMaterialAmount', 'dwCohesion', 'dwHoldingTime', 'dwCorrectionValue'),
  ['nExpValue', 'int64'], // GetExpInteger
  ...ints('nFxpValue', 'nBodyState', 'dwAddAbility', 'bKillable'),
  ...ints('dwVirtItem0', 'dwVirtItem1', 'dwVirtItem2', 'bVirtType0', 'bVirtType1', 'bVirtType2'),
  ...ints('dwSndAtk1', 'dwSndAtk2', 'dwSndDie1', 'dwSndDie2', 'dwSndDmg1', 'dwSndDmg2', 'dwSndDmg3'),
  ...ints('dwSndIdle1', 'dwSndIdle2'),
];

/**
 * Reads the text of `propMover.txt` (see `decodeScript`), movers in file order. `strings` is the merged
 * string table (see `readStringTable`) that turns the `IDS_*` name of a row into text.
 *
 * Like the C++: a row whose id is 0 is skipped one token at a time (the loader reads the next token as an id),
 * and an id that is negative, 2000 or more, or already read, fails the load; here that throws a FormatError.
 * A name that is not defined, or a row that stops early, throws as well (the C++ logs "Not Found" and reads 0).
 */
export function readPropMover(
  text: string,
  defines: ReadonlyMap<string, number>,
  strings: ReadonlyMap<string, string>,
  file = 'propMover.txt',
): MoverProp[] {
  const r = new ScriptReader(text, defines, strings, { file, reader: READER, cppRef: CPP_REF });
  const movers: MoverProp[] = [];
  const seen = new Set<number>();
  let lastName = '';

  for (;;) {
    const index = r.numberOrEnd('dwID'); // GetNumber; tok == FINISHED ends the table
    if (index === undefined) break;
    if (index === 0) continue;
    if (index < 0 || index >= MAX_PROPMOVER) {
      r.fail(`too many mover property or invalid id: ${index} (ids are 1..${MAX_PROPMOVER - 1})`);
    }
    if (seen.has(index)) r.fail(`Last read: ${lastName}, ID: ${index} is duplicated (a column may have shifted)`);
    seen.add(index);

    const name = r.token('szName').text;
    lastName = name;

    let ai = 0;
    let speed = 0;
    let flying = false;
    for (const [column, kind] of MOVER_COLUMNS) {
      if (kind === 'float') {
        const value = r.float(column);
        if (column === 'fSpeed') speed = value;
      } else if (kind === 'int64') {
        r.int64(column);
      } else {
        const value = r.number(column);
        if (column === 'dwAI') ai = value;
        else if (column === 'dwFlying') flying = value === 1;
      }
    }
    r.token('the last column'); // the column after dwSndIdle2, which the C++ reads and drops

    movers.push({ index, name, speed, ai, flying });
  }

  return movers;
}
