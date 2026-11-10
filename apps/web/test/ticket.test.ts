import { createHmac } from 'node:crypto';
import { expect, it } from 'vitest';
import { TicketBook } from '../src/ticket';

const SECRET = 's'.repeat(40);

it('takes a ticket once between 3 s and 30 min', () => {
  let now = 0;
  const book = new TicketBook(SECRET, () => now);
  const ticket = book.issue();
  now = 2999;
  expect(book.check(ticket)).toBe('early');
  now = 3000;
  expect(book.check(ticket)).toBe('ok');
  expect(book.check(ticket)).toBe('used');
  const other = book.issue();
  now = 3000 + 1_800_000;
  expect(book.check(other)).toBe('ok');
});

it('refuses a late, forged or garbled ticket', () => {
  let now = 0;
  const book = new TicketBook(SECRET, () => now);
  const ticket = book.issue();
  now = 1_800_001;
  expect(book.check(ticket)).toBe('late');

  now = 0;
  const fresh = book.issue();
  now = 5000;
  const last = fresh.at(-1) === 'A' ? 'B' : 'A';
  expect(book.check(fresh.slice(0, -1) + last)).toBe('bad');
  expect(book.check('x')).toBe('bad');
  expect(book.check('')).toBe('bad');
  expect(book.check('1.2.3.4')).toBe('bad');
  // signed with another secret
  const [issued, nonce] = fresh.split('.');
  const forged = `${issued}.${nonce}.${createHmac('sha256', 'other').update(`${issued}.${nonce}`).digest('base64url')}`;
  expect(book.check(forged)).toBe('bad');
  // a time moved forward: the signature no longer matches
  expect(book.check(`${Number(issued) + 1}.${nonce}.${fresh.split('.')[2]}`)).toBe('bad');
  expect(book.check(fresh)).toBe('ok');
});

it('looks like <issuedAtMs>.<nonce>.<hmac>, the nonce 16 random bytes', () => {
  const book = new TicketBook(SECRET, () => 1234);
  const [issued, nonce, mac] = book.issue().split('.');
  expect(issued).toBe('1234');
  expect(Buffer.from(nonce!, 'base64url')).toHaveLength(16);
  expect(mac).toBe(createHmac('sha256', SECRET).update(`1234.${nonce}`).digest('base64url'));
  expect(book.issue().split('.')[1]).not.toBe(nonce);
});

it('forgets spent tickets once they would be late', () => {
  let now = 0;
  const book = new TicketBook(SECRET, () => now);
  const first = book.issue();
  now = 3000;
  expect(book.check(first)).toBe('ok');
  expect(book.spentCount()).toBe(1);
  now = 1_800_000 + 1;
  book.check('x');
  expect(book.spentCount()).toBe(0);
  // and a spent ticket still answers late, not ok, once forgotten
  expect(book.check(first)).toBe('late');
});
