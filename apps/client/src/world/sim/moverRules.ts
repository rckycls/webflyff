import type { AngleReport, FlightReport, MoveReport, Vec3 } from '@flyffweb/protocol';
import { getDegree, wrapAngle } from './ActionMover';
import type { ActionMover } from './ActionMover';
import type { Ground } from './collision';
import { ActMsg, MAX_CORR_SIZE_150, MAX_CORR_SIZE_45, ObjSta, ObjStaF } from './constants';
import type { FlightState } from './flight';
import { approachFlight, getDegreeX } from './flightCollision';

/**
 * How Neuz moves the movers of other clients between the server's messages, and walks any mover to a point or after
 * another: the move messages of `CDPClient` (`Source/Neuz/DPClient.cpp`), `CMover`'s destination members
 * (`Source/_Common/Mover.h:468-487`) and `CMover::ProcessMove` (`Source/_Common/MoverMove.cpp:344-450`), with
 * Neuz's `__SYNC_1217`, `__BS_ADJUST_SYNC` and `__BS_FIX_ARRIVEPOS_ALGO` on (`Source/Neuz/VersionCommon.h:154,246,255`).
 * Ground only: fliers (`IsFly`, `OnMoverMoved2`, `ActionForceSet2`, `HalfForceSet`), ships (`__IAOBJ0622` is off)
 * and an egg's speed (`AII_EGG`) are left out. Floats as in `ActionMover.ts`: `f32` at every float store.
 */

const f32 = Math.fround;

/** `nRevision` (`DPClient.cpp:8572`): "an accidental error", 35 steps taken off the age of every move. */
const REVISION = 35;
/** `16.6667f`: `OnMoverMoved` divides a move's age in milliseconds by this to count its steps. */
const STEP_MS = f32(16.6667);
/** `ClearDestAngle` (`Mover.h:1015`) puts -1; `ApproachGhostAngle` acts on an angle above `-0.001f` (`Mover.cpp:4663`). */
const NO_DEST_ANGLE = -1;
const DEST_ANGLE_SET = f32(-0.001);
/** `4.001f`: on the ground a destination angle is taken this close to it (`Mover.cpp:4665`). */
const ANGLE_NEAR = f32(4.001);
/** Piece 7 M5: a flier's `0.601f` (`Mover.cpp:4666`). */
const FLY_ANGLE_NEAR = f32(0.601);
/** `m_dwMotionArrive` (`Mover.cpp:493`): what a mover does on arriving. `OnMotionArrive` changes it; not in Piece 3. */
const ARRIVE_MOTION = ActMsg.STAND;
/** `0.8f`: `CObj::IsRangeObj` counts this much of each radius (`Obj.cpp:802-806`). */
const RADIUS_PART = f32(0.8);
/** `D3DXToRadian` with `D3DX_PI` `3.141592654f` (`d3dx9math.h:28-31`). */
const RADIANS_PER_DEGREE = f32(f32(3.141592654) / 180);

/**
 * `CMover`'s destination members (`Mover.h:470-482`). `SetDestPos` and `SetDestObj` each clear the other, so at most
 * one of `pos` and `targetId` is set; the angle is apart from both. `SimMover.dest` is null when none is set.
 */
export interface DestState {
  /** `m_vDestPos` (floats), or null after `ClearDestPos`. `IsEmptyDestPos` looks at x and z only: (0, y, 0) is none. */
  pos: Vec3 | null;
  /** `m_bForward`: always true, as `SetDestPos` sets it under `__BS_ADJUST_SYNC` (`MoverMsg.cpp:92-96`). */
  forward: boolean;
  /** `m_bPositiveX`, `m_bPositiveZ`: on which side of the point `SetDestPos` found the mover; crossing either arrives. */
  positiveX: boolean;
  positiveZ: boolean;
  /** `m_idDest`: the object followed, or null for `NULL_ID`. */
  targetId: number | null;
  /** `m_fArrivalRange`: how close following ends (0 counts as 1 in `IsRangeObj`). */
  range: number;
  /** `m_fDestAngle`: the angle to turn to, -1 for none. */
  angle: number;
  /** `m_bLeft`: turn to it left (`LTURN`), or right. */
  left: boolean;
}

/** The correction `OnMoverMoved` starts. `SimMover.corr` is null when all three are empty. */
export interface CorrState {
  /** `m_CorrAction` while `fValid`: the reported move the mover takes when the correction ends. */
  action: MoveReport | null;
  /** `m_uRemnantCorrFrm`: the steps left; on 1 the action is taken (`EnforcedGhostCorr`). */
  remnant: number;
  /** `m_fCrrSpd`: `GetSpeed`'s answer while not 0. `DefaultSet` zeroes it. */
  speed: number;
  /**
   * Piece 7 M5: `m_CorrAction.fHalf`: the action is a MOVERANGLE's that came with none before it, whose arrival takes
   * only the place, the angles and the move (`HalfForceSet`). A flier's action is a `FlightReport`.
   */
  half?: boolean;
}

