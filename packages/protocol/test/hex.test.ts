import { expect, it } from 'vitest';
import { bytesToHex, hexToBytes, ProtocolError } from '../src';

it('writes lowercase hex with two digits per byte', () => {
  expect(bytesToHex(new Uint8Array([0x00, 0x0a, 0xff]))).toBe('000aff');
  expect(bytesToHex(new Uint8Array(0))).toBe('');
});
it('reads hex of either case back to the same bytes', () => {
  expect(Array.from(hexToBytes('000aFF'))).toEqual([0x00, 0x0a, 0xff]);
  expect(hexToBytes('')).toHaveLength(0);
});
it('rejects odd length, separators and non-hex characters', () => {
  expect(() => hexToBytes('abc')).toThrow(ProtocolError);
  expect(() => hexToBytes('ab cd')).toThrow(ProtocolError);
  expect(() => hexToBytes('zz')).toThrow(ProtocolError);
});
