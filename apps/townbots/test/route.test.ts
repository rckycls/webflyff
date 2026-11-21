import { describe, expect, it } from 'vitest';
import { RouteWalker } from '../src/roles/route';
import { fakeIo } from './fakeIo';

describe('RouteWalker', () => {
  it('walks the points in order and arrives', () => {
    const io = fakeIo();
    const walker = new RouteWalker([[10, 0, 0], [20, 0, 0], [30, 0, 0]], io);
    let status = walker.tick();
    for (let i = 0; i < 10 && status === 'walking'; i++) status = walker.tick();
    expect(status).toBe('arrived');
    expect(io.calls).toEqual(['walk 10,0,0', 'walk 20,0,0', 'walk 30,0,0']);
  });

  it('stuck walker turns back', () => {
    const io = fakeIo();
    const walker = new RouteWalker([[10, 0, 0], [20, 0, 0], [30, 0, 0]], io);
    expect(walker.tick()).toBe('walking'); // to 10
    expect(walker.tick()).toBe('walking'); // arrived at 10, on to 20
    io.stuck = true;
    for (let t = 0; t <= 21_000; t += 1000) {
      io.t = t;
      walker.tick();
    }
    // no progress for 20 s on the way to 20: back the way it came, to 10 (where it was)
    expect(io.calls.at(-1)).toBe('walk 10,0,0');
    io.stuck = false;
    io.pos = [10, 0, 0];
    let status = walker.tick();
    for (let i = 0; i < 5 && status === 'walking'; i++) status = walker.tick();
    expect(status).toBe('failed');
  });

  it('walks a route backwards', () => {
    const io = fakeIo();
    const walker = new RouteWalker([[10, 0, 0], [20, 0, 0]], io, { reverse: true });
    let status = walker.tick();
    for (let i = 0; i < 5 && status === 'walking'; i++) status = walker.tick();
    expect(io.calls).toEqual(['walk 20,0,0', 'walk 10,0,0']);
    expect(status).toBe('arrived');
  });
});

describe('TownWalk', () => {
  it('walks the town path the bot is given, then arrives', async () => {
    const { TownWalk } = await import('../src/roles/route');
    const io = fakeIo();
    io.pathTo = (target) => [[30, 0, 0], target];
    const walk = new TownWalk([30, 0, 40], io);
    let status = walk.tick();
    for (let i = 0; i < 5 && status === 'walking'; i++) status = walk.tick();
    expect(io.calls).toEqual(['walk 30,0,0', 'walk 30,0,40']);
    expect(status).toBe('arrived');
  });

  it('stuck on the way, tries again from the next nearest place, up to 8 starts, then fails', async () => {
    const { TownWalk } = await import('../src/roles/route');
    const io = fakeIo();
    io.stuck = true;
    const starts: number[] = [];
    io.pathTo = (target, skip = 0) => { starts.push(skip); return [[10 + skip * 10, 0, 0], target]; };
    const walk = new TownWalk([200, 0, 0], io);
    let status = 'walking';
    for (let t = 0; t <= 400_000 && status === 'walking'; t += 1000) {
      io.t = t;
      status = walk.tick();
    }
    expect(starts).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(status).toBe('failed');
  });

  it('arrives on a later start once that way is clear', async () => {
    const { TownWalk } = await import('../src/roles/route');
    const io = fakeIo();
    io.stuck = true;
    const starts: number[] = [];
    io.pathTo = (target, skip = 0) => { starts.push(skip); if (skip > 0) io.stuck = false; return [[10 + skip * 10, 0, 0], target]; };
    const walk = new TownWalk([200, 0, 0], io);
    let status = 'walking';
    for (let t = 0; t <= 100_000 && status === 'walking'; t += 1000) {
      io.t = t;
      status = walk.tick();
    }
    expect(starts).toEqual([0, 1]);
    expect(status).toBe('arrived');
  });
});
