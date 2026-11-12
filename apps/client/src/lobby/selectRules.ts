// What the V15 Select Character window decides (docs/superpowers/specs/2026-11-12-char-select-create-research.md §2):
//
//   CWndSelectChar::OnKeyUp            _Interface/WndTitle.cpp:1386-1410   Left and Right, wrapping
//   CWndSelectChar::OnDraw             WndTitle.cpp:1795-1809              which buttons the selection enables
//   CWndSelectChar::OnLButtonUp        WndTitle.cpp:2283-2305              a blocked slot is refused
//   CDPLoginClient::OnPlayerList       Neuz/DPLoginClient.cpp:516-526      a blocked selection moves to the first usable one
//   CWndMgr::PutToolTip_Character      _Interface/WndManager.cpp:6737-6806 the hover tooltip
//
// Pure: the view and the tests use it.

import { MAX_CHARACTER_SLOTS } from '@flyffweb/protocol';
import type { CharacterSummary } from '@flyffweb/protocol';
import { Sex } from './appearance';

/**
 * `g_Neuz.m_nCharacterBlock[slot]`, the second field of a PLAYER_LIST row: 2 for an empty slot (Neuz's default,
 * `DPLoginClient.cpp:413`), 1 for a character that may be played, 0 for one whose account `BlockTime` is still ahead
 * (`_Database/DbManager.cpp:571-579`).
 */
export const Block = { BLOCKED: 0, USABLE: 1, EMPTY: 2 } as const;

/** `m_nCharacterBlock == 0`: the character cannot be selected or played. */
export function isBlocked(character: CharacterSummary): boolean {
  return character.blocked === Block.BLOCKED;
}

/** `CWndCharBlockBox` (`WndTitle.cpp:71-83`): its title (`TID_DIAG_0068`) and text (`TID_DIAG_0073`). */
export const BLOCKED_BOX = { title: 'Inbox', text: 'You cannot use this character.' } as const;

/** `TID_GAME_WND_SELECT_CHARACTER_EMPTY`: the name an empty slot shows. */
export const EMPTY_SLOT_TEXT = 'Available';

/**
 * The slot selected when a list comes: the one selected before (`m_nSelectCharacter` is static, kept between visits),
 * unless its character is blocked, then the first usable character's; when none is, the one before. A slot outside
 * 0 to 2 starts at 0.
 */
export function settleSelection(remembered: number, characters: readonly CharacterSummary[]): number {
  const slot = Number.isInteger(remembered) && remembered >= 0 && remembered < MAX_CHARACTER_SLOTS ? remembered : 0;
  const here = characters.find((c) => c.slot === slot);
  if (here === undefined || !isBlocked(here)) return slot;
  const usable = characters.filter((c) => c.blocked === Block.USABLE).map((c) => c.slot).sort((a, b) => a - b);
  return usable[0] ?? slot;
}

/** `OnKeyUp`: one slot left (`by` -1) or right (+1), wrapping round the three. */
export function stepSelection(slot: number, by: -1 | 1): number {
  return (slot + by + MAX_CHARACTER_SLOTS) % MAX_CHARACTER_SLOTS;
}

/** The three buttons the selection decides (Back is always on). */
export interface SelectButtons {
  create: boolean;
  delete: boolean;
  accept: boolean;
}

/** `OnDraw`, `:1795-1809`: a character selected enables Delete and Accept, an empty slot Create. */
export function selectButtons(character: CharacterSummary | undefined): SelectButtons {
  const filled = character !== undefined;
  return { create: !filled, delete: filled, accept: filled };
}

/** One line of the tooltip; `color` is CSS, `bold` the `#b` of its markup. */
export interface TipLine {
  text: string;
  color?: string;
  bold?: boolean;
}

/**
 * `JTYPE_MASTER` and `JTYPE_HERO` jobs (`IsMaster`, `IsHero`, `_Common/MoverParam.cpp:397-405`): in V15's job table the
 * master jobs are 16 to 23 and the hero jobs 24 to 31 (`Resource/defineJob.h:66-84`, `MAX_PROFESSIONAL` 16,
 * `MAX_MASTER` 24, `MAX_HERO` 32).
 */
const isMasterJob = (job: number): boolean => job >= 16 && job < 24;
const isHeroJob = (job: number): boolean => job >= 24 && job < 32;

/**
 * `PutToolTip_Character`: the name (bold; blue, or red with "Connet Cut" for a blocked character, both as Neuz writes
 * them), the sex, the level with "-M" or "-H" for a master or a hero, the four stats and the job. `jobTitle` is the
 * job's name (`prj.m_aJob[ nJob ].szName`), empty when unknown.
 */
export function characterTip(character: CharacterSummary, jobTitle: string): TipLine[] {
  const blocked = isBlocked(character);
  const mark = isMasterJob(character.job) ? '-M' : isHeroJob(character.job) ? '-H' : '';
  return [
    // `#cff0000ff` and `#cffff0000` are ARGB: blue and red
    { text: character.name, color: blocked ? '#ff0000' : '#0000ff', bold: true },
    ...(blocked ? [{ text: 'Connet Cut', color: '#ff0000', bold: true }] : []),
    { text: character.sex === Sex.FEMALE ? 'SEX: Female' : 'SEX: Male' }, // TID_GAME_TOOLTIP_SEXFEMALE / _SEXMALE
    { text: `Level : ${character.level}${mark}` }, // TID_GAME_TOOL_EX_LEVEL, TID_GAME_TOOLTIP_MARK_MASTER / _HERO
    { text: `Strength : ${character.str}` }, // TID_GAME_TOOL_EX_STR
    { text: `Stamina : ${character.sta}` }, // TID_GAME_TOOL_EX_STA
    { text: `Dexterity : ${character.dex}` }, // TID_GAME_TOOL_EX_DEX
    { text: `Intelligence : ${character.int}` }, // TID_GAME_TOOL_EX_INT
    { text: `Job : ${jobTitle}` }, // TID_APP_CHARACTER_JOB
  ];
}
