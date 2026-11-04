// Neuz's flight rules (Piece 7 M5, [R §3]): what a rider's action messages do, the move, turn and look states of a tick,
// the move itself, and the prediction the flight packets carry. Floats as in `ActionMover.ts`: `f32` at every float store.
//
//   flightActMsg      CActionMover::ProcessActMsg2   Source/_AIInterface/ActionMoverMsg2.cpp:30-357
//   flightStates      CActionMover::ProcessState2    ActionMoverState2.cpp:452-552 (the move, turn and look groups)
//   flyMove           CActionMover::ProcessFlyMove   ActionMoverState2.cpp:343-445, with ProcessFlyTracking (:274-340)
//   presupposeFlight  CActionMover::PresupposePos2   ActionMoverState2.cpp:34-147
//   setAngle          CObj::SetAngle                 Source/_Common/Obj.cpp:662-664
//
// The browser departs from Neuz in one place (the plan's Decision 1): OBJMSG_LOOKUP sets the look bits, where Neuz's
// `SetTurnState( OBJSTA_LOOKUP )` cleared the turn and left LOOKDOWN on (a frozen pitch, and a PLAYERMOVED2 every tick).

import type { FlightReport, Vec3 } from '@flyffweb/protocol';
import { wrapAngle } from './ActionMover';
import { ActMsg, AniLoop, Mop, Mta, ObjSta, ObjStaF } from './constants';
import { dot, normalize, vecLength } from './d3dx';

const f32 = Math.fround;

/** `FRIC_AIR` (`ActionMoverState2.cpp:17`), and what a tick leaves of the move, `1.0f - FRIC_AIR`. */
const FRIC_AIR = f32(0.011);
const KEEP = f32(1 - FRIC_AIR);
/** `D3DXToRadian` with `D3DX_PI` `3.141592654f`. */
const RADIANS_PER_DEGREE = f32(f32(3.141592654) / 180);
/** ProcessFlyMove's drift test, `0.633319f`; PresupposePos2 still has the `cosf( 70.0f )` (70 radians) it replaced. */
const DRIFT_DOT = f32(0.633319);
const PRESUPPOSE_DRIFT_DOT = f32(Math.cos(70));
/** The move a tick may reach before the thrust stops adding, and with the turbo (`fMaxSpeed *= 1.1f`). */
const MAX_SPEED = f32(0.3);
const TURBO_MAX_SPEED = f32(MAX_SPEED * f32(1.1));
/** `MAX_MOVE_HEIGHT` (`ActionMover.h:17`): the height PresupposePos2 caps its prediction at. */
const MAX_MOVE_HEIGHT = f32(270);

const toRadian = (degrees: number): number => f32(degrees * RADIANS_PER_DEGREE);
const sinf = (x: number): number => f32(Math.sin(x));
const cosf = (x: number): number => f32(Math.cos(x));

/** The ride's columns the rules read: `fFlightSpeed`, `fFlightLRAngle`, `fFlightTBAngle` and `dwUseMotion`. */
export interface FlightRide {
  speed: number;
  turn: number;
  pitch: number;
  motion: number;
}

/**
 * The part of a mover the flight rules change: `CObj`'s position and angles, `CActionMover`'s move (`m_vDelta`), outside
 * push (`m_vDeltaE`), thrust (`m_fAccPower`), turn (`m_fTurnAngle`) and states, `CMover`'s motion and turbo fuel
 * (`m_tmAccFuel`), and the worn ride's prop.
 */
export interface FlightState {
  pos: Vec3;
  delta: Vec3;
  deltaE: Vec3;
  angle: number;
  angleX: number;
  accPower: number;
  turnAngle: number;
  state: number;
  stateFlag: number;
  motion: number;
  motionOption: number;
  loop: number;
  accFuel: number;
  ride: FlightRide;
  /**
   * `CMover::SetMotion( motion, loop, option )` as the mover plays it (an `ActionMover` counts the motions it sets, for
   * its model); without it the fields are set as they are.
   */
  playMotion?(motion: number, loop: number, option: number): void;
}

