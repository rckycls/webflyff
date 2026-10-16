import { describe, expect, it } from 'vitest';
import { TokenStream, decodeScript, parseDefines, tokenize } from '../src/index';
import type { Token } from '../src/index';
import { thrown } from './helpers/thrown';

/** Tokens as [kind, text] pairs, so a test reads like the script it tokenizes. */
function pairs(text: string): [Token['kind'], string][] {
  return tokenize(text).map((t) => [t.kind, t.text]);
}

describe('decodeScript', () => {
  // CScanner::Read (scanner.cpp:490): a buffer starting FF FE is UTF-16LE, anything else is ANSI (CP949).
  it('decodes a UTF-16LE buffer with a BOM and drops the BOM', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x62, 0x00, 0x00, 0xac]); // "ab" + U+AC00 '가'
    expect(decodeScript(bytes)).toBe('ab가');
  });

  it('drops exactly one BOM: a second U+FEFF stays in the text', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0xff, 0xfe, 0x61, 0x00]);
    expect(decodeScript(bytes)).toBe('\ufeffa');
  });

  it('decodes a buffer without a BOM as EUC-KR / CP949', () => {
    const bytes = new Uint8Array([0x77, 0x6f, 0x72, 0x6c, 0x64, 0x20, 0xb0, 0xa1]); // "world " + '가'
    expect(decodeScript(bytes)).toBe('world 가');
  });

  it('decodes plain ASCII unchanged, and an empty buffer as the empty string', () => {
    expect(decodeScript(new TextEncoder().encode('#define A 1\r\n'))).toBe('#define A 1\r\n');
    expect(decodeScript(new Uint8Array(0))).toBe('');
  });

  it('only honours the BOM at the start of the buffer', () => {
    const text = decodeScript(new Uint8Array([0x41, 0xff, 0xfe, 0x20, 0x42]));
    expect(text.startsWith('A')).toBe(true);
    expect(text.endsWith(' B')).toBe(true);
  });
});

