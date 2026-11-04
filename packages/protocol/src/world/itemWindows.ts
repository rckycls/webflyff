// The item windows' packets and answers (2026-11-05, docs/superpowers/specs/2026-11-05-item-windows-research.md §3):
//
//   CDPClient::SendQuerySetPlayerName     Neuz/DPClient.cpp:15598-15604   QUERYSETPLAYERNAME 0x12: DWORD, string
//   CDPClient::OnSetPlayerName            DPClient.cpp:15606-15670        the answer, a packet of its own: u_long, string
//   CDPClient::SendSummonParty ...        DPClient.cpp:15562-15568 ...    SUMMON_* 0xf000e001-e005
//   CDPClient::OnSummon                   DPClient.cpp:16080-16160        SUMMON 0x00ed: BYTE kind, then its fields
//   CDPClient::SendDoUseItemInput         DPClient.cpp:18430-18437        DO_USE_ITEM_INPUT 0x8fffff00: DWORD, string
//   CDPClient::SendChangeAttribute        DPClient.cpp:14797              CHANGE_ATTRIBUTE 0xf000d00e: OBJID, OBJID, int
//   CDPClient::SendItemTransy             DPClient.cpp:14834-14846        ITEMTRANSY 0xf000d00c: OBJID, OBJID, DWORD, BOOL
//   CDPClient::SendCreateMonster          DPClient.cpp:15831-15837        CREATEMONSTER 0x2a: DWORD, D3DXVECTOR3
//   CDPClient::OnSexChange, OnChangeFace  DPClient.cpp:14961, 6722        SEX_CHANGE 0x00dc, CHANGEFACE 0x004d

import type { ArReader } from '../ar/ArReader';
import { PacketType } from '../constants';
import type { Vec3 } from '../constants';
import { clientPacket } from './packet';
import type { MessageOf } from './types';

function checkId(id: number): void {
  if (!Number.isInteger(id) || id < 0 || id >= 73) throw new RangeError('invalid inventory index');
}
function checkU32(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError('invalid id');
}

/** The name change's OK (`CWndChangeName`): `MAKELONG( objid, 0 )` of the scroll, and the new name. */
export function encodeQuerySetPlayerName(objectId: number, name: string): Uint8Array {
  checkId(objectId);
  return clientPacket(PacketType.QUERYSETPLAYERNAME).u32(objectId).string(name).toBytes();
}

/** The party summon's OK (`CWndSummonParty`): `MAKELONG( objid, 0 )` of the scroll. */
export function encodeSummonParty(objectId: number): Uint8Array {
  checkId(objectId);
  return clientPacket(PacketType.SUMMON_PARTY).u32(objectId).toBytes();
}

/** A member's OK on the summon (`CWndSummonPartyUse`): the leader's object and the summon's data. */
export function encodeSummonPartyConfirm(leaderId: number, data: number): Uint8Array {
  checkU32(leaderId);
  checkU32(data);
  return clientPacket(PacketType.SUMMON_PARTY_CONFIRM).u32(leaderId).u32(data).toBytes();
}

/** The friend summon's OK (`CWndSummonFriend`): the summon's data (from SUMMON) and the friend's name. */
export function encodeSummonFriend(data: number, name: string): Uint8Array {
  checkU32(data);
  return clientPacket(PacketType.SUMMON_FRIEND).u32(data).string(name).toBytes();
}

/** The summoned friend's OK and Cancel (`CWndSummonFriendMsg`): the summoner's object and the data. */
export function encodeSummonFriendConfirm(summonerId: number, data: number): Uint8Array {
  checkU32(summonerId);
  checkU32(data);
  return clientPacket(PacketType.SUMMON_FRIEND_CONFIRM).u32(summonerId).u32(data).toBytes();
}
export function encodeSummonFriendCancel(summonerId: number, data: number): Uint8Array {
  checkU32(summonerId);
  checkU32(data);
  return clientPacket(PacketType.SUMMON_FRIEND_CANCEL).u32(summonerId).u32(data).toBytes();
}

/** A use with an input (a ticket's layer): `MAKELONG( ITYPE_ITEM, objid )` and the input. */
export function encodeDoUseItemInput(objectId: number, input: string): Uint8Array {
  checkId(objectId);
  return clientPacket(PacketType.DO_USE_ITEM_INPUT).u32(objectId * 65536).string(input).toBytes();
}

/** The element change's OK (`CWndChangeAttribute`): the weapon, the scroll, the element (`SAI79` 1-5). */
export function encodeChangeAttribute(targetId: number, scrollId: number, element: number): Uint8Array {
  checkId(targetId);
  checkId(scrollId);
  if (!Number.isInteger(element) || element < 1 || element > 5) throw new RangeError('invalid element');
  return clientPacket(PacketType.CHANGE_ATTRIBUTE).u32(targetId).u32(scrollId).i32(element).toBytes();
}

/** The transmute's OK (`CWndItemTransy`): the armour piece, the scroll, its twin's item id, and `bCash` TRUE. */
export function encodeItemTransy(targetId: number, scrollId: number, newItemId: number): Uint8Array {
  checkId(targetId);
  checkId(scrollId);
  checkU32(newItemId);
  return clientPacket(PacketType.ITEMTRANSY).u32(targetId).u32(scrollId).u32(newItemId).i32(1).toBytes();
}

/** A monster summon placed (`CWndWorld`'s click): `MAKELONG( ITYPE_ITEM, objid )` and the ground's point. */
export function encodeCreateMonster(objectId: number, pos: Vec3): Uint8Array {
  checkId(objectId);
  return clientPacket(PacketType.CREATEMONSTER).u32(objectId * 65536).f32(pos[0]).f32(pos[1]).f32(pos[2]).toBytes();
}

/**
 * SUMMON 0x00ed (`OnSummon`): a friend summon's use (`SOMMON_FRIEND` 0x00: the data and the scroll), a friend's call
 * (`SOMMON_FRIEND_CONFIRM` 0x01: the summoner, the data, its name and world), a party summon (`SOMMON_PARTY_CONFIRM` 0x10:
 * the leader, the data, the world). Another kind ends the message (`skipRest`).
 */
export function readSummon(r: ArReader): MessageOf<'summon'> {
  const kind = r.u8();
  if (kind === 0x00) {
    const data = r.u32(), objectId = r.u32();
    return { type: 'summon', kind: 'friendUse', data, objectId };
  }
  if (kind === 0x01) {
    const objectId = r.u32(), data = r.u32(), name = r.string(42), world = r.string(128);
    return { type: 'summon', kind: 'friendConfirm', objectId, data, name, world };
  }
  if (kind === 0x10) {
    const objectId = r.u32(), data = r.u32(), world = r.string(256);
    return { type: 'summon', kind: 'partyConfirm', objectId, data, world };
  }
  r.skipRest();
  return { type: 'summon', kind: 'other' };
}

/** SEX_CHANGE 0x00dc (`OnSexChange`): the mover's new index, `MI_MALE` 11 or `MI_FEMALE` 12. */
export function readSexChange(r: ArReader): MessageOf<'sexChange'> {
  return { type: 'sexChange', index: r.u16() };
}

/** CHANGEFACE 0x004d (`OnChangeFace`), about NULL_ID: the player and its new face (head mesh). */
export function readChangeFace(r: ArReader): MessageOf<'changeFace'> {
  const playerId = r.u32();
  const face = r.u32();
  return { type: 'changeFace', playerId, face };
}
