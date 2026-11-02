import { describe, expect, it } from 'vitest';
import { ArReader, ArWriter, WORLD_READERS, readBundle, encodeUseItem, encodeEquipItem, encodeMoveItem, encodeDropItem, encodeRevival } from '../src';
import { encodeBundle } from '@flyffweb/testkit';

const header = { objectId: 9, playerObjectId: 9, type: 0, offset: 0 };
function item() {
  return new ArWriter().u32(6).u32(2800).u32(0).string('').i16(3).u8(0).i32(100).i32(0).u8(0)
    .i32(0).u32(0).u8(0).i32(0).i32(0).u32(0).u32(0).u32(0).i32(0).i64(0n).u32(0).u8(0).i32(0).toBytes();
}
function read(type: number, bytes: Uint8Array) {
  const reader = WORLD_READERS.get(type);
  expect(reader, `reader for ${type}`).toBeDefined();
  const r = new ArReader(bytes);
  const value = reader!(r, header);
  r.expectEnd();
  return value;
}
describe('native inventory snapshots', () => {
  it('isolates a malformed item from the following valid snapshot', () => {
    const bytes = encodeBundle(0xffffff00, 9, [
      { objectId: 9, type: 3, fields: new ArWriter().u8(0).bytes(item()).u8(255).toBytes() },
      { objectId: 9, type: 0x18, fields: new ArWriter().u8(0).u8(6).u8(0).u32(2).u32(0).toBytes() },
    ]);
    const result = readBundle(bytes, WORLD_READERS);
    expect(result.mismatched).toEqual([3]);
    expect(result.messages[0]?.value).toMatchObject({ type: 'updateItem', value: 2 });
  });
  it('writes native object IDs, signed part, short quantity and revival header', () => {
    const r = new ArReader(encodeUseItem(6));
    expect([r.u32(), r.u32(), r.u32(), r.u32(), r.i32()]).toEqual([0xffffffff, 0xff0021, 6 << 16, 0xffffffff, -1]);
    const equip = new ArReader(encodeEquipItem(6)); equip.bytes(8);
    expect([equip.u32(), equip.i32(), equip.f32()]).toEqual([6, -1, 0]);
    expect(encodeMoveItem(0, 41).slice(8)).toEqual(Uint8Array.of(0, 0, 41));
    const drop = new ArReader(encodeDropItem(6, 2, [1, 2, 3])); drop.bytes(8);
    expect([drop.u32(), drop.u32(), drop.i16(), drop.vec3()]).toEqual([0, 6, 2, [1, 2, 3]]);
    expect(encodeRevival()).toHaveLength(8);
    expect(() => encodeDropItem(6, -1, [1, 2, 3])).toThrow();
    expect(() => encodeMoveItem(0, 42)).toThrow();
  });
  it('reads a ground CItem and CREATEITEM with separate stack arrays', () => {
    const w = new ArWriter().u8(4).u32(2800).u8(4).u32(2800).u16(100).vec3([10, 2, 20]).i16(900).u32(123).bytes(item());
    expect(read(0xf0, w.toBytes())).toEqual({ type: 'addItem', item: {
      index: 2800, scale: 1, pos: [10, 2, 20], angle: 90, item: { objectId: 6, itemId: 2800, count: 3 },
    } });
    expect(read(3, new ArWriter().u8(0).bytes(item()).u8(2).u8(6).u8(8).i16(2).i16(1).toBytes()))
      .toMatchObject({ type: 'createItem', stacks: [{ objectId: 6, count: 2 }, { objectId: 8, count: 1 }] });
    expect(() => read(3, new ArWriter().u8(0).bytes(item()).u8(43).toBytes())).toThrow();
    expect(() => read(0xf0, w.toBytes().slice(0, -1))).toThrow();
  });
  it('reads UPDATE_ITEM count and PETVIS time without losing the boundary', () => {
    expect(read(0x18, new ArWriter().u8(0).u8(6).u8(8).u32(4).u32(0).toBytes()))
      .toEqual({ type: 'updateItem', itemType: 0, objectId: 6, param: 8, value: 4, time: 0 });
  });
  it('reads bag positions for MOVEITEM, independently of item object IDs', () => {
    expect(read(4, new ArWriter().u8(0).u8(2).u8(41).toBytes()))
      .toEqual({ type: 'moveItem', itemType: 0, source: 2, destination: 41 });
  });
  it('reads padded x86 EQUIP_INFO and the actual destination part', () => {
    expect(read(6, new ArWriter().u8(6).u32(0).u8(1).u32(21).i32(3).u8(2)
      .bytes(new Uint8Array(3)).i32(10).toBytes()))
      .toEqual({ type: 'equipItem', objectId: 6, equip: true, itemId: 21, option: 3, flag: 2, part: 10 });
  });
  it('rejects out-of-range bag positions and truncated updates', () => {
    expect(() => read(4, new ArWriter().u8(0).u8(42).u8(0).toBytes())).toThrow();
    expect(() => read(0x18, new Uint8Array(10))).toThrow();
  });
});
