// 2026-11-17 (view-equip-options): View Equipment's packets and the two mode options:
//   CDPClient::SendQueryEquip, SendQueryEquipSetting   Neuz/DPClient.cpp:15690-15702
//   CDPClient::SendChangePKPVPMode                     PACKETTYPE_MODE
//   CUser::AddQueryEquip / CDPClient::OnQueryEquip     WORLDSERVER/User.cpp:2860-2891, Neuz/DPClient.cpp:15706-15736

import { describe, expect, it } from 'vitest';
import {
  ArReader, ArWriter, EQUIP_DENIAL_MODE, NULL_ID, PVPCONFIRM_MODE, PVP_ACCEPT, PVP_REFUSE, PacketType, QUERYEQUIP_SNAPSHOT,
  QueryEquipPacket, WORLD_READERS, decodeWorldPacket, encodeChangeMode, encodeQueryEquip, encodeQueryEquipSetting, readBundle,
} from '../src';

describe('the View Equipment packets', () => {
  it('the type numbers and mode bits are MsgHdr.h\'s and authorization.h\'s', () => {
    expect(QueryEquipPacket).toEqual({ QUERYEQUIP: 0xf000d009, QUERYEQUIPSETTING: 0xf000d00a, MODE: 0xffffff7b });
    expect(QUERYEQUIP_SNAPSHOT).toBe(0x00ac);
    expect([PVPCONFIRM_MODE, EQUIP_DENIAL_MODE, PVP_ACCEPT, PVP_REFUSE]).toEqual([0x2000, 0x20000, 3, 2]);
  });

  it('QUERYEQUIP carries the object, QUERYEQUIPSETTING a BOOL, MODE the mode and the flag', () => {
    const query = new ArReader(encodeQueryEquip(0x1234));
    expect([query.u32(), query.u32(), query.u32()]).toEqual([NULL_ID, 0xf000d009, 0x1234]);
    query.expectEnd();
    const setting = new ArReader(encodeQueryEquipSetting(false));
    expect([setting.u32(), setting.u32(), setting.i32()]).toEqual([NULL_ID, 0xf000d00a, 0]);
    setting.expectEnd();
    const mode = new ArReader(encodeChangeMode(PVPCONFIRM_MODE, PVP_REFUSE));
    expect([mode.u32(), mode.u32(), mode.u32(), mode.i32()]).toEqual([NULL_ID, 0xffffff7b, 0x2000, 2]);
    mode.expectEnd();
    expect(decodeWorldPacket(encodeQueryEquip(0x1234))).toEqual({ type: 'queryEquipRequest', objectId: 0x1234 });
    expect(decodeWorldPacket(encodeQueryEquipSetting(true))).toEqual({ type: 'queryEquipSetting', allow: true });
    expect(decodeWorldPacket(encodeChangeMode(PVPCONFIRM_MODE, PVP_ACCEPT))).toEqual({ type: 'changeMode', mode: 0x2000, flag: 3 });
    expect(() => encodeQueryEquip(-1)).toThrow();
  });

  it('the snapshot gives each worn part\'s extras, and the bundle goes on after it', () => {
    const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(0x1234).u16(2);
    w.u32(0x1234).u16(0x00ac).i32(2);
    // the weapon: awakened, two cards, an ultimate jewel, fire +5
    w.i32(10).i64(0x0123456789n).u32(2).u32(9001).u32(0).u32(1).u32(2035).u32(0).u8(1).i32(5);
    // the suit: nothing on it
    w.i32(2).i64(0n).u32(0).u32(0).u32(0).u8(0).i32(0);
    w.u32(0x1234).u16(0x00b4).i32(1).u32(0).i32(0);
    const result = readBundle(w.toBytes(), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.messages.map((m) => m.value)).toEqual([
      {
        type: 'queryEquip', parts: [
          { part: 10, randomOption: 0x0123456789n, piercing: [9001, 0], ultimate: [2035], resist: 1, resistOption: 5 },
          { part: 2, randomOption: 0n, piercing: [], ultimate: [], resist: 0, resistOption: 0 },
        ],
      },
      { type: 'setCheerParam', points: 1, rest: 0, add: false },
    ]);
  });

  it('a part outside m_aEquipInfo is refused', () => {
    const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(0x1234).u16(1);
    w.u32(0x1234).u16(0x00ac).i32(1).i32(31).i64(0n).u32(0).u32(0).u32(0).u8(0).i32(0);
    expect(readBundle(w.toBytes(), WORLD_READERS).messages).toEqual([]);
  });
});
