import { describe, expect, it } from 'vitest';
import { BinaryReader, FormatError } from '../src/index';

const ctx = { file: 'test/file.bin', reader: 'testReader', cppRef: 'Test.cpp:12' };

describe('BinaryReader', () => {
  it('reads little-endian scalars', () => {
    const r = new BinaryReader(
      new Uint8Array([0x01, 0x00, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x80, 0x3f]),
      ctx,
    );
    expect(r.u16()).toBe(1);
    expect(r.i32()).toBe(-1);
    expect(r.f32()).toBe(1);
  });

  it('fixedString stops at NUL', () => {
    const r = new BinaryReader(new TextEncoder().encode('abc\0zzzz'), ctx);
    expect(r.fixedString(8)).toBe('abc');
    expect(r.offset).toBe(8);
  });

  it('overrun throws FormatError with offset', () => {
    const r = new BinaryReader(new Uint8Array([1, 2]), ctx);
    let error: unknown;
    try {
      r.u32();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(FormatError);
    const fe = error as FormatError;
    expect(fe.offset).toBe(0);
    expect(fe.file).toBe(ctx.file);
    expect(fe.reader).toBe(ctx.reader);
    expect(fe.cppRef).toBe(ctx.cppRef);
  });

  it('a binary reader error is still rendered in bytes, with no line', () => {
    const r = new BinaryReader(new Uint8Array([1, 2, 3, 4, 5]), ctx);
    r.u16();
    let error: unknown;
    try {
      r.u32();
    } catch (e) {
      error = e;
    }
    const fe = error as FormatError;
    expect(fe).toBeInstanceOf(FormatError);
    expect(fe.unit).toBe('byte');
    expect(fe.offset).toBe(2);
    expect(fe.line).toBeUndefined();
    expect(fe.message).toContain('test/file.bin @ byte 2:');
    expect(fe.message).not.toContain('char');
    expect(fe.message).not.toContain('line');
  });

  it('expectEnd throws when bytes remain', () => {
    const r = new BinaryReader(new Uint8Array([1, 2, 3, 4]), ctx);
    r.u16();
    expect(() => r.expectEnd()).toThrow(FormatError);
    expect(() => r.expectEnd()).toThrow('2 bytes left');
  });
});
