// The party catalog (Piece 7 M4, [R §8.1], [R §8.3], [R §6.4]): `data/party.json`, written by the converter's
// game-data stage. It is optional: without it the party works and its skills are not offered.
//
//   CProject::LoadPropItem( "propTroupeSkill.txt", &m_aPartySkill )   _Common/Project.cpp:463-467   the 8 party skills
//   CProject::LoadExpTable, "expParty"                                 _Common/Project.cpp:3381-3392 the party's levels
//   CProject::LoadInvalidName, IsInvalidName                           _Common/ProjectCmn.cpp:764-803 the banned words
//   CProject::LoadAllowedLetter, IsAllowedLetter                       _Common/ProjectCmn.cpp:806-874 the letters allowed

export const PARTY_KEY = 'data/party.json';

/** A party skill (`prj.GetPartySkill( id )`): a row of `propTroupeSkill.txt`. */
export interface WebPartySkill {
  /** `dwID`, `ST_*` (`Resource/defineSkill.h:8-16`): 1 Call to 8 Gift Box; the shortcut's `m_dwId`. */
  id: number;
  name: string;
  /** `szCommand`: the tooltip's description. */
  description: string;
  /** `szIcon`'s key under the converted `Icon/`, or null when the file is not in the client. */
  icon: string | null;
  /** `dwReqDisLV`: the party level the skill needs. */
  level: number;
  /** `dwExp`: the party points it costs. */
  points: number;
  /** `dwSkillTime`: a mode's length in ms; null for `=` (Call, Blitz, Retreat). */
  skillTime: number | null;
  /** `dwSfxObj`, `dwSfxObj2`: its effects, `XI_*`; null for `=`. */
  sfx: number | null;
  sfx2: number | null;
}

export interface WebParty {
  /** The 8 skills, by id. */
  skills: WebPartySkill[];
  /** `expParty`, rows 0 to 9 (`m_aExpParty[MAX_PARTYLEVEL]`): row L is the EXP from level L to L + 1 and its points. */
  exp: Array<{ exp: number; point: number }>;
  /** `InvalidName_ENG.inc`, lower-case: a party name holding one of them is refused. */
  invalidNames: string[];
  /** `Letter_ENG.inc`: the characters a party name may use (each token's first character). */
  letters: string;
}
