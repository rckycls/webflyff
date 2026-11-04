// The item windows' packets and answers (2026-11-05, docs/superpowers/specs/2026-11-05-item-windows-research.md §3):
// name change, party and friend summons, tickets, element change, item transmute, monster summon, sex and face change.

import { describe, expect, it } from 'vitest';
import {
  ArReader, ArWriter, MessageType, NULL_ID, PacketType, WORLD_READERS, decodeWorldPacket, encodeChangeAttribute,
  encodeCreateMonster, encodeDoUseItemInput, encodeItemTransy, encodeQuerySetPlayerName, encodeSummonFriend,
  encodeSummonFriendCancel, encodeSummonFriendConfirm, encodeSummonParty, encodeSummonPartyConfirm, readBundle,
} from '../src';

const head = (bytes: Uint8Array): [ArReader, number] => {
  const r = new ArReader(bytes);
  expect(r.u32()).toBe(NULL_ID);
  return [r, r.u32()];
};

describe('the item windows\' packets', () => {
  it('QUERYSETPLAYERNAME: MAKELONG( objid, 0 ), the name', () => {
    const [r, type] = head(encodeQuerySetPlayerName(7, 'Webster'));
    expect(type).toBe(0x00000012);
    expect([r.u32(), r.string(64)]).toEqual([7, 'Webster']);
    r.expectEnd();
  });

  it('the summons: SUMMON_PARTY its scroll; the confirms the leader or summoner and the data; SUMMON_FRIEND a name', () => {
    let [r, type] = head(encodeSummonParty(9));
    expect([type, r.u32()]).toEqual([0xf000e003, 9]);
    [r, type] = head(encodeSummonPartyConfirm(1234, 9));
    expect([type, r.u32(), r.u32()]).toEqual([0xf000e004, 1234, 9]);
    [r, type] = head(encodeSummonFriend(9 << 16, 'Buddy'));
    expect([type, r.u32(), r.string(64)]).toEqual([0xf000e001, 9 << 16, 'Buddy']);
    [r, type] = head(encodeSummonFriendConfirm(1234, 77));
    expect([type, r.u32(), r.u32()]).toEqual([0xf000e002, 1234, 77]);
    [r, type] = head(encodeSummonFriendCancel(1234, 77));
    expect([type, r.u32(), r.u32()]).toEqual([0xf000e005, 1234, 77]);
  });

  it('DO_USE_ITEM_INPUT: MAKELONG( ITYPE_ITEM, objid ), the input', () => {
    const [r, type] = head(encodeDoUseItemInput(5, '-1'));
    expect([type, r.u32(), r.string(64)]).toEqual([0x8fffff00, 5 << 16, '-1']);
    r.expectEnd();
  });

  it('CHANGE_ATTRIBUTE, ITEMTRANSY and CREATEMONSTER', () => {
    let [r, type] = head(encodeChangeAttribute(12, 4, 3));
    expect([type, r.u32(), r.u32(), r.i32()]).toEqual([0xf000d00e, 12, 4, 3]);
    [r, type] = head(encodeItemTransy(12, 4, 503));
    expect([type, r.u32(), r.u32(), r.u32(), r.i32()]).toEqual([0xf000d00c, 12, 4, 503, 1]);
    [r, type] = head(encodeCreateMonster(6, [6970, 100.5, 3320]));
    expect([type, r.u32(), r.f32(), r.f32(), r.f32()]).toEqual([0x0000002a, 6 << 16, 6970, 100.5, 3320]);
    r.expectEnd();
  });

  it('the name change\'s answer is a packet of its own, to every client', () => {
    const body = new ArWriter().u32(PacketType.QUERYSETPLAYERNAME).u32(500).string('Webster').toBytes();
    expect(decodeWorldPacket(body)).toEqual({ type: 'setPlayerName', playerId: 500, name: 'Webster' });
  });
});

describe('the item windows\' answers', () => {
  it('SUMMON in its three kinds, SEX_CHANGE and CHANGEFACE, read to the bundle\'s end', () => {
    const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(0x1234).u16(5);
    w.u32(0x1234).u16(MessageType.SUMMON).u8(0x00).u32(9 << 16).u32(9);
    w.u32(0x1234).u16(MessageType.SUMMON).u8(0x01).u32(4321).u32(77).string('Leader').string('Flaris');
    w.u32(0x1234).u16(MessageType.SUMMON).u8(0x10).u32(4321).u32(9).string('Madrigal');
    w.u32(0x1234).u16(MessageType.SEX_CHANGE).u16(12);
    w.u32(NULL_ID).u16(MessageType.CHANGEFACE).u32(500).u32(3);
    const result = readBundle(w.toBytes(), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.messages.map((m) => m.value)).toEqual([
      { type: 'summon', kind: 'friendUse', data: 9 << 16, objectId: 9 },
      { type: 'summon', kind: 'friendConfirm', objectId: 4321, data: 77, name: 'Leader', world: 'Flaris' },
      { type: 'summon', kind: 'partyConfirm', objectId: 4321, data: 9, world: 'Madrigal' },
      { type: 'sexChange', index: 12 },
      { type: 'changeFace', playerId: 500, face: 3 },
    ]);
    expect([MessageType.SUMMON, MessageType.SEX_CHANGE, MessageType.CHANGEFACE]).toEqual([0x00ed, 0x00dc, 0x004d]);
  });
});
