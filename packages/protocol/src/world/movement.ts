import type { ArReader } from '../ar/ArReader';
import type { MoveReport } from '../messages/world';
import type { MessageOf } from './types';

/**
 * The fields `OnMoverMoved` and `OnMoverBehavior` read, in their order: `ar >> v >> vd >> f`, `dwState`,
 * `dwStateFlag`, `dwMotion`, `nMotionEx` (`int`), `nLoop` (`int`), `dwMotionOption`, then `nTickCount`
 * (`__int64`). They are the fields `SendPlayerMoved` writes, so a `MoveReport` holds them.
 */
function readMoveReport(r: ArReader): MoveReport {
  const pos = r.vec3();
  const delta = r.vec3();
  const angle = r.f32();
  const state = r.u32();
  const stateFlag = r.u32();
  const motion = r.u32();
  const motionEx = r.i32();
  const loop = r.i32();
  const motionOption = r.u32();
  const tick = r.i64();
  return { pos, delta, angle, state, stateFlag, motion, motionEx, loop, motionOption, tick };
}

/** MOVERMOVED: `CDPClient::OnMoverMoved` (`Neuz/DPClient.cpp:8574`). */
export function readMoverMoved(r: ArReader): MessageOf<'moverMoved'> {
  return { type: 'moverMoved', move: readMoveReport(r) };
}

/** MOVERBEHAVIOR: `CDPClient::OnMoverBehavior` (`Neuz/DPClient.cpp:8653`), the same fields as MOVERMOVED. */
export function readMoverBehavior(r: ArReader): MessageOf<'moverBehavior'> {
  return { type: 'moverBehavior', move: readMoveReport(r) };
}

/**
 * MOVERCORR: `CDPClient::OnMoverCorr` (`Neuz/DPClient.cpp:8929-8955`), the same fields as MOVERMOVED in the same order,
 * as `CUserMng::AddMoverCorr` (`WORLDSERVER/User.cpp:4971-4993`) writes them: the player's own PLAYERCORR, which
 * `CDPSrvr::OnPlayerCorr` (`DPSrvr.cpp:12872-12918`) applies and passes on to everyone else in view.
 */
export function readMoverCorr(r: ArReader): MessageOf<'moverCorr'> {
  return { type: 'moverCorr', move: readMoveReport(r) };
}

/**
 * MOVERANGLE: `CDPClient::OnMoverAngle` (`Neuz/DPClient.cpp:8887`, a flying mover): `ar >> v >> vd >> f >>
 * fAngleX >> fAccPower >> fTurnAngle`, then `nTickCount` (`__int64`).
 */
export function readMoverAngle(r: ArReader): MessageOf<'moverAngle'> {
  const pos = r.vec3();
  const delta = r.vec3();
  const angle = r.f32();
  const angleX = r.f32();
  const accPower = r.f32();
  const turnAngle = r.f32();
  const tick = r.i64();
  return { type: 'moverAngle', pos, delta, angle, angleX, accPower, turnAngle, tick };
}

/**
 * DESTPOS: `CDPClient::OnSetDestPos` (`Neuz/DPClient.cpp:3731`): `ar >> vPos >> fForward` (`BYTE`, used as
 * `fForward != 0`). The `objidIAObj` it reads under `__IAOBJ0622` is not on the wire: the flag is off.
 */
export function readDestPos(r: ArReader): MessageOf<'destPos'> {
  const pos = r.vec3();
  const forward = r.u8() !== 0;
  return { type: 'destPos', pos, forward };
}

/**
 * DESTANGLE: `CDPClient::OnSetDestAngle` (`Neuz/DPClient.cpp:3769`): `ar >> fDestAngle >> fLeft` (`BYTE`, used as
 * `fLeft != 0`).
 */
export function readDestAngle(r: ArReader): MessageOf<'destAngle'> {
  const angle = r.f32();
  const left = r.u8() !== 0;
  return { type: 'destAngle', angle, left };
}

/**
 * MOVERSETDESTOBJ: `CDPClient::OnMoverSetDestObj` (`Neuz/DPClient.cpp:8561`): `ar >> objid >> fRange`. The
 * `objid` read here overwrites the message's own object ID in the C++ (it is the target's), so it is `targetId`.
 */
export function readSetDestObj(r: ArReader): MessageOf<'setDestObj'> {
  const targetId = r.u32();
  const range = r.f32();
  return { type: 'setDestObj', targetId, range };
}

/** MOTION: `CDPClient::OnMotion` (`Neuz/DPClient.cpp:9951`): `ar >> dwMsg`, an `OBJMSG` (`DWORD`). */
export function readMotion(r: ArReader): MessageOf<'motion'> {
  return { type: 'motion', message: r.u32() };
}
