import { expect, it } from 'vitest';
import { ArWriter, BUNDLE_MARKER, MessageType, PacketType, bytesToHex, readBundle } from '@flyffweb/protocol';
import type { MessageReader } from '@flyffweb/protocol';
import { encodeBundle } from '../src';

it('encodeBundle writes the table', () => {
  const bytes = encodeBundle(PacketType.SNAPSHOT, 0x1234, [
    { objectId: 7, type: MessageType.MOVERMOVED, fields: new Uint8Array([1, 2, 3, 4]) },
    { objectId: 8, type: MessageType.DEL_OBJ, fields: new Uint8Array(0) },
  ]);
  expect(bytesToHex(bytes)).toBe([
    '00ffffff', '34120000', '0200', // type SNAPSHOT, player object ID, count
    '07000000', 'ca00', '01020304', // message 0, 10 bytes
    '08000000', 'f100', // message 1, 6 bytes
    '00000000', '0a000000', // starts: 0 and 10, counted from byte 10
    '0200', '544f4331', // count again, the marker "TOC1"
  ].join(''));
  expect(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(bytes.byteLength - 4, true))
    .toBe(BUNDLE_MARKER);
});

it('writes the table by default and no trailer without index', () => {
  const messages = [{ objectId: 7, type: 0xca, fields: new Uint8Array([1, 2, 3, 4]) }];
  const indexed = encodeBundle(PacketType.JOIN, 1, messages);
  const plain = encodeBundle(PacketType.JOIN, 1, messages, { index: false });
  expect(indexed.byteLength).toBe(plain.byteLength + 4 + 2 + 4); // one start, the count, the marker
  expect(bytesToHex(indexed.subarray(0, plain.byteLength))).toBe(bytesToHex(plain));
  expect(bytesToHex(plain)).toBe('00ff0000' + '01000000' + '0100' + '07000000' + 'ca00' + '01020304');
  expect(bytesToHex(encodeBundle(PacketType.JOIN, 1, messages, { index: true }))).toBe(bytesToHex(indexed));
});

it('writes the trailer of a bundle with no messages', () => {
  expect(bytesToHex(encodeBundle(PacketType.SNAPSHOT, 5, []))).toBe('00ffffff' + '05000000' + '0000' + '0000' + '544f4331');
  expect(bytesToHex(encodeBundle(PacketType.SNAPSHOT, 5, [], { index: false }))).toBe('00ffffff' + '05000000' + '0000');
});

it('refuses more messages than the i16 count holds', () => {
  const many = Array.from({ length: 0x8000 }, () => ({ objectId: 1, type: 1, fields: new Uint8Array(0) }));
  expect(() => encodeBundle(PacketType.SNAPSHOT, 1, many)).toThrow();
});

it('what it writes is read back by readBundle, with and without the table', () => {
  const readers = new Map<number, MessageReader<number>>([[MessageType.MOVERMOVED, (r) => r.u32()]]);
  const messages = [
    { objectId: 7, type: MessageType.MOVERMOVED, fields: new ArWriter().u32(99).toBytes() },
    { objectId: 8, type: MessageType.DEL_OBJ, fields: new Uint8Array(0) },
  ];
  const indexed = readBundle(encodeBundle(PacketType.SNAPSHOT, 3, messages), readers);
  expect(indexed).toMatchObject({
    playerObjectId: 3, indexed: true, skipped: [MessageType.DEL_OBJ], mismatched: [], stoppedAt: null,
    messages: [{ objectId: 7, type: MessageType.MOVERMOVED, value: 99 }],
  });
  const plain = readBundle(encodeBundle(PacketType.SNAPSHOT, 3, messages, { index: false }), readers);
  expect(plain).toMatchObject({
    indexed: false, stoppedAt: MessageType.DEL_OBJ, messages: [{ objectId: 7, value: 99 }],
  });
});
