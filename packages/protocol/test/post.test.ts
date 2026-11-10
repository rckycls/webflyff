// 2026-11-10 (bank-mail): the post's packets (research §2, B-mail.md §10), read as Neuz's handlers read them and written as
// its senders write them.
import { describe, expect, it } from 'vitest';
import { encodeBundle, writeMailBox, writeMailBoxReq, writeModifyMode, writeRemoveMail } from '@flyffweb/testkit';
import {
  NO_MAIL_ITEM, PacketType, WORLD_READERS, decodeWorldPacket, encodeQueryGetMailGold, encodeQueryGetMailItem,
  encodeQueryMailBox, encodeQueryPostMail, encodeQueryRemoveMail, encodeReadMail, isPostMessage, readBundle,
} from '../src';
import type { Mail } from '../src';

const SELF = 9;

describe('the post snapshots', () => {
  it('reads the mailbox, the empty-box answer, REMOVEMAIL and MODIFYMODE', () => {
    const mails: Mail[] = [
      { id: 1, senderId: 0, gold: 0, age: 60, read: false, title: '', text: '' },
      {
        id: 9, senderId: 700, item: { objectId: 4, itemId: 2029, count: 12 }, gold: 1_000_000, age: 8 * 86400, read: true,
        title: 'Potions', text: 'Two lines\nhere, café',
      },
    ];
    const result = readBundle(encodeBundle(PacketType.SNAPSHOT, SELF, [
      writeMailBox(SELF, 500, mails), writeMailBoxReq(SELF, false), writeMailBoxReq(SELF, true), writeRemoveMail(SELF, 9, 1),
      writeModifyMode(SELF, 0x8000),
    ]), WORLD_READERS);
    expect(result.mismatched).toEqual([]);
    const values = result.messages.map((m) => m.value);
    expect(values.slice(0, 4)).toEqual([
      { type: 'mailBox', receiverId: 500, mails },
      { type: 'mailBoxReq', hasMail: false },
      { type: 'mailBoxReq', hasMail: true },
      { type: 'removeMail', mailId: 9, kind: 1 },
    ]);
    expect(values.slice(0, 4).every((v) => isPostMessage(v))).toBe(true);
    expect(values[4]).toMatchObject({ type: 'modifyMode', mode: 0x8000 });
  });
});

describe('the post packets the browser sends (DPClient.cpp:15840-15901)', () => {
  it('writes QUERYPOSTMAIL as BYTE, short, String, int, String, String', () => {
    const bytes = encodeQueryPostMail({ itemObjectId: NO_MAIL_ITEM, count: 0, receiver: 'Bob', gold: 7, title: 'Hi', text: 'a\nb' });
    expect([...bytes.subarray(4, 8)]).toEqual([0x1a, 0, 0, 0]);
    expect([...bytes.subarray(8)]).toEqual([
      0xff, 0, 0, 3, 0, 0, 0, 66, 111, 98, 7, 0, 0, 0, 2, 0, 0, 0, 72, 105, 3, 0, 0, 0, 97, 10, 98,
    ]);
  });

  it('refuses a text past its buffer', () => {
    expect(() => encodeQueryPostMail({ itemObjectId: 1, count: 1, receiver: 'Bob', gold: 0, title: 'x'.repeat(32), text: '' }))
      .toThrow(RangeError);
  });

  it('reads each back', () => {
    expect([
      encodeQueryPostMail({ itemObjectId: 3, count: 5, receiver: 'Alice', gold: 1000, title: 'Re:Hi', text: 'ok' }),
      encodeQueryRemoveMail(9), encodeQueryGetMailItem(9), encodeQueryGetMailGold(9), encodeReadMail(9), encodeQueryMailBox(),
    ].map((bytes) => decodeWorldPacket(bytes))).toEqual([
      { type: 'queryPostMailRequest', itemObjectId: 3, count: 5, receiver: 'Alice', gold: 1000, title: 'Re:Hi', text: 'ok' },
      { type: 'queryRemoveMailRequest', mailId: 9 },
      { type: 'queryGetMailItemRequest', mailId: 9 },
      { type: 'queryGetMailGoldRequest', mailId: 9 },
      { type: 'readMailRequest', mailId: 9 },
      { type: 'queryMailBoxRequest' },
    ]);
  });
});
