import { describe, expect, it } from 'vitest';
import { AfkRole, UpgradeRole, WanderRole } from '../src/roles/town';
import { fakeIo, item } from './fakeIo';

const TOWN: [number, number, number][] = [[1, 0, 1], [2, 0, 2], [3, 0, 3]];
const MIN = 60_000;

describe('WanderRole', () => {
  it('walks between town points, stands, sometimes sits or plays a motion, until its time is up', () => {
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
    expect(io.calls.some((c) => c === 'sit' || c.startsWith('motion'))).toBe(true);
    expect(io.isSitting).toBe(false); // stands up before it ends
  });
});

describe('AfkRole', () => {
  it('goes to one town point and stays there for the whole role', () => {
    const io = fakeIo(() => 0.1);
    const role = new AfkRole(TOWN, io, () => 60 * MIN);
    for (let t = 0; t < 60 * MIN; t += 60_000) {
      io.t = t;
      role.tick();
    }
    expect(io.calls.filter((c) => c.startsWith('walk'))).toHaveLength(1);
    expect(io.isSitting).toBe(true);
  });
});

describe('UpgradeRole', () => {
  it('tries an upgrade of a spare with a material every one to three minutes, by the upgrade NPC', () => {
    const io = fakeIo(() => 0);
    io.items.set(1, item(1, 4000));
    io.items.set(2, item(2, 3000, 10));
    const role = new UpgradeRole([9, 0, 9], { materials: [3000], spares: [4000] }, io, () => 40 * MIN);
    role.tick();
    expect(io.pos).toEqual([9, 0, 9]);
    io.t = 61_000;
    role.tick();
    expect(io.calls).toContain('upgrade 1 2');
    expect(role.busy()).toBe(true);
    io.items.set(1, item(1, 4000, 1, 1)); // the answer: the spare is +1
    role.tick();
    expect(role.busy()).toBe(false);
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
