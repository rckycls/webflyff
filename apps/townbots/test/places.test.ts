import { describe, expect, it } from 'vitest';
import { PlaceBook } from '../src/roles/places';
import { AfkRole, WanderRole } from '../src/roles/town';
import { fakeIo } from './fakeIo';

const MIN = 60_000;

describe('PlaceBook', () => {
  it('keeps 8 m apart', () => {
    const book = new PlaceBook();
    expect(book.take('a', [[0, 0, 0]], () => 0)).toEqual([0, 0, 0]);
    for (const r of [0, 0.5, 0.99]) {
      expect(book.take('b', [[0, 0, 0], [5, 0, 0], [9, 0, 0]], () => r)).toEqual([9, 0, 0]);
    }
    expect(book.take('c', [[3, 0, 3], [12, 0, 4]], () => 0)).toBeUndefined();
  });

  it('released places are free again', () => {
    const book = new PlaceBook();
    book.take('a', [[0, 0, 0]], () => 0);
    expect(book.take('b', [[0, 0, 0]], () => 0)).toBeUndefined();
    book.release('a');
    expect(book.take('b', [[0, 0, 0]], () => 0)).toEqual([0, 0, 0]);
  });

  it("a bot's next place frees the one it held", () => {
    const book = new PlaceBook();
    book.take('a', [[0, 0, 0]], () => 0);
    book.take('a', [[50, 0, 0]], () => 0);
    expect(book.take('b', [[0, 0, 0]], () => 0)).toEqual([0, 0, 0]);
  });
});

describe('nobody sits', () => {
  it('a wanderer stands, plays a motion or takes combat stance at its places, never sits', () => {
    let r = 0;
    const randoms = [0.1, 0.1, 0.9, 0.3, 0.5, 0.95, 0.6, 0.2];
    const io = fakeIo(() => randoms[r++ % randoms.length]!);
    const role = new WanderRole([[1, 0, 1], [20, 0, 20], [40, 0, 40]], io, () => 30 * MIN, [5, 6]);
    for (let t = 0; t < 30 * MIN; t += 5000) {
      io.t = t;
      expect(role.tick()).toBe('running');
    }
    io.t = 31 * MIN;
    expect(role.tick()).toBe('done');
    expect(io.calls.some((c) => c.startsWith('walk'))).toBe(true);
    expect(io.calls.some((c) => c.startsWith('motion'))).toBe(true);
    expect(io.calls).toContain('combat');
    expect(io.calls.some((c) => /sit/i.test(c))).toBe(false);
  });

  it('an AFK bot takes combat stance for a roll under 1 in 2, else stands as it is', () => {
    const combat = fakeIo(() => 0.3);
    new AfkRole([[50, 0, 50]], combat, () => 60 * MIN).tick();
    expect(combat.calls).toContain('combat');
    const plain = fakeIo(() => 0.7);
    plain.isCombat = true;
    new AfkRole([[50, 0, 50]], plain, () => 60 * MIN).tick();
    expect(plain.calls).toContain('peace');
    expect(plain.calls).not.toContain('combat');
  });
});

describe('no free place', () => {
  it('stays and tries again', () => {
    const io = fakeIo(() => 0);
    io.places.take('x', [[50, 0, 50]], () => 0);
    io.places.take('y', [[60, 0, 60]], () => 0);
    const role = new WanderRole([[50, 0, 50], [60, 0, 60]], io, () => 30 * MIN, [5]);
    role.tick();
    io.t = 10_000;
    role.tick();
    expect(io.calls.filter((c) => c === 'pick')).toHaveLength(1);
    expect(io.calls.some((c) => c.startsWith('walk'))).toBe(false);
    io.places.release('x');
    io.t = 31_000;
    role.tick();
    expect(io.calls.filter((c) => c === 'pick')).toHaveLength(2);
    expect(io.calls).toContain('walk 50,0,50');
  });

  it('an AFK bot with no free place stays where it is and tries again', () => {
    const io = fakeIo(() => 0);
    io.places.take('x', [[50, 0, 50]], () => 0);
    const role = new AfkRole([[50, 0, 50]], io, () => 60 * MIN);
    role.tick();
    expect(io.calls.some((c) => c.startsWith('walk'))).toBe(false);
    io.places.release('x');
    io.t = 31_000;
    role.tick();
    expect(io.calls).toContain('walk 50,0,50');
  });
});
