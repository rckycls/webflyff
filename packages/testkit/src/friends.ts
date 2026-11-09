// 2026-11-10: the messenger's messages as the servers write them (friends-say research §6): the world server's
// snapshots (`WORLDSERVER/User.cpp`) and the core's direct packets (`CORESERVER/DPCacheSrvr.cpp`), in the order of the
// readers (`@flyffweb/protocol` world/friends.ts).

import { ArWriter, FriendMessageType, FriendPacket } from '@flyffweb/protocol';
import type { FriendEntry, FriendStateEntry } from '@flyffweb/protocol';
import type { ScriptMessage } from './world';

const scripted = (objectId: number, type: number, w: ArWriter): ScriptMessage => ({ objectId, type, fields: w.toBytes() });

/** ADDFRIENDGAMEJOIN: `CUser::AddFriendGameJoin` (`User.cpp:1464-1476`), `CRTMessenger::Serialize`'s store. */
export function writeFriendGameJoin(objectId: number, state: number, friends: readonly FriendEntry[]): ScriptMessage {
  const w = new ArWriter().u32(state).i32(friends.length);
  for (const friend of friends) w.u32(friend.playerId).i32(friend.blocked ? 1 : 0).u32(friend.state);
  return scripted(objectId, FriendMessageType.ADDFRIENDGAMEJOIN, w);
}

/** ADDFRIEND: `CUser::AddAddFriend` (`User.cpp:1657-1674`). */
export const writeFriendAdded = (objectId: number, playerId: number, name: string): ScriptMessage =>
  scripted(objectId, FriendMessageType.ADDFRIEND, new ArWriter().u32(playerId).string(name));

/** ADDFRIENDREQEST: `CUser::AddFriendReqest` (`User.cpp:1543-1555`): the asker's id, sex, job, name. */
export const writeFriendRequest = (objectId: number, askerId: number, sex: number, job: number, name: string): ScriptMessage =>
  scripted(objectId, FriendMessageType.ADDFRIENDREQEST, new ArWriter().u32(askerId).u8(sex).i32(job).string(name));

export const writeFriendRequestCancel = (objectId: number): ScriptMessage =>
  scripted(objectId, FriendMessageType.ADDFRIENDCANCEL, new ArWriter());

export const writeFriendRemoved = (objectId: number, playerId: number): ScriptMessage =>
  scripted(objectId, FriendMessageType.REMOVEFRIEND, new ArWriter().u32(playerId));

export const writeFriendError = (objectId: number, error: number, name: string): ScriptMessage =>
  scripted(objectId, FriendMessageType.ADDFRIENDERROR, new ArWriter().u8(error).string(name));

// The core's direct packets, whole, for `gateway.pushCache`: the type, then the fields.

export const directFriendJoin = (playerId: number, state: number, channel: number): Uint8Array =>
  new ArWriter().u32(FriendPacket.ADDFRIENDJOIN).u32(playerId).u32(state).u32(channel).toBytes();
export const directFriendLogout = (playerId: number): Uint8Array =>
  new ArWriter().u32(FriendPacket.ADDFRIENDLOGOUT).u32(playerId).toBytes();
/** GETFRIENDSTATE (`CDPCacheSrvr::SendFriendState`, `DPCacheSrvr.cpp:294-...`): the unblocked first, then the blocked. */
export function directFriendStates(friends: readonly FriendStateEntry[], blocked: readonly FriendStateEntry[] = []): Uint8Array {
  const w = new ArWriter().u32(FriendPacket.GETFRIENDSTATE).i32(friends.length).i32(blocked.length);
  for (const entry of [...friends, ...blocked]) w.u32(entry.playerId).u32(entry.state).u32(entry.channel);
  return w.toBytes();
}
export const directSetFriendState = (playerId: number, state: number): Uint8Array =>
  new ArWriter().u32(FriendPacket.SETFRIENDSTATE).u32(playerId).u32(state).toBytes();
export const directOneFriendState = (playerId: number, state: number): Uint8Array =>
  new ArWriter().u32(FriendPacket.ONEFRIEMDSTATE).u32(playerId).u32(state).toBytes();
export const directFriendIntercept = (playerId: number, friendId: number): Uint8Array =>
  new ArWriter().u32(FriendPacket.FRIENDINTERCEPTSTATE).u32(playerId).u32(friendId).toBytes();
/** FRIENDNOINTERCEPT with the core's state after the id (`DPCacheSrvr.cpp:525-527`). */
export const directFriendNoIntercept = (playerId: number, state = 0): Uint8Array =>
  new ArWriter().u32(FriendPacket.FRIENDNOINTERCEPT).u32(playerId).i32(state).toBytes();
export const directFriendNameNotFound = (name: string): Uint8Array =>
  new ArWriter().u32(FriendPacket.ADDFRIENDNAMENOTFOUND).string(name).toBytes();
export const directRemoveFriendState = (playerId: number): Uint8Array =>
  new ArWriter().u32(FriendPacket.REMOVEFRIENDSTATE).u32(playerId).toBytes();

/** SAY (`CDPCacheSrvr::SendSay`, `DPCacheSrvr.cpp:266-279`); `search` 1 is "not on" (empty names and text). */
export const directSay = (sender: string, recipient: string, text: string, fromId: number, toId: number, search = 0): Uint8Array =>
  new ArWriter().u32(FriendPacket.SAY).string(sender).string(recipient).string(text).u32(fromId).u32(toId).i32(search).toBytes();

/** WHISPER (`DPCacheSrvr.cpp:251-264`), the same fields. */
export const directWhisper = (sender: string, recipient: string, text: string, fromId: number, toId: number, search = 0): Uint8Array =>
  new ArWriter().u32(0x00ff00d4).string(sender).string(recipient).string(text).u32(fromId).u32(toId).i32(search).toBytes();
