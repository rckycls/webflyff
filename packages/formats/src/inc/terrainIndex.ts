// Terrain texture index (`Terrain.inc`, a UTF-16LE script in data.res), copying CTerrainMng::LoadScript
// (Source/_Common/TerrainMng.cpp:75). Entries are read in the C++ field order (:164-181):
//
//   id  count  "texture file"  block  "sound file"
//
// The file is a list of folders, and a folder is `"name" count { entries }`. The `water` folder holds `"name"
// count { entries }` lists of its own, one per animated water texture, and `count` on the `water` folder header
// is the number of lists (CTerrainMng::m_nWaterFrame, :94). One entry may follow the last folder
// (`0 0 "default.dds" 0 ""`). The C++ tells entries and headers apart by looking ahead and rewinding
// (SetMark / GoMark); this reads the same layout by its shape: a header starts with a string, an entry with a
// number. On a file laid out as above the two give the same textures. A file that does not fit the layout throws
// here, where the C++ would read on and misparse it.

import { FormatError } from '../errors';
import { TokenStream, tokenize } from '../script/scanner';

export interface TerrainTexture {
  id: number;
  /** File name as written in the script, e.g. `Bahara_Rockwall01.dds`. The client looks it up in World/TextureMid. */
  file: string;
  /** The entry's `count` column, when it is not 0. (Every entry of the shipped Terrain.inc has 0.) */
  frames?: number;
}

const READER = 'readTerrainIndex';
const CPP_REF = 'Source/_Common/TerrainMng.cpp:75 CTerrainMng::LoadScript';

/**
 * Reads the text of `Terrain.inc` (see `decodeScript`). Returns every texture by id (a later entry with the same
 * id replaces an earlier one, as `m_aTerrain[i]` is overwritten) and `waterFrames`, the count on the `water`
 * folder header (0 when no folder has one). The block flag and sound file of each entry are read and dropped.
 *
 * The C++ reads this file with CScanner, which has no defines; `defines` only lets an id or count be written as a
 * define name. A water list that holds a different number of entries than its header says throws.
 */
export function readTerrainIndex(
  text: string,
  defines: ReadonlyMap<string, number>,
  file = 'Terrain.inc',
): { waterFrames: number; textures: Map<number, TerrainTexture> } {
  const ts = new TokenStream(tokenize(text, file), defines, file);
  const textures = new Map<number, TerrainTexture>();
  let waterFrames = 0;

  const fail = (message: string, line: number, offset: number): never => {
    throw new FormatError(message, { file, offset, unit: 'char', line, reader: READER, cppRef: CPP_REF });
  };

  const entry = (): void => {
    const id = ts.number();
    const frames = ts.number();
    const texture: TerrainTexture = { id, file: ts.string() };
    if (frames !== 0) texture.frames = frames;
    ts.number(); // block flag (TERRAIN::m_bBlock)
    ts.string(); // sound file
    textures.set(id, texture);
  };

  /**
   * Reads entries and headers up to the `}` that closes the block, or up to the end of the script at depth 1
   * (the whole file). Depth 2 is the inside of a folder, depth 3 the inside of a water list.
   * Returns how many entries sit directly in this block.
   */
  const block = (depth: 1 | 2 | 3): number => {
    let entries = 0;
    while (depth === 1 ? !ts.done() : !ts.accept('}')) {
      const head = ts.peek();
      if (head === undefined) {
        ts.expect('}'); // the script ends inside a block: throws, naming the brace that is missing
        break;
      }
      if (head.kind !== 'string') {
        entry();
        entries++;
        continue;
      }

      if (depth === 3) fail(`unexpected header "${head.text}" inside a water list`, head.line, head.offset);
      const name = ts.string();
      const count = ts.number();
      ts.expect('{');
      if (depth === 1) {
        if (count !== 0) waterFrames = count;
        block(2);
      } else {
        const read = block(3);
        if (count !== 0 && read !== count) {
          fail(`water list "${name}" has ${read} textures, its header says ${count}`, head.line, head.offset);
        }
      }
    }
    return entries;
  };

  block(1);
  return { waterFrames, textures };
}
