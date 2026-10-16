import { describe, expect, it } from 'vitest';
import { matchesOnly, runLimited } from '../src/util';

describe('matchesOnly', () => {
  it('matches everything when there is no filter', () => {
    expect(matchesOnly('Part_mVag01Upper.o3d', undefined)).toBe(true);
    expect(matchesOnly('', undefined)).toBe(true);
  });

  it('matches a whole name, ignoring case', () => {
    expect(matchesOnly('WdMadrigal', 'WdMadrigal')).toBe(true);
    expect(matchesOnly('WdMadrigal', 'wdmadrigal')).toBe(true);
    expect(matchesOnly('wdmadrigal', 'WDMADRIGAL')).toBe(true);
    expect(matchesOnly('WdMadrigalX', 'WdMadrigal')).toBe(false);
    expect(matchesOnly('XWdMadrigal', 'WdMadrigal')).toBe(false);
  });

  it('compares the base name without its extension', () => {
    expect(matchesOnly('Part_mVag01Upper.o3d', 'part_m*')).toBe(true);
    expect(matchesOnly('Part_mVag01Upper.o3d', 'Part_mVag01Upper')).toBe(true);
    expect(matchesOnly('Part_mVag01Upper.o3d', 'o3d')).toBe(false);
    expect(matchesOnly('Part_mVag01Upper.o3d', '*.o3d')).toBe(false);
    expect(matchesOnly('Model/Part_mVag01Upper.o3d', 'part_mvag01upper')).toBe(true);
    expect(matchesOnly('Model\\Part_mVag01Upper.o3d', 'part_mvag01upper')).toBe(true);
  });

  it('treats * as any run of characters, including none', () => {
    expect(matchesOnly('anything', '*')).toBe(true);
    expect(matchesOnly('', '*')).toBe(true);
    expect(matchesOnly('wd_flaris', 'wd*')).toBe(true);
    expect(matchesOnly('obj_tree', 'wd*')).toBe(false);
    expect(matchesOnly('obj_tree', '*tree')).toBe(true);
    expect(matchesOnly('obj_tree01', '*tree')).toBe(false);
    expect(matchesOnly('obj_big_tree', 'obj*tree')).toBe(true);
    expect(matchesOnly('obj_tree', 'obj*tree')).toBe(true);
  });

  it('treats every other character literally', () => {
    expect(matchesOnly('a+b', 'a+b')).toBe(true);
    expect(matchesOnly('aab', 'a+b')).toBe(false);
    expect(matchesOnly('a(b)', 'a(b)')).toBe(true);
    expect(matchesOnly('a?b', 'a?b')).toBe(true);
    expect(matchesOnly('axb', 'a?b')).toBe(false);
    expect(matchesOnly('a[b]', 'a[b]')).toBe(true);
  });
});

describe('runLimited', () => {
  const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1));

  it('processes every item', async () => {
    const seen: number[] = [];
    await runLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      await tick();
      seen.push(n);
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('never has more than `jobs` calls in flight, and uses all of them', async () => {
    let inFlight = 0;
    let peak = 0;
    await runLimited(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight--;
    });
    expect(peak).toBe(4);
    expect(inFlight).toBe(0);
  });

  it('works with fewer items than jobs, and with none', async () => {
    let calls = 0;
    await runLimited([1, 2], 8, async () => void calls++);
    await runLimited([], 8, async () => void calls++);
    expect(calls).toBe(2);
  });

  it('runs one at a time, in order, with jobs = 1', async () => {
    const order: number[] = [];
    await runLimited([1, 2, 3], 1, async (n) => {
      await tick();
      order.push(n);
    });
    expect(order).toEqual([1, 2, 3]);
  });

  it('rejects with the first error only after the calls already in flight have finished', async () => {
    const finished: number[] = [];
    const started: number[] = [];
    const run = runLimited([1, 2, 3, 4, 5, 6], 2, async (n) => {
      started.push(n);
      await tick();
      if (n === 1) throw new Error('bug in fn');
      finished.push(n);
    });
    await expect(run).rejects.toThrow('bug in fn');
    expect(finished).toContain(2); // item 2 was in flight beside item 1 and was allowed to finish
    expect(started).not.toContain(6); // and the run stopped starting new items
  });

  it('refuses a jobs count that is not a positive integer', async () => {
    for (const jobs of [0, -1, 1.5, Number.NaN]) {
      await expect(runLimited([1], jobs, async () => {})).rejects.toThrow(RangeError);
    }
  });
});
