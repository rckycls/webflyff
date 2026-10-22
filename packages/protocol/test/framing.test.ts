import { describe, expect, it } from 'vitest';
import {
  ClientFrameReader, ServerFrameReader, ProtocolError, bytesToHex, crc32, encodeClientFrame,
  encodeProtocolIdBody, encodeServerFrame, hexToBytes, readProtocolId,
} from '../src';

const ascii = (s: string) => new TextEncoder().encode(s);

describe('crc32', () => {
  it('matches the standard check value', () => expect(crc32(ascii('123456789'))).toBe(0xcbf43926));
});

describe('client frames', () => {
  const keepAlive = new Uint8Array([0x18, 0, 0, 0]);
  it('encodes the 13-byte header (value computed with node:zlib crc32)', () => {
    expect(bytesToHex(encodeClientFrame(keepAlive, 0x12345678))).toBe('5ecce1ed4304000000eb09225918000000');
  });
  it('reads frames split at every byte and merged into one chunk', () => {
    const a = encodeClientFrame(keepAlive, 7), b = encodeClientFrame(ascii('hello'), 7);
    const all = new Uint8Array([...a, ...b]);
    const r1 = new ClientFrameReader(7);
    const split = [...all].flatMap((byte) => r1.push(new Uint8Array([byte])));
    expect(split.map(bytesToHex)).toEqual([bytesToHex(keepAlive), bytesToHex(ascii('hello'))]);
    expect(new ClientFrameReader(7).push(all)).toHaveLength(2);
  });
  it('rejects a wrong protocol ID and a missing marker', () => {
    expect(() => new ClientFrameReader(8).push(encodeClientFrame(keepAlive, 7))).toThrow(ProtocolError);
    expect(() => new ClientFrameReader(7).push(new Uint8Array(13))).toThrow(ProtocolError);
  });
});

describe('server frames', () => {
  it('encodes and reads the 5-byte header across chunk boundaries', () => {
    const f = encodeServerFrame(ascii('abc'));
    expect(bytesToHex(f)).toBe('5e03000000616263');
    const r = new ServerFrameReader();
    expect(r.push(f.subarray(0, 2))).toEqual([]);
    expect(r.push(f.subarray(2)).map(bytesToHex)).toEqual(['616263']);
  });
  it('rejects oversized bodies', () => {
    expect(() => new ServerFrameReader(2).push(encodeServerFrame(ascii('abc')))).toThrow(ProtocolError);
  });
});

describe('protocol ID', () => {
  it('recognises the 8-byte ID body only', () => {
    expect(readProtocolId(encodeProtocolIdBody(0xdeadbeef))).toBe(0xdeadbeef);
    expect(bytesToHex(encodeProtocolIdBody(1))).toBe('0000000001000000');
    expect(readProtocolId(hexToBytes('1800000000000000'))).toBeUndefined();
    expect(readProtocolId(hexToBytes('00000000'))).toBeUndefined();
  });
});

// Beyond the brief: the properties the gateway and the capture tool depend on when TCP cuts the stream anywhere.
describe('frame readers across every chunk boundary', () => {
  const bodies = [new Uint8Array([0x18, 0, 0, 0]), ascii('hello'), new Uint8Array(0), ascii('x'.repeat(300))];
  const hex = (list: Uint8Array[]) => list.map(bytesToHex);
  const cases = [
    { name: 'client', stream: () => concat(bodies.map((b) => encodeClientFrame(b, 0xdeadbeef))), reader: () => new ClientFrameReader(0xdeadbeef) },
    { name: 'server', stream: () => concat(bodies.map(encodeServerFrame)), reader: () => new ServerFrameReader() },
  ];
  for (const { name, stream, reader } of cases) {
    it(`${name}: two chunks cut at every offset give the same bodies as one chunk`, () => {
      const all = stream();
      expect(hex(reader().push(all))).toEqual(hex(bodies));
      for (let cut = 0; cut <= all.length; cut++) {
        const r = reader();
        const got = [...r.push(all.subarray(0, cut)), ...r.push(all.subarray(cut))];
        expect(hex(got), `cut at ${cut}`).toEqual(hex(bodies));
      }
    });
    it(`${name}: a reused receive buffer cannot corrupt a partial frame`, () => {
      const all = stream();
      const r = reader();
      const first = all.slice(0, 20); // ends inside a frame for both codecs
      const early = r.push(first);
      first.fill(0xee); // the caller reuses its receive buffer
      const got = [...early, ...r.push(all.slice(20))];
      expect(hex(got)).toEqual(hex(bodies));
    });
  }
  it('client: a returned body does not share memory with the pushed chunk', () => {
    const chunk = encodeClientFrame(ascii('abc'), 1);
    const [body] = new ClientFrameReader(1).push(chunk);
    chunk.fill(0);
    expect(bytesToHex(body)).toBe('616263');
  });
  it('server: a returned body does not share memory with the pushed chunk', () => {
    const chunk = encodeServerFrame(ascii('abc'));
    const [body] = new ServerFrameReader().push(chunk);
    chunk.fill(0);
    expect(bytesToHex(body)).toBe('616263');
  });
});

