import type { MoveReport, Vec3 } from '@flyffweb/protocol';
import { combineIntents } from '@flyffweb/scene';
import type { MoveIntent } from '@flyffweb/scene';
import type { TapHit } from './render/picking';
import type { ActionMover } from './sim/ActionMover';
import { ActMsg, MAX_CORR_SIZE_45, ObjSta, ObjStaF } from './sim/constants';

/** What the keys or the joystick ask of the own mover this frame. */
export interface Desired {
  move: 'stand' | 'forward' | 'back';
  turn: 'none' | 'left' | 'right';
  /**
   * Walk mode asked for. The keys move in the mode the mover has, which the walk key (X) toggles as Neuz's does
   * (`OwnMover.control`); the joystick asks for one while it is pushed (a part push walks, a full push runs); and with
   * nothing pushed the mode stays as it was (`desiredFrom`), so a walk to a tapped point goes in the mode the last move had.
   */
  walk: boolean;
}

/**
 * What the keys and the joystick ask for this frame (spec §1): the move and the turn of both, and the gait the joystick's
 * push asks for (`run`: a full push runs, a part push walks), none (`undefined`) while it is not pushed: the keys ask for
 * no gait, they move at the one the mover has. A `MoveIntent` is one, with its gait.
 */
export type ControlIntent = Omit<MoveIntent, 'run'> & { run?: boolean; angle?: number };

/**
 * The keys' and the joystick's intents as one (`combineIntents`), with the joystick's gait while it is pushed. Shift, the
 * keys' `run`, no longer changes the gait: Neuz's walk key is a toggle (X, `NeuzMsgProc.cpp:181`,
 * `WndWorldControlPlayer.cpp:524-545`), and W moves at the gait it toggled (Piece 3's Ruling 25, walk unless Shift, is
 * replaced). With a camera angle, the floating stick supplies an absolute facing and forward movement instead of tank turns.
 */
export function controlIntent(keys: MoveIntent, stick: MoveIntent, cameraAngle?: number): ControlIntent {
  if (cameraAngle !== undefined && (stick.forward !== 0 || stick.turn !== 0)) {
    const angle = cameraAngle - Math.atan2(stick.turn, stick.forward) * 180 / Math.PI;
    return { forward: 1, turn: 0, run: stick.run, angle: ((Math.round(angle) % 360) + 360) % 360 };
  }
  const { forward, turn } = combineIntents({ ...keys, run: false }, stick);
  return stick.forward !== 0 || stick.turn !== 0 ? { forward, turn, run: stick.run } : { forward, turn };
}

/**
 * Whether `intent` moves or turns: the movement keys (`bUp || bDown || bLeft || bRight`) or
 * the joystick out of its dead zone, which stop the auto-attack (`WndWorldControlPlayer.cpp:383-403`). Jump is consumed separately.
 */
export function movesOrTurns(intent: ControlIntent): boolean {
  return intent.forward !== 0 || intent.turn !== 0;
}

/** Nothing pressed: standing, not turning, walk mode (the rest before any input, when the mover's mode is not known). */
export const STANDING: Readonly<Desired> = { move: 'stand', turn: 'none', walk: true };

/** Nothing pressed, in the mode the mover has: the rest before the first input, which asks for no change of mode. */
export function restingIn(act: ActionMover): Desired {
  return { move: 'stand', turn: 'none', walk: (act.stateFlag & ObjStaF.WALK) !== 0 };
}

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

/** Piece 7 M5: the stick's flight keys, as W, S, A and D. */
export interface FlightStick {
  dive: boolean;
  climb: boolean;
  left: boolean;
  right: boolean;
}

export const NO_FLIGHT_STICK: Readonly<FlightStick> = { dive: false, climb: false, left: false, right: false };

/**
 * 2026-11-11: the PC's flight keys, with the stick (`flightStick`): W climbs and S dives, the owner's choice, where Neuz's W
 * dives (`bUp` sends OBJMSG_LOOKDOWN, S OBJMSG_LOOKUP: `ControlFlying`, `WndWorldControlPlayer.cpp:847-861`); A and D
 * turn as in Neuz (:863-879), the way they turn on the ground. The phone's stick stays as it was (forward dives).
 */
export function flightKeys(held: (code: string) => boolean, stick: Readonly<FlightStick> = NO_FLIGHT_STICK): FlightStick {
  return {
    dive: held('KeyS') || stick.dive,
    climb: held('KeyW') || stick.climb,
    left: held('KeyA') || stick.left,
    right: held('KeyD') || stick.right,
  };
}

