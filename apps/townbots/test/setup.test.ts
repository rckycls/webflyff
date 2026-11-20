import { describe, expect, it } from 'vitest';
import { gearToEquip, setupCommands } from '../src/setup';
import type { BotSpec } from '../src/settings';

const TITLES = ['Vagrant', 'Mercenary', 'Acrobat', 'Assist', 'Magician', 'Puppeteer', 'Knight', 'Blade'];
const title = (job: number): string => TITLES[job] ?? '';

function bot(group: BotSpec['group'], job: number, level: number): BotSpec {
  return { account: 'testbot01', password: 'pw', bankPin: '1234', name: 'Abcd', group, job, level, look: { sex: 0, hair: 0, face: 0 } };
}

describe('setupCommands', () => {
  it('sets a rookie\'s level as a Vagrant', () => {
    expect(setupCommands(bot('rookie', 0, 9), title, {})).toEqual(['/level Vagrant 9']);
  });

  it('sets a first job and its level in one line', () => {
    expect(setupCommands(bot('first', 1, 18), title, {})).toEqual(['/level Mercenary 18']);
  });

  it('sets a veteran\'s second job, then its skill lines', () => {
    expect(setupCommands(bot('veteran', 6, 65), title, { 6: ['/slv 1 1'] })).toEqual(['/level Knight 65', '/slv 1 1']);
  });

  it('never makes items by command', () => {
    for (const b of [bot('rookie', 0, 5), bot('first', 2, 20), bot('veteran', 7, 70)]) {
      expect(setupCommands(b, title, { 2: ['/ci 1'] }).some((line) => /createitem|\/ci\b/i.test(line))).toBe(false);
    }
  });

  it('refuses a job whose name the command cannot take', () => {
    expect(() => setupCommands(bot('first', 3, 18), () => 'Two Words', {})).toThrow(/job/);
  });
});

describe('gearToEquip', () => {
  it('the listed gear in the bag that is not worn yet', () => {
    const bag = new Map([[1, { objectId: 1, itemId: 500, count: 1 }], [2, { objectId: 2, itemId: 501, count: 1 }], [3, { objectId: 3, itemId: 999, count: 1 }]]);
    expect(gearToEquip(bag as never, [2], [500, 501])).toEqual([1]);
  });
});
