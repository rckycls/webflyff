import { ArReader } from './ar/ArReader';
import { BUNDLE_MARKER } from './constants';
import { ProtocolError } from './errors';

/** Bytes before the first message: the packet type (`u32`), the player's object ID (`u32`) and the count (`i16`). */
const HEADER_SIZE = 10;
/** The smallest message: its object ID (`u32`) and its type (`u16`), with no fields. */
const MESSAGE_HEAD_SIZE = 6;
/** The table of contents without its starts: the count (`u16`) and the marker (`u32`). */
const TRAILER_FIXED_SIZE = 6;

/** What every message carries besides its fields, and the player's own object ID from the bundle header. */
export interface MessageHeader {
  objectId: number;
  playerObjectId: number;
}

/**
 * Reads the fields of one message type, the way the matching `CDPClient::On*` handler does. `r` starts at the
 * message's first field. In a bundle with a table of contents it ends at the message's end, so a reader that
 * stops short or reads past it is `mismatched`; a reader that means to stop short calls `r.skipRest()`.
 * Without a table `r` covers the rest of the bundle and the next message starts where the reader stopped.
 */
export type MessageReader<T> = (r: ArReader, header: MessageHeader) => T;

export interface BundleMessage<T> {
  objectId: number;
  type: number;
  value: T;
}

export interface BundleResult<T> {
  /** `objidPlayer`: the object ID of the player the bundle is for. */
  playerObjectId: number;
  /** True when the bundle had a valid table of contents. */
  indexed: boolean;
  /** The messages read, in bundle order. With a table, only those whose reader ended exactly at the message's end. */
  messages: BundleMessage<T>[];
  /** Types with no reader, in order. Without a table the first of them ends the bundle, so it is the last entry. */
  skipped: number[];
  /** Types whose reader did not end exactly at the message's end, or ran out of bytes; their message is dropped. */
  mismatched: number[];
  /** Without a table: the type where reading had to stop (no reader, or a reader that ran out). Else `null`. */
  stoppedAt: number | null;
}

/**
 * Splits a JOIN or SNAPSHOT body into its messages and reads each with the reader registered for its type. This
 * is `CDPClient::OnSnapshot` (`Neuz/DPClient.cpp:366`, which `OnJoin`, :897, calls for the whole body): the object
 * ID of the player (`u32`) and the count (`short`), then per message its object ID (`u32`), its type (`WORD`) and
 * its fields. The packet type in front of them is not looked at here; `decodeWorldPacket` has told the two apart.
 *
 * The C++ has no length per message and asserts on a type it does not know, so it cannot skip a message. The
 * world server's world-snapshot-index patch appends a table of contents after the last message (the start of
 * each message counted from byte 10, `u16` count, `u32` `BUNDLE_MARKER`), and with it every message has its own
 * bounds:
 * - The table is valid when the count in the trailer equals the header's, the first start is 0, each start is at
 *   least 6 bytes (an object ID and a type) after the one before, and the last is at least 6 bytes before the
 *   trailer. Message *i* runs from its start to the next one; the last ends where the trailer begins.
 * - A body that ends with the marker but breaks one of those rules, or that is too short for its header, throws a
 *   ProtocolError: the header or trailer is broken and nothing in the bundle can be trusted.
 * - A type with no reader goes to `skipped` and a reader that does not end at its message's end (or throws a
 *   ProtocolError, meaning it ran out of bytes) to `mismatched`; reading goes on with the next message. Any other
 *   error a reader throws is a bug and propagates.
 *
 * Without the marker (a world server that was not patched) the bundle is read in order, each reader taking
 * what it needs from the rest of the bundle. The bundle ends at the first type with no reader (`stoppedAt`, and
 * also the last of `skipped`), at a reader that throws a ProtocolError (`mismatched` and `stoppedAt`), or at a
 * reader that called `skipRest()` or used up the data. A bundle that ends inside a message's object ID or type
 * throws a ProtocolError. Messages after the last counted one are not read, as in the C++.
 */
export function readBundle<T>(body: Uint8Array, readers: ReadonlyMap<number, MessageReader<T>>): BundleResult<T> {
  if (body.byteLength < HEADER_SIZE) {
    throw new ProtocolError(
      `bundle is ${body.byteLength} bytes, shorter than its ${HEADER_SIZE}-byte header`,
      body.byteLength,
    );
  }
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const playerObjectId = view.getUint32(4, true);
  const count = view.getInt16(8, true);
  if (count < 0) throw new ProtocolError(`bundle count ${count} is negative`, 8);

  const result: BundleResult<T> = {
    playerObjectId, indexed: false, messages: [], skipped: [], mismatched: [], stoppedAt: null,
  };
  const table = findTable(view, count);
  if (table === undefined) {
    readInOrder(body, count, readers, result);
  } else {
    result.indexed = true;
    readIndexed(body, view, table, readers, result);
  }
  return result;
}

