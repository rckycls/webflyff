// A set of `.res` packs searched by resource name, like the client's CResFile::m_mapResource
// (Source/_Common/file.cpp:106, CResFile::AddResource, which lower-cases every name with strlwr).

import { FormatError } from '../errors';
import { readResFile, readResIndex } from './res';
import type { ResEntry, ResPack } from './res';

const READER = 'ResPacks';
const CPP_REF = 'Source/_Common/file.cpp:106 CResFile::AddResource (m_mapResource)';

interface Located {
  pack: ResPack;
  bytes: Uint8Array;
  entry: ResEntry;
}

/** ASCII-only lower-casing, like C `strlwr` in the "C" locale. */
function key(name: string): string {
  return name.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

export class ResPacks {
  private constructor(private readonly byName: Map<string, Located>) {}

  /** Indexes every pack. A name that appears twice, within a pack or across packs, throws. */
  static fromBuffers(packs: { file: string; bytes: Uint8Array }[]): ResPacks {
    const byName = new Map<string, Located>();
    for (const { file, bytes } of packs) {
      const pack = readResIndex(bytes, file);
      for (const entry of pack.entries) {
        const k = key(entry.name);
        const existing = byName.get(k);
        if (existing !== undefined) {
          throw new FormatError(
            `resource "${entry.name}" is also in ${existing.pack.file} as "${existing.entry.name}"`,
            { file, offset: entry.offset, reader: READER, cppRef: CPP_REF },
          );
        }
        byName.set(k, { pack, bytes, entry });
      }
    }
    return new ResPacks(byName);
  }

  has(name: string): boolean {
    return this.byName.has(key(name));
  }

  /** A decrypted copy of the named file. Throws a FormatError for an unknown name. */
  read(name: string): Uint8Array {
    const found = this.byName.get(key(name));
    if (found === undefined) {
      throw new FormatError(`resource "${name}" is not in any loaded pack`, {
        file: name,
        offset: 0,
        reader: READER,
        cppRef: CPP_REF,
      });
    }
    return readResFile(found.bytes, found.pack, found.entry);
  }

  /** Every name, as stored in its pack (case preserved), in pack order then index order. */
  list(): string[] {
    return Array.from(this.byName.values(), (l) => l.entry.name);
  }
}
