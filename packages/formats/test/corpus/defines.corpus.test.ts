import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { ResPacks, TokenStream, decodeScript, parseDefines, tokenize } from '../../src/index';
import { clientRoot, describeClient } from '../helpers/client';

const PACKS = ['data.res', 'dataSub1.res', 'dataSub2.res'];

function loadPacks(): ResPacks {
  return ResPacks.fromBuffers(
    PACKS.map((file) => {
      const buf = readFileSync(path.join(clientRoot()!, file));
      return { file, bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
    }),
  );
}

describeClient('define*.h tables', () => {
  const packs = loadPacks();
  const headers = packs.list().filter((name) => /^define.*\.h$/i.test(name));
  const texts = new Map(headers.map((name) => [name, decodeScript(packs.read(name))]));

  it('finds the 15 define headers across the three packs', () => {
    expect(headers).toHaveLength(15);
    for (const name of ['define.h', 'defineItem.h', 'defineObj.h', 'defineWorld.h']) {
      expect(headers, name).toContain(name);
    }
  });

  it('decodes every header as CP949 without a replacement character', () => {
    const offenders = [...texts].filter(([, text]) => text.includes('�')).map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it('parses every header; the union holds more than 1000 defines', () => {
    const union = new Map<string, number>();
    for (const [name, text] of texts) {
      const before = union.size;
      parseDefines(text, union, name);
      const skipped = parseDefines.lastSkipped;
      const list = skipped.length > 0 ? ` (${skipped.join(', ')})` : '';
      console.log(`${name}: +${union.size - before} defines, ${skipped.length} skipped${list}`);
    }
    console.log(`union: ${union.size} defines from ${texts.size} headers`);
    expect(union.size).toBeGreaterThan(1000);
  });

  // An independent reading of the same files: drop comments with one regex, take every line that is exactly
  // `#define NAME <integer>`, keep the first value of each name. parseDefines has to agree on all of them.
  it('agrees with a plain line-by-line reading on every `#define NAME <integer>`', () => {
    const union = new Map<string, number>();
    const plain = new Map<string, number>();
    for (const [name, text] of texts) {
      parseDefines(text, union, name);
      const code = text.replace(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, ' ');
      for (const line of code.split(/\r?\n/)) {
        const m = /^\s*#define\s+(\w+)\s+(0x[0-9a-fA-F]+|-?\d+)[uUlL]*\s*$/.exec(line);
        if (m === null || plain.has(m[1])) continue;
        const value = m[2].startsWith('0x') ? Number(BigInt(m[2]) & 0xffffffffn) | 0 : parseInt(m[2], 10);
        plain.set(m[1], value);
      }
    }
    expect(plain.size).toBeGreaterThan(1000);
    const disagreements = [...plain].filter(([name, value]) => union.get(name) !== value).map(([name]) => name);
    expect(disagreements).toEqual([]);
    // What the union has beyond the plain reading is aliases such as `#define JOB_ALL MAX_JOB`.
    const extra = [...union.keys()].filter((name) => !plain.has(name));
    console.log(`defines beyond plain "NAME integer" lines: ${extra.join(', ') || 'none'}`);
    expect(extra).toEqual(['JOB_ALL']);
  });

  it('resolves known values, and a TokenStream reads them by name', () => {
    const union = new Map<string, number>();
    for (const [name, text] of texts) parseDefines(text, union, name);
    expect(union.get('WI_WORLD_NONE')).toBe(0);
    expect(union.get('WI_WORLD_MADRIGAL')).toBe(1);
    expect(union.get('WI_WORLD_KEBARAS')).toBe(2);
    expect(union.get('OF_OBJ')).toBe(1);
    expect(union.get('OF_ANI')).toBe(2);
    // `#if __VER >= 10` is not evaluated, so the first MAX_JOB wins, as in CScript's map::insert.
    expect(union.get('MAX_JOB')).toBe(32);
    expect(union.get('JOB_ALL')).toBe(32);
    expect(union.get('PERIN_VALUE')).toBe(100000000);
    expect(new TokenStream(tokenize('WI_WORLD_MADRIGAL'), union).number()).toBe(1);
  });

  // Both branches of decodeScript on the real files the next task reads with this tokenizer:
  // Terrain.inc and mdlObj.inc are UTF-16LE, World.inc and mdlDyna.inc are CP949.
  it('decodes and tokenizes the world scripts', () => {
    const terrain = decodeScript(packs.read('Terrain.inc'));
    expect(terrain).toMatch(/^\/\/ Terrain Script/);
    for (const name of ['Terrain.inc', 'mdlObj.inc', 'World.inc', 'mdlDyna.inc']) {
      const text = decodeScript(packs.read(name));
      expect(text, name).not.toContain('�');
      expect(text, name).not.toContain('﻿');
      expect(tokenize(text, name).length, name).toBeGreaterThan(100);
    }
  });
});
