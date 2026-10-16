import { describe, expect, it } from 'vitest';
import { FormatError, ResPacks, decryptByte, readResFile, readResIndex } from '../src/index';

/** CResFile::Encryption (file.h:78): the inverse of decryptByte, used to build synthetic packs. */
function encryptByte(key: number, b: number): number {
  const swapped = ((b << 4) | (b >> 4)) & 0xff;
  return (~swapped ^ key) & 0xff;
}

interface TestFile {
  name: string;
  data: number[];
  time?: number;
}

/**
 * Builds a pack the way AddResource reads it: key u8, encrypted u8, headerSize i32, then the
 * header (always encrypted), then the file data (encrypted only when `encrypted`).
 */
function buildPack(opts: {
  key: number;
  encrypted: boolean;
  files: TestFile[];
  version?: string;
}): Uint8Array {
  const { key, encrypted, files, version = 'RES0001' } = opts;
  const names = files.map((f) => new TextEncoder().encode(f.name));
  const headerSize = 7 + 2 + names.reduce((sum, n) => sum + 2 + n.length + 12, 0);
  const preamble = 6;

  const header = new Uint8Array(headerSize);
  const view = new DataView(header.buffer);
  header.set(new TextEncoder().encode(version), 0);
  view.setInt16(7, files.length, true);
  let at = 9;
  let dataAt = preamble + headerSize;
  files.forEach((f, i) => {
    view.setInt16(at, names[i].length, true);
    header.set(names[i], at + 2);
    at += 2 + names[i].length;
    view.setInt32(at, f.data.length, true);
    view.setInt32(at + 4, f.time ?? 0, true);
    view.setInt32(at + 8, dataAt, true);
    at += 12;
    dataAt += f.data.length;
  });

  const out = new Uint8Array(dataAt);
  out[0] = key;
  out[1] = encrypted ? 1 : 0;
  new DataView(out.buffer).setInt32(2, headerSize, true);
  header.forEach((b, i) => (out[preamble + i] = encryptByte(key, b)));
  let p = preamble + headerSize;
  for (const f of files) {
    for (const b of f.data) out[p++] = encrypted ? encryptByte(key, b) : b;
  }
  return out;
}

const KEY = 87;
const A = { name: 'Terrain.inc', data: [0x41, 0x42, 0x43, 0x0d, 0x0a], time: 1234567 };
const B = { name: 'world.INC', data: [0x00, 0xff, 0x10] };

describe('decryptByte', () => {
  it('matches CResFile::Decryption', () => {
    expect(decryptByte(87, 0x00)).toBe(0x8a);
    expect(decryptByte(87, 0xff)).toBe(0x75);
  });

  it('inverts CResFile::Encryption for every key and byte', () => {
    for (const key of [0, 1, 87, 255]) {
      for (let b = 0; b < 256; b++) {
        expect(decryptByte(key, encryptByte(key, b))).toBe(b);
      }
    }
  });
});

