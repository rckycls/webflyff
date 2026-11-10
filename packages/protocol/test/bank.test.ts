// 2026-11-10 (bank-mail): the bank's packets (research §1, A-bank.md §5.5, §7), read as Neuz's handlers read them and written
// as its senders write them; and the own ADD_OBJ's banks, kept.
import { describe, expect, it } from 'vitest';
import {
  encodeBundle, newVagrantOwn, writeAddSelf, writeBankIsFull, writeBankWindow, writeChangeBankPass, writeConfirmBankPass,
  writeGetItemBank, writePutGoldBank, writePutItemBank, writeUpdateBankItem,
} from '@flyffweb/testkit';
import {
  BANK_NPC, BankPacket, NULL_ID, PacketType, WORLD_READERS, decodeWorldPacket, encodeChangeBankPass, encodeCloseBankWnd,
  encodeConfirmBank, encodeGetGoldBank, encodeGetItemBank, encodeOpenBankWnd, encodePutGoldBank, encodePutGoldBankToBank,
  encodePutItemBank, encodePutItemBankToBank, isBankMessage, readBundle,
} from '../src';
import type { AddedMover, AddedPlayer, OwnCharacter } from '../src';

const SELF = 9;

const PLAYER: AddedPlayer = {
  self: true, name: 'Webby', sex: 0, skinSet: 0, hairMesh: 0, hairColor: 0, headMesh: 0, playerId: 500, job: 0, sta: 15,
  dex: 15, level: 1, authorization: 0x46, mode: 0, stateMode: 0, pkTime: 0, pkValue: 0, pkPropensity: 0, honor: -1, worn: [],
  equipmentObjectIds: new Array<number>(31).fill(NULL_ID), shopTitle: '', own: null,
};
const self = (own: OwnCharacter): AddedMover => ({
  index: 11, scale: 1, pos: [6968, 100, 3328], angle: 0, objectId: SELF, motion: 0, isPlayer: true, hitPoint: 230,
  state: 1, stateFlag: 0, belligerence: 0, sfxId: 0, player: { ...PLAYER, own },
});

function read(messages: Parameters<typeof encodeBundle>[2]) {
  const result = readBundle(encodeBundle(PacketType.SNAPSHOT, SELF, messages), WORLD_READERS);
  expect(result.mismatched).toEqual([]);
  return result.messages.map((m) => m.value);
}

describe('the own ADD_OBJ keeps the banks (ObjSerializeOpt.cpp:571-575, 586-587)', () => {
  it('reads the slot, the penya, the players and each bank\'s items', () => {
    const banks = [[{ objectId: 0, itemId: 21, count: 1 }, { objectId: 5, itemId: 2029, count: 40 }], [], [{ objectId: 41, itemId: 2801, count: 5 }]];
    const [value] = read([writeAddSelf(SELF, self(newVagrantOwn()), {
      banks, bank: { slot: 1, gold: [100, 2_000_000_000, 0], players: [700, 701, 0] },
    })]);
    if (value?.type !== 'addMover') throw new Error('no mover');
    const bank = value.mover.player?.own?.bank;
    expect(bank?.slot).toBe(1);
    expect(bank?.gold).toEqual([100, 2_000_000_000, 0]);
    expect(bank?.players).toEqual([700, 701, 0]);
    expect(bank?.containers?.map((c) => c.items)).toEqual(banks);
    expect(bank?.containers?.[0]?.slots).toEqual(Array.from({ length: 42 }, (_, i) => i));
  });

  it('without the banks on the wire keeps the slot and penya, and no containers', () => {
    const [value] = read([writeAddSelf(SELF, self(newVagrantOwn()), { bank: { slot: 2, gold: [1, 2, 3] } })]);
    if (value?.type !== 'addMover') throw new Error('no mover');
    expect(value.mover.player?.own?.bank).toEqual({ slot: 2, gold: [1, 2, 3], players: [0, 0, 0] });
  });
});

