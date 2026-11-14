// @vitest-environment jsdom
// 2026-11-15 (guild bank): the guild bank's model, rules and windows (guildBank/guildBankBook.ts, guildBank/guildBankHud.ts;
// housing-research/research-note.md §1).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GuildLogType, NULL_ID, decodeWorldPacket } from '@flyffweb/protocol';
import type { GuildMemberEntry, InventoryItem } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { Texts } from '../src/world/gameData';
import type { UiArt } from '../src/world/hud/art';
import { GuildBankBook } from '../src/world/guildBank/guildBankBook';
import {
  GuildBankHud, contributeCheck, logDate, logLine, meritItems, meritPenya, putAction, takeAction,
} from '../src/world/guildBank/guildBankHud';
import type { GuildBankGuild, GuildBankHudScreen } from '../src/world/guildBank/guildBankHud';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const texts = new Map([
  ['TID_GAME_BANKSTILLUSING', { text: 'You are already using the bank.', color: 0xffffffff, textId: 1 }],
  ['TID_GAME_CANNT_USE_GLOG', { text: 'Only Guild Leader or Kingpin can check Guild Bank logs.', color: 0xffff0000, textId: 2 }],
  ['TID_GAME_GUILDMERITSTUFF', { text: 'You have Contributed to the guild.', color: 0xffffffff, textId: 3 }],
]) as unknown as Texts;
const STACK = 2800;
const GEM = 2900;
const CLOAK = 4602;
const props = new Map<number, Partial<WebItemProp>>([
  [STACK, { name: 'Red Stone', packMax: 99, kind3: 0 }],
  [GEM, { name: 'Tooth', packMax: 99, kind3: 34 }],
  [21, { name: 'Wooden Sword', packMax: 1, kind3: 0 }],
  [CLOAK, { name: 'Cloak', packMax: 1, kind3: 24 }],
]);
const prop = (itemId: number) => props.get(itemId) as WebItemProp | undefined;
const packMax = (itemId: number): number => prop(itemId)?.packMax ?? 1;
const fullSlots = Array.from({ length: 42 }, (_, i) => i);

const member = (playerId: number, rank: number, giveGold = 0): GuildMemberEntry => ({
  playerId, pay: 0, giveGold, givePxp: 0, win: 0, lose: 0, rank, selectedVote: 0, surrender: 0, rankClass: 0, alias: '',
});
/** Master 500, kingpin 501 (Penya and Item rights), rookie 502 (none). */
const guildOf = (over: Partial<GuildBankGuild> = {}): GuildBankGuild => ({
  guildId: 77, masterId: 500, level: 4, logo: 1, name: 'Webbers', power: [0xff, 0x18, 0, 0, 0], gold: 50_000, contributionPxp: 0,
  members: new Map([[500, member(500, 0)], [501, member(501, 1)], [502, member(502, 4)]]), ...over,
});

describe('GuildBankBook (m_GuildBank)', () => {
  it('loads the bank, stacks a put, takes a count or the whole item', () => {
    const book = new GuildBankBook();
    book.load({ slots: fullSlots, items: [{ objectId: 4, itemId: STACK, count: 90 }, { objectId: 1, itemId: 21, count: 1 }] });
    expect(book.packed().map((item) => item.objectId)).toEqual([1, 4]);
    book.put({ objectId: 30, itemId: STACK, count: 20 }, packMax);
    expect(book.item(4)?.count).toBe(99);
    expect(book.item(0)).toEqual({ objectId: 0, itemId: STACK, count: 11 });
    expect(book.take(4, 9)).toBe(true);
    expect(book.item(4)?.count).toBe(90);
    expect(book.take(1, 1)).toBe(true);
    expect(book.item(1)).toBeUndefined();
    expect(book.take(41, 1)).toBe(false);
  });
});

