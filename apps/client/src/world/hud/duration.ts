// 2026-11-14 (the owner): every duration the game shows, short: "if its 30000 in seconds just show like {numOfMins}m or
// s or h", with no spaces, and hours and minutes only when they are not zero. Ticking clocks (`hh:mm:ss`, `mm:ss`) stay.

/** What a duration given to `formatDuration` counts: seconds, milliseconds or minutes (the game data mixes them). */
export type DurationUnit = 's' | 'ms' | 'min';

/** The units, largest first. */
const PARTS: ReadonlyArray<readonly [string, number]> = [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]];

/**
 * A duration, short and with no spaces: its largest unit, then the next one down when that part is not zero, in whole
 * units (truncated): 45 s is `45s`, 90 s `1m30s`, 1800 s `30m`, 3600 s `1h`, 30000 s `8h20m`, 90000 s `1d1h`; 0, less,
 * or not a number is `0s`. `unit` is what `value` counts (seconds when left out).
 */
export function formatDuration(value: number, unit: DurationUnit = 's'): string {
  const seconds = unit === 'ms' ? value / 1000 : unit === 'min' ? value * 60 : value;
  let left = Number.isFinite(seconds) && seconds > 0 ? Math.trunc(seconds) : 0;
  const first = PARTS.findIndex(([, size]) => left >= size);
  if (first < 0) return '0s';
  let text = '';
  for (const [name, size] of PARTS.slice(first, first + 2)) {
    const n = Math.trunc(left / size);
    left -= n * size;
    if (n > 0) text += `${n}${name}`;
  }
  return text;
}
