import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSettings, parseSettings } from '../src/settings';

/** A small valid settings object with made-up data (the real roster is private). */
function valid(): Record<string, any> {
  return {
    gatewayConfig: 'C:/game/gateway.config.json',
    assetsDir: 'C:/game/dist/assets',
    logFile: 'C:/game/logs/bots.log',
    roleTargets: { farming: 1, wandering: 1, upgrading: 0, shop: 0, afk: 1 },
    bots: [
      { account: 'testbot01', password: 'pw-one-1', bankPin: '1234', name: 'Abcd', group: 'rookie', level: 9, job: 0, look: { sex: 0, hair: 1, face: 2 } },
      { account: 'testbot02', password: 'pw-two-2', bankPin: '4321', name: 'Efgh', group: 'first', level: 16, job: 1, look: { sex: 1, hair: 0, face: 0 } },
      { account: 'testbot03', password: 'pw-three', bankPin: '1111', name: 'Ijkl', group: 'veteran', level: 65, job: 6, look: { sex: 0, hair: 3, face: 1 } },
    ],
    replies: ['hello!', 'hi there'],
    places: {
      town: [[10, 0, 10], [20, 0, 20]],
      lodestar: [0, 0, 0],
      upgradeNpc: { pos: [5, 0, 5], npcId: 'MaFl_Upgrade' },
      shopSpots: [[7, 0, 7]],
      spots: [{ id: 'north', center: [100, 0, 100], radius: 15, kinds: [20], minLevel: 1, maxLevel: 14, route: 'north' }],
      routes: { north: [[10, 0, 10], [100, 0, 100]] },
    },
    items: { potions: [2000], upgrade: { materials: [3000], spares: [4000] }, shop: [{ itemId: 2000, price: 100 }], shopTitles: ['Potions here'] },
  };
}

describe('parseSettings', () => {
  it('takes a valid object, with the default port', () => {
    const s = parseSettings(valid());
    expect(s.bots).toHaveLength(3);
    expect(s.listenPort).toBe(8095);
    expect(s.places.spots[0]!.route).toBe('north');
    expect(s.items.shop[0]).toEqual({ itemId: 2000, price: 100 });
  });

  const broken: Array<[string, (v: Record<string, any>) => void, RegExp]> = [
    ['no bots', (v) => { v.bots = []; }, /bots/],
    ['one account twice', (v) => { v.bots[1].account = 'TESTBOT01'; }, /bots\[1\]\.account/],
    ['a name the game refuses', (v) => { v.bots[0].name = 'ab'; }, /bots\[0\]\.name/],
    ['a veteran below 61', (v) => { v.bots[2].level = 60; }, /bots\[2\]\.level/],
    ['a first job at 15 (the game makes it a Vagrant)', (v) => { v.bots[1].level = 15; }, /bots\[1\]\.level/],
    ['a rookie with a job', (v) => { v.bots[0].job = 1; }, /bots\[0\]\.job/],
    ['a veteran with a first job', (v) => { v.bots[2].job = 3; }, /bots\[2\]\.job/],
    ['a gear item also in the shop', (v) => { v.items.gear = [2000]; }, /items\.gear/],
    ['role targets over the bots', (v) => { v.roleTargets.shop = 1; }, /roleTargets/],
    ['no replies', (v) => { v.replies = []; }, /replies/],
    ['a spot whose route is missing', (v) => { v.places.spots[0].route = 'south'; }, /places\.spots\[0\]\.route/],
    ['a shop price of 0', (v) => { v.items.shop[0].price = 0; }, /items\.shop\[0\]\.price/],
  ];
  for (const [what, breakIt, path] of broken) {
    it(`refuses ${what}, naming the place`, () => {
      const v = valid();
      breakIt(v);
      expect(() => parseSettings(v)).toThrow(path);
    });
  }
});

describe('loadSettings', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('reads places, items and replies from files beside it', () => {
    dir = mkdtempSync(join(tmpdir(), 'bots-'));
    const v = valid();
    writeFileSync(join(dir, 'places.json'), JSON.stringify(v.places));
    writeFileSync(join(dir, 'items.json'), JSON.stringify(v.items));
    writeFileSync(join(dir, 'replies.txt'), 'hello!\r\n\r\nhi there\n');
    v.places = 'places.json';
    v.items = 'items.json';
    v.replies = 'replies.txt';
    writeFileSync(join(dir, 'bots.json'), JSON.stringify(v));
    const s = loadSettings(join(dir, 'bots.json'));
    expect(s.places.town).toHaveLength(2);
    expect(s.items.potions).toEqual([2000]);
    expect(s.replies).toEqual(['hello!', 'hi there']);
  });
});

describe('the stock file', () => {
  it('is optional, and a path when given', () => {
    const v = valid();
    expect(parseSettings(v).stockFile).toBeUndefined();
    v.stockFile = 'C:/game/stock.json';
    expect(parseSettings(v).stockFile).toBe('C:/game/stock.json');
  });
});
