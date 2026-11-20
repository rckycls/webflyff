import { describe, expect, it } from 'vitest';
import { RenameTimer } from '../src/rename';

const MIN = 60_000;
const HOUR = 60 * MIN;

describe('RenameTimer', () => {
  it('soon within 30 min, then 5-7 h', () => {
    let now = 0;
    const timer = new RenameTimer(() => 0.5, () => now, true);
    now = 1 * MIN;
    expect(timer.due()).toBe(false);
    now = 30 * MIN;
    expect(timer.due()).toBe(true);
    timer.sent();
    expect(timer.due()).toBe(false);
    expect(timer.waiting()).toBe(true);
    now += 5_000;
    timer.answered();
    expect(timer.waiting()).toBe(false);
    const answeredAt = now;
    now = answeredAt + 5 * HOUR - 1;
    expect(timer.due()).toBe(false);
    now = answeredAt + 7 * HOUR;
    expect(timer.due()).toBe(true);
  });

  it('first due after 5-7 h when not soon', () => {
    let now = 0;
    for (const r of [0, 0.999]) {
      const timer = new RenameTimer(() => r, () => now, false);
      now = 5 * HOUR - 1;
      expect(timer.due()).toBe(false);
      now = 7 * HOUR;
      expect(timer.due()).toBe(true);
      now = 0;
    }
  });

  it('never sooner than a minute after the start (the scrolls come a moment after entering)', () => {
    let now = 0;
    const timer = new RenameTimer(() => 0, () => now, true);
    now = MIN - 1;
    expect(timer.due()).toBe(false);
    now = MIN;
    expect(timer.due()).toBe(true);
  });

  it('a send with no answer for 60 s is overdue', () => {
    let now = 0;
    const timer = new RenameTimer(() => 0, () => now, true);
    now = MIN;
    timer.sent();
    now += 59_999;
    expect(timer.overdue()).toBe(false);
    now += 1;
    expect(timer.overdue()).toBe(true);
  });

  it('retries a refused name 3 times', () => {
    let now = 0;
    const timer = new RenameTimer(() => 0.5, () => now, true);
    now = 30 * MIN;
    let sends = 0;
    for (let i = 0; i < 10 && sends < 10; i++) {
      if (!timer.due()) break;
      timer.sent();
      sends++;
      now += 60_000;
      timer.failed();
      now += 2 * MIN - 1;
      if (timer.due()) break;
      now += 1;
    }
    expect(sends).toBe(4);
    expect(timer.due()).toBe(false);
    now += 5 * HOUR;
    expect(timer.due()).toBe(false);
    now += 2 * HOUR;
    expect(timer.due()).toBe(true);
  });
});