/** A mover as these rules move it. */
export interface SimMover {
  objectId: number;
  act: ActionMover;
  dest: DestState | null;
  corr: CorrState | null;
  /**
   * `CMover::m_fSpeedFactor`. `act.body.speed` is `GetSpeed`'s answer without a correction, `m_fSpeed` times this
   * factor (no buffs in Piece 3), kept by the owner; the rules read that, and put `corr.speed` in its place for a step.
   */
  speedFactor: number;
  /** Server calculated own movement speed; corrections still take precedence. */
  profileSpeed?: () => number | undefined;
  /** `CMover::IsActiveMover()`: the player's own character, which arrives at a point only once past it. */
  isSelf?: boolean;
  /** `CObj::GetRadius()` (`Obj.cpp:781-790`, from the model's box and scale), for `IsRangeObj`. 0 when not known. */
  radius?: number;
  /**
   * `CMover::m_nCorr` (`Mover.h:476`, 0 by default, `Mover.cpp:305`), which the rules read for the own character only:
   * -1 from a tap on the ground (`WndWorldControlPlayer.cpp:323`), so that the walk there ends where it meets
   * something or starts to fall; `MAX_CORR_SIZE_45` from each PLAYERMOVED (`PresupposePos`, `ActionMover.cpp:438`),
   * counted down a step at a time (`Mover.cpp:3524-3525`), within which such a moment is corrected (PLAYERCORR). The
   * owner sets it; the rules count it down and end it.
   */
  nCorr?: number;
  /**
   * The browser's, not Neuz's: the rules steps before the next PLAYERSETDESTOBJ to `blockedTarget` may go
   * (`setOwnDestObj`, which sets it as it sends one), counted down a step at a time as `m_nCorr` is. Neuz walks up again
   * at every step after a collision ends its walk to an object (`OnActCollision`'s `ClearDest`, then `SetDestObj` anew):
   * 120 packets a second at a wall with the PLAYERCORRs, past the gateway's 100 (Piece 6 spec §3.1).
   */
  approachWait?: number;
  /** The object whose walk `OnActCollision` or `OnActDrop` ended (`onActCorr`); null where the walk was to a point. */
  blockedTarget?: number | null;
  /**
   * Whether the step whose collision ended that walk still moved the mover (`SLIDE_FRACTION` of its step or more): a
   * slide along the obstacle, not a stop at it, which `setOwnDestObj` lets walk on while it waits.
   */
  blockedSlid?: boolean;
  /** Walking to `blockedTarget` while the server has not been told (`setOwnDestObj`), until it is: no collision ends it. */
  untoldWalk?: boolean;
  /**
   * What `CDPClient::SendPlayerCorr` (`Neuz/DPClient.cpp:10866`) sends, as it was when the rules called it: the own
   * character's state (`act.report`), tick 0. The owner sends it with the clock's tick and puts null back.
   */
  corrReport?: MoveReport | null;
  /**
   * The own character's command on arriving (`CMover::ProcessMoveArrival`, `MoverMove.cpp:76-262`): its
   * `switch( m_oaCmd )` for `target`, the object it followed into range. True where a command took the arrival (it then
   * ends, `SetCmd( OBJACT_NONE )`, :262); false, or none set, for no command, whose arrival is the default
   * (`ClearDestObj` and `OBJMSG_STOP`, :256-259). Its owner (the attack loop) sets it.
   */
  arrive?: (target: SimMover) => boolean;
  /**
   * `CWndWorld::m_bLButtonDown = FALSE`, which the own character's `OnActCollision` does as a walk with `m_nCorr` -1 (to
   * a tapped point or after an object) meets something (`MoverActEvent.cpp:2022-2028`); `OnActDrop` does not. Its owner
   * (the attack loop, whose hold it ends) sets it.
   */
  releaseButton?: () => void;
}

const copy = (v: Vec3): Vec3 => [v[0], v[1], v[2]];
const toFloats = (v: Vec3): Vec3 => [f32(v[0]), f32(v[1]), f32(v[2])];
const minus = (a: Vec3, b: Vec3): Vec3 => [f32(a[0] - b[0]), f32(a[1] - b[1]), f32(a[2] - b[2])];
/** `D3DXVec3Dot` (`d3dx9math.inl`), in floats; `D3DXVec3LengthSq` is `dot(v, v)`. */
const dot = (a: Vec3, b: Vec3): number => f32(f32(f32(a[0] * b[0]) + f32(a[1] * b[1])) + f32(a[2] * b[2]));

/**
 * `D3DXVec3Normalize`: the vector over its length (`sqrtf` of the float sum of squares). D3DX's own code is in its
 * DLL, so the last bit may differ; a zero vector stays zero, as in Wine's d3dx9.
 */
function normalize(v: Vec3): Vec3 {
  const length = f32(Math.sqrt(dot(v, v)));
  return length === 0 ? [0, 0, 0] : [f32(v[0] / length), f32(v[1] / length), f32(v[2] / length)];
}

