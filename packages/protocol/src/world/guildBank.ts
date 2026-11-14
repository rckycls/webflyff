// The guild bank's packets (2026-11-15, side-session-notes housing-research/research-note.md §1, B-server.md §1.2), both
// ways. The reads copy Neuz's handlers, the writes its senders; the server's writers are `CUser::Add*` and
// `CUserMng::AddPutItemElem` / `AddGetItemElem` (`WORLDSERVER/User.cpp:972-1002, :1076-1092, :5343-5373, :7998-8017`).
//
//   snapshots   CDPClient::OnGuildBankWindow      Neuz/DPClient.cpp:3010-3034   GUILD_BANK_WND 0x00fa: int mode; mode 0: DWORD
//                                                                               the guild's penya, the bank (CItemContainer, 42)
//               OnPutItemGuildBank                :2843-2851                    PUTITEMGUILDBANK 0x00ef: BYTE 1 (mine) / 3 (a
//                                                                               member in view), CItemElem: m_GuildBank.Add
//               OnGetItemGuildBank                :2853-2943                    GETITEMGUILDBANK 0x00d4: BYTE mode; 0 / 2 (the
//                                                                               penya, mine / another's): DWORD, u_long player,
//                                                                               BYTE cloak; 1 / 3 (an item): CItemElem
//               OnRemoveGuildBankItem             :16120-16134                  REMOVE_GUILD_BANK_ITEM 0x00f3: u_long guild,
//                                                                               DWORD id (NULL_ID the penya), DWORD count
//               OnGuildBankLogList                :17029-17175                  GUILDLOG_VIEW 0x0142: BYTE type, short n, each
//                                                                               string name, long date, long item (or penya);
//                                                                               types 1-2 also long option, long count
//   senders     SendOpenGuildBankWnd / SendCloseGuildBankWnd   :9643-9652   SendPutItemGuildBank / SendGetItemGuildBank :9722-9737
//               SendReqGuildBankLogList :17022-17027   SendCreateGuildCloak :14145-14152 (SendHdr: the type alone)

import type { ArReader } from '../ar/ArReader';
import { clientPacket } from './packet';
import { readInventoryItem, readSmallContainer } from './own';
import type { InventoryItem } from './types';

/** The guild bank's packet types, client to world (`Source/_Network/MsgHdr.h:249, :332-333, :469-471, :662`). */
export const GuildBankPacket = {
  CREATE_GUILDCLOAK: 0x00ff0ffd,
  GUILD_BANK_WND_CLOSE: 0xffffff3e,
  GUILD_BANK_MOVEITEM: 0xffffff3f,
  GUILD_BANK_WND: 0xf000b020,
  PUTITEMGUILDBANK: 0xf000b021,
  GETITEMGUILDBANK: 0xf000b022,
  GUILDLOG_VIEW: 0xf000f810,
} as const;

/** The guild bank's snapshot types (`MsgHdr.h:1131, :1140-1142, :1198`). */
export const GuildBankMessageType = {
  GETITEMGUILDBANK: 0x00d4,
  PUTITEMGUILDBANK: 0x00ef,
  REMOVE_GUILD_BANK_ITEM: 0x00f3,
  GUILD_BANK_WND: 0x00fa,
  GUILDLOG_VIEW: 0x0142,
} as const;

/** `ENABLE_GUILD_INVENTORY` (`_Common/flyffevent.h:6`, the 3rd of the enum): WorldServer.ini's `GUILDBANK`, a local event. */
export const ENABLE_GUILD_INVENTORY = 2;

/** `MAX_GUILDBANK` (`_Common/ProjectCmn.h:8`): the guild bank's slots. */
export const MAX_GUILDBANK = 42;

/** GETITEMGUILDBANK's modes (`_Common/guild.h:420`): the own take, or another member's. */
export const GuildBankMode = {
  PENYA_MINE: 0,
  ITEM_MINE: 1,
  PENYA_ALL: 2,
  ITEM_ALL: 3,
} as const;

/** GUILDLOG_VIEW's lists (`GI_LOG_VIEW_*`, `MsgHdr.h:1572-1575`): the four tabs of the log window. */
export const GuildLogType = {
  ITEM_ADD: 1,
  ITEM_REMOVE: 2,
  PENYA_ADD: 3,
  PENYA_REMOVE: 4,
} as const;