/**
 * Piece 7 M5 (Decision 4): the stick in flight: forward dives (W), back climbs (S), sideways turns (A, D), each axis by
 * the walk's sectors (`AXIS_ON`, kept down to `AXIS_OFF` from `previous`).
 */
export function flightStick(stick: MoveIntent, previous: Readonly<FlightStick> = NO_FLIGHT_STICK): FlightStick {
  const length = Math.hypot(stick.forward, stick.turn);
  const forward = axis(stick.forward, length, previous.dive ? 1 : previous.climb ? -1 : 0);
  const turn = axis(stick.turn, length, previous.right ? 1 : previous.left ? -1 : 0);
  return { dive: forward === 1, climb: forward === -1, left: turn === -1, right: turn === 1 };
}

/**
 * What the keys and the joystick ask for: a positive forward is forward (the keyboard's W), a positive turn right (D).
 * `previous` is what the frame before asked for: an axis that counted goes on counting a little past its sector's
 * edge (`AXIS_OFF`), so a thumb resting on the edge does not send a PLAYERMOVED every frame. The keys give -1, 0 or 1
 * on each axis, all or nothing, so they turn on and off exactly as before.
 *
 * The mode: while a move or a turn is asked for with a gait (`intent.run`, the joystick's push), walking unless it
 * runs; otherwise `previous`'s. So the keys move in the mode the mover has (`restingIn`, and the walk key's toggle), and
 * letting go changes no mode (no MODE_WALK or MODE_RUN): a walk to a tapped point keeps the mode the last move had and
 * nothing cancels it (Ruling 40).
 */
