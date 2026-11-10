// @vitest-environment jsdom
// 2026-11-10 (bank-mail): the bank's model, rules and windows (bank/bankBook.ts, bank/bankHud.ts; research §1, A-bank.md).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decodeWorldPacket } from '@flyffweb/protocol';
import type { InventoryItem } from '@flyffweb/protocol';
import type { Texts } from '../src/world/gameData';
import type { UiArt } from '../src/world/hud/art';
import { BankBook } from '../src/world/bank/bankBook';
import { BankHud, bagDropAction, bankDropAction, passwordCheck, pinValid } from '../src/world/bank/bankHud';
import type { BankHudScreen } from '../src/world/bank/bankHud';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const texts = new Map([
  ['TID_DIAG_0025', { text: 'Password should have 4 digits. Please try again.', color: 0xffffffff, textId: 1 }],
  ['TID_DIAG_0028', { text: 'Wrong password.  Please try again.', color: 0xffffffff, textId: 2 }],
  ['TID_GAME_SLOTFULL', { text: 'Your inventory is full.', color: 0xff99cc00, textId: 3 }],
  ['TID_GAME_BANKSTILLUSING', { text: 'You are already using the bank.', color: 0xffffffff, textId: 4 }],
  ['TID_GAME_TRADENOBANK', { text: 'You cannot trade items when using the bank.', color: 0xffff0000, textId: 5 }],
]) as unknown as Texts;
const packMax = (itemId: number): number => (itemId === 2800 ? 99 : 1);

describe('BankBook (m_Bank, m_dwGoldBank, m_idPlayerBank; ReSetBank)', () => {
  it('keeps the ADD_OBJ banks, draws them packed in position order, and is usable by ReSetBank\'s rule', () => {
    const book = new BankBook({
      slot: 1, gold: [10, 20, 30], players: [700, 701, 0],
      containers: [{ slots: Array.from({ length: 42 }, (_, i) => i), items: [{ objectId: 7, itemId: 21, count: 1 }, { objectId: 2, itemId: 22, count: 1 }] }, { slots: [], items: [] }, { slots: [], items: [] }],
    });
    expect(book.packed(0).map((item) => item.objectId)).toEqual([2, 7]);
    expect([0, 1, 2].map((i) => book.usable(i, false))).toEqual([false, true, false]);
    expect([0, 1, 2].map((i) => book.usable(i, true))).toEqual([true, true, false]);
  });

  it('PUTITEMBANK adds onto a stack first, UPDATE_BANKITEM sets a count or removes, PUTGOLDBANK sets the penya', () => {
    const book = new BankBook({ slot: 0, gold: [0, 0, 0], players: [700, 0, 0], containers: [{ slots: [], items: [{ objectId: 0, itemId: 2800, count: 90 }] }] });
    book.put(0, { objectId: 33, itemId: 2800, count: 20 }, packMax);
    expect(book.packed(0)).toEqual([{ objectId: 0, itemId: 2800, count: 99 }, { objectId: 1, itemId: 2800, count: 11 }]);
    book.update(0, 1, 0, 5);
    expect(book.item(0, 1)?.count).toBe(5);
    book.update(0, 0, 0, 0);
    expect(book.item(0, 0)).toBeUndefined();
    const revision = book.revision;
    book.setGold(2, 1234);
    expect(book.gold).toEqual([0, 0, 1234]);
    expect(book.revision).toBe(revision + 1);
  });
});

describe('the PIN rules (WndBank.cpp:475-512, 613-688)', () => {
  it('a PIN is 4 digits', () => {
    expect(['1234', '0000', '123', '12a4', '12345'].map(pinValid)).toEqual([true, true, false, false, false]);
  });

  it('checks the lengths, then new = confirm, then the digits', () => {
    expect(passwordCheck('0000', '12', '12')).toEqual({ tid: 'TID_DIAG_0025', reset: 'all' });
    expect(passwordCheck('0000', '1234', '1235')).toEqual({ tid: 'TID_DIAG_0022', reset: 'new' });
    expect(passwordCheck('0000', '12a4', '12a4')).toEqual({ tid: 'TID_DIAG_0025', reset: 'all' });
    expect(passwordCheck('0000', '1234', '1234')).toBeNull();
  });
});

