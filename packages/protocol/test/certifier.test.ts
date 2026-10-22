import { beforeAll, describe, expect, it } from 'vitest';
import {
  ArReader, ArWriter, DPID_UNKNOWN, PacketType, PROTOCOL_VERSION, aes128CbcDecrypt, bytesToHex, decodeCertifierMessage,
  encodeCertify, encodeCloseExistingConnection, encodeErrorReply, encodeGatewayClientAddr, encodeKeepAlive,
  encodeProtocolIdBody, hashPassword, hexToBytes,
} from '../src';
import type { Recording } from '../src';
import { hasRecording, loadRecording, packetsFor, typeOf } from './helpers/fixtures';

const serverList = () => new ArWriter().u32(PacketType.SRVR_LIST).u32(0x01020304).u8(0).string('webtester')
  .u32(2)
  .u32(0xffffffff).u32(1).string('FlyFF').string('172.31.238.55').i32(0).i32(0).i32(1).i32(0)
  .u32(1).u32(1).string('Channel 1').string('').i32(1).i32(12).i32(1).i32(500).toBytes();

describe('certifier messages', () => {
  it('decodes SRVR_LIST in the CDPCertifier::SendServerList order', () => {
    const m = decodeCertifierMessage(serverList());
    expect(m).toEqual({
      type: 'serverList', authKey: 0x01020304, accountFlag: 0, account: 'webtester', servers: [
        { parent: 0xffffffff, id: 1, name: 'FlyFF', address: '172.31.238.55', adult: 0, playerCount: 0, enabled: 1, maxPlayers: 0 },
        { parent: 1, id: 1, name: 'Channel 1', address: '', adult: 1, playerCount: 12, enabled: 1, maxPlayers: 500 },
      ],
    });
  });
  it('decodes ERROR, ERROR_STRING, KEEP_ALIVE and reports unknown types', () => {
    expect(decodeCertifierMessage(new ArWriter().u32(PacketType.ERROR).i32(120).toBytes())).toEqual({ type: 'error', code: 120 });
    expect(decodeCertifierMessage(new ArWriter().u32(PacketType.ERROR_STRING).string('x').toBytes())).toEqual({ type: 'errorString', text: 'x' });
    expect(decodeCertifierMessage(encodeKeepAlive())).toEqual({ type: 'keepAlive' });
    expect(decodeCertifierMessage(hexToBytes('99000000'))).toEqual({ type: 'unknown', packetType: 0x99 });
  });
  it('rejects trailing bytes on a known type', () => {
    expect(() => decodeCertifierMessage(new Uint8Array([...serverList(), 0]))).toThrow();
  });
  it('encodes CERTIFY as type, version, account, 672-byte block', () => {
    const r = new ArReader(encodeCertify('webtester', hashPassword('password1')));
    expect(r.u32()).toBe(PacketType.CERTIFY);
    expect(r.string(32)).toBe('20100412');
    expect(r.string(42)).toBe('webtester');
    expect(bytesToHex(r.bytes(672).subarray(0, 16))).toBe('5c0d542c1a00daad4338c67e374bf216');
    r.expectEnd();
  });
});

describe('certifier message edges', () => {
  it('rejects trailing bytes on ERROR, ERROR_STRING and KEEP_ALIVE too', () => {
    expect(() => decodeCertifierMessage(new Uint8Array([...new ArWriter().u32(PacketType.ERROR).i32(1).toBytes(), 0]))).toThrow();
    expect(() => decodeCertifierMessage(new Uint8Array([...new ArWriter().u32(PacketType.ERROR_STRING).string('x').toBytes(), 0]))).toThrow();
    expect(() => decodeCertifierMessage(new Uint8Array([...encodeKeepAlive(), 0]))).toThrow();
  });
  it('rejects a body cut short and a server count the body cannot hold', () => {
    expect(() => decodeCertifierMessage(serverList().subarray(0, 40))).toThrow();
    const lying = new ArWriter().u32(PacketType.SRVR_LIST).u32(1).u8(0).string('a').u32(0xffffffff).toBytes();
    expect(() => decodeCertifierMessage(lying)).toThrow();
    expect(() => decodeCertifierMessage(new Uint8Array([1, 2]))).toThrow();
  });
  it('rejects a name longer than its 36-byte C++ field', () => {
    const body = new ArWriter().u32(PacketType.SRVR_LIST).u32(1).u8(0).string('a').u32(1)
      .u32(0xffffffff).u32(1).string('n'.repeat(36)).string('').i32(0).i32(0).i32(1).i32(0).toBytes();
    expect(() => decodeCertifierMessage(body)).toThrow();
  });
  it('reads an empty server list', () => {
    const body = new ArWriter().u32(PacketType.SRVR_LIST).u32(7).u8(1).string('a').u32(0).toBytes();
    expect(decodeCertifierMessage(body)).toEqual({ type: 'serverList', authKey: 7, accountFlag: 1, account: 'a', servers: [] });
  });
});

