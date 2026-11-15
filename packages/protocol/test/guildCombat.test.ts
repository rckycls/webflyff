// 2026-11-15 (Guild Siege): SNAPSHOTTYPE_GUILDCOMBAT 0xb8 and the siege's client packets
// (Neuz/DPClient.cpp:6745-7808 and :9115-9205), read as Neuz reads them and written as it writes them.
import { describe, expect, it } from 'vitest';
import { encodeBundle, writeGuildCombat } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import {
  ArReader, GuildCombatMessageType, GuildCombatPacketType, GuildCombatSub, PacketType, WORLD_READERS, decodeWorldPacket,
  encodeGcApply, encodeGcCancel, encodeGcJoin, encodeGcLineup, encodeGcLineupWindow, encodeGcPenyaGuild, encodeGcPenyaPlayer,
  encodeGcPlayerPoint, encodeGcSelectMap, encodeGcStatus, encodeGcTele, encodeGcWindow, readBundle, readGuildCombat,
} from '../src';
import type { GuildCombatMessage } from '../src';

const PLAYER = 9;

function read(messages: ScriptMessage[]) {
  const result = readBundle(encodeBundle(PacketType.SNAPSHOT, PLAYER, messages), WORLD_READERS);
  expect(result.skipped).toEqual([]);
  expect(result.mismatched).toEqual([]);
  return result.messages;
}

const g = (m: Record<string, unknown>): GuildCombatMessage => ({ type: 'guildCombat', ...m }) as GuildCombatMessage;

const CASES: Array<[string, GuildCombatMessage]> = [
  ['WINGUILD', g({ sub: 'winGuild', combatIndex: 12, winGuildId: 70001, winCount: 3 })],
  ['IN_WINDOW', g({ sub: 'inWindow', totalPrize: 123456789012, ownBid: 5000000, minBid: 1000000 })],
  ['IN_WINDOW (prize beyond 2^53 stays a bigint)', g({ sub: 'inWindow', totalPrize: 9007199254740993n, ownBid: 0, minBid: 1 })],
  ['REQUEST_STATUS', g({ sub: 'requestStatus', secondsToNext: 3600, prize: 4000000000, guildNames: ['Bakers', 'Zed Guild'], ownBid: 2000000 })],
  ['REQUEST_STATUS (no applicants)', g({ sub: 'requestStatus', secondsToNext: 0, prize: 0, guildNames: [], ownBid: 0 })],
  ['SELECTPLAYER (window)', g({ sub: 'selectPlayer', maxJoin: 20, maxWar: 5, requestWar: true, window: true, defenderId: 7, playerIds: [7, 9, 11] })],
  ['SELECTPLAYER (completed)', g({ sub: 'selectPlayer', maxJoin: 20, maxWar: 5, requestWar: true, window: false, defenderId: 0, playerIds: [] })],
  ['SELECTPLAYER (no war request)', g({ sub: 'selectPlayer', maxJoin: 20, maxWar: 5, requestWar: false, window: false, defenderId: 0, playerIds: [] })],
  ['SELECTWARPOS', g({ sub: 'selectWarPos', map: 99, seconds: 60 })],
  ['BESTPLAYER', g({ sub: 'bestPlayer', playerId: 500 })],
  ['ISREQUEST', g({ sub: 'isRequest', requested: true })],
  ['USERSTATE', g({ sub: 'userState', moverId: 0x2001, state: 2 })],
  ['WARPLAYERLIST', g({
    sub: 'warPlayerList',
    guilds: [{ defenderId: 7, members: [{ playerId: 7, status: 1 }, { playerId: 9, status: 0 }] }, { defenderId: 8, members: [] }],
  })],
  ['GUILDSTATUS', g({ sub: 'guildStatus', joinIndex: 5, players: [{ playerId: 7, lives: 3 }, { playerId: 9, lives: 0 }] })],
  ['GUILDPRECEDENCE', g({ sub: 'guildPrecedence', guilds: [{ has: true, name: 'Bakers', points: 40 }, { has: false }, { has: true, name: 'Zed', points: 2 }] })],
  ['PLAYERPRECEDENCE', g({ sub: 'playerPrecedence', guilds: [[{ playerId: 7, points: 12 }], [], [{ playerId: 8, points: 3 }, { playerId: 9, points: 1 }]] })],
  ['GCSTATE', g({ sub: 'gcState', state: 2, warState: 104 })],
  ['NEXTTIMESTATE', g({ sub: 'nextTimeState', msLeft: 600000, nextState: 105 })],
  ['ENTERTIME', g({ sub: 'enterTime', msLeft: 120000 })],
  ['DIAGMESSAGE', g({ sub: 'diagMessage', text: 'The siege starts.' })],
  ['TELE', g({ sub: 'tele', text: 'Go to the arena?' })],
  ['LOG', g({
    sub: 'log',
    entries: [{ atkGuildId: 1, defGuildId: 2, atkPlayerId: 3, defPlayerId: 4, point: 5, diffGuild: true, master: false, defender: true, lastLife: false }],
  })],
  ['LOG_REALTIME', g({
    sub: 'logRealtime', atkGuildId: 1, defGuildId: 2, atkName: 'Ann', defName: 'Bob', atkPlayerId: 3, defPlayerId: 4, point: 6,
    diffGuild: true, master: true, defender: false, lastLife: true,
  })],
  ['GETPENYAGUILD', g({ sub: 'getPenyaGuild', result: 0, penya: 6000000000 })],
  ['GETPENYAPLAYER', g({ sub: 'getPenyaPlayer', result: 2, penya: 7 })],
  ['PLAYERPOINT', g({ sub: 'playerPoint', players: [{ playerId: 7, job: 15, point: 30 }, { playerId: 9, job: 20, point: 12 }] })],
];