describe('tokenize', () => {
  it('splits identifiers, decimal and hex numbers, strings and symbols', () => {
    expect(pairs('name 12 0x1F "a b" { } ( ) , ;')).toEqual([
      ['ident', 'name'],
      ['number', '12'],
      ['number', '0x1F'],
      ['string', 'a b'],
      ['symbol', '{'],
      ['symbol', '}'],
      ['symbol', '('],
      ['symbol', ')'],
      ['symbol', ','],
      ['symbol', ';'],
    ]);
  });

  it('ends a number or identifier at a delimiter: "30," is 30 then a comma', () => {
    expect(pairs('size 30,30')).toEqual([
      ['ident', 'size'],
      ['number', '30'],
      ['symbol', ','],
      ['number', '30'],
    ]);
  });

  it('keeps a decimal point inside a number, and a dot inside an identifier', () => {
    expect(pairs('4095.910 Terrain.inc a.b')).toEqual([
      ['number', '4095.910'],
      ['ident', 'Terrain.inc'],
      ['ident', 'a.b'],
    ]);
  });

  it('emits "-" as its own symbol, like CScanner; number() folds the sign', () => {
    expect(pairs('-5 a-b')).toEqual([
      ['symbol', '-'],
      ['number', '5'],
      ['ident', 'a'],
      ['symbol', '-'],
      ['ident', 'b'],
    ]);
  });

  it('treats #directives, _ @ $ ? and Korean letters as identifier starts', () => {
    expect(pairs('#define _x @y $z ?w 가나')).toEqual([
      ['ident', '#define'],
      ['ident', '_x'],
      ['ident', '@y'],
      ['ident', '$z'],
      ['ident', '?w'],
      ['ident', '가나'],
    ]);
  });

  it('emits the two-character operators CScanner knows, and << >> for define expressions', () => {
    expect(pairs('a == b != c <= d >= e && f || g << 1 >> 2 < h > i')).toEqual([
      ['ident', 'a'],
      ['symbol', '=='],
      ['ident', 'b'],
      ['symbol', '!='],
      ['ident', 'c'],
      ['symbol', '<='],
      ['ident', 'd'],
      ['symbol', '>='],
      ['ident', 'e'],
      ['symbol', '&&'],
      ['ident', 'f'],
      ['symbol', '||'],
      ['ident', 'g'],
      ['symbol', '<<'],
      ['number', '1'],
      ['symbol', '>>'],
      ['number', '2'],
      ['symbol', '<'],
      ['ident', 'h'],
      ['symbol', '>'],
      ['ident', 'i'],
    ]);
  });

  it('emits any other lone punctuation as a one-character symbol', () => {
    expect(pairs('a | b & c [ ] ~')).toEqual([
      ['ident', 'a'],
      ['symbol', '|'],
      ['ident', 'b'],
      ['symbol', '&'],
      ['ident', 'c'],
      ['symbol', '['],
      ['symbol', ']'],
      ['symbol', '~'],
    ]);
  });

  it('produces no token for // and /* */ comments', () => {
    expect(pairs('a // b c\r\nd /* e\r\n f */ g /**/ h')).toEqual([
      ['ident', 'a'],
      ['ident', 'd'],
      ['ident', 'g'],
      ['ident', 'h'],
    ]);
  });

  it('reads a lone "/" as a symbol', () => {
    expect(pairs('a / b')).toEqual([
      ['ident', 'a'],
      ['symbol', '/'],
      ['ident', 'b'],
    ]);
  });

  it('treats an unterminated /* comment as the end of the script, like CScanner', () => {
    expect(pairs('a /* never closed\r\n b c')).toEqual([['ident', 'a']]);
  });

  it('treats a NUL character as the end of the script', () => {
    expect(pairs('a b\0c d')).toEqual([
      ['ident', 'a'],
      ['ident', 'b'],
    ]);
  });

  it('gives each token the character offset of its first character, comments and strings included', () => {
    const text = 'ab // c\r\n/* d */ 12 "x y" ,';
    expect(tokenize(text).map((t) => [t.text, t.offset])).toEqual([
      ['ab', 0],
      ['12', 17],
      ['x y', 20], // a string's offset is its opening quote
      [',', 26],
    ]);
    for (const t of tokenize(text)) {
      expect(text.startsWith(t.kind === 'string' ? `"${t.text}"` : t.text, t.offset)).toBe(true);
    }
  });

  it('numbers lines from 1, counting through comments', () => {
    const tokens = tokenize('a\r\nb // x\r\n/* y\r\nz */ c\n\nd');
    expect(tokens.map((t) => [t.text, t.line])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 4],
      ['d', 6],
    ]);
  });

  it('keeps an empty string, and a string with symbols and // inside it', () => {
    expect(pairs('"" "a,b // c"')).toEqual([
      ['string', ''],
      ['string', 'a,b // c'],
    ]);
  });

  it('throws a FormatError on an unterminated string, naming the line', () => {
    const err = thrown(() => tokenize('ok\r\n"abc\r\nnext', 'x.inc'));
    expect(err.file).toBe('x.inc');
    expect(err.unit).toBe('char');
    expect(err.offset).toBe(4); // the opening quote of "abc, after "ok" and CR LF
    expect(err.line).toBe(2);
    expect(err.message).toContain('x.inc @ char');
    expect(err.message).toContain('(line 2)');
    expect(err.message).not.toContain('byte');
    expect(err.cppRef).toContain('CScanner::GetToken');
  });

  it('returns no tokens for empty or whitespace-only input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize(' \t\r\n ')).toEqual([]);
  });
});

