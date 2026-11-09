// A mover's modes (`CMover::m_dwMode`, `_Common/authorization.h:104-140`) and what MODIFYMODE tells the own game master
// (2026-11-10, docs/superpowers/specs/2026-11-10-gm-commands-research.md):
//
//   CUserMng::AddModifyMode   WORLDSERVER/User.cpp:5158-5169       the whole m_dwMode, to everyone in view of the mover,
//                                                                  after /invisible, /undying, /onekill, /freeze ...
//   CDPClient::OnModifyMode   Neuz/DPClient.cpp:12278-12379        sets it; to the own player, when a game master, a line
//                                                                  of the modes on (:12285-12356); to the own player with
//                                                                  unread mail, TID_MAIL_RECEIVE (:12358-12376)

import { isGameMaster } from './authorization';

/** The `m_dwMode` bits (`authorization.h:106-140`). */
export const Mode = {
  MATCHLESS: 0x00000001,
  TRANSPARENT: 0x00000002,
  ONEKILL: 0x00000004,
  DONMOVE: 0x00000008,
  SAYTALK: 0x00000010,
  MATCHLESS2: 0x00000020,
  NO_ATTACK: 0x00000040,
  ITEM: 0x00000080,
  COMMUNITY: 0x00000100,
  TALK: 0x00000200,
  SHOUTTALK: 0x00000400,
  FREEPK: 0x00001000,
  PVPCONFIRM: 0x00002000,
  MAILBOX: 0x00008000,
} as const;

/**
 * The line OnModifyMode prints to the own player (`DPClient.cpp:12285-12356`), or null when it prints none (the player is
 * not a game master: `g_pPlayer->IsAuthHigher( AUTH_GAMEMASTER )`). Each mode on adds its word, with no space between, as
 * the English textClient has them (`Undying1`, `Invisible` ...); "PK " and "PVP " are Neuz's own. The words Neuz writes
 * as Korean literals (observe, item, attack, community, no whisper, no chat, no shout: `:12301-12335`) are left out: an
 * English Neuz draws their CP949 bytes as other letters. Then `TID_ADMIN_STATE` for any mode, else `TID_ADMIN_NORMAL`, all
 * in `TID_ADMIN_NORMAL`'s colour.
 */
export function modeLine(
  mode: number, authorization: number, text: (id: string) => { text: string; color: number } | undefined,
): { text: string; color: number } | null {
  if (!isGameMaster(authorization)) return null;
  const word = (id: string): string => text(id)?.text ?? '';
  const on = (bits: number): boolean => (mode & bits) === bits;
  let line = '';
  if (on(Mode.MATCHLESS)) line += word('TID_ADMIN_IMMORTAL');
  if (on(Mode.MATCHLESS2)) line += word('TID_ADMIN_IMMORTALHALF');
  if (on(Mode.TRANSPARENT)) line += word('TID_ADMIN_INVISIBLE');
  if (on(Mode.ONEKILL)) line += word('TID_ADMIN_MIGHTY');
  if (on(Mode.DONMOVE)) line += word('TID_ADMIN_NOMOVING');
  if (on(Mode.FREEPK)) line += 'PK ';
  if (on(Mode.PVPCONFIRM)) line += 'PVP ';
  line += word(mode !== 0 ? 'TID_ADMIN_STATE' : 'TID_ADMIN_NORMAL');
  return { text: line, color: text('TID_ADMIN_NORMAL')?.color ?? 0xffffffff };
}

/** What the invisibility rules read of a mover: whether it is the own one, and a player's authorization and modes. */
export interface ModeHolder {
  isSelf: boolean;
  added: { player?: { authorization: number; mode: number } };
}

/**
 * `IsMode( TRANSPARENT_MODE )` (`Mover.h:1692-1708`): a player made invisible by /invisible. (The skill's `CHS_INVISIBILITY`,
 * which also makes it TRUE, is not tracked here.) A monster or NPC never is.
 */
export function isInvisible(mover: ModeHolder): boolean {
  return ((mover.added.player?.mode ?? 0) & Mode.TRANSPARENT) !== 0;
}

/** `SetBlendFactor( 80 )` (`MoverRender.cpp:526`): an invisible body drawn at 80 of 255. */
export const INVISIBLE_ALPHA = 80 / 255;

/**
 * How opaque a mover's body is drawn for a viewer of `viewerAuthorization` (`CMover::Render`, `MoverRender.cpp:517-531`):
 * a visible one whole; an invisible one at blend 80 when it is the own one, or when the viewer is a game master
 * (`g_pPlayer->IsAuthHigher( AUTH_GAMEMASTER )`); else not at all (0). Its ride is not drawn even then (:591-714).
 * The school event's exception (:519-523) is not copied: V15's servers run no school event.
 */
export function bodyAlpha(mover: ModeHolder, viewerAuthorization: number): number {
  if (!isInvisible(mover)) return 1;
  return mover.isSelf || isGameMaster(viewerAuthorization) ? INVISIBLE_ALPHA : 0;
}

/**
 * Whether a speaker's line gets a bubble over its head (`CWndMgr::PutString`, `WndManager.cpp:4100-4102`): not for an invisible game
 * master (its authorization `'L'` or after, compared as a letter), the own one included; the chat window still writes it.
 */
export function showsBubble(speaker: ModeHolder): boolean {
  return !(isInvisible(speaker) && (speaker.added.player?.authorization ?? 0) >= 0x4c);
}

/**
 * A player frozen by /freeze (`DONMOVE_MODE`): its own client lets it do nothing, neither move nor click nor attack
 * (`ControlPlayer`, `WndWorldControlPlayer.cpp:21-22`; `UseFocusObj`, `OnLButtonDown`, `MenuException`,
 * `WndWorld.cpp:6205, :6729-6730, :11503-11504`).
 */
export function isFrozen(mover: { added: { player?: { mode: number } } } | undefined): boolean {
  return ((mover?.added.player?.mode ?? 0) & Mode.DONMOVE) !== 0;
}
