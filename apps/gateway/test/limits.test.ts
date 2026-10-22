import { expect, it } from 'vitest';
import { AddressCounter, AddressRate, RateWindow } from '../src/limits';

it('RateWindow takes a window length other than a second', () => {
  let now = 0;
  const window = new RateWindow(2, () => now, 60000);
  expect([window.allow(), window.allow()]).toEqual([true, true]);
  now = 59999; expect(window.allow()).toBe(false);
  now = 60000; expect(window.allow()).toBe(true);
});

it('RateWindow is idle once every call it recorded has left the window', () => {
  let now = 0;
  const window = new RateWindow(2, () => now, 60000);
  expect(window.isIdle()).toBe(true);
  window.allow();
  expect(window.isIdle()).toBe(false);
  now = 59999; expect(window.isIdle()).toBe(false);
  now = 60000; expect(window.isIdle()).toBe(true);
});

it('AddressRate allows maxPerWindow calls per address and counts addresses apart', () => {
  let now = 0;
  const rate = new AddressRate(2, 60000, () => now);
  expect([rate.allow('a'), rate.allow('a'), rate.allow('a')]).toEqual([true, true, false]);
  expect(rate.allow('b')).toBe(true);
  now = 60000; expect(rate.allow('a')).toBe(true);
});

it('AddressRate does not count a refused call against the address', () => {
  let now = 0;
  const rate = new AddressRate(1, 60000, () => now);
  expect(rate.allow('a')).toBe(true);
  now = 30000; expect(rate.allow('a')).toBe(false);
  now = 60000; expect(rate.allow('a')).toBe(true); // the refusal at 30000 did not push this back
});

it('AddressRate forgets an address whose window is idle, sweeping at most once a window', () => {
  let now = 0;
  const rate = new AddressRate(5, 60000, () => now);
  rate.allow('a');
  now = 30000; rate.allow('b');
  expect(rate.size).toBe(2);
  now = 60000; rate.allow('c'); // 'a' is idle and swept; 'b' and 'c' stay
  expect(rate.size).toBe(2);
  now = 90000; rate.allow('d'); // 'b' is idle now, but the last sweep was less than a window ago
  expect(rate.size).toBe(3);
  now = 120000; rate.allow('e'); // 'b' is swept, and so is 'c', exactly one window old; 'd' and 'e' stay
  expect(rate.size).toBe(2);
});

it('RateWindow allows maxPerSecond calls in a second, refuses the next, and allows again once the second is over', () => {
  let now = 0;
  const window = new RateWindow(3, () => now);
  expect([window.allow(), window.allow(), window.allow()]).toEqual([true, true, true]);
  expect(window.allow()).toBe(false);
  now = 1000; // exactly one second after the first call: that call is no longer inside the window of the last second
  expect(window.allow()).toBe(true);
  now = 1001;
  expect(window.allow()).toBe(true);
  expect(window.allow()).toBe(true);
  expect(window.allow()).toBe(false);
});

it('RateWindow slides: a call is forgotten one second after it was made, not at fixed boundaries', () => {
  let now = 0;
  const window = new RateWindow(2, () => now);
  now = 0; expect(window.allow()).toBe(true);
  now = 600; expect(window.allow()).toBe(true);
  now = 900; expect(window.allow()).toBe(false); // two calls in the last second
  now = 1001; expect(window.allow()).toBe(true); // the call at 0 is gone, the one at 600 is not
  now = 1100; expect(window.allow()).toBe(false);
  now = 1601; expect(window.allow()).toBe(true);
});

it('RateWindow does not count a refused call against the caller', () => {
  let now = 0;
  const window = new RateWindow(1, () => now);
  expect(window.allow()).toBe(true);
  now = 500; expect(window.allow()).toBe(false);
  now = 999; expect(window.allow()).toBe(false);
  now = 1000; expect(window.allow()).toBe(true); // the refusals at 500 and 999 did not push this back
});

it('RateWindow reads the monotonic clock when it is given none', () => {
  const window = new RateWindow(2);
  expect([window.allow(), window.allow()]).toEqual([true, true]);
  expect(window.allow()).toBe(false);
});

it('AddressCounter refuses a connection over its maximum, counts addresses apart, and allows again after a release', () => {
  const counter = new AddressCounter(2);
  expect(counter.acquire('a')).toBe(true);
  expect(counter.acquire('a')).toBe(true);
  expect(counter.acquire('a')).toBe(false);
  expect(counter.acquire('b')).toBe(true);
  counter.release('a');
  expect(counter.acquire('a')).toBe(true);
  expect(counter.acquire('a')).toBe(false);
});

it('AddressCounter never counts below zero: a release it never acquired makes no room', () => {
  const counter = new AddressCounter(1);
  counter.release('never-seen'); // must not make room for two connections later
  expect(counter.acquire('x')).toBe(true);
  expect(counter.acquire('x')).toBe(false);
  counter.release('x');
  counter.release('x');
  expect(counter.acquire('x')).toBe(true);
  expect(counter.acquire('x')).toBe(false);
});