describe('the bank snapshots', () => {
  it('reads each one', () => {
    const item = { objectId: 3, itemId: 2029, count: 7 };
    const values = read([
      writePutItemBank(SELF, 2, item),
      writeGetItemBank(SELF, item),
      writeUpdateBankItem(SELF, 1, 4, 0),
      writePutGoldBank(SELF, 0, 12345, 2_147_483_647),
      writeBankIsFull(SELF),
      writeBankWindow(SELF, 0),
      writeChangeBankPass(SELF, 1, 7, 15083),
      writeConfirmBankPass(SELF, 0),
    ]);
    expect(values).toEqual([
      { type: 'putItemBank', bank: 2, item },
      { type: 'getItemBank', item },
      { type: 'updateBankItem', bank: 1, objectId: 4, param: 0, value: 0 },
      { type: 'putGoldBank', bank: 0, gold: 12345, bankGold: 2_147_483_647 },
      { type: 'bankIsFull' },
      { type: 'bankWindow', mode: 0, scrollId: BANK_NPC, scrollItem: 0 },
      { type: 'changeBankPass', mode: 1, scrollId: 7, scrollItem: 15083 },
      { type: 'confirmBankPass', mode: 0, scrollId: BANK_NPC, scrollItem: 0 },
    ]);
    expect(values.every((v) => isBankMessage(v))).toBe(true);
  });
});

describe('the bank packets the browser sends (DPClient.cpp:9674-9799)', () => {
  it('writes each with its fields and reads it back', () => {
    const body = (bytes: Uint8Array): number[] => [...bytes.subarray(8)];
    expect([...encodeOpenBankWnd().subarray(4, 8)]).toEqual([0x40, 0xff, 0xff, 0xff]);
    expect(body(encodePutItemBank(1, 7, 3))).toEqual([1, 7, 3, 0]);
    expect(body(encodePutGoldBank(0, 0x01020304))).toEqual([0, 4, 3, 2, 1]);
    expect(body(encodeCloseBankWnd())).toEqual([]);
    expect(body(encodePutItemBankToBank(0, 2, 9, 5))).toEqual([1, 0, 2, 9, 5, 0]);
    expect(body(encodePutGoldBankToBank(2, 1, 10))).toEqual([0, 2, 1, 10, 0, 0, 0]);
    expect([
      encodeOpenBankWnd(), encodeOpenBankWnd(11, 15083), encodeCloseBankWnd(), encodePutItemBank(1, 7, 3),
      encodePutGoldBank(0, 500), encodeGetItemBank(2, 41, 99), encodeGetGoldBank(1, 7), encodeChangeBankPass('0000', '1234'),
      encodeConfirmBank('1234', 11, 15083), encodePutItemBankToBank(0, 2, 9, 5), encodePutGoldBankToBank(2, 1, 10),
    ].map((bytes) => decodeWorldPacket(bytes))).toEqual([
      { type: 'openBankWndRequest', scrollId: BANK_NPC, scrollItem: 0 },
      { type: 'openBankWndRequest', scrollId: 11, scrollItem: 15083 },
      { type: 'closeBankWndRequest' },
      { type: 'putItemBankRequest', bank: 1, objectId: 7, count: 3 },
      { type: 'putGoldBankRequest', bank: 0, gold: 500 },
      { type: 'getItemBankRequest', bank: 2, objectId: 41, count: 99 },
      { type: 'getGoldBankRequest', bank: 1, gold: 7 },
      { type: 'changeBankPassRequest', oldPin: '0000', newPin: '1234', scrollId: BANK_NPC, scrollItem: 0 },
      { type: 'confirmBankRequest', pin: '1234', scrollId: 11, scrollItem: 15083 },
      { type: 'putItemBankToBankRequest', from: 0, to: 2, objectId: 9, count: 5 },
      { type: 'putGoldBankToBankRequest', from: 2, to: 1, gold: 10 },
    ]);
    expect(BankPacket.PUTBANKTOBANK).toBe(0xffffff49);
  });
});
