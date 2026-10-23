// Token reading as CScript does it, for the property tables and `.inc` scripts the game loaders read with
// `CScript` (propMover.txt, propItem.txt, character.inc, honorList.txt, PKSetting.inc):
//
//   CScript::GetToken    Source/_Common/Script.cpp:184  a name is replaced by its string-table text (IDS_*) or by its
//                                                       #define value, before the loader sees it
//   CScript::LookUp      Script.cpp:423                 the words that are not replaced (the keyword table, :23)
//   CScanner::GetNumber  Source/_Common/scanner.cpp:852 atoi of the token; `=` is NULL_ID; a leading `-` / `+` is a
//                                                       token of its own, and the number is the next token
//   CScanner::GetFloat   scanner.cpp:940                the same with atof; `=` is -1
//   CScanner::GetInt64   scanner.cpp:904                the same with _atoi64; `=` is NULL_ID as an unsigned value
//
// `tokenize` (scanner.ts) does the splitting, as CScanner::GetToken. This class adds what CScript does on top.
//
// Differences from the C++, all in the direction of failing loudly where the C++ logs and carries on:
// - A name that is neither a string-table key, a define nor a keyword, read as a number, throws (the C++ shows
//   "<name> Not Found." and reads 0). The error names what was being read when the caller gave one.
// - Reading past the end of the script throws (the C++ returns an empty token and 0). A loader that wants to
//   stop at the end asks with `tokenOrEnd` / `numberOrEnd`.
// - A define that is replaced by a negative value is that value; the C++ turns it into the text "-5", and the next
//   read takes it for a sign and swallows the token after it.

import { FormatError } from '../errors';
import { parseHexToken, tokenize } from './scanner';
import type { Token } from './scanner';

/** NULL_ID (Source/_Common/scanner.h:7) as `GetNumber` returns it: an int, so -1. */
const NULL_ID = -1;

/**
 * CScript's keyword table (Script.cpp:23-47, the entries CScript::LookUp matches). A word in it is a KEYWORD
 * token, which GetToken does not replace.
 */
const KEYWORDS: ReadonlySet<string> = new Set([
  'int', 'if', 'else', 'for', 'do', 'while', 'break', 'switch', 'answer', 'Select', 'YesNo', 'case', 'default',
  'goto', 'return', '#define', '#include', 'enum',
]);

/** A token as `CScript::GetToken` leaves it: a replaced name has the kind and text of what replaced it. */
export interface ScriptToken extends Token {
  /** The value of a name replaced by a #define, so a negative one needs no re-reading. */
  value?: number;
}

/** What names the failing reader in a FormatError. */
export interface ScriptContext {
  file: string;
  reader: string;
  cppRef: string;
}

const MAX_INT = 2147483647;
const MIN_INT = -2147483648;

/** C `atoi`: leading white space, an optional sign, digits; 0 when there are none. Out of range clamps, as in MSVC. */
function atoi(text: string): number {
  const m = /^[\s]*([+-]?\d+)/.exec(text);
  if (m === null) return 0;
  return Math.max(MIN_INT, Math.min(MAX_INT, parseInt(m[1], 10)));
}

/** C `atof` for the decimal forms the scripts use (`0.075`, `10`, `1e3`, `.5`); 0 when the text starts with none. */
function atof(text: string): number {
  const m = /^[\s]*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(text);
  return m === null ? 0 : parseFloat(m[1]);
}

/** C `_atoi64`, as a double (the columns read with it are not kept, and none comes near 2^53). */
function atoi64(text: string): number {
  const m = /^[\s]*([+-]?\d+)/.exec(text);
  return m === null ? 0 : Number(m[1]);
}

/** The text of a token as the C++ has it in `Token`: a hex literal has lost its `0x`. */
function rawText(tok: Token): string {
  return tok.kind === 'number' && tok.text.startsWith('0x') ? tok.text.slice(2) : tok.text;
}

/** NULL_ID as `GetInt64` returns it: the unsigned 32-bit constant, widened (it is not -1 there). */
const NULL_ID_UNSIGNED = 0xffffffff;

export class ScriptReader {
  private readonly tokens: Token[];
  private pos = 0;

  /**
   * @param text a script, decoded (see `decodeScript`)
   * @param defines #define values (CScript::m_defines), which replace a name in the token stream
   * @param strings string-table texts (CScript::m_mapString), which replace an `IDS_*` name
   */
  constructor(
    text: string,
    private readonly defines: ReadonlyMap<string, number>,
    private readonly strings: ReadonlyMap<string, string>,
    private readonly ctx: ScriptContext,
  ) {
    this.tokens = tokenize(text, ctx.file);
  }

