// 2026-11-15 (guild bank): the guild bank's snapshots as the world server writes them (`CUser::AddGuildBankWindow`,
// `AddPutItemGuildBank`, `AddGetItemGuildBank`, `AddGetGoldGuildBank`, `AddRemoveGuildBankItem`, `AddGuildBankLogView` and
// `CUserMng::AddPutItemElem` / `AddGetItemElem`, `WORLDSERVER/User.cpp:972-1002, :1076-1092, :2223-2231, :5343-5373,
// :7998-8017`), in the order of the readers (`@flyffweb/protocol` world/guildBank.ts).

import { ArWriter, GuildBankMessageType, GuildLogType, MAX_GUILDBANK, NULL_ID } from '@flyffweb/protocol';
import type { GuildBankLogRow, InventoryItem } from '@flyffweb/protocol';
import { writeItemElem } from './world';
import type { ScriptMessage } from './world';

const scripted = (objectId: number, type: number, w: ArWriter = new ArWriter()): ScriptMessage =>
  ({ objectId, type, fields: w.toBytes() });

/**
 * GUILD_BANK_WND mode 0 (`AddGuildBankWindow`, :1076-1092): the guild's penya and the bank, 42 slots (`m_apIndex` as a
 * fresh container has it, the count, each item's slot and `CItemElem`, the object indexes). `items` in rising slot order
 * (`objectId` 0 to 41).
 */
export function writeGuildBankWindow(selfId: number, gold: number, items: readonly InventoryItem[]): ScriptMessage {
  const w = new ArWriter().i32(0).u32(gold);
  for (let i = 0; i < MAX_GUILDBANK; i++) w.u32(i);
  w.u8(items.length);
  for (const item of items) {
    if (item.objectId < 0 || item.objectId >= MAX_GUILDBANK) throw new Error(`guild bank slot ${item.objectId} is not one of ${MAX_GUILDBANK}`);
    w.u8(item.objectId);
    writeItemElem(w, item);
  }
  for (let i = 0; i < MAX_GUILDBANK; i++) w.u32(NULL_ID);
  return scripted(selfId, GuildBankMessageType.GUILD_BANK_WND, w);
}

/** PUTITEMGUILDBANK (`AddPutItemGuildBank` mode 1; `AddPutItemElem` mode 3 with the putter's id). */
export function writePutItemGuildBank(objectId: number, item: InventoryItem, mode = 1): ScriptMessage {
  const w = new ArWriter().u8(mode);
  writeItemElem(w, item);
  return scripted(objectId, GuildBankMessageType.PUTITEMGUILDBANK, w);
}

/** GETITEMGUILDBANK with an item (`AddGetItemGuildBank` mode 1; `AddGetItemElem` mode 3): `item.objectId` the bank's id. */
export function writeGetItemGuildBank(objectId: number, item: InventoryItem, mode = 1): ScriptMessage {
  const w = new ArWriter().u8(mode);
  writeItemElem(w, item);
  return scripted(objectId, GuildBankMessageType.GETITEMGUILDBANK, w);
}

/** GETITEMGUILDBANK with penya (`AddGetGoldGuildBank`, :994-1002): mode 0 the own take, 2 another's; `cloak` a cloak's. */
export const writeGetGoldGuildBank = (objectId: number, gold: number, playerId: number, mode = 0, cloak = false): ScriptMessage =>
  scripted(objectId, GuildBankMessageType.GETITEMGUILDBANK, new ArWriter().u8(mode).u32(gold).u32(playerId).u8(cloak ? 1 : 0));

/** REMOVE_GUILD_BANK_ITEM (`AddRemoveGuildBankItem`, :2223-2231): `objectId` NULL_ID for penya. */
export const writeRemoveGuildBankItem = (selfId: number, guildId: number, objectId: number, count: number): ScriptMessage =>
  scripted(selfId, GuildBankMessageType.REMOVE_GUILD_BANK_ITEM, new ArWriter().u32(guildId).u32(objectId).u32(count));

/** GUILDLOG_VIEW (`AddGuildBankLogView`, :7998-8017): the item lists carry the option and the count too. */
export function writeGuildBankLog(selfId: number, logType: number, rows: readonly GuildBankLogRow[]): ScriptMessage {
  const w = new ArWriter().u8(logType).i16(rows.length);
  const items = logType === GuildLogType.ITEM_ADD || logType === GuildLogType.ITEM_REMOVE;
  for (const row of rows) {
    w.string(row.name).i32(row.date).i32(row.value);
    if (items) w.i32(row.option).i32(row.count);
  }
  return scripted(selfId, GuildBankMessageType.GUILDLOG_VIEW, w);
}
