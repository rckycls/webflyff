// 2026-11-15 (social): the couple system's packets, both ways (`__VER >= 13`, `__COUPLE_1117`; docs/2026-11-15-social-
// research.md §2). V15 has one system, "Couple"; there is no marriage.
//
//   senders    CDPClient::SendPropose / SendRefuse / SendCouple / SendDecouple   Neuz/DPClient.cpp:18632-18653
//              (CDPSrvr::OnPropose ... OnDecouple, WORLDSERVER/DPSrvr.cpp:9713-9744)
//   snapshots  CCoupleHelper::OnCouple ... OnAddCoupleExperience     Neuz/couplehelper.cpp:30-111, dispatched at
//                                                                    DPClient.cpp:806-814; written by CUser::AddCouple ...
//                                                                    (WORLDSERVER/User.cpp:3753-3846)
//   types      Source/_Network/MsgHdr.h:777-783 (packets), the 0x97xx snapshots
//
// PROPOSE itself is the Motion window's (world/motion.ts `encodePropose`).

import type { ArReader } from '../ar/ArReader';
import { clientPacket } from './packet';

/** The couple packets the client sends, all with no body but PROPOSE's name (`MsgHdr.h:777-780`). */
export const CouplePacket = {
  PROPOSE: 0x8ffff000,
  REFUSE: 0x8ffff001,
  COUPLE: 0x8ffff002,
  DECOUPLE: 0x8ffff003,
} as const;

/** The couple snapshots (`MsgHdr.h`). 0x9702 is unused. */
export const CoupleMessageType = {
  COUPLE: 0x9700,
  PROPOSE_RESULT: 0x9701,
  COUPLE_RESULT: 0x9703,
  DECOUPLE_RESULT: 0x9704,
  ADD_COUPLE_EXPERIENCE: 0x9705,
} as const;

/** `MAX_PLAYER` (`_Common/ProjectCmn.h`): a name's buffer, as `ReadString( szName, MAX_PLAYER )` reads it. */
const MAX_PLAYER = 64;

export type CoupleMessage =
  /**
   * SNAPSHOTTYPE_COUPLE, the own couple after the join (`CUser::AddCouple`, sent by `CUser::Open` only for a coupled player):
   * `CCouple::Serialize` (`_Common/couple.cpp:116-127`), its EXP and its two players (`idFirst` the higher id).
   */
  | { type: 'couple'; exp: number; first: number; second: number }
  /** PROPOSE_RESULT, a proposal received (`OnProposeResult`, couplehelper.cpp:44-66): the proposer's id and name. */
  | { type: 'proposeResult'; proposerId: number; name: string }
  /** COUPLE_RESULT, a couple made (`OnCoupleResult`, :68-82): the partner's id and name. */
  | { type: 'coupleResult'; partnerId: number; name: string }
  /** DECOUPLE_RESULT, the couple broken up (`OnDecoupleResult`, :84-93). */
  | { type: 'decoupleResult' }
  /** ADD_COUPLE_EXPERIENCE, EXP added (`OnAddCoupleExperience`, :96-111). */
  | { type: 'addCoupleExperience'; exp: number };

export const COUPLE_READERS: ReadonlyArray<[number, (r: ArReader) => CoupleMessage]> = [
  [CoupleMessageType.COUPLE, (r) => {
    const exp = r.i32(), first = r.u32(), second = r.u32();
    return { type: 'couple', exp, first, second };
  }],
  [CoupleMessageType.PROPOSE_RESULT, (r) => {
    const proposerId = r.u32();
    return { type: 'proposeResult', proposerId, name: r.string(MAX_PLAYER) };
  }],
  [CoupleMessageType.COUPLE_RESULT, (r) => {
    const partnerId = r.u32();
    return { type: 'coupleResult', partnerId, name: r.string(MAX_PLAYER) };
  }],
  [CoupleMessageType.DECOUPLE_RESULT, () => ({ type: 'decoupleResult' })],
  [CoupleMessageType.ADD_COUPLE_EXPERIENCE, (r) => ({ type: 'addCoupleExperience', exp: r.i32() })],
];

const COUPLE_TYPES: ReadonlySet<string> = new Set(['couple', 'proposeResult', 'coupleResult', 'decoupleResult', 'addCoupleExperience']);

/** Whether `message` is one of the couple's snapshots. */
export function isCoupleMessage(message: { type: string }): message is CoupleMessage {
  return COUPLE_TYPES.has(message.type);
}

/** REFUSE: No on a proposal (`CWndCoupleMessage` CM_RECEIVEPROPOSE, `_Interface/WndField.cpp:23104-23106`). */
export function encodeRefuse(): Uint8Array {
  return clientPacket(CouplePacket.REFUSE).toBytes();
}

/** COUPLE: Yes on a proposal (WndField.cpp:23100-23102). */
export function encodeCouple(): Uint8Array {
  return clientPacket(CouplePacket.COUPLE).toBytes();
}

/** DECOUPLE: the break-up confirmed (`CM_CANCELCOUPLE`, WndField.cpp:23108-23110). */
export function encodeDecouple(): Uint8Array {
  return clientPacket(CouplePacket.DECOUPLE).toBytes();
}

/** The couple packets the browser sends, as the world reads them (PROPOSE is decoded with the Motion window's). */
export type CoupleRequestPacket = { type: 'refuse' } | { type: 'coupleAccept' } | { type: 'decouple' };

export function readCoupleRequestPacket(packetType: number): CoupleRequestPacket | null {
  switch (packetType) {
    case CouplePacket.REFUSE: return { type: 'refuse' };
    case CouplePacket.COUPLE: return { type: 'coupleAccept' };
    case CouplePacket.DECOUPLE: return { type: 'decouple' };
    default: return null;
  }
}
