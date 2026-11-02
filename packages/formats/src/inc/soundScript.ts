// The id → file scripts of the sound effects (`Client/sound.inc`) and the music (`Music/default.bgm`), which share one
// reader in the C++: CSoundManager::LoadScript (Source/_DirectX/dsutil.cpp:39-60) and CMusicMng::LoadScript
// (Source/_Common/Music2.cpp:195-213). A plain text file read pair by pair (CScript):
//
//   SND_INF_CLICK   "InfClick.wav"              an id (a define name or a number), then the file name as written
//   BGM_TITLE       "music\BgmDu1Mystery.ogg"   (default.bgm's paths are the client folder's, sound.inc's Sound\'s)
//
// `m_aMusic.SetAtGrow( id, ... )`: the last entry of an id wins. A name that is not a define logs "Not Found" and reads
// as 0 (CScanner::GetNumber); id 0 never plays (dsutil.cpp:27, Music2.cpp:103), nor does an empty name
// (dsutil.cpp:71, Music2.cpp:108).

import { atoi, ScriptReader } from '../script/cscript';
import { parseHexToken } from '../script/scanner';
import type { ScriptToken } from '../script/cscript';

const READER = 'readIdFileScript';
const CPP_REF = 'Source/_DirectX/dsutil.cpp:39-60 CSoundManager::LoadScript, Source/_Common/Music2.cpp:195-213';

/** The id of an entry as GetNumber reads it, or 0 for a name that is not a define. */
function idOf(tok: ScriptToken): number {
  if (tok.value !== undefined) return tok.value;
  if (tok.kind !== 'number') return 0;
  return tok.text.startsWith('0x') ? (parseHexToken(tok.text) ?? 0) | 0 : atoi(tok.text);
}

/** Reads a `sound.inc` or a `default.bgm` into its ids' file names: ids above 0 with a name, the last entry winning. */
export function readIdFileScript(text: string, defines: ReadonlyMap<string, number>, file: string): Map<number, string> {
  const r = new ScriptReader(text, defines, new Map(), { file, reader: READER, cppRef: CPP_REF });
  const entries = new Map<number, string>();
  for (let tok = r.tokenOrEnd(); tok !== undefined; tok = r.tokenOrEnd()) {
    const id = idOf(tok);
    const name = r.token('the file name').text;
    entries.set(id, name);
  }
  for (const [id, name] of entries) if (id <= 0 || name === '') entries.delete(id);
  return entries;
}
