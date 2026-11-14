import { expect, it } from 'vitest';
import { SessionBook } from '../src/admin/sessions';

const MIN = 60_000;

function book() {
  let now = 5_000_000;
  const b = new SessionBook(() => now, 30 * MIN, 12 * 60 * MIN);
  return { b, wait: (ms: number) => { now += ms; } };
}

it('keeps a session through 29 idle minutes and ends it at 31', () => {
  const { b, wait } = book();
  const s = b.create('Poreotix');
  wait(29 * MIN);
  expect(b.get(s.id)?.user).toBe('Poreotix');
  wait(31 * MIN);
  expect(b.get(s.id)).toBeUndefined();
  expect(b.get(s.id)).toBeUndefined();
});

it('does not count a background read as use, so an open Status tab still times out', () => {
  const { b, wait } = book();
  const s = b.create('Poreotix');
  wait(20 * MIN);
  expect(b.get(s.id, false)).toBeDefined();
  wait(11 * MIN);
  expect(b.get(s.id, false)).toBeUndefined();
});

it('ends a session in use at 12 hours', () => {
  const { b, wait } = book();
  const s = b.create('Poreotix');
  for (let i = 0; i < 71; i++) { wait(10 * MIN); expect(b.get(s.id)).toBeDefined(); }
  wait(10 * MIN);
  expect(b.get(s.id)).toBeUndefined();
});

it('ends a session on destroy, and knows no unknown id', () => {
  const { b } = book();
  const s = b.create('Poreotix');
  b.destroy(s.id);
  expect(b.get(s.id)).toBeUndefined();
  expect(b.get(undefined)).toBeUndefined();
  expect(b.get('made-up')).toBeUndefined();
});

it('gives each session its own random id and token', () => {
  const { b } = book();
  const one = b.create('Poreotix');
  const two = b.create('Poreotix');
  expect(one.id).not.toBe(two.id);
  expect(one.csrf).not.toBe(two.csrf);
  expect(one.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(one.csrf).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

it('takes a request id once per session, keeping the last 50', () => {
  const { b } = book();
  const s = b.create('Poreotix');
  expect(b.claimRequest(s, 'r1')).toBe(true);
  expect(b.claimRequest(s, 'r1')).toBe(false);
  for (let i = 0; i < 50; i++) b.claimRequest(s, `x${i}`);
  expect(b.claimRequest(s, 'r1')).toBe(true);
  expect(b.claimRequest(b.create('Poreotix'), 'x49')).toBe(true);
});
