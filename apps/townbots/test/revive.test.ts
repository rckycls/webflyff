import { describe, expect, it } from 'vitest';
import { ReviveWatch } from '../src/revive';

describe('ReviveWatch', () => {
  it('revives a bot dead for 5 s, again every 10 s, and forgets once it lives', () => {
    const watch = new ReviveWatch();
    expect(watch.tick(true, 0)).toBe(false);
    expect(watch.tick(true, 4_000)).toBe(false);
    expect(watch.tick(true, 5_000)).toBe(true);
    expect(watch.tick(true, 9_000)).toBe(false);
    expect(watch.tick(true, 15_000)).toBe(true);
    expect(watch.tick(false, 16_000)).toBe(false);
    expect(watch.tick(true, 17_000)).toBe(false);
    expect(watch.tick(true, 22_000)).toBe(true);
  });
});
