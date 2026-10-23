import type { MoveReport, Vec3 } from '@flyffweb/protocol';
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

/** Nothing pressed: standing, not turning, walk mode. */
export const STANDING: Readonly<Desired> = { move: 'stand', turn: 'none', walk: true };

/**
 * An axis counts once it is this share of the push (its part of the push's length) or more. That cuts the joystick into
 * eight sectors, as the keys are: within about 24 degrees of straight up the stick only walks, within about 24 degrees of
 * straight sideways it only turns, and in between it does both, as W and D together. LTURN and RTURN turn 4 degrees a
 * step, so a turn the thumb did not mean would circle the character; and a share, unlike a fixed length, lets a gentle
 * push walk as surely as a full one.
 */
const AXIS_ON = 0.4;
/** An axis that counts goes on counting down to this share (about 17 degrees), so a thumb on a sector's edge does not flip. */
const AXIS_OFF = 0.3;

/** One axis as -1, 0 or 1, from its value, the push's length and what it was the frame before. */
function axis(value: number, length: number, was: -1 | 0 | 1): -1 | 0 | 1 {
  if (length === 0) return 0;
  const share = value / length;
  if (was !== 0 && share * was >= AXIS_OFF) return was;
  return share >= AXIS_ON ? 1 : share <= -AXIS_ON ? -1 : 0;
}

/**
 * What the keys and the joystick ask for: a positive forward is forward (the keyboard's W), a positive turn right (D).
 * `previous` is what the frame before asked for: an axis that counted goes on counting a little past its sector's
 * edge (`AXIS_OFF`), so a thumb resting on the edge does not send a PLAYERMOVED every frame. The keys give -1, 0 or 1
 * on each axis, all or nothing, so they turn on and off exactly as before.
 */
export function desiredFrom(intent: MoveIntent, previous: Readonly<Desired> = STANDING): Desired {
  const length = Math.hypot(intent.forward, intent.turn);
  const move = axis(intent.forward, length, previous.move === 'forward' ? 1 : previous.move === 'back' ? -1 : 0);
  const turn = axis(intent.turn, length, previous.turn === 'right' ? 1 : previous.turn === 'left' ? -1 : 0);
  return {
    move: move > 0 ? 'forward' : move < 0 ? 'back' : 'stand',
    turn: turn > 0 ? 'right' : turn < 0 ? 'left' : 'none',
    walk: !intent.run,
  };
}

/**
 * The keyboard part of `CWndWorld::ControlGround` (`Source/_Interface/WndWorldControlPlayer.cpp:419-559`), with
 * `__Y_INTERFACE_VER3` off: the messages that change the own mover's state, in the C++'s order. `moved` is
 * `fMoved` (the caller sends PLAYERMOVED, :557) and `behavior` is `fBehavior` (PLAYERBEHAVIOR, :559), each set where
 * `SendActMsg` returns 1.
 *
 * `emptyDest` is `IsEmptyDest()` (`isEmptyDest`): while the own mover walks to a point the player tapped (or follows
 * one), letting go sends no STAND (:450-465), so the walk goes on. Anything that is sent, a move or a behavior, ends
 * it (`ClearDest`, :548-553; `g_DPlay.ClearPlayerDestPos` is `__J0823`'s, which is off): back, a turn, or a change
 * of gait. Forward does not while the mover goes forward already, as on its way to a point: `FORWARD` answers 0.
 *
 * Left out: jumping (:486), auto-attack, tracking, the cast cancel and the chat line that announces walking or
 * running. The walk key's toggle (:526-545) becomes `desired.walk`, which sends MODE_WALK or MODE_RUN only where the
 * mover's walk flag differs.
 */
