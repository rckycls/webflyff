// 2026-11-15 (social): the duels' packets, 1:1 and party, both ways (docs/2026-11-15-social-research.md §4), and the region
// a game master's /ctd adds (the Duel Zone, the one place our data lets the menu offer a duel).
//
//   senders    CDPClient::SendDuelRequest ... SendDuelPartyNo   Neuz/DPClient.cpp:9528-9604   two idPlayers, or the asker's
//   snapshots  CDPClient::OnDuelCount ... OnDuelPartyResult     DPClient.cpp:4648-4930        written by CUser::AddDuel* /
//                                                                                            AddSetDuel (WORLDSERVER/User.cpp)
//              CDPClient::OnSetDuel                             DPClient.cpp:15381-15407
//              CDPClient::OnAddRegion                           DPClient.cpp:16149-16180      CUserMng::AddAddRegion
//                                                                                            (User.cpp:7472-7505)
//   types      Source/_Network/MsgHdr.h:300-306 (packets), :919-927, :983-984, :1139 (snapshots)

import type { ArReader } from '../ar/ArReader';
import { ProtocolError } from '../errors';
import { clientPacket } from './packet';

/** The duel packets the client sends (`MsgHdr.h:300-306`). */
export const DuelPacket = {
  DUELREQUEST: 0xffffff23,
  DUELYES: 0xffffff24,
  DUELNO: 0xffffff25,
  DUELPARTYREQUEST: 0xffffff26,
  DUELPARTYYES: 0xffffff27,
  DUELPARTYNO: 0xffffff28,
} as const;

/** The duel snapshots, and ADDREGION (`MsgHdr.h`). */
export const DuelMessageType = {
  DUELREQUEST: 0x0030,
  DUELSTART: 0x0031,
  DUELNO: 0x0032,
  DUELCANCEL: 0x0033,
  DUELPARTYREQUEST: 0x0034,
  DUELPARTYSTART: 0x0035,
  DUELPARTYNO: 0x0036,
  DUELPARTYCANCEL: 0x0037,
  DUELPARTYRESULT: 0x0038,
  SETDUEL: 0x0066,
  DUELCOUNT: 0x0067,
  ADDREGION: 0x00f9,
} as const;

/** `EVE_18` (`_Common/flyffevent.h:8`, the 2nd of the enum): WorldServer.ini's `18`, which the duel menu needs. */
export const EVE_18 = 1;
/** `RA_FIGHT` and `RA_DANGER` (`Resource/define.h:142`): the Duel Zone's attribute. */
export const RA_FIGHT = 0x40;

/**
 * `sizeof( REGIONELEM )` (`_Common/Region.h:16-62`, 32-bit, default packing): 756 bytes, its attribute at 160, its rect
 * (left, top, right, bottom, LONGs) at 164 and its title (`m_szTitle[256]`) at 438.
 */
export const REGIONELEM_SIZE = 756;
const ATTRIBUTE_AT = 160;
const RECT_AT = 164;
const TITLE_AT = 438;
const TITLE_SIZE = 256;
/** `MAX_PTMEMBER_SIZE` (`_Common/party.h`): the most members DUELPARTYSTART can carry. */
const MAX_PTMEMBER_SIZE = 8;

export type DuelMessage =
  /** DUELREQUEST / DUELPARTYREQUEST: the asker's and the asked one's idPlayer (`OnDuelRequest`, :4656-4674). */
  | { type: 'duelRequest'; party: boolean; asker: number; asked: number }
  /** DUELSTART: the other's idPlayer, and 0 start, 1 fight, 2 clear, 3 won, 4 lost (`OnDuelStart`, :4677-4752). */
  | { type: 'duelStart'; target: number; flag: number }
  /** DUELNO / DUELPARTYNO: the object of the one who refused (`OnDuelNo`, :4758-4774). */
  | { type: 'duelNo'; party: boolean; objectId: number }
  /** DUELCANCEL: the other's object (`OnDuelCancel`, :4776-4792). */
  | { type: 'duelCancel'; objectId: number }
  /** DUELPARTYSTART: the other party, its name, its members' objects (NULL_ID offline), 0 start or 1 fight (:4820-4878). */
  | { type: 'duelPartyStart'; partyId: number; name: string; members: number[]; flag: number }
  /** DUELPARTYCANCEL / DUELPARTYRESULT: the other party's idPlayers; the result says whether the own party won. */
  | { type: 'duelPartyEnd'; result: 'cancel' | 'win' | 'lose'; players: number[] }
  /** SETDUEL: a player's `m_nDuel`, `m_nDuelState`, `m_idDuelOther`, `m_idDuelParty` (`OnSetDuel`, :15381-15407). */
  | { type: 'setDuel'; objectId: number; duel: number; state: number; other: number; duelParty: number }
  /** DUELCOUNT: the count shown (3, 2, 1, then 0 "Fight"; `OnDuelCount`, :4648-4654). */
  | { type: 'duelCount'; count: number }
  /** ADDREGION: a region added to a world (`OnAddRegion`): its attribute, rect (x, z), title, the movers it covers. */
  | { type: 'addRegion'; worldId: number; attribute: number; rect: [number, number, number, number]; title: string; movers: number[] };

function readIds(r: ArReader, most = 1 << 16): number[] {
  const count = r.i32();
  if (count < 0 || count > most) throw new ProtocolError('Invalid duel player count');
  return Array.from({ length: count }, () => r.u32());
}

