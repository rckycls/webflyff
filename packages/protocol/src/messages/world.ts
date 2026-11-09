import { ArReader } from '../ar/ArReader';
import { DPID_UNKNOWN, MessageType, PacketType } from '../constants';
import type { Vec3 } from '../constants';
import { ProtocolError } from '../errors';
import { MAX_SKILL_JOB, readSkills } from '../world/own';
import { clientPacket } from '../world/packet';
import { readDefinedText } from '../world/combat';
import { readWhisper, readSocial, readGmSay } from '../world/chat';
import {
  readAddAppletTaskBar, readAddItemTaskBar, readRemoveAppletTaskBar, readRemoveItemTaskBar, readSkillTaskBar,
} from '../world/taskBar';
import { readBlock, readPlayerLogout, readUpdatePlayerData } from '../world/playerData';
import type { MessageOf, PartyRequestSide, Shortcut, SkillSlot } from '../world/types';
import { readAngleReport, readFlightReport } from '../world/flight';
import type { AngleReport, FlightReport } from '../world/flight';
import type { SlotMessenger } from './login';
import { readFriendPacket, readFriendRequestPacket } from '../world/friends';
import type { FriendDirectMessage, FriendRequestPacket } from '../world/friends';

/** What `CDPClient::SendJoin` sends: the character that enters the world, and the account that owns it. */
export interface JoinRequest {
  worldId: number;
  playerId: number;
  authKey: number;
  partyId: number;
  guildId: number;
  warId: number;
  /** `uIdofMulti` in the C++: the channel the character logged in on. */
  channelId: number;
  slot: number;
  name: string;
  account: string;
  /** `g_Neuz.m_szPassword`: the hashed password, as CERTIFY and GETPLAYERLIST carry it. */
  passwordHash: string;
  /** The slot's messenger as PLAYER_LIST gave it; `undefined` writes the empty `CRTMessenger`. */
  messenger: SlotMessenger | undefined;
}

/**
 * JOIN (`CDPClient::SendJoin`, `Neuz/DPClient.cpp:9089`, `__RT_1025`): world ID, player ID, auth key, party, guild
 * and war IDs, channel ID (all `u32`), the slot (`BYTE`), the name, the account and the password hash as strings,
 * then `CRTMessenger::Serialize` (`_Common/rtmessenger.cpp:36`, storing): the state (`DWORD`), the friend count
 * (`int`), and per friend its ID (`u_long`) and the 8 bytes of a `Friend` (`BOOL bBlock`, `DWORD dwState`). The
 * `slot` of the messenger is not written: `SendJoin` takes the messenger of that slot, and the slot goes in the
 * packet once, as the `BYTE` above. The `__GPAUTH_01` branch only picks which account text goes in.
 */
export function encodeJoin(j: JoinRequest): Uint8Array {
  const w = clientPacket(PacketType.JOIN).u32(j.worldId).u32(j.playerId).u32(j.authKey).u32(j.partyId).u32(j.guildId)
    .u32(j.warId).u32(j.channelId).u8(j.slot).string(j.name).string(j.account).string(j.passwordHash);
  const friends = j.messenger?.friends ?? [];
  w.u32(j.messenger?.state ?? 0).i32(friends.length);
  for (const f of friends) w.u32(f.id).i32(f.blocked).u32(f.state);
  return w.toBytes();
}

/**
 * KEEP_ALIVE (`CDPClient::OnKeepAlive`, `Neuz/DPClient.cpp:961`): the cache server's KEEP_ALIVE is answered with
 * `BEFORESENDSOLE( ar2, PACKETTYPE_KEEP_ALIVE, DPID_UNKNOWN )` and no fields.
 */
export function encodeWorldKeepAlive(): Uint8Array {
  return clientPacket(PacketType.KEEP_ALIVE).toBytes();
}

/**
 * The fields of PLAYERMOVED and PLAYERBEHAVIOR, in the order `CDPClient::SendPlayerMoved` (`Neuz/DPClient.cpp:10081`)
 * and `CDPClient::SendPlayerBehavior` (:10113) write them. Positions are in D3D coordinates and the angle in FlyFF
 * degrees, as the C++ holds them.
 */
export interface MoveReport {
  /** `v`: for PLAYERMOVED the position `PresupposePos` predicts `MAX_CORR_SIZE_45` steps ahead, for PLAYERBEHAVIOR `GetPos()`. */
  pos: Vec3;
  /** `vd`: the movement per step (`PresupposePos`'s `vd` for PLAYERMOVED, `m_vDelta` for PLAYERBEHAVIOR). */
  delta: Vec3;
  /** `f`: the angle in degrees (`PresupposePos`'s `f` for PLAYERMOVED, `GetAngle()` for PLAYERBEHAVIOR). */
  angle: number;
  /** `m_pActMover->GetState()` (`DWORD`). */
  state: number;
  /** `m_pActMover->GetStateFlag()` (`DWORD`). */
  stateFlag: number;
  /** `m_dwMotion` (`DWORD`). */
  motion: number;
  /** `m_pActMover->m_nMotionEx` (`int`). */
  motionEx: number;
  /** `m_pModel->m_nLoop` (`int`). */
  loop: number;
  /** `m_dwMotionOption` (`DWORD`). */
  motionOption: number;
  /** `g_TickCount.GetTickCount()` (`__int64`): the clock `tickcount.h` keeps, in 100 ns units. */
  tick: bigint;
}

