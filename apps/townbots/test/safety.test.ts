import { describe, expect, it } from 'vitest';
import { SafetyNet } from '../src/safety';

describe('SafetyNet', () => {
  it('exp gain stops all fighting, once', () => {
    const trips: string[] = [];
    const net = new SafetyNet((why) => trips.push(why));
    net.start({ level: 9, exp: 100 });
    net.onOwn({ level: 9, exp: 100 });
    expect(net.tripped).toBe(false);
    net.onOwn({ level: 9, exp: 101 });
    expect(net.tripped).toBe(true);
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatch(/World server/);
    net.onOwn({ level: 10, exp: 0 });
    expect(trips).toHaveLength(1);
  });

  it('trips on a level gain too, and on a drop that belongs to a bot', () => {
    const levels: string[] = [];
    const a = new SafetyNet((why) => levels.push(why));
    a.start({ level: 9, exp: 500 });
    a.onOwn({ level: 10, exp: 0 });
    expect(levels).toHaveLength(1);

    const drops: string[] = [];
    const b = new SafetyNet((why) => drops.push(why));
    b.start({ level: 9, exp: 0 });
    b.onDrop(false);
    expect(drops).toHaveLength(0);
    b.onDrop(true);
    expect(drops).toHaveLength(1);
  });

  it('a level lost on death is not a gain', () => {
    const trips: string[] = [];
    const net = new SafetyNet((why) => trips.push(why));
    net.start({ level: 9, exp: 500 });
    net.onOwn({ level: 9, exp: 400 });
    expect(trips).toHaveLength(0);
  });
});
