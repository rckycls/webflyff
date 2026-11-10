// @vitest-environment jsdom
// 2026-11-10 (bank-mail): the post's sums, rules and windows (post/postBox.ts, post/postHud.ts; research §2, B-mail.md).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decodeWorldPacket } from '@flyffweb/protocol';
import type { InventoryItem, Mail } from '@flyffweb/protocol';
import type { Texts } from '../src/world/gameData';
import type { UiArt } from '../src/world/hud/art';
import {
  PostBox, itemCost, mailInfo, receivedDate, sendCheck, senderText, storageFee, timeLeftColor, timeLeftText, titleText,
} from '../src/world/post/postBox';
import { PostHud } from '../src/world/post/postHud';
import type { PostHudScreen } from '../src/world/post/postHud';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const at = (day: number, hour = 12, minute = 0): number => new Date(2026, 10, day, hour, minute, 0).getTime();

describe('the post sums (CMail::GetMailInfo, CWndPostReceive::OnDraw, MailReceiveItem)', () => {
  it('days and hours left from the day of the month, wrong across a month as in Neuz', () => {
    expect(mailInfo(at(1), at(1))).toEqual({ days: 16, hours: 360 });
    expect(mailInfo(at(1), at(1, 13))).toEqual({ days: 15, hours: 359 });
    expect(mailInfo(at(1), at(15, 13))).toEqual({ days: 1, hours: 23 });
    // made on the 30th, seen on the 2nd of the next month: 28 days back, as `COleDateTimeSpan` of the day numbers
    const next = new Date(2026, 11, 2, 12).getTime();
    expect(mailInfo(new Date(2026, 10, 30, 12).getTime(), next)).toEqual({ days: 44, hours: 1032 });
  });

  it('the text is days, or hours at a day or less; the colour wraps past 7 days', () => {
    expect(timeLeftText({ days: 15, hours: 359 }, '%.1dday', '%.1dhr')).toBe('15day');
    expect(timeLeftText({ days: 1, hours: 23 }, '%.1dday', '%.1dhr')).toBe('23hr');
    expect([0, 7, 15, -1].map(timeLeftColor)).toEqual([[255, 0, 0], [0, 150, 0], [221, 65, 0], [35, 235, 0]]);
  });

  it('the storage fee after 7 days: cost (8 - days) / 8', () => {
    expect(storageFee({ days: 9, hours: 200 }, 800)).toBeNull();
    expect(storageFee({ days: 8, hours: 191 }, 800)).toBe(0);
    expect(storageFee({ days: 4, hours: 95 }, 800)).toBe(400);
    expect(storageFee({ days: 0, hours: 0 }, 800)).toBe(800);
    expect(itemCost({ objectId: 1, itemId: 1, count: 1, abilityOption: 3 }, { cost: 1000 } as never)).toBe(1600);
    expect(itemCost({ objectId: 1, itemId: 1, count: 1 }, { cost: 0xffffffff } as never)).toBe(-1);
  });

  it('the sender and title cuts, and the date', () => {
    expect([senderText(0, ''), senderText(7, ''), senderText(7, 'Seventeen-letters'), senderText(7, 'Bob')])
      .toEqual(['FLYFF', 'Unknown', 'Seventeen-letter...', 'Bob']);
    expect([titleText('Twelve chars'), titleText('Thirteen char'), titleText('Hi')]).toEqual(['Twelve chars', 'Thirteen char...', 'Hi']);
    expect(receivedDate(new Date(2026, 10, 10, 15, 42, 11).getTime())).toBe('11/10/2026 3:42:11 PM');
  });

  it('Send checks in order: empty, digits, the penya limit, the name, the text, the title', () => {
    const form = { receiver: 'Bob', title: 'Hi', text: '', penya: '0' };
    expect(sendCheck({ ...form, title: '' })).toEqual({ kind: 'none' });
    expect(sendCheck({ ...form, penya: '1e3' })).toEqual({ kind: 'none' });
    expect(sendCheck({ ...form, penya: '1000000001' })).toEqual({ kind: 'box', tid: 'TID_GAME_LIMITPENYA' });
    expect(sendCheck({ ...form, receiver: 'Bo' })).toEqual({ kind: 'box', tid: 'TID_DIAG_0057' });
    expect(sendCheck({ ...form, text: 'x'.repeat(256) })).toEqual({ kind: 'box', tid: 'TID_GAME_MAILBOX_TEXT_MAX', args: [256] });
    expect(sendCheck({ ...form, title: 'x'.repeat(32) })).toEqual({ kind: 'box', tid: 'TID_GAME_MAILBOX_TITLE_MAX', args: [32] });
    expect(sendCheck({ ...form, penya: '' })).toEqual({ kind: 'ok', gold: 0 });
  });

  it('PostBox: replaced, and REMOVEMAIL takes the mail, its item, its penya, or marks it read', () => {
    const box = new PostBox();
    const item = { objectId: 4, itemId: 21, count: 1 };
    box.replace([{ id: 1, senderId: 7, item, gold: 50, age: 3600, read: false, title: 't', text: '' }, { id: 2, senderId: 0, gold: 0, age: 0, read: false, title: '', text: '' }], at(5));
    expect(box.find(1)?.created).toBe(at(5) - 3600 * 1000);
    box.remove(1, 1);
    box.remove(1, 2);
    box.remove(1, 3);
    expect(box.find(1)).toMatchObject({ gold: 0, read: true });
    expect(box.find(1)?.item).toBeUndefined();
    box.remove(2, 0);
    expect(box.mails.map((mail) => mail.id)).toEqual([1]);
  });
});

