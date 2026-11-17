// 2026-11-17 (view-equip-options): the View Equipment window's packets and the two game options the world server keeps as
// mode flags (docs/2026-11-17-view-equip-options.md).
//
//   senders    CDPClient::SendQueryEquip           Neuz/DPClient.cpp:15690-15695   QUERYEQUIP: the player's object ID
//              CDPClient::SendQueryEquipSetting    :15697-15702                    QUERYEQUIPSETTING: BOOL bAllow
//              CDPClient::SendChangePKPVPMode      DPClient.cpp                    MODE: DWORD dwMode, int nFlag
//   server     CDPSrvr::OnQueryEquip               WORLDSERVER/DPSrvr.cpp:4917-4937  EQUIP_DENIAL_MODE and not a GM:
//                                                                                  TID_DIAG_0088; else AddQueryEquip
//              CDPSrvr::OnQueryEquipSetting        :4939-4953                      bAllow clears EQUIP_DENIAL_MODE, else
//                                                                                  sets it; MODIFYMODE to all in view
//              CDPSrvr::OnChangeMode               :4701-4728                      nFlag 2 sets PVPCONFIRM_MODE, 3 clears it
//                                                                                  (0 and 1 FREEPK_MODE); MODIFYMODE
//   snapshot   CUser::AddQueryEquip                WORLDSERVER/User.cpp:2860-2891  QUERYEQUIP about the player: int count,
//                                                                                  then per worn part: int nParts, __int64
//                                                                                  m_iRandomOptItemId, the piercing, BYTE
//                                                                                  m_bItemResist, int m_nResistAbilityOption
//              CDPClient::OnQueryEquip             Neuz/DPClient.cpp:15706-15736
//   types      Source/_Network/MsgHdr.h:390 (MODE), :516-517, :1059

import type { ArReader } from '../ar/ArReader';
import { ProtocolError } from '../errors';
import { clientPacket } from './packet';
import { readPiercing } from './own';

/** The packets the client sends (`MsgHdr.h`). */
export const QueryEquipPacket = {
  QUERYEQUIP: 0xf000d009,
  QUERYEQUIPSETTING: 0xf000d00a,
  /** PACKETTYPE_MODE (`SendChangePKPVPMode`). */
  MODE: 0xffffff7b,
} as const;

/** SNAPSHOTTYPE_QUERYEQUIP (`MsgHdr.h:1059`). */
export const QUERYEQUIP_SNAPSHOT = 0x00ac;

/** `MAX_HUMAN_PARTS` (`Resource/defineNeuz.h`): the parts a QUERYEQUIP can name. */
const MAX_HUMAN_PARTS = 31;

/** `m_dwMode` bits (`_Common/authorization.h:57`, :62): duels refused, the equipment not shown. */
export const PVPCONFIRM_MODE = 0x00002000;
export const EQUIP_DENIAL_MODE = 0x00020000;

/** `SendChangePKPVPMode( PVPCONFIRM_MODE, n )`'s flags: 3 duels accepted (the mode cleared), 2 refused (set). */
export const PVP_ACCEPT = 3;
export const PVP_REFUSE = 2;

/** One worn part's `EQUIP_INFO_ADD` (what ADD_OBJ's `m_aEquipInfo` lacks for the tooltip). */
export interface QueryEquipPart {
  part: number;
  /** `iRandomOptItemId`: the awakening and the blessing. */
  randomOption: bigint;
  /** The piercing's cards and ultimate jewels (`CPiercing::Serialize`). */
  piercing: number[];
  ultimate: number[];
  /** `bItemResist`, the element, and `nResistAbilityOption`, its upgrade. */
  resist: number;
  resistOption: number;
}

export type QueryEquipMessage = { type: 'queryEquip'; parts: QueryEquipPart[] };

/** SNAPSHOTTYPE_QUERYEQUIP: the worn parts' extras of the bundle's player (`OnQueryEquip`, :15706-15725). */
export function readQueryEquip(r: ArReader): QueryEquipMessage {
  const count = r.i32();
  if (count < 0 || count > MAX_HUMAN_PARTS) throw new ProtocolError(`Invalid query equip count ${count}`);
  const parts: QueryEquipPart[] = [];
  for (let i = 0; i < count; i++) {
    const at = r.position();
    const part = r.i32();
    // `aEquipInfoAdd[nParts]`: a part outside the array would write past it in Neuz
    if (part < 0 || part >= MAX_HUMAN_PARTS) throw new ProtocolError(`Invalid query equip part ${part}`, at);
    const randomOption = r.i64();
    const { piercing, ultimate } = readPiercing(r);
    const resist = r.u8();
    const resistOption = r.i32();
    parts.push({ part, randomOption, piercing, ultimate, resist, resistOption });
  }
  return { type: 'queryEquip', parts };
}

export const QUERY_EQUIP_READERS: ReadonlyArray<[number, (r: ArReader) => QueryEquipMessage]> = [
  [QUERYEQUIP_SNAPSHOT, readQueryEquip],
];

const objectIdOf = (id: number): number => {
  if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) throw new ProtocolError('Invalid object ID');
  return id;
};

/** QUERYEQUIP: `ar << objid`, the player whose equipment is asked for. */
export function encodeQueryEquip(objectId: number): Uint8Array {
  return clientPacket(QueryEquipPacket.QUERYEQUIP).u32(objectIdOf(objectId)).toBytes();
}

/** QUERYEQUIPSETTING: `ar << bAllow` (a BOOL), whether others may view the own equipment. */
export function encodeQueryEquipSetting(allow: boolean): Uint8Array {
  return clientPacket(QueryEquipPacket.QUERYEQUIPSETTING).i32(allow ? 1 : 0).toBytes();
}

/** MODE: `ar << dwMode << nFlag`. The browser sends only PVPCONFIRM_MODE with 2 or 3, as the Option window does. */
export function encodeChangeMode(mode: number, flag: number): Uint8Array {
  return clientPacket(QueryEquipPacket.MODE).u32(mode >>> 0).i32(flag).toBytes();
}

/** The packets above, as the world reads them. */
export type QueryEquipRequestPacket =
  | { type: 'queryEquipRequest'; objectId: number }
  | { type: 'queryEquipSetting'; allow: boolean }
  | { type: 'changeMode'; mode: number; flag: number };

export function readQueryEquipRequestPacket(packetType: number, r: ArReader): QueryEquipRequestPacket | null {
  switch (packetType) {
    case QueryEquipPacket.QUERYEQUIP:
      return { type: 'queryEquipRequest', objectId: r.u32() };
    case QueryEquipPacket.QUERYEQUIPSETTING:
      return { type: 'queryEquipSetting', allow: r.i32() !== 0 };
    case QueryEquipPacket.MODE: {
      const mode = r.u32();
      return { type: 'changeMode', mode, flag: r.i32() };
    }
    default:
      return null;
  }
}
