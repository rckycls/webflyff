import { describe, expect, it } from 'vitest';
import { readWorldParams } from '../src/world/WorldView';

describe('readWorldParams', () => {
  it('defaults to Madrigal, radius 1, playing', () => {
    expect(readWorldParams(new URLSearchParams())).toEqual({ world: 'wdmadrigal', radius: 1, paused: false });
  });

  it('reads the world by its web name, the radius and paused', () => {
    expect(readWorldParams(new URLSearchParams('world=wdvolcane&radius=2&paused=1'))).toEqual({
      world: 'wdvolcane',
      radius: 2,
      paused: true,
    });
    expect(readWorldParams(new URLSearchParams('paused=true&radius=0')).paused).toBe(true);
    expect(readWorldParams(new URLSearchParams('paused=true&radius=0')).radius).toBe(0);
  });

  it('falls back to radius 1 for anything but a whole number from 0 to 4', () => {
    for (const radius of ['-1', '1.5', '5', 'x', '']) {
      expect(readWorldParams(new URLSearchParams({ radius })).radius).toBe(1);
    }
  });
});
