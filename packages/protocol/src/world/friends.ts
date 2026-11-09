// The messenger's packets (2026-11-10, friends-say research §6): the friend list `CRTMessenger` (`__RT_1025`) and the
// `/say` private message, both ways. The reads copy Neuz's handlers; the writes copy its senders.
//
//   snapshots   CDPClient::OnFriendGameJoin   Neuz/DPClient.cpp:7849-7884   ADDFRIENDGAMEJOIN 0x0074: CRTMessenger::Serialize
//                                                                         (`_Common/rtmessenger.cpp:36-69`): DWORD own state,
//                                                                         int n, n x (u_long id, Friend{BOOL bBlock; DWORD
//                                                                         dwState}) written raw (8 bytes)
//               OnAddFriend                   :7886-7915                    ADDFRIEND 0x0070: id, name (MAX_PLAYER)
//               OnAddFriendReqest             :7935-7973                    ADDFRIENDREQEST 0x0071: id, BYTE sex, LONG job, name
//               OnAddFriendCancel             :7975-7979                    ADDFRIENDCANCEL 0x0072: nothing
//               OnRemoveFriend                :7917-7932                    REMOVEFRIEND 0x0075: id
//               OnAddFriendError              :7981-7994                    ADDFRIENDERROR 0x0076: BYTE error, name (64)
//   direct      OnFriendJoin                  :8026-8053                    ADDFRIENDJOIN: id, state, channel
//               OnFriendLogOut                :8090-8104                    ADDFRIENDLOGOUT: id
//               OnGetFriendState              :8217-8278                    GETFRIENDSTATE: n, nBlock, (n + nBlock) x (id, state,
//                                                                         channel)
//               OnSetFriendState              :8280-8315                    SETFRIENDSTATE: id, state
//               OnFriendIntercept             :8148-8170                    FRIENDINTERCEPTSTATE: id, friend
//               OnFriendNoIntercept           :8121-8131                    FRIENDNOINTERCEPT: id (and the core's state, which
//                                                                         the `__RT_1025` reader leaves: `DPCacheSrvr.cpp:515-527`)
//               OnAddFriendNotConnect         :7996-8004                    ADDFRIENDNAMENOTFOUND: name (64)
//               OnRemoveFriendState           :8006-8024                    REMOVEFRIENDSTATE: id
//               OnOneFriendState              :8317-8334                    ONEFRIEMDSTATE: id, state
//               OnSay                         :11911-12074                  SAY: as WHISPER (`DPCacheSrvr.cpp:266-279`)
//   senders     SendAddFriend ... SendBlock   :11033-11162

import type { ArReader } from '../ar/ArReader';
import { chatBytes } from './chat';
import { clientPacket } from './packet';

/** The messenger's packet types (`Source/_Network/MsgHdr.h:200, :360-374`). */
export const FriendPacket = {
  SAY: 0x00ff00e0,
  ADDFRIEND: 0xffffff60,
  ADDFRIENDREQEST: 0xffffff61,
  ADDFRIENDCANCEL: 0xffffff62,
  GETFRIENDSTATE: 0xffffff64,
  ADDFRIENDJOIN: 0xffffff65,
  ADDFRIENDLOGOUT: 0xffffff66,
  SETFRIENDSTATE: 0xffffff67,
  FRIENDINTERCEPTSTATE: 0xffffff68,
  FRIENDNOINTERCEPT: 0xffffff69,
  REMOVEFRIEND: 0xffffff6a,
  ADDFRIENDNAMEREQEST: 0xffffff6b,
  ADDFRIENDNAMENOTFOUND: 0xffffff6c,
  REMOVEFRIENDSTATE: 0xffffff6d,
  ONEFRIEMDSTATE: 0xffffff6e,
} as const;

/** The messenger's snapshot types (`MsgHdr.h:1017-1024`). */
export const FriendMessageType = {
  ADDFRIEND: 0x0070,
  ADDFRIENDREQEST: 0x0071,
  ADDFRIENDCANCEL: 0x0072,
  ADDFRIENDGAMEJOIN: 0x0074,
  REMOVEFRIEND: 0x0075,
  ADDFRIENDERROR: 0x0076,
} as const;

/** `MAX_FRIEND` (`_Common/messenger.h:20`): more is not read (`CRTMessenger::Serialize`, `rtmessenger.cpp:55-56`). */
export const MAX_FRIEND = 200;

/** One friend of `CRTMessenger`: its id, `bBlock` and `dwState`. */
export interface FriendEntry {
  playerId: number;
  blocked: boolean;
  state: number;
}

/** One line of GETFRIENDSTATE: the friend, its state and its channel (`uIdofMulti`, which the client drops). */
export interface FriendStateEntry {
  playerId: number;
  state: number;
  channel: number;
}

