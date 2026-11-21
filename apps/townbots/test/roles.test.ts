import { describe, expect, it } from 'vitest';
import { RolePlanner } from '../src/roles';
import type { Group } from '../src/settings';

const TARGETS = { farming: 15, wandering: 5, upgrading: 3, shop: 3, afk: 4 };
const MIN = 60_000;

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** 14 rookies, 9 first jobs, 5 veterans, 2 heroes. */
function roster(): Array<[string, Group]> {
  const bots: Array<[string, Group]> = [];
  for (let i = 0; i < 30; i++) bots.push([`b${i}`, i < 14 ? 'rookie' : i < 23 ? 'first' : i < 28 ? 'veteran' : 'hero']);
  return bots;
}

describe('RolePlanner', () => {
  it('fills the roles close to their targets and never sends a hero farming', () => {
    let now = 0;
    const planner = new RolePlanner(TARGETS, seeded(3), () => now);
    const given = new Map<string, string>();
    for (const [bot, group] of roster()) given.set(bot, planner.assign(bot, group));
    const counts = planner.counts();
    for (const role of Object.keys(TARGETS) as Array<keyof typeof TARGETS>) {
      expect(Math.abs(counts[role] - TARGETS[role])).toBeLessThanOrEqual(1);
    }
    for (const [bot, group] of roster()) if (group === 'hero') expect(given.get(bot)).not.toBe('farming');
  });

  it('says a role is due once its time is up, between 20 and 60 minutes for farming', () => {
    let now = 0;
    const planner = new RolePlanner(TARGETS, () => 0.5, () => now);
    expect(planner.assign('b0', 'rookie')).toBe('farming');
    now = 19 * MIN;
    expect(planner.due('b0')).toBe(false);
    now = 61 * MIN;
    expect(planner.due('b0')).toBe(true);
  });

  it('tells how long a bot\'s role has left', () => {
    let now = 0;
    const planner = new RolePlanner(TARGETS, () => 0.5, () => now);
    planner.assign('b0', 'rookie');
    now = 10 * MIN;
    expect(planner.remaining('b0')).toBe(30 * MIN);
    expect(planner.remaining('nobody')).toBe(0);
  });

  it('ends AFK after 10 to 25 minutes, so its bots get up and walk again', () => {
    let now = 0;
    const long = new RolePlanner({ farming: 0, wandering: 0, upgrading: 0, shop: 0, afk: 1 }, () => 0.999, () => now);
    expect(long.assign('b0', 'veteran')).toBe('afk');
    now = 24 * MIN;
    expect(long.due('b0')).toBe(false);
    now = 25 * MIN;
    expect(long.due('b0')).toBe(true);
    now = 0;
    const short = new RolePlanner({ farming: 0, wandering: 0, upgrading: 0, shop: 0, afk: 1 }, () => 0, () => now);
    short.assign('b0', 'veteran');
    now = 10 * MIN;
    expect(short.due('b0')).toBe(true);
  });

  it('lets a shop last up to 90 minutes, at least 30', () => {
    let now = 0;
    const planner = new RolePlanner({ farming: 0, wandering: 0, upgrading: 0, shop: 1, afk: 0 }, () => 0.999, () => now);
    expect(planner.assign('b0', 'veteran')).toBe('shop');
    now = 61 * MIN;
    expect(planner.due('b0')).toBe(false);
    now = 91 * MIN;
    expect(planner.due('b0')).toBe(true);
  });

  it('frees a role when the bot is released, and never gives a dropped role again', () => {
    let now = 0;
    const planner = new RolePlanner({ farming: 0, wandering: 1, upgrading: 0, shop: 1, afk: 0 }, () => 0, () => now);
    const first = planner.assign('b0', 'veteran');
    planner.release('b0');
    expect(planner.counts()[first]).toBe(0);
    planner.drop('b0', 'shop');
    for (let i = 0; i < 5; i++) {
      expect(planner.assign('b0', 'veteran')).not.toBe('shop');
      planner.release('b0');
    }
  });

  it('moves a due bot to the most needed role other than its own, so roles rotate', () => {
    const planner = new RolePlanner({ farming: 1, wandering: 1, upgrading: 0, shop: 0, afk: 0 }, () => 0, () => 0);
    expect(planner.assign('b0', 'rookie')).toBe('farming');
    expect(planner.assign('b1', 'rookie')).toBe('wandering');
    expect(planner.switchRole('b0', 'rookie')).toBe('wandering');
    expect(planner.switchRole('b1', 'rookie')).toBe('farming');
    expect(planner.counts()).toMatchObject({ farming: 1, wandering: 1 });
  });

  it('keeps a due bot in its role when it can take no other', () => {
    const planner = new RolePlanner({ farming: 1, wandering: 0, upgrading: 0, shop: 0, afk: 0 }, () => 0, () => 0);
    planner.assign('b0', 'rookie');
    for (const role of ['wandering', 'upgrading', 'shop', 'afk'] as const) planner.drop('b0', role);
    expect(planner.switchRole('b0', 'rookie')).toBe('farming');
  });

  it('with every role full, gives the eligible role least over its target', () => {
    const planner = new RolePlanner({ farming: 1, wandering: 1, upgrading: 0, shop: 0, afk: 1 }, () => 0, () => 0);
    planner.assign('b0', 'rookie');
    planner.assign('b1', 'hero');
    planner.assign('b2', 'hero');
    expect(planner.counts()).toMatchObject({ farming: 1, wandering: 1, afk: 1 });
    expect(planner.assign('b3', 'hero')).not.toBe('farming');
  });

  it('a role with target 0 is never given', () => {
    let now = 0;
    const planner = new RolePlanner({ farming: 0, wandering: 2, upgrading: 1, shop: 0, afk: 2 }, seeded(7), () => now);
    for (let i = 0; i < 20; i++) {
      expect(['farming', 'shop']).not.toContain(planner.assign(`b${i}`, 'rookie'));
      now += MIN;
      expect(['farming', 'shop']).not.toContain(planner.switchRole(`b${i}`, 'rookie'));
    }
  });

  it('a veteran may farm', () => {
    const planner = new RolePlanner({ farming: 1, wandering: 1, upgrading: 0, shop: 0, afk: 0 }, () => 0, () => 0);
    expect(planner.assign('b0', 'veteran')).toBe('farming');
  });

  it('a hero never farms', () => {
    const planner = new RolePlanner({ farming: 3, wandering: 1, upgrading: 0, shop: 0, afk: 0 }, seeded(5), () => 0);
    for (let i = 0; i < 10; i++) {
      expect(planner.assign('h', 'hero')).not.toBe('farming');
      expect(planner.switchRole('h', 'hero')).not.toBe('farming');
    }
  });

  it('a bot with nothing it may do still wanders', () => {
    const planner = new RolePlanner({ farming: 1, wandering: 0, upgrading: 0, shop: 0, afk: 0 }, () => 0, () => 0);
    expect(planner.assign('h', 'hero')).toBe('wandering');
  });
});
