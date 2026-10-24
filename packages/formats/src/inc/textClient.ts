// The client text table (`textClient.inc` with `textClient.txt.txt`), copying CProject::LoadText
// (Source/_Common/ProjectCmn.cpp:543). A list of blocks read token by token (CScript):
//
//   TID_GAME_DEATH 0xff00ffff
//   {
//       IDS_TEXTCLIENT_INC_000156
//   }
//
// The name is a `TID_*` define (defineText.h, which numbers it: TID_GAME_DEATH is 602), the number after it is the
// text's colour (ARGB), and the word in the braces is a key of the string table `textClient.txt.txt`, which
// CScript::GetToken replaces with the text. Neuz asks for a text by number (`GETTEXT(TID_GAME_DEATH)`,
// `GETTEXTCOLOR`); here the table is by name, so the numbers are not needed.

import { ScriptReader } from '../script/cscript';

export interface TextEntry {
  /** The `TID_*` name of the block, as written. */
  id: string;
  /** The text: the string-table text of the block's key, with its double quotes taken out. */
  text: string;
  /** The text's colour: ARGB, unsigned (`0xff00ffff` is 4278255615). */
  color: number;
}

const READER = 'readTextClient';
const CPP_REF = 'Source/_Common/ProjectCmn.cpp:543 CProject::LoadText';

/**
 * Reads the text of `textClient.inc` (see `decodeScript`) into `TID_*` name -> text and colour, in file order.
 * `strings` is the merged string table (see `loadStrings`, which holds `textClient.txt.txt`) that turns the
 * `IDS_*` key of a block into its text.
 *
 * Like the C++, a block whose text comes out empty is not an entry (`GetText` gives "" and `GetTextColor` 0 for
 * it), and a repeated name keeps the last block (the C++ keeps the last block of a number; the names here are
 * what the numbers stand for, so two names of one number are two entries). The double quotes are taken out of the
 * text (`str.Replace("\"", "")`). A name that is not an identifier, a colour that is not a number, a block
 * without its braces and an `IDS_*` key the table lacks throw a FormatError (the C++ skips the block, reads 0, or
 * takes the key itself for the text).
 */
export function readTextClient(
  inc: string,
  strings: ReadonlyMap<string, string>,
  file = 'textClient.inc',
): Map<string, TextEntry> {
  // no defines: the TID_ name stays a name (the C++ turns it into its number, which this table has no use for)
  const r = new ScriptReader(inc, new Map(), strings, { file, reader: READER, cppRef: CPP_REF });
  const texts = new Map<string, TextEntry>();

  for (let name = r.tokenOrEnd(); name !== undefined; name = r.tokenOrEnd()) { // tok == FINISHED ends the table
    if (name.kind !== 'ident') r.fail(`expected a TID_ name, found ${name.kind} "${name.text}"`, name);
    const id = name.text;

    const color = r.number(`the colour of ${id}`) >>> 0; // GetNumber is an int, the colour a DWORD
    const open = r.token(`"{" after ${id}`);
    if (open.text !== '{') r.fail(`expected "{" after the colour of ${id}, found "${open.text}"`, open);

    const word = r.token(`the text of ${id}`);
    // an IDS key the table lacks stays a word: the C++ takes the key for the text
    if (word.kind === 'ident' && word.text.startsWith('IDS')) r.fail(`${word.text} (the text of ${id}) is not in the string table`, word);
    const text = word.text.replace(/"/g, '');

    const close = r.token(`"}" after the text of ${id}`);
    if (close.text !== '}') r.fail(`expected "}" after the text of ${id}, found "${close.text}"`, close);

    if (text === '') texts.delete(id);
    else texts.set(id, { id, text, color });
  }

  return texts;
}