/** The name's buffer of the log reader (`char szPlayer[42]`, `ReadString( szPlayer, 42 )`). */
const LOG_NAME_BUFFER = 42;

/** One row of the guild bank log: the player, the time (seconds since 1970), the item id (the penya on types 3-4). */
export interface GuildBankLogRow {
  name: string;
  date: number;
  /** The item's id; the penya moved on the penya lists. */
  value: number;
  /** The item's upgrade (`nItemAbilityOption`) and count; 0 on the penya lists. */
  option: number;
  count: number;
}

/** The guild bank's snapshots. PUTITEMGUILDBANK and GETITEMGUILDBANK's item modes come for the own take and for another's. */
export type GuildBankMessage =
  /** Mode 0: the window opens with the guild's penya and the whole bank; any other mode carries nothing. */
  | { type: 'guildBankWindow'; mode: number; gold: number; bank: { slots: number[]; items: InventoryItem[] } | null }
  /** An item gone into the bank: `m_GuildBank.Add( item )` whatever the mode (the item's object id is not used). */
  | { type: 'putItemGuildBank'; mode: number; item: InventoryItem }
  /** An item come out of the bank (its object id is the bank's): mode 1 into the own bag too, 3 from the bank only. */
  | { type: 'getItemGuildBank'; mode: number; item: InventoryItem }
  /** Penya come out of the guild's: mode 0 into the own bag too; `cloak` a cloak's 10,000 (no contribution lowered). */
  | { type: 'getGoldGuildBank'; mode: number; gold: number; playerId: number; cloak: boolean }
  /** A GM's removal (the DB's table): `objectId` NULL_ID takes penya. */
  | { type: 'removeGuildBankItem'; guildId: number; objectId: number; count: number }
  | { type: 'guildBankLog'; logType: number; rows: GuildBankLogRow[] };

export function readGuildBankWindow(r: ArReader): GuildBankMessage {
  const mode = r.i32();
  if (mode !== 0) return { type: 'guildBankWindow', mode, gold: 0, bank: null };
  const gold = r.u32();
  return { type: 'guildBankWindow', mode, gold, bank: readSmallContainer(r, MAX_GUILDBANK, 'the guild bank') };
}

export function readPutItemGuildBank(r: ArReader): GuildBankMessage {
  const mode = r.u8();
  return { type: 'putItemGuildBank', mode, item: readInventoryItem(r) };
}

export function readGetItemGuildBank(r: ArReader): GuildBankMessage {
  const mode = r.u8();
  if (mode === GuildBankMode.PENYA_MINE || mode === GuildBankMode.PENYA_ALL) {
    const gold = r.u32(), playerId = r.u32();
    return { type: 'getGoldGuildBank', mode, gold, playerId, cloak: r.u8() === 1 };
  }
  return { type: 'getItemGuildBank', mode, item: readInventoryItem(r) };
}

export function readRemoveGuildBankItem(r: ArReader): GuildBankMessage {
  const guildId = r.u32(), objectId = r.u32();
  return { type: 'removeGuildBankItem', guildId, objectId, count: r.u32() };
}

export function readGuildBankLog(r: ArReader): GuildBankMessage {
  const logType = r.u8(), n = r.i16();
  const items = logType === GuildLogType.ITEM_ADD || logType === GuildLogType.ITEM_REMOVE;
  const rows: GuildBankLogRow[] = [];
  for (let i = 0; i < n; i++) {
    const name = r.string(LOG_NAME_BUFFER), date = r.i32(), value = r.i32();
    if (items) {
      const option = r.i32();
      rows.push({ name, date, value, option, count: r.i32() });
    } else rows.push({ name, date, value, option: 0, count: 0 });
  }
  return { type: 'guildBankLog', logType, rows };
}

/** The snapshot readers of the guild bank, for `WORLD_READERS`. */
export const GUILD_BANK_READERS: ReadonlyArray<[number, (r: ArReader) => GuildBankMessage]> = [
  [GuildBankMessageType.GUILD_BANK_WND, readGuildBankWindow],
  [GuildBankMessageType.PUTITEMGUILDBANK, readPutItemGuildBank],
  [GuildBankMessageType.GETITEMGUILDBANK, readGetItemGuildBank],
  [GuildBankMessageType.REMOVE_GUILD_BANK_ITEM, readRemoveGuildBankItem],
  [GuildBankMessageType.GUILDLOG_VIEW, readGuildBankLog],
];