interface Table {
  /** Each message's start, counted from byte 10 of the body. */
  starts: number[];
  /** Where the table begins, which is where the last message ends. */
  at: number;
}

/**
 * The table of contents, or `undefined` when the body does not end with the marker. A table that breaks a rule
 * throws; the offset in the error is the table entry that does.
 */
function findTable(view: DataView, count: number): Table | undefined {
  const length = view.byteLength;
  if (view.getUint32(length - 4, true) !== BUNDLE_MARKER) return undefined;

  const trailerCount = view.getUint16(length - TRAILER_FIXED_SIZE, true);
  if (trailerCount !== count) {
    throw new ProtocolError(
      `table counts ${trailerCount} messages but the header counts ${count}`,
      length - TRAILER_FIXED_SIZE,
    );
  }
  const at = length - TRAILER_FIXED_SIZE - 4 * count;
  if (at < HEADER_SIZE) {
    throw new ProtocolError(
      `table of ${count} messages does not fit in a ${length}-byte bundle`,
      length - TRAILER_FIXED_SIZE,
    );
  }
  const starts: number[] = [];
  for (let i = 0; i < count; i++) starts.push(view.getUint32(at + 4 * i, true));

  if (count > 0 && starts[0] !== 0) {
    throw new ProtocolError(`first message starts at ${starts[0]}, not 0`, at);
  }
  for (let i = 1; i < count; i++) {
    if (starts[i] < starts[i - 1] + MESSAGE_HEAD_SIZE) {
      throw new ProtocolError(
        `message ${i} starts at ${starts[i]}, less than ${MESSAGE_HEAD_SIZE} bytes after message ${i - 1}`,
        at + 4 * i,
      );
    }
  }
  if (count > 0 && starts[count - 1] > at - HEADER_SIZE - MESSAGE_HEAD_SIZE) {
    throw new ProtocolError(
      `last message starts at ${starts[count - 1]}, less than ${MESSAGE_HEAD_SIZE} bytes before the table`,
      at + 4 * (count - 1),
    );
  }
  return { starts, at };
}

function readIndexed<T>(
  body: Uint8Array,
  view: DataView,
  table: Table,
  readers: ReadonlyMap<number, MessageReader<T>>,
  result: BundleResult<T>,
): void {
  const { starts } = table;
  for (let i = 0; i < starts.length; i++) {
    // The rules of the table leave every message at least MESSAGE_HEAD_SIZE bytes, so these reads fit.
    const from = HEADER_SIZE + starts[i];
    const to = i + 1 < starts.length ? HEADER_SIZE + starts[i + 1] : table.at;
    const objectId = view.getUint32(from, true);
    const type = view.getUint16(from + 4, true);
    const reader = readers.get(type);
    if (reader === undefined) {
      result.skipped.push(type);
      continue;
    }
    const r = new ArReader(body.subarray(from + MESSAGE_HEAD_SIZE, to));
    let value: T;
    try {
      value = reader(r, { objectId, playerObjectId: result.playerObjectId });
    } catch (error) {
      if (!(error instanceof ProtocolError)) throw error;
      result.mismatched.push(type);
      continue;
    }
    if (r.remaining() !== 0) {
      result.mismatched.push(type);
      continue;
    }
    result.messages.push({ objectId, type, value });
  }
}

function readInOrder<T>(
  body: Uint8Array,
  count: number,
  readers: ReadonlyMap<number, MessageReader<T>>,
  result: BundleResult<T>,
): void {
  const r = new ArReader(body.subarray(HEADER_SIZE));
  for (let i = 0; i < count; i++) {
    const objectId = r.u32();
    const type = r.u16();
    const reader = readers.get(type);
    if (reader === undefined) {
      result.skipped.push(type);
      result.stoppedAt = type;
      return;
    }
    let value: T;
    try {
      value = reader(r, { objectId, playerObjectId: result.playerObjectId });
    } catch (error) {
      if (!(error instanceof ProtocolError)) throw error;
      result.mismatched.push(type);
      result.stoppedAt = type;
      return;
    }
    result.messages.push({ objectId, type, value });
    // A reader that called skipRest() ends the bundle; so does one that used up the data.
    if (r.remaining() === 0) return;
  }
}