/**
 * The rules own `act`'s calls into `CMover` from a mover's first destination or step on: `clearDest` (`OBJMSG_STOP`
 * calls `CMover::ClearDest`, so a STOP from anyone, a MOTION message or the keyboard, clears what these functions set),
 * `onActDrop` and `onEndJump4`.
 */
const bound = new WeakMap<ActionMover, SimMover>();

function bind(m: SimMover): void {
  if (bound.get(m.act) === m) return;
  bound.set(m.act, m);
  m.act.clearDest = () => clearDest(m);
  // Piece 7 M5: CanCollisionFly (ActionMoverCollision.cpp:7-16): the own player, or a mover with no destination
  m.act.canCollideFly = () => m.isSelf === true || isEmptyDest(m);
  m.act.onActDrop = () => onActCorr(m, false);
  m.act.onEndJump4 = () => onActEndJump4(m);
}

function destOf(m: SimMover): DestState {
  bind(m);
  return (m.dest ??= {
    pos: null, forward: true, positiveX: false, positiveZ: false, targetId: null, range: 0, angle: NO_DEST_ANGLE,
    left: false,
  });
}

function tidyDest(m: SimMover): void {
  const d = m.dest;
  if (d && d.pos === null && d.targetId === null && !(d.angle > DEST_ANGLE_SET)) m.dest = null;
}

function tidyCorr(m: SimMover): void {
  const c = m.corr;
  if (c && c.action === null && c.remnant === 0 && c.speed === 0) m.corr = null;
}

/**
 * `ClearDestPos`, `ClearDestObj`, `ClearDest` and `ClearDestAngle` (`Mover.h:1006-1015`). `ClearDestObj` is also what a
 * kill does to the killer (`CDPClient::OnMoverDeath`, `DPClient.cpp:2009`).
 */
function clearDestPos(m: SimMover): void {
  if (m.dest) m.dest.pos = null;
  tidyDest(m);
}
export function clearDestObj(m: SimMover): void {
  if (m.dest) {
    m.dest.targetId = null;
    m.dest.range = 0;
  }
  tidyDest(m);
}
function clearDest(m: SimMover): void {
  clearDestObj(m);
  clearDestPos(m);
}
function clearDestAngle(m: SimMover): void {
  if (m.dest) m.dest.angle = NO_DEST_ANGLE;
  tidyDest(m);
}

/** `memset( &m_CorrAction, 0, sizeof(CORR_ACTION) )`: the correction's action is no longer valid. */
function dropCorrAction(m: SimMover): void {
  if (m.corr) {
    m.corr.action = null;
    m.corr.half = false;
  }
  tidyCorr(m);
}

/** `CActionMover::DefaultSet` (`ActionMoverMsg.cpp:90-93`): `m_fCrrSpd = 0`. */
function defaultSet(m: SimMover): void {
  if (m.corr) m.corr.speed = 0;
  tidyCorr(m);
}

/**
 * Piece 7 M2: `CMover::GetSpeed`'s `DST_SPEED` (`MoverParam.cpp:3293-3311`): `fSrc * ( 1.0f + nAdj / 100.0f )` in
 * floats, a buff's (Quick Step) or an item's.
 */
export function buffedSpeed(speed: number, adj: number): number {
  return adj === 0 ? f32(speed) : f32(f32(speed) * f32(1 + adj / 100));
}

/** `CMover::GetSpeed( m_pActMover->m_fSpeed )` (`MoverParam.cpp:3248-3289`): `m_fCrrSpd` while it is set. */
function getSpeed(m: SimMover): number {
  const corrected = m.corr?.speed ?? 0;
  return corrected !== 0 ? corrected : f32(m.profileSpeed?.() ?? m.act.body.speed);
}

/**
 * `CMover::ActionForceSet` (`MoverParam.cpp:3321-3339`) around `ActionMover.forceSet`: `m_uRemnantCorrFrm = 0`,
 * `ClearDestPos` (not `ClearDest`, under `__SYNC_1217`: a followed object stays) and `ClearDestAngle`, then the move,
 * whose `ForcedSet` calls `DefaultSet` when it takes the state. `m_CorrAction` stays as it is.
 */
function actionForceSet(m: SimMover, move: MoveReport): void {
  if (m.corr) m.corr.remnant = 0;
  clearDestPos(m);
  clearDestAngle(m);
  if (m.act.forceSet(move)) defaultSet(m);
  tidyCorr(m);
}

/**
 * Piece 7 M5: `CMover::ActionForceSet2` (`MoverParam.cpp:3366-3387`): `m_uRemnantCorrFrm = 0`, `ClearDest` and
 * `ClearDestAngle`, then the flier's report taken (`ActionMover.forceSet2`), `DefaultSet` when its state was.
 */
function actionForceSet2(m: SimMover, move: FlightReport): void {
  if (m.corr) m.corr.remnant = 0;
  clearDest(m);
  clearDestAngle(m);
  if (m.act.forceSet2(move)) defaultSet(m);
  tidyCorr(m);
}