function moveReport(type: number, m: MoveReport): Uint8Array {
  return clientPacket(type).vec3(m.pos).vec3(m.delta).f32(m.angle).u32(m.state).u32(m.stateFlag).u32(m.motion)
    .i32(m.motionEx).i32(m.loop).u32(m.motionOption).i64(m.tick).toBytes();
}

/** PLAYERMOVED (`CDPClient::SendPlayerMoved`, `Neuz/DPClient.cpp:10081`). */
export function encodePlayerMoved(m: MoveReport): Uint8Array {
  return moveReport(PacketType.PLAYERMOVED, m);
}

/** PLAYERBEHAVIOR (`CDPClient::SendPlayerBehavior`, `Neuz/DPClient.cpp:10113`). */
export function encodePlayerBehavior(m: MoveReport): Uint8Array {
  return moveReport(PacketType.PLAYERBEHAVIOR, m);
}

/**
 * PLAYERCORR (`CDPClient::SendPlayerCorr`, `Neuz/DPClient.cpp:10866-10895`): PLAYERBEHAVIOR's fields (`GetPos()`,
 * `m_vDelta`, `GetAngle()`, the state...) in its order, which `CDPSrvr::OnPlayerCorr` (`WORLDSERVER/DPSrvr.cpp:12872`)
 * reads.
 */
export function encodePlayerCorr(m: MoveReport): Uint8Array {
  return moveReport(PacketType.PLAYERCORR, m);
}

/**
 * The client's SNAPSHOT carrying one DESTPOS (`CDPClient::SendSnapshot`, `Neuz/DPClient.cpp:11187`, a click-to-move):
 * the object count (`BYTE`, here 1), the message type (`WORD` `SNAPSHOTTYPE_DESTPOS`), the position, and `fForward`
 * (`BYTE`). The messages have no object ID in front, unlike the server's bundles (`CDPSrvr::OnSnapshot` reads
 * them that way); `__IAOBJ0622` is off, so there is no `objidIAObj`.
 */
export function encodeDestPos(pos: Vec3, forward: boolean): Uint8Array {
  return clientPacket(PacketType.SNAPSHOT).u8(1).u16(MessageType.DESTPOS).vec3(pos).u8(forward ? 1 : 0).toBytes();
}

/**
 * SETTARGET (`CDPClient::SendSetTarget`, `Neuz/DPClient.cpp:9886`): the target's object ID (`OBJID`), then `bClear`
 * (`BYTE`), the order `CDPSrvr::OnSetTarget` (`WORLDSERVER/DPSrvr.cpp:2183`) reads them in. 1 releases the target (the
 * server clears the target's `m_idTargeter` if this player set it); 2 makes the target the player's focus
 * (`m_idSetTarget`), and with `NULL_ID` it clears the focus.
 */
export function encodeSetTarget(targetId: number, clear: 1 | 2): Uint8Array {
  return clientPacket(PacketType.SETTARGET).u32(targetId).u8(clear).toBytes();
}

/**
 * PLAYERSETDESTOBJ (`CDPClient::SendPlayerDestObj`, `Neuz/DPClient.cpp:10923`): the object to walk to (`OBJID`),
 * then the range to stop at (`float`), as `CDPSrvr::OnPlayerSetDestObj` (`WORLDSERVER/DPSrvr.cpp:12794`) reads them.
 */
export function encodePlayerSetDestObj(targetId: number, range: number): Uint8Array {
  return clientPacket(PacketType.PLAYERSETDESTOBJ).u32(targetId).f32(range).toBytes();
}

/** `nParam2` of a melee swing: `MAKELONG( 0, 0 )` (`CMover::DoAttackMelee`, `_Common/MoverSkill.cpp:3464`). */
const MELEE_PARAM2 = 0;
/**
 * `nParam3` of a melee swing: `MAKELONG( 0, (WORD)nError )` (`_Common/MoverSkill.cpp:3464`), where `nError` is what
 * `SendActMsg` returned, `m_dwAtkFlags` = `AF_GENERIC` (1) on the client (`CActionMover::ProcessActMsg1`,
 * `_AIInterface/ActionMoverMsg.cpp:699-702`, as the client does not roll a hit): `0x00010000`.
 */
