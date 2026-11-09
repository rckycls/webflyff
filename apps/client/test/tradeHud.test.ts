// @vitest-environment jsdom
// 2026-11-10: the trade's windows joined to its state and the session (trade/tradeHud.ts; trade research §2-§6).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { InventoryItem, TradeMessage } from '@flyffweb/protocol';
import type { Texts } from '../src/world/gameData';
import type { UiArt } from '../src/world/hud/art';
import { TradeHud } from '../src/world/trade/tradeHud';
import type { TradeHudScreen, TradeHudSession } from '../src/world/trade/tradeHud';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const OWN_ID = 9, LEAD_ID = 40, OWN_PLAYER = 500;
const texts: Texts = new Map([
  ['TID_GAME_FROM', { text: '%s wants to trade.', color: 0xffccffcc, textId: 1 }],
  ['TID_GAME_TRADEREQUEST', { text: 'You have offered to trade with %s.', color: 0xffffffff, textId: 2 }],
  ['TID_GAME_YETTRADE', { text: 'That player is currently busy. Please try again after few minutes.', color: 0xffff0000, textId: 3 }],
  ['TID_GAME_TRADEACCPET', { text: '%s has completed the trade.', color: 0xffccffcc, textId: 4 }],
  ['TID_GAME_FINALCOMFIRM', { text: '%s pushed final confirmation.', color: 0xffffffff, textId: 5 }],
  ['TID_DIAG_0083', { text: 'Do you accept the trade?', color: 0xffffffff, textId: 6 }],
  ['TID_GAME_WAITCOMFIRM', { text: 'You need to wait for approval.', color: 0xffffffff, textId: 7 }],
  ['TID_DIAG_0003', { text: 'The trade has been cancelled.', color: 0xffffffff, textId: 8 }],
  ['TID_GAME_TRADEDENY', { text: "%s is in the 'Refuse Trade' setting.", color: 0xffffffff, textId: 9 }],
]) as unknown as Texts;

let sent: Array<[string, ...unknown[]]>;
let lines: Array<[string, number]>;
let boxes: string[];
let gold: number;
let bag: Map<number, InventoryItem>;
let shopOpen: boolean;
let consents: unknown[][];
const made: TradeHud[] = [];

function hud(): TradeHud {
  const record = (name: string) => (...args: unknown[]) => { sent.push([name, ...args]); };
  const session: TradeHudSession = {
    sendConfirmTrade: record('confirmTrade'), sendConfirmTradeCancel: record('confirmTradeCancel'), sendTrade: record('trade'),
    sendTradePut: record('put'), sendTradeOk: record('ok'), sendTradeCancel: record('cancel'), sendTradePutGold: record('gold'),
    sendTradeConfirm: record('confirm'), sendTradeBlock: record('block'),
  };
  const screen: TradeHudScreen = {
    session, ownObjectId: () => OWN_ID, ownPlayerId: () => OWN_PLAYER, ownName: () => 'Webby',
    nameOf: (id) => (id === LEAD_ID ? 'Lead' : ''), ownItems: () => bag, ownGold: () => gold,
    prop: (itemId) => ({ packMax: itemId === 2800 ? 99 : 1, name: `Item ${itemId}`, icon: '' }) as never,
    say: (text, color) => { lines.push([text, color]); }, box: (text) => { boxes.push(text); }, openInventory: () => {},
    npcShopOpen: () => shopOpen, addOwnGold: (delta) => { gold += delta; },
    consent: (...args) => { consents.push(args); }, refreshBag: () => {}, showTooltip: () => {},
  };
  const made1 = new TradeHud(art, texts, screen);
  document.body.append(...made1.elements);
  made.push(made1);
  return made1;
}

const opened = (): TradeHud => {
  const t = hud();
  const trade: TradeMessage = { type: 'trade', playerId: OWN_PLAYER, slots: Array.from({ length: 73 }, (_, i) => (i < 42 ? i : 0xffffffff)), items: [] };
  t.handle(LEAD_ID, trade);
  return t;
};
const click = (el: Element | null): void => { (el as HTMLElement).click(); };

beforeEach(() => {
  sent = []; lines = []; boxes = []; consents = []; gold = 5000; shopOpen = false;
  bag = new Map([[6, { objectId: 6, itemId: 2800, count: 5 }], [8, { objectId: 8, itemId: 21, count: 1 }]]);
});
afterEach(() => {
  for (const t of made.splice(0)) for (const el of t.elements) el.remove();
});