describe('TokenStream', () => {
  it('tokenizes a world header', () => {
    const text =
      'size 30, 30\nambient 0x808080\ncamera 5063.999 240.888 4095.910  0.393  0.191\nrevival 0 "" // c';
    const s = new TokenStream(tokenize(text));

    expect(s.next()).toEqual({ kind: 'ident', text: 'size', line: 1, offset: 0 });
    expect(s.number()).toBe(30);
    expect(s.peek()).toEqual({ kind: 'symbol', text: ',', line: 1, offset: 7 });
    s.expect(',');
    expect(s.number()).toBe(30);

    expect(s.next()?.text).toBe('ambient');
    expect(s.hex()).toBe(8421504); // 0x808080

    expect(s.next()?.text).toBe('camera');
    expect(s.number()).toBe(5063.999);
    expect(s.number()).toBe(240.888);
    expect(s.number()).toBe(4095.91);
    expect(s.number()).toBe(0.393);
    expect(s.number()).toBe(0.191);

    expect(s.next()?.text).toBe('revival');
    expect(s.number()).toBe(0);
    expect(s.string()).toBe('');
    expect(s.done()).toBe(true);
    expect(s.next()).toBeUndefined();
    expect(s.peek()).toBeUndefined();
  });

  it('number() folds a leading sign, as CScanner::GetNumber does', () => {
    const s = new TokenStream(tokenize('-7 +8 -0.5 - 3'));
    expect(s.number()).toBe(-7);
    expect(s.number()).toBe(8);
    expect(s.number()).toBe(-0.5);
    expect(s.number()).toBe(-3);
  });

  it('number() accepts a hex token (as a signed 32-bit int) and integer/float suffixes', () => {
    const s = new TokenStream(tokenize('0x10 0xFFFFFFFF 100000000L 1.5f'));
    expect(s.number()).toBe(16);
    expect(s.number()).toBe(-1);
    expect(s.number()).toBe(100000000);
    expect(s.number()).toBe(1.5);
  });

  it('hex() returns an unsigned 32-bit value, upper or lower case', () => {
    const s = new TokenStream(tokenize('0xFFFFFFFF 0xab 0x100000001'));
    expect(s.hex()).toBe(0xffffffff);
    expect(s.hex()).toBe(0xab);
    expect(s.hex()).toBe(1); // CScanner::GetHex keeps the low 32 bits
  });

  it('resolves identifiers through defines', () => {
    const defines = parseDefines('#define OT_OBJ 0\n#define OT_MOVER 5');
    expect(new TokenStream(tokenize('OT_MOVER'), defines).number()).toBe(5);
    expect(new TokenStream(tokenize('-OT_MOVER'), defines).number()).toBe(-5);
  });

  it('throws a FormatError for an unknown define, naming the identifier and line', () => {
    const err = thrown(() => new TokenStream(tokenize('\nNOPE'), new Map([['OTHER', 1]]), 'a.wld').number());
    expect(err.file).toBe('a.wld');
    expect(err.message).toContain('unknown define "NOPE"');
    expect(err.cppRef).toContain('CScanner::GetNumber');
  });

  // R9: a script's byte offset is lost when it is decoded, so errors say "char" and also give the line.
  it('reports a failed read at the offending token: unit "char", its character offset and its line', () => {
    const text = 'size 30\r\nambient oops\r\ncamera 5';
    const stream = new TokenStream(tokenize(text), new Map(), 'World.inc');
    stream.next(); // size
    stream.number(); // 30
    stream.next(); // ambient
    const err = thrown(() => stream.number()); // "oops" is not a define
    expect(err.unit).toBe('char');
    expect(err.offset).toBe(text.indexOf('oops'));
    expect(err.line).toBe(2);
    expect(err.reader).toBe('TokenStream');
    expect(err.message).toContain(`World.inc @ char ${text.indexOf('oops')} (line 2)`);
    expect(err.message).not.toContain('byte');
  });

  it('reports a read past the last token at the end of that token, on its line', () => {
    const text = 'a\r\n\r\n"str"';
    const stream = new TokenStream(tokenize(text), new Map(), 'e.inc');
    stream.next();
    stream.next();
    const err = thrown(() => stream.number());
    expect(err.unit).toBe('char');
    expect(err.offset).toBe(text.length);
    expect(err.line).toBe(3);
    expect(err.message).toContain('found the end of the script');
  });

  it('counts decoded characters, not file bytes, for a UTF-16LE script', () => {
    const units = Array.from('ok 가 zz', (c) => c.charCodeAt(0));
    const bytes = new Uint8Array([0xff, 0xfe, ...units.flatMap((u) => [u & 0xff, u >> 8])]);
    const stream = new TokenStream(tokenize(decodeScript(bytes)), new Map(), 'u.inc');
    stream.next(); // ok
    stream.next(); // 가
    const err = thrown(() => stream.number()); // zz is not a define
    expect(err.unit).toBe('char');
    expect(err.offset).toBe(5); // five characters in; in the file that is byte 12 (BOM plus ten bytes)
    expect(err.line).toBe(1);
  });

  it('throws a FormatError when number() meets a string, a symbol, a malformed number or the end', () => {
    thrown(() => new TokenStream(tokenize('"x"')).number());
    thrown(() => new TokenStream(tokenize(',')).number());
    thrown(() => new TokenStream(tokenize('12abc')).number());
    thrown(() => new TokenStream(tokenize('0xZZ')).number());
    thrown(() => new TokenStream(tokenize('-')).number());
    thrown(() => new TokenStream([]).number());
  });

  it('hex() throws on a non-hex token', () => {
    thrown(() => new TokenStream(tokenize('12')).hex());
    thrown(() => new TokenStream(tokenize('abc')).hex());
    thrown(() => new TokenStream([]).hex());
  });

  it('string() throws on a non-string token', () => {
    thrown(() => new TokenStream(tokenize('abc')).string());
    thrown(() => new TokenStream([]).string());
  });

  it('expect() consumes a matching symbol and throws on anything else', () => {
    const s = new TokenStream(tokenize('{ x'));
    s.expect('{');
    thrown(() => s.expect('}')); // "x" is not a symbol
    thrown(() => new TokenStream(tokenize('x')).expect('x')); // an ident is not a symbol
    thrown(() => new TokenStream([]).expect(';'));
  });

  it('accept() consumes the next token only when it is that symbol', () => {
    const s = new TokenStream(tokenize('( x ) )'));
    expect(s.accept('(')).toBe(true);
    expect(s.accept(')')).toBe(false); // the next token is the ident x
    expect(s.next()?.text).toBe('x'); // a failed accept consumes nothing
    expect(s.accept(')')).toBe(true);
    expect(s.accept(')')).toBe(true);
    expect(s.accept(')')).toBe(false); // end of the script
    // only symbols count: the string "(" and the ident ( are not the symbol (
    expect(new TokenStream(tokenize('"("')).accept('(')).toBe(false);
    expect(new TokenStream(tokenize('x')).accept('x')).toBe(false);
  });

  it('word() returns the next token text whatever its kind, strings without their quotes', () => {
    const s = new TokenStream(tokenize('abc 12 0x1F "a b" "" {'));
    expect([s.word(), s.word(), s.word(), s.word(), s.word(), s.word()]).toEqual([
      'abc',
      '12',
      '0x1F',
      'a b',
      '',
      '{',
    ]);
    expect(s.done()).toBe(true);
  });

  it('word() throws a FormatError at the end of the script, at the end of the last token', () => {
    const text = 'size\n"x"';
    const s = new TokenStream(tokenize(text), new Map(), 'w.wld');
    s.word();
    s.word();
    const err = thrown(() => s.word());
    expect(err.unit).toBe('char');
    expect(err.offset).toBe(text.length);
    expect(err.line).toBe(2);
    expect(err.message).toContain('found the end of the script');
    thrown(() => new TokenStream([]).word());
  });

  it('mark() and reset() rewind the stream', () => {
    const s = new TokenStream(tokenize('a b c'));
    s.next();
    const m = s.mark();
    expect(s.next()?.text).toBe('b');
    expect(s.next()?.text).toBe('c');
    expect(s.done()).toBe(true);
    s.reset(m);
    expect(s.done()).toBe(false);
    expect(s.next()?.text).toBe('b');
  });
});