const MELEE_PARAM3 = 0x00010000;

/**
 * MELEE_ATTACK (`CDPClient::SendMeleeAttack`, `Neuz/DPClient.cpp:9819`, with `__HACK_1023` on: `Neuz/VersionCommon.h:93`,
 * `WORLDSERVER/VersionCommon.h:102`): the attack message (`OBJMSG`, an `int` on the wire), the target (`OBJID`),
 * `nParam2` and `nParam3` (`int`), then `fVal` (`FLOAT`), in the order `CDPSrvr::OnMeleeAttack`
 * (`WORLDSERVER/DPSrvr.cpp:2019`) reads them. The server compares `fVal` with the held item's `fAttackSpeed` and
 * refuses the swing on any difference (`TID_GAME_MODIFY_ATTACK_SPEED`), so `attackSpeed` is that table value as it
 * is, written as an `f32`.
 */
export function encodeMeleeAttack(message: number, targetId: number, attackSpeed: number): Uint8Array {
  return clientPacket(PacketType.MELEE_ATTACK).u32(message).u32(targetId).i32(MELEE_PARAM2).i32(MELEE_PARAM3)
    .f32(attackSpeed).toBytes();
}

/**
 * GETDESTOBJ (`CDPClient::SendGetDestObj`, `Neuz/DPClient.cpp:10941`): the answer to the server's QUERYGETDESTOBJ.
 * `fromId` is the object ID that message named (`OnQueryGetDestObj`, :8985, reads it as `objid`), `destId` the
 * player's own destination (`g_pPlayer->GetDestId()`); `CDPSrvr::OnGetDestObj` (`WORLDSERVER/DPSrvr.cpp:11604`)
 * reads the two in that order and uses only the second.
 */
export function encodeGetDestObj(fromId: number, destId: number): Uint8Array {
  return clientPacket(PacketType.GETDESTOBJ).u32(fromId).u32(destId).toBytes();
}

/**
 * REVIVAL_TO_LODESTAR (`CDPClient::SendHdr( PACKETTYPE_REVIVAL_TO_LODESTAR )`, `Neuz/DPClient.cpp:11253`, called from
 * :2054 and :2058): a type and no fields; `CDPSrvr::OnRevivalLodestar` (`WORLDSERVER/DPSrvr.cpp:11296`) reads none.
 */
export function encodeRevivalToLodestar(): Uint8Array {
  return clientPacket(PacketType.REVIVAL_TO_LODESTAR).toBytes();
}

/**
 * MODIFY_STATUS (`CDPClient::SendModifyStatus`, `Neuz/DPClient.cpp:16652`): the points to add to STR, STA, DEX and
 * INT (`int` each), the order `CDPSrvr::OnModifyStatus` (`WORLDSERVER/DPSrvr.cpp:8341`) reads them in. The server
 * ignores a request with a negative count, no points at all, or more points than the player has.
 */
export function encodeModifyStatus(counts: { str: number; sta: number; dex: number; int: number }): Uint8Array {
  return clientPacket(PacketType.MODIFY_STATUS).i32(counts.str).i32(counts.sta).i32(counts.dex).i32(counts.int).toBytes();
}

/**
 * `wType` of a USESKILL, which tells a job skill from a license skill and is meaningless since 2005 (`CDPSrvr::OnUseSkill`
 * sets it to 0 whatever it is, `WORLDSERVER/DPSrvrLux.cpp:49`); Neuz sends 0
 * (`CMover::ProcessMoveArrival`, `_Common/MoverMove.cpp:171`).
 */
const USESKILL_WTYPE = 0;

/**
 * USESKILL (`CDPClient::SendUseSkill`, `Neuz/DPClient.cpp:9855`, `__VER >= 8`): `wType` (`WORD`, 0), `wId` (`WORD`, the
 * index into `m_aJobSkill`, which is what `index` is), the target's object ID (`OBJID`), the use type (`int`, a
 * `SKILLUSETYPE`: `SUT_NORMAL` 0 for a task bar slot, `SUT_QUEUESTART` 1 for the first skill of the action slot; Neuz
 * sends no other, `SUT_QUEUEING` is the server's own chain) and the Ctrl key (`BOOL`, which matters only for PK), the
 * order `CDPSrvr::OnUseSkill` (`WORLDSERVER/DPSrvrLux.cpp:32`) reads them in. 24 bytes.
 *
 * The server drops an index outside `m_aJobSkill` (and a skill of level 0) with no reply, not even CLEAR_USESKILL
 * (`DPSrvrLux.cpp:46-47`, :74-75), which would leave a player waiting for its answer: the encoder refuses the index.
 * The level is the caller's to check.
 */