/** Piece 7 M5: `CMover::HalfForceSet` (`MoverParam.cpp:3389-3399`): the place, the angles and the move only. */
function halfForceSet(m: SimMover, move: FlightReport): void {
  if (m.corr) m.corr.remnant = 0;
  clearDest(m);
  clearDestAngle(m);
  m.act.halfForceSet(move);
  defaultSet(m);
}

/** A report's age in steps, `(int)( (float)g_TickCount.GetOffset( nTickCount ) / 16.6667f )`. */
const ageInSteps = (offsetMs: number): number => Math.trunc(f32(f32(offsetMs) / STEP_MS));

/** Piece 7 M5: `m_CorrAction` filled with a flier's report, valid (`DefaultSet` first). */
function keepFlightAction(m: SimMover, move: FlightReport): CorrState {
  const corr = (m.corr ??= { action: null, remnant: 0, speed: 0 });
  corr.speed = 0; // DefaultSet
  corr.action = { ...move, pos: copy(move.pos), delta: copy(move.delta) } as FlightReport;
  return corr;
}

/**
 * Piece 7 M5: `CDPClient::OnMoverMoved2` (`DPClient.cpp:8726-8829`), another flier's PLAYERMOVED2. Only a flier takes it.
 * Older than `frames` steps it is taken at once, and so is a standing report more than 0.1 away behind the reported
 * facing (90 to 270 degrees off). Otherwise the report is kept for the correction, and: standing, a change of look or
 * of turn is taken as a message (a turn as a destination angle); any other heads for the reported point over `frames`
 * steps (the chase, `approachFlight`).
 */
export function applyMoved2(m: SimMover, move: FlightReport, frames: number, offsetMs: number): void {
  const act = m.act;
  if ((act.stateFlag & ObjStaF.FLY) === 0) return;
  if (ageInSteps(offsetMs) >= frames) {
    actionForceSet2(m, move);
    return;
  }
  if (move.state & ObjSta.STAND) {
    const v = minus(move.pos, act.body.pos);
    if (dot(v, v) > 0.01) {
      const diff = Math.abs(f32(getDegree(move.pos, act.body.pos) - move.angle));
      if (diff > 90 && diff < 270) {
        actionForceSet2(m, move);
        return;
      }
    }
  }
  const corr = keepFlightAction(m, move);
  const standing = (move.state & ObjSta.MOVE_ALL) === ObjSta.STAND;
  const turnState = move.state & ObjSta.TURN_ALL;
  const lookState = move.state & ObjSta.LOOK_ALL;
  const ownLook = act.state & ObjSta.LOOK_ALL;
  const ownTurn = act.state & ObjSta.TURN_ALL;
  let look = false;
  if (standing && ownLook === 0 && lookState !== 0) {
    look = true;
    act.sendActMsg(lookState === ObjSta.LOOKUP ? ActMsg.LOOKUP : ActMsg.LOOKDOWN);
  } else if (standing && ownLook !== 0 && lookState === 0) {
    look = true;
    act.sendActMsg(ActMsg.STOP_LOOK);
  }
  if (standing && ownTurn === 0 && turnState !== 0) {
    setDestAngle(m, move.angle, turnState === ObjSta.LTURN);
  } else if (standing && ownTurn !== 0 && turnState === 0) {
    clearDestAngle(m);
    act.sendActMsg(ActMsg.STOP_TURN);
    act.body.angle = wrapAngle(move.angle);
  } else {
    if (look) return;
    clearDestAngle(m);
    corr.remnant = frames;
    setDestPos(m, move.pos, true);
  }
}

/**
 * Piece 7 M5: `CDPClient::OnMoverBehavior2` (`DPClient.cpp:8831-8891`): only a flier takes it. A flying report younger
 * than `MAX_CORR_SIZE_150` steps (its age less 70, "an accidental error" twice) is kept and headed for over the steps
 * left; an older one, or one that lands (which `ForcedSet2` refuses to flip), is taken at once.
 */
export function applyBehavior2(m: SimMover, move: FlightReport, offsetMs: number): void {
  if ((m.act.stateFlag & ObjStaF.FLY) === 0) return;
  const delay = ageInSteps(offsetMs) - REVISION * 2;
  if ((move.stateFlag & ObjStaF.FLY) === 0 || delay >= MAX_CORR_SIZE_150) {
    actionForceSet2(m, move);
    return;
  }
  const corr = keepFlightAction(m, move);
  clearDestAngle(m);
  corr.remnant = MAX_CORR_SIZE_150 - delay;
  setDestPos(m, move.pos, true);
}

/**
 * Piece 7 M5: `CDPClient::OnMoverAngle` (`DPClient.cpp:8893-8927`), a flier's PLAYERANGLE: only a flier takes it. The
 * place, the angles and the move go into the kept action (its other fields stay; with none kept, the mover's own, and
 * the arrival takes only these: `fHalf`), which is headed for over `MAX_CORR_SIZE_150` steps.
 */
