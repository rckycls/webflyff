// 2026-11-15 (guild bank): the guild bank's packets (research-note.md §1, B-server.md §1.2), read as Neuz's handlers read
// them and written as its senders write them.
import { describe, expect, it } from 'vitest';
import {
  encodeBundle, writeGetGoldGuildBank, writeGetItemGuildBank, writeGuildBankLog, writeGuildBankWindow, writePutItemGuildBank,
  writeRemoveGuildBankItem,
} from '@flyffweb/testkit';
import {
  GuildBankMode, GuildBankPacket, GuildLogType, NULL_ID, PacketType, WORLD_READERS, decodeWorldPacket, encodeCloseGuildBankWnd,
  encodeCreateGuildCloak, encodeGetGoldGuildBank, encodeGetItemGuildBank, encodeGuildBankLogView, encodeOpenGuildBankWnd,
  encodePutItemGuildBank, isGuildBankMessage, readBundle,
} from '../src';

const SELF = 9;
const OTHER = 12;

function read(messages: Parameters<typeof encodeBundle>[2]) {
  const result = readBundle(encodeBundle(PacketType.SNAPSHOT, SELF, messages), WORLD_READERS);
  expect(result.mismatched).toEqual([]);
  return result.messages.map((m) => m.value);
}

describe('the guild bank snapshots', () => {
  it('reads the window with the penya and the bank', () => {
    const items = [{ objectId: 0, itemId: 21, count: 1 }, { objectId: 7, itemId: 2029, count: 40 }];
    const [value] = read([writeGuildBankWindow(SELF, 2_500_000_000, items)]);
    expect(value).toEqual({
      type: 'guildBankWindow', mode: 0, gold: 2_500_000_000,
      bank: { slots: Array.from({ length: 42 }, (_, i) => i), items },
    });
  });

  it('reads the item and penya moves, the removal and the log', () => {
    const item = { objectId: 3, itemId: 2029, count: 7 };
    const values = read([
      writePutItemGuildBank(SELF, item),
      writePutItemGuildBank(OTHER, item, GuildBankMode.ITEM_ALL),
      writeGetItemGuildBank(SELF, item),
      writeGetItemGuildBank(OTHER, item, GuildBankMode.ITEM_ALL),
      writeGetGoldGuildBank(SELF, 5000, 500),
      writeGetGoldGuildBank(SELF, 10000, 500, GuildBankMode.PENYA_ALL, true),
      writeRemoveGuildBankItem(SELF, 77, NULL_ID, 300),
      writeGuildBankLog(SELF, GuildLogType.ITEM_ADD, [{ name: 'Webby', date: 1_763_100_000, value: 2029, option: 3, count: 7 }]),
      writeGuildBankLog(SELF, GuildLogType.PENYA_REMOVE, [{ name: 'Webby', date: 1_763_100_000, value: 5000, option: 0, count: 0 }]),
    ]);
    expect(values).toEqual([
      { type: 'putItemGuildBank', mode: 1, item },
      { type: 'putItemGuildBank', mode: 3, item },
      { type: 'getItemGuildBank', mode: 1, item },
      { type: 'getItemGuildBank', mode: 3, item },
      { type: 'getGoldGuildBank', mode: 0, gold: 5000, playerId: 500, cloak: false },
      { type: 'getGoldGuildBank', mode: 2, gold: 10000, playerId: 500, cloak: true },
      { type: 'removeGuildBankItem', guildId: 77, objectId: NULL_ID, count: 300 },
      { type: 'guildBankLog', logType: 1, rows: [{ name: 'Webby', date: 1_763_100_000, value: 2029, option: 3, count: 7 }] },
      { type: 'guildBankLog', logType: 4, rows: [{ name: 'Webby', date: 1_763_100_000, value: 5000, option: 0, count: 0 }] },
    ]);
    expect(values.every((v) => isGuildBankMessage(v))).toBe(true);
  });
});

describe('the guild bank packets the browser sends (DPClient.cpp:9643-9737, :14145, :17022)', () => {
  it('writes each with its fields and reads it back', () => {
    const body = (bytes: Uint8Array): number[] => [...bytes.subarray(8)];
    expect([...encodeOpenGuildBankWnd().subarray(4, 8)]).toEqual([0x20, 0xb0, 0x00, 0xf0]);
    expect(body(encodePutItemGuildBank(7, 3))).toEqual([7, 3, 0, 0, 0, 1]);
    expect(body(encodeGetGoldGuildBank(0x01020304))).toEqual([0, 4, 3, 2, 1, 0]);
    expect(body(encodeCreateGuildCloak())).toEqual([]);
    expect([
      encodeOpenGuildBankWnd(), encodeCloseGuildBankWnd(), encodePutItemGuildBank(7, 3), encodeGetItemGuildBank(41, 99),
      encodeGetGoldGuildBank(500), encodeGuildBankLogView(GuildLogType.PENYA_ADD), encodeCreateGuildCloak(),
    ].map((bytes) => decodeWorldPacket(bytes))).toEqual([
      { type: 'openGuildBankWndRequest' },
      { type: 'closeGuildBankWndRequest' },
      { type: 'putItemGuildBankRequest', objectId: 7, count: 3, mode: 1 },
      { type: 'getItemGuildBankRequest', objectId: 41, count: 99, mode: 1 },
      { type: 'getItemGuildBankRequest', objectId: 0, count: 500, mode: 0 },
      { type: 'guildBankLogViewRequest', logType: 3 },
      { type: 'createGuildCloakRequest' },
    ]);
    expect(GuildBankPacket.CREATE_GUILDCLOAK).toBe(0x00ff0ffd);
  });
});