describe('PostHud: the flow', () => {
  let sent: unknown[];
  let boxes: string[];
  let lines: string[];
  let confirms: Array<[string, () => void]>;
  let reserved: Array<[number, boolean]>;
  let now: number;
  let bag: Map<number, InventoryItem>;
  const made: PostHud[] = [];
  const texts = new Map([
    ['TID_MAIL_SEND_CONFIRM', { text: 'Would you like to send mail?\\n Received mail will be deleted after %d days.', color: 0xffffffff, textId: 1 }],
    ['TID_MAIL_OTHERWORK', { text: 'Not available', color: 0xffffffff, textId: 2 }],
  ]) as unknown as Texts;

  function hud(): PostHud {
    const screen: PostHudScreen = {
      send: (bytes) => { sent.push(decodeWorldPacket(bytes)); },
      say: (text) => { lines.push(text); }, box: (text) => { boxes.push(text); },
      confirm: (text, onOk) => { confirms.push([text, onOk]); },
      bagItems: () => bag, ownGold: () => 5000, worn: () => false,
      prop: (itemId) => ({ packMax: itemId === 2800 ? 99 : 1, name: `Item ${itemId}`, icon: '', cost: 800 }) as never,
      playerName: (id) => (id === 7 ? 'Alice' : ''), friends: () => ['Alice', 'Bob'],
      tradeOpen: () => false, bankOpen: () => false, bankPinOpen: () => false, npcShopOpen: () => false,
      openInventory: () => {}, reserve: (id, on) => { reserved.push([id, on]); }, showTooltip: () => {}, now: () => now,
    };
    const h = new PostHud(art, texts, screen);
    document.body.append(...h.elements);
    made.push(h);
    return h;
  }

  const mail = (patch: Partial<Mail> = {}): Mail => ({ id: 9, senderId: 7, gold: 0, age: 60, read: false, title: 'Potions', text: 'hello', ...patch });

  beforeEach(() => {
    sent = []; boxes = []; lines = []; confirms = []; reserved = [];
    now = at(10);
    bag = new Map([[3, { objectId: 3, itemId: 21, count: 1 }], [4, { objectId: 4, itemId: 2800, count: 30 }]]);
  });
  afterEach(() => { for (const h of made.splice(0)) h.reset(); document.body.replaceChildren(); });

  it('opens disabled on Inbox, asks for the box with the request box up; the box enables it and lists the mails', () => {
    const h = hud();
    h.open();
    expect(sent).toEqual([{ type: 'queryMailBoxRequest' }]);
    expect([h.isOpen, h.request.isOpen, h.window.currentTab]).toEqual([true, true, 1]);
    expect(h.window.frame.element.classList.contains('is-waiting')).toBe(true);
    h.open();
    expect(lines).toEqual(['Not available']);
    h.handle({ type: 'mailBox', receiverId: 500, mails: [mail({ item: { objectId: 1, itemId: 2800, count: 5 } })] });
    h.update();
    expect([h.request.isOpen, h.window.frame.element.classList.contains('is-waiting')]).toEqual([false, false]);
    const row = h.window.frame.element.querySelector<HTMLElement>('.hud-post-row')!;
    expect(row.querySelector('.hud-post-row-sender')?.textContent).toBe('Alice');
    expect(row.querySelector('.hud-post-row-time')?.textContent).toBe('15day');
    expect(row.querySelector('.hud-post-row-title')?.textContent).toBe('Potions');
  });

  it('waits for a box that is coming, asking again every 5 s', () => {
    const h = hud();
    h.open();
    h.handle({ type: 'mailBoxReq', hasMail: true });
    sent = [];
    now += 5000;
    h.update();
    expect(sent).toEqual([{ type: 'queryMailBoxRequest' }]);
    h.handle({ type: 'mailBoxReq', hasMail: false });
    expect(h.request.isOpen).toBe(false);
  });

  it('reading sends READMAIL; the item after 7 days asks the fee first; the penya at once', () => {
    const h = hud();
    h.open();
    h.handle({ type: 'mailBox', receiverId: 500, mails: [mail({ item: { objectId: 1, itemId: 21, count: 1 }, gold: 1234, age: 12 * 86400 })] });
    sent = [];
    h.openMail(9);
    expect(sent).toEqual([{ type: 'readMailRequest', mailId: 9 }]);
    expect(h.read.window.control('WIDC_EDIT3').textContent).toBe('1,234');
    h.read.window.control('WIDC_STATIC3').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(h.warning.isOpen).toBe(true);
    expect(h.warning.window.control('WIDC_CONTEXT').textContent).toContain('7');
    h.warning.window.button('WIDC_BTN_YES').click();
    expect(sent.at(-1)).toEqual({ type: 'queryGetMailItemRequest', mailId: 9 });
    h.read.window.control('WIDC_STATIC4').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(sent.at(-1)).toEqual({ type: 'queryGetMailGoldRequest', mailId: 9 });
    expect(h.read.window.control('WIDC_EDIT3').textContent).toBe('0');
  });

  it('Delete asks, then QUERYREMOVEMAIL and the read window goes; Reply fills the Send page', () => {
    const h = hud();
    h.open();
    h.handle({ type: 'mailBox', receiverId: 500, mails: [mail()] });
    h.openMail(9);
    h.read.window.button('WIDC_BUTTON1').click();
    expect(h.remove.isOpen).toBe(true);
    h.remove.window.button('WIDC_YES').click();
    expect(sent.at(-1)).toEqual({ type: 'queryRemoveMailRequest', mailId: 9 });
    expect(h.read.isOpen).toBe(false);
    h.openMail(9);
    h.read.window.button('WIDC_BUTTON2').click();
    expect([h.window.currentTab, h.window.receiver.value, h.window.title.value, h.read.isOpen]).toEqual([0, 'Alice', 'Re:Potions', false]);
  });

  it('attach: one item (the title its name), a stack its count; Send confirms and sends, dropping only the attachment', () => {
    const h = hud();
    h.open();
    h.handle({ type: 'mailBoxReq', hasMail: false });
    h.window.showTab(0);
    h.attach(4);
    expect(h.amount.isOpen).toBe(true);
    expect(h.window.title.value).toBe('Item 2800');
    const field = h.amount.element.querySelector<HTMLInputElement>('input')!;
    field.value = '12';
    h.amount.element.querySelector<HTMLButtonElement>('[data-control="WIDC_OK"]')!.click();
    expect(reserved).toEqual([[4, true]]);
    h.window.receiver.value = 'Bob';
    h.window.body.value = 'for you';
    h.window.penya.value = '100';
    h.window.window.button('WIDC_SEND').click();
    expect(confirms[0]?.[0]).toBe('Would you like to send mail?\n Received mail will be deleted after 15 days.');
    confirms[0]![1]();
    expect(sent.at(-1)).toEqual({
      type: 'queryPostMailRequest', itemObjectId: 4, count: 12, receiver: 'Bob', gold: 100, title: 'Item 2800', text: 'for you',
    });
    expect(reserved.at(-1)).toEqual([4, false]);
    expect([h.window.receiver.value, h.window.title.value]).toEqual(['Bob', 'Item 2800']);
  });

  it('a mail with no item sends 0xff and 0; moving closes the post', () => {
    const h = hud();
    h.open();
    h.window.showTab(0);
    h.window.receiver.value = 'Bob';
    h.window.title.value = 'Hi';
    h.window.window.button('WIDC_SEND').click();
    confirms[0]![1]();
    expect(sent.at(-1)).toMatchObject({ type: 'queryPostMailRequest', itemObjectId: 0xff, count: 0, gold: 0 });
    h.moved();
    expect(h.isOpen).toBe(false);
  });
});
