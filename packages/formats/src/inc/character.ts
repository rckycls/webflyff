// NPC definitions (`character.inc`, `character-etc.inc`, `character-school.inc`), copying
// CProject::LoadCharacter (Source/_Common/Project.cpp:2886). Each file is a list of
//
//   Key
//   {
//       setting { AddMenu( MMI_DIALOG ); SetImage ( IDS_CHARACTER_INC_000000 ); m_szDialog= "Key.txt"; ... }
//       SetName ( IDS_CHARACTER_INC_000001 );
//   }
//
// read token by token (CScript, so an `IDS_*` name gives the string-table text and `MMI_*`, `LANG_*` ... are
// #defines). The loader only looks at the words it knows, whatever the nesting (`{` and `}` anywhere count),
// and each known statement reads exactly the tokens its arguments take; everything else is skipped one token at
// a time. This keeps the key and the name and reads (and drops) the rest the way the C++ does, so a statement
// that spells a word of another statement in a string still reads right.
//
// Build flags of the client (Neuz/VersionCommon.h): `__VER` 15, `__RULE_0615`, `__NPC_BUFF`, `__CHIPI_DYO`,
// `__TELEPORTER` on; the language tests (`::GetLanguage()`) only decide what the C++ stores, which is dropped here.

import { ScriptReader } from '../script/cscript';

export interface CharacterDef {
  /** The first token of the block as written (`CHARACTER::m_szKey`; the C++ looks characters up in lower case). */
  key: string;
  /** `m_strName`: the text of `SetName ( IDS_... )` or `m_szName = ...`, the last one in the block; '' if none. */
  name: string;
}

const READER = 'readCharacterInc';
const CPP_REF = 'Source/_Common/Project.cpp:2886 CProject::LoadCharacter';

/**
 * What each statement reads after its name, one letter per read of the C++ (Project.cpp:2925-3195):
 * t = GetToken, n = GetNumber, f = GetFloat, l = CProject::GetLangScript (ProjectCmn.cpp:593: a token, then the
 * two tokens `)` and `;`). The statements that set the name, SetEquip, SetLang and randomItem are in the loop.
 */
const STATEMENTS: ReadonlyMap<string, string> = new Map([
  ['SetFigure', 'tntntntn'], // ( mover , hair mesh , hair colour , head mesh
  ['SetMusic', 'tn'], // ( bgm
  ['m_nStructure', 'tn'], // = structure
  ['m_szChar', 'tl'], // = ( image ) ;  (the C++ reads GetLangScript after one token)
  ['m_szDialog', 'tt'], // = "file"
  ['m_szDlgQuest', 'tt'], // = "file"
  ['SetImage', 'tl'], // ( image ) ;
  ['AddMenuLang', 'tntntnt'], // ( lang , sublang , menu )
  ['AddMenu', 'tnt'], // ( menu )
  ['AddVenderSlot', 'tnttt'], // ( slot , "name" )
  ['AddVendorSlot', 'tntl'], // ( slot , name ) ;
  ['AddVendorSlotLang', 'tntntntl'], // __RULE_0615: ( lang , sublang , slot , name ) ;
  // __RULE_0615: ( lang , sublang , slot , kind3 , job , min , max , total )
  ['AddVendorItemLang', 'tntntntntntntntnt'],
  ['AddVenderItem', 'tntntntntntnt'], // ( slot , kind3 , job , min , max , total )
  ['AddVendorItem', 'tntntntntntnt'],
  ['AddVenderItem2', 'tntnt'], // __VER >= 11: ( slot , item )
  ['AddVendorItem2', 'tntnt'],
  ['SetVenderType', 'tnt'], // ( type )
  ['SetBuffSkill', 'tntntntntnt'], // __NPC_BUFF: ( skill , level , min level , max level , ms )
  ['SetOutput', 'ttt'], // __CHIPI_DYO: ( TRUE | FALSE )
  ['AddTeleport', 'tftft'], // __VER >= 15: ( x , z )
]);

/**
 * Reads the text of a character script (see `decodeScript`), characters in file order. `strings` is the merged
 * string table (see `readStringTable`) that turns an `IDS_*` name into text.
 *
 * A key that appears twice is returned twice; the C++ keeps the later one (m_mapCharacter.SetAt, keyed by the
 * lower-cased key). `SetName` with an empty text gives ' ' (GetLangScript). A block the script ends inside
 * throws a FormatError (the C++ stops reading and keeps the half-read character), as does a name that is not
 * defined, or a statement that stops early.
 */
export function readCharacterInc(
  text: string,
  defines: ReadonlyMap<string, number>,
  strings: ReadonlyMap<string, string>,
  file = 'character.inc',
): CharacterDef[] {
  const r = new ScriptReader(text, defines, strings, { file, reader: READER, cppRef: CPP_REF });
  const characters: CharacterDef[] = [];

  // CProject::GetLangScript: a token (the text), then `)` and `;`; an empty text becomes a single space
  const langScript = (): string => {
    const value = r.token('a name').text;
    r.token("')'");
    r.token("';'");
    return value === '' ? ' ' : value;
  };

  let keyToken = r.tokenOrEnd(); // script.GetToken(); strName = script.Token
  while (keyToken !== undefined) {
    const character: CharacterDef = { key: keyToken.text, name: '' };
    characters.push(character);
    r.token("'{'"); // the C++ does not check it is one

    let block = 1;
    while (block > 0) {
      const statement = r.tokenOrEnd();
      if (statement === undefined) return r.fail(`the script ends inside the block of "${character.key}"`, keyToken);

      switch (statement.text) {
        case '{':
          block++;
          break;
        case '}':
          block--;
          break;
        case 'randomItem': {
          // CProject::InterpretRandomItem (Project.cpp:3200): up to the first `}`, which the block count never sees
          // (the C++ also tests for `;`, and reads the next token either way)
          r.token("'{'");
          let item = r.token();
          while (item.text[0] !== '}') item = r.token();
          break;
        }
        case 'SetEquip': {
          let at = r.token("'('");
          while (at.text[0] !== ')') {
            r.number('an equipment item'); // dwEquip
            at = r.token("',' or ')'");
          }
          break;
        }
        case 'm_szName':
          r.token("'='");
          character.name = r.token('a name').text;
          break;
        case 'SetName':
          r.token("'('");
          character.name = langScript();
          break;
        case 'SetLang': {
          r.token("'('");
          r.number('a language'); // wLang
          if (r.token("',' or ')'").text === ',') r.number('a sub-language');
          else r.token("')'");
          break;
        }
        default: {
          const pattern = STATEMENTS.get(statement.text);
          if (pattern !== undefined) {
            const what = `an argument of ${statement.text}`;
            for (const read of pattern) {
              if (read === 't') r.token(what);
              else if (read === 'n') r.number(what);
              else if (read === 'f') r.float(what);
              else langScript();
            }
          }
        }
      }
    }

    keyToken = r.tokenOrEnd(); // the next key, or the end of the script
  }

  return characters;
}
