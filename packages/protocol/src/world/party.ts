// The party messages (Piece 7 M4, [R §1.1]). Every one is a `CUser::AddXXX` on one member's snapshot:
//
//   CDPClient::OnErrorParty            Neuz/DPClient.cpp:4296-4397   ERRORPARTY: the code, the skill for ERROR_NOTTARGET
//   CDPClient::OnAddPartyMember        DPClient.cpp:4399-4542        PARTYMEMBER: the names and the party block
//   CParty::Serialize                  _Common/party.cpp:215-240     the party block (`__VER >= 11`: id and bRemove only)
//   CDPClient::OnPartyRequest          DPClient.cpp:4544-4579        PARTYREQEST: the invite (`CUser::AddPartyRequest`)
//   CDPClient::OnPartyRequestCancel    DPClient.cpp:4581-4677        PARTYREQESTCANCEL: the invite refused, and why
//   CDPClient::OnPartyExpLevel         DPClient.cpp:4990-5002        PARTYEXP: exp, level, point, in that order
//   CDPClient::OnPartyChangeLeader     DPClient.cpp:5004-5021        ADDPARTYCHANGELEADER
//   CDPClient::OnSetPartyMode          DPClient.cpp:5023-5047        SETPARTYMODE: the points only when on
//   CDPClient::OnPartyChangeItemMode   DPClient.cpp:5241-5249        PARTYCHANGEITEMMODE, PARTYCHANGEEXPMODE
//   CDPClient::OnPartyChangeName       DPClient.cpp:5251-5293        PARTYCHANGENAME (33), PARTYCHANGETROUP (:5295)
//   CDPClient::OnSetPartyMemberParam   DPClient.cpp:5336-5378        SET_PARTY_MEMBER_PARAM: PP_REMOVE on or off
//   CDPClient::OnPartySkillCall        DPClient.cpp:5380-5514        the four party skills (Blitz :5444, Retreat :5466,
//                                                                    Sphere Circle :5491)
//   CDPClient::OnMyPartyName           DPClient.cpp:5879-5882        ADDPARTYNAME: the saved name (32)
//   CDPClient::OnPartyMapInfo          DPClient.cpp:6170-6181        PARTYMAPINFO: a member's slot and position
//
// Strings are `CAr::ReadString( buf, n )`: at most n − 1 bytes (`_Network/Misc/Src/ar.cpp:99-112`); names are
// `MAX_PLAYER` 42 (`_Network/CmnHdr.h:486`), party names 33.

import type { ArReader } from '../ar/ArReader';
import type { ArWriter } from '../ar/ArWriter';
import { PacketType } from '../constants';
import { chatBytes } from './chat';
import { clientPacket } from './packet';
import type { MessageOf, PartyBlock, PartyRequestSide } from './types';

/** `MAX_PLAYER` and `m_sParty[33]` (`_Common/party.h:78`). */
const NAME = 42;
const PARTY_NAME = 33;
/** `MAX_PARTYMODE` (`party.h:24-26`, `__VER >= 12`). */
const MODES = 5;
/** `ERROR_NOTTARGET` (`MsgHdr.h:1385`): the only error that carries the skill (`CUser::AddSendErrorParty`, `User.cpp:1266-1279`). */
const ERROR_NOTTARGET = 207;

/** The block that follows a PARTYMEMBER with members: the party name only for an advanced party (`m_nKindTroup`). */
function readPartyBlock(r: ArReader): PartyBlock {
  const partyId = r.u32();
  const kind = r.i32();
  const size = r.i32();
  const level = r.i32();
  const exp = r.i32();
  const point = r.i32();
  const expMode = r.i32();
  const itemMode = r.i32();
  const duelPartyId = r.u32();
  const modeTime = Array.from({ length: MODES }, () => r.i32());
  const name = kind !== 0 ? r.string(PARTY_NAME) : '';
  const members = Array.from({ length: Math.max(size, 0) }, () => ({ playerId: r.u32(), removed: r.i32() !== 0 }));
  return { partyId, kind, level, exp, point, expMode, itemMode, duelPartyId, modeTime, name, members };
}

