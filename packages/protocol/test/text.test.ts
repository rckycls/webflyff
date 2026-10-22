import { expect, it } from 'vitest';
import { decodeText, encodeAscii, ProtocolError } from '../src';

it('decodes server text as windows-1252', () => {
  expect(decodeText(new Uint8Array([0x46, 0x6c, 0x79, 0xe9, 0x80]))).toBe('Flyé€');
});
it('encodes printable ASCII only', () => {
  expect(Array.from(encodeAscii('Ab 1~'))).toEqual([0x41, 0x62, 0x20, 0x31, 0x7e]);
  expect(() => encodeAscii('é')).toThrow(ProtocolError);
  expect(() => encodeAscii('a\nb')).toThrow(ProtocolError);
});
