// The honour titles' packets (2026-11-11, the honour window `CWndHonor`), both ways. `__VER >= 13`, `__HONORABLE_TITLE`.
//
//   snapshots  CDPClient::OnHonorListAck     Neuz/DPClient.cpp:17242-17278  HONOR_LIST_ACK: MAX_HONOR_TITLE ints, the own
//                                                                          counts (CUser::AddHonorListAck, WORLDSERVER/
//                                                                          User.cpp:7996-8008, object the own player)
//              CDPClient::OnHonorChangeAck   DPClient.cpp:17280-17292       HONOR_CHANGE_ACK: int, the title a mover in view
//                                                                          now shows (CUserMng::AddHonorTitleChange,
//                                                                          User.cpp:7906-7918, object that mover)
//              dispatch                      DPClient.cpp:734-735
//   sender     CDPClient::SendReqHonorTitleChange  DPClient.cpp:17235-17240  HONOR_CHANGE_REQ: int, the title, -1 for none
//              (CDPSrvr::OnHonorChangeReq, WORLDSERVER/DPSrvr.cpp:8312-8335, answers only a title earned, or -1)
//   types      Source/_Network/MsgHdr.h:738-739 (packets), :1257-1258 (snapshots)

import type { ArReader } from '../ar/ArReader';
import { clientPacket } from './packet';

/** `MAX_HONOR_TITLE` (`Source/_Common/ProjectCmn.h:38`): the counts every list carries. */
export const MAX_HONOR_TITLE = 150;

/** The honour packet the client sends (`MsgHdr.h:739`). `HONOR_LIST_REQ` (:738) has no caller in Neuz. */
export const HonorPacket = { HONOR_CHANGE_REQ: 0x70004001 } as const;

/** The honour snapshots (`MsgHdr.h:1257-1258`). */
export const HonorMessageType = { HONOR_LIST_ACK: 0x9300, HONOR_CHANGE_ACK: 0x9301 } as const;

export type HonorMessage =
  /** The own counts of every title (`m_aHonorTitle`), by honour id. */
  | { type: 'honorList'; counts: number[] }
  /** The title the message's mover now shows (`m_nHonor`), -1 for none. */
  | { type: 'honorChange'; honor: number };

/** `MAX_HONOR_TITLE` ints, as `AddHonorListAck` writes them. */
export function readHonorCounts(r: ArReader): number[] {
  return Array.from({ length: MAX_HONOR_TITLE }, () => r.i32());
}

export const HONOR_READERS: ReadonlyArray<[number, (r: ArReader) => HonorMessage]> = [
  [HonorMessageType.HONOR_LIST_ACK, (r) => ({ type: 'honorList', counts: readHonorCounts(r) })],
  [HonorMessageType.HONOR_CHANGE_ACK, (r) => ({ type: 'honorChange', honor: r.i32() })],
];

/** `SendReqHonorTitleChange( nChange )`: the honour id to show, or -1 for none (the list's first row). */
export const encodeHonorTitleChange = (honor: number): Uint8Array =>
  clientPacket(HonorPacket.HONOR_CHANGE_REQ).i32(honor).toBytes();

/** For the pretend servers: an honour packet the client sent, after its type. */
export type HonorRequestPacket = { type: 'honorChangeRequest'; honor: number };

export function readHonorRequestPacket(packetType: number, r: ArReader): HonorRequestPacket | null {
  return packetType === HonorPacket.HONOR_CHANGE_REQ ? { type: 'honorChangeRequest', honor: r.i32() } : null;
}
