// @vitest-environment jsdom
// 2026-11-15 (Guild Siege, B3): Frankie's and Donaris's windows (guildCombat/guildCombatHud.ts, hud/guildCombat/*.ts).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  encodeGcApply, encodeGcCancel, encodeGcJoin, encodeGcPenyaGuild, encodeGcStatus, encodeGcTele, encodeGcWindow,
} from '@flyffweb/protocol';
import type { GuildCombatMessage } from '@flyffweb/protocol';
import type { UiArt } from '../src/world/hud/art';
import { MMI } from '../src/world/hud/moverMenu';
import { GuildCombatBook } from '../src/world/guildCombat/guildCombatBook';
import { GuildCombatHud } from '../src/world/guildCombat/guildCombatHud';
import type { GuildCombatHost } from '../src/world/guildCombat/guildCombatHud';
import { BOARD1, BOARD2, BOARD3, BOARD_FEE, BOARD_PRIZE } from '../src/world/guildCombat/boardTexts';
import { GcState, GcTid } from '../src/world/guildCombat/guildCombatRules';
import { countdownText } from '../src/world/hud/guildCombat/statusWindow';

const art: UiArt = { url: () => '', sheets: null };
const T = 'guildCombat' as const;
const TEXTS: Record<string, string> = {
  TID_PK_LIMIT_DAY: '%.1dday', TID_PK_LIMIT_HOUR: '%.1dhr', TID_PK_LIMIT_MINUTE: '%.1dmin', TID_PK_LIMIT_SECOND: '%.1dsec',
  TID_GAME_GUILDWAR_CANCEL: 'Do you want to withdraw from the Guild Siege?', TID_GAME_GUILDWAR_JOIN: 'Do you join the Guild Siege?',
};
const BY_ID: Record<number, string> = {
  [GcTid.MORE_CURRENT_REQUEST]: 'You require more Penya to apply.', [GcTid.LIMIT_MIN]: 'Apply with the minimum Application Fee or higher.',
  [GcTid.MORE_REQUEST]: 'You have applied with %d Penya. Do you wish to add %d Penya?', [GcTid.REQUESTEND]: 'Guild Siege is closed.',
  [GcTid.NOTENTER_VAGRANT]: 'A vagrant is not eligible.', [GcTid.JACKPOT]: 'You received %I64d penya as prize money.',
};

interface Made { hud: GuildCombatHud; book: GuildCombatBook; sent: Uint8Array[]; boxes: Array<{ text: string; ok?: () => void }>; host: GuildCombatHost; state: { master: boolean; vagrant: boolean; now: number } }

function make(): Made {
  const sent: Uint8Array[] = [];
  const boxes: Made['boxes'] = [];
  const state = { master: true, vagrant: false, now: 1000 };
  const host: GuildCombatHost = {
    send: (bytes) => sent.push(bytes), text: (tid) => TEXTS[tid] ?? '', textById: (id) => BY_ID[id] ?? '',
    box: (text, ok) => boxes.push({ text, ok }), ownIsVagrant: () => state.vagrant, ownGuildName: () => 'Bravo',
    ownIsGuildMaster: () => state.master, ownGold: () => 0, now: () => state.now,
  };
  const book = new GuildCombatBook();
  const hud = new GuildCombatHud(host, book, art);
  const layer = document.createElement('div');
  layer.style.cssText = 'width:800px;height:400px';
  layer.append(...hud.elements);
  document.body.append(layer);
  return { hud, book, sent, boxes, host, state };
}

type Body = GuildCombatMessage extends infer M ? (M extends { type: string } ? Omit<M, 'type'> : never) : never;
const message = (m: Body): GuildCombatMessage => ({ type: T, ...m } as GuildCombatMessage);
const feed = (h: Made, m: GuildCombatMessage): void => h.hud.handle(h.book.apply(m, h.state.now));
const click = (root: Element, control: string): void => (root.querySelector(`[data-control="${control}"]`) as HTMLElement).click();

let h: Made;
beforeEach(() => { document.body.replaceChildren(); h = make(); });
afterEach(() => h.hud.dispose());

