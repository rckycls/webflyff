import { expect, it } from 'vitest';
import { RefusalLog } from '../src/refusalLog';

function setup(maxNamed = 50) {
  const lines: string[] = [];
  const log = new RefusalLog({ info: (line) => lines.push(line), warn: (line) => lines.push(line) }, { maxNamed, periodMs: 60_000 });
  return { lines, log };
}

it('writes the first refusal of a kind at once and counts the rest until the minute ends', () => {
  const { lines, log } = setup();
  for (let i = 0; i < 1000; i++) log.note('signup 203.0.113.7 forbidden', 'signup 203.0.113.7 - forbidden');
  log.note('signup 198.51.100.1 size', 'signup 198.51.100.1 - size');
  expect(lines).toEqual(['signup 203.0.113.7 - forbidden', 'signup 198.51.100.1 - size']);
  log.flush();
  expect(lines.slice(2)).toEqual(['signup 203.0.113.7 forbidden x999 more in the last minute']);
  // a new minute: the first one is written again
  log.note('signup 203.0.113.7 forbidden', 'signup 203.0.113.7 - forbidden');
  expect(lines.at(-1)).toBe('signup 203.0.113.7 - forbidden');
  log.close();
});

it('past the named kinds, only counts', () => {
  const { lines, log } = setup(2);
  for (let i = 0; i < 10; i++) log.note(`signup 192.0.2.${i} forbidden`, `signup 192.0.2.${i} - forbidden`);
  expect(lines).toHaveLength(2);
  log.flush();
  expect(lines.at(-1)).toBe('8 more refused requests from other addresses in the last minute');
  log.close();
});