export function applyMoverAngle(m: SimMover, r: AngleReport): void {
  const act = m.act;
  if ((act.stateFlag & ObjStaF.FLY) === 0) return;
  const corr = (m.corr ??= { action: null, remnant: 0, speed: 0 });
  corr.speed = 0; // DefaultSet
  const was = corr.action as FlightReport | null;
  corr.half = was === null;
  const base: FlightReport = was ?? {
    ...act.report(r.tick), angleX: act.angleX, accPower: act.accPower, turnAngle: act.turnAngle,
  };
  corr.action = {
    ...base, pos: copy(r.pos), delta: copy(r.delta), angle: r.angle, angleX: r.angleX, accPower: r.accPower,
    turnAngle: r.turnAngle,
  } as FlightReport;
  clearDestAngle(m);
  corr.remnant = MAX_CORR_SIZE_150;
  setDestPos(m, r.pos, true);
}

/**
 * Piece 7 M5: `CDPClient::OnMoverCorr2` (`DPClient.cpp:8964-8989`): only a flier takes it: `ClearDestPos`,
 * `ClearDestAngle`, the kept action dropped, and the report taken at once.
 */
export function applyMoverCorr2(m: SimMover, move: FlightReport): void {
  if ((m.act.stateFlag & ObjStaF.FLY) === 0) return;
  clearDestPos(m);
  clearDestAngle(m);
  dropCorrAction(m);
  actionForceSet2(m, move);
}

/**
 * `CDPClient::OnMoverMoved` (`DPClient.cpp:8574-8651`, `__SYNC_1217`) when `behavior` is false, `OnMoverBehavior`
 * (:8653-8718) when it is true. `offsetMs` is `g_TickCount.GetOffset( nTickCount )` (`ServerClock.offsetMs`).
 *
 * A move: `delay = (int)( (float)offsetMs / 16.6667f ) - 35`; from 22 (`MAX_CORR_SIZE_45`) on the mover takes it at
 * once. Otherwise it heads for the reported point (or turns to the reported angle, when standing in both and turning)
 * at its own speed (`GetSpeed`, times 4 while walking, so a walk catches up at the run's pace) for `22 - delay` steps,
 * 1 if either moves backward, and then takes the report. The `fLength` that the older speed came from is unused.
 *
 * A behavior is taken at once. (Both branches of `OnMoverBehavior` call `ActionForceSet`; the first one's memset
 * clears an `m_CorrAction` that is not valid anyway. Its own correction code is commented out.)
 */
export function applyMoved(m: SimMover, move: MoveReport, offsetMs: number, behavior: boolean): void {
  const act = m.act;
  if (act.stateFlag & ObjStaF.FLY) return; // IsFly(): OnMoverMoved2 moves fliers
  if (behavior) {
    actionForceSet(m, move);
    return;
  }
  const delay = Math.trunc(f32(f32(offsetMs) / STEP_MS)) - REVISION;
  const moveState = act.state & ObjSta.MOVE_ALL;
  const toState = move.state & ObjSta.MOVE_ALL;
  const backward = moveState === ObjSta.BMOVE || toState === ObjSta.BMOVE;
  // too late, or to a flier (the mover is not one: see above)
  if (delay >= MAX_CORR_SIZE_45 || move.stateFlag & ObjStaF.FLY) {
    actionForceSet(m, move);
    return;
  }
  const corr = (m.corr ??= { action: null, remnant: 0, speed: 0 });
  corr.speed = 0; // DefaultSet
  corr.remnant = backward ? 1 : MAX_CORR_SIZE_45 - delay;
  const speed = getSpeed(m);
  corr.speed = act.stateFlag & ObjStaF.WALK ? f32(speed * 4) : speed;
  corr.action = { ...move, pos: copy(move.pos), delta: copy(move.delta) };
  const turnState = move.state & ObjSta.TURN_ALL;
  if (moveState === ObjSta.STAND && toState === ObjSta.STAND && turnState !== 0) {
    setDestAngle(m, move.angle, turnState === ObjSta.LTURN);
  } else {
    clearDestAngle(m);
    act.sendActMsg(ActMsg.STOP_TURN);
    setDestPos(m, move.pos, toState !== ObjSta.BMOVE);
  }
}

/**
 * `CDPClient::OnMoverCorr` (`DPClient.cpp:8929-8955`), the MOVERCORR message: another player's PLAYERCORR (its own
 * client stopped it where it met something or started to fall, `OnActCollision` / `OnActDrop`), which the world server
 * applies and passes on (`CDPSrvr::OnPlayerCorr`, `CUserMng::AddMoverCorr`). A flier ignores it. `ClearDestPos`,
 * `ClearDestAngle` and the memset of `m_CorrAction`; then the correction taken at once (`ActionForceSet`), and the
 * object it was following (`GetDestId`, kept from before) followed on from range 0 (`SetDestObj( objidDest, 0.0f,
 * FALSE )`: with `NULL_ID` that is no object).
 */
