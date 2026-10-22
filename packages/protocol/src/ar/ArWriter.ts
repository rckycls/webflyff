import { encodeAscii } from '../text';

const INITIAL_CAPACITY = 64;

/**
 * Builds a body the way a storing `CAr` does: little-endian numbers appended in order, strings as an i32 byte
 * count and the bytes with no terminator. Numbers wrap to the field width like a C++ cast, so `u32(-1)` and
 * `i32(0xffffffff)` write the same four bytes (`NULL_ID` is written either way in the C++).
 * Every writing method returns `this` so a packet reads as one chain.
 */
export class ArWriter {
  private buffer = new Uint8Array(INITIAL_CAPACITY);
  private view = new DataView(this.buffer.buffer);
  private length = 0;

  u8(value: number): this {
    const at = this.reserve(1);
    this.view.setUint8(at, value);
    return this;
  }

  u16(value: number): this {
    const at = this.reserve(2);
    this.view.setUint16(at, value, true);
    return this;
  }

  /** A `short`, which `CAr::operator<<( short )` writes as a WORD. */
  i16(value: number): this {
    const at = this.reserve(2);
    this.view.setInt16(at, value, true);
    return this;
  }

  u32(value: number): this {
    const at = this.reserve(4);
    this.view.setUint32(at, value, true);
    return this;
  }

  i32(value: number): this {
    const at = this.reserve(4);
    this.view.setInt32(at, value, true);
    return this;
  }

  f32(value: number): this {
    const at = this.reserve(4);
    this.view.setFloat32(at, value, true);
    return this;
  }

  i64(value: bigint): this {
    const at = this.reserve(8);
    this.view.setBigInt64(at, value, true);
    return this;
  }

  bytes(value: Uint8Array): this {
    const at = this.reserve(value.byteLength);
    this.buffer.set(value, at);
    return this;
  }

  /** `CAr::WriteString`: i32 byte count, then the ASCII bytes. Text outside 0x20..0x7E throws (see `encodeAscii`). */
  string(text: string): this {
    const encoded = encodeAscii(text);
    return this.i32(encoded.byteLength).bytes(encoded);
  }

  vec3(value: readonly [number, number, number]): this {
    return this.f32(value[0]).f32(value[1]).f32(value[2]);
  }

  /** A copy of everything written so far; later writes do not change it. */
  toBytes(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }

  /**
   * Reserves n bytes at the end, doubling the buffer as needed, and returns where they start. Growing replaces
   * `buffer` and `view`, so callers touch those only after this returns.
   */
  private reserve(n: number): number {
    const start = this.length;
    const needed = start + n;
    if (needed > this.buffer.byteLength) {
      let capacity = this.buffer.byteLength * 2;
      while (capacity < needed) capacity *= 2;
      const next = new Uint8Array(capacity);
      next.set(this.buffer.subarray(0, start));
      this.buffer = next;
      this.view = new DataView(next.buffer);
    }
    this.length = needed;
    return start;
  }
}
