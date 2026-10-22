import { ProtocolError } from '../errors';
import { crc32 } from './crc32';

/** `'^'`, checksum of the length, the length, checksum of the body. */
export const CLIENT_HEADER_SIZE = 13;
const MARKER = 0x5e; // '^'

/** `~(crc32(bytes) ^ protocolId)`, as an unsigned number (`buffer.cpp`, both header checksums). */
function checksum(bytes: Uint8Array, protocolId: number): number {
  return ~(crc32(bytes) ^ protocolId) >>> 0;
}

/**
 * Wraps a body the way `CBuffer` frames what a client sends: marker, checksum of the 4 length bytes, the length,
 * checksum of the body (both checksums mixed with the server's protocol ID), then the body. These servers add no
 * packet counter. `protocolId` wraps to 32 bits like a C++ cast.
 */
export function encodeClientFrame(body: Uint8Array, protocolId: number): Uint8Array {
  const frame = new Uint8Array(CLIENT_HEADER_SIZE + body.byteLength);
  const view = new DataView(frame.buffer);
  view.setUint8(0, MARKER);
  view.setUint32(5, body.byteLength, true);
  view.setUint32(1, checksum(frame.subarray(5, 9), protocolId), true);
  view.setUint32(9, checksum(body, protocolId), true);
  frame.set(body, CLIENT_HEADER_SIZE);
  return frame;
}

/**
 * Splits a client-to-server TCP stream into bodies, however the network cut it: `push` takes any chunk (one
 * byte, half a header, ten frames) and returns the bodies completed by it, in order, keeping the rest for the
 * next call. The bodies are copies, so neither the caller's chunk nor later pushes can change them.
 *
 * Both checksums are verified. The length checksum is checked before the body is awaited, so a corrupt length
 * (or a wrong protocol ID) fails at once instead of buffering up to 4 GiB. Errors carry the stream offset of
 * the frame. After an error the stream is lost: the reader keeps throwing, and bodies completed earlier in
 * the same failing chunk are not returned.
 */
export class ClientFrameReader {
  private pending: Uint8Array = new Uint8Array(0);
  /** Stream offset of `pending[0]`: the bytes of all frames completed so far. */
  private offset = 0;
  private failure: ProtocolError | undefined;

  constructor(private readonly protocolId: number) {}

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
      if (available < CLIENT_HEADER_SIZE) break;
      const length = view.getUint32(pos + 5, true);
      if (view.getUint32(pos + 1, true) !== checksum(data.subarray(pos + 5, pos + 9), this.protocolId)) {
        throw this.fail('frame header checksum mismatch (wrong protocol ID or corrupt data)', pos);
      }
      if (available < CLIENT_HEADER_SIZE + length) break;
      // `new Uint8Array(view)` copies; `slice` would not on a Node Buffer, which returns a view of the same memory.
      const body = new Uint8Array(data.subarray(pos + CLIENT_HEADER_SIZE, pos + CLIENT_HEADER_SIZE + length));
      if (view.getUint32(pos + 9, true) !== checksum(body, this.protocolId)) {
        throw this.fail('frame body checksum mismatch', pos);
      }
      bodies.push(body);
      pos += CLIENT_HEADER_SIZE + length;
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