/** `ar >> idPlayer`, the two names, `nSizeofMember`, then the party (`g_Party.Serialize`) when there are members. */
export function readPartyMember(r: ArReader): MessageOf<'partyMember'> {
  const playerId = r.u32();
  const leaderName = r.string(NAME);
  const memberName = r.string(NAME);
  const size = r.i32();
  return { type: 'partyMember', playerId, leaderName, memberName, party: size !== 0 ? readPartyBlock(r) : null };
}

/** One side of an invite: `u_long id, LONG level, LONG job, BYTE sex` (`CUser::AddPartyRequest`). */
function readSide(r: ArReader): PartyRequestSide {
  const id = r.u32();
  const level = r.i32();
  const job = r.i32();
  const sex = r.u8();
  return { id, level, job, sex };
}

export function readPartyRequest(r: ArReader): MessageOf<'partyRequest'> {
  const leader = readSide(r);
  const member = readSide(r);
  const leaderName = r.string(NAME);
  const troup = r.i32();
  return { type: 'partyRequest', leader, member, leaderName, troup };
}

export function readPartyRequestCancel(r: ArReader): MessageOf<'partyRequestCancel'> {
  const leaderId = r.u32();
  const memberId = r.u32();
  const mode = r.i32();
  return { type: 'partyRequestCancel', leaderId, memberId, mode };
}

export function readPartyExp(r: ArReader): MessageOf<'partyExp'> {
  const exp = r.i32();
  const level = r.i32();
  const point = r.i32();
  return { type: 'partyExp', exp, level, point };
}

export const readPartyChangeLeader = (r: ArReader): MessageOf<'partyChangeLeader'> => ({ type: 'partyChangeLeader', leaderId: r.u32() });
export const readPartyChangeTroup = (r: ArReader): MessageOf<'partyChangeTroup'> => ({ type: 'partyChangeTroup', name: r.string(PARTY_NAME) });
export const readPartyChangeName = (r: ArReader): MessageOf<'partyChangeName'> => ({ type: 'partyChangeName', name: r.string(PARTY_NAME) });
/** `ar.ReadString( g_pPlayer->m_szPartyName, 32 )` (`m_szPartyName[32]`, `_Common/Mover.h:740`). */
export const readMyPartyName = (r: ArReader): MessageOf<'myPartyName'> => ({ type: 'myPartyName', name: r.string(32) });
export const readPartyItemMode = (r: ArReader): MessageOf<'partyItemMode'> => ({ type: 'partyItemMode', mode: r.i32() });
export const readPartyExpMode = (r: ArReader): MessageOf<'partyExpMode'> => ({ type: 'partyExpMode', mode: r.i32() });

export function readSetPartyMode(r: ArReader): MessageOf<'setPartyMode'> {
  const mode = r.i32();
  const skillTime = r.u32();
  const on = r.i32() !== 0;
  return { type: 'setPartyMode', mode, skillTime, on, point: on ? r.i32() : null };
}

export function readSetPartyMemberParam(r: ArReader): MessageOf<'setPartyMemberParam'> {
  const playerId = r.u32();
  const param = r.u8();
  const value = r.i32();
  return { type: 'setPartyMemberParam', playerId, param, value };
}

export function readPartyMapInfo(r: ArReader): MessageOf<'partyMapInfo'> {
  const index = r.i32();
  return { type: 'partyMapInfo', index, pos: r.vec3() };
}

export const readPartySkillCall = (r: ArReader): MessageOf<'partySkillCall'> => ({ type: 'partySkillCall', pos: r.vec3() });
export const readPartySkillBlitz = (r: ArReader): MessageOf<'partySkillBlitz'> => ({ type: 'partySkillBlitz', targetId: r.u32() });
export const readPartySkillRetreat = (): MessageOf<'partySkillRetreat'> => ({ type: 'partySkillRetreat' });
export const readPartySkillSphereCircle = (): MessageOf<'partySkillSphereCircle'> => ({ type: 'partySkillSphereCircle' });

/** The snapshot's ERRORPARTY: the code, and the skill after ERROR_NOTTARGET alone. */
export function readErrorParty(r: ArReader): MessageOf<'errorParty'> {
  const code = r.u32();
  return { type: 'errorParty', code, skill: code === ERROR_NOTTARGET ? r.u32() : null };
}