/** `REGIONELEM` as `ar.Read( &re, sizeof(re) )` copies it: what the client reads of it. */
function readRegion(r: ArReader): { attribute: number; rect: [number, number, number, number]; title: string } {
  const bytes = r.bytes(REGIONELEM_SIZE);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const attribute = view.getUint32(ATTRIBUTE_AT, true);
  const rect: [number, number, number, number] = [0, 1, 2, 3].map((i) => view.getInt32(RECT_AT + 4 * i, true)) as [number, number, number, number];
  const title = bytes.subarray(TITLE_AT, TITLE_AT + TITLE_SIZE);
  const end = title.indexOf(0);
  return { attribute, rect, title: String.fromCharCode(...title.subarray(0, end < 0 ? TITLE_SIZE : end)) };
}

export const DUEL_READERS: ReadonlyArray<[number, (r: ArReader) => DuelMessage]> = [
  [DuelMessageType.DUELREQUEST, (r) => { const asker = r.u32(); return { type: 'duelRequest', party: false, asker, asked: r.u32() }; }],
  [DuelMessageType.DUELPARTYREQUEST, (r) => { const asker = r.u32(); return { type: 'duelRequest', party: true, asker, asked: r.u32() }; }],
  [DuelMessageType.DUELSTART, (r) => { const target = r.u32(); return { type: 'duelStart', target, flag: r.i32() }; }],
  [DuelMessageType.DUELNO, (r) => ({ type: 'duelNo', party: false, objectId: r.u32() })],
  [DuelMessageType.DUELPARTYNO, (r) => ({ type: 'duelNo', party: true, objectId: r.u32() })],
  [DuelMessageType.DUELCANCEL, (r) => ({ type: 'duelCancel', objectId: r.u32() })],
  [DuelMessageType.DUELPARTYSTART, (r) => {
    const count = r.i32();
    if (count < 0 || count > MAX_PTMEMBER_SIZE) throw new ProtocolError('Invalid party duel member count');
    const partyId = r.u32();
    const name = r.string(64);
    const members = Array.from({ length: count }, () => r.u32());
    return { type: 'duelPartyStart', partyId, name, members, flag: r.i32() };
  }],
  [DuelMessageType.DUELPARTYCANCEL, (r) => ({ type: 'duelPartyEnd', result: 'cancel', players: readIds(r) })],
  [DuelMessageType.DUELPARTYRESULT, (r) => {
    const win = r.i32() !== 0;
    return { type: 'duelPartyEnd', result: win ? 'win' : 'lose', players: readIds(r) };
  }],
  [DuelMessageType.SETDUEL, (r) => {
    const objectId = r.u32(), duel = r.i32(), state = r.i32(), other = r.u32(), duelParty = r.u32();
    return { type: 'setDuel', objectId, duel, state, other, duelParty };
  }],
  [DuelMessageType.DUELCOUNT, (r) => ({ type: 'duelCount', count: r.i32() })],
  [DuelMessageType.ADDREGION, (r) => {
    const worldId = r.u32();
    const region = readRegion(r);
    return { type: 'addRegion', worldId, ...region, movers: readIds(r) };
  }],
];

const DUEL_TYPES: ReadonlySet<string> = new Set(['duelRequest', 'duelStart', 'duelNo', 'duelCancel', 'duelPartyStart', 'duelPartyEnd', 'setDuel', 'duelCount', 'addRegion']);

/** Whether `message` is one of the duels' snapshots (or ADDREGION). */
export function isDuelMessage(message: { type: string }): message is DuelMessage {
  return DUEL_TYPES.has(message.type);
}

const playerId = (id: number, what: string): number => {
  if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) throw new ProtocolError(`Invalid ${what}`);
  return id;
};

/** DUELREQUEST or DUELPARTYREQUEST: `ar << pSrc->m_idPlayer << pDst->m_idPlayer` (the own player, then the asked one). */
export function encodeDuelRequest(asker: number, asked: number, party = false): Uint8Array {
  return clientPacket(party ? DuelPacket.DUELPARTYREQUEST : DuelPacket.DUELREQUEST)
    .u32(playerId(asker, 'duel asker')).u32(playerId(asked, 'duel target')).toBytes();
}

/** DUELYES or DUELPARTYYES: the asker's idPlayer, then the own. */
export function encodeDuelYes(asker: number, own: number, party = false): Uint8Array {
  return clientPacket(party ? DuelPacket.DUELPARTYYES : DuelPacket.DUELYES)
    .u32(playerId(asker, 'duel asker')).u32(playerId(own, 'duel player')).toBytes();
}

/** DUELNO or DUELPARTYNO: the asker's idPlayer. */
export function encodeDuelNo(asker: number, party = false): Uint8Array {
  return clientPacket(party ? DuelPacket.DUELPARTYNO : DuelPacket.DUELNO).u32(playerId(asker, 'duel asker')).toBytes();
}

/** The duel packets the browser sends, as the world reads them. */
export type DuelRequestPacket =
  | { type: 'duelRequestPacket'; party: boolean; asker: number; asked: number }
  | { type: 'duelYes'; party: boolean; asker: number; own: number }
  | { type: 'duelNoPacket'; party: boolean; asker: number };

export function readDuelRequestPacket(packetType: number, r: ArReader): DuelRequestPacket | null {
  switch (packetType) {
    case DuelPacket.DUELREQUEST:
    case DuelPacket.DUELPARTYREQUEST: {
      const asker = r.u32();
      return { type: 'duelRequestPacket', party: packetType === DuelPacket.DUELPARTYREQUEST, asker, asked: r.u32() };
    }
    case DuelPacket.DUELYES:
    case DuelPacket.DUELPARTYYES: {
      const asker = r.u32();
      return { type: 'duelYes', party: packetType === DuelPacket.DUELPARTYYES, asker, own: r.u32() };
    }
    case DuelPacket.DUELNO:
    case DuelPacket.DUELPARTYNO:
      return { type: 'duelNoPacket', party: packetType === DuelPacket.DUELPARTYNO, asker: r.u32() };
    default:
      return null;
  }
}
