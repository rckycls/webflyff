import { describe, expect, it } from 'vitest';
import { ArWriter, PacketType, WORLD_READERS, readBundle } from '@flyffweb/protocol';
import { newVagrant, OWN_ID } from './helpers/ownState';

describe('authoritative high rate profile display', () => {
  const values = [500, 600, 700, 800, 2000000000, 6000, 7000, 123456, 34567, 87, 100, 2000000, 200000, 25];

  it('reads the complete packet without consuming the next snapshot message', () => {
    const writer = new ArWriter().u32(PacketType.SNAPSHOT).u32(OWN_ID).u16(2).u32(OWN_ID).u16(0x8871);
    for (const value of values) writer.i32(value);
    writer.u32(OWN_ID).u16(0x8871);
    for (const value of values) writer.i32(value + 1);
    const result = readBundle(writer.toBytes(), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.value).toEqual({ type: 'profileStats', values });
  });

  it('uses server values across gear changes and replaces them on buff removal', () => {
    const own = newVagrant();
    own.apply({ type: 'profileStats', values }, OWN_ID);
    expect(own.effective()).toEqual({ str: 500, sta: 600, dex: 700, int: 800 });
    expect([own.maxHp(), own.maxMp(), own.maxFp()]).toEqual(values.slice(4, 7));
    own.equipped = { weapon: null, armour: [] };
    expect(own.maxHp()).toBe(2000000000);
    own.apply({ type: 'profileStats', values: [15, 15, 15, 15, 230, 63, 31, 8, 0, 0, 20, 400000, 150000, 0] }, OWN_ID);
    expect(own.maxHp()).toBe(230);
    own.apply({ type: 'profileStats', values }, OWN_ID + 1);
    expect(own.maxHp()).toBe(230);
  });
});
