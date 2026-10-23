import { describe, expect, it } from 'vitest';
import { FormatError, collisionKey, decodeCollisionBin, encodeCollisionBin } from '../src/index';
import { thrown } from './helpers/thrown';

/** Two triangles, 9 floats each: v0.xyz v1.xyz v2.xyz. The values are exact in f32, so a round trip is exact. */
const TWO_TRIANGLES = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 0, 1, 2, 0.5, -3, 4, 5, -6, -7.25, 8, 9]);

describe('collision binary format', () => {
  it('round trip of two triangles', () => {
    const bytes = encodeCollisionBin(TWO_TRIANGLES);
    expect(bytes.byteLength).toBe(4 + 2 * 9 * 4);
    expect(decodeCollisionBin(bytes)).toEqual(TWO_TRIANGLES);
  });

  it('lays the count and the corners out little-endian, in the order given', () => {
    const bytes = encodeCollisionBin(TWO_TRIANGLES);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(2);
    expect(view.getFloat32(4 + 4 * 3, true)).toBe(1); // the second corner's x
    expect(view.getFloat32(4 + 4 * 9 + 4, true)).toBe(0.5); // the second triangle's first corner's y
    expect(view.getFloat32(4 + 4 * 17, true)).toBe(9); // the last float
  });

  it('round-trips a mesh with no triangles, which is four zero bytes', () => {
    const bytes = encodeCollisionBin(new Float32Array(0));
    expect(Array.from(bytes)).toEqual([0, 0, 0, 0]);
    expect(decodeCollisionBin(bytes)).toEqual(new Float32Array(0));
  });

  it('keeps the exact f32 values, a negative zero and a value that is not finite included', () => {
    const triangles = Float32Array.from([-0, 1e-30, 3.4028234663852886e38, Number.NaN, -Infinity, 0.1, 1, 2, 3]);
    const back = decodeCollisionBin(encodeCollisionBin(triangles));
    expect(Array.from(back, (v) => Object.is(v, -0))).toEqual(Array.from(triangles, (v) => Object.is(v, -0)));
    expect(Array.from(back)).toEqual(Array.from(triangles));
  });

  it('decodes a copy, not a view into the bytes it was given', () => {
    const bytes = encodeCollisionBin(TWO_TRIANGLES);
    const back = decodeCollisionBin(bytes);
    bytes.fill(0);
    expect(back).toEqual(TWO_TRIANGLES);
  });

  it('refuses floats that are not whole triangles when encoding', () => {
    expect(() => encodeCollisionBin(new Float32Array(10))).toThrow(RangeError);
    expect(() => encodeCollisionBin(new Float32Array(10))).toThrow(/10 floats.*9/);
  });

  it('refuses a truncated file with a FormatError that names the reader', () => {
    const bytes = encodeCollisionBin(TWO_TRIANGLES);
    const e = thrown(() => decodeCollisionBin(bytes.subarray(0, bytes.length - 1), 'collision/x.bin'));
    expect(e.message).toMatch(/2 triangles need 72 bytes but only 71 remain/);
    expect(e.reader).toBe('decodeCollisionBin');
    expect(e.file).toBe('collision/x.bin');
    expect(thrown(() => decodeCollisionBin(new Uint8Array(3))).message).toMatch(/need 4 bytes but only 3 remain/);
  });

  it('refuses a count that cannot fit the bytes, without allocating for it', () => {
    const bytes = new Uint8Array(4 + 36);
    new DataView(bytes.buffer).setUint32(0, 0xffffffff, true);
    const e = thrown(() => decodeCollisionBin(bytes));
    expect(e.message).toMatch(/4294967295 triangles need .* bytes but only 36 remain/);
  });

  it('refuses bytes left over after the last triangle', () => {
    const bytes = new Uint8Array(encodeCollisionBin(TWO_TRIANGLES).length + 1);
    bytes.set(encodeCollisionBin(TWO_TRIANGLES));
    const e = thrown(() => decodeCollisionBin(bytes));
    expect(e).toBeInstanceOf(FormatError);
    expect(e.message).toMatch(/1 byte left/);
  });

  it('collisionKey puts a model stem under collision/, the stem of its models/<stem>.glb', () => {
    expect(collisionKey('obj_-fence01')).toBe('collision/obj_-fence01.bin');
    const glbKey = 'models/obj_-fence01.glb';
    const stem = glbKey.slice('models/'.length, -'.glb'.length);
    expect(collisionKey(stem)).toBe('collision/obj_-fence01.bin');
  });
});
