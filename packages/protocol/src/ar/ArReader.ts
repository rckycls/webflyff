import { ProtocolError } from '../errors';
import { decodeText } from '../text';

/**
 * Sequential little-endian reader over a received body, the counterpart of reading from a `CAr`.
 * Every overrun, bad string length or leftover byte is a ProtocolError at the current offset.
 */
export class ArReader {
  /** Position of the next byte to read. */
  offset = 0;
  private readonly view: DataView;
  private readonly source: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.source = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  remaining(): number {
    return this.source.byteLength - this.offset;
  }

  /** Bytes read so far: where the next read starts. */
  position(): number {
    return this.offset;
  }

  /**
   * Marks everything left as read, for a reader that deliberately stops short of the end of its data (a message
   * whose last fields the browser has no use for). `remaining()` is 0 afterwards and `expectEnd()` passes.
   */
  skipRest(): void {
    this.offset = this.source.byteLength;
  }

  u8(): number {
    this.need(1);
    return this.view.getUint8(this.offset++);
  }

  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  i32(): number {
    this.need(4);
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }

  f32(): number {
    this.need(4);
    const v = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }

  i64(): bigint {
    this.need(8);
    const v = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return v;
  }

  /** A copy of the next n bytes (does not alias the input buffer). */
  bytes(n: number): Uint8Array {
    if (!Number.isSafeInteger(n) || n < 0) {
      this.fail(`invalid byte count ${n}`);
    }
    this.need(n);
    // Not `source.slice`: on a Node Buffer that returns a view, not a copy.
    const out = new Uint8Array(n);
    out.set(this.source.subarray(this.offset, this.offset + n));
    this.offset += n;
    return out;
  }

  /**
   * Copies `CAr::ReadString(lpsz, nBufSize)`: an i32 byte count, then that many bytes. The C++ buffer holds
   * `bufSize` bytes with the terminator, so a count below 0 or above `bufSize - 1` is an error here (the C++
   * quietly returns an empty string and drops the rest of the packet). The bytes decode as windows-1252.
   */
  string(bufSize: number): string {
    const start = this.offset;
    const length = this.i32();
    if (length < 0 || length > bufSize - 1) {
      this.offset = start;
      this.fail(`string length ${length} is outside 0..${bufSize - 1}`);
    }
    return decodeText(this.bytes(length));
  }

  vec3(): [number, number, number] {
    this.need(12);
    return [this.f32(), this.f32(), this.f32()];
  }

  /** Fails unless every byte has been consumed. */
  expectEnd(): void {
    const left = this.remaining();
    if (left !== 0) {
      this.fail(`expected end of data but ${left} ${left === 1 ? 'byte' : 'bytes'} left`);
    }
  }

  private fail(message: string): never {
    throw new ProtocolError(message, this.offset);
  }

  private need(n: number): void {
    if (n > this.remaining()) {
      this.fail(`need ${n} bytes but only ${this.remaining()} remain`);
    }
  }
}