export function applyMoverCorr(m: SimMover, move: MoveReport): void {
  if (m.act.stateFlag & ObjStaF.FLY) return; // IsFly()
  clearDestPos(m);
  clearDestAngle(m);
  dropCorrAction(m);
  const followed = m.dest?.targetId ?? null;
  actionForceSet(m, move);
  if (followed === null) clearDestObj(m);
  else setDestObj(m, followed, 0);
}

/**
 * `CDPClient::OnSetDestPos` (`DPClient.cpp:3731-3762`), the DESTPOS message: `DefaultSet`, then
 * `BehaviorActionForceSet` (`MoverParam.cpp:3303-3318`), which takes the correction's action only when its
 * `fBehavior` is set (only the commented-out correction of `OnMoverBehavior` set it) and always drops it, then
 * `SetDestPos( vPos, fForward != 0, FALSE )`.
 */
export function applyDestPos(m: SimMover, pos: Vec3, forward: boolean): void {
  defaultSet(m);
  dropCorrAction(m);
  setDestPos(m, pos, forward);
}

/**
 * `CDPClient::OnMotion` (`DPClient.cpp:9951-9976`), the MOTION message: unless it is `OBJMSG_STANDUP`, `ClearDest`,
 * `ClearDestAngle` and the memset of `m_CorrAction`; then `SendActMsg( dwMsg, 0, 0, 1 )`. (`REQ_MOTION` and the next
 * skill belong to the interface.)
 */
export function applyMotion(m: SimMover, msg: number): void {
  if (msg === 0) return; // OBJMSG_NONE
  if (msg !== ActMsg.STANDUP) {
    clearDest(m);
    clearDestAngle(m);
    dropCorrAction(m);
  }
  m.act.sendActMsg(msg, 0, 0, 1);
}

/**
 * Piece 7 M5: what a ride put on or off clears: the own player's `DoEquip` `ClearDest`, `ClearDestAngle` and the
 * correction (`MoverEquip.cpp:1825-1827`); another's `DoFakeEquip` only `ClearDest` (`:1879-1908`).
 */
export function resetForRide(m: SimMover, own: boolean): void {
  if (m.dest === null && m.corr === null) return;
  clearDest(m);
  if (!own) return;
  clearDestAngle(m);
  dropCorrAction(m);
}

/**
 * `CMover::SetDestPos` (`MoverMsg.cpp:88-111`): walk to `pos`. `forward` is not used: `__BS_ADJUST_SYNC` sets
 * `m_bForward` to true, so the mover always runs there (`TURNMOVE`, never `TURNMOVE2`). The active mover's
 * `PutPlayerDestPos` is the caller's.
 */
export function setDestPos(m: SimMover, pos: Vec3, forward: boolean): void {
  const d = destOf(m);
  const p = toFloats(pos);
  d.pos = p[0] === 0 && p[2] === 0 ? null : p;
  d.forward = true;
  const at = m.act.body.pos;
  d.positiveX = f32(at[0] - p[0]) > 0;
  d.positiveZ = f32(at[2] - p[2]) > 0;
  clearDestObj(m);
}

/**
 * `CMover::SetDestObj` (`MoverMsg.cpp:47-84`) as `OnMoverSetDestObj` calls it (`bSend` FALSE): follow `targetId`
 * until within `range`. `OnMoverSetDestObj` (`DPClient.cpp:8561`) calls it only when the target is in view. The
 * client's `m_oaCmd = OBJACT_NONE` is the active mover's command, which Piece 3 does not have.
 */
export function setDestObj(m: SimMover, targetId: number, range: number): void {
  const d = destOf(m);
  d.targetId = targetId;
  d.range = f32(range);
  clearDestPos(m);
}

/** `CMover::SetDestAngle` (`Mover.h:1014`): turn to `angle`, left or right as given (`ApproachGhostAngle`). */
export function setDestAngle(m: SimMover, angle: number, left: boolean): void {
  const d = destOf(m);
  d.angle = f32(angle);
  d.left = left;
  tidyDest(m);
}

/** `CMover::IsEmptyDest` (`Mover.h:1013`): no point to walk to and no object to follow. */
export function isEmptyDest(m: SimMover): boolean {
  return m.dest === null || (m.dest.pos === null && m.dest.targetId === null);
}

/**
 * One 60 Hz step of `CMover::Process` (`Mover.cpp:3488-3906`) for any mover: `m_nCorr` counted down (:3524-3525),
 * `ProcessMove`, then `act.step()` at `GetSpeed`, and `OnActCollision` where the step met something (:3899-3905).
 * `find` is `prj.GetCtrl` for the followed object; `ground` goes to `act.step`. Left out of `Process`: the active
 * mover's `SetDestObj` sends, `ProcessAI`, `ProcessMovePattern` and the drawing.
 */
