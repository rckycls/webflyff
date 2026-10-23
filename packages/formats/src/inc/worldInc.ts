// World definitions (`World.inc`), copying CWorldMng::LoadScript (Source/_Common/worldmng.cpp:302). CProject::Load
// reads it from the `world "World.inc"` line of the project script (Project.cpp:539). The file is a list of
//
//   WI_WORLD_MADRIGAL "WdMadrigal"                                  // world id, folder under World/
//   WI_WORLD_MADRIGAL SetTitle ( IDS_WORLD_INC_000001 );            // the name shown for it, after all the worlds
//
// `WI_*` are the #defines of defineWorld.h. A character carries the id of the world it is in, and Neuz opens it by that
// id: CWorldMng::Open (worldmng.cpp:206) takes `m_szFileName` of the WORLD with that id and opens the folder
// `World\<m_szFileName>`, whose `.wld` has the same name (Open :274, CWorld::OpenWorld, WorldFile.cpp:32).

import { ScriptReader } from '../script/cscript';

/** One WORLD of CWorldMng (worldmng.h:8). */
export interface WorldDef {
  /** `WORLD::m_dwId`: the `WI_*` value, the world id the server sends. */
  id: number;
  /** `WORLD::m_szFileName` as World.inc gives it: the world's folder under `World/`, in the case the file writes. */
  fileName: string;
}

const READER = 'readWorldInc';
const CPP_REF = 'Source/_Common/worldmng.cpp:302 CWorldMng::LoadScript';

/**
 * Reads the text of `World.inc` (see `decodeScript`) into the worlds it defines, in file order. `defines` is the
 * #define table (see `loadDefines`) that turns each `WI_*` into its id.
 *
 * The C++ reads an id with `GetNumber`, then one token: `SetTitle` begins a title block (read as `(`, then the
 * title, `)` and `;`, and dropped here, as the world name is not needed), anything else is the file name of a world
 * with that id. It stops where an id should be and the last token read starts with `}` (its brace count), or the
 * script has ended.
 *
 * A repeated id is returned each time; the C++ keeps the last (CFixedArray::SetAtGrow overwrites the slot). A world
 * with an empty file name is returned too: it is in the array, but WORLD::IsValid is false for it. Where the C++
 * logs and carries on, this throws a FormatError: a name that is not defined where an id is read (it reads 0 and logs
 * "Not Found"), a negative id (SetAtGrow would write before its array), a SetTitle for an id with no world (it logs
 * "Load WorldName" and then reads the rest of the block as worlds), and a script that ends inside a world or a title.
 */
export function readWorldInc(
  text: string,
  defines: ReadonlyMap<string, number>,
  file = 'World.inc',
): WorldDef[] {
  // the title text is never used, so no string table: an IDS_* name stays a name, and GetToken reads it all the same
  const r = new ScriptReader(text, defines, new Map(), { file, reader: READER, cppRef: CPP_REF });
  const worlds: WorldDef[] = [];
  const defined = new Set<number>(); // the slots of m_aWorld that are set

  let id = r.numberOrEnd('a world id'); // scanner.GetNumber() // folder or id
  while (id !== undefined && r.lastToken()?.text[0] !== '}') {
    if (id < 0) r.fail(`the world id ${id} is negative`);
    const token = r.token('a world file name or SetTitle'); // scanner.GetToken() // { or filename

    if (token.text === 'SetTitle') {
      if (!defined.has(id)) {
        r.fail(`SetTitle for the world id ${id}, which has no world (CWorldMng::LoadScript -> Load WorldName)`, token);
      }
      r.token("'('"); // scanner.GetToken(); // (
      r.token('the world title'); // prj.GetLangScript( scanner ): the title,
      r.token("')'"); //                                              )
      r.token("';'"); //                                              and ;
    } else {
      // the C++ goes back to the id (GoMark), reads it again and then the file name; the same two reads
      worlds.push({ id, fileName: token.text });
      defined.add(id);
    }

    id = r.numberOrEnd('a world id'); // scanner.SetMark(); scanner.GetNumber() // texture fileName
  }

  return worlds;
}
