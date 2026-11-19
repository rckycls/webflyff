import { describe, expect, it } from 'vitest';
import { waterOfPatch } from '../src/index';

describe('waterOfPatch', () => {
  it('reads WTYPE_WATER from the low two bits and the list from the rest (lod.cpp:424-427)', () => {
    expect(waterOfPatch(2)).toEqual({ kind: 'water', list: 0 });
    expect(waterOfPatch(6)).toEqual({ kind: 'water', list: 1 });
    expect(waterOfPatch(0x0a)).toEqual({ kind: 'water', list: 2 });
  });

  it('reads the cloud sea only from a byte of exactly WTYPE_CLOUD (lod.cpp:507)', () => {
    expect(waterOfPatch(1)).toEqual({ kind: 'cloud' });
    expect(waterOfPatch(5)).toBeNull(); // cloud bits with a list: neither
  });

  it('draws nothing for WTYPE_NONE or the unused low value 3', () => {
    expect(waterOfPatch(0)).toBeNull();
    expect(waterOfPatch(3)).toBeNull();
    expect(waterOfPatch(4)).toBeNull();
  });
});
