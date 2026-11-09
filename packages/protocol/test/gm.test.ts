import { describe, expect, it } from 'vitest';
import { ArReader, ArWriter, MessageType, PacketType, WORLD_READERS, decodeWorldPacket } from '../src';

const header = { objectId: 9, playerObjectId: 9, type: 0, offset: 0 };
function read(type: number, bytes: Uint8Array) {
  const reader = WORLD_READERS.get(type);
  expect(reader, `reader for ${type}`).toBeDefined();
  const r = new ArReader(bytes);
  const value = reader!(r, header);
  r.expectEnd();
  return value;
}

describe("the game masters' messages (2026-11-10)", () => {
  it('copies SNAPSHOTTYPE_MODIFYMODE of MsgHdr.h:1130', () => {
    expect(MessageType.MODIFYMODE).toBe(0x00d3);
  });

  it("MODIFYMODE reads the mover's whole m_dwMode (CUserMng::AddModifyMode, User.cpp:5158-5169)", () => {
    expect(read(MessageType.MODIFYMODE, new ArWriter().u32(0x00000003).toBytes()))
      .toEqual({ type: 'modifyMode', mode: 3 });
    expect(read(MessageType.MODIFYMODE, new ArWriter().u32(0x80000000).toBytes()))
      .toEqual({ type: 'modifyMode', mode: 0x80000000 });
  });

  it('TEXT reads its state byte first, as __S_SERVER_UNIFY writes it (CUser::AddText, User.cpp:705-716)', () => {
    expect(MessageType.TEXT).toBe(0x00a0);
    expect(read(MessageType.TEXT, new ArWriter().u8(1).string('Players online: 3').toBytes()))
      .toEqual({ type: 'serverText', state: 1, text: 'Players online: 3' });
    expect(read(MessageType.TEXT, new ArWriter().u8(2).string('Read this').toBytes()))
      .toEqual({ type: 'serverText', state: 2, text: 'Read this' });
  });

  it('CMDSETSKILLLEVEL reads the skill and its level (OnCmdSetSkillLevel, DPClient.cpp:13531-13535)', () => {
    expect(MessageType.CMDSETSKILLLEVEL).toBe(0x006b);
    expect(read(MessageType.CMDSETSKILLLEVEL, new ArWriter().u32(3).u32(10).toBytes()))
      .toEqual({ type: 'cmdSetSkillLevel', skill: 3, level: 10 });
  });

  it('DISGUISE reads the mover index; NODISGUISE has no body (OnDisguise, OnNoDisguise, DPClient.cpp:13706-13740)', () => {
    expect([MessageType.DISGUISE, MessageType.NODISGUISE]).toEqual([0x00f5, 0x00f6]);
    expect(read(MessageType.DISGUISE, new ArWriter().u32(21).toBytes())).toEqual({ type: 'disguise', moverIndex: 21 });
    expect(read(MessageType.NODISGUISE, new Uint8Array(0))).toEqual({ type: 'noDisguise' });
  });

  it("the core's answers: the player count, a player's address and a system notice (MsgHdr.h:207-210)", () => {
    expect([PacketType.GETPLAYERADDR, PacketType.GETPLAYERCOUNT, PacketType.SYSTEM]).toEqual([0x00ff00e7, 0x00ff00e8, 0x00ff00ea]);
    expect(decodeWorldPacket(new ArWriter().u32(0x00ff00e8).u16(42).toBytes())).toEqual({ type: 'playerCount', count: 42 });
    expect(decodeWorldPacket(new ArWriter().u32(0x00ff00e7).string('Rocky').string('10.0.0.7').toBytes()))
      .toEqual({ type: 'playerAddr', name: 'Rocky', addr: '10.0.0.7' });
    expect(decodeWorldPacket(new ArWriter().u32(0x00ff00ea).string('Server restart in 5 minutes').toBytes()))
      .toEqual({ type: 'systemNotice', text: 'Server restart in 5 minutes' });
  });
});
