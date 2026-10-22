import { describe, expect, it } from 'vitest';
import { ArWriter, BUNDLE_MARKER, PacketType, ProtocolError, readBundle } from '../src';
import type { MessageReader } from '../src';

const PLAYER = 0x4242;

interface Msg { objectId: number; type: number; fields: Uint8Array }

const msg = (objectId: number, type: number, ...fields: number[]): Msg => ({
  objectId, type, fields: new Uint8Array(fields),
});
/** A message whose fields are `n` zero bytes. */
const blank = (objectId: number, type: number, n: number): Msg => ({ objectId, type, fields: new Uint8Array(n) });
const u32 = (v: number) => new ArWriter().u32(v).toBytes();

interface Table {
  /** Defaults to where the messages really start. */
  starts?: number[];
  /** The trailer's count; defaults to the number of starts. */
  count?: number;
}

/**
 * A bundle written by hand, so a test can break one rule of the table at a time: the 10-byte header (with
 * `headerCount` defaulting to the number of messages), the messages, and the table when `table` is given.
 */
function body(messages: Msg[], table?: Table, headerCount = messages.length): Uint8Array {
  const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(PLAYER).u16(headerCount);
  const natural: number[] = [];
  let at = 0;
  for (const m of messages) {
    natural.push(at);
    w.u32(m.objectId).u16(m.type).bytes(m.fields);
    at += 6 + m.fields.byteLength;
  }
  if (table) {
    const starts = table.starts ?? natural;
    for (const s of starts) w.u32(s);
    w.u16(table.count ?? starts.length).u32(BUNDLE_MARKER);
  }
  return w.toBytes();
}

/** 0xca and 0xf1 read one u32 and 0x10 reads one byte; 0x99 has no reader. */
const readers = new Map<number, MessageReader<number>>([
  [0xca, (r) => r.u32()],
  [0xf1, (r) => r.u32()],
  [0x10, (r) => r.u8()],
]);

