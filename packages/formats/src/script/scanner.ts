// Script tokenizer, copying CScanner (Source/_Common/scanner.cpp), the class every FlyFF text script
// (.wld, Terrain.inc, mdlObj.inc, mdlDyna.inc, define*.h ...) is read with.
//
//   CScanner::Read      scanner.cpp:474  file loading; the encoding check is at :490
//   CScanner::GetToken  scanner.cpp:575  the token rules (iswhite :20, isdelim :27)
//   CScanner::GetNumber scanner.cpp:852  sign folding, define-resolved numbers
//   CScanner::GetHex    scanner.cpp:964
//
// Not copied: the comma / CSV mode (`CScanner(bComma)`), which the tab-separated property tables use.

import { FormatError } from '../errors';

export interface Token {
  kind: 'ident' | 'number' | 'string' | 'symbol';
  /**
   * ident: the word. number: the literal as written, `0x` prefix included for hex. string: the contents without
   * the quotes. symbol: the operator or punctuation character(s).
   */
  text: string;
  /** 1-based line the token starts on. */
  line: number;
  /** Index of the token's first character in the decoded text (the opening quote, for a string). */
  offset: number;
}

const TOKEN_REF = 'Source/_Common/scanner.cpp:575 CScanner::GetToken';
const NUMBER_REF = 'Source/_Common/scanner.cpp:852 CScanner::GetNumber';
const HEX_REF = 'Source/_Common/scanner.cpp:964 CScanner::GetHex';

/**
 * Text of a script file, decoded the way CScanner::Read does (scanner.cpp:490): a buffer that starts with
 * FF FE is UTF-16LE (the BOM is dropped); anything else is ANSI, which on the Korean client is CP949 / EUC-KR.
 */
export function decodeScript(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    // ignoreBOM: true stops the decoder from also eating a second leading U+FEFF; the real BOM is skipped here.
    return new TextDecoder('utf-16le', { ignoreBOM: true }).decode(bytes.subarray(2));
  }
  return new TextDecoder('euc-kr').decode(bytes);
}

// --- character classes (scanner.cpp:20-35, 575-850) ---

// isdelim: ` !:;,+-<>'/*%^=()&|"{}` plus tab, CR, LF and NUL. Anything else, '.' included, continues a word.
const DELIMITERS = new Uint8Array(128);
for (const ch of ' !:;,+-<>\'/*%^=()&|"{}\t\r\n\0') DELIMITERS[ch.charCodeAt(0)] = 1;

function isDelimiter(c: number): boolean {
  return c < 128 && DELIMITERS[c] === 1;
}

/** iswhite: 0x01..0x20. NUL ends the script instead. */
function isWhite(c: number): boolean {
  return c > 0 && c <= 0x20;
}

/** CR, LF or the end of the script: where a `//` comment, or a string that was never closed, stops. */
function isLineEnd(c: number): boolean {
  return c === 13 || c === 10 || c === 0;
}

function isDigit(c: number): boolean {
  return c >= 0x30 && c <= 0x39;
}