/** `CObj::SetAngle`: wraps and quantises the angle to 65536 steps a circle. */
export function setAngle(angle: number): number {
  return wrapAngle(angle);
}

/** `CAction::SetState`: the group's bits replaced. */
function setBits(s: FlightState, mask: number, value: number): void {
  s.state = ((s.state & ~mask) | value) >>> 0;
}

/** `CMover::SetMotion( dwUseMotion + offset, ANILOOP_LOOP, MOP_FIXED )`. */
function play(s: FlightState, offset: number): void {
  if (s.playMotion) {
    s.playMotion(s.ride.motion + offset, AniLoop.LOOP, Mop.FIXED);
    return;
  }
  s.motion = s.ride.motion + offset;
  s.loop = AniLoop.LOOP;
  s.motionOption = Mop.FIXED;
}

/**
 * `ProcessActMsg2` for the messages a rider's controls and the server's moves send. It returns what Neuz returns: 1 when
 * the message changed something (the own player then sends PLAYERMOVED2), 0 when it did not, -2 refused while attacking
 * and -3 while hurt. TURNMOVE takes the angle, the pitch, the frames left (`m_uRemnantCorrFrm`) and the distance
 * (`m_fDistance`) in `p1` to `p4`. Any other message is not a flier's here and returns 0.
 */
export function flightActMsg(s: FlightState, message: number, p1 = 0, p2 = 0, p3 = 0, p4 = 0): number {
  switch (message) {
    case ActMsg.STAND: { // :37-59
      const move = s.state & ObjSta.MOVE_ALL;
      if (move === ObjSta.FMOVE || move === ObjSta.BMOVE) setBits(s, ObjSta.MOVE_ALL, 0);
      if ((s.state & ObjSta.MOVE_ALL) === ObjSta.STAND) return 0;
      if (s.state & ObjSta.ATK_ALL) return -2;
      if (s.state & ObjSta.TURN_ALL) return 0;
      setBits(s, ObjSta.MOVE_ALL, ObjSta.STAND);
      play(s, Mta.FSTAND1);
      return 1;
    }
    case ActMsg.FORWARD: // :74-83
      if ((s.state & ObjSta.MOVE_ALL) === ObjSta.FMOVE) return 0;
      setBits(s, ObjSta.MOVE_ALL, ObjSta.FMOVE);
      if (s.state & ObjSta.TURN_ALL) return 1;
      if (s.state & ObjSta.ATK_ALL) return 1;
      play(s, Mta.FRUNNING1);
      return 1;
    case ActMsg.LTURN: // :85-110
    case ActMsg.RTURN: {
      const turn = message === ActMsg.LTURN ? ObjSta.LTURN : ObjSta.RTURN;
      const turnAngle = f32(f32(p1) / 100);
      if ((s.state & ObjSta.TURN_ALL) === turn && s.turnAngle === turnAngle) return 0;
      s.turnAngle = turnAngle;
      setBits(s, ObjSta.TURN_ALL, turn);
      if (s.state & ObjSta.ATK_ALL) return 0;
      if (turnAngle > 1) play(s, turn === ObjSta.LTURN ? Mta.FLTURN1 : Mta.FRTURN1);
      return 1;
    }
    case ActMsg.STOP_TURN: // :111-122
      if ((s.state & ObjSta.TURN_ALL) === 0) return 0;
      s.turnAngle = 0;
      setBits(s, ObjSta.TURN_ALL, 0);
      if (s.state & ObjSta.ATK_ALL) return 0;
      play(s, (s.state & ObjSta.MOVE_ALL) === ObjSta.FMOVE ? Mta.FRUNNING1 : Mta.FSTAND1);
      return 1;
    case ActMsg.LOOKUP: // :124-131, LOOKUP as LOOKDOWN (Decision 1)
    case ActMsg.LOOKDOWN: {
      const look = message === ActMsg.LOOKUP ? ObjSta.LOOKUP : ObjSta.LOOKDOWN;
      if ((s.state & ObjSta.LOOK_ALL) === look) return 0;
      setBits(s, ObjSta.LOOK_ALL, look);
      return 1;
    }
    case ActMsg.STOP_LOOK: // :132-135
      if ((s.state & ObjSta.LOOK_ALL) === 0) return 0;
      setBits(s, ObjSta.LOOK_ALL, 0);
      return 1;
    case ActMsg.ACC_START: // :261-266 (the fuel test is commented out in Neuz)
      s.stateFlag = (s.stateFlag | ObjStaF.ACC) >>> 0;
      return 1;
    case ActMsg.ACC_STOP: // :267-269
      s.stateFlag = (s.stateFlag & ~ObjStaF.ACC) >>> 0;
      return 1;
    case ActMsg.MODE_TURBO_ON: // :308-312
      if (s.stateFlag & ObjStaF.TURBO) return 0;
      if (s.accFuel <= 0) return 0;
      s.stateFlag = (s.stateFlag | ObjStaF.TURBO) >>> 0;
      return 1;
    case ActMsg.MODE_TURBO_OFF: // :313-316
      if ((s.stateFlag & ObjStaF.TURBO) === 0) return 0;
      s.stateFlag = (s.stateFlag & ~ObjStaF.TURBO) >>> 0;
      return 1;
    case ActMsg.TURNMOVE: { // :319-344
      if (s.state & ObjSta.ATK_ALL) return -2;
      if (s.state & ObjSta.DMG_ALL) return -3;
      flightActMsg(s, ActMsg.STOP_TURN);
      flightActMsg(s, ActMsg.ACC_START);
      s.angle = setAngle(p1);
      s.angleX = f32(p2);
      if (p3 === 0) return 0; // Error( "OBJMSG_TURNMOVE" )
      const angle = toRadian(p1);
      const angleX = toRadian(p2);
      const f = f32(f32(2 * f32(p4)) / f32(f32(f32(0.1) * p3) * p3));
      const dist = f32(cosf(angleX) * f);
      s.delta[0] = f32(sinf(angle) * dist);
      s.delta[2] = f32(-cosf(angle) * dist);
      s.delta[1] = f32(-sinf(angleX) * f32(f * cosf(angleX)));
      return 1;
    }
    default:
      return 0;
  }
}