describe('readBundle with a table of contents', () => {
  it('reads every message of an indexed bundle', () => {
    const bytes = body(
      [msg(7, 0xca, ...u32(100)), msg(8, 0x99, 1, 2, 3), msg(9, 0xf1, ...u32(5))],
      {},
    );
    expect(readBundle(bytes, readers)).toEqual({
      playerObjectId: PLAYER,
      indexed: true,
      messages: [
        { objectId: 7, type: 0xca, value: 100 },
        { objectId: 9, type: 0xf1, value: 5 },
      ],
      skipped: [0x99],
      mismatched: [],
      stoppedAt: null,
    });
  });

  it('gives each reader the message and player object IDs and only the message fields', () => {
    const seen: { header: unknown; position: number; remaining: number }[] = [];
    const spy = new Map<number, MessageReader<number>>([
      [0xca, (r, header) => {
        seen.push({ header: { ...header }, position: r.position(), remaining: r.remaining() });
        return r.u32();
      }],
    ]);
    readBundle(body([msg(7, 0xca, ...u32(1)), msg(8, 0xca, ...u32(2))], {}), spy);
    expect(seen).toEqual([
      { header: { objectId: 7, playerObjectId: PLAYER }, position: 0, remaining: 4 },
      { header: { objectId: 8, playerObjectId: PLAYER }, position: 0, remaining: 4 },
    ]);
  });

  it('a reader that ends early or late is mismatched, and the rest is still read', () => {
    const bytes = body(
      [
        blank(1, 0xca, 8), // the reader takes 4 of 8 bytes: ends early
        blank(2, 0xf1, 4), // the reader below takes 8 of 4 bytes: runs out
        msg(3, 0x10, 9), // fine
        blank(4, 0x99, 2), // no reader
        msg(5, 0x10, 7), // fine
      ],
      {},
    );
    const late = new Map(readers).set(0xf1, (r) => r.u32() + r.u32());
    const result = readBundle(bytes, late);
    expect(result.indexed).toBe(true);
    expect(result.mismatched).toEqual([0xca, 0xf1]);
    expect(result.skipped).toEqual([0x99]);
    expect(result.messages).toEqual([
      { objectId: 3, type: 0x10, value: 9 },
      { objectId: 5, type: 0x10, value: 7 },
    ]);
    expect(result.stoppedAt).toBeNull();
  });

  it('a reader that skips the rest of its message is not mismatched', () => {
    const partial = new Map(readers).set(0xca, (r) => { const v = r.u32(); r.skipRest(); return v; });
    const result = readBundle(body([blank(1, 0xca, 30), msg(2, 0x10, 4)], {}), partial);
    expect(result.mismatched).toEqual([]);
    expect(result.messages.map((m) => m.objectId)).toEqual([1, 2]);
  });

  it('a reader that throws another error than a ProtocolError is a bug and propagates', () => {
    const buggy = new Map(readers).set(0xca, () => { throw new TypeError('bug'); });
    expect(() => readBundle(body([blank(1, 0xca, 4)], {}), buggy)).toThrow(TypeError);
  });

  it('reads a bundle with no messages', () => {
    for (const bytes of [body([], {}), body([])]) {
      const result = readBundle(bytes, readers);
      expect(result.messages).toEqual([]);
      expect(result.skipped).toEqual([]);
      expect(result.mismatched).toEqual([]);
      expect(result.playerObjectId).toBe(PLAYER);
    }
    expect(readBundle(body([], {}), readers).indexed).toBe(true);
    expect(readBundle(body([]), readers).indexed).toBe(false);
  });

  it('reads a bundle that sits inside a larger buffer', () => {
    const bytes = body([msg(7, 0xca, ...u32(100)), msg(9, 0xf1, ...u32(5))], {});
    const backing = new Uint8Array(bytes.byteLength + 7).fill(0xee);
    backing.set(bytes, 3);
    const result = readBundle(backing.subarray(3, 3 + bytes.byteLength), readers);
    expect(result.indexed).toBe(true);
    expect(result.messages.map((m) => m.value)).toEqual([100, 5]);
  });

  it('throws when the trailer count differs from the header count', () => {
    const bytes = body([blank(1, 0x10, 1), blank(2, 0x10, 1)], { count: 3 });
    expect(() => readBundle(bytes, readers)).toThrow(ProtocolError);
  });

  it('throws when the first start is not 0', () => {
    const bytes = body([blank(1, 0x10, 1), blank(2, 0x10, 1)], { starts: [1, 8] });
    expect(() => readBundle(bytes, readers)).toThrow(ProtocolError);
  });

  it('throws when starts are less than 6 apart', () => {
    const bytes = body([blank(1, 0x10, 1), blank(2, 0x10, 1)], { starts: [0, 5] });
    expect(() => readBundle(bytes, readers)).toThrow(ProtocolError);
    // Exactly 6 apart is the smallest legal message (an object ID and a type): no throw.
    const ok = body([blank(1, 0x99, 0), blank(2, 0x99, 0)], { starts: [0, 6] });
    expect(readBundle(ok, readers).skipped).toEqual([0x99, 0x99]);
  });

  it('throws when the last start is less than 6 bytes before the trailer', () => {
    // Messages take 14 bytes (starts 0 and 7); the table says the last one starts at 9, 5 bytes before the trailer.
    const bytes = body([blank(1, 0x10, 1), blank(2, 0x10, 1)], { starts: [0, 9] });
    expect(() => readBundle(bytes, readers)).toThrow(ProtocolError);
    // 6 bytes before the trailer is the smallest legal last message.
    const ok = body([blank(1, 0x10, 1), blank(2, 0x99, 0)], { starts: [0, 7] });
    expect(readBundle(ok, readers).indexed).toBe(true);
  });

  it('throws when the table is longer than the bundle', () => {
    // The header says 3 messages, so the table needs 18 bytes, but only 10 bytes follow the header.
    const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(PLAYER).u16(3).u32(0).u16(3).u32(BUNDLE_MARKER);
    expect(() => readBundle(w.toBytes(), readers)).toThrow(ProtocolError);
  });

  it('throws on a negative count', () => {
    const bytes = body([], { starts: [], count: 0xffff }, 0xffff);
    expect(() => readBundle(bytes, readers)).toThrow(ProtocolError);
  });

  it('throws on a body shorter than the 10-byte header', () => {
    expect(() => readBundle(new Uint8Array(9), readers)).toThrow(ProtocolError);
    expect(() => readBundle(new Uint8Array(0), readers)).toThrow(ProtocolError);
    expect(() => readBundle(new Uint8Array(10), readers)).not.toThrow();
  });
});