describe('the menu entries', () => {
  it('Apply, Status and the Entry send their requests', () => {
    h.hud.openEntry(MMI.GUILDWAR_APP);
    h.hud.openEntry(MMI.GUILDWAR_STATE);
    expect(h.sent).toEqual([encodeGcWindow(), encodeGcStatus()]);
  });

  it('Jackpot is sent only by the guild master, silently otherwise', () => {
    h.hud.openEntry(MMI.GUILDCOMBAT_JACKPOT);
    expect(h.sent).toEqual([encodeGcPenyaGuild()]);
    h.state.master = false;
    h.hud.openEntry(MMI.GUILDCOMBAT_JACKPOT);
    expect(h.sent).toHaveLength(1);
    expect(h.boxes).toHaveLength(0);
  });

  it('the boards show the V15 texts of the owner\'s rules (level 50, 12 bids, 6 lives)', () => {
    h.hud.openEntry(MMI.GUILDCOMBAT_INFO_BOARD1);
    expect(h.hud.board.isOpen).toBe(true);
    const text = h.hud.board.element.querySelector('[data-control="WIDC_TEXT1"]')!.textContent!;
    expect(text).toContain('Level 50+');
    expect(text).toContain('12 highest bids');
    expect(text).toContain('6:52 AM / 6:52 PM');
    expect(text).not.toContain('#b');
    h.hud.openEntry(MMI.GUILDCOMBAT_INFO_BOARD2);
    expect(h.hud.board.element.textContent).toContain('6 "lives"');
    expect(BOARD1).toContain('#b#cff0000ff');
    expect(BOARD3).toContain('Defeating the enemy (+2)');
    expect(BOARD_PRIZE).toContain('Red Chips');
    expect(BOARD_FEE).toContain('12 Guilds');
    expect(BOARD2).not.toContain('3 "lives"');
  });
});

describe('Apply (GC_IN_WINDOW)', () => {
  const open = (ownBid: number, minBid: number): void => feed(h, message({ sub: 'inWindow', totalPrize: 0, ownBid, minBid }));

  it('opens the 304x272 window with the minimum bid filled', () => {
    open(0, 100_000_000);
    expect(h.hud.apply.isOpen).toBe(true);
    expect((h.hud.apply.element as HTMLElement).style.width).toBe('304px');
    expect((h.hud.apply.element as HTMLElement).style.height).toBe('272px');
    expect((h.hud.apply.window.input('WIDC_EDIT1')).value).toBe('100000000');
  });

  it('a guild that has bid sees its own bid', () => {
    open(250_000_000, 100_000_000);
    expect(h.hud.apply.window.input('WIDC_EDIT1').value).toBe('250000000');
  });

  it('while the siege is not closed it says so and opens nothing', () => {
    feed(h, message({ sub: 'gcState', state: GcState.OPEN, warState: GcState.NOTENTER }));
    open(0, 100);
    expect(h.hud.apply.isOpen).toBe(false);
    expect(h.boxes.map((b) => b.text)).toEqual(['Guild Siege is closed.']);
  });

  it('OK in the confirm box sends GC_IN_APP and closes the window', () => {
    open(0, 100_000_000);
    click(h.hud.apply.element, 'WIDC_ACCEPT');
    expect(h.boxes.at(-1)!.text).toBe('You have applied with 0 Penya. Do you wish to add 100000000 Penya?');
    expect(h.sent).toHaveLength(0);
    h.boxes.at(-1)!.ok!();
    expect(h.sent).toEqual([encodeGcApply(100_000_000)]);
    expect(h.hud.apply.isOpen).toBe(false);
  });

  it('refuses a bid under the minimum, and a raise that is not more (no packet)', () => {
    open(0, 100_000_000);
    h.hud.apply.window.input('WIDC_EDIT1').value = '5';
    click(h.hud.apply.element, 'WIDC_ACCEPT');
    expect(h.boxes.at(-1)).toEqual({ text: 'Apply with the minimum Application Fee or higher.', ok: undefined });
    h.hud.apply.close();
    open(300_000_000, 100_000_000);
    h.hud.apply.window.input('WIDC_EDIT1').value = '300000000';
    click(h.hud.apply.element, 'WIDC_ACCEPT');
    expect(h.boxes.at(-1)!.text).toBe('You require more Penya to apply.');
    h.hud.apply.window.input('WIDC_EDIT1').value = '350000000';
    click(h.hud.apply.element, 'WIDC_ACCEPT');
    expect(h.boxes.at(-1)!.text).toBe('You have applied with 300000000 Penya. Do you wish to add 50000000 Penya?');
    expect(h.sent).toHaveLength(0);
  });
});