export function stepMover(m: SimMover, find: (objectId: number) => SimMover | undefined, ground?: Ground): void {
  bind(m);
  if (m.nCorr !== undefined && m.nCorr > 0) m.nCorr--;
  if (m.approachWait !== undefined && m.approachWait > 0) m.approachWait--;
  processMove(m, find);
  const body = m.act.body;
  const own = body.speed;
  const speed = getSpeed(m);
  body.speed = speed;
  const [x, , z] = body.pos;
  const { collided } = m.act.step(ground);
  body.speed = own;
  if (collided) onActCorr(m, true, Math.hypot(body.pos[0] - x, body.pos[2] - z) >= SLIDE_FRACTION * speed);
}

/**
 * The browser's (Piece 6 spec §3.1): the part of its step a mover must still have moved, in the step whose collision
 * ended its walk to an object, for that to count as sliding along the obstacle rather than stopping at it. Measured in
 * the tests: a stop at a wall moves 0, a slide along one about 5% of the step, the collision clipping the rest.
 */
const SLIDE_FRACTION = 0.01;

/**
 * The client's `CMover::OnActCollision` (`collision`) and `CMover::OnActDrop` (the `#else` parts of
 * `MoverActEvent.cpp:1979-2053` and `:1908-1977`), which do the same for the active mover: while `m_nCorr` is set, a walk
 * the player tapped, or the walk after an object (-1), ends there, with `ClearDest` and `OBJMSG_STAND`, and either way the
 * state is corrected (`SendPlayerCorr`: `corrReport`) and `m_nCorr` goes back to 0. `OnActCollision` also lets go of a
 * held left button there (`m_bLButtonDown = FALSE`, :2022-2028: `releaseButton`). Another mover on its way somewhere
 * asks the server where it is (`SendQueryGetPos`), which the browser does not. The ended walk's object is kept
 * (`blockedTarget`), and whether the step still `slid` (`blockedSlid`; a drop never does), for `setOwnDestObj`.
 */
function onActCorr(m: SimMover, collision: boolean, slid = false): void {
  if (!m.isSelf || !m.nCorr) return;
  if (m.nCorr < 0) {
    m.blockedTarget = m.dest?.targetId ?? null;
    m.blockedSlid = slid;
    clearDest(m);
    m.act.sendActMsg(ActMsg.STAND);
    if (collision) m.releaseButton?.();
  }
  m.corrReport = m.act.report(0n);
  m.nCorr = 0;
}

/**
 * `CMover::OnActEndJump4` (`MoverActEvent.cpp:2089-2098`): a mover that lands on its way to a point takes its sides of
 * the point anew, `SetDestPos( GetDestPos(), m_bForward, FALSE )`. (`MI_CLOCKWORK1`'s `OBJMSG_APPEAR` is not copied.)
 */
function onActEndJump4(m: SimMover): void {
  const d = m.dest;
  if (d?.pos) setDestPos(m, d.pos, d.forward);
}

/** `CMover::ProcessMove` (`MoverMove.cpp:344-450`) on the ground. */
function processMove(m: SimMover, find: (objectId: number) => SimMover | undefined): void {
  const act = m.act;
  if (act.stateFlag & ObjStaF.SIT) return;
  enforcedGhostCorr(m);
  approachGhostAngle(m);
  const d = m.dest;
  if (!d || isEmptyDest(m)) return;
  if (act.state & ObjSta.ATK_ALL) return;
  const pos = act.body.pos;
  let destPos: Vec3;
  if (d.pos !== null) {
    destPos = d.pos;
    const positiveX = f32(pos[0] - destPos[0]) > 0;
    const positiveZ = f32(pos[2] - destPos[2]) > 0;
    // __BS_FIX_ARRIVEPOS_ALGO (:365-389): others arrive on crossing either axis, the active mover only past the point
    if ((positiveX !== d.positiveX || positiveZ !== d.positiveZ) && (!m.isSelf || isPast(pos, destPos, act.body.angle))) {
      onArriveAtPos(m);
      return;
    }
  } else {
    const target = find(d.targetId!);
    if (!target) {
      act.sendActMsg(ActMsg.STAND); // m_idDest stays: the mover stands until the target is back or a new destination comes
      return;
    }
    destPos = target.act.body.pos;
    if (isRangeObj(target, m, d.range)) {
      // a flier only stops following (MoverMove.cpp:410-418)
      if (act.stateFlag & ObjStaF.FLY) clearDestObj(m);
      else processMoveArrival(m, target);
      return;
    }
  }
  const corr = m.corr;
  // Piece 7 M5: the chase in the air (MoverMove.cpp:428-439): TURNMOVE toward the point while frames remain
  if (act.isFlying()) {
    if (corr && corr.remnant > 0) {
      corr.remnant = approachFlight(act as unknown as FlightState, destPos, corr.remnant);
      tidyCorr(m);
    }
    return;
  }
  if (corr && corr.remnant > 0) {
    corr.remnant--;
    tidyCorr(m);
  }
  // m_bForward is always true; GetDegreeX's second parameter turns a flying NPC up or down (Piece 7 M5)
  act.sendActMsg(ActMsg.TURNMOVE, Math.trunc(getDegree(destPos, pos)), Math.trunc(getDegreeX(destPos, pos)));
}

