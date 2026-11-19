// The panel page's level names (admin/js/ui.js, plain browser JavaScript) are packages/protocol's, in the same order.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AUTHORITY_TITLES, SETTABLE_AUTHORITIES } from '@flyffweb/protocol';
import { expect, it } from 'vitest';
import { AUTHORITIES, AUTHORITY_NAMES } from '../src/admin/adminStore';

it('lists the same levels, without VIP 1-4 (2026-11-19: they come from the VIP tab), in the page, the panel and the protocol', () => {
  const ui = readFileSync(fileURLToPath(new URL('../admin/js/ui.js', import.meta.url)), 'utf8');
  const block = /export const AUTHORITY_NAMES = \{([^}]*)\}/.exec(ui)?.[1] ?? '';
  const page = [...block.matchAll(/([A-Z]): '([^']+)'/g)].map((m) => [m[1], m[2]]);
  const protocol = SETTABLE_AUTHORITIES.map((letter) => [letter, AUTHORITY_TITLES[letter]]);
  expect(page).toEqual(protocol);
  expect(AUTHORITIES).toEqual(SETTABLE_AUTHORITIES);
  expect(Object.entries(AUTHORITY_NAMES)).toEqual(protocol);
  expect(page.some(([letter]) => 'ABCE'.includes(letter!))).toBe(false);
  // the VIP names are still shown for an account that has one
  const vip = /export const VIP_NAMES = \{([^}]*)\}/.exec(ui)?.[1] ?? '';
  expect([...vip.matchAll(/([A-Z]): '([^']+)'/g)].map((m) => [m[1], m[2]])).toEqual([['A', 'VIP 1'], ['B', 'VIP 2'], ['C', 'VIP 3'], ['E', 'VIP 4']]);
});