describe('certifier encoders', () => {
  it('writes the keep-alive and error-reply bodies as the type alone', () => {
    expect(bytesToHex(encodeKeepAlive())).toBe('18000000');
    expect(bytesToHex(encodeErrorReply())).toBe('fe000000');
  });
  it('writes CLOSE_EXISTING_CONNECTION as type, account, hash', () => {
    const r = new ArReader(encodeCloseExistingConnection('webtester', hashPassword('password1')));
    expect(r.u32()).toBe(PacketType.CLOSE_EXISTING_CONNECTION);
    expect(r.string(42)).toBe('webtester');
    expect(r.string(33)).toBe(hashPassword('password1'));
    r.expectEnd();
  });
  it('writes GATEWAY_CLIENT_ADDR as type, address', () => {
    const r = new ArReader(encodeGatewayClientAddr('10.0.0.5'));
    expect(r.u32()).toBe(0xe0);
    expect(r.string(16)).toBe('10.0.0.5');
    r.expectEnd();
  });
  it('refuses a non-ASCII account', () => {
    expect(() => encodeCertify('wébtester', hashPassword('password1'))).toThrow();
  });
  it('uses the version string the client sends', () => {
    expect(PROTOCOL_VERSION).toBe('20100412');
  });
});

describe('fixture helpers', () => {
  const rec: Recording = {
    account: 'a', password: 'b', bankPin: '1234', packets: [
      { port: 23000, connection: 1, direction: 's2c', hex: bytesToHex(encodeProtocolIdBody(0x1234)) },
      { port: 23000, connection: 1, direction: 'c2s', hex: bytesToHex(encodeKeepAlive()) },
      { port: 28000, connection: 2, direction: 's2c', hex: bytesToHex(encodeProtocolIdBody(0x5678)) },
      { port: 28000, connection: 2, direction: 's2c', hex: bytesToHex(new ArWriter().u32(DPID_UNKNOWN).u32(0xf3).toBytes()) },
      { port: 23000, connection: 3, direction: 's2c', hex: bytesToHex(new ArWriter().u32(PacketType.ERROR).i32(1).toBytes()) },
    ],
  };
  it('packetsFor filters by port and direction and drops protocol-ID bodies', () => {
    expect(packetsFor(rec, 23000, 's2c').map((p) => p.connection)).toEqual([3]);
    expect(packetsFor(rec, 23000, 'c2s')).toHaveLength(1);
    expect(packetsFor(rec, 28000, 's2c').map((p) => p.hex.slice(0, 8))).toEqual(['ffffffff']);
  });
  it('typeOf reads offset 4 behind DPID_UNKNOWN and offset 0 otherwise', () => {
    expect(typeOf(new ArWriter().u32(DPID_UNKNOWN).u32(0xf3).toBytes())).toBe(0xf3);
    expect(typeOf(encodeKeepAlive())).toBe(PacketType.KEEP_ALIVE);
  });
});

// Needs test/fixtures/neuz-login.json, which the owner records from a real Neuz login. Without it the block is
// skipped (reported as skipped, not as a failure) instead of the whole file failing to load.
describe.skipIf(!hasRecording())('recorded Neuz session, certifier port', () => {
  let rec: Recording;
  beforeAll(() => { rec = loadRecording(); });
  it('decodes every server body to a known message', () => {
    for (const p of packetsFor(rec, 23000, 's2c')) {
      expect(decodeCertifierMessage(hexToBytes(p.hex)).type).not.toBe('unknown');
    }
  });
  it('re-encodes CERTIFY: same fields, block decrypts to the same password hash', () => {
    const recorded = hexToBytes(packetsFor(rec, 23000, 'c2s').find((p) => typeOf(hexToBytes(p.hex)) === PacketType.CERTIFY)!.hex);
    const ours = encodeCertify(rec.account, hashPassword(rec.password));
    expect(bytesToHex(recorded.subarray(0, recorded.length - 672))).toBe(bytesToHex(ours.subarray(0, ours.length - 672)));
    const key = new Uint8Array(16); key.set(new TextEncoder().encode('dldhsvmflvm'));
    const plain = aes128CbcDecrypt(key, new Uint8Array(16), recorded.subarray(recorded.length - 672));
    expect(new TextDecoder().decode(plain.subarray(0, plain.indexOf(0)))).toBe(hashPassword(rec.password));
  });
});
