// The party catalog (Piece 7 M4, [R §8.1], [R §8.3], [R §6.4]): `data/party.json`, from the resource files Neuz loads:
//
//   CProject::LoadPropItem( "propTroupeSkill.txt", &m_aPartySkill )  _Common/Project.cpp:463-467     the 8 skills, by id
//   CProject::LoadExpTable, "expParty"                                Project.cpp:3381-3392           the party's levels
//   CProject::LoadInvalidName                                         _Common/ProjectCmn.cpp:764-783  lower-case tokens
//   CProject::LoadAllowedLetter                                       ProjectCmn.cpp:806-841          each token's first byte
//
// The names of the two `_ENG` lists are `GetLangFileName( LANG_ENG, … )`'s (`IDS_LANG` "1", `Neuz/WinMain.rc:1828`).

import { readPartyExpTable, readPropItem, tokenize } from '@flyffweb/formats';
import type { ItemProp, WebParty, WebPartySkill } from '@flyffweb/formats';
import { listed } from '../util';

export const TROUPE_SKILL_FILE = 'propTroupeSkill.txt';
export const INVALID_NAME_FILE = 'InvalidName_ENG.inc';
export const LETTER_FILE = 'Letter_ENG.inc';

/** What the catalog takes from the stage. `iconKey` is the converted picture's key, or null when `Icon/` lacks it. */
export interface PartyEnv {
  defines: ReadonlyMap<string, number>;
  strings: ReadonlyMap<string, string>;
  iconKey(file: string): string | null;
  warn(source: string, message: string): void;
}

export interface PartyReading {
  text(name: string): string;
}

/** `=` reads as `NULL_ID`, which a kept column holds as -1. */
const orNull = (value: number): number | null => (value === -1 || value === 0xffffffff ? null : value);

/** `CScanner::GetToken` until `FINISHED`: the words of a list file. */
function tokens(text: string, file: string): string[] {
  return tokenize(text, file).map((token) => token.text).filter((word) => word.length > 0);
}

export function buildParty(env: PartyEnv, read: PartyReading): WebParty {
  // m_aPartySkill.SetAtGrow( dwID ): a later row with the same id replaces the earlier one
  const props = new Map<number, ItemProp>();
  for (const prop of readPropItem(read.text(TROUPE_SKILL_FILE), env.defines, env.strings, TROUPE_SKILL_FILE)) props.set(prop.id, prop);
  const noIcon: string[] = [];
  const skills = [...props.values()].sort((a, b) => a.id - b.id).map((prop): WebPartySkill => {
    const name = prop.name.trim();
    const icon = prop.icon === '' ? null : env.iconKey(prop.icon);
    if (prop.icon !== '' && icon === null) noIcon.push(`${prop.id} "${name}" (${prop.icon})`);
    return {
      id: prop.id, name, description: prop.command, icon, level: prop.reqLevel, points: prop.exp,
      skillTime: orNull(prop.skillTime), sfx: orNull(prop.sfxObj), sfx2: orNull(prop.sfxObj2),
    };
  });
  if (noIcon.length > 0) env.warn(TROUPE_SKILL_FILE, `no picture in Icon/ for ${listed(noIcon)}`);
  return {
    skills,
    exp: readPartyExpTable(read.text('ExpTable.inc'), 'ExpTable.inc'),
    invalidNames: tokens(read.text(INVALID_NAME_FILE), INVALID_NAME_FILE).map((word) => word.toLowerCase()),
    letters: tokens(read.text(LETTER_FILE), LETTER_FILE).map((word) => word[0]!).join(''),
  };
}
