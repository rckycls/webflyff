// String tables (`*.txt.txt` in the packs), copying CScript::LoadString (Source/_Common/Script.cpp:103), which
// CProject::LoadStrings (Source/_Common/ProjectCmn.cpp:605) runs over a list of files. A table is one line per
// string: a key that starts with `IDS` (`IDS_PROPMOVER_TXT_000002`), white space, and the rest of the line as
// the text (`Male`; empty for a string that has none). CScript::GetToken then replaces a name in any other
// script by its text, which is how propMover.txt, propItem.txt, character.inc and honorList.txt get their names.
//
// The text is not script: the C++ reads it with CScanner::GetLastFull (scanner.cpp:550), which takes everything
// up to the end of the line, so quotes, `//` and `/*` in it are plain characters. This reader therefore scans
// the lines itself instead of tokenizing the whole file.

import { FormatError } from '../errors';
import type { ResPacks } from '../res/ResPacks';
import { decodeScript } from '../script/scanner';

const READER = 'readStringTable';
const CPP_REF = 'Source/_Common/Script.cpp:103 CScript::LoadString';

const CR = 13;
const LF = 10;

/** iswhite (scanner.cpp:20): 0x01..0x20. */
const isWhite = (c: number): boolean => c > 0 && c <= 0x20;

/** CR, or LF (see readStringTable): where a line ends. */
const isLineEnd = (c: number): boolean => c === CR || c === LF;

/** The delimiters of scanner.cpp:27 (isdelim); the key ends at the first one. */
const DELIMITER = /[ !:;,+\-<>'/*%^=()&|"{}\t\r\n\0]/;

/** 1-based line of a character index. */
function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = text.indexOf('\n'); i >= 0 && i < index; i = text.indexOf('\n', i + 1)) line++;
  return line;
}

/**
 * Reads the text of a `*.txt.txt` file (see `decodeScript`) into key -> text.
 *
 * A key that appears twice keeps its first text (the C++ inserts into a std::map, logs "string error" and goes
 * on). The tables of several files are merged the same way: read them in the order of `CProject::LoadStrings` and
 * let the first one win. A line that does not start with an `IDS` key throws; the C++ logs "LoadString" and skips
 * to the next token.
 *
 * Differences from the C++: a line also ends at a bare LF (the C++ looks for CR only, and the shipped files are
 * CRLF); the text is cut at the end of the line, as there.
 */
export function readStringTable(text: string, file = '<string table>'): Map<string, string> {
  const table = new Map<string, string>();
  const n = text.length;
  let pos = 0;

  const fail = (message: string, at: number): never => {
    throw new FormatError(message, {
      file,
      offset: at,
      unit: 'char',
      line: lineAt(text, at),
      reader: READER,
      cppRef: CPP_REF,
    });
  };

  for (;;) {
    // CScanner::GetToken: skip white space and comments before the key
    for (;;) {
      while (pos < n && isWhite(text.charCodeAt(pos))) pos++;
      if (text.startsWith('//', pos)) {
        while (pos < n && !isLineEnd(text.charCodeAt(pos))) pos++;
      } else if (text.startsWith('/*', pos)) {
        const end = text.indexOf('*/', pos + 2);
        pos = end < 0 ? n : end + 2; // a comment that never closes ends the script
      } else {
        break;
      }
    }
    if (pos >= n) break;

    // the key: the token, which has to start with IDS (str.Find("IDS", 0) != 0)
    const start = pos;
    if (!text.startsWith('IDS', start)) {
      const shown = text.slice(start, start + 40).split(/[\r\n]/)[0];
      fail(`expected a key that starts with IDS, found "${shown}"`, start);
    }
    let end = start;
    while (end < n && !DELIMITER.test(text[end])) end++;
    const key = text.slice(start, end);

    // CScanner::GetLastFull: skip the white space after the key, take the rest of the line, trim its end
    pos = end;
    while (pos < n && isWhite(text.charCodeAt(pos)) && !isLineEnd(text.charCodeAt(pos))) pos++;
    let stop = pos;
    while (stop < n && !isLineEnd(text.charCodeAt(stop))) stop++;
    let last = stop;
    while (last > pos && isWhite(text.charCodeAt(last - 1))) last--;

    if (!table.has(key)) table.set(key, text.slice(pos, last));
    pos = stop;
  }

  return table;
}

/**
 * The string tables CProject::LoadStrings (ProjectCmn.cpp:605) reads that sit in the resource packs, in its
 * order. (It also lists files in the Client and World folders: those are loose files of the client folder, not in
 * the packs, and the readers here do not need them.) `lordskill` is read for `__VER >= 12`, `honorList` for
 * `__VER >= 13`.
 */
const STRING_FILES: readonly string[] = [
  'character.txt.txt',
  'character-etc.txt.txt',
  'character-school.txt.txt',
  'etc.txt.txt',
  'propCtrl.txt.txt',
  'propItem.txt.txt',
  'propItemEtc.txt.txt',
  'propKarma.txt.txt',
  'propMotion.txt.txt',
  'propMover.txt.txt',
  'propQuest.txt.txt',
  'propQuest-DungeonandPK.txt.txt',
  'propQuest-RequestBox2.txt.txt',
  'propQuest-RequestBox.txt.txt',
  'propQuest-Scenario.txt.txt',
  'propSkill.txt.txt',
  'propTroupeSkill.txt.txt',
  'resData.txt.txt',
  'textClient.txt.txt',
  'textEmotion.txt.txt',
  'world.txt.txt',
  'lordskill.txt.txt',
  'honorList.txt.txt',
];

/**
 * The string table the game loaders read names through (CProject::LoadStrings, ProjectCmn.cpp:605): the tables
 * of STRING_FILES that the packs hold, merged into one map in that order, a key keeping its first text. A file
 * the packs lack is skipped, as a CScript::Load that fails is. Each file is decoded by its own encoding.
 */
export function loadStrings(packs: ResPacks): Map<string, string> {
  const strings = new Map<string, string>();
  for (const name of STRING_FILES) {
    if (!packs.has(name)) continue;
    for (const [key, text] of readStringTable(decodeScript(packs.read(name)), name)) {
      if (!strings.has(key)) strings.set(key, text);
    }
  }
  return strings;
}
