// Reader for FlyFF `.res` resource packs (Client/data.res, dataSub1.res, dataSub2.res).
//
// Copies two C++ functions in Source/_Common:
//   - CResFile::AddResource, file.cpp:106  (the pack index)
//   - CResFile::Read,        file.cpp:470-520 (per-byte decryption of a file; the loops are at 491 and 510)
//   - CResFile::Decryption,  file.h:83     (the one-byte cipher)
//
// Pack layout (all little-endian):
//   key u8, encrypted u8 (a C++ bool), headerSize i32,
//   then `headerSize` header bytes, ALWAYS decrypted with `key` (even when `encrypted` is 0), holding
//     version[7], fileCount i16, then per file: nameLen i16, name[nameLen], size i32, time i32, offset i32.
//   `offset` is absolute from the start of the pack file. File data is decrypted per byte only when `encrypted`.

import { FormatError } from '../errors';
import { BinaryReader } from '../binary/BinaryReader';

const INDEX_READER = 'readResIndex';
const INDEX_CPP_REF = 'Source/_Common/file.cpp:106 CResFile::AddResource';
const FILE_READER = 'readResFile';
const FILE_CPP_REF = 'Source/_Common/file.cpp:491 CResFile::Read';

/** key (1) + encrypted flag (1) + header size (4): the unencrypted bytes before the header. */
const PREAMBLE_SIZE = 6;

export interface ResEntry {
  /** Name as stored in the pack (case preserved). */
  name: string;
  size: number;
  /** Absolute byte offset of the file's data from the start of the pack. */
  offset: number;
  /** The `time_` field of the index (a 32-bit value; not interpreted). */
  time: number;
}

export interface ResPack {
  /** Path or name of the pack, as given to `readResIndex`; used in error messages. */
  file: string;
  key: number;
  encrypted: boolean;
  version: string;
  entries: ResEntry[];
}

/** CResFile::Decryption (file.h:83): `d = ~b ^ key` as a byte, then swap its nibbles. */
export function decryptByte(key: number, b: number): number {
  const d = (~b ^ key) & 0xff;
  return ((d << 4) | (d >> 4)) & 0xff;
}

/** Reads a pack's index. Fails unless the header is consumed to its last byte. */
export function readResIndex(bytes: Uint8Array, file: string): ResPack {
  const ctx = { file, reader: INDEX_READER, cppRef: INDEX_CPP_REF };

  const preamble = new BinaryReader(bytes, ctx);
  const key = preamble.u8();
  const encrypted = preamble.u8() !== 0;
  const headerSize = preamble.i32();
  if (headerSize < 0) preamble.fail(`negative header size ${headerSize}`);
  preamble.skip(headerSize); // fails with a FormatError if the header runs past the end of the file

  // Decrypt the header into a buffer that keeps the preamble in place, so every offset in an error
  // is a byte offset into the pack file.
  const plain = new Uint8Array(PREAMBLE_SIZE + headerSize);
  plain.set(bytes.subarray(0, PREAMBLE_SIZE));
  for (let i = PREAMBLE_SIZE; i < plain.length; i++) {
    plain[i] = decryptByte(key, bytes[i]);
  }

  const r = new BinaryReader(plain, ctx);
  r.offset = PREAMBLE_SIZE;
  const version = r.fixedString(7);
  const count = r.i16();
  if (count < 0) r.fail(`negative file count ${count}`);

  const entries: ResEntry[] = [];
  for (let i = 0; i < count; i++) {
    const nameLength = r.i16();
    if (nameLength < 0) r.fail(`negative name length ${nameLength}`);
    const name = r.fixedString(nameLength);
    const size = r.i32();
    const time = r.i32();
    const offset = r.i32();
    if (size < 0 || offset < 0) r.fail(`entry "${name}" has negative size ${size} or offset ${offset}`);
    entries.push({ name, size, offset, time });
  }
  r.expectEnd();

  return { file, key, encrypted, version, entries };
}

/**
 * Returns a copy of one entry's bytes, decrypted per byte when the pack is encrypted.
 * `bytes` must be the same pack that `pack` was read from.
 */
export function readResFile(bytes: Uint8Array, pack: ResPack, entry: ResEntry): Uint8Array {
  const end = entry.offset + entry.size;
  if (entry.offset < 0 || entry.size < 0 || end > bytes.byteLength) {
    throw new FormatError(
      `entry "${entry.name}" (offset ${entry.offset}, size ${entry.size}) lies outside the pack (${bytes.byteLength} bytes)`,
      { file: pack.file, offset: entry.offset, reader: FILE_READER, cppRef: FILE_CPP_REF },
    );
  }
  const out = new Uint8Array(entry.size);
  if (pack.encrypted) {
    for (let i = 0; i < entry.size; i++) {
      out[i] = decryptByte(pack.key, bytes[entry.offset + i]);
    }
  } else {
    out.set(bytes.subarray(entry.offset, end));
  }
  return out;
}
