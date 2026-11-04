import { describe, expect, it } from 'vitest';
import {
  ArReader, ArWriter, MessageType, PacketType, STATE_BASEMOTION_MODE, StateModeFlag, WORLD_READERS, decodeWorldPacket,
  encodeReturnScroll, encodeStateModeCancel, encodeUseItem,
} from '../src';

const header = { objectId: 9, playerObjectId: 9, type: 0, offset: 0 };
function read(type: number, bytes: Uint8Array) {
  const reader = WORLD_READERS.get(type);
  expect(reader, `reader for ${type}`).toBeDefined();
  const r = new ArReader(bytes);
  const value = reader!(r, header);
  r.expectEnd();
  return value;
}

describe('the travel packets (Piece 7 M3)', () => {
  it('copies the packet and message types of MsgHdr.h', () => {
    expect(PacketType.DOUSEITEM).toBe(0x00ff0021);
    expect(PacketType.STATEMODE).toBe(0xffffff7a);
    expect(PacketType.RETURNSCROLL).toBe(0xf000d010);
    expect(MessageType.STATEMODE).toBe(0x00df);
    expect(MessageType.RETURNSCORLL).toBe(0x00ad);
    expect(STATE_BASEMOTION_MODE).toBe(4);
    expect(StateModeFlag).toEqual({ ON: 0, OFF: 1, CANCEL: 2 });
  });

  it('encodeStateModeCancel writes mode 4 and CANCEL', () => {
    const bytes = encodeStateModeCancel();
    const r = new ArReader(bytes);
    expect([r.u32(), r.u32(), r.u32(), r.u8()]).toEqual([0xffffffff, 0xffffff7a, 4, 2]);
    r.expectEnd();
    expect(bytes).toHaveLength(13);
  });

  it('encodeReturnScroll writes the choice, -1 to 2 only', () => {
    const r = new ArReader(encodeReturnScroll(1));
    expect([r.u32(), r.u32(), r.i32()]).toEqual([0xffffffff, 0xf000d010, 1]);
    r.expectEnd();
    const back = new ArReader(encodeReturnScroll(-1)); back.bytes(8);
    expect(back.i32()).toBe(-1); // the way back, from the buff's icon (WndWorld.cpp:7265-7266)
    for (const bad of [3, -2, 0.5, NaN]) expect(() => encodeReturnScroll(bad)).toThrow(RangeError);
  });

  it('STATEMODE reads the item only when ON', () => {
    expect(read(MessageType.STATEMODE, new ArWriter().u32(4).u8(0).u32(4805).toBytes()))
      .toEqual({ type: 'stateMode', mode: 4, flag: 0, itemId: 4805 });
    expect(read(MessageType.STATEMODE, new ArWriter().u32(0).u8(1).toBytes()))
      .toEqual({ type: 'stateMode', mode: 0, flag: 1, itemId: null });
    expect(read(MessageType.STATEMODE, new ArWriter().u32(0).u8(2).toBytes()))
      .toEqual({ type: 'stateMode', mode: 0, flag: 2, itemId: null });
  });

  it('RETURNSCORLL has no body', () => {
    expect(read(MessageType.RETURNSCORLL, new Uint8Array(0))).toEqual({ type: 'returnScrollAck' });
  });

  it('decodeClientPacket names DOUSEITEM, STATEMODE and RETURNSCROLL', () => {
    expect(decodeWorldPacket(encodeUseItem(6))).toEqual({ type: 'useItem', objectId: 6, targetId: 0xffffffff, part: -1 });
    expect(decodeWorldPacket(encodeStateModeCancel())).toEqual({ type: 'stateMode', mode: 4, flag: 2 });
    expect(decodeWorldPacket(encodeReturnScroll(2))).toEqual({ type: 'returnScroll', select: 2 });
  });
});
