// Object file (`Client/World/<World>/<World>.dyo`), copying CWorld::LoadObject (Source/_Common/WorldFile.cpp:297):
// `while( 1 ) { pObj = ReadObj( &file ); if( pObj == NULL ) break; ... }`, so the file is a plain run of ReadObj
// records (obj.ts) with no header and no count. Positions are the world's own (there is no tile to add), x and z
// already times OLD_MPU by CObj::Read.
//
// The loop ends when ReadObj returns NULL, which it does for a type DWORD it does not know. Every shipped `.dyo`
// (all 35 of them, a file of 4 bytes where there are no objects) ends with such a DWORD, 0xFFFFFFFF, as its last
// four bytes: that is the list's terminator, the one place the C++ stops. The C++ does not stop at the end of the
// file (the failed read would leave dwObjType unset), so a file without the terminator is not one the
// client or server can read; here it is a FormatError, as are an unknown type that is not 0xFFFFFFFF and bytes
// after the terminator, so that every byte is accounted for. (LoadObject is compiled only for the world server;
// the client never opens a `.dyo`.)

import { BinaryReader } from '../binary/BinaryReader';
import { readObjRecordOrFail } from './obj';
import type { WorldObjectRecord } from './obj';

const READER = 'readDyo';
const CPP_REF = 'Source/_Common/WorldFile.cpp:297 CWorld::LoadObject';

/** The type DWORD that ends the list of records. */
const END_OF_LIST = 0xffffffff;

/** Reads a whole `.dyo` file; `file` only labels errors. The terminator is not returned. */
export function readDyo(bytes: Uint8Array, file: string): WorldObjectRecord[] {
  const r = new BinaryReader(bytes, { file, reader: READER, cppRef: CPP_REF });
  const records: WorldObjectRecord[] = [];
  for (;;) {
    if (r.remaining() === 0) {
      r.fail('the file ends without the 0xFFFFFFFF that ends its list of objects');
    }
    const start = r.offset;
    if (r.u32() === END_OF_LIST) {
      r.expectEnd();
      return records;
    }
    r.offset = start;
    records.push(readObjRecordOrFail(r));
  }
}
