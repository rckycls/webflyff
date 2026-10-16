// `#define` tables, copying CScript::ExecDefine (Source/_Common/Script.cpp:399) and the m_defines map
// it fills (a `map<CString, int>`: names are case-sensitive, and `insert` keeps the first definition).
//
// The C++ only accepts `#define NAME <decimal | hex literal>`. This also accepts another define's name and
// integer expressions built from numbers, names, parentheses, unary `-` / `+`, `+`, `-`, `<<` and `|`, so the
// web client can read tables the C++ would silently leave out. Like the C++, `#if` / `#else` / `#endif` lines
// are not evaluated: every `#define` in the file counts, in order.

import type { ResPacks } from '../res/ResPacks';
import { TokenStream, decodeScript, parseHexToken, tokenize } from './scanner';
import type { Token } from './scanner';

/** Thrown inside `evaluate` when a value is not something this module can compute. Never leaves the module. */
class Unevaluable extends Error {}

/**
 * Evaluates the tokens after `#define NAME`. Precedence, low to high: `|`, `<<`, `+ -`, unary `+ -`.
 * Integers are 32-bit, as in the C++ (`int`). Throws Unevaluable for anything else.
 */
function evaluate(tokens: Token[], defines: ReadonlyMap<string, number>): number {
  const ts = new TokenStream(tokens);

  const primary = (): number => {
    const tok = ts.next();
    if (tok === undefined) throw new Unevaluable('expression ends early');
    if (tok.kind === 'number') {
      if (tok.text.startsWith('0x')) {
        const hex = parseHexToken(tok.text);
        if (hex === undefined) throw new Unevaluable(`bad hex number ${tok.text}`);
        return hex | 0;
      }
      // The C++ reads the digits with atoi; a trailing L or U (as in 100000000L) is ignored.
      if (!/^\d+[uUlL]*$/.test(tok.text)) throw new Unevaluable(`not an integer: ${tok.text}`);
      return parseInt(tok.text, 10);
    }
    if (tok.kind === 'ident') {
      const value = defines.get(tok.text);
      if (value === undefined) throw new Unevaluable(`unknown define ${tok.text}`);
      return value;
    }
    if (tok.kind === 'symbol' && tok.text === '(') {
      const value = or();
      if (!ts.accept(')')) throw new Unevaluable('missing )');
      return value;
    }
    throw new Unevaluable(`unexpected ${tok.kind} ${tok.text}`);
  };

  const unary = (): number => {
    if (ts.accept('-')) return 0 - unary();
    if (ts.accept('+')) return unary();
    return primary();
  };

  const additive = (): number => {
    let value = unary();
    for (;;) {
      if (ts.accept('+')) value = (value + unary()) | 0;
      else if (ts.accept('-')) value = (value - unary()) | 0;
      else return value;
    }
  };

  const shift = (): number => {
    let value = additive();
    while (ts.accept('<<')) value = value << additive();
    return value;
  };

  const or = (): number => {
    let value = shift();
    while (ts.accept('|')) value = value | shift();
    return value;
  };

  const value = or();
  if (!ts.done()) throw new Unevaluable('extra tokens after the value');
  return value;
}

/**
 * Reads every `#define NAME value` in `text` into a name -> value map (a new one, or `into`). The value has
 * to sit on the same line as the name. A name that is already in the map keeps its first value, as in the C++.
 *
 * Defines this cannot evaluate (no value, a string or float value, a name that is not defined yet, a syntax
 * it does not know) are left out of the map; their names are listed in `parseDefines.lastSkipped`, which each
 * call replaces. `file` only labels errors: an unterminated string in `text` throws a FormatError.
 */
export function parseDefines(
  text: string,
  into: Map<string, number> = new Map(),
  file = '<script>',
): Map<string, number> {
  const tokens = tokenize(text, file);
  const skipped: string[] = [];

  let i = 0;
  while (i < tokens.length) {
    const head = tokens[i++];
    if (head.kind !== 'ident' || head.text !== '#define') continue;

    const nameTok = tokens[i];
    if (nameTok === undefined || nameTok.kind !== 'ident' || nameTok.line !== head.line) continue;
    i++;

    const valueStart = i;
    while (i < tokens.length && tokens[i].line === head.line) i++;

    try {
      const value = evaluate(tokens.slice(valueStart, i), into);
      if (!into.has(nameTok.text)) into.set(nameTok.text, value);
    } catch (e) {
      if (!(e instanceof Unevaluable)) throw e;
      skipped.push(nameTok.text);
    }
  }

  parseDefines.lastSkipped = skipped;
  return into;
}

/** Names skipped by the most recent `parseDefines` call, in file order. */
parseDefines.lastSkipped = [] as string[];

/**
 * Every `define*.h` in the packs, merged into one table (CProject::LoadDefines, ProjectCmn.cpp:704, loads these
 * headers into the one CScript::m_defines map). Headers are read in pack order, then index order, and each is
 * decoded by its own encoding; a name already defined keeps its first value.
 */
export function loadDefines(packs: ResPacks): Map<string, number> {
  const defines = new Map<string, number>();
  for (const name of packs.list()) {
    if (/^define.*\.h$/i.test(name)) parseDefines(decodeScript(packs.read(name)), defines, name);
  }
  return defines;
}
