// custom (owner 2026-11-20, redeem codes): the game moves a redeemed code's mails (`Code reward #<use id>`, from the game
// itself) into the bag; never a player's mail, never one it was not told about, never twice.
import { beforeEach, expect, it } from 'vitest';
import { encodeQueryGetMailItem, encodeQueryMailBox } from '@flyffweb/protocol';
import type { InventoryItem, Mail } from '@flyffweb/protocol';
import { CodeMailTaker, WAITING_TEXT, expectedCodeUses } from '../src/world/codes/codeMailTaker';

const ITEM = { itemId: 10206, count: 5 } as unknown as InventoryItem;
const mail = (id: number, title: string, senderId = 0, item: InventoryItem | undefined = ITEM): Mail => ({ id, senderId, item, gold: 0, age: 30, read: false, title, text: 'x' });
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

function setUp(free = 10) {
  const sent: Uint8Array[] = [];
  const said: string[] = [];
  const host = { send: (bytes: Uint8Array) => { sent.push(bytes); }, freeSlots: () => free, say: (text: string) => { said.push(text); } };
  const taker = new CodeMailTaker(host);
  const takes = () => sent.filter((b) => !same(b, encodeQueryMailBox()));
  const asks = () => sent.filter((b) => same(b, encodeQueryMailBox())).length;
  return { taker, sent, said, takes, asks, setFree: (n: number) => { free = n; } };
}

beforeEach(() => expectedCodeUses.clear());

it('takes the item of a system mail of an expected use, once', () => {
  const { taker, takes } = setUp();
  taker.expect(7, 0);
  taker.handle({ type: 'mailBox', receiverId: 1, mails: [mail(41, 'Code reward #7'), mail(42, 'Code reward #7')] }, 1000);
  taker.handle({ type: 'mailBox', receiverId: 1, mails: [mail(41, 'Code reward #7'), mail(42, 'Code reward #7')] }, 2000);
  expect(takes()).toEqual([encodeQueryGetMailItem(41), encodeQueryGetMailItem(42)]);
});

it('never takes a player\'s mail with the same title, nor a use it was not told about', () => {
  const { taker, takes } = setUp();
  taker.expect(7, 0);
  taker.handle({ type: 'mailBox', receiverId: 1, mails: [mail(41, 'Code reward #7', 55), mail(43, 'Code reward #8'), mail(44, 'Code reward #7 ')] }, 1000);
  expect(takes()).toEqual([]);
});

it('takes nothing with a full bag and says once that the items wait in the mailbox', () => {
  const { taker, takes, said } = setUp(0);
  taker.expect(7, 0);
  taker.handle({ type: 'mailBox', receiverId: 1, mails: [mail(41, 'Code reward #7'), mail(42, 'Code reward #7')] }, 1000);
  taker.handle({ type: 'mailBox', receiverId: 1, mails: [mail(41, 'Code reward #7'), mail(42, 'Code reward #7')] }, 2000);
  expect(takes()).toEqual([]);
  expect(said).toEqual([WAITING_TEXT]);
});

it('takes only as many as the bag has room for', () => {
  const { taker, takes, said } = setUp(1);
  taker.expect(7, 0);
  taker.handle({ type: 'mailBox', receiverId: 1, mails: [mail(41, 'Code reward #7'), mail(42, 'Code reward #7')] }, 1000);
  expect(takes()).toEqual([encodeQueryGetMailItem(41)]);
  expect(said).toEqual([WAITING_TEXT]);
});

it('asks the mailbox 20 seconds after a redeem, then every 20 seconds for 3 minutes, and again 5 s after a wait answer', () => {
  const { taker, asks } = setUp();
  taker.expect(7, 0);
  taker.update(19_000);
  expect(asks()).toBe(0);
  taker.update(20_000);
  expect(asks()).toBe(1);
  taker.handle({ type: 'mailBoxReq', hasMail: true }, 20_500);
  taker.update(25_500);
  expect(asks()).toBe(2);
  for (let t = 26_000; t <= 400_000; t += 1000) taker.update(t);
  const after = asks();
  expect(after).toBeGreaterThan(5);
  taker.update(600_000);
  expect(asks()).toBe(after);
});

it('asks the mailbox when the new-mail notice comes, only while a use is expected', () => {
  const { taker, asks } = setUp();
  taker.mailNotice(0);
  expect(asks()).toBe(0);
  taker.expect(7, 0);
  taker.mailNotice(1000);
  expect(asks()).toBe(1);
});

it('forgets a use once its mails were taken, and keeps it across a new taker (a log out and in)', () => {
  const { taker } = setUp();
  taker.expect(7, 0);
  taker.expect(9, 0);
  taker.handle({ type: 'mailBox', receiverId: 1, mails: [mail(41, 'Code reward #7')] }, 1000);
  const emptied: Mail = { ...mail(41, 'Code reward #7'), item: undefined }; // its item taken, the mail kept
  taker.handle({ type: 'mailBox', receiverId: 1, mails: [emptied] }, 2000);
  expect([...expectedCodeUses]).toEqual([9]);
  const again = setUp();
  again.taker.handle({ type: 'mailBox', receiverId: 1, mails: [mail(50, 'Code reward #9')] }, 0);
  expect(again.takes()).toEqual([encodeQueryGetMailItem(50)]);
});

it('asks the mailbox when the mail mode turns on, the first frame of a world included (the final review)', () => {
  expectedCodeUses.add(7); // redeemed before a log out and in
  const { taker, asks } = setUp();
  taker.mailMode(true, 0);
  expect(asks()).toBe(1);
  taker.mailMode(true, 100);
  expect(asks()).toBe(1);
  taker.mailMode(false, 200);
  taker.mailMode(true, 300);
  expect(asks()).toBe(2);
});

it('goes on asking for uses still expected when a world starts', () => {
  expectedCodeUses.add(7);
  const { taker, asks } = setUp();
  taker.resume(0);
  taker.update(4_000);
  expect(asks()).toBe(0);
  taker.update(5_000);
  expect(asks()).toBe(1);
  taker.update(25_000);
  expect(asks()).toBe(2);
  const quiet = setUp();
  expectedCodeUses.clear();
  quiet.taker.resume(0);
  quiet.taker.update(5_000);
  expect(quiet.asks()).toBe(0);
});
