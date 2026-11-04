// The own item cast and its cancel (Piece 7 M3, [R §3]): while the own player is in STATE_BASEMOTION_MODE, a walk, a
// jump, a tap on the ground, a hit, a skill or an attack sends the cancel, and the skill or the attack is refused. The
// server answers with STATEMODE CANCEL; until then the browser sends no second one (plan Decision 3).
//
//   Function                          File:lines                                 what
//   CDPClient::SendStateModeCancel    Neuz/DPClient.cpp:9736-9742                STATEMODE: mode 4, CANCEL
//   CWndWorld::ControlPlayer          _Interface/WndWorldControlPlayer.cpp:341,  the cancel on a walk, a jump, a ground tap
//                                     :422-433, :487-505
//   CMover::CMD_SetUseSkill           _Common/MoverMsg.cpp:196-202               a skill during the cast: the cancel, refused
//   CMover::IsAttackAble              _Common/Mover.cpp:6484-6494                an attack during the cast: the cancel, refused
//   CDPClient::OnDamage               DPClient.cpp:1843-1846                     a hit on or by the own player: the cancel
//   CDPClient::OnStateMode            DPClient.cpp:12419-12422                   ON while not standing: the cancel

import { STATE_BASEMOTION_MODE } from '@flyffweb/protocol';
import type { Mover } from '../WorldState';

export class ItemCast {
  /** The cancel of this cast is sent. */
  private sent = false;

  constructor(
    private readonly own: () => Pick<Mover, 'stateMode'> | undefined,
    private readonly send: { sendStateModeCancel(): void },
  ) {}

  /** `IsStateMode( STATE_BASEMOTION_MODE )` of the own mover. */
  get casting(): boolean {
    return ((this.own()?.stateMode ?? 0) & STATE_BASEMOTION_MODE) !== 0;
  }

  /** While casting, sends the cancel (once a cast) and says so: the caller's skill or attack is refused. */
  interrupt(): boolean {
    if (!this.casting) {
      this.sent = false;
      return false;
    }
    if (!this.sent) {
      this.sent = true;
      this.send.sendStateModeCancel();
    }
    return true;
  }

  /** An own STATEMODE ON: the new cast may send its own cancel. */
  started(): void {
    this.sent = false;
  }
}