describe('readBundle without a table of contents', () => {
  it('reads an unindexed bundle in order and stops at the first type with no reader', () => {
    const strings = new Map<number, MessageReader<string>>([
      [0xca, (r) => r.string(32)],
      [0xf1, (r) => String(r.u32())],
    ]);
    const bytes = new ArWriter().u32(PacketType.JOIN).u32(PLAYER).u16(4)
      .u32(1).u16(0xca).string('Hero')
      .u32(2).u16(0xf1).u32(77)
      .u32(3).u16(0x99).u8(1).u8(2)
      .u32(4).u16(0xca).string('never read')
      .toBytes();
    expect(readBundle(bytes, strings)).toEqual({
      playerObjectId: PLAYER,
      indexed: false,
      messages: [
        { objectId: 1, type: 0xca, value: 'Hero' },
        { objectId: 2, type: 0xf1, value: '77' },
      ],
      skipped: [0x99],
      mismatched: [],
      stoppedAt: 0x99,
    });
  });

  it('reads every message when all of them have readers', () => {
    const result = readBundle(body([msg(1, 0xca, ...u32(1)), msg(2, 0x10, 2)]), readers);
    expect(result.indexed).toBe(false);
    expect(result.messages).toEqual([
      { objectId: 1, type: 0xca, value: 1 },
      { objectId: 2, type: 0x10, value: 2 },
    ]);
    expect(result.stoppedAt).toBeNull();
  });

  it('a reader that skips the rest ends an unindexed bundle', () => {
    const rest = new Map(readers).set(0xf1, (r) => { const v = r.u32(); r.skipRest(); return v; });
    const bytes = body([msg(1, 0xca, ...u32(1)), msg(2, 0xf1, ...u32(2)), msg(3, 0xca, ...u32(3))]);
    const result = readBundle(bytes, rest);
    expect(result.messages.map((m) => m.objectId)).toEqual([1, 2]);
    expect(result.skipped).toEqual([]);
    expect(result.mismatched).toEqual([]);
    expect(result.stoppedAt).toBeNull();
  });

  it('a reader that throws a ProtocolError ends the bundle, with its type in mismatched and stoppedAt', () => {
    // Asks for more bytes than the whole rest of the bundle holds.
    const greedy = new Map(readers).set(0xf1, (r) => r.bytes(100).length);
    const bytes = body([msg(1, 0xca, ...u32(1)), msg(2, 0xf1, ...u32(2)), msg(3, 0xca, ...u32(3))]);
    const result = readBundle(bytes, greedy);
    expect(result.messages).toEqual([{ objectId: 1, type: 0xca, value: 1 }]);
    expect(result.mismatched).toEqual([0xf1]);
    expect(result.stoppedAt).toBe(0xf1);
    expect(result.skipped).toEqual([]);
  });

  it('a reader that throws another error than a ProtocolError propagates', () => {
    const buggy = new Map(readers).set(0xca, () => { throw new TypeError('bug'); });
    expect(() => readBundle(body([blank(1, 0xca, 4)]), buggy)).toThrow(TypeError);
  });

  it('throws when the bundle ends inside a message header', () => {
    const bytes = new ArWriter().u32(PacketType.SNAPSHOT).u32(PLAYER).u16(2)
      .u32(1).u16(0x10).u8(5)
      .u32(2) // the type is missing
      .toBytes();
    expect(() => readBundle(bytes, readers)).toThrow(ProtocolError);
  });

  it('does not take trailing bytes for a table when the marker is not last', () => {
    const bytes = new ArWriter().u32(PacketType.SNAPSHOT).u32(PLAYER).u16(1)
      .u32(1).u16(0x10).u8(5).u32(BUNDLE_MARKER).u8(0)
      .toBytes();
    const result = readBundle(bytes, readers);
    expect(result.indexed).toBe(false);
    expect(result.messages).toEqual([{ objectId: 1, type: 0x10, value: 5 }]);
  });
});
