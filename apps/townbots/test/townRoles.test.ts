import { describe, expect, it } from 'vitest';
import { AfkRole, UpgradeRole, WanderRole } from '../src/roles/town';
import { fakeIo, item } from './fakeIo';

const TOWN: [number, number, number][] = [[1, 0, 1], [20, 0, 20], [40, 0, 40]];
const MIN = 60_000;

describe('WanderRole', () => {
  it('walks between town points, stands, sometimes plays a motion or takes combat stance, until its time is up', () => {
    let r = 0;
    const randoms = [0.1, 0.1, 0.9, 0.05, 0.5, 0.95, 0.3];
    const io = fakeIo(() => randoms[r++ % randoms.length]!);
    const role = new WanderRole(TOWN, io, () => 30 * MIN, [5, 6]);
    for (let t = 0; t < 30 * MIN; t += 5000) {
      io.t = t;
      expect(role.tick()).toBe('running');
    }
    io.t = 31 * MIN;
    let status = role.tick();
    for (let i = 0; i < 3 && status === 'running'; i++) status = role.tick();
    expect(status).toBe('done');
    expect(io.calls.some((c) => c.startsWith('walk'))).toBe(true);
    expect(io.calls.some((c) => c === 'combat' || c.startsWith('motion'))).toBe(true);
  });
});

describe('AfkRole', () => {
  it('goes to one town point and stays there for the whole role', () => {
    const io = fakeIo(() => 0.1);
    const role = new AfkRole([[50, 0, 50], [60, 0, 60]], io, () => 60 * MIN);
    for (let t = 0; t < 60 * MIN; t += 60_000) {
      io.t = t;
      role.tick();
    }
    expect(io.calls.filter((c) => c.startsWith('walk'))).toHaveLength(1);
    expect(io.isCombat).toBe(true);
  });
});

describe('UpgradeRole', () => {
  it('tries an upgrade of a spare with a material every one to three minutes, by the upgrade NPC', () => {
    const io = fakeIo(() => 0);
    io.items.set(1, item(1, 4000));
    io.items.set(2, item(2, 3000, 10));
    const role = new UpgradeRole([9, 0, 9], { materials: [3000], spares: [4000] }, io, () => 40 * MIN);
    role.tick();
    // a few metres from the NPC, not on it
    const off = Math.hypot(io.pos[0] - 9, io.pos[2] - 9);
    expect(off).toBeGreaterThanOrEqual(2.5);
    expect(off).toBeLessThanOrEqual(4);
    io.t = 61_000;
    role.tick();
    expect(io.calls).toContain('upgrade 1 2');
    expect(role.busy()).toBe(true);
    io.items.set(1, item(1, 4000, 1, 1)); // the answer: the spare is +1
    role.tick();
    expect(role.busy()).toBe(false);
  });

  it('upgraders stand round the NPC on sides of their own, not on top of each other', () => {
    const at = [0.1, 0.4, 0.7].map((r) => {
      const io = fakeIo(() => r);
      new UpgradeRole([9, 0, 9], { materials: [3000], spares: [4000] }, io, () => 40 * MIN).tick();
      return io.pos;
    });
    for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) {
      expect(Math.hypot(at[i]![0] - at[j]![0], at[i]![2] - at[j]![2])).toBeGreaterThan(2);
    }
  });

  it('drops the role when it runs out of spares or materials', () => {
    const io = fakeIo(() => 0);
    io.items.set(1, item(1, 4000));
    const role = new UpgradeRole([9, 0, 9], { materials: [3000], spares: [4000] }, io, () => 40 * MIN);
    role.tick();
    io.t = 61_000;
    expect(role.tick()).toBe('done');
    expect(io.dropped).toEqual(['upgrading']);
  });
});

describe('town walks that get stuck', () => {
  /** Ticks every second from `from` for `seconds`. */
  function tickFor(role: { tick(): string }, io: { t: number }, from: number, seconds: number): string {
    let status = 'running';
    for (let s = 0; s <= seconds && status === 'running'; s++) {
      io.t = from + s * 1000;
      status = role.tick();
    }
    return status;
  }

  it('an AFK bot that cannot reach its place tries another a while later, not standing where it got stuck for the whole role', () => {
    const io = fakeIo(() => 0.1);
    io.stuck = true;
    const role = new AfkRole([[50, 0, 50], [60, 0, 60]], io, () => 60 * MIN);
    tickFor(role, io, 0, 25);
    expect(io.isCombat).toBe(false);
    const walks = io.calls.filter((c) => c.startsWith('walk')).length;
    tickFor(role, io, 30_000, 60);
    expect(io.calls.filter((c) => c.startsWith('walk')).length).toBeGreaterThan(walks);
    // once a walk gets there, it settles
    io.stuck = false;
    tickFor(role, io, 100_000, 120);
    const settled = io.calls.filter((c) => c.startsWith('walk')).length;
    tickFor(role, io, 300_000, 120);
    expect(io.calls.filter((c) => c.startsWith('walk')).length).toBe(settled);
  });

  it('an upgrader stuck a few metres short of the NPC upgrades from there', () => {
    const io = fakeIo(() => 0);
    io.pos = [6, 0, 9];
    io.stuck = true;
    io.items.set(1, item(1, 4000));
    io.items.set(2, item(2, 3000, 10));
    const role = new UpgradeRole([9, 0, 9], { materials: [3000], spares: [4000] }, io, () => 40 * MIN);
    // 8 starts of about 20 s each (TownWalk), then it upgrades from where it is
    expect(tickFor(role, io, 0, 120)).toBe('running');
    tickFor(role, io, 121_000, 240);
    expect(io.calls.some((c) => c.startsWith('upgrade'))).toBe(true);
  });

  it('an upgrader that cannot reach the NPC gives the role up', () => {
    const io = fakeIo(() => 0);
    io.stuck = true;
    io.items.set(1, item(1, 4000));
    io.items.set(2, item(2, 3000, 10));
    const role = new UpgradeRole([9, 0, 9], { materials: [3000], spares: [4000] }, io, () => 40 * MIN);
    // 8 starts of about 20 s each (TownWalk)
    expect(tickFor(role, io, 0, 200)).toBe('done');
    expect(io.calls.some((c) => c.startsWith('upgrade'))).toBe(false);
  });

  it('a wanderer that cannot reach a place stands where it is, then tries another', () => {
    const io = fakeIo(() => 0.9);
    io.stuck = true;
    const role = new WanderRole([[50, 0, 50], [60, 0, 60]], io, () => 30 * MIN, [5]);
    tickFor(role, io, 0, 100);
    expect(io.calls.filter((c) => c.startsWith('walk')).length).toBeGreaterThan(1);
  });
});
