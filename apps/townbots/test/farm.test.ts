import { describe, expect, it } from 'vitest';
import type { AutoPlaySettings } from '@flyffweb/client/src/world/autoplay/settings';
import { FarmRole, SpotBook } from '../src/roles/farm';
import type { Spot } from '../src/settings';
import { fakeFarm, fakeIo, item } from './fakeIo';

const SPOT: Spot = { id: 'north', center: [100, 0, 100], radius: 15, kinds: [20, 21], minLevel: 1, maxLevel: 14, route: 'north' };
const ROUTE: [number, number, number][] = [[10, 0, 10], [100, 0, 100]];
const MIN = 60_000;

function farmRole() {
  const io = fakeIo();
  io.items.set(5, item(5, 2000, 50));
  const farm = fakeFarm();
  const role = new FarmRole(SPOT, ROUTE, { potions: [2000], readySkills: [] }, io, () => farm, () => 40 * MIN);
  return { io, farm, role };
}

/** Ticks until the role says done, or `max` ticks. */
function run(role: { tick(): string }, max = 50): string {
  let status = role.tick();
  for (let i = 0; i < max && status === 'running'; i++) status = role.tick();
  return status;
}

describe('FarmRole', () => {
  it('walks out, then runs Auto Play with no looting, the spot\'s kinds and its potion', () => {
    const { farm, role, io } = farmRole();
    for (let i = 0; i < 5; i++) role.tick();
    expect(io.pos).toEqual([100, 0, 100]);
    expect(farm.started).toHaveLength(1);
    const settings = farm.started[0] as AutoPlaySettings;
    expect(settings.farm.loot).toBe(false);
    expect(settings.farm.only).toEqual([20, 21]);
    expect(settings.farm.radius).toBe(15);
    expect(settings.farm.center).toBe('start');
    expect(settings.farm.avoidGiants).toBe(true);
    expect(settings.pots.enabled).toBe(true);
    expect(settings.pots.rows.hp.itemIndex).toBe(2000);
  });

  it('stops Auto Play when its time is up and walks the route back', () => {
    const { farm, role, io } = farmRole();
    for (let i = 0; i < 5; i++) role.tick();
    io.t = 41 * MIN;
    expect(run(role)).toBe('done');
    expect(farm.stops).toHaveLength(1);
    expect(io.pos).toEqual([10, 0, 10]);
  });

  it('dead bot revives and restarts in town', () => {
    const { role, io } = farmRole();
    for (let i = 0; i < 5; i++) role.tick();
    io.isDead = true;
    role.tick();
    expect(io.calls).toContain('revive');
    io.isDead = false;
    expect(run(role)).toBe('done');
  });

  it('leaves the spot to a real player who fights there for a minute', () => {
    const { role, io, farm } = farmRole();
    for (let i = 0; i < 5; i++) role.tick();
    io.playersNear = true;
    io.t = 30_000;
    role.tick();
    expect(farm.stops).toHaveLength(0);
    io.t = 91_000;
    expect(run(role)).toBe('done');
    expect(farm.stops).toHaveLength(1);
  });
});

describe('SpotBook', () => {
  it('gives a spot that fits the level, at most two bots each', () => {
    const book = new SpotBook([SPOT]);
    expect(book.take('a', 9)?.id).toBe('north');
    expect(book.take('b', 9)?.id).toBe('north');
    expect(book.take('c', 9)).toBeUndefined();
    book.release('a');
    expect(book.take('c', 9)?.id).toBe('north');
  });

  it('gives a veteran no spot', () => {
    expect(new SpotBook([SPOT]).take('v', 70)).toBeUndefined();
  });
});
