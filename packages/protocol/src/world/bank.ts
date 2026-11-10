// The bank's packets (2026-11-10, docs/superpowers/specs/2026-11-10-bank-mail-research.md §1), both ways. The reads copy
// Neuz's handlers, the writes its senders; the server's writers are `CUser::Add*` (`WORLDSERVER/User.cpp:1012-1160`).
//
//   snapshots   CDPClient::OnPutItemBank      Neuz/DPClient.cpp:2881-2888   PUTITEMBANK 0x0050: BYTE bank, CItemElem
//               OnGetItemBank                 :2993-2998                    GETITEMBANK 0x0051: CItemElem
//               OnUpdateBankItem              :3000-3012                    UPDATE_BANKITEM 0x0054: BYTE bank, BYTE id,
//                                                                           CHAR param, DWORD value
//               OnPutGoldBank                 :3013-3021                    PUTGOLDBANK 0x0052: BYTE bank, DWORD the bag's
//                                                                           penya, DWORD the bank's
//               OnMoveBankItem                :3022-3024                    MOVEBANKITEM 0x0053: BYTE, BYTE (never sent)
//               OnErrorBankIsFull             :3026-3029                    BANKISFULL 0x0055: nothing
//               OnBankWindow                  :3031-3055                    BANKWINDOW 0x0056: int mode, DWORD id, DWORD
//                                                                           item
//               OnChangeBankPass              :3085-3111                    CHANGEBANKPASS 0x0057: the same three
//               OnConfirmBankPass             :3113-3136                    CONFIRMBANKPASS 0x0058: the same three
//   senders     SendOpenBankWnd ... SendPutItemBankToBank   :9674-9799, SendMoveBankItem :9366-9371

import type { ArReader } from '../ar/ArReader';
import { clientPacket } from './packet';
import { readInventoryItem } from './own';
import type { InventoryItem } from './types';

/** The bank's packet types, client to world (`Source/_Network/MsgHdr.h:336-345`; "BACK" is the original's typo). */
export const BankPacket = {
  OPENBANKWND: 0xffffff40,
  CLOSEBANKWND: 0xffffff41,
  PUTITEMBANK: 0xffffff42,
  PUTGOLDBANK: 0xffffff43,
  GETITEMBANK: 0xffffff44,
  GETGOLDBANK: 0xffffff45,
  MOVEBANKITEM: 0xffffff46,
  CHANGEBANKPASS: 0xffffff47,
  CONFIRMBANK: 0xffffff48,
  PUTBANKTOBANK: 0xffffff49,
} as const;

/** The bank's snapshot types (`MsgHdr.h:981-989`). */
export const BankMessageType = {
  PUTITEMBANK: 0x0050,
  GETITEMBANK: 0x0051,
  PUTGOLDBANK: 0x0052,
  MOVEBANKITEM: 0x0053,
  UPDATE_BANKITEM: 0x0054,
  BANKISFULL: 0x0055,
  BANKWINDOW: 0x0056,
  CHANGEBANKPASS: 0x0057,
  CONFIRMBANKPASS: 0x0058,
} as const;

/** `MAX_BANK` (`_Common/ProjectCmn.h:9`): each bank's slots. Three banks, one per character slot of the account. */
export const MAX_BANK = 42;
export const BANK_COUNT = 3;
/** `NULL_ID`: the bank opened at an NPC, not with the Scroll of Private Custody. */
export const BANK_NPC = 0xffffffff;
/** The server reads a PIN with `ReadString( szPass, 10 )` (`DPSrvr.cpp:1836-1931`). */
const PIN_BUFFER = 10;

/**
 * The bank's snapshots, all about the own player. `bankWindow`, `changeBankPass` and `confirmBankPass` carry the scroll's
 * object and item ids back (`BANK_NPC` and 0 at an NPC).
 */
export type BankMessage =
  /** An item gone into bank `bank`: `m_Bank[bank].Add( item )` (the item's object id is not used). */
  | { type: 'putItemBank'; bank: number; item: InventoryItem }
  /** An item come out of a bank into the bag: `m_Inventory.Add( item )`. */
  | { type: 'getItemBank'; item: InventoryItem }
  /** `UpdateItemBank( bank, id, param, value )`: param 0 (`UI_NUM`) the count, 0 removing it. */
  | { type: 'updateBankItem'; bank: number; objectId: number; param: number; value: number }
  /** The bag's penya and bank `bank`'s, both after a penya move. */
  | { type: 'putGoldBank'; bank: number; gold: number; bankGold: number }
  | { type: 'moveBankItem'; source: number; destination: number }
  | { type: 'bankIsFull' }
  /** Mode 0: the PIN is still "0000", set one; else enter it. */
  | { type: 'bankWindow'; mode: number; scrollId: number; scrollItem: number }
  /** Mode 1: the new PIN taken (enter it now); 0: the old one was wrong. */
  | { type: 'changeBankPass'; mode: number; scrollId: number; scrollItem: number }
  /** Mode 1: the PIN was right, the bank opens; 0: wrong. */
  | { type: 'confirmBankPass'; mode: number; scrollId: number; scrollItem: number };