describe('the drops (CWndBank::OnChildNotify, CWndInventory::OnChildNotify, CWndTradeGold)', () => {
  const bag = new Map<number, InventoryItem>([[3, { objectId: 3, itemId: 21, count: 1 }], [4, { objectId: 4, itemId: 2800, count: 40 }], [5, { objectId: 5, itemId: 22, count: 1 }]]);
  const bank = new BankBook({ slot: 0, gold: [500, 0, 9], players: [700, 701, 0], containers: [{ slots: [], items: [{ objectId: 6, itemId: 2800, count: 12 }, { objectId: 8, itemId: 23, count: 1 }] }] });
  const ctx = { bank, bagItems: bag, gold: 1000, worn: (id: number) => id === 5 };
  const packet = (bytes: Uint8Array | null) => (bytes === null ? null : decodeWorldPacket(bytes));

  it('a single bag item goes at once, a stack asks its count, a worn one is refused', () => {
    const single = bankDropAction(1, { kind: 'bagItem', objectId: 3 }, ctx);
    expect(single.kind === 'send' && packet(single.bytes)).toEqual({ type: 'putItemBankRequest', bank: 1, objectId: 3, count: 1 });
    const stack = bankDropAction(0, { kind: 'bagItem', objectId: 4 }, ctx);
    expect(stack.kind === 'ask' && stack.max).toBe(40);
    expect(stack.kind === 'ask' && packet(stack.send(99))).toEqual({ type: 'putItemBankRequest', bank: 0, objectId: 4, count: 40 });
    expect(bankDropAction(0, { kind: 'bagItem', objectId: 5 }, ctx)).toEqual({ kind: 'line', tid: 'TID_GAME_EQUIPPUT' });
  });

  it('the bag penya asks all of it; a bank item to another bank; nothing onto its own grid', () => {
    const penya = bankDropAction(2, { kind: 'bagPenya' }, ctx);
    expect(penya.kind === 'ask' && [penya.penya, penya.max, packet(penya.send(250))]).toEqual([true, 1000, { type: 'putGoldBankRequest', bank: 2, gold: 250 }]);
    const move = bankDropAction(1, { kind: 'bankItem', from: 0, objectId: 8 }, ctx);
    expect(move.kind === 'send' && packet(move.bytes)).toEqual({ type: 'putItemBankToBankRequest', from: 0, to: 1, objectId: 8, count: 1 });
    expect(bankDropAction(0, { kind: 'bankItem', from: 0, objectId: 8 }, ctx)).toEqual({ kind: 'none' });
  });

  it('out of a bank: a stack asks its count, the penya at most the bank\'s and none for 0', () => {
    const stack = bagDropAction({ bank: 0, objectId: 6 }, ctx);
    expect(stack.kind === 'ask' && packet(stack.send(5))).toEqual({ type: 'getItemBankRequest', bank: 0, objectId: 6, count: 5 });
    const penya = bagDropAction({ bank: 0 }, ctx);
    expect(penya.kind === 'ask' && packet(penya.send(9999))).toEqual({ type: 'getGoldBankRequest', bank: 0, gold: 500 });
    const none = bagDropAction({ bank: 1 }, ctx);
    expect(none.kind === 'ask' && none.send(1)).toBeNull();
  });
});

