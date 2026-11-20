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