/** `ProcessState2` for one group's state (`dwState`), the ride's prop being `s.ride`. */
function processState2(s: FlightState, state: number): void {
  const angleX = s.angleX; // fAng, read before the state
  switch (state) {
    case ObjSta.STAND:
      s.accPower = 0;
      if (s.state & (ObjSta.ATK_ALL | ObjSta.TURN_ALL | ObjSta.DMG_ALL)) break;
      play(s, Mta.FSTAND1);
      break;
    case ObjSta.FMOVE:
      s.accPower = f32(s.ride.speed * f32(0.75));
      if (s.state & (ObjSta.ATK_ALL | ObjSta.TURN_ALL)) break;
      play(s, Mta.FRUNNING1);
      break;
    case ObjSta.LTURN:
    case ObjSta.RTURN: {
      // not accelerating, the turn is 2.5 times as fast
      const turn = s.stateFlag & ObjStaF.ACC ? s.turnAngle : f32(s.turnAngle * f32(2.5));
      s.angle = setAngle(f32(s.angle + (state === ObjSta.LTURN ? turn : -turn)));
      if (s.state & ObjSta.ATK_ALL) break;
      play(s, state === ObjSta.LTURN ? Mta.FLTURN1 : Mta.FRTURN1);
      break;
    }
    case ObjSta.LOOKUP: // checked before the change, so the pitch may pass ±45 once
      if (angleX > -45) s.angleX = f32(s.angleX - s.ride.pitch);
      break;
    case ObjSta.LOOKDOWN:
      if (angleX < 45) s.angleX = f32(s.angleX + s.ride.pitch);
      break;
  }
}

