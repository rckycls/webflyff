import { expect, it } from 'vitest';
import { PREREG_CSV_HEADER, preregCsv } from '../src/preregList';
import type { SignUpRecord } from '../src/signUpBook';

const A = 'AAAAAAAAbbbbbbbbcccccc';
const B = 'BBBBBBBBbbbbbbbbcccccc';
const rec = (account: string, ip: string, browser = '', prereg = true): SignUpRecord =>
  ({ time: `2026-11-17T00:00:0${account.length % 10}.000Z`, account, ip, browser, prereg });

it('lists only pre-registration accounts, oldest first, with vip=yes for the first of each IP and browser', () => {
  const { csv, accounts, vip } = preregCsv([
    rec('before', '1.1.1.1', A, false), // made before pre-registration: not listed, not counted
    rec('alice', '1.1.1.1', A),
    rec('alice2', '1.1.1.1', A), // same IP and browser
    rec('alice3', '2.2.2.2', A), // new IP, same browser (airplane mode)
    rec('bob', '1.1.1.1', B), // same IP, new browser (a family)
    rec('carol', '3.3.3.3'), // no cookie
  ]);
  expect(accounts).toBe(5);
  expect(vip).toBe(2);
  expect(csv.split('\r\n')).toEqual([
    PREREG_CSV_HEADER,
    '2026-11-17T00:00:05.000Z,alice,1.1.1.1,AAAAAAAA,3,3,yes,yes,yes',
    '2026-11-17T00:00:06.000Z,alice2,1.1.1.1,AAAAAAAA,3,3,no,no,no',
    '2026-11-17T00:00:06.000Z,alice3,2.2.2.2,AAAAAAAA,1,3,yes,no,no',
    '2026-11-17T00:00:03.000Z,bob,1.1.1.1,BBBBBBBB,3,1,no,yes,no',
    '2026-11-17T00:00:05.000Z,carol,3.3.3.3,,1,,yes,,yes',
    '',
  ]);
});

it('puts a quote in front of a name a spreadsheet would read as a formula', () => {
  expect(preregCsv([rec('-cmd', '1.1.1.1')]).csv).toContain(",'-cmd,");
});

it('writes the header alone when nobody signed up during pre-registration', () => {
  expect(preregCsv([])).toEqual({ csv: `${PREREG_CSV_HEADER}\r\n`, accounts: 0, vip: 0 });
});
