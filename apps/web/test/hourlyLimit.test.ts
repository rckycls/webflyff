import { expect, it } from 'vitest';
import { HourlyLimit } from '../src/hourlyLimit';

it('counts within the hour and forgets after it', () => {
  let t = 0;
  const l = new HourlyLimit(3, () => t);
  expect(l.allows('x')).toBe(true);
  l.add('x');
  t = 1000;
  l.add('x');
  l.add('x');
  expect(l.allows('x')).toBe(false);
  expect(l.allows('y')).toBe(true);
  t = 3_600_000 - 1;
  expect(l.allows('x')).toBe(false);
  t = 3_600_000;
  // the first entry is an hour old: one place again
  expect(l.allows('x')).toBe(true);
  t = 3_601_000;
  // all three are an hour old now
  expect(l.allows('x')).toBe(true);
  l.add('x');
  l.add('x');
  expect(l.allows('x')).toBe(true);
  l.add('x');
  expect(l.allows('x')).toBe(false);
});

it('deletes keys with no entries left', () => {
  let t = 0;
  const l = new HourlyLimit(2, () => t);
  l.add('a');
  l.add('b');
  expect(l.size()).toBe(2);
  t = 3_600_000;
  l.allows('c');
  expect(l.size()).toBe(0);
});

it('gives back the newest entry of a key', () => {
  let t = 0;
  const l = new HourlyLimit(2, () => t);
  l.add('x');
  t = 1000;
  l.add('x');
  expect(l.allows('x')).toBe(false);
  l.release('x');
  expect(l.allows('x')).toBe(true);
  l.release('x');
  l.release('x'); // nothing left: no error
  expect(l.size()).toBe(0);
});
