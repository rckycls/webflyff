// 2026-11-10: the messenger's packets (friends-say research §6), read as Neuz's handlers read them and written as its
// senders write them.
import { describe, expect, it } from 'vitest';
import {
  ArReader, FriendMessageType, FriendPacket, WORLD_READERS, decodeWorldPacket, encodeAddFriend, encodeAddFriendNameRequest,
  encodeAddFriendRequest, encodeFriendCancel, encodeFriendIntercept, encodeGetFriendState, encodeRemoveFriend,
  encodeSetFriendState, friendPacketTypeOf, readBundle,
} from '../src/index';
import {
  directFriendIntercept, directFriendJoin, directFriendLogout, directFriendNameNotFound, directFriendNoIntercept,
  directFriendStates, directOneFriendState, directRemoveFriendState, directSay, directSetFriendState, encodeBundle,
  writeFriendAdded, writeFriendError, writeFriendGameJoin, writeFriendRemoved, writeFriendRequest, writeFriendRequestCancel,
} from '@flyffweb/testkit';

const SELF = 9;

describe('the messenger snapshots', () => {
  it('reads the list at log-in, an add, a request, a cancel, a removal and an error', () => {
    const bundle = encodeBundle(0xffffff00, SELF, [
      writeFriendGameJoin(SELF, 3, [{ playerId: 70002, blocked: false, state: 1 }, { playerId: 70003, blocked: true, state: 0 }]),
      writeFriendAdded(SELF, 70004, 'Newbie'),
      writeFriendRequest(SELF, 70005, 1, 6, 'Asker'),
      writeFriendRequestCancel(SELF),
      writeFriendRemoved(SELF, 70002),
      writeFriendError(SELF, 2, 'Nobody'),
    ]);
    const result = readBundle(bundle, WORLD_READERS);
    expect(result.mismatched).toEqual([]);
    expect(result.messages.map((m) => m.value)).toEqual([
      { type: 'friendList', state: 3, friends: [{ playerId: 70002, blocked: false, state: 1 }, { playerId: 70003, blocked: true, state: 0 }] },
      { type: 'friendAdded', playerId: 70004, name: 'Newbie' },
      { type: 'friendRequest', askerId: 70005, sex: 1, job: 6, name: 'Asker' },
      { type: 'friendRequestCancel' },
      { type: 'friendRemoved', playerId: 70002 },
      { type: 'friendError', error: 2, name: 'Nobody' },
    ]);
    for (const type of Object.values(FriendMessageType)) expect(WORLD_READERS.has(type)).toBe(true);
  });

  it('leaves the list empty past MAX_FRIEND, as CRTMessenger::Serialize returns early', () => {
    const bundle = encodeBundle(0xffffff00, SELF, [{ ...writeFriendGameJoin(SELF, 0, []), fields: Uint8Array.of(0, 0, 0, 0, 201, 0, 0, 0) }]);
    expect(readBundle(bundle, WORLD_READERS).messages[0]!.value).toEqual({ type: 'friendList', state: 0, friends: [] });
  });
});

describe("the core's direct packets", () => {
  it('reads each, and names its packet type back for the session', () => {
    const cases: Array<[Uint8Array, object]> = [
      [directFriendJoin(70002, 0, 2), { type: 'friendJoin', playerId: 70002, state: 0, channel: 2 }],
      [directFriendLogout(70002), { type: 'friendLogout', playerId: 70002 }],
      [directFriendStates([{ playerId: 70002, state: 3, channel: 1 }], [{ playerId: 70003, state: 1, channel: 0 }]),
        { type: 'friendStates', entries: [{ playerId: 70002, state: 3, channel: 1 }, { playerId: 70003, state: 1, channel: 0 }] }],
      [directSetFriendState(SELF, 4), { type: 'friendState', playerId: SELF, state: 4, one: false }],
      [directOneFriendState(70002, 5), { type: 'friendState', playerId: 70002, state: 5, one: true }],
      [directFriendIntercept(500, 70002), { type: 'friendIntercept', playerId: 500, friendId: 70002 }],
      [directFriendNoIntercept(70002, 0), { type: 'friendNoIntercept', playerId: 70002 }],
      [directFriendNameNotFound('Ghost'), { type: 'friendNameNotFound', name: 'Ghost' }],
      [directRemoveFriendState(70002), { type: 'friendRemovedState', playerId: 70002 }],
      [directSay('Lead', 'Webby', 'hi there', 70002, 500), { type: 'say', sender: 'Lead', recipient: 'Webby', text: 'hi there', fromId: 70002, toId: 500, search: 0 }],
    ];
    for (const [bytes, value] of cases) {
      const packet = decodeWorldPacket(bytes);
      expect(packet).toEqual(value);
      expect(friendPacketTypeOf(packet as Parameters<typeof friendPacketTypeOf>[0])).toBe(new DataView(bytes.buffer).getUint32(0, true));
    }
  });

  it('throws on a short body, as the other known packets do', () => {
    expect(() => decodeWorldPacket(directFriendJoin(1, 0, 0).slice(0, -1))).toThrow();
    expect(() => decodeWorldPacket(directSay('a', 'b', 'c', 1, 2).slice(0, -1))).toThrow();
  });
});

describe("the client's messenger packets", () => {
  const fields = (bytes: Uint8Array): ArReader => {
    const r = new ArReader(bytes);
    expect(r.u32()).toBe(0xffffffff);
    return r;
  };

  it('writes each as Neuz sends it, and the pretend server reads it back', () => {
    // SendAddFriend: the asker, oneself; the asker's BYTE sex, one's own; the asker's LONG job, one's own
    let r = fields(encodeAddFriend(70005, 500, 1, 0, 6, 1));
    expect([r.u32(), r.u32(), r.u32(), r.u8(), r.u8(), r.i32(), r.i32()]).toEqual([FriendPacket.ADDFRIEND, 70005, 500, 1, 0, 6, 1]);
    r.expectEnd();
    expect(decodeWorldPacket(encodeAddFriend(70005, 500, 1, 0, 6, 1))).toEqual(
      { type: 'addFriend', askerId: 70005, ownId: 500, askerSex: 1, ownSex: 0, askerJob: 6, ownJob: 1 });
    expect(decodeWorldPacket(encodeAddFriendRequest(500, 70002))).toEqual({ type: 'addFriendRequest', ownId: 500, targetId: 70002 });
    expect(decodeWorldPacket(encodeAddFriendNameRequest(500, 'Lead'))).toEqual({ type: 'addFriendNameRequest', ownId: 500, name: 'Lead' });
    expect(decodeWorldPacket(encodeFriendCancel(70005, 500))).toEqual({ type: 'friendCancel', askerId: 70005, ownId: 500 });
    expect(decodeWorldPacket(encodeGetFriendState(500))).toEqual({ type: 'getFriendState', ownId: 500 });
    expect(decodeWorldPacket(encodeSetFriendState(500, 3))).toEqual({ type: 'setFriendState', ownId: 500, state: 3 });
    expect(decodeWorldPacket(encodeFriendIntercept(500, 70002))).toEqual({ type: 'friendInterceptRequest', ownId: 500, friendId: 70002 });
    expect(decodeWorldPacket(encodeRemoveFriend(500, 70002))).toEqual({ type: 'removeFriendRequest', ownId: 500, friendId: 70002 });
    r = fields(encodeAddFriendNameRequest(500, 'Lead'));
    expect(r.u32()).toBe(FriendPacket.ADDFRIENDNAMEREQEST);
    expect(r.u32()).toBe(500);
    expect(r.string(64)).toBe('Lead');
    r.expectEnd();
  });
});
