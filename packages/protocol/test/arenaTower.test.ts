// 2026-11-10: the Arena's enter and leave (`SendHdr( PACKETTYPE_ARENA_ENTER / _EXIT )`, `_Interface/WndWorld.cpp:5927-5934`)
// and the Forsaken Tower's teleport (`CDPClient::SendTeleportToHeavenTower`, `Neuz/DPClient.cpp:17828-17835`).

import { describe, expect, it } from 'vitest';
import {
  ArReader, PacketType, decodeWorldPacket, encodeArenaEnter, encodeArenaExit, encodeHeavenTowerTeleport,
} from '../src';

describe('the Arena packets (__JEFF_11_4)', () => {
  it('ARENA_ENTER and ARENA_EXIT are the type alone after DPID_UNKNOWN (MsgHdr.h:686-687)', () => {
    for (const [bytes, type, name] of [
      [encodeArenaEnter(), 0x70000010, 'arenaEnter'],
      [encodeArenaExit(), 0x70000011, 'arenaExit'],
    ] as const) {
      const r = new ArReader(bytes);
      expect(r.u32()).toBe(0xffffffff);
      expect(r.u32()).toBe(type);
      r.expectEnd();
      expect(decodeWorldPacket(bytes)).toEqual({ type: name });
    }
    expect(PacketType.ARENA_ENTER).toBe(0x70000010);
    expect(PacketType.ARENA_EXIT).toBe(0x70000011);
  });
});

describe('the Forsaken Tower teleport (__VER >= 12, __HEAVEN_TOWER)', () => {
  it('HEAVENTOWER_TELEPORT is the floor as an int (MsgHdr.h:713; CDPSrvr::OnTeleportToHeavenTower, DPSrvr.cpp:9509-9575)', () => {
    const r = new ArReader(encodeHeavenTowerTeleport(3));
    expect(r.u32()).toBe(0xffffffff);
    expect(r.u32()).toBe(0x70001008);
    expect(r.i32()).toBe(3);
    r.expectEnd();
    expect(PacketType.HEAVENTOWER_TELEPORT).toBe(0x70001008);
    for (const floor of [1, 2, 3, 4, 5]) {
      expect(decodeWorldPacket(encodeHeavenTowerTeleport(floor))).toEqual({ type: 'heavenTowerTeleport', floor });
    }
  });

  it('refuses a floor the window never sends (only 1-5 go out, WndField.cpp:21851-21856)', () => {
    for (const floor of [0, 6, 7, -1, 1.5]) expect(() => encodeHeavenTowerTeleport(floor)).toThrow();
  });
});
