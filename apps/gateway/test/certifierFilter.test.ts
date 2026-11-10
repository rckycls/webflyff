import { describe, expect, it } from 'vitest';
import {
  ArWriter, PacketType, PROTOCOL_VERSION, encodeCertify, encodeCloseExistingConnection, encodeErrorReply, encodeKeepAlive,
  hashPassword,
} from '@flyffweb/protocol';
import { checkCertifierPacket } from '../src/certifierFilter';

describe('checkCertifierPacket (website spec §3.5)', () => {
  it('passes what the browser sends', () => {
    expect(checkCertifierPacket(encodeCertify('hero_01', hashPassword('abc12345')))).toBeUndefined();
    expect(checkCertifierPacket(encodeCertify('Hero_01', hashPassword('abc12345')))).toBeUndefined();
    expect(checkCertifierPacket(encodeCloseExistingConnection('hero_01', hashPassword('abc12345')))).toBeUndefined();
    expect(checkCertifierPacket(encodeKeepAlive())).toBeUndefined();
    expect(checkCertifierPacket(encodeErrorReply())).toBeUndefined();
    expect(checkCertifierPacket(encodeCertify('a'.repeat(32), hashPassword('x1234567')))).toBeUndefined();
  });

  it('refuses the SQL in a close-existing packet', () => {
    expect(checkCertifierPacket(encodeCloseExistingConnection("x';DROP TABLE ACCOUNT_TBL--", 'a'.repeat(32)))).toBe('account');
    expect(checkCertifierPacket(encodeCloseExistingConnection('hero_01', "x' OR '1'='1"))).toBe('password');
    expect(checkCertifierPacket(encodeCloseExistingConnection('hero_01', 'A'.repeat(32)))).toBe('password');
    expect(checkCertifierPacket(encodeCloseExistingConnection('hero_01', 'a'.repeat(31)))).toBe('password');
    expect(checkCertifierPacket(encodeCloseExistingConnection('hero_01', `${'a'.repeat(31)}'`))).toBe('password');
  });

  it('refuses other types, bad names and short packets', () => {
    expect(checkCertifierPacket(new ArWriter().u32(PacketType.PING).toBytes())).toBe('type');
    expect(checkCertifierPacket(new ArWriter().u32(PacketType.GATEWAY_CLIENT_ADDR).string('1.1.1.1').toBytes())).toBe('type');
    expect(checkCertifierPacket(encodeCertify('has space', 'a'.repeat(32)))).toBe('account');
    expect(checkCertifierPacket(encodeCertify("o'brien", 'a'.repeat(32)))).toBe('account');
    expect(checkCertifierPacket(encodeCertify('', 'a'.repeat(32)))).toBe('account');
    expect(checkCertifierPacket(encodeCertify('a'.repeat(33), 'a'.repeat(32)))).toBe('account');
    expect(checkCertifierPacket(encodeCloseExistingConnection('', 'a'.repeat(32)))).toBe('account');
    expect(checkCertifierPacket(new ArWriter().u32(PacketType.CLOSE_EXISTING_CONNECTION).toBytes())).toBe('malformed');
    expect(checkCertifierPacket(new ArWriter().u32(PacketType.CERTIFY).toBytes())).toBe('malformed');
    expect(checkCertifierPacket(new ArWriter().u32(PacketType.CERTIFY).string(PROTOCOL_VERSION).toBytes())).toBe('malformed');
    expect(checkCertifierPacket(new Uint8Array([0x16, 0]))).toBe('malformed');
    expect(checkCertifierPacket(new Uint8Array([]))).toBe('malformed');
  });

  it('refuses an account longer than the certifier reads, and non-ASCII', () => {
    // a 41-byte account fits the C++ buffer (42 with the terminator) but is not a valid name
    expect(checkCertifierPacket(encodeCloseExistingConnection('a'.repeat(41), 'a'.repeat(32)))).toBe('account');
    expect(checkCertifierPacket(new ArWriter().u32(PacketType.CLOSE_EXISTING_CONNECTION).i32(4).bytes(new Uint8Array([0x68, 0xe9, 0x72, 0x6f]))
      .string('a'.repeat(32)).toBytes())).toBe('account');
    expect(checkCertifierPacket(new ArWriter().u32(PacketType.CLOSE_EXISTING_CONNECTION).i32(4).bytes(new Uint8Array([0x68, 0, 0x72, 0x6f]))
      .string('a'.repeat(32)).toBytes())).toBe('account');
    // longer than the buffer: the reader refuses it
    expect(checkCertifierPacket(encodeCloseExistingConnection('a'.repeat(42), 'a'.repeat(32)))).toBe('malformed');
  });
});
