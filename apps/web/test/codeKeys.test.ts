// Redeem codes (2026-11-20): the key text rules shared by the site, the panel and the game.
import { expect, it } from 'vitest';
import { newKey, normalizeKey, showKey } from '../src/codes/codeKeys';

it('drops spaces and dashes and capitalises letters', () => {
  expect(normalizeKey(' abcd-efgh jkmn-pqrs ')).toBe('ABCDEFGHJKMNPQRS');
  expect(normalizeKey('launch-2026')).toBe('LAUNCH2026');
});

it('refuses keys that are too short, too long, or not letters and digits', () => {
  for (const bad of ['abc', 'a'.repeat(33), 'ABCD!', 'ÄBCD', 42, null, undefined, '', ' - - ']) {
    expect(normalizeKey(bad), String(bad)).toBeUndefined();
  }
});

it('makes random keys of 16 characters without 0 O 1 I L, all different', () => {
  const keys = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const key = newKey();
    expect(key).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{16}$/);
    keys.add(key);
  }
  expect(keys.size).toBe(1000);
});

it('shows a 16-character key in groups of four, any other as it is', () => {
  expect(showKey('ABCDEFGHJKMNPQRS')).toBe('ABCD-EFGH-JKMN-PQRS');
  expect(showKey('LAUNCH2026')).toBe('LAUNCH2026');
});
