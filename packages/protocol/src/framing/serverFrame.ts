import { ProtocolError } from '../errors';

/** `'^'` then the body length. */
export const SERVER_HEADER_SIZE = 5;
const MARKER = 0x5e; // '^'
const DEFAULT_MAX_BODY_BYTES = 1048576;

/** Wraps a body the way a server frames what it sends: marker, length, body. There is no checksum this way. */
export function encodeServerFrame(body: Uint8Array): Uint8Array {
  const frame = new Uint8Array(SERVER_HEADER_SIZE + body.byteLength);
  const view = new DataView(frame.buffer);
  view.setUint8(0, MARKER);
  view.setUint32(1, body.byteLength, true);
  frame.set(body, SERVER_HEADER_SIZE);
  return frame;
}

/**
 * Splits a server-to-client TCP stream into bodies, however the network cut it: `push` takes any chunk (one
 * byte, half a header, ten frames) and returns the bodies completed by it, in order, keeping the rest for the
 * next call. The bodies are copies, so neither the caller's chunk nor later pushes can change them.
 *
 * Frames carry no checksum, so a lost marker or an absurd length is the only sign of a damaged stream. The
 * length is checked against `maxBodyBytes` from the header alone, so a bad length cannot make us buffer without
 * end. Errors carry the stream offset of the frame. After an error the stream is lost: the reader keeps
 * throwing, and bodies completed earlier in the same failing chunk are not returned.
 */
export class ServerFrameReader {
  private pending: Uint8Array = new Uint8Array(0);
  /** Stream offset of `pending[0]`: the bytes of all frames completed so far. */
  private offset = 0;
  private failure: ProtocolError | undefined;

  constructor(private readonly maxBodyBytes = DEFAULT_MAX_BODY_BYTES) {}

  push(chunk: Uint8Array): Uint8Array[] {
    if (this.failure) throw this.failure;
    // With nothing pending the chunk is read in place; only what is left over is copied.
    let data = chunk;
    if (this.pending.byteLength > 0) {
      data = new Uint8Array(this.pending.byteLength + chunk.byteLength);
      data.set(this.pending);
      data.set(chunk, this.pending.byteLength);
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const bodies: Uint8Array[] = [];
    let pos = 0;
    for (;;) {
      const available = data.byteLength - pos;
      if (available === 0) break;
      if (data[pos] !== MARKER) throw this.fail(`frame marker 0x5e expected, got 0x${data[pos].toString(16)}`, pos);
      if (available < SERVER_HEADER_SIZE) break;
      const length = view.getUint32(pos + 1, true);
      if (length > this.maxBodyBytes) {
        throw this.fail(`frame body of ${length} bytes exceeds the limit of ${this.maxBodyBytes}`, pos);
      }
      if (available < SERVER_HEADER_SIZE + length) break;
      // `new Uint8Array(view)` copies; `slice` would not on a Node Buffer, which returns a view of the same memory.
      bodies.push(new Uint8Array(data.subarray(pos + SERVER_HEADER_SIZE, pos + SERVER_HEADER_SIZE + length)));
      pos += SERVER_HEADER_SIZE + length;
    }
    this.pending = new Uint8Array(data.subarray(pos));
    this.offset += pos;
    return bodies;
  }

  /**
   * Records the failure for later pushes and returns it for the caller to throw. `pos` indexes the bytes being
   * parsed, which start at stream offset `offset`.
   */
  private fail(message: string, pos: number): ProtocolError {
    this.failure = new ProtocolError(message, this.offset + pos);
    this.pending = new Uint8Array(0);
    return this.failure;
  }
}