export function encodeUseSkill(index: number, targetId: number, useType: 0 | 1, control = false): Uint8Array {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_SKILL_JOB) {
    throw new ProtocolError(`skill index ${index} is outside 0..${MAX_SKILL_JOB - 1}`);
  }
  return clientPacket(PacketType.USESKILL).u16(USESKILL_WTYPE).u16(index).u32(targetId).i32(useType)
    .i32(control ? 1 : 0).toBytes();
}

/**
 * DOUSESKILLPOINT (`CDPClient::SendDoUseSkillPoint`, `Neuz/DPClient.cpp:9710`): for each of the `MAX_SKILL_JOB` (45) slots
 * `dwSkill` then `dwLevel` (`DWORD` each) and nothing else, the player's own skill IDs with the levels the skill window
 * set, `NULL_ID` and 0 for an empty slot; 8 + 360 bytes. `CDPSrvr::OnDoUseSkillPoint` (`WORLDSERVER/DPSrvr.cpp:1104`)
 * reads the same 45 pairs, takes only the level of each slot and answers a spend with a DOUSESKILLPOINT message, a
 * refusal with a DEFINEDTEXT1 `TID_RESKILLPOINT_ERROR` (`DPSrvr.cpp:1125`, :1136), and a request that changes no level
 * with nothing.
 */
export function encodeDoUseSkillPoint(skills: readonly SkillSlot[]): Uint8Array {
  if (skills.length !== MAX_SKILL_JOB) {
    throw new ProtocolError(`a skill array has ${MAX_SKILL_JOB} slots, not ${skills.length}`);
  }
  const w = clientPacket(PacketType.DOUSESKILLPOINT);
  for (const slot of skills) w.u32(slot.skill).u32(slot.level);
  return w.toBytes();
}

/**
 * ENDSKILLQUEUE (`CDPClient::SendEndSkillQueue`, `Neuz/DPClient.cpp:15819`, which is `SendHdr( PACKETTYPE_ENDSKILLQUEUE )`,
 * :11253): a type and no fields, as `CDPSrvr::OnEndSkillQueue` (`WORLDSERVER/DPSrvr.cpp:4963`) reads none. The player
 * sends it to stop the action slot's chain (`CWndWorld::OnLButtonDown`, `_Interface/WndWorld.cpp:6982`).
 */
export function encodeEndSkillQueue(): Uint8Array {
  return clientPacket(PacketType.ENDSKILLQUEUE).toBytes();
}

