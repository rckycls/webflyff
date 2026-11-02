// The region rows of a world's `.rgn` file, as the client keeps them in `CWorld::m_aRegion`: CWorld::LoadRegion and
// ReadRegion (Source/_Common/WorldFile.cpp:775-809, :413-553). The music of the world comes from them
// (CWndWorld::Process, Source/_Interface/WndWorld.cpp:8562-8689). A plain text file read word by word (CScript):
//
//   region3 type index x y z attribute music direct "script" "sound" teleWorld tx ty tz left top right bottom "key"
//           targetKey item count minLevel maxLevel quest questFlag job gender party guild chaoKey
//   title 0|1 [{ IDS }]   desc 0|1 [{ IDS }]       region2 and region3 (region2 without the eleven region3 numbers)
//   region ... targetKey 0|1 [{ IDS }]             the old format: its description straight after the target key
//
// LoadRegion passes over every other word one at a time (the respawn rows are ReadRespawn's, which the music does not
// need). Rows with the index RI_BEGIN, RI_REVIVAL or RI_STRUCTURE stay out of m_aRegion (:538-550); the rest keep file
// order, at most MAX_REGIONELEM (Region.h:65, whose overflow the compiled-out ASSERT does not stop).

import { ScriptReader } from '../script/cscript';

/** One row of `m_aRegion`: what the music needs of REGIONELEM (Region.h:27-46). */
export interface RegionRow {
  /** The `RI_*` index. */
  index: number;
  /** `m_dwAttribute`, `RA_*` bits (RA_INN 0x80, Resource/define.h:143). */
  attribute: number;
  /** `m_dwIdMusic`: a `BGM_*` id, 0 for none. */
  music: number;
  /** `m_bDirectMusic`: the value 1. */
  direct: boolean;
  /** `m_rect`: left, top, right, bottom in world x and z. */
  rect: [number, number, number, number];
}

/** RI_BEGIN, RI_REVIVAL, RI_STRUCTURE (Resource/defineObj.h:1984-1986). */
const LEFT_OUT: ReadonlySet<number> = new Set([12, 13, 14]);
/** MAX_REGIONELEM (Region.h:65). */
const MAX_ROWS = 256;

const READER = 'readRegions';
const CPP_REF = 'Source/_Common/WorldFile.cpp:413-553,775-809 CWorld::ReadRegion, LoadRegion';

/** Reads a `.rgn` file into its region rows. */
export function readRegions(text: string, file: string): RegionRow[] {
  const r = new ScriptReader(text, new Map(), new Map(), { file, reader: READER, cppRef: CPP_REF });
  const rows: RegionRow[] = [];
  /** `GetNumber() 0|1`, then `{ text }` when it is not 0. */
  const block = (what: string): void => {
    if (r.number(what) !== 0) {
      r.token('{');
      r.token(`the ${what} text`);
      r.token('}');
    }
  };
  for (let tok = r.tokenOrEnd(); tok !== undefined; tok = r.tokenOrEnd()) {
    if (tok.text !== 'region' && tok.text !== 'region2' && tok.text !== 'region3') continue;
    const newFormat = tok.text !== 'region';
    r.number('type');
    const index = r.number('index');
    r.float('x'); r.float('y'); r.float('z');
    const attribute = r.number('attribute');
    const music = r.number('music');
    const direct = r.number('direct music') === 1;
    r.token('script'); r.token('sound');
    r.number('teleport world');
    r.float('teleport x'); r.float('teleport y'); r.float('teleport z');
    const rect: [number, number, number, number] = [r.number('left'), r.number('top'), r.number('right'), r.number('bottom')];
    r.token('key');
    r.number('target key');
    if (tok.text === 'region3') for (let i = 0; i < 11; i++) r.number('a region3 condition');
    if (newFormat) {
      r.token('title'); block('title');
      r.token('desc'); block('desc');
    } else {
      block('description');
    }
    if (!LEFT_OUT.has(index) && rows.length < MAX_ROWS) rows.push({ index, attribute, music, direct, rect });
  }
  return rows;
}
