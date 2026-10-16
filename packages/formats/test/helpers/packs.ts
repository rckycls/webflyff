/** CResFile::Encryption (file.h:78): the inverse of decryptByte, used to build synthetic packs. */
export function encryptByte(key: number, b: number): number {
  const swapped = ((b << 4) | (b >> 4)) & 0xff;
  return (~swapped ^ key) & 0xff;
}

export interface TestFile {
  name: string;
  data: number[];
  time?: number;
}

/**
 * Builds a pack the way AddResource reads it: key u8, encrypted u8, headerSize i32, then the
 * header (always encrypted), then the file data (encrypted only when `encrypted`).
 */
export function buildPack(opts: {
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