describe('Status (GC_REQUEST_STATUS)', () => {
  it('lists the guilds in bid order, the own place and the count-down', () => {
    feed(h, message({ sub: 'requestStatus', secondsToNext: 3725, prize: 0, guildNames: ['Alpha', 'Bravo', 'Charlie'], ownBid: 150_000_000 }));
    const win = h.hud.status.element;
    expect(h.hud.status.isOpen).toBe(true);
    const rows = [...win.querySelectorAll('[role="option"]')].map((row) => row.textContent);
    expect(rows).toEqual(['No.01Alpha', 'No.02Bravo', 'No.03Charlie']);
    expect(win.querySelector('[data-control="WIDC_STATIC5"]')!.textContent).toBe('2');
    expect(win.querySelector('[data-control="WIDC_STATIC6"]')!.textContent).toBe('150,000,000');
    expect(win.querySelector('[data-control="WIDC_STATIC2"]')!.textContent).toBe('1hr 2min 5sec');
    h.state.now += 5_000;
    h.hud.step(h.state.now);
    expect(win.querySelector('[data-control="WIDC_STATIC2"]')!.textContent).toBe('1hr 2min 0sec');
  });

  it('the own place is red past the 12th', () => {
    const names = Array.from({ length: 12 }, (_, i) => `G${i}`);
    feed(h, message({ sub: 'requestStatus', secondsToNext: 10, prize: 0, guildNames: [...names, 'Bravo'], ownBid: 1 }));
    expect(h.hud.status.element.querySelector<HTMLElement>('[data-control="WIDC_STATIC5"] .hud-res-static-text')!.style.color).toBe('rgb(255, 0, 0)');
  });

  it('Apply closes it and asks for the offer; Refresh asks again', () => {
    feed(h, message({ sub: 'requestStatus', secondsToNext: 10, prize: 0, guildNames: [], ownBid: 0 }));
    click(h.hud.status.element, 'WIDC_BUTTON2');
    click(h.hud.status.element, 'WIDC_BUTTON1');
    expect(h.sent).toEqual([encodeGcStatus(), encodeGcWindow()]);
    expect(h.hud.status.isOpen).toBe(false);
  });

  it('countdownText leaves out the parts above the first that is not zero', () => {
    const text = (tid: string) => TEXTS[tid]!;
    expect(countdownText(90_061, text)).toBe('1day 1hr 1min 1sec');
    expect(countdownText(59, text)).toBe('59sec');
  });
});

describe('Cancel and Join', () => {
  it('Cancel asks, and only Yes sends the cancel', () => {
    h.hud.openEntry(MMI.GUILDWAR_CANCEL);
    expect(h.hud.cancel.element.textContent).toContain('Do you want to withdraw from the Guild Siege?');
    click(h.hud.cancel.element, 'WIDC_NO');
    expect(h.sent).toHaveLength(0);
    h.hud.openEntry(MMI.GUILDWAR_CANCEL);
    click(h.hud.cancel.element, 'WIDC_YES');
    expect(h.sent).toEqual([encodeGcCancel()]);
    expect(h.hud.cancel.isOpen).toBe(false);
  });

  it('a vagrant cannot join: the box, no packet', () => {
    h.state.vagrant = true;
    h.hud.openEntry(MMI.GUILDWAR_JOIN);
    click(h.hud.join.element, 'WIDC_YES');
    expect(h.sent).toHaveLength(0);
    expect(h.boxes.at(-1)!.text).toBe('A vagrant is not eligible.');
    expect(h.hud.join.isOpen).toBe(false);
  });

  it('a first job joins: GC_JOIN', () => {
    h.hud.openEntry(MMI.GUILDWAR_JOIN);
    click(h.hud.join.element, 'WIDC_YES');
    expect(h.sent).toEqual([encodeGcJoin()]);
  });
});

describe('the boxes and the answers', () => {
  it('GC_TELE: Yes sends GC_TELE, the text is the server\'s', () => {
    feed(h, message({ sub: 'tele', text: 'Entrance has started.' }));
    expect(h.hud.tele.element.textContent).toContain('Entrance has started.');
    click(h.hud.tele.element, 'WIDC_YES');
    expect(h.sent).toEqual([encodeGcTele()]);
    expect(h.hud.tele.isOpen).toBe(false);
  });

  it('GC_DIAGMESSAGE: the text with OK', () => {
    feed(h, message({ sub: 'diagMessage', text: 'You qualified.' }));
    expect(h.hud.diag.element.textContent).toContain('You qualified.');
    click(h.hud.diag.element, 'WIDC_OK');
    expect(h.hud.diag.isOpen).toBe(false);
    expect(h.sent).toHaveLength(0);
  });

  it('GC_GETPENYAGUILD becomes its message box', () => {
    feed(h, message({ sub: 'getPenyaGuild', result: 0, penya: 5000 }));
    expect(h.boxes.at(-1)!.text).toBe('You received 5000 penya as prize money.');
  });
});

describe('walking away', () => {
  it('closes the offer, the status and the join confirm, and nothing else', () => {
    feed(h, message({ sub: 'inWindow', totalPrize: 0, ownBid: 0, minBid: 1 }));
    feed(h, message({ sub: 'requestStatus', secondsToNext: 10, prize: 0, guildNames: [], ownBid: 0 }));
    h.hud.openEntry(MMI.GUILDWAR_JOIN);
    h.hud.openEntry(MMI.GUILDWAR_CANCEL);
    h.hud.openEntry(MMI.GUILDCOMBAT_INFO_TEX);
    h.hud.closeForMove();
    expect([h.hud.apply.isOpen, h.hud.status.isOpen, h.hud.join.isOpen]).toEqual([false, false, false]);
    expect([h.hud.cancel.isOpen, h.hud.board.isOpen]).toEqual([true, true]);
  });
});