describe('frame readers fed Node Buffers (what a socket delivers)', () => {
  // Buffer.slice is a view, not a copy, so a reader that used it would hand out memory the socket layer may reuse.
  it('client: bodies and the kept partial frame survive the Buffer being overwritten', () => {
    const all = Buffer.from(encodeClientFrame(ascii('abc'), 1));
    const r = new ClientFrameReader(1);
    const early = r.push(all.subarray(0, 15));
    all.subarray(0, 15).fill(0);
    const [body] = r.push(all.subarray(15));
    expect(early).toEqual([]);
    expect(bytesToHex(body)).toBe('616263');
    expect(Buffer.isBuffer(body)).toBe(false);
  });
  it('server: bodies and the kept partial frame survive the Buffer being overwritten', () => {
    const all = Buffer.from(encodeServerFrame(ascii('abc')));
    const r = new ServerFrameReader();
    const early = r.push(all.subarray(0, 6));
    all.subarray(0, 6).fill(0);
    const [body] = r.push(all.subarray(6));
    expect(early).toEqual([]);
    expect(bytesToHex(body)).toBe('616263');
    expect(Buffer.isBuffer(body)).toBe(false);
  });
});

describe('frame reader errors', () => {
  const frame = () => encodeClientFrame(ascii('hello'), 7); // 13 + 5 = 18 bytes
  it('client: a flipped body byte is a body checksum mismatch at the frame offset', () => {
    const first = frame(), second = frame();
    second[13] ^= 1;
    expect(() => new ClientFrameReader(7).push(new Uint8Array([...first, ...second]))).toThrow(/body checksum.*offset 18/);
  });
  it('client: a flipped length byte fails the header checksum before waiting for a body', () => {
    const f = frame();
    f[5] ^= 0x40; // the length now claims 69 bytes; the header check must catch it instead of buffering
    expect(() => new ClientFrameReader(7).push(f.subarray(0, 13))).toThrow(/header checksum.*offset 0/);
  });
  it('client: a missing marker is reported at its stream offset, also when it arrives later', () => {
    const r = new ClientFrameReader(7);
    expect(r.push(frame())).toHaveLength(1);
    expect(() => r.push(new Uint8Array([0x41]))).toThrow(/marker.*offset 18/);
  });
  it('server: a missing marker and an oversized length are reported at the frame offset', () => {
    const r = new ServerFrameReader(4);
    expect(r.push(encodeServerFrame(ascii('abcd')))).toHaveLength(1);
    expect(() => r.push(new Uint8Array([0x41]))).toThrow(/marker.*offset 9/);
    expect(() => new ServerFrameReader(4).push(encodeServerFrame(ascii('abcde')))).toThrow(/5 bytes.*offset 0/);
  });
  it('server: an oversized length is refused from the header alone, without waiting for the body', () => {
    expect(() => new ServerFrameReader(4).push(hexToBytes('5e10000000'))).toThrow(ProtocolError);
  });
  it('after an error the reader stays failed instead of resuming mid-stream', () => {
    const s = new ServerFrameReader();
    expect(() => s.push(new Uint8Array([0x41]))).toThrow(ProtocolError);
    expect(() => s.push(encodeServerFrame(ascii('ok')))).toThrow(ProtocolError);
    const c = new ClientFrameReader(7);
    expect(() => c.push(new Uint8Array([0x41]))).toThrow(ProtocolError);
    expect(() => c.push(frame())).toThrow(ProtocolError);
  });
});

function concat(parts: Uint8Array[]): Uint8Array {
  return new Uint8Array(parts.flatMap((p) => [...p]));
}
