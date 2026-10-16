import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { ResPacks, readResFile, readResIndex } from '../../src/index';
import { clientRoot, describeClient } from '../helpers/client';

const PACKS = ['data.res', 'dataSub1.res', 'dataSub2.res'];

function loadPack(file: string): Uint8Array {
  const buf = readFileSync(path.join(clientRoot()!, file));
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

describeClient('res packs', () => {
  it('data.res: key 87, encrypted, 83 entries, holds the index files', () => {
    const pack = readResIndex(loadPack('data.res'), 'data.res');
    expect(pack.key).toBe(87);
    expect(pack.encrypted).toBe(true);
    expect(pack.entries).toHaveLength(83);
    const names = new Set(pack.entries.map((e) => e.name.toLowerCase()));
    for (const name of ['terrain.inc', 'world.inc', 'mdlobj.inc', 'mdldyna.inc']) {
      expect(names.has(name), name).toBe(true);
    }
  });

  it('dataSub1.res has 31 entries', () => {
    expect(readResIndex(loadPack('dataSub1.res'), 'dataSub1.res').entries).toHaveLength(31);
  });

  it('dataSub2.res has 3 entries, including propitem.txt', () => {
    const pack = readResIndex(loadPack('dataSub2.res'), 'dataSub2.res');
    expect(pack.entries).toHaveLength(3);
    expect(pack.entries.map((e) => e.name.toLowerCase())).toContain('propitem.txt');
  });

  for (const file of PACKS) {
    // readResIndex fails unless the header is consumed to its last byte, so parsing it is the header check.
    it(`${file}: header consumed exactly; the last entry ends at the end of the file`, () => {
      const bytes = loadPack(file);
      const pack = readResIndex(bytes, file);
      const end = Math.max(...pack.entries.map((e) => e.offset + e.size));
      expect(end).toBe(bytes.length);
    });

    it(`${file}: every entry reads back at its declared size`, () => {
      const bytes = loadPack(file);
      const pack = readResIndex(bytes, file);
      for (const entry of pack.entries) {
        expect(readResFile(bytes, pack, entry), entry.name).toHaveLength(entry.size);
      }
    });
  }

  // The brief's check was "Terrain.inc: first 64 bytes contain no byte < 0x09". Real data contradicts it:
  // Terrain.inc is UTF-16LE text (BOM ff fe, every other byte 0x00). So the decryption check is split by
  // encoding: UTF-16LE for Terrain.inc, and the original no-control-byte check on an ANSI file (World.inc).
  it('Terrain.inc decrypts to UTF-16LE text', () => {
    const packs = ResPacks.fromBuffers(PACKS.map((file) => ({ file, bytes: loadPack(file) })));
    const bytes = packs.read('Terrain.inc');
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xfe]);
    expect(new TextDecoder('utf-16le').decode(bytes.subarray(2, 2 + 40))).toMatch(/^\/\/ Terrain Script/);
  });

  it('World.inc decrypts to ANSI text: no byte < 0x09 in the first 64', () => {
    const packs = ResPacks.fromBuffers(PACKS.map((file) => ({ file, bytes: loadPack(file) })));
    const head = packs.read('World.inc').subarray(0, 64);
    expect(head).toHaveLength(64);
    expect(Array.from(head).filter((b) => b < 0x09)).toEqual([]);
    expect(new TextDecoder('latin1').decode(head)).toMatch(/^\/\/ World Script/);
  });

  it('the three packs share no resource name', () => {
    // fromBuffers throws on a duplicate, so building it is the check.
    const packs = ResPacks.fromBuffers(PACKS.map((file) => ({ file, bytes: loadPack(file) })));
    expect(packs.list()).toHaveLength(83 + 31 + 3);
  });
});