describe('BankHud: the flow', () => {
  let sent: unknown[];
  let lines: string[];
  let boxes: string[];
  let book: BankBook;
  let bagOpen: boolean;
  const made: BankHud[] = [];

  function hud(): BankHud {
    const screen: BankHudScreen = {
      send: (bytes) => { sent.push(decodeWorldPacket(bytes)); },
      say: (text) => { lines.push(text); }, box: (text) => { boxes.push(text); },
      bank: () => book, bagItems: () => new Map([[4, { objectId: 4, itemId: 2800, count: 40 }]]), ownGold: () => 100,
      worn: () => false, prop: (itemId) => ({ packMax: packMax(itemId), name: `Item ${itemId}`, icon: '' }) as never,
      commonBank: () => false, tradeOpen: () => false, npcShopOpen: () => false,
      openInventory: () => { bagOpen = true; }, closeInventory: () => { bagOpen = false; }, inventoryFrame: () => null,
      showTooltip: () => {},
    };
    const made1 = new BankHud(art, texts, screen);
    document.body.append(...made1.elements);
    made.push(made1);
    return made1;
  }

  beforeEach(() => {
    sent = []; lines = []; boxes = []; bagOpen = false;
    book = new BankBook({ slot: 0, gold: [5, 0, 0], players: [700, 0, 0], containers: [{ slots: [], items: [{ objectId: 0, itemId: 21, count: 1 }] }] });
  });
  afterEach(() => { for (const h of made.splice(0)) h.reset(); document.body.replaceChildren(); });

  it('Deposit sends OPENBANKWND; mode 0 opens the set-PIN window with Old PIN 0000 and sends CHANGEBANKPASS', () => {
    const h = hud();
    h.request();
    expect(sent).toEqual([{ type: 'openBankWndRequest', scrollId: 0xffffffff, scrollItem: 0 }]);
    h.handle({ type: 'bankWindow', mode: 0, scrollId: 0xffffffff, scrollItem: 0 });
    expect(h.password.isOpen).toBe(true);
    const inputs = [...h.password.window.frame.element.querySelectorAll('input')];
    expect(inputs.map((input) => [input.value, input.type])).toEqual([['0000', 'password'], ['', 'password'], ['', 'password']]);
    inputs[1]!.value = '1234';
    inputs[2]!.value = '1235';
    h.password.window.button('WIDC_OK').click();
    expect(boxes).toEqual(['Your new password is different from the password you confirmed. Please try again.']);
    inputs[1]!.value = '1234';
    inputs[2]!.value = '1234';
    h.password.window.button('WIDC_OK').click();
    expect(sent.at(-1)).toEqual({ type: 'changeBankPassRequest', oldPin: '0000', newPin: '1234', scrollId: 0xffffffff, scrollItem: 0 });
  });

  it('the PIN: 4 digits sent; a wrong one shows the box and the window again; a right one opens the bag and the bank', () => {
    const h = hud();
    h.handle({ type: 'changeBankPass', mode: 1, scrollId: 0xffffffff, scrollItem: 0 });
    expect(h.confirm.isOpen).toBe(true);
    const input = h.confirm.window.input('WIDC_EDIT1');
    input.value = '12';
    h.confirm.window.button('WIDC_OK').click();
    expect(boxes).toEqual(['Password should have 4 digits. Please try again.']);
    input.value = '1234';
    h.confirm.window.button('WIDC_OK').click();
    expect(sent.at(-1)).toEqual({ type: 'confirmBankRequest', pin: '1234', scrollId: 0xffffffff, scrollItem: 0 });
    h.handle({ type: 'confirmBankPass', mode: 0, scrollId: 0xffffffff, scrollItem: 0 });
    expect(h.confirm.isOpen).toBe(true);
    expect(boxes.at(-1)).toBe('Wrong password.  Please try again.');
    h.handle({ type: 'confirmBankPass', mode: 1, scrollId: 0xffffffff, scrollItem: 0 });
    expect([h.confirm.isOpen, h.isOpen, bagOpen]).toEqual([false, true, true]);
    h.update();
    const grid = h.window.frame.element.querySelector('.hud-bank-grid[data-bank="0"]')!;
    expect(grid.querySelectorAll('[data-object-id]')).toHaveLength(1);
    expect(h.window.frame.element.querySelector('[data-bank-gold="0"]')?.textContent).toBe('5');
    // the other banks are covered: no player in their slots, no Common Bank
    const covers = [...h.window.frame.element.querySelectorAll<HTMLElement>('.hud-bank-cover')].map((cover) => cover.hidden);
    expect(covers).toEqual([true, false, false]);
  });

  it('a stack dropped opens the count box, whose OK sends PUTITEMBANK; moving closes everything with CLOSEBANKWND twice', () => {
    const h = hud();
    h.handle({ type: 'confirmBankPass', mode: 1, scrollId: 0xffffffff, scrollItem: 0 });
    h.dropOnBank(0, { kind: 'bagItem', objectId: 4 });
    expect(h.amount.isOpen).toBe(true);
    const field = h.amount.element.querySelector<HTMLInputElement>('input')!;
    expect(field.value).toBe('40');
    field.value = '7';
    h.amount.element.querySelector<HTMLButtonElement>('[data-control="WIDC_OK"]')!.click();
    expect(sent.at(-1)).toEqual({ type: 'putItemBankRequest', bank: 0, objectId: 4, count: 7 });
    expect(h.amount.isOpen).toBe(false);
    sent = [];
    h.moved();
    expect(sent).toEqual([{ type: 'closeBankWndRequest' }, { type: 'closeBankWndRequest' }]);
    expect([h.isOpen, bagOpen]).toEqual([false, false]);
  });

  it('BANKISFULL says "Your inventory is full."; a second Deposit while using the bank is refused', () => {
    const h = hud();
    h.handle({ type: 'bankIsFull' });
    h.handle({ type: 'bankWindow', mode: 1, scrollId: 0xffffffff, scrollItem: 0 });
    h.request();
    expect(lines).toEqual(['Your inventory is full.', 'You are already using the bank.']);
  });

  it('the Custody scroll opens the bank with its ids, kept through the PIN', () => {
    const h = hud();
    h.useScroll(11, 15083);
    expect(sent).toEqual([{ type: 'openBankWndRequest', scrollId: 11, scrollItem: 15083 }]);
    h.handle({ type: 'bankWindow', mode: 1, scrollId: 11, scrollItem: 15083 });
    h.confirm.window.input('WIDC_EDIT1').value = '4321';
    h.confirm.window.button('WIDC_OK').click();
    expect(sent.at(-1)).toEqual({ type: 'confirmBankRequest', pin: '4321', scrollId: 11, scrollItem: 15083 });
  });
});