const GUILD_BANK_TYPES: ReadonlySet<string> = new Set([
  'guildBankWindow', 'putItemGuildBank', 'getItemGuildBank', 'getGoldGuildBank', 'removeGuildBankItem', 'guildBankLog',
]);

/** Whether a world message is one of the guild bank's. */
export function isGuildBankMessage(message: { type: string }): message is GuildBankMessage {
  return GUILD_BANK_TYPES.has(message.type);
}

// --- the client's packets ---

/** `SendOpenGuildBankWnd()` (:9643-9647): the type alone. */
export const encodeOpenGuildBankWnd = (): Uint8Array => clientPacket(GuildBankPacket.GUILD_BANK_WND).toBytes();

/** `SendCloseGuildBankWnd()` (:9649-9652). */
export const encodeCloseGuildBankWnd = (): Uint8Array => clientPacket(GuildBankPacket.GUILD_BANK_WND_CLOSE).toBytes();

/** `SendPutItemGuildBank( nId, ItemNum, 1 )` (:9722-9727): the bag object `objectId`, a DWORD count, mode 1 (an item). */
export const encodePutItemGuildBank = (objectId: number, count: number): Uint8Array =>
  clientPacket(GuildBankPacket.PUTITEMGUILDBANK).u8(objectId).u32(count).u8(1).toBytes();

/** `SendGetItemGuildBank( nId, ItemNum, 1 )` (:9729-9734): the bank object `objectId`, a DWORD count, mode 1. */
export const encodeGetItemGuildBank = (objectId: number, count: number): Uint8Array =>
  clientPacket(GuildBankPacket.GETITEMGUILDBANK).u8(objectId).u32(count).u8(1).toBytes();

/** `SendGetItemGuildBank( id, nCost, 0 )` (WndField.cpp:8574-8582): penya out of the guild's; the id is not read. */
export const encodeGetGoldGuildBank = (gold: number): Uint8Array =>
  clientPacket(GuildBankPacket.GETITEMGUILDBANK).u8(0).u32(gold).u8(0).toBytes();

/** `SendReqGuildBankLogList( byListType )` (:17022-17027). */
export const encodeGuildBankLogView = (logType: number): Uint8Array =>
  clientPacket(GuildBankPacket.GUILDLOG_VIEW).u8(logType).toBytes();

/** `SendCreateGuildCloak()` (:14145-14152): the type alone. */
export const encodeCreateGuildCloak = (): Uint8Array => clientPacket(GuildBankPacket.CREATE_GUILDCLOAK).toBytes();

/** For the pretend servers: a client packet of the guild bank after its type, by the encoders' parameter names. */
export type GuildBankRequestPacket =
  | { type: 'openGuildBankWndRequest' }
  | { type: 'closeGuildBankWndRequest' }
  | { type: 'putItemGuildBankRequest'; objectId: number; count: number; mode: number }
  | { type: 'getItemGuildBankRequest'; objectId: number; count: number; mode: number }
  | { type: 'guildBankLogViewRequest'; logType: number }
  | { type: 'createGuildCloakRequest' };

export function readGuildBankRequestPacket(packetType: number, r: ArReader): GuildBankRequestPacket | null {
  switch (packetType) {
    case GuildBankPacket.GUILD_BANK_WND:
      return { type: 'openGuildBankWndRequest' };
    case GuildBankPacket.GUILD_BANK_WND_CLOSE:
      return { type: 'closeGuildBankWndRequest' };
    case GuildBankPacket.PUTITEMGUILDBANK: case GuildBankPacket.GETITEMGUILDBANK: {
      const objectId = r.u8(), count = r.u32(), mode = r.u8();
      const type = packetType === GuildBankPacket.PUTITEMGUILDBANK ? 'putItemGuildBankRequest' : 'getItemGuildBankRequest';
      return { type, objectId, count, mode };
    }
    case GuildBankPacket.GUILDLOG_VIEW:
      return { type: 'guildBankLogViewRequest', logType: r.u8() };
    case GuildBankPacket.CREATE_GUILDCLOAK:
      return { type: 'createGuildCloakRequest' };
    default:
      return null;
  }
}