export function driveOwnMover(act: ActionMover, desired: Desired, emptyDest = true): { moved: boolean; behavior: boolean } {
  let moved = false;
  let behavior = false;

  // :422-465: forward, else backward, else stand (STAND is not sent on the way somewhere, nor jumping or sitting, :455)
  if (desired.move === 'forward') {
    if (act.sendActMsg(ActMsg.FORWARD)) moved = true;
  } else if (desired.move === 'back') {
    if (act.sendActMsg(ActMsg.BACKWARD)) moved = true;
  } else if (emptyDest && (act.state & ObjSta.JUMP_ALL) === 0 && (act.stateFlag & ObjStaF.SIT) === 0) {
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

  // :548-553: what is sent ends the walk to a point (CMover::ClearDest, the rules' once the mover has had a destination)
  if (moved || behavior) act.clearDest();
  return { moved, behavior };
}

/**
 * PLAYERMOVED as `CDPClient::SendPlayerMoved` builds it (`Neuz/DPClient.cpp:10081-10108`): the state as it is, with the
 * position, the move per step and the angle `PresupposePos` predicts `MAX_CORR_SIZE_45` steps ahead. `PresupposePos`
 * also sets `m_nCorr` (`SimMover.nCorr`, `ActionMover.cpp:438`), which is the caller's. (PLAYERBEHAVIOR,
 * `SendPlayerBehavior`, :10113, sends `report` as it is.)
 */
export function movedReport(act: ActionMover, tick: bigint): MoveReport {
  return { ...act.report(tick), ...act.presuppose(MAX_CORR_SIZE_45) };
}

/** A press that moves farther than this many pixels from where it went down is a drag, not a tap. */
const TAP_MOVE_PX = 8;
/** A press held longer than this many milliseconds is not a tap either. */
const TAP_HOLD_MS = 300;

/**
 * A tap on the world (a click of the main mouse button on a computer), where `CWndWorld::OnLButtonDown`
 * (`WndWorld.cpp:6712-6995`) lets the player walk (`m_bFreeMove`) and `ControlGround` sets the destination at the point
 * the press is over (`WndWorldControlPlayer.cpp:299-361`). `pick` turns that point, in normalized device coordinates
 * (x from -1 at the left to 1, y from 1 at the top to -1), into the D3D point the walk goes to, or null where there is
 * none (or a mover is there: picking one is targeting, Piece 4's). `canvas` is the drawing: a finger on the
 * joystick, an element of its own over it, is not on it.
 *
 * Neuz sets the destination as the button goes down, and drags with it held turn the camera. Here a press is a tap
 * only if it is let go within 300 ms and 8 px of where it went down, so that a drag or a held finger walks nowhere; the
 * point is the one it went down at. Only the main button and a lone finger tap: a second finger ends the first one's
 * tap.
 */
export class TapToWalk {
  private press: { pointerId: number; x: number; y: number; time: number } | null = null;
  private dest: Vec3 | null = null;

  constructor(
    private readonly canvas: HTMLElement,
    private readonly pick: (ndcX: number, ndcY: number) => Vec3 | null,
  ) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
  }

  /** The newest destination since the last call, or null. */
  take(): Vec3 | null {
    const dest = this.dest;
    this.dest = null;
    return dest;
  }

  /** Forgets a press under way and a tap not yet taken: the page lost the focus or was hidden. */
  reset(): void {
    this.press = null;
    this.dest = null;
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onCancel);
    this.reset();
  }

  private readonly onDown = (event: PointerEvent): void => {
    this.press = event.isPrimary && event.button === 0
      ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp }
      : null;
  };

  private readonly onMove = (event: PointerEvent): void => {
    const press = this.press;
    if (press !== null && event.pointerId === press.pointerId && moved(press, event)) this.press = null;
  };

  private readonly onUp = (event: PointerEvent): void => {
    const press = this.press;
    if (press === null || event.pointerId !== press.pointerId) return;
    this.press = null;
    if (moved(press, event) || event.timeStamp - press.time > TAP_HOLD_MS) return;
    const box = this.canvas.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return;
    const point = this.pick(((press.x - box.left) / box.width) * 2 - 1, 1 - ((press.y - box.top) / box.height) * 2);
    if (point !== null) this.dest = point;
  };

  private readonly onCancel = (): void => {
    this.press = null;
  };
}

const moved = (from: { x: number; y: number }, to: PointerEvent): boolean =>
  Math.hypot(to.clientX - from.x, to.clientY - from.y) > TAP_MOVE_PX;
