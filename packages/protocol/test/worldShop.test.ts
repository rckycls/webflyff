import { expect, it } from 'vitest';
import { ArReader, ArWriter, WORLD_READERS } from '../src/index';
import { encodeOpenShop, encodeCloseShop, encodeBuyItem, encodeSellItem, readShop } from '../src/world/shop';
import { encodeNpcDialog, readNpcScript } from '../src/world/npc';

it('writes native vendor and script requests with the correct field sizes', () => {
  const buy = new ArReader(encodeBuyItem(2, 7, 3, 2800)); buy.u32(); expect(buy.u32()).toBe(0xff00b3);
  expect([buy.u8(), buy.u8(), buy.i16(), buy.u32()]).toEqual([2, 7, 3, 2800]); buy.expectEnd();
  expect(encodeOpenShop(12)).toHaveLength(12); expect(encodeCloseShop()).toHaveLength(8);
  expect(encodeSellItem(7, 3)).toHaveLength(11);
  const script = new ArReader(encodeNpcDialog(12, '#init', 0, 0, 50)); script.u32(); expect(script.u32()).toBe(0xff00b0);
  expect([script.u32(), script.string(255), script.i32(), script.i32(), script.i32(), script.i32()]).toEqual([12, '#init', 0, 0, 12, 50]);
  expect(() => encodeBuyItem(4, 0, 1, 2800)).toThrow(); expect(() => encodeSellItem(73, 1)).toThrow();
  expect(() => encodeBuyItem(0, 0, 0, 2800)).toThrow();
});
it('reads bounded four-tab native containers and bounded dialogue replies', () => {
  const w = new ArWriter();
  for (let tab = 0; tab < 4; tab++) { for (let i = 0; i < 100; i++) w.u32(0xffffffff); w.u8(0); w.bytes(new Uint8Array(400)); }
  expect(readShop(new ArReader(w.toBytes()))).toEqual({ type: 'shopStock', tabs: [[], [], [], []] });
  expect(() => readShop(new ArReader(w.toBytes().slice(0, -1)))).toThrow();
  expect(readNpcScript(new ArReader(new ArWriter().u16(0x12).string('Welcome').u32(0).toBytes())))
    .toEqual({ type: 'npcScript', action: { kind: 'say', text: 'Welcome', quest: 0 } });
  expect(readNpcScript(new ArReader(new ArWriter().u16(0x10).string('More').string('#more').u32(0).u32(0).toBytes())))
    .toMatchObject({ action: { kind: 'key', label: 'More', key: '#more', param: 0, quest: 0 } });
  expect(() => readNpcScript(new ArReader(new ArWriter().u16(0x12).i32(1024).toBytes()))).toThrow();
  expect(WORLD_READERS.has(0x14)).toBe(true); expect(WORLD_READERS.has(0x24)).toBe(true);
});
