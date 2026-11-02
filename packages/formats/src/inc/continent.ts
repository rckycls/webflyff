// The continent outlines of Madrigal (`World/WdMadrigal/WdMadrigal.wld.cnt`), copying CContinent::Init
// (Source/_Common/Continent.cpp:29-104, `__USING_CONTINENT_DATA`). A plain text file read word by word (CScript):
//
//   Continent BEGIN          empties the outline
//   C_useRealData 1          0 skips every word up to the block's END: a block for the client's looks only
//   C_name Flaris            (and C_useEnvir, C_ambient, C_sky ...: words the loop does not know, skipped)
//   C_id 1                   the continent's number (ContinentDef.h: CONT_FLARIS ...)
//   TOWN 1                   the outline is a town's (m_MapContTown), not a continent's (m_MapCont)
//   VERTEX 6159 0 3407       x y z: a corner, kept as the integers (x, z), the height left out
//   Continent END            closes the outline with its first corner and keeps it under its id
//
// The C++ keeps each kind in a `std::map<BYTE, vector<CPoint>>`: ids in ascending order (the order `GetContinent`
// tests them in), and the first outline of an id wins (`insert`; the assert of :68 is compiled out by NDEBUG).

import { ScriptReader } from '../script/cscript';

export interface ContinentPolygon {
  /** `C_id`, as the map's BYTE key holds it. */
  id: number;
  /** A town's outline (`TOWN 1`), kept apart from the continents'. */
  town: boolean;
  /** The corners `[x, z]` as `CPoint( (int)x, (int)z )`, the first repeated at the end. */
  ring: Array<[number, number]>;
}

const READER = 'readContinents';
const CPP_REF = 'Source/_Common/Continent.cpp:29-104 CContinent::Init';

/**
 * Reads the text of a `.wld.cnt` into its outlines: the continents', then the towns', each in ascending id. A word cut
 * short (a `VERTEX` with fewer than three numbers, an `END` that never comes after `C_useRealData 0`) throws a
 * FormatError; the C++ reads 0 there or runs to the end of the file.
 */
export function readContinents(text: string, file: string): ContinentPolygon[] {
  const r = new ScriptReader(text, new Map(), new Map(), { file, reader: READER, cppRef: CPP_REF });
  const kept: Array<Map<number, Array<[number, number]>>> = [new Map(), new Map()];
  let ring: Array<[number, number]> = [];
  let id = 0;
  let town = false;
  for (let tok = r.tokenOrEnd(); tok !== undefined; tok = r.tokenOrEnd()) {
    switch (tok.text) {
      case 'Continent': {
        const what = r.token('BEGIN or END after Continent').text;
        if (what === 'BEGIN') {
          ring = [];
        } else if (what === 'END') {
          if (ring.length > 0) ring.push(ring[0]!);
          const into = kept[town ? 1 : 0]!;
          const key = id & 0xff; // the map's BYTE key
          if (!into.has(key)) into.set(key, ring);
          town = false;
        }
        break;
      }
      case 'C_id':
        id = r.number('C_id');
        break;
      case 'VERTEX': {
        const x = Math.fround(r.float('VERTEX x'));
        r.float('VERTEX y');
        const z = Math.fround(r.float('VERTEX z'));
        ring.push([Math.trunc(x), Math.trunc(z)]);
        break;
      }
      case 'TOWN':
        town = r.number('TOWN') !== 0;
        break;
      case 'C_useRealData':
        if (r.number('C_useRealData') === 0) {
          // do { GetToken() } while( Token != "END" ): the block's own `Continent END`
          while (r.token('END of a skipped block').text !== 'END');
        }
        break;
      default:
        break;
    }
  }
  const out = (map: Map<number, Array<[number, number]>>, isTown: boolean): ContinentPolygon[] =>
    [...map].sort((a, b) => a[0] - b[0]).map(([key, points]) => ({ id: key, town: isTown, ring: points }));
  return [...out(kept[0]!, false), ...out(kept[1]!, true)];
}
