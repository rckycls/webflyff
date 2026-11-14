// formatDuration (2026-11-14, the owner): every duration the game shows, short and with no spaces.

import { describe, expect, it } from 'vitest';
import { formatDuration } from '../src/world/hud/duration';

describe('formatDuration', () => {
  it('the biggest unit, then the next one down when that part is not zero, with no spaces', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(90)).toBe('1m30s');
    expect(formatDuration(1800)).toBe('30m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(30000)).toBe('8h20m');
    expect(formatDuration(90000)).toBe('1d1h');
  });

  it('a zero part is left out, and no third unit is shown', () => {
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(3661)).toBe('1h1m');
    expect(formatDuration(3605)).toBe('1h');
    expect(formatDuration(29999)).toBe('8h19m');
    expect(formatDuration(86400 + 59)).toBe('1d');
    expect(formatDuration(7 * 86400)).toBe('7d');
  });

  it('0, less, a fraction under a second, or not a number is 0s', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(-5)).toBe('0s');
    expect(formatDuration(0.9)).toBe('0s');
    expect(formatDuration(Number.NaN)).toBe('0s');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0s');
  });

  it('one unit only when asked, for the labels on the buff icons (2026-11-14: on a phone two ran together)', () => {
    expect(formatDuration(3233, 's', 1)).toBe('53m');
    expect(formatDuration(546, 's', 1)).toBe('9m');
    expect(formatDuration(2 * 3600 + 59 * 60, 's', 1)).toBe('2h');
    expect(formatDuration(45, 's', 1)).toBe('45s');
    expect(formatDuration(90000, 's', 1)).toBe('1d');
    expect(formatDuration(0, 's', 1)).toBe('0s');
    expect(formatDuration(30_000_000, 'ms', 1)).toBe('8h');
    expect(formatDuration(299_000, 'ms', 1)).toBe('4m');
  });

  it('takes milliseconds and minutes too', () => {
    expect(formatDuration(30_000_000, 'ms')).toBe('8h20m');
    expect(formatDuration(45_500, 'ms')).toBe('45s');
    expect(formatDuration(59_000, 'ms')).toBe('59s');
    expect(formatDuration(999, 'ms')).toBe('0s');
    expect(formatDuration(9, 'min')).toBe('9m');
    expect(formatDuration(90, 'min')).toBe('1h30m');
    expect(formatDuration(60, 'min')).toBe('1h');
    expect(formatDuration(1500, 'min')).toBe('1d1h');
  });
});