export function desiredFrom(intent: ControlIntent, previous: Readonly<Desired> = STANDING): Desired {
  const length = Math.hypot(intent.forward, intent.turn);
  const move = axis(intent.forward, length, previous.move === 'forward' ? 1 : previous.move === 'back' ? -1 : 0);
  const turn = axis(intent.turn, length, previous.turn === 'right' ? 1 : previous.turn === 'left' ? -1 : 0);
  return {
    move: move > 0 ? 'forward' : move < 0 ? 'back' : 'stand',
    turn: turn > 0 ? 'right' : turn < 0 ? 'left' : 'none',
    walk: (move === 0 && turn === 0) || intent.run === undefined ? previous.walk : !intent.run,
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
 * Left out: tracking, the cast cancel and the chat line that announces walking or running
 * (`TID_GAME_WALK`, `TID_GAME_RUN`: no chat window yet). The auto-attack the movement keys stop (:383-403) is the
 * attack loop's (`AttackLoop.stop`). The walk key's toggle (:526-545) and the joystick's gait become `desired.walk`,
 * which sends MODE_WALK or MODE_RUN only where the mover's walk flag differs (`OwnMover.control` flips it as X goes down).
 */
export function driveOwnMover(act: ActionMover, desired: Desired, emptyDest: boolean, jump = false): { moved: boolean; behavior: boolean } {
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
  if (jump && act.sendActMsg(ActMsg.JUMP)) behavior = true;
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
 * A press that goes down within this many milliseconds of the one before (Windows' `GetDoubleClickTime`, 500 by
 * default) and within `DOUBLE_PX` of where it went down (half of `SM_CXDOUBLECLK`, 4 by default: the rectangle is
 * centred on the first press) is a double click's second one, which Windows sends as `WM_LBUTTONDBLCLK`.
 */
const DOUBLE_MS = 500;
const DOUBLE_PX = 2;

/**
 * A press on the world, handed on as it goes down (`CWndWorld::OnLButtonDown`, `WndWorld.cpp:6712-7113`, or for a double
 * click's second press `OnLButtonDblClk`, :7239-7263): the object ID of the mover it went down on, or null for the
 * ground or nothing; the press's time (the event's, in the clock of `performance.now()`); and whether it is a double
 * click's second press.
 */
export interface WorldPress {
  mover: number | null;
  time: number;
  double: boolean;
  /** Piece 7 M4: the Alt key was held as it went down (`GetAsyncKeyState( VK_MENU )`: a player's menu, :7065-7086). */
  alt: boolean;
  /** Piece 7 M4: a finger's press (a phone has no right button: a tap on the selected player opens its menu, plan Decisions 5). */
  touch: boolean;
  /** 2026-11-05: where on the ground or an object it went down, when not on a mover (the monster summon's place). */
  point?: Vec3;
}

/** `PointerEvent.button` of the right (secondary) button. */
const RIGHT_BUTTON = 2;

type Listen = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/**
 * The presses on the world (a click of the main mouse button on a computer, a finger on a phone): what each lands on is
 * picked as it goes down, as `CWndWorld::OnLButtonDown` picks the highlighted object (`WndWorld.cpp:6844-6847`). `pick`
 * turns the point, in normalized device coordinates (x from -1 at the left to 1, y from 1 at the top to -1), into what is
 * there (`TapHit`), or null where there is nothing. `canvas` is the drawing: a finger on the joystick, an element of its
 * own over it, is not on it.
 *
 * - Mouse presses go to `onPress` immediately. Touch waits for a valid tap, so a camera/joystick drag cannot select or attack.
 * - A press on a mover is held (`heldMover`) until it is let go, however far it moves (moving the cursor away does not
 *   matter to Neuz's hold, [combat §2.1]); the canvas keeps the pointer (`SetCapture`, :6842), so that its let-go comes
 *   here. The let-go goes to `onRelease` as it comes, with its time, as `OnLButtonUp` judges a wand's or a bow's shot
 *   then (`WndWorld.cpp:6471-6503`), not at the next rules step: a mouse press's when it is let go, cancelled or its
 *   pointer lost, a finger's tap's right after its press.
 * - A press on the ground is a tap where the player walks (`m_bFreeMove`, :6989-6997, and `ControlGround`'s destination
 *   at the point, `WndWorldControlPlayer.cpp:299-361`): `take`. Neuz sets the destination as the button goes down, and
 *   drags with it held turn the camera; here a press is a tap only if it is let go within 300 ms and 8 px of where it
 *   went down, so that a drag or a held finger walks nowhere. The point is the one it went down at.
 *
 * Only the main button and a lone finger press: a second finger ends the first one's press. An error `pick` throws goes
 * to `report` (the overlay), and the press gives nothing; without `report` it is thrown.
 */
export class TapToWalk {
  private press: { pointerId: number; x: number; y: number; time: number; hit: TapHit | null; tap: boolean; deferred: boolean; double: boolean; alt: boolean } | null = null;
  /** Piece 7 M4: where a right press went down (`m_ptMouseSpot`). */
  private menuPress: { x: number; y: number } | null = null;
  /** The last press that went down, for the next one's double click; null after a double click's second press. */
  private last: { x: number; y: number; time: number } | null = null;
  private dest: Vec3 | null = null;

  constructor(
    private readonly canvas: HTMLElement,
    private readonly pick: (ndcX: number, ndcY: number) => TapHit | null,
    private readonly report?: (error: unknown) => void,
    private readonly onPress?: (press: WorldPress) => unknown, // true: the press is taken (2026-11-05)
    /** Piece 7 M4: a right press let go where it went down, on a mover (`OnRButtonUp`, `WndWorld.cpp:7114-7131`). */
    private readonly onMenuPress?: (mover: number) => void,
    private readonly onRelease?: (time: number) => void,
  ) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('lostpointercapture', this.onLost);
  }

  /** The newest destination since the last call, or null. */
  take(): Vec3 | null {
    const dest = this.dest;
    this.dest = null;
    return dest;
  }

  /** The press on a mover still held (Neuz's `m_bLButtonDown` after it): the mover and when it went down; or null. */
  heldMover(): { mover: number; time: number } | null {
    const press = this.press;
    return press !== null && !press.deferred && press.hit !== null && 'mover' in press.hit ? { mover: press.hit.mover, time: press.time } : null;
  }

  /** Forgets a press under way and a tap not yet taken: the page lost the focus or was hidden. */
  reset(): void {
    this.press = null;
    this.last = null;
    this.dest = null;
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onCancel);
    this.canvas.removeEventListener('lostpointercapture', this.onLost);
    this.reset();
  }

  private readonly onDown = (event: PointerEvent): void => {
    this.press = null;
    if (event.button === RIGHT_BUTTON && event.isPrimary) {
      this.menuPress = { x: event.clientX, y: event.clientY };
      return;
    }
    if ((!event.isPrimary && event.pointerType !== 'touch') || event.button !== 0) return;
    const box = this.canvas.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return;
    const { pointerId, clientX: x, clientY: y, timeStamp: time } = event;
    const last = this.last;
    const double = last !== null && time - last.time <= DOUBLE_MS && Math.abs(x - last.x) <= DOUBLE_PX
      && Math.abs(y - last.y) <= DOUBLE_PX;
    this.last = double ? null : { x, y, time };
    let hit: TapHit | null;
    try {
      hit = this.pick(((x - box.left) / box.width) * 2 - 1, 1 - ((y - box.top) / box.height) * 2);
    } catch (error) {
      if (this.report === undefined) throw error;
      this.report(error);
      return;
    }
    const deferred = event.pointerType === 'touch';
    const alt = event.altKey === true;
    this.press = { pointerId, x, y, time, hit, tap: true, deferred, double, alt };
    const mover = hit !== null && 'mover' in hit ? hit.mover : null;
    if (mover !== null) this.canvas.setPointerCapture?.(pointerId);
    // 2026-11-05: a press `onPress` takes for itself (true: the monster summon's place) walks nowhere
    const point = hit !== null && 'point' in hit ? { point: hit.point } : {};
    if (!deferred && this.onPress?.({ mover, time, double, alt, touch: false, ...point }) === true) this.press.tap = false;
  };

  /** The mover under a press, or null (the ground, nothing, or a pick that threw, which is reported). */
  private moverAt(event: PointerEvent): number | null {
    const box = this.canvas.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return null;
    try {
      const hit = this.pick(((event.clientX - box.left) / box.width) * 2 - 1, 1 - ((event.clientY - box.top) / box.height) * 2);
      return hit !== null && 'mover' in hit ? hit.mover : null;
    } catch (error) {
      if (this.report === undefined) throw error;
      this.report(error);
      return null;
    }
  }

  private readonly onMove = (event: PointerEvent): void => {
    const press = this.press;
    if (press !== null && event.pointerId === press.pointerId && moved(press, event)) press.tap = false;
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (event.button === RIGHT_BUTTON) {
      const menu = this.menuPress;
      this.menuPress = null;
      // the highlighted object as it is let go, only where it went down: a drag that turned the camera picks nothing
      if (menu === null || menu.x !== event.clientX || menu.y !== event.clientY) return;
      const mover = this.moverAt(event);
      if (mover !== null) this.onMenuPress?.(mover);
      return;
    }
    const press = this.press;
    if (press === null || event.pointerId !== press.pointerId) return;
    this.press = null;
    if (!press.deferred) this.letGo(press, event);
    if (!press.tap || moved(press, event) || event.timeStamp - press.time > TAP_HOLD_MS) return;
    if (press.deferred) {
      const point = press.hit !== null && 'point' in press.hit ? { point: press.hit.point } : {};
      const taken = this.onPress?.({ mover: press.hit !== null && 'mover' in press.hit ? press.hit.mover : null, time: press.time, double: press.double, alt: press.alt, touch: true, ...point }) === true;
      this.letGo(press, event);
      if (taken) return;
    }
    if (press.hit !== null && 'point' in press.hit) this.dest = press.hit.point;
  };

  private readonly onCancel = (event: PointerEvent): void => {
    const press = this.press;
    if (press === null || event.pointerId !== press.pointerId) return;
    this.press = null;
    if (!press.deferred) this.letGo(press, event);
  };

  /** The canvas lost the pointer it kept (the press's let-go will not come here). */
  private readonly onLost = this.onCancel;

  /** The let-go, at `event`'s time, of a press on a mover that was handed on. */
  private letGo(press: { hit: TapHit | null }, event: PointerEvent): void {
    if (press.hit !== null && 'mover' in press.hit) this.onRelease?.(event.timeStamp);
  }
}

const moved = (from: { x: number; y: number }, to: PointerEvent): boolean =>
  Math.hypot(to.clientX - from.x, to.clientY - from.y) > TAP_MOVE_PX;

/** `KeyX`: the walk key (`g_Neuz.Key.chWalk = 'X'`, `Neuz/NeuzMsgProc.cpp:181`), by its place on the keyboard as `KeyboardInput` reads keys. */
const WALK_KEY = 'KeyX';

/**
 * The walk key: whether it is held (`g_bKeyTable[g_Neuz.Key.chWalk]`, `WndWorldControlPlayer.cpp:524`), which
 * `OwnMover.control` toggles the gait on as it goes down. Neuz reads the key table once a frame; here a press let go
 * before the next read still counts as held at that read, once, as the frames of a slow page can be farther apart than
 * a quick press. `target` is usually `window`; losing the focus lets it go, as a key let go meanwhile never sends its
 * keyup.
 */
export class WalkKey {
  private down = false;
  /** It went down since the last read. */
  private pressed = false;
  private readonly onKeyDown = (event: Event): void => {
    if ((event as KeyboardEvent).code !== WALK_KEY) return;
    this.down = true;
    this.pressed = true;
  };
  private readonly onKeyUp = (event: Event): void => {
    if ((event as KeyboardEvent).code === WALK_KEY) this.down = false;
  };
  private readonly onBlur = (): void => this.reset();

  constructor(private readonly target: Listen) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  /** Whether the key is held, or was pressed since the last call. */
  held(): boolean {
    const held = this.down || this.pressed;
    this.pressed = false;
    return held;
  }

  /** Lets go of the key, as losing the focus does. */
  reset(): void {
    this.down = false;
    this.pressed = false;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.reset();
  }
}