describe('parseDefines', () => {
  it('resolves defines, names and parenthesised expressions', () => {
    const defines = parseDefines('#define OT_OBJ 0\n#define OT_MOVER 5\n#define MI_X (OT_MOVER + 2)');
    expect(defines.get('OT_OBJ')).toBe(0);
    expect(defines.get('OT_MOVER')).toBe(5);
    expect(defines.get('MI_X')).toBe(7);
    expect(new TokenStream(tokenize('OT_MOVER'), defines).number()).toBe(5);
  });

  it('reads decimal, hex, negative and L-suffixed values, with tabs and trailing comments', () => {
    const defines = parseDefines(
      [
        '#define\tA\t\t12 // c',
        '#define B 0x00000010',
        '#define C -1',
        '#define D 100000000L',
        '#define E 007',
        '#define F 0xFFFFFFFF',
      ].join('\r\n'),
    );
    expect([...defines]).toEqual([
      ['A', 12],
      ['B', 16],
      ['C', -1],
      ['D', 100000000],
      ['E', 7],
      ['F', -1], // C++ stores defines in a map<CString, int>
    ]);
  });

  it('evaluates + - | << with unary minus and parentheses, using C precedence', () => {
    const defines = parseDefines(
      [
        '#define ONE 1',
        '#define A (ONE << 4)',
        '#define B (ONE | 2 | 8)',
        '#define C (A - 3 + 1)',
        '#define D -ONE',
        '#define E (ONE << 2 + 1)', // + binds tighter than <<
        '#define F (4 | 1 << 1)', // << binds tighter than |
        '#define G ((2 + 3) - -4)',
        '#define H A | B',
      ].join('\n'),
    );
    expect(defines.get('A')).toBe(16);
    expect(defines.get('B')).toBe(11);
    expect(defines.get('C')).toBe(14);
    expect(defines.get('D')).toBe(-1);
    expect(defines.get('E')).toBe(8);
    expect(defines.get('F')).toBe(6);
    expect(defines.get('G')).toBe(9);
    expect(defines.get('H')).toBe(27);
  });

  it('resolves a name defined as another name', () => {
    const defines = parseDefines('#define MAX_JOB 32\n#define JOB_ALL MAX_JOB');
    expect(defines.get('JOB_ALL')).toBe(32);
  });

  it('skips defines it cannot evaluate and records them in parseDefines.lastSkipped', () => {
    const defines = parseDefines(
      [
        '#define GUARD',
        '#define BGM "song.mp3"',
        '#define LATER LATE_NAME',
        '#define FLOAT 1.5',
        '#define BAD (1 +',
        '#define TRAILING 1 2',
        '#define OK 3',
        '#define LATE_NAME 4',
      ].join('\n'),
    );
    expect([...defines]).toEqual([
      ['OK', 3],
      ['LATE_NAME', 4],
    ]);
    expect(parseDefines.lastSkipped).toEqual(['GUARD', 'BGM', 'LATER', 'FLOAT', 'BAD', 'TRAILING']);
  });

  it('resets lastSkipped on every call', () => {
    parseDefines('#define S "x"');
    expect(parseDefines.lastSkipped).toEqual(['S']);
    parseDefines('#define T 1');
    expect(parseDefines.lastSkipped).toEqual([]);
  });

  it('keeps the first definition of a name, like std::map::insert in CScript::ExecDefine', () => {
    const defines = parseDefines(
      '#if __VER >= 15\n#define MAX_LEGEND_LEVEL 129\n#else\n#define MAX_LEGEND_LEVEL 121\n#endif',
    );
    expect(defines.get('MAX_LEGEND_LEVEL')).toBe(129);
    expect(defines.size).toBe(1);
  });

  it('adds to the map it is given, and resolves names defined by an earlier call', () => {
    const into = new Map<string, number>();
    parseDefines('#define A 1', into);
    const out = parseDefines('#define B (A + 1)\n#define A 99', into);
    expect(out).toBe(into);
    expect([...into]).toEqual([
      ['A', 1],
      ['B', 2],
    ]);
  });

  it('ignores #ifndef/#if/#else/#endif lines, comments and ordinary code', () => {
    const defines = parseDefines(
      [
        '#ifndef __DEFINE_X',
        '#define __DEFINE_X',
        '// #define HIDDEN 1',
        '/* #define ALSO_HIDDEN 2',
        '#define STILL_HIDDEN 3 */',
        '#define SHOWN 4 /* inline */',
        'int main() { return 0; }',
        '#endif',
      ].join('\r\n'),
    );
    expect([...defines]).toEqual([['SHOWN', 4]]);
  });

  it('does not take a value from the next line', () => {
    const defines = parseDefines('#define EMPTY\n5\n#define NEXT 6');
    expect([...defines]).toEqual([['NEXT', 6]]);
    expect(parseDefines.lastSkipped).toEqual(['EMPTY']);
  });

  it('returns an empty map for empty input', () => {
    expect(parseDefines('').size).toBe(0);
  });
});
