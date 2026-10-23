import { describe, expect, it } from 'vitest';
import { ServerClock } from '../src/net/serverClock';

/** A clock whose time the test sets. */
function timer(start: number) {
  let time = start;
  return { now: () => time, set: (t: number) => { time = t; }, advance: (ms: number) => { time += ms; } };
}

describe('ServerClock', () => {
  it('is not started until the server answers', () => {
    const t = timer(1000);
    const clock = new ServerClock(t.now);
    expect(clock.started).toBe(false);
    clock.start(1000, 5n);
    expect(clock.started).toBe(true);
  });

  it('start adds half the round trip', () => {
    // CDPLoginClient::OnQueryTickCount: the answer took 100 ms, so the server's tick is ( 100 / 2 ) ms old: 100 × 5000.
    const t = timer(1100);
    const clock = new ServerClock(t.now);
    clock.start(1000, 5n);
    expect(clock.tick()).toBe(5n + 100n * 5000n);
  });

  it('reads the round trip modulo 2^32, as the C++ DWORD subtraction does', () => {
    // QUERYTICKCOUNT carries a u32: a request sent just before the 32-bit counter wrapped is answered just after.
    const t = timer(5);
    const clock = new ServerClock(t.now);
    clock.start(0xfffffffb, 0n);
    expect(clock.tick()).toBe(10n * 5000n);
  });

  it('ticks advance 10000 per ms', () => {
    const t = timer(1100);
    const clock = new ServerClock(t.now);
    clock.start(1100, 0n);
    const first = clock.tick();
    t.advance(1);
    expect(clock.tick() - first).toBe(10000n);
    t.advance(999);
    expect(clock.tick() - first).toBe(10_000_000n);
  });

  it('start again restarts the clock, as Neuz does for a second answer', () => {
    const t = timer(1000);
    const clock = new ServerClock(t.now);
    clock.start(1000, 100n);
    t.advance(500);
    clock.start(1500, 7n);
    expect(clock.tick()).toBe(7n);
  });

  describe('offsetMs', () => {
    function started() {
      const t = timer(2000);
      const clock = new ServerClock(t.now);
      clock.start(2000, 123_456_789n);
      return { t, clock };
    }

    it('of a tick 250 ms old is 250', () => {
      const { t, clock } = started();
      const stamp = clock.tick();
      t.advance(250);
      expect(clock.offsetMs(stamp)).toBe(250);
    });

    it('of the tick now is 0, and of a tick still to come is negative', () => {
      const { clock } = started();
      expect(clock.offsetMs(clock.tick())).toBe(0);
      expect(clock.offsetMs(clock.tick() + 30n * 10000n)).toBe(-30);
    });

    it('is the low 32 bits of the difference as a signed int, divided by 10000 and truncated like the C++ int', () => {
      // CTickCount::GetOffset: (int)LowPart( GetTickCount() - n ) / 10000.
      const { clock } = started();
      const now = clock.tick();
      expect(clock.offsetMs(now - 2_509_999n)).toBe(250);
      expect(clock.offsetMs(now + 2_509_999n)).toBe(-250);
      // A whole 2^32 more (7.2 minutes) is not seen.
      expect(clock.offsetMs(now - 2_500_000n - (1n << 32n))).toBe(250);
      // Past 2^31 the int turns negative.
      expect(clock.offsetMs(now - 0x8000_0000n)).toBe(-214_748);
    });
  });
});
