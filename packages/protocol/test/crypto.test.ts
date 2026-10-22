import { createCipheriv, createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  aes128CbcDecrypt, aes128CbcEncrypt, bytesToHex, deleteKey, encryptCertifyPassword, hashPassword, hexToBytes, md5Hex,
  ProtocolError,
} from '../src';

const ascii = (s: string) => new TextEncoder().encode(s);

it('md5 matches RFC 1321', () => {
  expect(md5Hex(ascii(''))).toBe('d41d8cd98f00b204e9800998ecf8427e');
  expect(md5Hex(ascii('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
  expect(md5Hex(ascii('12345678901234567890123456789012345678901234567890123456789012345678901234567890')))
    .toBe('57edf4a22be3c955ac49da2e2107b67a');
});
it('md5 agrees with node:crypto around the padding boundaries', () => {
  // 55/56 and 63/64 decide whether the length field fits in the last block or needs one more.
  for (const length of [1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
    const input = Uint8Array.from({ length }, (_, i) => (i * 31 + 7) & 0xff);
    expect(md5Hex(input), `length ${length}`).toBe(createHash('md5').update(input).digest('hex'));
  }
});
it('AES-128 matches FIPS-197 C.1 and SP 800-38A F.2.1/F.2.2', () => {
  const zero = new Uint8Array(16);
  expect(bytesToHex(aes128CbcEncrypt(hexToBytes('000102030405060708090a0b0c0d0e0f'), zero,
    hexToBytes('00112233445566778899aabbccddeeff')))).toBe('69c4e0d86a7b0430d8cdb78070b4c55a');
  const key = hexToBytes('2b7e151628aed2a6abf7158809cf4f3c'), iv = hexToBytes('000102030405060708090a0b0c0d0e0f');
  const plain = hexToBytes('6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e51');
  const cipher = '7649abac8119b246cee98e9b12e9197d5086cb9b507219ee95db113a917678b2';
  expect(bytesToHex(aes128CbcEncrypt(key, iv, plain))).toBe(cipher);
  expect(bytesToHex(aes128CbcDecrypt(key, iv, hexToBytes(cipher)))).toBe(bytesToHex(plain));
});
it('AES-128-CBC round-trips and agrees with node:crypto on arbitrary data', () => {
  const key = Uint8Array.from({ length: 16 }, (_, i) => 255 - i * 13);
  const iv = Uint8Array.from({ length: 16 }, (_, i) => i * 7 + 3);
  const plain = Uint8Array.from({ length: 16 * 9 }, (_, i) => (i * 29 + 11) & 0xff);
  const cipher = aes128CbcEncrypt(key, iv, plain);
  const node = createCipheriv('aes-128-cbc', key, iv);
  node.setAutoPadding(false);
  expect(bytesToHex(cipher)).toBe(bytesToHex(Buffer.concat([node.update(plain), node.final()])));
  expect(bytesToHex(aes128CbcDecrypt(key, iv, cipher))).toBe(bytesToHex(plain));
  expect(aes128CbcEncrypt(key, iv, new Uint8Array(0))).toHaveLength(0);
});
it('AES-128-CBC refuses what cannot be encrypted without padding', () => {
  const key = new Uint8Array(16), iv = new Uint8Array(16);
  expect(() => aes128CbcEncrypt(key, iv, new Uint8Array(15))).toThrow(ProtocolError);
  expect(() => aes128CbcEncrypt(key, iv, new Uint8Array(17))).toThrow(ProtocolError);
  expect(() => aes128CbcDecrypt(key, iv, new Uint8Array(20))).toThrow(ProtocolError);
  expect(() => aes128CbcEncrypt(new Uint8Array(24), iv, new Uint8Array(16))).toThrow(ProtocolError);
  expect(() => aes128CbcEncrypt(key, new Uint8Array(15), new Uint8Array(16))).toThrow(ProtocolError);
  expect(() => aes128CbcDecrypt(key, new Uint8Array(0), new Uint8Array(16))).toThrow(ProtocolError);
});
it('hashes passwords like CNeuzApp::HashMD5 (values from node:crypto)', () => {
  expect(hashPassword('password1')).toBe('3b5ffae22d7c5fb42e78138211ea4bf1');
  expect(hashPassword('3b5ffae22d7c5fb42e78138211ea4bf1')).toBe('3b5ffae22d7c5fb42e78138211ea4bf1');
  expect(deleteKey('1234')).toBe('cbad55c0bf841aef57382b0d33440620');
});
it('only a 32-character input skips the hash', () => {
  const thirtyOne = 'a'.repeat(31);
  const thirtyThree = 'a'.repeat(33);
  expect(hashPassword(thirtyOne)).toBe(createHash('md5').update(`kikugalanet${thirtyOne}`).digest('hex'));
  expect(hashPassword(thirtyThree)).toBe(createHash('md5').update(`kikugalanet${thirtyThree}`).digest('hex'));
  expect(hashPassword('Z'.repeat(32))).toBe('Z'.repeat(32));
  expect(() => hashPassword('pässword')).toThrow(ProtocolError);
});
it('encrypts the 672-byte certify block (value from node:crypto aes-128-cbc)', () => {
  const block = encryptCertifyPassword(hashPassword('password1'));
  expect(block).toHaveLength(672);
  expect(bytesToHex(block.subarray(0, 32))).toBe('5c0d542c1a00daad4338c67e374bf216a0e246238b59e0d655db88e045bdaf3d');
  expect(bytesToHex(block.subarray(656))).toBe('1150145739c2460d436a114f498b0052');
});
it('the certify block decrypts to the hash followed by zeros', () => {
  const hash = hashPassword('password1');
  const key = new Uint8Array(16);
  key.set(ascii('dldhsvmflvm'));
  const plain = aes128CbcDecrypt(key, new Uint8Array(16), encryptCertifyPassword(hash));
  expect(plain).toHaveLength(672);
  expect(new TextDecoder().decode(plain.subarray(0, 32))).toBe(hash);
  expect(plain.subarray(32).every((b) => b === 0)).toBe(true);
});
it('the certify block refuses a hash that does not fit', () => {
  expect(encryptCertifyPassword('')).toHaveLength(672);
  expect(() => encryptCertifyPassword('a'.repeat(673))).toThrow(ProtocolError);
  expect(() => encryptCertifyPassword('café')).toThrow(ProtocolError);
});
