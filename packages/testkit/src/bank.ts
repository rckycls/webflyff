// 2026-11-10 (bank-mail): the bank's snapshots as the world server writes them (`CUser::AddPutItemBank` ...
// `AddConfirmBankPass`, `WORLDSERVER/User.cpp:1012-1160`), in the order of the readers (`@flyffweb/protocol` world/bank.ts).
// All are about the own player.

import { ArWriter, BankMessageType } from '@flyffweb/protocol';
import type { InventoryItem } from '@flyffweb/protocol';
import { writeItemElem } from './world';
import type { ScriptMessage } from './world';

const scripted = (objectId: number, type: number, w: ArWriter = new ArWriter()): ScriptMessage =>
  ({ objectId, type, fields: w.toBytes() });

/** PUTITEMBANK (`AddPutItemBank`, :1012-1020): the bank and the item that went in. */
export function writePutItemBank(selfId: number, bank: number, item: InventoryItem): ScriptMessage {
  const w = new ArWriter().u8(bank);
  writeItemElem(w, item);
  return scripted(selfId, BankMessageType.PUTITEMBANK, w);
}

/** GETITEMBANK (`AddGetItemBank`, :1022-1029): the item that came out, for the bag. */
export function writeGetItemBank(selfId: number, item: InventoryItem): ScriptMessage {
  const w = new ArWriter();
  writeItemElem(w, item);
  return scripted(selfId, BankMessageType.GETITEMBANK, w);
}

/** PUTGOLDBANK (`AddPutGoldBank`, :1031-1038): the bank, then the bag's penya and the bank's. */
export const writePutGoldBank = (selfId: number, bank: number, gold: number, bankGold: number): ScriptMessage =>
  scripted(selfId, BankMessageType.PUTGOLDBANK, new ArWriter().u8(bank).u32(gold).u32(bankGold));

/** UPDATE_BANKITEM (`AddUpdateItemBank`, :1152-1160): the bank, the object, the param (0 the count) and its value. */
export const writeUpdateBankItem = (selfId: number, bank: number, objectId: number, value: number, param = 0): ScriptMessage =>
  scripted(selfId, BankMessageType.UPDATE_BANKITEM, new ArWriter().u8(bank).u8(objectId).u8(param & 0xff).u32(value));

/** BANKISFULL (`AddBankIsFull`, :1050-1057). */
export const writeBankIsFull = (selfId: number): ScriptMessage => scripted(selfId, BankMessageType.BANKISFULL);

const modeReply = (type: number) => (selfId: number, mode: number, scrollId = 0xffffffff, scrollItem = 0): ScriptMessage =>
  scripted(selfId, type, new ArWriter().i32(mode).u32(scrollId).u32(scrollItem));

/** BANKWINDOW (`AddBankWindow`, :1071-1081): mode 0 set a PIN, 1 enter it. */
export const writeBankWindow = modeReply(BankMessageType.BANKWINDOW);
/** CHANGEBANKPASS (`AddChangeBankPass`, :1101-1110): 1 taken, 0 the old one wrong. */
export const writeChangeBankPass = modeReply(BankMessageType.CHANGEBANKPASS);
/** CONFIRMBANKPASS (`AddconfirmBankPass`, :1112-1121): 1 the bank opens, 0 wrong. */
export const writeConfirmBankPass = modeReply(BankMessageType.CONFIRMBANKPASS);