describe('GUILDCOMBAT (SNAPSHOTTYPE_GUILDCOMBAT 0xb8)', () => {
  it('has the snapshot type and the sub-type ids of MsgHdr.h', () => {
    expect(GuildCombatMessageType).toEqual({ GUILDCOMBAT: 0xb8 });
    expect(GuildCombatSub.WARPLAYERLIST).toBe(0x11);
    expect(GuildCombatSub.PLAYERPOINT).toBe(0x42);
  });

  it.each(CASES)('every sub-type reads back what the testkit wrote: %s', (_name, message) => {
    const [first] = read([writeGuildCombat(PLAYER, message)]);
    expect(first?.objectId).toBe(PLAYER);
    expect(first?.value).toEqual(message);
  });

  it('writes the bytes in the order of A section 3.2 (WINGUILD: sub, int, u_long, int)', () => {
    const { fields } = writeGuildCombat(PLAYER, g({ sub: 'winGuild', combatIndex: 1, winGuildId: 2, winCount: 3 }));
    expect([...fields]).toEqual([0x00, 1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0]);
  });

  it('an unknown sub-type gives sub unknown and its id', () => {
    const [m] = read([writeGuildCombat(PLAYER, g({ sub: 'unknown', id: 0x7f }))]);
    expect(m?.value).toEqual({ type: 'guildCombat', sub: 'unknown', id: 0x7f });
    // GC_IN_APP (0x02) is one the client does not handle: with trailing bytes it is still dropped as unknown
    const r = new ArReader(Uint8Array.of(0x02, 1, 2, 3, 4));
    expect(readGuildCombat(r)).toEqual({ type: 'guildCombat', sub: 'unknown', id: 2 });
    expect(r.remaining()).toBe(0);
  });

  it('GC_WARPLAYERLIST with fewer guild blocks than its count reads the blocks present and stops at the snapshot end', () => {
    const full = writeGuildCombat(PLAYER, g({ sub: 'warPlayerList', guilds: [{ defenderId: 7, members: [{ playerId: 7, status: 1 }] }] }));
    // the count says 3, one block follows
    const fields = Uint8Array.from(full.fields);
    new DataView(fields.buffer).setInt32(1, 3, true);
    const [m] = read([{ ...full, fields }]);
    expect(m?.value).toEqual({
      type: 'guildCombat', sub: 'warPlayerList', guilds: [{ defenderId: 7, members: [{ playerId: 7, status: 1 }] }],
    });
  });

  it('a truncated snapshot is dropped as mismatched, not half read', () => {
    const full = writeGuildCombat(PLAYER, g({ sub: 'gcState', state: 2, warState: 104 }));
    const result = readBundle(encodeBundle(PacketType.SNAPSHOT, PLAYER, [{ ...full, fields: full.fields.subarray(0, 6) }]), WORLD_READERS);
    expect(result.messages).toEqual([]);
  });
});