function readModeReply<T extends 'bankWindow' | 'changeBankPass' | 'confirmBankPass'>(type: T) {
  return (r: ArReader): BankMessage => {
    const mode = r.i32(), scrollId = r.u32();
    return { type, mode, scrollId, scrollItem: r.u32() } as BankMessage;
  };
}

export function readPutItemBank(r: ArReader): BankMessage {
  const bank = r.u8();
  return { type: 'putItemBank', bank, item: readInventoryItem(r) };
}

export function readUpdateBankItem(r: ArReader): BankMessage {
  const bank = r.u8(), objectId = r.u8(), param = (r.u8() << 24) >> 24; // CHAR cParam
  return { type: 'updateBankItem', bank, objectId, param, value: r.u32() };
}

export function readPutGoldBank(r: ArReader): BankMessage {
  const bank = r.u8(), gold = r.u32();
  return { type: 'putGoldBank', bank, gold, bankGold: r.u32() };
}

/** The snapshot readers of the bank, for `WORLD_READERS`. */
export const BANK_READERS: ReadonlyArray<[number, (r: ArReader) => BankMessage]> = [
  [BankMessageType.PUTITEMBANK, readPutItemBank],
  [BankMessageType.GETITEMBANK, (r) => ({ type: 'getItemBank', item: readInventoryItem(r) })],
  [BankMessageType.UPDATE_BANKITEM, readUpdateBankItem],
  [BankMessageType.PUTGOLDBANK, readPutGoldBank],
  [BankMessageType.MOVEBANKITEM, (r) => { const source = r.u8(); return { type: 'moveBankItem', source, destination: r.u8() }; }],
  [BankMessageType.BANKISFULL, () => ({ type: 'bankIsFull' })],
  [BankMessageType.BANKWINDOW, readModeReply('bankWindow')],
  [BankMessageType.CHANGEBANKPASS, readModeReply('changeBankPass')],
  [BankMessageType.CONFIRMBANKPASS, readModeReply('confirmBankPass')],
];

const BANK_TYPES: ReadonlySet<string> = new Set([
  'putItemBank', 'getItemBank', 'updateBankItem', 'putGoldBank', 'moveBankItem', 'bankIsFull', 'bankWindow',
  'changeBankPass', 'confirmBankPass',
]);

/** Whether a world message is one of the bank's. */
export function isBankMessage(message: { type: string }): message is BankMessage {
  return BANK_TYPES.has(message.type);
}

// --- the client's packets ---

/** `SendOpenBankWnd( dwId, dwItemId )` (`DPClient.cpp:9674-9679`): `BANK_NPC` and 0 at an NPC, else the scroll's. */
export const encodeOpenBankWnd = (scrollId = BANK_NPC, scrollItem = 0): Uint8Array =>
  clientPacket(BankPacket.OPENBANKWND).u32(scrollId).u32(scrollItem).toBytes();

/** `SendCloseBankWnd()` (:9710-9714): the type alone. */
export const encodeCloseBankWnd = (): Uint8Array => clientPacket(BankPacket.CLOSEBANKWND).toBytes();

/** `SendPutItemBank( nSlot, nId, ItemNum )` (:9744-9749): the bag object `objectId` (its storage index) into `bank`. */
export const encodePutItemBank = (bank: number, objectId: number, count: number): Uint8Array =>
  clientPacket(BankPacket.PUTITEMBANK).u8(bank).u8(objectId).i16(count).toBytes();

/** `SendPutGoldBank( nSlot, dwGold )` (:9780-9785). */
export const encodePutGoldBank = (bank: number, gold: number): Uint8Array =>
  clientPacket(BankPacket.PUTGOLDBANK).u8(bank).u32(gold).toBytes();

/** `SendGetItemBank( nSlot, dwId, ItemNum )` (:9787-9792): the bank object `objectId` out of `bank`. */
export const encodeGetItemBank = (bank: number, objectId: number, count: number): Uint8Array =>
  clientPacket(BankPacket.GETITEMBANK).u8(bank).u8(objectId).i16(count).toBytes();

/** `SendGetGoldBank( nSlot, dwGold )` (:9794-9799). */
export const encodeGetGoldBank = (bank: number, gold: number): Uint8Array =>
  clientPacket(BankPacket.GETGOLDBANK).u8(bank).u32(gold).toBytes();

/** `SendMoveBankItem( nSrcIndex, nDestIndex )` (:9366-9371): never sent in V15; kept for the pretend servers. */
export const encodeMoveBankItem = (source: number, destination: number): Uint8Array =>
  clientPacket(BankPacket.MOVEBANKITEM).u8(source).u8(destination).toBytes();