describe('TradeHud', () => {
  it('asks from the menu, or says the player is busy while a request is open', () => {
    const t = hud();
    t.requestTrade(LEAD_ID);
    expect(sent).toEqual([['confirmTrade', LEAD_ID]]);
    expect(lines.map(([text]) => text)).toEqual(['You have offered to trade with Lead.']);
    t.handle(LEAD_ID, { type: 'confirmTrade' });
    expect(t.request.isOpen).toBe(true);
    expect(t.request.window.frame.element.textContent).toContain('Lead wants to trade.');
    t.requestTrade(LEAD_ID);
    expect(lines.at(-1)?.[0]).toBe('That player is currently busy. Please try again after few minutes.');
  });

  it('answers the request: OK sends TRADE; the close box sends CONFIRMTRADECANCEL; a second request is BLOCK 5', () => {
    const t = hud();
    t.handle(LEAD_ID, { type: 'confirmTrade' });
    t.handle(LEAD_ID, { type: 'confirmTrade' });
    expect(sent).toEqual([['block', 5, 'Lead']]);
    click(t.request.window.button('WIDC_OK'));
    expect(sent.at(-1)).toEqual(['trade', LEAD_ID]);
    expect(t.request.isOpen).toBe(false);
    t.handle(LEAD_ID, { type: 'confirmTrade' });
    click(t.request.window.frame.element.querySelector('.hud-window-close'));
    expect(sent.at(-1)).toEqual(['confirmTradeCancel', LEAD_ID]);
  });

  it('puts a single item at once, a stack and the penya through the quantity box', () => {
    const t = opened();
    expect(t.window.frame.isOpen).toBe(true);
    t.drop(0, { objectId: 8 });
    expect(sent.at(-1)).toEqual(['put', 0, 0, 8, 1]);
    t.drop(1, { objectId: 6 });
    expect(t.gold.isOpen).toBe(true);
    const input = t.gold.window.input('WIDC_EDIT');
    expect(input.value).toBe('5');
    expect(input.inputMode).toBe('numeric');
    input.value = '3';
    // the modal backdrop holds the keydown; the keypress is the box's
    input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));
    expect(sent.at(-1)).toEqual(['put', 1, 0, 6, 3]);
    expect(t.gold.isOpen).toBe(false);
    t.drop(2, { gold: true });
    expect(t.gold.window.frame.element.textContent).toContain('Penya');
    t.gold.window.input('WIDC_EDIT').value = '99999';
    click(t.gold.window.button('WIDC_OK'));
    expect(sent.at(-1)).toEqual(['gold', 5000]);
    // the server's echoes: the own penya comes off the bag's
    t.handle(OWN_ID, { type: 'tradePutGold', gold: 5000 });
    expect(gold).toBe(0);
    expect(t.window.frame.element.querySelector('[data-trade="my-penya"]')?.textContent).toBe('5,000');
    t.handle(OWN_ID, { type: 'tradePut', slot: 0, itemType: 0, itemObjectId: 8, count: 1 });
    expect(t.extraOf(8)).toBe(1);
    expect(t.window.frame.element.querySelector('[data-side="mine"] [data-trade-slot="0"]')?.hasAttribute('data-filled')).toBe(true);
  });

  it('runs the OKs, the final box and the exchange, and closes with the destructor\'s TRADECANCEL', () => {
    const t = opened();
    t.handle(LEAD_ID, { type: 'tradeOk' });
    expect(lines.at(-1)?.[0]).toBe('Lead has completed the trade.');
    expect(t.window.window.button('WIDC_OK_YOU').disabled).toBe(true);
    click(t.window.window.button('WIDC_OK_I'));
    expect(sent.at(-1)).toEqual(['ok']);
    t.handle(0xffffffff, { type: 'tradeLastConfirm' });
    expect(t.confirm.isOpen).toBe(true);
    // the trade window takes no press while the final box is up
    click(t.window.window.button('WIDC_CANCEL'));
    expect(sent.at(-1)).toEqual(['ok']);
    click(t.confirm.window.button('WIDC_YES'));
    expect(sent.at(-1)).toEqual(['confirm']);
    t.handle(OWN_ID, { type: 'tradeLastConfirmOk' });
    expect(t.confirm.window.frame.element.textContent).toContain('You need to wait for approval.');
    expect(t.confirm.window.button('WIDC_YES').hidden).toBe(true);
    t.handle(LEAD_ID, { type: 'tradeLastConfirmOk' });
    expect(lines.at(-1)?.[0]).toBe('Lead pushed final confirmation.');
    t.handle(0xffffffff, { type: 'tradeConsent' });
    expect(consents).toHaveLength(1);
    expect(t.window.frame.isOpen).toBe(false);
    expect(t.confirm.isOpen).toBe(false);
    expect(sent.at(-1)).toEqual(['cancel']);
  });

  it('cancels with the box, closes quietly when the partner leaves, and refuses at once with an NPC shop open', () => {
    const t = opened();
    click(t.window.window.button('WIDC_CANCEL'));
    expect(sent).toEqual([['cancel']]);
    expect(t.window.frame.isOpen).toBe(true);
    t.handle(LEAD_ID, { type: 'tradeCancel', playerId: 70002, mode: 0 });
    expect(t.window.frame.isOpen).toBe(false);
    expect(boxes).toEqual(['The trade has been cancelled.']);
    t.handle(LEAD_ID, { type: 'trade', playerId: OWN_PLAYER, slots: [], items: [] });
    t.removed(LEAD_ID);
    expect(t.window.frame.isOpen).toBe(false);
    expect(boxes).toHaveLength(1);
    shopOpen = true;
    sent = [];
    t.handle(LEAD_ID, { type: 'trade', playerId: OWN_PLAYER, slots: [], items: [] });
    expect(t.window.frame.isOpen).toBe(false);
    expect(sent).toEqual([['cancel']]);
    t.onBlock({ type: 'block', gu: 3, name: 'Lead' });
    expect(lines.at(-1)?.[0]).toBe("Lead is in the 'Refuse Trade' setting.");
  });
});
