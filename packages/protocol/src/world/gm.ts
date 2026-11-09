// The game masters' messages (2026-11-10, docs/superpowers/specs/2026-11-10-gm-commands-research.md).
//
//   CUserMng::AddModifyMode   WORLDSERVER/User.cpp:5158-5169   MODIFYMODE: u32 m_dwMode, to everyone in view of the mover
//   CDPClient::OnModifyMode   Neuz/DPClient.cpp:12278-12379     sets the mover's m_dwMode; the own game master's state line

import type { ArReader } from '../ar/ArReader';
import type { MessageOf } from './types';

/** SNAPSHOTTYPE_MODIFYMODE: the mover's whole `m_dwMode` (/invisible, /undying, /freeze ... and the mail flag). */
export function readModifyMode(r: ArReader): MessageOf<'modifyMode'> {
  return { type: 'modifyMode', mode: r.u32() };
}

/**
 * SNAPSHOTTYPE_TEXT: `CUser::AddText` / `AddDiagText` (`User.cpp:705-730`) with `__S_SERVER_UNIFY` (on in both
 * `VersionCommon.h`s): a BYTE state, `TEXT_GENERAL` 1 (a green game line, `OnText`, `DPClient.cpp:1582-1604`) or
 * `TEXT_DIAG` 2 (a message box, `OpenMessageBoxUpper`), then the text (`MAX_PATH`). The game masters' commands answer with
 * it (/count, /stat, /eventlist, the guild siege's ...).
 */
export function readServerText(r: ArReader): MessageOf<'serverText'> {
  const state = r.u8();
  return { type: 'serverText', state, text: r.string(260) };
}

/** SNAPSHOTTYPE_CMDSETSKILLLEVEL: /skilllevel's and /skilllevelAll's answer, a skill and its new level (`OnCmdSetSkillLevel`). */
export function readCmdSetSkillLevel(r: ArReader): MessageOf<'cmdSetSkillLevel'> {
  const skill = r.u32();
  return { type: 'cmdSetSkillLevel', skill, level: r.u32() };
}

/** SNAPSHOTTYPE_DISGUISE: /disguise's mover index (`OnDisguise`, `DPClient.cpp:13706-13730`). */
export function readDisguise(r: ArReader): MessageOf<'disguise'> {
  return { type: 'disguise', moverIndex: r.u32() };
}

/** SNAPSHOTTYPE_NODISGUISE: /noDisguise, no body (`OnNoDisguise`, `DPClient.cpp:13732-13750`). */
export function readNoDisguise(): MessageOf<'noDisguise'> {
  return { type: 'noDisguise' };
}