export type WorldPacket =
  | { type: 'teleporter'; key: string; index: number }
  | { type: 'npcBuff'; key: string }
  /** 2026-11-09 (pets R2): the own raised pet sent back (`SendPetRelease`). */
  | { type: 'petRelease' }
  /** 2026-11-09 (pets R3): the raised pet's care (world/pets.ts), by the encoders' parameter names. */
  | { type: 'usePetFeed'; feedObjectId: number }
  | { type: 'makePetFeed'; materialObjectId: number; toolObjectId: number; count: number }
  | { type: 'petTamerMistake' | 'petTamerMiracle'; scrollObjectId: number }
  | { type: 'feedPocketInactive' | 'clearPetName' }
  /** 2026-11-09 (pets B1): the buff pet window's vis out and swap (world/pets.ts). */
  | { type: 'removeVis'; slot: number }
  | { type: 'swapVis'; slot1: number; slot2: number }
  /** 2026-11-09 (pets R4): the Pet Tamer's pet trade, egg exchange and awakening cancel (world/pets.ts). */
  | { type: 'quePetResurrection' | 'pickupPetAwakeningCancel'; itemObjectId: number }
  | { type: 'transformItem'; transform: number; parts: Array<{ objectId: number; count: number }> }
  | { type: 'setPlayerName'; playerId: number; name: string }
  | { type: 'enchant' | 'piercing' | 'randomScroll'; targetId: number; materialId: number }
  | { type: 'doUseItemTarget'; materialId: number; targetId: number }
  | { type: 'ultimateEnchantWeapon'; targetId: number; materialId: number }
  | { type: 'removeQuest'; questId: number }
  | { type: 'questCheck'; questId: number; check: boolean }
  | ReturnType<typeof readDefinedText>
  | ReturnType<typeof readWhisper>
  | { type: 'guild' | 'system'; sender: string; text: string }
  | MessageOf<'errorParty'>
  | MessageOf<'updatePlayerData'>
  | MessageOf<'playerLogout'>
  | MessageOf<'block'>
  | { type: 'join'; body: Uint8Array }
  | { type: 'snapshot'; body: Uint8Array }
  | { type: 'keepAlive' }
  | { type: 'error'; code: number }
  | { type: 'replace'; worldId: number }
  // The packets the browser sends, read for the pretend servers (`DPID_UNKNOWN` first): the fields of the encoders.
  | { type: 'setTarget'; targetId: number; clear: number }
  | { type: 'playerSetDestObj'; targetId: number; range: number }
  | { type: 'meleeAttack'; message: number; targetId: number; param2: number; param3: number; attackSpeed: number }
  | { type: 'getDestObj'; fromId: number; destId: number }
  | { type: 'revivalToLodestar' }
  | { type: 'modifyStatus'; str: number; sta: number; dex: number; int: number }
  // The skill packets: `skillType` is `wType` (0), `index` the skill's index in `m_aJobSkill`, `control` the Ctrl key.
  | { type: 'useSkill'; skillType: number; index: number; targetId: number; useType: number; control: boolean }
  | { type: 'doUseSkillPoint'; skills: SkillSlot[] }
  | { type: 'addItemTaskBar'; bar: number; slot: number; shortcut: Shortcut }
  | { type: 'removeItemTaskBar'; bar: number; slot: number }
  // the applet row (2026-11-05)
  | { type: 'addAppletTaskBar'; slot: number; shortcut: Shortcut }
  | { type: 'removeAppletTaskBar'; slot: number }
  // The slots a SKILLTASKBAR names, in the order sent: Neuz sends all five, the server only overwrites those.
  | { type: 'skillTaskBar'; entries: Array<{ slot: number; shortcut: Shortcut }> }
  | { type: 'endSkillQueue' }
  // Piece 7 M4: the party packets, by the encoders' parameter names ([R §2])
  | { type: 'partyMemberRequest'; ownId: number; targetId: number; troup: number }
  | { type: 'partyMemberCancel'; leaderId: number; memberId: number; mode: number }
  | { type: 'addPartyMember'; leader: PartyRequestSide; member: PartyRequestSide }
  | { type: 'removePartyMember'; ownId: number; leaveId: number }
  | { type: 'changeTroup'; ownId: number; name: string }
  | { type: 'partyLeaderChange'; ownId: number; newLeaderId: number }
  | { type: 'partyItemModeChange'; ownId: number; mode: number }
  | { type: 'partyExpModeChange'; ownId: number; mode: number }
  | { type: 'partySkillUse'; ownId: number; skill: number }
  | { type: 'blockRequest'; gu: number; ownName: string; inviterName: string }
  | { type: 'queryPlayerData'; playerId: number; version: number }
  // Piece 7 M3: an item used (`objectId` the high word of `MAKELONG( ITYPE_ITEM, objId )`), the cast's cancel, and the
  // Scroll of Return's choice.
  | { type: 'useItem'; objectId: number; targetId: number; part: number; flightSpeed: number }
  | { type: 'stateMode'; mode: number; flag: number }
  | { type: 'returnScroll'; select: number }
  // Piece 7 M5: an item worn (with its flight float), and a flier's reports and air attack.
  | { type: 'equipItem'; objectId: number; part: number; flightSpeed: number }
  | { type: 'playerMoved2'; move: FlightReport; frames: number }
  | { type: 'playerBehavior2'; move: FlightReport }
  | { type: 'playerCorr2'; move: FlightReport }
  | ({ type: 'playerAngle' } & AngleReport)
  | { type: 'meleeAttack2'; message: number; targetId: number; param2: number; param3: number }
  // 2026-11-10: the messenger's direct packets and SAY, and the messenger packets the browser sends (world/friends.ts)
  | FriendDirectMessage
  | FriendRequestPacket
  | { type: 'unknown'; packetType: number };

/**
 * Decodes a body received on the cache (game) port; the server's bodies start with their type. This is the part of
 * `CDPClient`'s `ON_MSG` table (`Neuz/DPClient.cpp:159`) the browser handles:
 * - JOIN (`OnJoin`, :897) and SNAPSHOT (`OnSnapshot`, :366) are bundles; `body` is the whole received body, type
 *   first, for the bundle reader.
 * - KEEP_ALIVE (`OnKeepAlive`, :961) reads nothing.
 * - ERROR (`OnError`, :1033) reads the error code (`long`).
 * - REPLACE (`OnReplace`, :2297) reads the world ID (`DWORD`) and the position (`D3DXVECTOR3`); the position is
 *   read to check the body and dropped, as the browser only reports the world it is asked to go to.
 * A body that starts with `DPID_UNKNOWN` is one the browser sent (`BEFORESENDSOLE`), which the pretend servers read:
 * the type follows, then the fields of the matching `encode*` (`decodeClientPacket`). No packet type of `MsgHdr.h` is
 * `0xffffffff`, so a server body is never mistaken for one.
 * A known type must use the whole body (JOIN and SNAPSHOT keep it whole); a type this does not know is reported,
 * not thrown.
 */