// The party packets the client sends ([R §2]), each after `DPID_UNKNOWN` and its type (`BEFORESENDSOLE`):
//
//   CDPClient::SendPartyMemberRequest   Neuz/DPClient.cpp:9508-9513   MEMBERREQUEST: own id, the target, bTroup 0
//   CDPClient::SendPartyMemberCancle    DPClient.cpp:9515-9520        MEMBERREQUESTCANCLE: the request's ids, the mode
//   CDPClient::SendAddPartyMember       DPClient.cpp:9522-9528        ADDPARTYMEMBER: both sides, the sexes as DWORDs
//   CDPClient::SendRemovePartyMember    DPClient.cpp:9530-9535        REMOVEPARTYMEMBER: own id, who leaves
//   CDPClient::SendChangeTroup          DPClient.cpp:9537-9547        CHANGETROUP: own id, bSendName 1, the name
//   CDPClient::SendPartyChangeLeader    DPClient.cpp:9557-9563        PARTYCHANGELEADER: own id, the new leader
//   CDPClient::SendChangeShareItem      DPClient.cpp:9487-9499        PARTYCHANGEITEMMODE, PARTYCHANGEEXPMODE (:9494)
//   CDPClient::SendPartySkillUse        DPClient.cpp:9480-9485        PARTYSKILLUSE: own id, the skill (1-8)
//   CDPClient::SendBlock                DPClient.cpp:11155-11162      BLOCK: nGu, own name, the inviter's name
//
// The core ignores the own id (`CORESERVER/DPCacheSrvr.cpp:722-730`, …) and the world drops a request whose own id is
// not the sender's (`DPSrvr.cpp:11697-11699`), so it is the own player id as Neuz writes it.

/** A name as `CAr::WriteString` writes it: an i32 count and the bytes in the game's code page (`chatBytes`). */
function writeName(w: ArWriter, name: string): ArWriter {
  const bytes = chatBytes(name, 63);
  return w.i32(bytes.length).bytes(bytes);
}

export const encodePartyMemberRequest = (ownId: number, targetId: number): Uint8Array =>
  clientPacket(PacketType.MEMBERREQUEST).u32(ownId).u32(targetId).i32(0).toBytes();
export const encodePartyMemberCancel = (leaderId: number, memberId: number, mode: number): Uint8Array =>
  clientPacket(PacketType.MEMBERREQUESTCANCLE).u32(leaderId).u32(memberId).i32(mode).toBytes();
export const encodeAddPartyMember = (leader: PartyRequestSide, member: PartyRequestSide): Uint8Array =>
  clientPacket(PacketType.ADDPARTYMEMBER)
    .u32(leader.id).i32(leader.level).i32(leader.job).u32(leader.sex)
    .u32(member.id).i32(member.level).i32(member.job).u32(member.sex).toBytes();
export const encodeRemovePartyMember = (ownId: number, leaveId: number): Uint8Array =>
  clientPacket(PacketType.REMOVEPARTYMEMBER).u32(ownId).u32(leaveId).toBytes();
/** Neuz always sends a name (`bSendName` 1): without one the core reads an uninitialised buffer ([R §6.4]). */
export const encodeChangeTroup = (ownId: number, name: string): Uint8Array =>
  writeName(clientPacket(PacketType.CHANGETROUP).u32(ownId).i32(1), name).toBytes();
export const encodePartyChangeLeader = (ownId: number, newLeaderId: number): Uint8Array =>
  clientPacket(PacketType.PARTYCHANGELEADER).u32(ownId).u32(newLeaderId).toBytes();
export const encodePartyItemMode = (ownId: number, mode: number): Uint8Array =>
  clientPacket(PacketType.PARTYCHANGEITEMMODE).u32(ownId).i32(mode).toBytes();
export const encodePartyExpMode = (ownId: number, mode: number): Uint8Array =>
  clientPacket(PacketType.PARTYCHANGEEXPMODE).u32(ownId).i32(mode).toBytes();
export const encodePartySkillUse = (ownId: number, skill: number): Uint8Array =>
  clientPacket(PacketType.PARTYSKILLUSE).u32(ownId).i32(skill).toBytes();
export const encodeBlock = (gu: number, ownName: string, inviterName: string): Uint8Array =>
  writeName(writeName(clientPacket(PacketType.BLOCK).u8(gu), ownName), inviterName).toBytes();