export type FriendMessage =
  | { type: 'friendList'; state: number; friends: FriendEntry[] }
  | { type: 'friendAdded'; playerId: number; name: string }
  | { type: 'friendRequest'; askerId: number; sex: number; job: number; name: string }
  | { type: 'friendRequestCancel' }
  | { type: 'friendRemoved'; playerId: number }
  | { type: 'friendError'; error: number; name: string }
  | { type: 'friendJoin'; playerId: number; state: number; channel: number }
  | { type: 'friendLogout'; playerId: number }
  | { type: 'friendStates'; entries: FriendStateEntry[] }
  | { type: 'friendState'; playerId: number; state: number; one: boolean }
  | { type: 'friendIntercept'; playerId: number; friendId: number }
  | { type: 'friendNoIntercept'; playerId: number }
  | { type: 'friendNameNotFound'; name: string }
  | { type: 'friendRemovedState'; playerId: number }
  | { type: 'say'; sender: string; recipient: string; text: string; fromId: number; toId: number; search: number };

/** The messenger's direct packets (not in a snapshot). */
export type FriendDirectMessage = Exclude<FriendMessage, { type: 'friendList' | 'friendAdded' | 'friendRequest' | 'friendRequestCancel' | 'friendRemoved' | 'friendError' }>;

// --- snapshots ---

/** ADDFRIENDGAMEJOIN: a count over `MAX_FRIEND` leaves the list empty, as the client's `Serialize` returns early. */
export function readFriendGameJoin(r: ArReader): Extract<FriendMessage, { type: 'friendList' }> {
  const state = r.u32();
  const count = r.i32();
  const friends: FriendEntry[] = [];
  if (count > MAX_FRIEND || count < 0) return { type: 'friendList', state, friends };
  for (let i = 0; i < count; i++) {
    const playerId = r.u32();
    const blocked = r.i32() !== 0;
    friends.push({ playerId, blocked, state: r.u32() });
  }
  return { type: 'friendList', state, friends };
}

export const readFriendAdded = (r: ArReader): FriendMessage => ({ type: 'friendAdded', playerId: r.u32(), name: r.string(42) });

export function readFriendRequest(r: ArReader): FriendMessage {
  const askerId = r.u32();
  const sex = r.u8();
  const job = r.i32();
  return { type: 'friendRequest', askerId, sex, job, name: r.string(64) };
}

export const readFriendRequestCancel = (): FriendMessage => ({ type: 'friendRequestCancel' });
export const readFriendRemoved = (r: ArReader): FriendMessage => ({ type: 'friendRemoved', playerId: r.u32() });

export function readFriendError(r: ArReader): FriendMessage {
  const error = r.u8();
  return { type: 'friendError', error, name: r.string(64) };
}

// --- direct packets (from the core) ---

/**
 * A direct messenger packet after its type, or null for another type. Each reads its whole body (`decodeWorldPacket`
 * checks the end).
 */
export function readFriendPacket(packetType: number, r: ArReader): FriendDirectMessage | null {
  switch (packetType) {
    case FriendPacket.ADDFRIENDJOIN:
      return { type: 'friendJoin', playerId: r.u32(), state: r.u32(), channel: r.u32() };
    case FriendPacket.ADDFRIENDLOGOUT:
      return { type: 'friendLogout', playerId: r.u32() };
    case FriendPacket.GETFRIENDSTATE: {
      const count = r.i32();
      const blocked = r.i32();
      if (count < 0 || blocked < 0 || count + blocked > MAX_FRIEND) throw new RangeError('Invalid friend state count.');
      const entries = Array.from({ length: count + blocked }, () => ({ playerId: r.u32(), state: r.u32(), channel: r.u32() }));
      return { type: 'friendStates', entries };
    }
    case FriendPacket.SETFRIENDSTATE:
      return { type: 'friendState', playerId: r.u32(), state: r.u32(), one: false };
    case FriendPacket.ONEFRIEMDSTATE:
      return { type: 'friendState', playerId: r.u32(), state: r.u32(), one: true };
    case FriendPacket.FRIENDINTERCEPTSTATE:
      return { type: 'friendIntercept', playerId: r.u32(), friendId: r.u32() };
    case FriendPacket.FRIENDNOINTERCEPT: {
      const playerId = r.u32();
      if (r.remaining() >= 4) r.i32();
      return { type: 'friendNoIntercept', playerId };
    }
    case FriendPacket.ADDFRIENDNAMENOTFOUND:
      return { type: 'friendNameNotFound', name: r.string(64) };
    case FriendPacket.REMOVEFRIENDSTATE:
      return { type: 'friendRemovedState', playerId: r.u32() };
    case FriendPacket.SAY:
      return {
        type: 'say', sender: r.string(42), recipient: r.string(42), text: r.string(260), fromId: r.u32(), toId: r.u32(),
        search: r.i32(),
      };
    default:
      return null;
  }
}

/** The direct packet type of a direct messenger message, for the session to hand it on as the chat's are. */
export function friendPacketTypeOf(message: FriendDirectMessage): number {
  switch (message.type) {
    case 'friendJoin': return FriendPacket.ADDFRIENDJOIN;
    case 'friendLogout': return FriendPacket.ADDFRIENDLOGOUT;
    case 'friendStates': return FriendPacket.GETFRIENDSTATE;
    case 'friendState': return message.one ? FriendPacket.ONEFRIEMDSTATE : FriendPacket.SETFRIENDSTATE;
    case 'friendIntercept': return FriendPacket.FRIENDINTERCEPTSTATE;
    case 'friendNoIntercept': return FriendPacket.FRIENDNOINTERCEPT;
    case 'friendNameNotFound': return FriendPacket.ADDFRIENDNAMENOTFOUND;
    case 'friendRemovedState': return FriendPacket.REMOVEFRIENDSTATE;
    case 'say': return FriendPacket.SAY;
  }
}

