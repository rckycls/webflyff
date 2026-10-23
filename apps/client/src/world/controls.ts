import type { MoveReport } from '@flyffweb/protocol';
import type { MoveIntent } from '@flyffweb/scene';
import type { ActionMover } from './sim/ActionMover';
import { ActMsg, MAX_CORR_SIZE_45, ObjSta, ObjStaF } from './sim/constants';

/** What the keys or the joystick ask of the own mover this frame. */
export interface Desired {
  move: 'stand' | 'forward' | 'back';
  turn: 'none' | 'left' | 'right';
  /** Walk mode asked for. Neuz toggles it with a key; here the player holds it: running is held, walking is the rest. */
  walk: boolean;
}

/** The sign of each axis picks the message; a positive turn is right (the keyboard's D), a negative one left (A). */
export function desiredFrom(intent: MoveIntent): Desired {
  return {
    move: intent.forward > 0 ? 'forward' : intent.forward < 0 ? 'back' : 'stand',
    turn: intent.turn > 0 ? 'right' : intent.turn < 0 ? 'left' : 'none',
    walk: !intent.run,
  };
}

/**
 * The keyboard part of `CWndWorld::ControlGround` (`Source/_Interface/WndWorldControlPlayer.cpp:419-559`), with
 * `__Y_INTERFACE_VER3` off: the messages that change the own mover's state, in the C++'s order. `moved` is
 * `fMoved` (the caller sends PLAYERMOVED, :557) and `behavior` is `fBehavior` (PLAYERBEHAVIOR, :559), each set where
 * `SendActMsg` returns 1.
 *
 * Left out: jumping (:486), auto-attack, tracking, the cast cancel, `ClearDest` (:548) and the chat line that announces
 * walking or running. The own mover has no destination here, so the `IsEmptyDest()` test before STAND (:453) always
 * passes; the walk key's toggle (:526-545) becomes `desired.walk`, which sends MODE_WALK or MODE_RUN only where the
 * mover's walk flag differs.
 */
export function driveOwnMover(act: ActionMover, desired: Desired): { moved: boolean; behavior: boolean } {
  let moved = false;
  let behavior = false;

  // :422-465: forward, else backward, else stand (STAND is not sent while jumping or sitting, :455)
  if (desired.move === 'forward') {
    if (act.sendActMsg(ActMsg.FORWARD)) moved = true;
  } else if (desired.move === 'back') {
    if (act.sendActMsg(ActMsg.BACKWARD)) moved = true;
  } else if ((act.state & ObjSta.JUMP_ALL) === 0 && (act.stateFlag & ObjStaF.SIT) === 0) {
    if (act.sendActMsg(ActMsg.STAND)) moved = true;
  }

  // :468-483: left, else right, else stop turning
  if (desired.turn === 'left') {
    if (act.sendActMsg(ActMsg.LTURN)) moved = true;
  } else if (desired.turn === 'right') {
    if (act.sendActMsg(ActMsg.RTURN)) moved = true;
  } else if (act.sendActMsg(ActMsg.STOP_TURN)) {
    moved = true;
  }

  // :526-545: the walk key's toggle, MODE_RUN when walking and MODE_WALK when not (the jump, :486-505, comes before)
  const walking = (act.stateFlag & ObjStaF.WALK) !== 0;
  if (desired.walk && !walking) {
    if (act.sendActMsg(ActMsg.MODE_WALK)) behavior = true;
  } else if (!desired.walk && walking) {
    if (act.sendActMsg(ActMsg.MODE_RUN)) behavior = true;
  }

  return { moved, behavior };
}

/**
 * PLAYERMOVED as `CDPClient::SendPlayerMoved` builds it (`Neuz/DPClient.cpp:10081-10108`): the state as it is, with the
 * position, the move per step and the angle `PresupposePos` predicts `MAX_CORR_SIZE_45` steps ahead. (PLAYERBEHAVIOR,
 * `SendPlayerBehavior`, :10113, sends `report` as it is.)
 */
export function movedReport(act: ActionMover, tick: bigint): MoveReport {
  return { ...act.report(tick), ...act.presuppose(MAX_CORR_SIZE_45) };
}
