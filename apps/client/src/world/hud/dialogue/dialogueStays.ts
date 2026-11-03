// When an open dialogue (and the NPC's menu) goes, as Neuz decides it each frame:
//
//   CWndDialog::Process   _Interface/WndDialog.cpp:58-63     the NPC is gone (`prj.GetMover( m_idMover ) == NULL`)
//   CWndWorld::Process    _Interface/WndWorld.cpp:8052-8081  the player is not standing (`IsState( OBJSTA_STAND )`
//                                                            false) or walks back (`GetMoveState() == OBJSTA_BMOVE`,
//                                                            which has the standing bit): the menu hides and
//                                                            APP_DIALOG_EX is destroyed
//
// A dead NPC or player counts as gone here: neither can talk.

import type { Mover } from '../../WorldState';
import { ObjSta } from '../../sim/constants';

/** Whether the player still stands, as `CWndWorld::Process` asks (the menu's half of the rule). */
export function ownStands(own: Mover | undefined): boolean {
  if (own === undefined || own.act.isDie()) return false;
  return (own.act.state & ObjSta.STAND) !== 0 && (own.act.state & ObjSta.MOVE_ALL) !== ObjSta.BMOVE;
}

/** Whether the dialogue with `npc` stays open while the player is `own`. */
export function dialogueStays(npc: Mover | undefined, own: Mover | undefined): boolean {
  return npc !== undefined && !npc.act.isDie() && ownStands(own);
}
