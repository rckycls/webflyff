// 2026-11-15 (guild house): the guild house's packets (B-server.md §2.2), read as Neuz's handlers read them and written as
// its senders write them.
import { describe, expect, it } from 'vitest';
import {
  encodeBundle, writeGuildHouseAllInfo, writeGuildHousePacket, writeGuildHouseRemove, writeGuildHouseRestPoint,
} from '@flyffweb/testkit';
import {
  GuildHousePacket, GuildHousePacketType, NULL_ID, PacketType, WORLD_READERS, WI_GUILDHOUSE_SMALL, decodeWorldPacket,
  encodeGuildHouseBuy, encodeGuildHouseEnter, encodeGuildHouseGoOut, encodeGuildHousePacket, isGuildHouseMessage,
  isGuildHouseWorld, readBundle,
} from '../src';
import type { GuildFurniture } from '../src';

const SELF = 9;
const SOFA: GuildFurniture = { itemId: 20117, placed: true, pos: [80, 100, 70], angle: 45, objectId: 0x7001, secondsLeft: 600_000 };
const NEW: GuildFurniture = { itemId: 20115, placed: false, pos: [0, 0, 0], angle: 0, objectId: NULL_ID, secondsLeft: 0 };

function read(messages: Parameters<typeof encodeBundle>[2]) {
  const result = readBundle(encodeBundle(PacketType.SNAPSHOT, SELF, messages), WORLD_READERS);
  expect(result.mismatched).toEqual([]);
  return result.messages.map((m) => m.value);
}

describe('the guild house snapshots', () => {
  it('reads the login info with and without a house, the packets, the removal and the rest points', () => {
    const house = { guildId: 77, worldId: WI_GUILDHOUSE_SMALL, upkeepSecondsLeft: 604_800, furniture: [SOFA, NEW] };
    const values = read([
      writeGuildHouseAllInfo(SELF, true, house),
      writeGuildHouseAllInfo(SELF, false, null),
      writeGuildHousePacket(SELF, GuildHousePacketType.SETUP, 1, SOFA),
      writeGuildHousePacket(SELF, GuildHousePacketType.LISTDROP, 0, NEW),
      writeGuildHouseRemove(SELF),
      writeGuildHouseRestPoint(SELF, 250_000),
    ]);
    expect(values).toEqual([
      { type: 'guildHouseAllInfo', channel: true, house },
      { type: 'guildHouseAllInfo', channel: false, house: null },
      { type: 'guildHousePacket', packetType: 2, index: 1, furniture: SOFA },
      { type: 'guildHousePacket', packetType: 1, index: 0, furniture: NEW },
      { type: 'guildHouseRemove' },
      { type: 'guildHouseRestPoint', restPoint: 250_000 },
    ]);
    expect(values.every((v) => isGuildHouseMessage(v))).toBe(true);
    expect([211, 212, 213, 214, 215].map(isGuildHouseWorld)).toEqual([false, true, true, true, false]);
  });
});

describe('the guild house packets the browser sends (DPClient.cpp:19007-19009, GuildHouse.cpp:107-113)', () => {
  it('writes each with its fields and reads it back', () => {
    const body = (bytes: Uint8Array): number[] => [...bytes.subarray(8)];
    expect([...encodeGuildHouseBuy().subarray(4, 8)]).toEqual([0x01, 0x00, 0x10, 0x88]);
    expect(body(encodeGuildHouseEnter())).toEqual([]);
    const upkeep = encodeGuildHousePacket(GuildHousePacketType.UPKEEP, NULL_ID, { ...NEW, itemId: 3 });
    expect(upkeep.length).toBe(8 + 8 + 32);
    expect([
      encodeGuildHouseBuy(), encodeGuildHouseEnter(), encodeGuildHouseGoOut(), upkeep,
      encodeGuildHousePacket(GuildHousePacketType.RESET, 4, SOFA),
    ].map((bytes) => decodeWorldPacket(bytes))).toEqual([
      { type: 'guildHouseBuyRequest' },
      { type: 'guildHouseEnterRequest' },
      { type: 'guildHouseGoOutRequest' },
      { type: 'guildHousePacketRequest', packetType: 6, index: -1, furniture: { ...NEW, itemId: 3 } },
      { type: 'guildHousePacketRequest', packetType: 4, index: 4, furniture: SOFA },
    ]);
    expect(GuildHousePacket.PACKET).toBe(0x88100003);
  });
});
