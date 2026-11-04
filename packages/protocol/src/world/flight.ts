// The flight packets (Piece 7 M5, [R §5, §10]): what a flier sends, and the snapshots about other fliers, its fuel and
// the server's action messages. Every client packet starts with the DPID and its type (`BEFORESENDSOLE`).
//
//   CDPClient::SendPlayerMoved2      Neuz/DPClient.cpp:10150-10175   PLAYERMOVED2: the report, then BYTE nFrame (73 bytes)
//   CDPClient::SendPlayerBehavior2   DPClient.cpp:10177-10203        PLAYERBEHAVIOR2: the report (72 bytes)
//   CDPClient::FlushPlayerAngle      DPClient.cpp:14485-14517        PLAYERANGLE: v, vd, f, fAngleX, fAccPower, fTurnAngle, tick
//   CDPClient::SendPlayerCorr2       DPClient.cpp:10903-10927        PLAYERCORR2: the report, with m_fTurnAngle in fAngleX (:10911)
//   CDPClient::SendMeleeAttack2      DPClient.cpp:9839-9844          MELEE_ATTACK2: msg, target, p2, p3 (no float)
//   CDPClient::OnMoverMoved2         DPClient.cpp:8726-8829          MOVERMOVED2: as PLAYERMOVED2
//   CDPClient::OnMoverBehavior2      DPClient.cpp:8831-8891          MOVERBEHAVIOR2: as PLAYERBEHAVIOR2
//   CDPClient::OnMoverCorr2          DPClient.cpp:8964-8989          MOVERCORR2: as PLAYERBEHAVIOR2
//   CDPClient::OnSetFuel             DPClient.cpp:4026-4040          SETFUEL: int nFuel, int tmAccFuel
//   CDPClient::OnMeleeAttack2        DPClient.cpp:3823-3837          MELEE_ATTACK2: msg, target, p2, p3
//   CDPClient::OnSendActMsg          DPClient.cpp:14935-14951        SENDACTMSG: msg, BOOL bFly, p1, p2, p3

import type { ArReader } from '../ar/ArReader';
import type { ArWriter } from '../ar/ArWriter';
import { PacketType } from '../constants';
import type { Vec3 } from '../constants';
import type { MoveReport } from '../messages/world';
import { clientPacket } from './packet';
import type { MessageOf } from './types';

/** A flier's report: the ground report's fields, and `m_fAngleX`, `m_fAccPower` and `m_fTurnAngle`. */
export interface FlightReport extends MoveReport {
  angleX: number;
  accPower: number;
  turnAngle: number;
}

/** The report in Neuz's order: v, vd, f, fAngleX, fAccPower, fTurnAngle, state, flag, motion, motionEx, loop, option, tick. */
function writeFlight(w: ArWriter, r: FlightReport, angleXSlot = r.angleX): ArWriter {
  return w.vec3(r.pos).vec3(r.delta).f32(r.angle).f32(angleXSlot).f32(r.accPower).f32(r.turnAngle)
    .u32(r.state).u32(r.stateFlag).u32(r.motion).i32(r.motionEx).i32(r.loop).u32(r.motionOption).i64(r.tick);
}

export function readFlightReport(r: ArReader): FlightReport {
  const pos = r.vec3();
  const delta = r.vec3();
  const angle = r.f32();
  const angleX = r.f32();
  const accPower = r.f32();
  const turnAngle = r.f32();
  const state = r.u32();
  const stateFlag = r.u32();
  const motion = r.u32();
  const motionEx = r.i32();
  const loop = r.i32();
  const motionOption = r.u32();
  const tick = r.i64();
  return { pos, delta, angle, angleX, accPower, turnAngle, state, stateFlag, motion, motionEx, loop, motionOption, tick };
}

/** PLAYERMOVED2: the report `PresupposePos2` predicts `frames` steps ahead, and `nFrame` (`MAX_CORR_SIZE_150`, 37). */
export function encodePlayerMoved2(r: FlightReport, frames: number): Uint8Array {
  return writeFlight(clientPacket(PacketType.PLAYERMOVED2), r).u8(frames).toBytes();
}

/** PLAYERBEHAVIOR2: the current report. */
export function encodePlayerBehavior2(r: FlightReport): Uint8Array {
  return writeFlight(clientPacket(PacketType.PLAYERBEHAVIOR2), r).toBytes();
}

/** PLAYERCORR2: as PLAYERBEHAVIOR2, with `m_fTurnAngle` where `fAngleX` goes, as Neuz writes it (Decision 2). */
export function encodePlayerCorr2(r: FlightReport): Uint8Array {
  return writeFlight(clientPacket(PacketType.PLAYERCORR2), r, r.turnAngle).toBytes();
}

export type AngleReport = Pick<FlightReport, 'pos' | 'delta' | 'angle' | 'angleX' | 'accPower' | 'turnAngle' | 'tick'>;

/** PLAYERANGLE: `v, vd, f, fAngleX, fAccPower, fTurnAngle, nTickCount` (48 bytes). */
export function encodePlayerAngle(r: AngleReport): Uint8Array {
  return clientPacket(PacketType.PLAYERANGLE).vec3(r.pos).vec3(r.delta).f32(r.angle).f32(r.angleX).f32(r.accPower)
    .f32(r.turnAngle).i64(r.tick).toBytes();
}

/** MELEE_ATTACK2: `OBJMSG_ATK1` (or another) at `targetId`, `nParam2` and `nParam3` 0. */
export function encodeMeleeAttack2(message: number, targetId: number): Uint8Array {
  return clientPacket(PacketType.MELEE_ATTACK2).u32(message).u32(targetId).i32(0).i32(0).toBytes();
}

export function readMoverMoved2(r: ArReader): MessageOf<'moverMoved2'> {
  const move = readFlightReport(r);
  return { type: 'moverMoved2', move, frames: r.u8() };
}

export function readMoverBehavior2(r: ArReader): MessageOf<'moverBehavior2'> {
  return { type: 'moverBehavior2', move: readFlightReport(r) };
}

export function readMoverCorr2(r: ArReader): MessageOf<'moverCorr2'> {
  return { type: 'moverCorr2', move: readFlightReport(r) };
}

export function readSetFuel(r: ArReader): MessageOf<'setFuel'> {
  const fuel = r.i32();
  return { type: 'setFuel', fuel, accFuel: r.i32() };
}

export function readMeleeAttack2(r: ArReader): MessageOf<'meleeAttack2'> {
  const message = r.u32();
  const targetId = r.u32();
  const param2 = r.i32();
  return { type: 'meleeAttack2', message, targetId, param2, param3: r.i32() };
}

export function readSendActMsg(r: ArReader): MessageOf<'sendActMsg'> {
  const message = r.i32();
  const fly = r.i32() !== 0;
  const param1 = r.i32();
  const param2 = r.i32();
  return { type: 'sendActMsg', message, fly, param1, param2, param3: r.i32() };
}

/** For the pretend servers: the PLAYERANGLE fields. */
export function readAngleReport(r: ArReader): AngleReport {
  const pos: Vec3 = r.vec3();
  const delta: Vec3 = r.vec3();
  const angle = r.f32();
  const angleX = r.f32();
  const accPower = r.f32();
  const turnAngle = r.f32();
  return { pos, delta, angle, angleX, accPower, turnAngle, tick: r.i64() };
}
