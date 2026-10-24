// The character EXP table (`ExpTable.inc`, the `expCharacter` block), copying CProject::LoadExpTable
// (Source/_Common/Project.cpp:3262, the block at :3275-3290). A file of named blocks read token by token (CScript):
//
//   expCharacter // 1 based
//   {
//   //  EXP   PXP  GP  Lim EXP   level
//       0     0    0   0         //0 - not used
//       14    1    2   18        //2
//   }
//   expLPPoint ... expJobLevel ... (and the other blocks, which this reader leaves alone)
//
// Each row is `nExp1 nExp2 dwLPPoint nLimitExp` and the row's place is the level (`m_aExpCharacter[level]`, 200
// rows: MAX_EXPCHARACTER, ProjectCmn.h:18). The EXP columns are `EXPINTEGER`, a 64-bit integer (the top rows pass
// 32 bits), so they are bigint here.

import { ScriptReader } from '../script/cscript';
import type { ScriptToken } from '../script/cscript';

export interface ExpRow {
  /**
   * `nExp1`: the EXP the level of the row's number needs (`CMover::GetMaxExp1` is `m_aExpCharacter[m_nLevel + 1].nExp1`,
   * Mover.h:1108, so row L+1 holds the cost of leaving level L).
   */
  exp1: bigint;
  /** `nExp2`: the dead PXP column, which the gauge of v15 does not use (Mover.h:1109). */
  exp2: bigint;
  /** `dwLPPoint`: the stat points the level of the row's number grants. */
  lpPoint: number;
  /** `nLimitExp`: the most EXP one kill can give a character of the level of the row's number (Mover.cpp:6221). */
  limitExp: bigint;
}

const READER = 'readExpTable';
const CPP_REF = 'Source/_Common/Project.cpp:3262 CProject::LoadExpTable';

/** MAX_EXPCHARACTER (Source/_Common/ProjectCmn.h:18): the size of `m_aExpCharacter`. */
const MAX_EXPCHARACTER = 200;

/** NULL_ID as `GetInt64` returns it: the unsigned 32-bit constant, widened (it is not -1 there). */
const NULL_ID_UNSIGNED = 0xffffffffn;

/**
 * CScanner::GetInt64 (scanner.cpp:904) on a token already read, exact where `ScriptReader.int64` gives a double.
 * `=` is NULL_ID; a `-` or `+` token folds the token after it; otherwise `_atoi64` of the token (its leading white
 * space, an optional sign and the digits; 0 when it has none, and for a `0x` literal, whose branch in the C++ is
 * empty). A word, a string or another symbol throws (the C++ reads 0).
 */
function int64(r: ScriptReader, first: ScriptToken, what: string): bigint {
  if (first.kind === 'symbol') {
    if (first.text === '=') return NULL_ID_UNSIGNED;
    if (first.text === '-') return -int64Of(r, r.token(what), what);
    if (first.text === '+') return int64Of(r, r.token(what), what);
  }
  return int64Of(r, first, what);
}

function int64Of(r: ScriptReader, tok: ScriptToken, what: string): bigint {
  if (tok.kind !== 'number') return r.fail(`expected a number for ${what}, found ${tok.kind} "${tok.text}"`, tok);
  if (tok.text.startsWith('0x')) return 0n;
  const m = /^\s*([+-]?\d+)/.exec(tok.text);
  return m === null ? 0n : BigInt(m[1]);
}

/**
 * Reads the text of `ExpTable.inc` (see `decodeScript`) into the rows of the `expCharacter` block, `rows[level]`.
 * The C++ goes through the file token by token and runs a loader at each block name it knows; this reads the first
 * `expCharacter` it finds and stops at the block's closing brace.
 *
 * A file without the block, a block that never closes, a row that stops early, a word where a number goes and more
 * than 200 rows throw a FormatError (the C++ leaves the table empty, or reads 0 and overruns the array).
 */
export function readExpTable(text: string, file = 'ExpTable.inc'): ExpRow[] {
  const r = new ScriptReader(text, new Map(), new Map(), { file, reader: READER, cppRef: CPP_REF });

  // script.GetToken() until the subject is "expCharacter"
  for (let subject = r.tokenOrEnd(); subject?.text !== 'expCharacter'; subject = r.tokenOrEnd()) {
    if (subject === undefined) r.fail('the file has no expCharacter block');
  }
  const open = r.token('"{" of expCharacter');
  if (open.text !== '{') r.fail(`expected "{" after expCharacter, found "${open.text}"`, open);

  const rows: ExpRow[] = [];
  // nVal = GetExpInteger(); while (*script.token != '}') { ...; nVal = GetExpInteger(); }
  for (let first = r.token('a row or "}"'); first.text[0] !== '}'; first = r.token('a row or "}" of expCharacter')) {
    if (rows.length >= MAX_EXPCHARACTER) r.fail(`more than ${MAX_EXPCHARACTER} rows (MAX_EXPCHARACTER)`, first);
    const exp1 = int64(r, first, `nExp1 of row ${rows.length}`);
    const exp2 = int64(r, r.token(`nExp2 of row ${rows.length}`), `nExp2 of row ${rows.length}`);
    const lpPoint = r.number(`dwLPPoint of row ${rows.length}`);
    const limitExp = int64(r, r.token(`nLimitExp of row ${rows.length}`), `nLimitExp of row ${rows.length}`);
    rows.push({ exp1, exp2, lpPoint, limitExp });
  }

  return rows;
}
