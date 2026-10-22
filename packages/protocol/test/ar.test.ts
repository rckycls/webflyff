import { describe, expect, it } from 'vitest';
import { ArReader, ArWriter, ProtocolError, bytesToHex } from '../src';

describe('ArWriter / ArReader', () => {
  it('writes CAr strings as i32 length + bytes, little-endian', () => {
    const bytes = new ArWriter().u32(0xfc).string('20100412').toBytes();
    expect(bytesToHex(bytes)).toBe('fc000000' + '08000000' + '3230313030343132');
  });
  it('round-trips every type', () => {
    const w = new ArWriter().u8(0xab).u16(0xbeef).u32(0xffffffff).i32(-2).f32(1.5).i64(-5n).vec3([1, 2, 3]).string('Hi');
    const r = new ArReader(w.toBytes());
    expect([r.u8(), r.u16(), r.u32(), r.i32(), r.f32(), r.i64()]).toEqual([0xab, 0xbeef, 0xffffffff, -2, 1.5, -5n]);
    expect(r.vec3()).toEqual([1, 2, 3]);
    expect(r.string(16)).toBe('Hi');
    expect(() => r.expectEnd()).not.toThrow();
  });
  it('rejects a string longer than the C++ buffer allows', () => {
    const r = new ArReader(new ArWriter().string('abcdefghijklmnop').toBytes()); // 16 bytes
    expect(() => r.string(16)).toThrow(ProtocolError); // CAr allows bufSize - 1 = 15
  });
  it('throws on overrun and on leftover bytes', () => {
    expect(() => new ArReader(new Uint8Array(3)).u32()).toThrow(/offset 0/);
    const r = new ArReader(new Uint8Array(5)); r.u32();
    expect(() => r.expectEnd()).toThrow(ProtocolError);
  });
  it('keeps every byte when the buffer grows past its first size', () => {
    const w = new ArWriter();
    for (let i = 0; i < 100; i++) w.u32(i);
    w.bytes(new Uint8Array(500).fill(7)).i64(123456789012345n);
    const r = new ArReader(w.toBytes());
    for (let i = 0; i < 100; i++) expect(r.u32()).toBe(i);
    expect(Array.from(r.bytes(500)).every((b) => b === 7)).toBe(true);
    expect(r.i64()).toBe(123456789012345n);
    expect(() => r.expectEnd()).not.toThrow();
  });
  it('toBytes and bytes return copies, not views', () => {
    const w = new ArWriter().u8(1);
    const first = w.toBytes();
    w.u8(2);
    expect(Array.from(first)).toEqual([1]);
    const source = new Uint8Array([9, 8, 7]);
    const copy = new ArReader(source).bytes(3);
    source[0] = 0;
    expect(copy[0]).toBe(9);
  });
  it('reads from a view that does not start at the buffer start', () => {
    const backing = new Uint8Array([0xff, 0xff, 0x2a, 0, 0, 0, 0xff]);
    expect(new ArReader(backing.subarray(2, 6)).u32()).toBe(42);
  });
  it('decodes string bytes as windows-1252 and accepts the exact buffer limit', () => {
    const bytes = new Uint8Array([4, 0, 0, 0, 0x46, 0x6c, 0xe9, 0x80]);
    expect(new ArReader(bytes).string(5)).toBe('Flé€');
    expect(() => new ArReader(bytes).string(4)).toThrow(ProtocolError);
  });
  it('rejects a negative string length at the length field', () => {
    const r = new ArReader(new ArWriter().i32(-1).toBytes());
    expect(() => r.string(16)).toThrow(/offset 0/);
  });
  it('rejects a string whose bytes are cut short', () => {
    const r = new ArReader(new ArWriter().i32(8).bytes(new Uint8Array(3)).toBytes());
    expect(() => r.string(16)).toThrow(/offset 4/);
  });
  it('rejects an invalid byte count', () => {
    const r = new ArReader(new Uint8Array(4));
    expect(() => r.bytes(-1)).toThrow(ProtocolError);
    expect(() => r.bytes(1.5)).toThrow(ProtocolError);
  });
  it('reports its position and lets a reader skip the rest on purpose', () => {
    const r = new ArReader(new Uint8Array(10));
    expect(r.position()).toBe(0);
    r.u32();
    expect(r.position()).toBe(4);
    expect(r.remaining()).toBe(6);
    r.skipRest();
    expect(r.position()).toBe(10);
    expect(r.remaining()).toBe(0);
    expect(() => r.expectEnd()).not.toThrow();
    expect(() => r.u8()).toThrow(ProtocolError);
  });
  it('refuses to write text the server cannot take', () => {
    expect(() => new ArWriter().string('café')).toThrow(ProtocolError);
  });
});
