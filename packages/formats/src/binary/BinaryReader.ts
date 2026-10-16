import { FormatError } from '../errors';

export type Vec3 = [number, number, number];

/** Identifies the file being read and the C++ function being copied; copied into every FormatError. */
export interface ReaderContext {
  file: string;
  reader: string;
  cppRef: string;
}

/**
 * Sequential little-endian reader over a byte array (FlyFF files are x86 dumps).
 * Every overrun or leftover-bytes problem is a FormatError at the current offset.
 */
export class BinaryReader {
  /** Position of the next byte to read. */
  offset = 0;
  readonly length: number;
  private readonly view: DataView;
  private readonly source: Uint8Array;

  constructor(
    bytes: Uint8Array,
    private readonly ctx: ReaderContext,
  ) {
    this.source = bytes;
    this.length = bytes.byteLength;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  remaining(): number {
    return this.length - this.offset;
  }

  u8(): number {
    this.need(1);
    return this.view.getUint8(this.offset++);
  }

  i8(): number {
    this.need(1);
    return this.view.getInt8(this.offset++);
  }

  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  i16(): number {
    this.need(2);
    const v = this.view.getInt16(this.offset, true);
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

  vec3(): Vec3 {
    this.need(12);
    return [this.f32(), this.f32(), this.f32()];
  }

  /** 16 floats in file order (D3DXMATRIX as stored). */
  mat4(): Float32Array {
    return this.f32Array(16);
  }

  f32Array(n: number): Float32Array {
    this.needArray(n, 4);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = this.view.getFloat32(this.offset + i * 4, true);
    }
    this.offset += n * 4;
    return out;
  }

  u16Array(n: number): Uint16Array {
    this.needArray(n, 2);
    const out = new Uint16Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = this.view.getUint16(this.offset + i * 2, true);
    }
    this.offset += n * 2;
    return out;
  }

  u32Array(n: number): Uint32Array {
    this.needArray(n, 4);
    const out = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = this.view.getUint32(this.offset + i * 4, true);
    }
    this.offset += n * 4;
    return out;
  }

  /** A copy of the next n bytes (does not alias the input buffer). */
  bytes(n: number): Uint8Array {
    this.needArray(n, 1);
    const out = this.source.slice(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }

  /** Reads a fixed-size char field: consumes n bytes, returns the latin1 text before the first NUL. */
  fixedString(n: number): string {
    this.needArray(n, 1);
    let text = '';
    for (let i = 0; i < n; i++) {
      const c = this.source[this.offset + i];
      if (c === 0) break;
      text += String.fromCharCode(c);
    }
    this.offset += n;
    return text;
  }

  skip(n: number): void {
    this.needArray(n, 1);
    this.offset += n;
  }

  /** Fails unless every byte has been consumed. */
  expectEnd(): void {
    const left = this.remaining();
    if (left !== 0) {
      this.fail(`expected end of data but ${left} ${left === 1 ? 'byte' : 'bytes'} left`);
    }
  }

  /** Throws a FormatError at the current offset. */
  fail(msg: string): never {
    throw new FormatError(msg, { ...this.ctx, offset: this.offset });
  }

  private need(n: number): void {
    if (n > this.remaining()) {
      this.fail(`need ${n} bytes but only ${this.remaining()} remain`);
    }
  }

  /** Validates an element count before anything is allocated, so a corrupt count cannot exhaust memory. */
  private needArray(count: number, elementSize: number): void {
    if (!Number.isSafeInteger(count) || count < 0) {
      this.fail(`invalid element count ${count}`);
    }
    this.need(count * elementSize);
  }
}
