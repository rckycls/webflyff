// Token reading in comma mode, for the comma-separated tables (`propSkillAdd.csv`), copying what the C++ does when a loader
// reads with `script.GetNumber( TRUE )`:
//
//   CScanner::GetToken   scanner.cpp:575-675  the comma branch (:643-675): a cell runs up to the next comma or the end of
//                                             the line, the white space around it is dropped; the comments before it are
//                                             skipped as in the normal mode (:588-632)
//   CScript::GetToken    Script.cpp:184-239   a name is replaced by its #define value
//   CScanner::GetNumber  scanner.cpp:852-902  `=` is NULL_ID; the sign of `-5` belongs to the cell (no token of its own)
//
// The tab-separated tables are read with ScriptReader (cscript.ts) and the normal mode of `tokenize` (scanner.ts).
//
// Differences from the C++, in the direction of failing loudly where the C++ logs and carries on: a name that is not a
// #define throws (the C++ shows "<name> Not Found." and reads 0), a hex cell throws (in comma mode the token keeps its `0x`,
// which GetNumber then reads as digits), and so does reading past the end of the script (the C++ returns 0).

import { FormatError } from '../errors';
import { NULL_ID, atoi } from './cscript';
import type { ScriptContext } from './cscript';

/** `iswhite` (scanner.cpp:20): 0x01 to 0x20. */
const isWhite = (c: string | undefined): boolean => c !== undefined && c > '\0' && c <= ' ';

export class CommaReader {
  private pos = 0;
  private line = 1;
  /** Where the last cell read starts, for an error. */
  private at = { line: 1, offset: 0 };

  constructor(
    private readonly text: string,
    private readonly defines: ReadonlyMap<string, number>,
    private readonly ctx: ScriptContext,
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

  /** Throws a FormatError at the last cell read (or at `where`). */
  fail(message: string, where = this.at): never {
    throw new FormatError(message, {
      file: this.ctx.file, offset: where.offset, unit: 'char', line: where.line, reader: this.ctx.reader, cppRef: this.ctx.cppRef,
    });
  }

  /**
   * CScanner::GetNumber( TRUE ): an int. `what` names the column, for an error. A name is replaced by its #define; `=` is
   * NULL_ID (-1); an empty cell is 0.
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
