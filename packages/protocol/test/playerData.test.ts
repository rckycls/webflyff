// The player data (Piece 7 M4, [R §4]): QUERY_PLAYER_DATA's answer in a snapshot, and the core's direct packets
// (`ERRORPARTY`, `UPDATE_PLAYER_DATA`, `LOGOUT`, `BLOCK`, [R §1.2]) as the cache port decodes them.

import { describe, expect, it } from 'vitest';
import { ArWriter, MessageType, PacketType, WORLD_READERS, decodeWorldPacket, readBundle } from '../src';

const str = (w: ArWriter, text: string): ArWriter => w.i32(text.length).bytes(new TextEncoder().encode(text));
/** `sPlayerData`, default packing: job @0, level @1, sex @2, a pad byte, `nVer` @4, `uLogin` @8, 3 pad bytes. */
const record = (w: ArWriter): ArWriter => w.u8(1).u8(23).u8(1).u8(0).i32(5).u8(1).u8(0).u8(0).u8(0);

describe('the player data ([R §4])', () => {
  it('QUERY_PLAYER_DATA reads the name and the 12-byte record', () => {
    const fields = record(str(new ArWriter().u32(70002), 'Lead')).toBytes();
    const snapshot = new ArWriter().u32(PacketType.SNAPSHOT).u32(0x1234).u16(2)
      .u32(0xffffffff).u16(MessageType.QUERY_PLAYER_DATA).bytes(fields)
      .u32(8).u16(0x00d1).u32(3).toBytes();
    const result = readBundle(snapshot, WORLD_READERS);
    expect(result.messages[0]!.value).toEqual({
      type: 'playerData', playerId: 70002, name: 'Lead', data: { job: 1, level: 23, sex: 1, version: 5, login: 1 },
    });
    expect(result.messages.map((m) => m.type)).toEqual([MessageType.QUERY_PLAYER_DATA, 0x00d1]);
    expect(result.stoppedAt).toBeNull();
  });

  it('decodeWorldPacket reads the direct ERRORPARTY, UPDATE_PLAYER_DATA, LOGOUT and BLOCK', () => {
    expect(decodeWorldPacket(new ArWriter().u32(0xffffff10).u32(203).toBytes()))
      .toEqual({ type: 'errorParty', code: 203, skill: null });
    expect(decodeWorldPacket(record(new ArWriter().u32(0xf000f808).u32(70002)).toBytes()))
      .toEqual({ type: 'updatePlayerData', playerId: 70002, data: { job: 1, level: 23, sex: 1, version: 5, login: 1 } });
    expect(decodeWorldPacket(new ArWriter().u32(0x7000000b).u32(70002).toBytes()))
      .toEqual({ type: 'playerLogout', playerId: 70002 });
    expect(decodeWorldPacket(str(new ArWriter().u32(0xffffff5a).u8(7), 'Lead').toBytes()))
      .toEqual({ type: 'block', gu: 7, name: 'Lead' });
  });
});