/**
 * The active mover's test (`MoverMove.cpp:370-382`): the point is behind it when `normalize( pos - dest )` and its
 * facing (`AngleToVectorXZ( GetAngle(), 1.0f )`, `xUtil3D.h:37-43`) have a positive dot product.
 */
function isPast(pos: Vec3, dest: Vec3, angle: number): boolean {
  const theta = f32(angle * RADIANS_PER_DEGREE);
  const facing = normalize([f32(Math.sin(theta)), 0, f32(-f32(Math.cos(theta)))]);
  return dot(normalize(minus(pos, dest)), facing) > 0;
}

/**
 * `CObj::IsRangeObj( pOther, fRange )` (`Obj.cpp:794-819`), `obj` being the followed one: in range when the distance
 * (in 3D) is under 0.8 of each radius plus `range`, a range of 0 counting as 1. (Without a model the C++ says never;
 * here the radius is the mover's `radius`, 0 when not known.)
 */
function isRangeObj(obj: SimMover, other: SimMover, range: number): boolean {
  const r = range === 0 ? 1 : range;
  const radius = f32(f32(f32(obj.radius ?? 0) * RADIUS_PART) + f32(f32(f32(other.radius ?? 0) * RADIUS_PART) + r));
  const v = minus(obj.act.body.pos, other.act.body.pos);
  return dot(v, v) < f32(radius * radius);
}

/**
 * `CMover::EnforcedGhostCorr` (`Mover.cpp:4642-4659`): on the correction's last step, `( m_uRemnantCorrFrm - 1 ) == 0`
 * in a `u_long` (so 1 only), the mover takes its action. The flying branch needs an action with `OBJSTAF_FLY`, which
 * `OnMoverMoved` never keeps (it takes those at once).
 */
function enforcedGhostCorr(m: SimMover): void {
  const corr = m.corr;
  if (!corr?.action || corr.remnant !== 1) return;
  if (corr.action.stateFlag & ObjStaF.FLY) actionForceSet2(m, corr.action as FlightReport);
  else actionForceSet(m, corr.action);
  dropCorrAction(m);
}

/**
 * `CMover::ApproachGhostAngle` (`Mover.cpp:4661-4693`) on the ground: within 4.001 degrees the destination angle is
 * set (or, during a correction, its action taken); otherwise the mover turns the given way (`fabs` of the difference,
 * so near 0/360 the turn goes on round).
 */
function approachGhostAngle(m: SimMover): void {
  const d = m.dest;
  if (!d || !(d.angle > DEST_ANGLE_SET)) return;
  const act = m.act;
  const flying = (act.stateFlag & ObjStaF.FLY) !== 0;
  if (Math.abs(f32(act.body.angle - d.angle)) < (flying ? FLY_ANGLE_NEAR : ANGLE_NEAR)) {
    const action = m.corr?.action;
    if (!action) {
      act.body.angle = wrapAngle(d.angle);
      clearDestAngle(m);
      act.sendActMsg(ActMsg.STOP_TURN);
    } else {
      clearDestAngle(m);
      if ((action.stateFlag & ObjStaF.FLY) === 0) actionForceSet(m, action);
      dropCorrAction(m);
    }
  } else {
    // a flier turns at 0.6 a step: (int)( 0.6f * 100.0f ) (Mover.cpp:4684-4688)
    act.sendActMsg(d.left ? ActMsg.LTURN : ActMsg.RTURN, flying ? 60 : 0);
  }
}

/**
 * `CMover::OnArriveAtPos` (`Mover.cpp:4708-4740`): `m_dwMotionArrive`, or during a correction its action (`fHalf` is
 * a flier's); then `ClearDestPos`. `OnArrive` is the world server's.
 */
function onArriveAtPos(m: SimMover): void {
  const action = m.corr?.action;
  if (!action) {
    m.act.sendActMsg(ARRIVE_MOTION);
  } else {
    if (m.corr?.half) halfForceSet(m, action as FlightReport);
    else if (action.stateFlag & ObjStaF.FLY) actionForceSet2(m, action as FlightReport);
    else actionForceSet(m, action);
    dropCorrAction(m);
  }
  clearDestPos(m);
}

/**
 * The client's `CMover::ProcessMoveArrival( pObj )` (`MoverMove.cpp:73-275`), `target` being the object followed into
 * range. The active mover runs its command (`switch( m_oaCmd )`, :78-262: `arrive`, which ends it); with none, the
 * default (:256-259), as for any other mover: `ClearDestObj` and `OBJMSG_STOP`. A moving other also sends
 * QUERYGETDESTOBJ (:272-273), which the browser does not.
 */
function processMoveArrival(m: SimMover, target: SimMover): void {
  if (m.isSelf && m.arrive?.(target) === true) return;
  clearDestObj(m);
  m.act.sendActMsg(ActMsg.STOP);
}