// --- the client's packets ---

/** `SendAddFriend( uidPlayer, nJob, nSex )`: the Confirm window's Yes (`WndFriendConFirm.cpp:94-99`). */
export const encodeAddFriend = (askerId: number, ownId: number, askerSex: number, ownSex: number, askerJob: number, ownJob: number): Uint8Array =>
  clientPacket(FriendPacket.ADDFRIEND).u32(askerId).u32(ownId).u8(askerSex).u8(ownSex).i32(askerJob).i32(ownJob).toBytes();

/** `SendAddFriendReqest`: "Add to my list" in a player's menu (`WndWorld.cpp:5153`). */
export const encodeAddFriendRequest = (ownId: number, targetId: number): Uint8Array =>
  clientPacket(FriendPacket.ADDFRIENDREQEST).u32(ownId).u32(targetId).toBytes();

/** `SendAddFriendNameReqest`: the Add Friend window's OK (`WndFriendConFirm.cpp:191`): the own id, then the name. */
export function encodeAddFriendNameRequest(ownId: number, name: string): Uint8Array {
  const bytes = chatBytes(name, 63);
  return clientPacket(FriendPacket.ADDFRIENDNAMEREQEST).u32(ownId).i32(bytes.length).bytes(bytes).toBytes();
}

/** `SendFriendCancel`: the Confirm window's No. */
export const encodeFriendCancel = (askerId: number, ownId: number): Uint8Array =>
  clientPacket(FriendPacket.ADDFRIENDCANCEL).u32(askerId).u32(ownId).toBytes();

export const encodeGetFriendState = (ownId: number): Uint8Array =>
  clientPacket(FriendPacket.GETFRIENDSTATE).u32(ownId).toBytes();

/** `SendSetState( state )`: the own state from the state menu (`WndMessenger.cpp:844-848`). */
export const encodeSetFriendState = (ownId: number, state: number): Uint8Array =>
  clientPacket(FriendPacket.SETFRIENDSTATE).u32(ownId).i32(state).toBytes();

/** `SendFriendInterceptState`: Block / Unblock, a toggle on the core. */
export const encodeFriendIntercept = (ownId: number, friendId: number): Uint8Array =>
  clientPacket(FriendPacket.FRIENDINTERCEPTSTATE).u32(ownId).u32(friendId).toBytes();

export const encodeRemoveFriend = (ownId: number, friendId: number): Uint8Array =>
  clientPacket(FriendPacket.REMOVEFRIEND).u32(ownId).u32(friendId).toBytes();

/** For the pretend servers: a client packet of the messenger after its type, or null for another type. */
export type FriendRequestPacket =
  | { type: 'addFriend'; askerId: number; ownId: number; askerSex: number; ownSex: number; askerJob: number; ownJob: number }
  | { type: 'addFriendRequest'; ownId: number; targetId: number }
  | { type: 'addFriendNameRequest'; ownId: number; name: string }
  | { type: 'friendCancel'; askerId: number; ownId: number }
  | { type: 'getFriendState'; ownId: number }
  | { type: 'setFriendState'; ownId: number; state: number }
  | { type: 'friendInterceptRequest'; ownId: number; friendId: number }
  | { type: 'removeFriendRequest'; ownId: number; friendId: number };

export function readFriendRequestPacket(packetType: number, r: ArReader): FriendRequestPacket | null {
  switch (packetType) {
    case FriendPacket.ADDFRIEND: {
      const askerId = r.u32(), ownId = r.u32(), askerSex = r.u8(), ownSex = r.u8(), askerJob = r.i32(), ownJob = r.i32();
      return { type: 'addFriend', askerId, ownId, askerSex, ownSex, askerJob, ownJob };
    }
    case FriendPacket.ADDFRIENDREQEST:
      return { type: 'addFriendRequest', ownId: r.u32(), targetId: r.u32() };
    case FriendPacket.ADDFRIENDNAMEREQEST:
      return { type: 'addFriendNameRequest', ownId: r.u32(), name: r.string(64) };
    case FriendPacket.ADDFRIENDCANCEL:
      return { type: 'friendCancel', askerId: r.u32(), ownId: r.u32() };
    case FriendPacket.GETFRIENDSTATE:
      return { type: 'getFriendState', ownId: r.u32() };
    case FriendPacket.SETFRIENDSTATE:
      return { type: 'setFriendState', ownId: r.u32(), state: r.i32() };
    case FriendPacket.FRIENDINTERCEPTSTATE:
      return { type: 'friendInterceptRequest', ownId: r.u32(), friendId: r.u32() };
    case FriendPacket.REMOVEFRIEND:
      return { type: 'removeFriendRequest', ownId: r.u32(), friendId: r.u32() };
    default:
      return null;
  }
}

