import { ArWriter, BUNDLE_MARKER, ProtocolError } from '@flyffweb/protocol';

/** One message of a scripted bundle. `fields` are the bytes after the object ID and the type, built by the caller. */
export interface ScriptMessage {
  objectId: number;
  type: number;
  fields: Uint8Array;
}

/** The count is an `i16` (`short cb` in `CSnapshot`), so a bundle holds at most this many messages. */
const MAX_MESSAGES = 0x7fff;
/** Bytes of a message before its fields: the object ID (`u32`) and the type (`u16`). */
const MESSAGE_HEAD_SIZE = 6;

/**
 * Builds the body of a JOIN or SNAPSHOT the way the world server sends it (`CUser::Notify`,
 * `WORLDSERVER/User.cpp:585`, behind the world-snapshot-index patch): the packet type (`u32`), the player's
 * object ID (`u32`), the count (`i16`), then per message its object ID (`u32`), its type (`u16`) and its fields.
 * With `index` (the default) the table of contents follows the last message: each message's start counted from
 * byte 10 (`u32`), the count again (`u16`) and `BUNDLE_MARKER` (`u32`). `index: false` writes what an unpatched
 * world server sends, which the browser can only read in order.
 */
export function encodeBundle(
  packetType: number,
  playerObjectId: number,
  messages: readonly ScriptMessage[],
  options: { index?: boolean } = {},
): Uint8Array {
  if (messages.length > MAX_MESSAGES) {
    throw new ProtocolError(`a bundle holds at most ${MAX_MESSAGES} messages, not ${messages.length}`);
  }
  const w = new ArWriter().u32(packetType).u32(playerObjectId).u16(messages.length);
  const starts: number[] = [];
  let start = 0;
  for (const m of messages) {
    starts.push(start);
    w.u32(m.objectId).u16(m.type).bytes(m.fields);
    start += MESSAGE_HEAD_SIZE + m.fields.byteLength;
  }
  if (options.index ?? true) {
    for (const s of starts) w.u32(s);
    w.u16(messages.length).u32(BUNDLE_MARKER);
  }
  return w.toBytes();
}
