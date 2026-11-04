import { describe, expect, it } from 'vitest';
import {
  ArReader, ArWriter, MessageType, PacketType, WORLD_READERS, decodeWorldPacket, encodeMeleeAttack2, encodePlayerAngle,
  encodePlayerBehavior2, encodePlayerCorr2, encodePlayerMoved2,
} from '../src';
import type { FlightReport } from '../src';

const f32 = Math.fround;
const header = { objectId: 9, playerObjectId: 9, type: 0, offset: 0 };
function read(type: number, bytes: Uint8Array) {
  const reader = WORLD_READERS.get(type);
  expect(reader, `reader for ${type}`).toBeDefined();
  const r = new ArReader(bytes);
  const value = reader!(r, header);
  r.expectEnd();
  return value;
}

const move: FlightReport = {
  pos: [6968.5, 120.25, 3328.75], delta: [0.125, -0.0625, -0.25], angle: 90.5, angleX: -12.5, accPower: f32(0.001725),
  turnAngle: f32(0.6), state: 0x404, stateFlag: 0x18, motion: 38, motionEx: -1, loop: 4, motionOption: 0x100,
  tick: 123456789012n,
};
/** The flight report's fields as Neuz writes them (`DPClient.cpp:10150-10175`); `angleXSlot` is what goes in angleX. */
const flightBody = (m: FlightReport, angleXSlot = m.angleX): ArWriter => new ArWriter()
  .vec3(m.pos).vec3(m.delta).f32(m.angle).f32(angleXSlot).f32(m.accPower).f32(m.turnAngle)
  .u32(m.state).u32(m.stateFlag).u32(m.motion).i32(m.motionEx).i32(m.loop).u32(m.motionOption).i64(m.tick);
const body = (bytes: Uint8Array): Uint8Array => bytes.slice(8);

describe('the flight packets (Piece 7 M5)', () => {
  it('copies the packet and message types of MsgHdr.h', () => {
    expect([PacketType.PLAYERMOVED2, PacketType.PLAYERBEHAVIOR2, PacketType.PLAYERCORR2, PacketType.PLAYERANGLE])
      .toEqual([0xffffff03, 0xffffff04, 0xffffff06, 0xffffff29]);
    expect(PacketType.MELEE_ATTACK2).toBe(0x00ff0014);
    expect([MessageType.MOVERMOVED2, MessageType.MOVERBEHAVIOR2, MessageType.MOVERCORR2]).toEqual([0x00cc, 0x00cd, 0x00c9]);
    expect([MessageType.SETFUEL, MessageType.MELEE_ATTACK2, MessageType.SENDACTMSG]).toEqual([0x004b, 0x00e4, 0x005c]);
  });

  it("PLAYERMOVED2 is Neuz's 73 bytes, nFrame last", () => {
    const bytes = encodePlayerMoved2(move, 37);
    const r = new ArReader(bytes);
    expect([r.u32(), r.u32()]).toEqual([0xffffffff, 0xffffff03]);
    expect(body(bytes)).toEqual(flightBody(move).u8(37).toBytes());
    expect(body(bytes)).toHaveLength(73);
  });

  it('PLAYERBEHAVIOR2 is the same 72 bytes without nFrame', () => {
    expect(body(encodePlayerBehavior2(move))).toEqual(flightBody(move).toBytes());
  });

  it('PLAYERCORR2 carries turnAngle where angleX goes (DPClient.cpp:10911)', () => {
    expect(body(encodePlayerCorr2(move))).toEqual(flightBody(move, move.turnAngle).toBytes());
  });

  it('PLAYERANGLE is 48 bytes', () => {
    const bytes = body(encodePlayerAngle(move));
    expect(bytes).toEqual(new ArWriter().vec3(move.pos).vec3(move.delta).f32(move.angle).f32(move.angleX)
      .f32(move.accPower).f32(move.turnAngle).i64(move.tick).toBytes());
    expect(bytes).toHaveLength(48);
  });

  it('MELEE_ATTACK2 has no float', () => {
    expect(body(encodeMeleeAttack2(29, 0xabcd))).toEqual(new ArWriter().u32(29).u32(0xabcd).i32(0).i32(0).toBytes());
  });

  it('reads the flight snapshots to their end', () => {
    expect(read(MessageType.MOVERMOVED2, flightBody(move).u8(37).toBytes())).toEqual({ type: 'moverMoved2', move, frames: 37 });
    expect(read(MessageType.MOVERBEHAVIOR2, flightBody(move).toBytes())).toEqual({ type: 'moverBehavior2', move });
    expect(read(MessageType.MOVERCORR2, flightBody(move).toBytes())).toEqual({ type: 'moverCorr2', move });
    expect(read(MessageType.SETFUEL, new ArWriter().i32(1200).i32(12000).toBytes())).toEqual({ type: 'setFuel', fuel: 1200, accFuel: 12000 });
    expect(read(MessageType.MELEE_ATTACK2, new ArWriter().u32(29).u32(0xabcd).i32(0).i32(0).toBytes()))
      .toEqual({ type: 'meleeAttack2', message: 29, targetId: 0xabcd, param2: 0, param3: 0 });
    expect(read(MessageType.SENDACTMSG, new ArWriter().i32(25).i32(1).i32(0).i32(0).i32(0).toBytes()))
      .toEqual({ type: 'sendActMsg', message: 25, fly: true, param1: 0, param2: 0, param3: 0 });
  });

  it('decodeClientPacket names the five flight packets', () => {
    expect(decodeWorldPacket(encodePlayerMoved2(move, 37))).toEqual({ type: 'playerMoved2', move, frames: 37 });
    expect(decodeWorldPacket(encodePlayerBehavior2(move))).toEqual({ type: 'playerBehavior2', move });
    expect(decodeWorldPacket(encodePlayerCorr2(move))).toEqual({ type: 'playerCorr2', move: { ...move, angleX: move.turnAngle } });
    const { state: _s, stateFlag: _f, motion: _m, motionEx: _e, loop: _l, motionOption: _o, ...angle } = move;
    expect(decodeWorldPacket(encodePlayerAngle(move))).toEqual({ type: 'playerAngle', ...angle });
    expect(decodeWorldPacket(encodeMeleeAttack2(29, 7))).toEqual({ type: 'meleeAttack2', message: 29, targetId: 7, param2: 0, param3: 0 });
  });
});