/** `ProcessAction`'s flight states of a tick: the move, the turn and the look groups, each one that is set. */
export function flightStates(s: FlightState): void {
  for (const group of [ObjSta.MOVE_ALL, ObjSta.TURN_ALL, ObjSta.LOOK_ALL]) {
    const state = s.state & group;
    if (state !== 0) processState2(s, state);
  }
}

/** Wraps a difference of angles into -180..180 (`ProcessFlyTracking`). */
function signedDifference(a: number): number {
  if (a > 180) return f32(a - 360);
  if (a < -180) return f32(a + 360);
  return a;
}

/**
 * `ProcessFlyTracking`: turns the yaw 2.5° and the pitch 1.5° a tick toward `yawTo` and `pitchTo` (the target's
 * `xGetDegree`), each when it is off by more than 3°. True when either turned (Neuz then queues a PLAYERANGLE).
 */
function track(s: FlightState, to: { yawTo: number; pitchTo: number }): boolean {
  const moverAngle = s.angle > 180 ? f32(s.angle - 360) : s.angle;
  const yaw = signedDifference(f32(to.yawTo - moverAngle));
  const turn = yaw < -3 ? -2.5 : yaw > 3 ? 2.5 : 0;
  const pitch = signedDifference(f32(to.pitchTo - s.angleX));
  const turnX = pitch < -3 ? -1.5 : pitch > 3 ? 1.5 : 0;
  s.angle = setAngle(f32(s.angle + turn));
  s.angleX = f32(s.angleX + turnX);
  return turn !== 0 || turnX !== 0;
}

/**
 * `ProcessFlyMove`: the thrust along the heading and pitch, the drift, the cap and the air's friction, on `s.delta`.
 * `tracking` is the own player's target angles while it tracks (Z). It returns the speed the HUD shows
 * (`g_nFlySpeed`, `|v| × 1080` truncated twice), whether the move drifted (Neuz's dust), and whether tracking turned.
 */
export function flyMove(
  s: FlightState, tracking?: { yawTo: number; pitchTo: number } | null,
): { speedShown: number; drift: boolean; turned: boolean } {
  let lenSq = dot(s.delta, s.delta);
  if (lenSq === 0 && (s.stateFlag & ObjStaF.ACC) === 0) return { speedShown: 0, drift: false, turned: false };

  let accPower = s.accPower;
  const turned = tracking ? track(s, tracking) : false;
  if ((s.stateFlag & ObjStaF.TURBO) && (s.stateFlag & ObjStaF.ACC)) {
    if (s.accFuel <= 0) {
      s.accFuel = 0;
      flightActMsg(s, ActMsg.MODE_TURBO_OFF);
    } else {
      accPower = f32(accPower * f32(1.2));
    }
  }

  let drift = false;
  if (accPower > 0) {
    const angleX = toRadian(s.angleX);
    const angle = toRadian(s.angle);
    const d = f32(cosf(angleX) * accPower);
    let acc: Vec3 = [f32(sinf(angle) * d), f32(-sinf(angleX) * accPower), f32(-cosf(angle) * d)];
    if (lenSq > f32(0.01) && dot(normalize(s.delta), normalize(acc)) < DRIFT_DOT) {
      acc = [f32(acc[0] * 2), f32(acc[1] * 2), f32(acc[2] * 2)];
      scaleInPlace(s.delta, f32(0.985));
      drift = true;
    }
    lenSq = dot(s.delta, s.delta);
    const max = s.stateFlag & ObjStaF.TURBO ? TURBO_MAX_SPEED : MAX_SPEED;
    if (lenSq < f32(max * max)) {
      s.delta[0] = f32(s.delta[0] + acc[0]);
      s.delta[1] = f32(s.delta[1] + acc[1]);
      s.delta[2] = f32(s.delta[2] + acc[2]);
    }
  }

  scaleInPlace(s.delta, KEEP);
  lenSq = dot(s.delta, s.delta);
  if (s.accPower === 0 && lenSq < f32(f32(0.0002) * f32(0.0002))) {
    lenSq = 0;
    s.delta[0] = s.delta[1] = s.delta[2] = 0;
    s.stateFlag = (s.stateFlag & ~ObjStaF.ACC) >>> 0;
  }
  const perHour = Math.trunc(f32(f32(f32(f32(Math.sqrt(lenSq)) * 60) * 60) * 60));
  return { speedShown: Math.trunc(f32(perHour / 200)), drift, turned };
}