export function decodeWorldPacket(body: Uint8Array): WorldPacket {
  const r = new ArReader(body);
  const packetType = r.u32();
  if (packetType === DPID_UNKNOWN) return decodeClientPacket(r);
  switch (packetType) {
    case 0xff00ec: {
      const value = readDefinedText(r); r.expectEnd(); return value;
    }
    case 0xffffff39: {
      const value = readSocial(r, 'guild'); r.expectEnd(); return value as { type: 'guild'; sender: string; text: string };
    }
    case 0xff00ed: {
      const value = readGmSay(r); r.expectEnd(); return value as { type: 'system'; sender: string; text: string };
    }
    case 0xff00d4: {
      const whisper = readWhisper(r); r.expectEnd(); return whisper;
    }
    // Piece 7 M4: the core's direct packets ([R §1.2]): its ERRORPARTY has no skill (`CDPCacheSrvr::SendErrorParty`)
    case PacketType.ERRORPARTY: {
      const code = r.u32(); r.expectEnd(); return { type: 'errorParty', code, skill: null };
    }
    case PacketType.UPDATE_PLAYER_DATA: {
      const value = readUpdatePlayerData(r); r.expectEnd(); return value;
    }
    case PacketType.LOGOUT: {
      const value = readPlayerLogout(r); r.expectEnd(); return value;
    }
    case PacketType.BLOCK: {
      const value = readBlock(r); r.expectEnd(); return value;
    }
    // 2026-11-05: the name change's answer, to every client (`OnSetPlayerName`, DPClient.cpp:15606-15610)
    case PacketType.QUERYSETPLAYERNAME: {
      const playerId = r.u32(), name = r.string(42); r.expectEnd();
      return { type: 'setPlayerName', playerId, name };
    }
    case PacketType.JOIN:
      return { type: 'join', body };
    case PacketType.SNAPSHOT:
      return { type: 'snapshot', body };
    case PacketType.KEEP_ALIVE:
      r.expectEnd();
      return { type: 'keepAlive' };
    case PacketType.ERROR: {
      const code = r.i32();
      r.expectEnd();
      return { type: 'error', code };
    }
    case PacketType.REPLACE: {
      const worldId = r.u32();
      r.vec3();
      r.expectEnd();
      return { type: 'replace', worldId };
    }
    default: {
      // 2026-11-10: the messenger's direct packets and SAY (world/friends.ts)
      const friend = readFriendPacket(packetType, r);
      if (friend !== null) { r.expectEnd(); return friend; }
      return { type: 'unknown', packetType };
    }
  }
}

/**
 * The fight and skill packets after their `DPID_UNKNOWN`, read in the order the matching `encode*` writes them (and
 * the world server reads them). Any other type is reported with its fields unread: the pretend servers only look at
 * these.
 */