describe('the siege packets the browser sends', () => {
  const typeOf = (bytes: Uint8Array): number => new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true);
  const body = (bytes: Uint8Array): number[] => [...bytes.subarray(8)];

  it('writes each as its Neuz sender, after the packet type', () => {
    expect(typeOf(encodeGcWindow())).toBe(0xf000d022);
    expect(body(encodeGcWindow())).toEqual([0x01]);
    expect(typeOf(encodeGcApply(100000000))).toBe(GuildCombatPacketType.IN);
    expect(body(encodeGcApply(100000000))).toEqual([0x02, 0x00, 0xe1, 0xf5, 0x05]);
    expect(typeOf(encodeGcCancel())).toBe(0xf000d023);
    expect(typeOf(encodeGcStatus())).toBe(0xf000d028);
    expect(typeOf(encodeGcLineupWindow())).toBe(0xf000d027);
    expect(body(encodeGcLineupWindow())).toEqual([1, 0, 0, 0]);
    // BOOL 0, u32 7, i32 2, u32 7, u32 9
    expect(typeOf(encodeGcLineup(7, [7, 9]))).toBe(0xf000d027);
    expect(body(encodeGcLineup(7, [7, 9]))).toEqual([0, 0, 0, 0, 7, 0, 0, 0, 2, 0, 0, 0, 7, 0, 0, 0, 9, 0, 0, 0]);
    expect(typeOf(encodeGcSelectMap(99))).toBe(0xf000d02b);
    expect(body(encodeGcSelectMap(99))).toEqual([99, 0, 0, 0]);
    expect(typeOf(encodeGcJoin())).toBe(0xf000d024);
    expect(typeOf(encodeGcPenyaGuild())).toBe(0xf000d02d);
    expect(typeOf(encodeGcPenyaPlayer())).toBe(0xf000d02e);
    expect(typeOf(encodeGcTele())).toBe(0xf000d030);
    expect(typeOf(encodeGcPlayerPoint())).toBe(0xf000d031);
    for (const bytes of [encodeGcCancel(), encodeGcStatus(), encodeGcJoin(), encodeGcPenyaGuild(), encodeGcPenyaPlayer(), encodeGcTele(), encodeGcPlayerPoint()]) {
      expect(body(bytes)).toEqual([]);
    }
  });

  it('reads each back for the pretend servers', () => {
    expect(decodeWorldPacket(encodeGcWindow())).toEqual({ type: 'gcWindowRequest' });
    expect(decodeWorldPacket(encodeGcApply(100000000))).toEqual({ type: 'gcApplyRequest', penya: 100000000 });
    expect(decodeWorldPacket(encodeGcCancel())).toEqual({ type: 'gcCancelRequest' });
    expect(decodeWorldPacket(encodeGcStatus())).toEqual({ type: 'gcStatusRequest' });
    expect(decodeWorldPacket(encodeGcLineupWindow())).toEqual({ type: 'gcLineupWindowRequest' });
    expect(decodeWorldPacket(encodeGcLineup(7, [7, 9]))).toEqual({ type: 'gcLineupRequest', defenderId: 7, playerIds: [7, 9] });
    expect(decodeWorldPacket(encodeGcSelectMap(2))).toEqual({ type: 'gcSelectMapRequest', map: 2 });
    expect(decodeWorldPacket(encodeGcJoin())).toEqual({ type: 'gcJoinRequest' });
    expect(decodeWorldPacket(encodeGcPenyaGuild())).toEqual({ type: 'gcPenyaGuildRequest' });
    expect(decodeWorldPacket(encodeGcPenyaPlayer())).toEqual({ type: 'gcPenyaPlayerRequest' });
    expect(decodeWorldPacket(encodeGcTele())).toEqual({ type: 'gcTeleRequest' });
    expect(decodeWorldPacket(encodeGcPlayerPoint())).toEqual({ type: 'gcPlayerPointRequest' });
  });
});