describe('readResIndex', () => {
  it('reads the preamble and every entry, with absolute data offsets', () => {
    const bytes = buildPack({ key: KEY, encrypted: true, files: [A, B] });
    const pack = readResIndex(bytes, 'data.res');
    expect(pack.file).toBe('data.res');
    expect(pack.key).toBe(KEY);
    expect(pack.encrypted).toBe(true);
    expect(pack.version).toBe('RES0001');
    expect(pack.entries).toHaveLength(2);
    expect(pack.entries[0]).toMatchObject({ name: 'Terrain.inc', size: 5, time: 1234567 });
    expect(pack.entries[1]).toMatchObject({ name: 'world.INC', size: 3 });
    expect(pack.entries[1].offset).toBe(pack.entries[0].offset + 5);
    expect(pack.entries[1].offset + pack.entries[1].size).toBe(bytes.length);
  });

  it('decrypts the header even when the data is not encrypted', () => {
    const bytes = buildPack({ key: KEY, encrypted: false, files: [A] });
    const pack = readResIndex(bytes, 'plain.res');
    expect(pack.encrypted).toBe(false);
    expect(pack.entries.map((e) => e.name)).toEqual(['Terrain.inc']);
  });

  it('fails with a FormatError when the header size runs past the end of the file', () => {
    const bytes = buildPack({ key: KEY, encrypted: true, files: [A] });
    new DataView(bytes.buffer).setInt32(2, bytes.length, true);
    let error: unknown;
    try {
      readResIndex(bytes, 'bad.res');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(FormatError);
    expect((error as FormatError).file).toBe('bad.res');
    expect((error as FormatError).cppRef).toContain('file.cpp:106');
  });

  it('fails with a FormatError on a negative header size', () => {
    const bytes = buildPack({ key: KEY, encrypted: true, files: [A] });
    new DataView(bytes.buffer).setInt32(2, -1, true);
    expect(() => readResIndex(bytes, 'bad.res')).toThrow(FormatError);
    expect(() => readResIndex(bytes, 'bad.res')).toThrow('negative header size -1');
  });

  it('fails when header bytes are left over after the last entry', () => {
    const bytes = buildPack({ key: KEY, encrypted: true, files: [A] });
    // Claim one more entry byte in the header than the entries use: the data's first byte becomes header.
    new DataView(bytes.buffer).setInt32(2, new DataView(bytes.buffer).getInt32(2, true) + 1, true);
    expect(() => readResIndex(bytes, 'bad.res')).toThrow(FormatError);
    expect(() => readResIndex(bytes, 'bad.res')).toThrow('1 byte left');
  });

  it('reports the file offset of the failure, counted from the start of the pack', () => {
    const bytes = buildPack({ key: KEY, encrypted: true, files: [A, B] });
    // Declare 3 entries but supply 2: the third entry's name length is read past the header.
    const headerStart = 6;
    const countAt = headerStart + 7;
    const plainCount = encryptByte(KEY, 3);
    bytes[countAt] = plainCount;
    let error: unknown;
    try {
      readResIndex(bytes, 'bad.res');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(FormatError);
    const headerSize = new DataView(bytes.buffer).getInt32(2, true);
    expect((error as FormatError).offset).toBe(headerStart + headerSize);
  });
});

describe('readResFile', () => {
  it('decrypts entry bytes when the pack is encrypted', () => {
    const bytes = buildPack({ key: KEY, encrypted: true, files: [A, B] });
    const pack = readResIndex(bytes, 'data.res');
    expect(Array.from(readResFile(bytes, pack, pack.entries[0]))).toEqual(A.data);
    expect(Array.from(readResFile(bytes, pack, pack.entries[1]))).toEqual(B.data);
  });

  it('returns the bytes untouched when the pack is not encrypted', () => {
    const bytes = buildPack({ key: KEY, encrypted: false, files: [A, B] });
    const pack = readResIndex(bytes, 'plain.res');
    expect(Array.from(readResFile(bytes, pack, pack.entries[1]))).toEqual(B.data);
  });

  it('returns a copy, never a view of the pack bytes', () => {
    const bytes = buildPack({ key: KEY, encrypted: false, files: [A] });
    const pack = readResIndex(bytes, 'plain.res');
    const out = readResFile(bytes, pack, pack.entries[0]);
    out[0] = 0x7f;
    expect(bytes[pack.entries[0].offset]).toBe(A.data[0]);
  });

  it('fails with a FormatError when the entry lies outside the pack', () => {
    const bytes = buildPack({ key: KEY, encrypted: true, files: [A] });
    const pack = readResIndex(bytes, 'data.res');
    const outside = { ...pack.entries[0], size: bytes.length };
    let error: unknown;
    try {
      readResFile(bytes, pack, outside);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(FormatError);
    expect((error as FormatError).file).toBe('data.res');
    expect((error as FormatError).offset).toBe(outside.offset);
    expect((error as FormatError).cppRef).toContain('file.cpp:491');
  });
});

describe('ResPacks', () => {
  const first = buildPack({ key: KEY, encrypted: true, files: [A, B] });
  const second = buildPack({ key: 9, encrypted: false, files: [{ name: 'PropItem.txt', data: [1, 2, 3] }] });
  const packs = () =>
    ResPacks.fromBuffers([
      { file: 'data.res', bytes: first },
      { file: 'dataSub2.res', bytes: second },
    ]);

  it('finds names case-insensitively across packs', () => {
    const p = packs();
    expect(p.has('terrain.INC')).toBe(true);
    expect(p.has('WORLD.inc')).toBe(true);
    expect(p.has('propitem.txt')).toBe(true);
    expect(p.has('missing.inc')).toBe(false);
  });

  it('reads each name from the pack that holds it, decrypting per pack', () => {
    const p = packs();
    expect(Array.from(p.read('TERRAIN.INC'))).toEqual(A.data);
    expect(Array.from(p.read('propitem.TXT'))).toEqual([1, 2, 3]);
  });

  it('lists every name with the case stored in its pack, in pack order', () => {
    expect(packs().list()).toEqual(['Terrain.inc', 'world.INC', 'PropItem.txt']);
  });

  it('throws a FormatError naming an unknown resource', () => {
    expect(() => packs().read('missing.inc')).toThrow(FormatError);
    expect(() => packs().read('missing.inc')).toThrow('missing.inc');
  });

  it('throws when a name appears in two packs, ignoring case', () => {
    const dup = buildPack({ key: 3, encrypted: true, files: [{ name: 'TERRAIN.INC', data: [9] }] });
    const build = () =>
      ResPacks.fromBuffers([
        { file: 'data.res', bytes: first },
        { file: 'dataSub1.res', bytes: dup },
      ]);
    expect(build).toThrow(FormatError);
    expect(build).toThrow('data.res');
    expect(build).toThrow('dataSub1.res');
  });

  it('throws when a name appears twice in one pack', () => {
    const twice = buildPack({
      key: KEY,
      encrypted: true,
      files: [
        { name: 'a.inc', data: [1] },
        { name: 'A.INC', data: [2] },
      ],
    });
    expect(() => ResPacks.fromBuffers([{ file: 'data.res', bytes: twice }])).toThrow(FormatError);
  });
});