function decodeClientPacket(r: ArReader): WorldPacket {
  const packetType = r.u32();
  switch (packetType) {
    case PacketType.TELEPORTER: {
      const key = r.string(63), index = r.i32(); r.expectEnd();
      if (key.length === 0 || index < 0) throw new ProtocolError('Invalid teleporter destination');
      return { type: 'teleporter', key, index };
    }
    case PacketType.ENCHANT: case PacketType.PIERCING: case PacketType.RANDOMSCROLL: case PacketType.ULTIMATE_ENCHANTWEAPON: {
      const targetId = r.u32(), materialId = r.u32(); r.expectEnd();
      const type = packetType === PacketType.ENCHANT ? 'enchant' : packetType === PacketType.PIERCING ? 'piercing'
        : packetType === PacketType.RANDOMSCROLL ? 'randomScroll' : 'ultimateEnchantWeapon';
      return { type, targetId, materialId };
    }
    case PacketType.DO_USE_ITEM_TARGET: {
      const materialId = r.u32(), targetId = r.u32(); r.expectEnd();
      return { type: 'doUseItemTarget', materialId, targetId };
    }
    case PacketType.NPC_BUFF: {
      const key = r.string(64); r.expectEnd();
      if (key.length === 0) throw new ProtocolError('Invalid NPC key');
      return { type: 'npcBuff', key };
    }
    case PacketType.PET_RELEASE: // 2026-11-09 (pets R2): the type alone
      r.expectEnd();
      return { type: 'petRelease' };
    case PacketType.USE_PET_FEED: { // 2026-11-09 (pets R3)
      const feedObjectId = r.u32(); r.expectEnd();
      return { type: 'usePetFeed', feedObjectId };
    }
    case PacketType.MAKE_PET_FEED: {
      const materialObjectId = r.u32(), toolObjectId = r.u32(), count = r.i16(); r.expectEnd();
      return { type: 'makePetFeed', materialObjectId, toolObjectId, count };
    }
    case PacketType.PET_TAMER_MISTAKE: case PacketType.PET_TAMER_MIRACLE: {
      const scrollObjectId = r.u32(); r.expectEnd();
      return { type: packetType === PacketType.PET_TAMER_MISTAKE ? 'petTamerMistake' : 'petTamerMiracle', scrollObjectId };
    }
    case PacketType.FEED_POCKET_INACTIVE: case PacketType.CLEAR_PET_NAME:
      r.expectEnd();
      return { type: packetType === PacketType.FEED_POCKET_INACTIVE ? 'feedPocketInactive' : 'clearPetName' };
    case PacketType.VISPET_REMOVEVIS: { // 2026-11-09 (pets B1)
      const slot = r.i32(); r.expectEnd();
      return { type: 'removeVis', slot };
    }
    case PacketType.VISPET_SWAPVIS: {
      const slot1 = r.i32(), slot2 = r.i32(); r.expectEnd();
      return { type: 'swapVis', slot1, slot2 };
    }
    case PacketType.QUE_PETRESURRECTION: case PacketType.PICKUP_PET_AWAKENING_CANCEL: { // 2026-11-09 (pets R4)
      const itemObjectId = r.u32(); r.expectEnd();
      return { type: packetType === PacketType.QUE_PETRESURRECTION ? 'quePetResurrection' : 'pickupPetAwakeningCancel', itemObjectId };
    }
    case PacketType.TRANSFORM_ITEM: { // CTransformStuff::Serialize's loading side (pet.cpp:705-718), each part 8 bytes
      const transform = r.i32(), size = r.u32();
      if (size * 8 !== r.remaining()) throw new ProtocolError('Invalid TRANSFORM_ITEM size');
      const parts: Array<{ objectId: number; count: number }> = [];
      for (let i = 0; i < size; i++) {
        const objectId = r.u32(), count = r.i16();
        r.u16(); // the struct's padding
        parts.push({ objectId, count });
      }
      r.expectEnd();
      return { type: 'transformItem', transform, parts };
    }
    case PacketType.REMOVEQUEST: {
      const questId = r.u32(); r.expectEnd();
      return { type: 'removeQuest', questId };
    }
    case PacketType.QUEST_CHECK: {
      const questId = r.i32(), check = r.i32() !== 0; r.expectEnd();
      return { type: 'questCheck', questId, check };
    }
    case PacketType.SETTARGET: {
      const targetId = r.u32();
      const clear = r.u8();
      r.expectEnd();
      return { type: 'setTarget', targetId, clear };
    }
    case PacketType.PLAYERSETDESTOBJ: {
      const targetId = r.u32();
      const range = r.f32();
      r.expectEnd();
      return { type: 'playerSetDestObj', targetId, range };
    }
    case PacketType.MELEE_ATTACK: {
      const message = r.u32();
      const targetId = r.u32();
      const param2 = r.i32();
      const param3 = r.i32();
      const attackSpeed = r.f32();
      r.expectEnd();
      return { type: 'meleeAttack', message, targetId, param2, param3, attackSpeed };
    }
    case PacketType.GETDESTOBJ: {
      const fromId = r.u32();
      const destId = r.u32();
      r.expectEnd();
      return { type: 'getDestObj', fromId, destId };
    }
    case PacketType.REVIVAL_TO_LODESTAR:
      r.expectEnd();
      return { type: 'revivalToLodestar' };
    case PacketType.MODIFY_STATUS: {
      const str = r.i32();
      const sta = r.i32();
      const dex = r.i32();
      const int = r.i32();
      r.expectEnd();
      return { type: 'modifyStatus', str, sta, dex, int };
    }
    case PacketType.USESKILL: {
      // `ar >> wType >> wId >> objid >> nUseType; ar >> bControl;` (`CDPSrvr::OnUseSkill`, `DPSrvrLux.cpp:39-43`)
      const skillType = r.u16();
      const index = r.u16();
      const targetId = r.u32();
      const useType = r.i32();
      const control = r.i32() !== 0;
      r.expectEnd();
      return { type: 'useSkill', skillType, index, targetId, useType, control };
    }
    case PacketType.DOUSESKILLPOINT: {
      const skills = readSkills(r);
      r.expectEnd();
      return { type: 'doUseSkillPoint', skills };
    }
    case PacketType.ADDITEMTASKBAR: {
      const { bar, slot, shortcut } = readAddItemTaskBar(r);
      r.expectEnd();
      return { type: 'addItemTaskBar', bar, slot, shortcut };
    }
    case PacketType.ADDAPPLETTASKBAR: {
      const { slot, shortcut } = readAddAppletTaskBar(r);
      r.expectEnd();
      return { type: 'addAppletTaskBar', slot, shortcut };
    }
    case PacketType.REMOVEAPPLETTASKBAR: {
      const { slot } = readRemoveAppletTaskBar(r);
      r.expectEnd();
      return { type: 'removeAppletTaskBar', slot };
    }
    case PacketType.REMOVEITEMTASKBAR: {
      const { bar, slot } = readRemoveItemTaskBar(r);
      r.expectEnd();
      return { type: 'removeItemTaskBar', bar, slot };
    }
    case PacketType.SKILLTASKBAR: {
      const entries = readSkillTaskBar(r);
      r.expectEnd();
      return { type: 'skillTaskBar', entries };
    }
    case PacketType.ENDSKILLQUEUE:
      r.expectEnd();
      return { type: 'endSkillQueue' };
    // Piece 7 M4: the party packets, as the world or the core reads them ([R §2])
    case PacketType.MEMBERREQUEST: {
      const value = { type: 'partyMemberRequest', ownId: r.u32(), targetId: r.u32(), troup: r.i32() } as const; r.expectEnd(); return value;
    }
    case PacketType.MEMBERREQUESTCANCLE: {
      const value = { type: 'partyMemberCancel', leaderId: r.u32(), memberId: r.u32(), mode: r.i32() } as const; r.expectEnd(); return value;
    }
    case PacketType.ADDPARTYMEMBER: {
      const side = (): PartyRequestSide => ({ id: r.u32(), level: r.i32(), job: r.i32(), sex: r.u32() });
      const value = { type: 'addPartyMember', leader: side(), member: side() } as const; r.expectEnd(); return value;
    }
    case PacketType.REMOVEPARTYMEMBER: {
      const value = { type: 'removePartyMember', ownId: r.u32(), leaveId: r.u32() } as const; r.expectEnd(); return value;
    }
    case PacketType.CHANGETROUP: {
      const ownId = r.u32();
      if (r.i32() === 0) throw new ProtocolError('CHANGETROUP without a name');
      const value = { type: 'changeTroup', ownId, name: r.string(33) } as const; r.expectEnd(); return value;
    }
    case PacketType.PARTYCHANGELEADER: {
      const value = { type: 'partyLeaderChange', ownId: r.u32(), newLeaderId: r.u32() } as const; r.expectEnd(); return value;
    }
    case PacketType.PARTYCHANGEITEMMODE: {
      const value = { type: 'partyItemModeChange', ownId: r.u32(), mode: r.i32() } as const; r.expectEnd(); return value;
    }
    case PacketType.PARTYCHANGEEXPMODE: {
      const value = { type: 'partyExpModeChange', ownId: r.u32(), mode: r.i32() } as const; r.expectEnd(); return value;
    }
    case PacketType.PARTYSKILLUSE: {
      const value = { type: 'partySkillUse', ownId: r.u32(), skill: r.i32() } as const; r.expectEnd(); return value;
    }
    case PacketType.BLOCK: {
      const value = { type: 'blockRequest', gu: r.u8(), ownName: r.string(64), inviterName: r.string(64) } as const;
      r.expectEnd(); return value;
    }
    case PacketType.QUERY_PLAYER_DATA: {
      const value = { type: 'queryPlayerData', playerId: r.u32(), version: r.i32() } as const; r.expectEnd(); return value;
    }
    case PacketType.DOUSEITEM: {
      const id = r.u32(), targetId = r.u32(), part = r.i32(), flightSpeed = r.f32(); r.expectEnd();
      return { type: 'useItem', objectId: id >>> 16, targetId, part, flightSpeed };
    }
    case PacketType.STATEMODE: {
      const mode = r.u32(), flag = r.u8(); r.expectEnd();
      return { type: 'stateMode', mode, flag };
    }
    case PacketType.RETURNSCROLL: {
      const select = r.i32(); r.expectEnd();
      return { type: 'returnScroll', select };
    }
    case PacketType.DOEQUIP: {
      const objectId = r.u32(), part = r.i32(), flightSpeed = r.f32(); r.expectEnd();
      return { type: 'equipItem', objectId, part, flightSpeed };
    }
    case PacketType.PLAYERMOVED2: {
      const move = readFlightReport(r), frames = r.u8(); r.expectEnd();
      return { type: 'playerMoved2', move, frames };
    }
    case PacketType.PLAYERBEHAVIOR2: {
      const move = readFlightReport(r); r.expectEnd();
      return { type: 'playerBehavior2', move };
    }
    case PacketType.PLAYERCORR2: {
      const move = readFlightReport(r); r.expectEnd();
      return { type: 'playerCorr2', move };
    }
    case PacketType.PLAYERANGLE: {
      const angle = readAngleReport(r); r.expectEnd();
      return { type: 'playerAngle', ...angle };
    }
    case PacketType.MELEE_ATTACK2: {
      const message = r.u32(), targetId = r.u32(), param2 = r.i32(), param3 = r.i32(); r.expectEnd();
      return { type: 'meleeAttack2', message, targetId, param2, param3 };
    }
    default: {
      // 2026-11-10: the messenger's packets the browser sends (world/friends.ts)
      const friend = readFriendRequestPacket(packetType, r);
      if (friend !== null) { r.expectEnd(); return friend; }
      return { type: 'unknown', packetType };
    }
  }
}