describe('the drops (WndGuildBank.cpp:225-277, WndField.cpp:2001-2060, :8545-8604)', () => {
  const bag = new Map<number, InventoryItem>([
    [5, { objectId: 5, itemId: STACK, count: 10 }], [6, { objectId: 6, itemId: 21, count: 1 }],
    [7, { objectId: 7, itemId: 21, count: 1, charged: 1 }],
  ]);

  it('a bag item: worn and premium refused, a stack asks its count, one item goes at once', () => {
    expect(putAction(6, bag, () => true)).toMatchObject({ kind: 'line', tid: 'TID_GAME_EQUIPPUT' });
    expect(putAction(7, bag, () => false)).toMatchObject({ kind: 'line', tid: 'TID_GAME_NOTTRADE' });
    const ask = putAction(5, bag, () => false);
    if (ask.kind !== 'ask') throw new Error('no ask');
    expect(ask.max).toBe(10);
    expect(decodeWorldPacket(ask.send(25)!)).toEqual({ type: 'putItemGuildBankRequest', objectId: 5, count: 10, mode: 1 });
    const once = putAction(6, bag, () => false);
    expect(once.kind === 'send' && decodeWorldPacket(once.bytes)).toEqual({ type: 'putItemGuildBankRequest', objectId: 6, count: 1, mode: 1 });
  });

  it('out of the bank: silent without the Item or Penya right; the penya clamped to the fund', () => {
    const book = new GuildBankBook();
    book.load({ slots: fullSlots, items: [{ objectId: 3, itemId: STACK, count: 40 }] });
    expect(takeAction(3, book, guildOf(), 502)).toEqual({ kind: 'none' });
    expect(takeAction(undefined, book, guildOf(), 502)).toEqual({ kind: 'none' });
    const item = takeAction(3, book, guildOf(), 501);
    if (item.kind !== 'ask') throw new Error('no ask');
    expect(decodeWorldPacket(item.send(99)!)).toEqual({ type: 'getItemGuildBankRequest', objectId: 3, count: 40, mode: 1 });
    const penya = takeAction(undefined, book, guildOf(), 500);
    if (penya.kind !== 'ask') throw new Error('no ask');
    expect(penya.max).toBe(50_000);
    expect(decodeWorldPacket(penya.send(90_000)!)).toEqual({ type: 'getItemGuildBankRequest', objectId: 0, count: 50_000, mode: 0 });
    expect(penya.send(0)).toBeNull();
  });
});

describe('Contribute Guild (CanContribute, MeritResultMsg)', () => {
  it('checks the level for gems, the fund and the member\'s penya for overflow', () => {
    expect(contributeCheck(guildOf(), 500, 0, 1000)).toEqual({ ok: true, tid: 'TID_GAME_GUILDMERITSTUFF' });
    expect(contributeCheck(guildOf({ level: 50 }), 500, 3, 0)).toEqual({ ok: false, tid: 'TID_GAME_GUILDMERITMAXLEVEL' });
    expect(contributeCheck(guildOf({ level: 50 }), 500, 0, 10)).toEqual({ ok: true, tid: 'TID_GAME_GUILDMERITSTUFF' });
    expect(contributeCheck(guildOf({ gold: 0xffffff00 }), 500, 0, 0x100)).toEqual({ ok: false, tid: 'TID_GAME_GUILDMAXBANKGOLD' });
    expect(contributeCheck(guildOf(), 999, 0, 10)).toEqual({ ok: false, tid: 'TID_GAME_GUILDMERITSYSERROR' });
    const rich = guildOf({ members: new Map([[500, member(500, 0, 0x7ffffff0)]]) });
    expect(contributeCheck(rich, 500, 0, 0x10)).toEqual({ ok: false, tid: 'TID_GAME_GUILDMERITMAXGOLD' });
  });

  it('reads the field as atoi, below 0 as 0; lists the bag\'s gems', () => {
    expect(['0', '1500', ' 12abc', '-5', 'abc', '99999999999'].map(meritPenya)).toEqual([0, 1500, 12, 0, 0, 0x7fffffff]);
    const bag = new Map<number, InventoryItem>([[9, { objectId: 9, itemId: GEM, count: 3 }], [2, { objectId: 2, itemId: STACK, count: 1 }]]);
    expect(meritItems(bag, prop).map((item) => item.objectId)).toEqual([9]);
  });
});