/** `SendChangeBankPass( szLastPass, szNewPass, dwId, dwItemId )` (:9693-9700). */
export const encodeChangeBankPass = (oldPin: string, newPin: string, scrollId = BANK_NPC, scrollItem = 0): Uint8Array =>
  clientPacket(BankPacket.CHANGEBANKPASS).string(oldPin).string(newPin).u32(scrollId).u32(scrollItem).toBytes();

/** `SendConfirmBank( szPass, dwId, dwItemId )` (:9702-9708). */
export const encodeConfirmBank = (pin: string, scrollId = BANK_NPC, scrollItem = 0): Uint8Array =>
  clientPacket(BankPacket.CONFIRMBANK).string(pin).u32(scrollId).u32(scrollItem).toBytes();

/** `SendPutItemBankToBank( nPutSlot, nSlot, nId, ItemNum )` (:9751-9757): BYTE 1, from, to, the object, short count. */
export const encodePutItemBankToBank = (from: number, to: number, objectId: number, count: number): Uint8Array =>
  clientPacket(BankPacket.PUTBANKTOBANK).u8(1).u8(from).u8(to).u8(objectId).i16(count).toBytes();

/** `SendPutGoldBankToBank( nPutSlot, nSlot, dwGold )` (:9758-9764): BYTE 0, from, to, DWORD penya. */
export const encodePutGoldBankToBank = (from: number, to: number, gold: number): Uint8Array =>
  clientPacket(BankPacket.PUTBANKTOBANK).u8(0).u8(from).u8(to).u32(gold).toBytes();

/** For the pretend servers: a client packet of the bank after its type, by the encoders' parameter names. */
export type BankRequestPacket =
  | { type: 'openBankWndRequest'; scrollId: number; scrollItem: number }
  | { type: 'closeBankWndRequest' }
  | { type: 'putItemBankRequest'; bank: number; objectId: number; count: number }
  | { type: 'putGoldBankRequest'; bank: number; gold: number }
  | { type: 'getItemBankRequest'; bank: number; objectId: number; count: number }
  | { type: 'getGoldBankRequest'; bank: number; gold: number }
  | { type: 'moveBankItemRequest'; source: number; destination: number }
  | { type: 'changeBankPassRequest'; oldPin: string; newPin: string; scrollId: number; scrollItem: number }
  | { type: 'confirmBankRequest'; pin: string; scrollId: number; scrollItem: number }
  | { type: 'putItemBankToBankRequest'; from: number; to: number; objectId: number; count: number }
  | { type: 'putGoldBankToBankRequest'; from: number; to: number; gold: number };

export function readBankRequestPacket(packetType: number, r: ArReader): BankRequestPacket | null {
  switch (packetType) {
    case BankPacket.OPENBANKWND: {
      const scrollId = r.u32();
      return { type: 'openBankWndRequest', scrollId, scrollItem: r.u32() };
    }
    case BankPacket.CLOSEBANKWND:
      return { type: 'closeBankWndRequest' };
    case BankPacket.PUTITEMBANK: case BankPacket.GETITEMBANK: {
      const bank = r.u8(), objectId = r.u8(), count = r.i16();
      return { type: packetType === BankPacket.PUTITEMBANK ? 'putItemBankRequest' : 'getItemBankRequest', bank, objectId, count };
    }
    case BankPacket.PUTGOLDBANK: case BankPacket.GETGOLDBANK: {
      const bank = r.u8(), gold = r.u32();
      return { type: packetType === BankPacket.PUTGOLDBANK ? 'putGoldBankRequest' : 'getGoldBankRequest', bank, gold };
    }
    case BankPacket.MOVEBANKITEM: {
      const source = r.u8();
      return { type: 'moveBankItemRequest', source, destination: r.u8() };
    }
    case BankPacket.CHANGEBANKPASS: {
      const oldPin = r.string(PIN_BUFFER), newPin = r.string(PIN_BUFFER), scrollId = r.u32();
      return { type: 'changeBankPassRequest', oldPin, newPin, scrollId, scrollItem: r.u32() };
    }
    case BankPacket.CONFIRMBANK: {
      const pin = r.string(PIN_BUFFER), scrollId = r.u32();
      return { type: 'confirmBankRequest', pin, scrollId, scrollItem: r.u32() };
    }
    case BankPacket.PUTBANKTOBANK: {
      const item = r.u8() !== 0, from = r.u8(), to = r.u8();
      if (item) {
        const objectId = r.u8();
        return { type: 'putItemBankToBankRequest', from, to, objectId, count: r.i16() };
      }
      return { type: 'putGoldBankToBankRequest', from, to, gold: r.u32() };
    }
    default:
      return null;
  }
}
