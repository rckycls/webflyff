import { expect, it } from 'vitest';
import { ArReader, decodeWorldPacket, encodeTeleporter } from '../src/index';
it('writes the V15 character key and nonnegative destination index for PACKETTYPE_TELEPORTER', () => {
  const r = new ArReader(encodeTeleporter('MaFl_Teleporter', 3));
  expect(r.u32()).toBe(0xffffffff); expect(r.u32()).toBe(0x88100100);
  expect(r.string(63)).toBe('MaFl_Teleporter'); expect(r.i32()).toBe(3); r.expectEnd();
  expect(decodeWorldPacket(encodeTeleporter('MaFl_Teleporter', 3))).toEqual({ type: 'teleporter', key: 'MaFl_Teleporter', index: 3 });
  for (const index of [-1, 0.5, NaN, 0x80000000]) expect(() => encodeTeleporter('Pang', index)).toThrow();
  for (const key of ['', 'x'.repeat(64), 'Pang\u0000']) expect(() => encodeTeleporter(key, 0)).toThrow();
});
