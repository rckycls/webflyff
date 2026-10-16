/** Lays out little-endian records the way the C++ writes them, for tests that need hand-made files. */
export class Bytes {
  private readonly chunks: Uint8Array[] = [];

  private push(size: number, write: (view: DataView) => void): this {
    const chunk = new Uint8Array(size);
    write(new DataView(chunk.buffer));
    this.chunks.push(chunk);
    return this;
  }

  u8(v: number): this {
    return this.push(1, (d) => d.setUint8(0, v));
  }
  u16(v: number): this {
    return this.push(2, (d) => d.setUint16(0, v, true));
  }
  u32(v: number): this {
    return this.push(4, (d) => d.setUint32(0, v, true));
  }
  i32(v: number): this {
    return this.push(4, (d) => d.setInt32(0, v, true));
  }
  f32(v: number): this {
    return this.push(4, (d) => d.setFloat32(0, v, true));
  }
  zeros(n: number): this {
    this.chunks.push(new Uint8Array(n));
    return this;
  }
  /** n bytes counting up from `from`, so a reader that skips the wrong amount is noticed. */
  ramp(n: number, from = 0): this {
    this.chunks.push(Uint8Array.from({ length: n }, (_, i) => (from + i) & 0xff));
    return this;
  }
  raw(bytes: Uint8Array): this {
    this.chunks.push(bytes);
    return this;
  }
  build(): Uint8Array {
    const out = new Uint8Array(this.chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}