  /** True when the next read finds the end of the script (the C++ `tok == FINISHED`). */
  done(): boolean {
    return this.pos >= this.tokens.length;
  }

  /**
   * The last token read, as CScript::GetToken left it in `token` (a name replaced by a define has the text of its value,
   * and a number read after its sign is the token after the sign); undefined before the first read.
   */
  lastToken(): ScriptToken | undefined {
    const tok = this.tokens[this.pos - 1];
    return tok === undefined ? undefined : this.replace(tok);
  }

  /** CScript::GetToken, or undefined at the end of the script. */
  tokenOrEnd(): ScriptToken | undefined {
    const tok = this.tokens[this.pos];
    if (tok === undefined) return undefined;
    this.pos++;
    return this.replace(tok);
  }

  /** CScript::GetToken. `what` names the column or word being read, for the error at the end of the script. */
  token(what = 'a token'): ScriptToken {
    const tok = this.tokenOrEnd();
    if (tok === undefined) return this.failEnd(what);
    return tok;
  }

  /** CScanner::GetNumber, or undefined at the end of the script (the loop head of the property loaders). */
  numberOrEnd(what?: string): number | undefined {
    return this.done() ? undefined : this.number(what);
  }

  /** CScanner::GetNumber: an int. `=` is NULL_ID (-1). */
  number(what?: string): number {
    return this.numeric('int', what);
  }

  /** CScanner::GetFloat. `=` is -1. */
  float(what?: string): number {
    return this.numeric('float', what);
  }

  /** CScanner::GetInt64 (CScanner::GetExpInteger). `=` is 4294967295. */
  int64(what?: string): number {
    return this.numeric('int64', what);
  }

  /** Throws a FormatError at the last token read. */
  fail(message: string, at?: Token): never {
    const tok = at ?? this.tokens[Math.max(0, this.pos - 1)];
    throw new FormatError(message, {
      file: this.ctx.file,
      offset: tok?.offset ?? 0,
      unit: 'char',
      line: tok?.line ?? 1,
      reader: this.ctx.reader,
      cppRef: this.ctx.cppRef,
    });
  }

  // --- CScript::GetToken's replacements ---

  private replace(tok: Token): ScriptToken {
    if (tok.kind !== 'ident' || KEYWORDS.has(tok.text)) return tok;
    const text = this.strings.get(tok.text);
    if (text !== undefined) return { ...tok, kind: 'string', text };
    const value = this.defines.get(tok.text);
    if (value !== undefined) return { ...tok, kind: 'number', text: String(value), value };
    return tok;
  }

  /** The body of GetNumber / GetFloat / GetInt64, which differ only in how the token's text becomes a number. */
  private numeric(as: 'int' | 'float' | 'int64', what?: string): number {
    const convert = (tok: ScriptToken): number => {
      if (tok.value !== undefined) return tok.value;
      const text = rawText(tok);
      return as === 'float' ? atof(text) : as === 'int64' ? atoi64(text) : atoi(text);
    };
    const known = (tok: ScriptToken): ScriptToken => {
      // m_dwDef == 1: a name that is not a define is an error in the C++ ("<name> Not Found.")
      if (tok.kind === 'ident' && !KEYWORDS.has(tok.text)) {
        const where = what === undefined ? '' : ` (in ${what})`;
        this.fail(`"${tok.text}" is not a #define or a string-table key${where}`, tok);
      }
      return tok;
    };

    const first = known(this.token(what ?? 'a number'));
    if (first.value !== undefined) return first.value;

    if (first.kind === 'number' && first.text.startsWith('0x') && as !== 'float') {
      if (as === 'int64') return 0; // GetInt64's hex branch is empty: it returns 0
      const hex = parseHexToken(first.text);
      if (hex === undefined) return this.fail(`malformed hex number "${first.text}"`, first);
      return hex | 0; // GetNumber returns an int
    }

    switch (first.text[0]) {
      case '=':
        return as === 'float' ? -1 : as === 'int' ? NULL_ID : NULL_ID_UNSIGNED;
      case '-':
        return 0 - convert(known(this.token(what ?? 'a number')));
      case '+':
        return convert(known(this.token(what ?? 'a number')));
      default:
        return convert(first);
    }
  }

  /** Throws at the end of the last token, as TokenStream does when the list has run out. */
  private failEnd(what: string): never {
    const last = this.tokens[this.tokens.length - 1];
    const end = last === undefined ? 0 : last.offset + last.text.length + (last.kind === 'string' ? 2 : 0);
    throw new FormatError(`expected ${what}, found the end of the script`, {
      file: this.ctx.file,
      offset: end,
      unit: 'char',
      line: last?.line ?? 1,
      reader: this.ctx.reader,
      cppRef: this.ctx.cppRef,
    });
  }
}
