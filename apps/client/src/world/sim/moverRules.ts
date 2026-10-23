import type { MoveReport, Vec3 } from '@flyffweb/protocol';
import { wrapAngle } from './ActionMover';
import type { ActionMover } from './ActionMover';
import type { Ground } from './collision';
import { ActMsg, MAX_CORR_SIZE_45, ObjSta, ObjStaF } from './constants';

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
/** `m_dwMotionArrive` (`Mover.cpp:493`): what a mover does on arriving. `OnMotionArrive` changes it; not in Piece 3. */
const ARRIVE_MOTION = ActMsg.STAND;
/** `0.8f`: `CObj::IsRangeObj` counts this much of each radius (`Obj.cpp:802-806`). */
const RADIUS_PART = f32(0.8);
/** `D3DXToDegree`/`D3DXToRadian` with `D3DX_PI` `3.141592654f` (`d3dx9math.h:28-31`). */
const DEGREES_PER_RADIAN = f32(180 / f32(3.141592654));
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
   * What `CDPClient::SendPlayerCorr` (`Neuz/DPClient.cpp:10866`) sends, as it was when the rules called it: the own
   * character's state (`act.report`), tick 0. The owner sends it with the clock's tick and puts null back.
   */
  corrReport?: MoveReport | null;
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
 * `GetDegree` (`Source/_Common/Obj.h:288-304`): the angle from `src` to `dest` on the ground, from the dot product
 * with `VelocityToVec( 0.0f, 1.0f )`, (0, 0, -1): `acosf`, then 360 minus it when x is negative.
 */
function getDegree(dest: Vec3, src: Vec3): number {
  const dir = normalize([f32(dest[0] - src[0]), 0, f32(dest[2] - src[2])]);
  const degree = f32(f32(Math.acos(dot([0, 0, -1], dir))) * DEGREES_PER_RADIAN);
  return dir[0] < 0 ? f32(360 - degree) : degree;
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
  m.act.onActDrop = () => onActCorr(m);
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

/** `ClearDestPos`, `ClearDestObj`, `ClearDest` and `ClearDestAngle` (`Mover.h:1006-1015`). */
function clearDestPos(m: SimMover): void {
  if (m.dest) m.dest.pos = null;
  tidyDest(m);
}
function clearDestObj(m: SimMover): void {
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
  if (m.corr) m.corr.action = null;
  tidyCorr(m);
}

/** `CActionMover::DefaultSet` (`ActionMoverMsg.cpp:90-93`): `m_fCrrSpd = 0`. */
function defaultSet(m: SimMover): void {
  if (m.corr) m.corr.speed = 0;
  tidyCorr(m);
}

/** `CMover::GetSpeed( m_pActMover->m_fSpeed )` (`MoverParam.cpp:3248-3289`): `m_fCrrSpd` while it is set. */
function getSpeed(m: SimMover): number {
  const corrected = m.corr?.speed ?? 0;
  return corrected !== 0 ? corrected : f32(m.act.body.speed);
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
  processMove(m, find);
  const body = m.act.body;
  const own = body.speed;
  body.speed = getSpeed(m);
  const { collided } = m.act.step(ground);
  body.speed = own;
  if (collided) onActCorr(m);
}

/**
 * The client's `CMover::OnActCollision` and `CMover::OnActDrop` (the `#else` parts of `MoverActEvent.cpp:1979-2053`
 * and `:1908-1977`), which do the same for the active mover: while `m_nCorr` is set, a walk the player tapped (-1)
 * ends there, with `ClearDest` and `OBJMSG_STAND`, and either way the state is corrected (`SendPlayerCorr`:
 * `corrReport`) and `m_nCorr` goes back to 0. (`OnActCollision` also lets go of a held left button,
 * `m_bLButtonDown = FALSE`: a tap here is over once it is let go.) Another mover on its way somewhere asks the server
 * where it is (`SendQueryGetPos`), which the browser does not.
 */
function onActCorr(m: SimMover): void {
  if (!m.isSelf || !m.nCorr) return;
  if (m.nCorr < 0) {
    clearDest(m);
    m.act.sendActMsg(ActMsg.STAND);
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
      processMoveArrival(m);
      return;
    }
  }
  const corr = m.corr;
  if (corr && corr.remnant > 0) {
    corr.remnant--;
    tidyCorr(m);
  }
  // m_bForward is always true; GetDegreeX's second parameter only turns a flying NPC up or down
  act.sendActMsg(ActMsg.TURNMOVE, Math.trunc(getDegree(destPos, pos)));
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
  actionForceSet(m, corr.action);
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
  if (Math.abs(f32(act.body.angle - d.angle)) < ANGLE_NEAR) {
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
    act.sendActMsg(d.left ? ActMsg.LTURN : ActMsg.RTURN, 0);
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
    actionForceSet(m, action);
    dropCorrAction(m);
  }
  clearDestPos(m);
}

/**
 * The client's `CMover::ProcessMoveArrival` (`MoverMove.cpp:73-275`): `ClearDestObj` and `OBJMSG_STOP`. For the
 * active mover that is its command's default (:256-259; Piece 3 gives it no command). A moving other also sends
 * QUERYGETDESTOBJ (:272-273), which the browser does not.
 */
function processMoveArrival(m: SimMover): void {
  clearDestObj(m);
  m.act.sendActMsg(ActMsg.STOP);
}
