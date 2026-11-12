// What the V15 New Character and Delete Character windows decide beyond `validation.ts`
// (docs/superpowers/specs/2026-11-12-char-select-create-research.md §3, §4):
//
//   CWndCreateChar::CWndCreateChar     _Interface/WndTitle.cpp:2314-2324   a woman by default
//   CWndCreateChar::OnInitialUpdate    WndTitle.cpp:2595-2649              hair style and face at random
//   CWndCreateChar::SetSex             WndTitle.cpp:2651-2681              the Vagrant's start equipment, by sex
//   CWndCreateChar::OnChildNotify      WndTitle.cpp:2805-2836, :2853-2862  the arrows wrap; the banned names
//   CProject::IsInvalidName,           _Common/ProjectCmn.cpp:787-803,     InvalidName_ENG.inc and Letter_ENG.inc
//     IsAllowedLetter                    :838-860
//   CWndDeleteChar::OnChildNotify      WndTitle.cpp:1270-1349              LANG_ENG's delete password: 1 to 63 characters
//
// Pure: the views and the tests use it.

import { HAIR_MESH_COUNT, HEAD_MESH_COUNT, Sex } from './appearance';

/** The look the window opens with: a woman, a random hair style and face (`xRandom(0, 5)`: 0 to 4). */
export function openingLook(random: () => number = Math.random): { sex: number; hairMesh: number; headMesh: number } {
  const pick = (count: number): number => Math.min(count - 1, Math.floor(random() * count));
  return { sex: Sex.FEMALE, hairMesh: pick(HAIR_MESH_COUNT), headMesh: pick(HEAD_MESH_COUNT) };
}

/** A left (`by` -1) or right (+1) arrow: the next of `count` choices, wrapping (`m_byHairMesh--`, `< 0` to the last). */
export function stepChoice(value: number, by: -1 | 1, count: number): number {
  return (value + by + count) % count;
}

/**
 * `jobItem.inc`'s `job JOB_VAGRANT` lists (`Resource/defineItem.h:32, :248-258`): the suit, the gauntlets, the boots and
 * the Wooden Sword that `SetSex` dresses the preview in, by sex.
 */
export const VAGRANT_START_EQUIPMENT: Readonly<Record<number, readonly number[]>> = {
  [Sex.MALE]: [502, 506, 510, 21], // II_ARM_M_VAG_SUIT01, _GAUNTLET01, _BOOTS01, II_WEA_SWO_WOODEN
  [Sex.FEMALE]: [504, 508, 512, 21], // II_ARM_F_VAG_SUIT01, _GAUNTLET01, _BOOTS01, II_WEA_SWO_WOODEN
};

/** `TID_DIAG_0020`. */
export const NAME_NOT_ALLOWED = 'Character name is not allowed.';

/**
 * `prj.IsInvalidName( string ) || prj.IsAllowedLetter( string ) == FALSE` (`:2853-2862`), checked after
 * `validateCharacterName` passed: the name, lower-cased, holds a word of `invalidNames` (lower-case, as the converter
 * keeps them), or one of its characters is not in `letters` (no letters at all allows every one, `if( !ptr->size() )`).
 */
export function nameNotAllowed(name: string, invalidNames: readonly string[], letters: string): string | undefined {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  if (invalidNames.some((word) => word !== '' && lower.includes(word))) return NAME_NOT_ALLOWED;
  if (letters !== '' && [...trimmed].some((c) => !letters.includes(c))) return NAME_NOT_ALLOWED;
  return undefined;
}

/** `TID_DIAG_0044`: what LANG_ENG's delete window says for an empty or too long password (sic). */
export const DELETE_PASSWORD_REFUSED = 'Please Re-enter SSN.';

/**
 * The delete window's rule for LANG_ENG (the `default:` branch): `0 < strlen( szNo ) && strlen( szNo ) < 64`. The
 * browser also refuses what the ASCII-only packets cannot carry (the key is the hash of the text).
 */
export function validateDeletePassword(text: string): string | undefined {
  if (text.length === 0 || text.length >= 64) return DELETE_PASSWORD_REFUSED;
  if (!/^[\x20-\x7e]+$/.test(text)) return DELETE_PASSWORD_REFUSED;
  return undefined;
}

/** `EBS_NUMBER` with `SetMaxStringNumber( 4 )`: what a Bank PIN edit keeps of what was typed. */
export function pinDigits(text: string): string {
  return text.replace(/[^0-9]/g, '').slice(0, 4);
}
