import { expect, it } from 'vitest';
import { LoginGuard } from '../src/admin/loginGuard';

const MIN = 60_000;

function guard() {
  let now = 1_000_000_000;
  const g = new LoginGuard(() => now);
  return { g, at: (t: number) => { now = 1_000_000_000 + t; } };
}

it('makes one address wait after 5 failures in 15 minutes, and only that address', () => {
  const { g } = guard();
  for (let i = 0; i < 4; i++) g.fail('198.51.100.1');
  expect(g.check('198.51.100.1')).toBe('ok');
  g.fail('198.51.100.1');
  expect(g.check('198.51.100.1')).toBe('address_wait');
  expect(g.check('198.51.100.2')).toBe('ok');
});

it('lets the address try again 15 minutes after its 5th failure', () => {
  const { g, at } = guard();
  for (let i = 0; i < 5; i++) { at(i * MIN); g.fail('198.51.100.1'); }
  at(4 * MIN + 14 * MIN);
  expect(g.check('198.51.100.1')).toBe('address_wait');
  at(4 * MIN + 15 * MIN + 1);
  expect(g.check('198.51.100.1')).toBe('ok');
});

it('does not count failures older than 15 minutes towards an address wait', () => {
  const { g, at } = guard();
  for (let i = 0; i < 4; i++) g.fail('198.51.100.1');
  at(16 * MIN);
  g.fail('198.51.100.1');
  expect(g.check('198.51.100.1')).toBe('ok');
});

it('closes the login for everyone for an hour after 20 failures in an hour', () => {
  const { g, at } = guard();
  for (let i = 0; i < 20; i++) { at(i * MIN); g.fail(`198.51.100.${i % 4}`); }
  expect(g.check('203.0.113.9')).toBe('closed');
  at(19 * MIN + 59 * MIN);
  expect(g.check('203.0.113.9')).toBe('closed');
  at(19 * MIN + 61 * MIN);
  expect(g.check('203.0.113.9')).toBe('ok');
});

it('forgets an address\'s failures after it logs in', () => {
  const { g } = guard();
  for (let i = 0; i < 4; i++) g.fail('198.51.100.1');
  g.succeed('198.51.100.1');
  g.fail('198.51.100.1');
  expect(g.check('198.51.100.1')).toBe('ok');
});