/** A word starts with an ASCII letter, a multi-byte character (above 0x7F once decoded), or one of `#_@$?`. */
function startsWord(c: number): boolean {
  return (
    (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c > 0x7f || '#_@$?'.includes(String.fromCharCode(c))
  );
}

/** Single-character delimiter tokens: `+-*^/%=;(),':{}.` */
const SINGLE_SYMBOLS = "+-*^/%=;(),':{}.";

const CH = {
  lf: 10,
  quote: 0x22,
  star: 0x2a,
  slash: 0x2f,
  zero: 0x30,
  lt: 0x3c,
  eq: 0x3d,
  gt: 0x3e,
  bang: 0x21,
  amp: 0x26,
  pipe: 0x7c,
  x: 0x78,
} as const;

/**
 * Splits script text into tokens, following CScanner::GetToken. Differences from the C++:
 * - `-` and `+` are symbols, as in the C++; `TokenStream.number()` folds the sign into the number, like `GetNumber`.
 * - `<<` and `>>` are single symbols (the C++ returns two `<` tokens), which keeps define expressions simple.
 * - `//` comments end at CR or LF (the C++ looks for CR only; the shipped scripts are CRLF).
 * - An unterminated `/*` comment, or a NUL character, ends the script, as in the C++.
 * - An unterminated string throws; the C++ shows an error dialog and carries on.
 */
export function tokenize(text: string, file = '<script>'): Token[] {
  const tokens: Token[] = [];
  const n = text.length;
  const at = (i: number): number => (i < n ? text.charCodeAt(i) : 0);
  let pos = 0;
  let line = 1;
  let start = 0; // where the token being read begins

  const symbol = (length: number): void => {
    tokens.push({ kind: 'symbol', text: text.slice(start, start + length), line, offset: start });
    pos = start + length;
  };
  // Identifiers and numbers both run from their first character up to the next delimiter.
  const word = (kind: 'ident' | 'number'): void => {
    let end = start + 1;
    while (!isDelimiter(at(end))) end++;
    tokens.push({ kind, text: text.slice(start, end), line, offset: start });
    pos = end;
  };

  for (;;) {
    // Skip white space and comments.
    for (;;) {
      let c = at(pos);
      while (isWhite(c)) {
        if (c === CH.lf) line++;
        c = at(++pos);
      }
      if (c !== CH.slash) break;
      const d = at(pos + 1);
      if (d === CH.slash) {
        pos += 2;
        while (!isLineEnd(at(pos))) pos++;
      } else if (d === CH.star) {
        const end = text.indexOf('*/', pos + 2);
        if (end < 0) {
          pos = n; // CScanner returns FINISHED when a block comment never closes
          break;
        }
        for (let i = pos; i < end; i++) {
          if (text.charCodeAt(i) === CH.lf) line++;
        }
        pos = end + 2;
      } else {
        break; // a lone '/' is a symbol
      }
    }

    const c = at(pos);
    if (c === 0) break;
    const d = at(pos + 1);
    start = pos;

    // Relation operators, then && and ||.
    if (c === CH.eq && d === CH.eq) symbol(2);
    else if (c === CH.bang) symbol(d === CH.eq ? 2 : 1);
    else if (c === CH.lt) symbol(d === CH.eq || d === CH.lt ? 2 : 1);
    else if (c === CH.gt) symbol(d === CH.eq || d === CH.gt ? 2 : 1);
    else if (c === CH.amp && d === CH.amp) symbol(2);
    else if (c === CH.pipe && d === CH.pipe) symbol(2);
    else if (SINGLE_SYMBOLS.includes(String.fromCharCode(c))) symbol(1);
    else if (c === CH.quote) {
      let end = start + 1;
      while (at(end) !== CH.quote && !isLineEnd(at(end))) end++;
      if (at(end) !== CH.quote) {
        throw new FormatError('unterminated string', {
          file,
          offset: start,
          unit: 'char',
          line,
          reader: 'tokenize',
          cppRef: TOKEN_REF,
        });
      }
      tokens.push({ kind: 'string', text: text.slice(start + 1, end), line, offset: start });
      pos = end + 1;
    } else if (c === CH.zero && d === CH.x) word('number'); // hex; only a lower-case x counts
    else if (isDigit(c)) word('number');
    else if (startsWord(c)) word('ident');
    else symbol(1); // any other lone character, e.g. & | [ ] ~
  }

  return tokens;
}

/** The low 32 bits of a `0x…` token, unsigned (CScanner::GetHex returns a DWORD); undefined if malformed. */
export function parseHexToken(text: string): number | undefined {
  const m = /^0x([0-9a-fA-F]+)$/.exec(text);
  return m === null ? undefined : Number(BigInt(`0x${m[1]}`) & 0xffffffffn);
}

/** A decimal token's value, integer or float, ignoring `u l f` suffixes; undefined if it is not a plain decimal. */
function parseDecimalToken(text: string): number | undefined {
  const m = /^(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)[uUlLfF]*$/.exec(text);
  return m === null ? undefined : Number(m[1]);
}

const NO_DEFINES: ReadonlyMap<string, number> = new Map();

/**
 * Reads typed values out of a token list, like the `GetNumber` / `GetHex` family on CScanner.
 * Every failure is a FormatError naming the file, the C++ function, and the offending token's line and character
 * offset in the decoded text (`unit: 'char'`; a script's byte offset is not known once it has been decoded).
 */
export class TokenStream {
  private pos = 0;

  /**
   * @param tokens from `tokenize`
   * @param defines `#define` values, used to resolve identifiers in `number()`
   * @param file shown in error messages
   */
  constructor(
    private readonly tokens: Token[],
    private readonly defines: ReadonlyMap<string, number> = NO_DEFINES,
    private readonly file = '<script>',
  ) {}

  next(): Token | undefined {
    const tok = this.tokens[this.pos];
    if (tok !== undefined) this.pos++;
    return tok;
  }

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  done(): boolean {
    return this.pos >= this.tokens.length;
  }

  /** A position to give back to `reset`. */
  mark(): number {
    return this.pos;
  }

  reset(mark: number): void {
    this.pos = mark;
  }

  /**
   * CScanner::GetNumber: an optional `-` or `+` symbol, then a decimal or hex literal, or an identifier from the
   * defines. Decimal literals may have a fraction (the C++ reads those with `GetFloat`). A hex literal comes
   * back as a signed 32-bit int, as `GetNumber` returns an int. Throws for an identifier that is not defined.
   */
  number(): number {
    let negative = false;
    let index = this.pos;
    let tok = this.next();
    if (tok !== undefined && tok.kind === 'symbol' && (tok.text === '-' || tok.text === '+')) {
      negative = tok.text === '-';
      index = this.pos;
      tok = this.next();
    }
    if (tok === undefined) {
      return this.fail(index, `expected a number, found ${this.describe(index)}`, NUMBER_REF);
    }

    let value: number | undefined;
    if (tok.kind === 'number') {
      if (tok.text.startsWith('0x')) {
        const hex = parseHexToken(tok.text);
        value = hex === undefined ? undefined : hex | 0;
      } else {
        value = parseDecimalToken(tok.text);
      }
      if (value === undefined) return this.fail(index, `malformed number "${tok.text}"`, NUMBER_REF);
    } else if (tok.kind === 'ident') {
      value = this.defines.get(tok.text);
      if (value === undefined) return this.fail(index, `unknown define "${tok.text}"`, NUMBER_REF);
    } else {
      return this.fail(index, `expected a number, found ${this.describe(index)}`, NUMBER_REF);
    }
    return negative ? 0 - value : value;
  }

  /** CScanner::GetHex: a `0x…` literal, as an unsigned 32-bit value. */
  hex(): number {
    const index = this.pos;
    const tok = this.next();
    const value = tok !== undefined && tok.kind === 'number' ? parseHexToken(tok.text) : undefined;
    if (value === undefined) {
      return this.fail(index, `expected a hex number (0x…), found ${this.describe(index)}`, HEX_REF);
    }
    return value;
  }

  /** A `"…"` string, returned without its quotes. */
  string(): string {
    const index = this.pos;
    const tok = this.next();
    if (tok === undefined || tok.kind !== 'string') {
      return this.fail(index, `expected a string, found ${this.describe(index)}`, TOKEN_REF);
    }
    return tok.text;
  }

  /** Consumes the next token, which must be the symbol `sym`. */
  expect(sym: string): void {
    const index = this.pos;
    const tok = this.next();
    if (tok === undefined || tok.kind !== 'symbol' || tok.text !== sym) {
      this.fail(index, `expected "${sym}", found ${this.describe(index)}`, TOKEN_REF);
    }
  }

  private describe(index: number): string {
    const tok = this.tokens[index];
    return tok === undefined ? 'the end of the script' : `${tok.kind} "${tok.text}"`;
  }

  /** Throws at the token at `index`, or at the end of the last token when the list has run out. */
  private fail(index: number, message: string, cppRef: string): never {
    const ctx = { file: this.file, unit: 'char', reader: 'TokenStream', cppRef } as const;
    const tok = this.tokens[index];
    if (tok !== undefined) throw new FormatError(message, { ...ctx, offset: tok.offset, line: tok.line });
    const last = this.tokens[this.tokens.length - 1];
    const end = last === undefined ? 0 : last.offset + last.text.length + (last.kind === 'string' ? 2 : 0);
    throw new FormatError(message, { ...ctx, offset: end, line: last?.line ?? 1 });
  }
}
