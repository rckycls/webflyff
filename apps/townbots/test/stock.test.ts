import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { supplyCounts, writeStock } from '../src/stock';

describe('supplyCounts', () => {
  it('sums the bag by item id, for the supply ids only (a stack, or single pieces of one kind)', () => {
    const bag = new Map([
      [1, { objectId: 1, itemId: 2000, count: 40 }], [2, { objectId: 2, itemId: 2000, count: 3 }],
      [3, { objectId: 3, itemId: 4000, count: 1 }], [4, { objectId: 4, itemId: 4000, count: 1 }],
      [5, { objectId: 5, itemId: 999, count: 7 }],
    ]);
    expect(supplyCounts(bag as never, [2000, 3000, 4000])).toEqual({ 2000: 43, 3000: 0, 4000: 2 });
  });
});

describe('writeStock', () => {
  let dir: string | undefined;
  afterEach(() => { if (dir !== undefined) rmSync(dir, { recursive: true, force: true }); dir = undefined; });

  it('writes every bot\'s counts as JSON, by account', () => {
    dir = mkdtempSync(join(tmpdir(), 'stock-'));
    const file = join(dir, 'stock.json');
    writeStock(file, new Map([['testbot01', { 2000: 43 }]]), new Date('2026-11-20T08:00:00Z'));
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ at: '2026-11-20T08:00:00.000Z', bots: { testbot01: { 2000: 43 } } });
  });
});
