import { ArWriter, BUNDLE_MARKER, MessageType, ProtocolError } from '@flyffweb/protocol';
import type { MoveReport, Vec3 } from '@flyffweb/protocol';

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

// The world server's side of each message the browser reads: the fields in the order the server writes them
// (`WORLDSERVER/User.cpp`), which is the order of the matching `CDPClient::On*` reader. `objectId` is the object
// the message is about (`GETID( pMover )`).

function scripted(objectId: number, type: number, fields: ArWriter): ScriptMessage {
  return { objectId, type, fields: fields.toBytes() };
}

/** The fields `CUserMng::AddMoverMoved` (`WORLDSERVER/User.cpp:4877`) and `AddMoverBehavior` (:4895) write. */
function moveFields(m: MoveReport): ArWriter {
  return new ArWriter().vec3(m.pos).vec3(m.delta).f32(m.angle).u32(m.state).u32(m.stateFlag).u32(m.motion)
    .i32(m.motionEx).i32(m.loop).u32(m.motionOption).i64(m.tick);
}

/** MOVERMOVED: `CUserMng::AddMoverMoved` (`WORLDSERVER/User.cpp:4877`). */
export function writeMoverMoved(objectId: number, move: MoveReport): ScriptMessage {
  return scripted(objectId, MessageType.MOVERMOVED, moveFields(move));
}

/** MOVERBEHAVIOR: `CUserMng::AddMoverBehavior` (`WORLDSERVER/User.cpp:4895`). */
export function writeMoverBehavior(objectId: number, move: MoveReport): ScriptMessage {
  return scripted(objectId, MessageType.MOVERBEHAVIOR, moveFields(move));
}

/** MOVERANGLE: `CUserMng::AddMoverAngle` (`WORLDSERVER/User.cpp:4952`). */
export function writeMoverAngle(
  objectId: number, pos: Vec3, delta: Vec3, angle: number, angleX: number, accPower: number, turnAngle: number,
  tick: bigint,
): ScriptMessage {
  return scripted(
    objectId, MessageType.MOVERANGLE,
    new ArWriter().vec3(pos).vec3(delta).f32(angle).f32(angleX).f32(accPower).f32(turnAngle).i64(tick),
  );
}

/** DESTPOS: `CUserMng::AddSetDestPos` (`WORLDSERVER/User.cpp:4743`, without the `__IAOBJ0622` object ID). */
export function writeDestPos(objectId: number, pos: Vec3, forward: boolean): ScriptMessage {
  return scripted(objectId, MessageType.DESTPOS, new ArWriter().vec3(pos).u8(forward ? 1 : 0));
}

/** DESTANGLE: `CUserMng::AddSetDestAngle` (`WORLDSERVER/User.cpp:4778`). */
export function writeDestAngle(objectId: number, angle: number, left: boolean): ScriptMessage {
  return scripted(objectId, MessageType.DESTANGLE, new ArWriter().f32(angle).u8(left ? 1 : 0));
}

/** MOVERSETDESTOBJ: `CUserMng::AddMoverSetDestObj` (`WORLDSERVER/User.cpp:4792`). */
export function writeSetDestObj(objectId: number, targetId: number, range: number): ScriptMessage {
  return scripted(objectId, MessageType.MOVERSETDESTOBJ, new ArWriter().u32(targetId).f32(range));
}

/** MOTION: `CUserMng::AddMotion` (`WORLDSERVER/User.cpp:4430`); `message` is an `OBJMSG`. */
export function writeMotion(objectId: number, message: number): ScriptMessage {
  return scripted(objectId, MessageType.MOTION, new ArWriter().u32(message));
}

/** SETPOS: `CUserMng::AddSetPos` (`WORLDSERVER/User.cpp:4678`). */
export function writeSetPos(objectId: number, pos: Vec3): ScriptMessage {
  return scripted(objectId, MessageType.SETPOS, new ArWriter().vec3(pos));
}

/** SETPOSANGLE: `CUserMng::AddSetPosAngle` (`WORLDSERVER/UserLux.cpp:333`). */
export function writeSetPosAngle(objectId: number, pos: Vec3, angle: number): ScriptMessage {
  return scripted(objectId, MessageType.SETPOSANGLE, new ArWriter().vec3(pos).f32(angle));
}

/** DEL_OBJ: `CUser::AddRemoveObj` (`WORLDSERVER/User.h:251`), which is `AddHdr` (`User.cpp:654`): no fields. */
export function writeDelObj(objectId: number): ScriptMessage {
  return scripted(objectId, MessageType.DEL_OBJ, new ArWriter());
}

/** WORLD_READINFO: `CUser::AddWorldReadInfo` (`WORLDSERVER/User.cpp:8635`). */
export function writeWorldReadInfo(objectId: number, worldId: number, pos: Vec3): ScriptMessage {
  return scripted(objectId, MessageType.WORLD_READINFO, new ArWriter().u32(worldId).vec3(pos));
}

/**
 * REPLACE: `CUser::AddReplace` (`WORLDSERVER/User.cpp:723`). The server writes `NULL_ID` as the object ID; the
 * script passes whatever it wants there.
 */
export function writeReplace(objectId: number, worldId: number, pos: Vec3): ScriptMessage {
  return scripted(objectId, MessageType.REPLACE, new ArWriter().u32(worldId).vec3(pos));
}