describe('the log lines (OnGuildBankLogList)', () => {
  const ctx = { text: (_tid: string, english: string) => english, prop, guildName: 'Webbers' };
  it('writes the date, the shortened name and item, the upgrade and the count; the penya lists their amount', () => {
    const date = 1_763_100_000;
    expect(logLine(GuildLogType.ITEM_ADD, { name: 'Webbycakes123', date, value: STACK, option: 3, count: 7 }, ctx))
      .toBe(`Add ${logDate(date)}    Webbycake...    Red Stone +3    7`);
    expect(logLine(GuildLogType.ITEM_REMOVE, { name: 'Ann', date, value: CLOAK, option: 0, count: 1 }, ctx))
      .toBe(`Remove ${logDate(date)}    Ann    Webbers Guild Cloak    1`);
    expect(logLine(GuildLogType.PENYA_REMOVE, { name: 'Webbycakes123', date, value: 5000, option: 0, count: 0 }, ctx))
      .toBe(`Withdraw Penya ${logDate(date)}         Webbycakes123         5000`);
    expect(logDate(date)).toMatch(/^\d{8} \d{2}:\d{2} {3}$/);
  });
});

describe('GuildBankHud', () => {
  let sent: Uint8Array[];
  let lines: string[];
  let bag: Map<number, InventoryItem>;
  let gold: number;
  let guild: GuildBankGuild | null;
  let own: number;
  let fund: Array<[string, ...number[]]>;
  let hud: GuildBankHud;
  const types = (): string[] => sent.map((bytes) => decodeWorldPacket(bytes).type);

  beforeEach(() => {
    sent = [];
    lines = [];
    bag = new Map([[5, { objectId: 5, itemId: STACK, count: 10 }]]);
    gold = 1000;
    guild = guildOf();
    own = 500;
    fund = [];
    const screen: GuildBankHudScreen = {
      send: (bytes) => sent.push(bytes),
      say: (text) => lines.push(text),
      box: (text) => lines.push(`box: ${text}`),
      guild: () => guild,
      ownPlayerId: () => own,
      setGuildGold: (g) => { fund.push(['set', g]); if (guild) guild.gold = g; },
      takeGuildGold: (g, playerId, cloak) => fund.push(['take', g, playerId, cloak ? 1 : 0]),
      removeGuildGold: (guildId, g) => fund.push(['remove', guildId, g]),
      bagItems: () => bag,
      bagAdd: (item) => bag.set(100 + item.objectId, item),
      addOwnGold: (delta) => { gold += delta; },
      worn: () => false,
      prop,
      packMax,
      tradeOpen: () => false,
      npcShopOpen: () => false,
      bankBusy: () => false,
      vendorOpen: () => false,
      summonAngelOpen: () => false,
      openInventory: () => {},
      inventoryFrame: () => null,
      showTooltip: () => {},
    };
    hud = new GuildBankHud(art, texts, screen);
    document.body.append(...hud.elements);
  });

  afterEach(() => {
    hud.reset();
    document.body.replaceChildren();
  });

  const open = (): void => hud.handle({
    type: 'guildBankWindow', mode: 0, gold: 70_000,
    bank: { slots: fullSlots, items: [{ objectId: 2, itemId: 21, count: 1 }, { objectId: 3, itemId: STACK, count: 40 }] },
  });

  it('the menu asks for the window; a second ask while it is open is refused', () => {
    hud.request();
    expect(types()).toEqual(['openGuildBankWndRequest']);
    open();
    expect(hud.isOpen).toBe(true);
    expect(fund).toEqual([['set', 70_000]]);
    hud.update();
    const shown = hud.window.frame.element;
    expect(shown.querySelectorAll('.hud-bank-cell[data-object-id]').length).toBe(2);
    expect(shown.querySelector('[data-control="WIDC_GUILDBANK_NUM"] .hud-res-static-text, .hud-guild-bank-gold .hud-res-static-text')?.textContent).toBe('70,000');
    hud.request();
    expect(lines).toEqual(['You are already using the bank.']);
  });

  it('takes: the own item into the bag, another\'s only out of the bank; penya into the own bag and the fund', () => {
    open();
    hud.handle({ type: 'getItemGuildBank', mode: 1, item: { objectId: 3, itemId: STACK, count: 15 } });
    expect(bag.get(103)?.count).toBe(15);
    expect(hud.book.item(3)?.count).toBe(25);
    hud.handle({ type: 'getItemGuildBank', mode: 3, item: { objectId: 2, itemId: 21, count: 1 } });
    expect(hud.book.item(2)).toBeUndefined();
    expect(bag.has(102)).toBe(false);
    hud.handle({ type: 'getGoldGuildBank', mode: 0, gold: 500, playerId: 500, cloak: false });
    hud.handle({ type: 'getGoldGuildBank', mode: 2, gold: 10_000, playerId: 500, cloak: true });
    expect(gold).toBe(1500);
    expect(fund.slice(1)).toEqual([['take', 500, 500, 0], ['take', 10_000, 500, 1]]);
    hud.handle({ type: 'removeGuildBankItem', guildId: 77, objectId: NULL_ID, count: 300 });
    expect(fund.at(-1)).toEqual(['remove', 77, 300]);
  });

  it('the close box and a move send GUILD_BANK_WND_CLOSE once; the world leaving sends nothing', () => {
    open();
    hud.window.frame.close();
    expect(types()).toEqual(['closeGuildBankWndRequest']);
    open();
    hud.moved();
    expect(types()).toEqual(['closeGuildBankWndRequest', 'closeGuildBankWndRequest']);
    expect(hud.isOpen).toBe(false);
    open();
    hud.reset();
    expect(types()).toHaveLength(2);
  });

  it('the log is the master\'s and the kingpins\'; it asks for Add Item first', () => {
    open();
    own = 502;
    hud.window.window.button('WIDC_LOG').click();
    expect(lines).toEqual(['Only Guild Leader or Kingpin can check Guild Bank logs.']);
    own = 501;
    hud.window.window.button('WIDC_LOG').click();
    expect(hud.log.isOpen).toBe(true);
    expect(decodeWorldPacket(sent.at(-1)!)).toEqual({ type: 'guildBankLogViewRequest', logType: 1 });
    hud.handle({ type: 'guildBankLog', logType: 1, rows: [{ name: 'Ann', date: 1_763_100_000, value: STACK, option: 0, count: 2 }] });
    expect(hud.log.window.frame.element.querySelectorAll('.hud-guild-bank-log-line').length).toBe(1);
  });

  it('Contribute Guild sends the penya and the gems, each with its line; Create Cloak is the master\'s at level 4', () => {
    open();
    bag.set(9, { objectId: 9, itemId: GEM, count: 3 });
    hud.window.window.button('WIDC_BUTTON1').click();
    expect(hud.merit.isOpen).toBe(true);
    hud.merit.window.input('WIDC_EDIT1').value = '2500';
    hud.merit.window.frame.body.querySelector<HTMLButtonElement>('[data-control="WIDC_CHECK2"]')!.click();
    expect(hud.merit.window.frame.element.querySelectorAll('.hud-guild-merit-items .hud-bank-cell').length).toBe(1);
    hud.merit.window.button('WIDC_BUTTON1').click();
    expect(sent.slice(-2).map((bytes) => decodeWorldPacket(bytes))).toEqual([
      { type: 'guildContributionRequest', pxpCount: 0, gold: 2500, itemFlag: 0 },
      { type: 'guildContributionRequest', pxpCount: 0, gold: 0, itemFlag: 1 },
    ]);
    expect(lines).toEqual(['You have Contributed to the guild.', 'You have Contributed to the guild.']);
    expect(hud.merit.isOpen).toBe(false);
    hud.window.window.button('WIDC_BUTTON2').click();
    expect(types().at(-1)).toBe('createGuildCloakRequest');
    guild = guildOf({ level: 3 });
    hud.window.window.button('WIDC_BUTTON2').click();
    expect(lines.at(-1)).toBe('box: Guild level is too low.');
  });
});
