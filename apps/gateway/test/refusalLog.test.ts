import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RefusalLog } from '../src/refusalLog';

const lines: string[] = [];
const logger = { info: (line: string) => { lines.push(line); } };

beforeEach(() => {
  lines.length = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('writes the first refusal of a pair at once', () => {
  const log = new RefusalLog(logger);
  log.refused('203.0.113.5', 'rate');
  expect(lines).toEqual(['refused 203.0.113.5 rate']);
  log.refused('203.0.113.5', 'rate');
  expect(lines).toEqual(['refused 203.0.113.5 rate']);
  log.refused('203.0.113.5', 'full');
  log.refused('203.0.113.6', 'rate');
  expect(lines).toEqual(['refused 203.0.113.5 rate', 'refused 203.0.113.5 full', 'refused 203.0.113.6 rate']);
  log.close();
});

it('writes one repeat line per pair when the period ends, in the order the pairs were first refused', () => {
  const log = new RefusalLog(logger);
  log.refused('1.2.3.4', 'origin');
  log.refused('5.6.7.8', 'path');
  log.refused('1.2.3.4', 'origin');
  log.refused('5.6.7.8', 'path');
  log.refused('1.2.3.4', 'origin');
  vi.advanceTimersByTime(59999);
  expect(lines).toHaveLength(2);
  vi.advanceTimersByTime(1);
  expect(lines.slice(2)).toEqual([
    'refused 1.2.3.4 origin x2 more in the last minute',
    'refused 5.6.7.8 path x1 more in the last minute',
  ]);
  log.close();
});

it('starts over in the next period', () => {
  const log = new RefusalLog(logger);
  log.refused('1.2.3.4', 'origin');
  vi.advanceTimersByTime(60000);
  log.refused('1.2.3.4', 'origin');
  expect(lines).toEqual(['refused 1.2.3.4 origin', 'refused 1.2.3.4 origin']);
  log.close();
});

it('writes nothing for a quiet period', () => {
  const log = new RefusalLog(logger);
  log.refused('1.2.3.4', 'origin');
  vi.advanceTimersByTime(180000);
  expect(lines).toEqual(['refused 1.2.3.4 origin']);
  log.close();
});

it('names at most maxNamed pairs and sums the rest into one line', () => {
  const log = new RefusalLog(logger, { maxNamed: 2 });
  for (const address of ['a', 'b', 'c', 'c', 'd']) log.refused(address, 'full');
  expect(lines).toEqual(['refused a full', 'refused b full']);
  vi.advanceTimersByTime(60000);
  expect(lines.slice(2)).toEqual(['refused 3 more connections from other addresses in the last minute']);
  log.refused('c', 'full');
  expect(lines.at(-1)).toBe('refused c full');
  log.close();
});

it('keeps no more than maxNamed pairs however many addresses are refused', () => {
  const log = new RefusalLog(logger, { maxNamed: 50 });
  for (let i = 0; i < 100000; i++) log.refused(`10.${i >> 16}.${(i >> 8) & 255}.${i & 255}`, 'rate');
  expect(lines).toHaveLength(50);
  vi.advanceTimersByTime(60000);
  expect(lines.slice(50)).toEqual(['refused 99950 more connections from other addresses in the last minute']);
  log.close();
});

it('writes what is pending on close, then nothing more', () => {
  const log = new RefusalLog(logger);
  log.refused('1.2.3.4', 'route');
  log.refused('1.2.3.4', 'route');
  log.close();
  expect(lines).toEqual(['refused 1.2.3.4 route', 'refused 1.2.3.4 route x1 more in the last minute']);
  log.refused('1.2.3.4', 'route');
  vi.advanceTimersByTime(60000);
  log.close();
  expect(lines).toHaveLength(2);
});

it('does not keep Node running for its period timer', () => {
  vi.useRealTimers();
  const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
  const log = new RefusalLog(logger);
  const timer = setIntervalSpy.mock.results[0]!.value as NodeJS.Timeout;
  expect(timer.hasRef()).toBe(false);
  log.close();
});