function scaleInPlace(v: Vec3, k: number): void {
  v[0] = f32(v[0] * k);
  v[1] = f32(v[1] * k);
  v[2] = f32(v[2] * k);
}

/**
 * `PresupposePos2`: where the rider will be `frames` ticks on if nothing changes, as the flight packets report it. It
 * differs from the live rules as Neuz's does (Decision 2): the look turns 1° a tick, the turbo multiplies the thrust by
 * 1.5 (each tick, unchecked), there is no turbo cap and no collision, and y stops at 270. The mover is not changed; Neuz
 * also clips x and z to the world, which the browser leaves to the live move.
 */
export function presupposeFlight(
  s: FlightState, frames: number,
): Pick<FlightReport, 'pos' | 'delta' | 'angle' | 'angleX' | 'accPower'> {
  const pos: Vec3 = [s.pos[0], s.pos[1], s.pos[2]];
  const delta: Vec3 = [s.delta[0], s.delta[1], s.delta[2]];
  const thrust = f32(s.ride.speed * f32(0.75));
  const move = s.state & ObjSta.MOVE_ALL;
  const turn = s.state & ObjSta.TURN_ALL;
  const look = s.state & ObjSta.LOOK_ALL;
  const accelerating = (s.stateFlag & ObjStaF.ACC) !== 0;
  const turbo = (s.stateFlag & ObjStaF.TURBO) !== 0;
  let angle = s.angle;
  let angleX = s.angleX;
  let accPower = s.accPower;

  for (let i = 0; i < frames; i++) {
    if (move === ObjSta.STAND) accPower = 0;
    else if (move === ObjSta.FMOVE) accPower = thrust;
    if (turn === ObjSta.LTURN || turn === ObjSta.RTURN) {
      const step = accelerating ? s.turnAngle : f32(s.turnAngle * f32(2.5));
      if (turn === ObjSta.LTURN) {
        angle = f32(angle + step);
        if (angle > 360) angle = f32(angle - 360);
      } else {
        angle = f32(angle - step);
        if (angle < 0) angle = f32(angle + 360);
      }
    }
    if (look === ObjSta.LOOKUP && angleX > -45) angleX = f32(angleX - 1);
    else if (look === ObjSta.LOOKDOWN && angleX < 45) angleX = f32(angleX + 1);

    const thetaX = toRadian(angleX);
    if (turbo) accPower = f32(accPower * f32(1.5));
    const d = f32(cosf(thetaX) * accPower);
    const theta = toRadian(angle);
    let acc: Vec3 = [f32(sinf(theta) * d), f32(-sinf(thetaX) * accPower), f32(-cosf(theta) * d)];
    const lenSq = dot(delta, delta);
    const facing = dot(normalize(delta), normalize(acc));
    if (accPower > 0 && lenSq > f32(0.01) && facing < PRESUPPOSE_DRIFT_DOT) {
      acc = [f32(acc[0] * 2), f32(acc[1] * 2), f32(acc[2] * 2)];
      scaleInPlace(delta, f32(0.985));
    }
    if (vecLength(delta) < MAX_SPEED) {
      delta[0] = f32(delta[0] + acc[0]);
      delta[1] = f32(delta[1] + acc[1]);
      delta[2] = f32(delta[2] + acc[2]);
    }
    scaleInPlace(delta, KEEP);
    pos[0] = f32(pos[0] + delta[0]);
    pos[1] = f32(pos[1] + delta[1]);
    pos[2] = f32(pos[2] + delta[2]);
    if (pos[1] > MAX_MOVE_HEIGHT) pos[1] = MAX_MOVE_HEIGHT;
  }
  return { pos, delta, angle, angleX, accPower };
}
