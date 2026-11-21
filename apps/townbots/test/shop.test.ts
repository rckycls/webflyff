import { describe, expect, it } from 'vitest';
import { ShopRole } from '../src/roles/shop';
import { fakeIo, item } from './fakeIo';

const MIN = 60_000;
const STOCK = { shop: [{ itemId: 2000, price: 100 }, { itemId: 2001, price: 300 }], shopTitles: ['Potions po'] };

describe('ShopRole', () => {
  it('shop closes when sold out and refuses unknown items', () => {
    const io = fakeIo(() => 0);
    io.items.set(5, item(5, 2000, 40));
    io.items.set(6, item(6, 9999, 3)); // not in the stock list: never sold
    const role = new ShopRole([7, 0, 7], STOCK, io, () => 60 * MIN);
    expect(role.tick()).toBe('running');
    expect(io.calls).toEqual(['walk 7,0,7', 'register 0 5 40 100', 'open Potions po']);
    io.t = 10 * MIN;
    expect(role.tick()).toBe('running');
    io.items.delete(5); // all sold
    expect(role.tick()).toBe('done');
    expect(io.calls.at(-1)).toBe('close');
    expect(io.dropped).toEqual(['shop']);
  });

  it('closes the shop at the end of its time', () => {
    const io = fakeIo(() => 0);
    io.items.set(5, item(5, 2001, 2));
    const role = new ShopRole([7, 0, 7], STOCK, io, () => 30 * MIN);
    role.tick();
    io.t = 31 * MIN;
    expect(role.tick()).toBe('done');
    expect(io.calls.at(-1)).toBe('close');
    expect(io.dropped).toEqual([]);
  });

  it('has nothing to sell: drops the role without opening', () => {
    const io = fakeIo(() => 0);
    const role = new ShopRole([7, 0, 7], STOCK, io, () => 30 * MIN);
    expect(role.tick()).toBe('done');
    expect(io.calls.some((c) => c.startsWith('open'))).toBe(false);
    expect(io.dropped).toEqual(['shop']);
  });
});

describe('ShopRole, stuck', () => {
  it('a shop that cannot reach its spot gives up without opening', () => {
    const io = fakeIo(() => 0);
    io.stuck = true;
    io.items.set(5, item(5, 2000, 40));
    const role = new ShopRole([7, 0, 7], STOCK, io, () => 60 * MIN);
    let status = 'running';
    // 8 starts of about 20 s each (TownWalk)
    for (let s = 0; s <= 200 && status === 'running'; s++) { io.t = s * 1000; status = role.tick(); }
    expect(status).toBe('done');
    expect(io.calls.some((c) => c.startsWith('open'))).toBe(false);
    expect(io.dropped).toEqual([]);
  });
});
