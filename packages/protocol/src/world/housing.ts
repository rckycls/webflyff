// Personal housing's packets (2026-11-15, side-session-notes housing-research/B-server.md §3.2, A-client.md §3), both ways.
// The reads copy Neuz's handlers, the writes its senders; the server's writers are `CUser::AddHousing*`
// (`WORLDSERVER/User.cpp:8449-8519`).
//
//   snapshots   CDPClient::OnHousingAllInfo          Neuz/DPClient.cpp:18433-18436  HOUSING_ALLINFO 0x9200: CHousing::Serialize,
//                                                                                   int n, n HOUSINGINFO, int m, m DWORD (the
//                                                                                   friends allowed in), at login
//               OnHousingSetFunitureList            :18437-18458                   HOUSING_FURNITURELIST 0x9201: HOUSINGINFO,
//                                                                                   BOOL add (FALSE: it expired)
//               OnHousingSetupFurniture             :18459-18478                   HOUSING_SETUPFURNITURE 0x9202: HOUSINGINFO
//               OnHousingPaperingInfo               :18479-18511                   HOUSING_PAPERINGINFO 0x9203: DWORD item,
//                                                                                   BOOL on (NULL_ID, FALSE: the default room)
//               OnHousingSetVisitAllow              :18512-18530                   HOUSING_SETVISITALLOW 0x9204: DWORD player,
//                                                                                   BOOL allow
//               OnHousingVisitableList              :18531-18544                   HOUSING_VISITABLELIST 0x9205: int n, n DWORD
//   senders     SendHousingReqSetupFurniture :18545-18550  SendHousingReqSetVisitAllow :18551-18556
//               SendHousingVisitRoom :18557-18569  SendHousingReqVisitableList :18570-18574  SendHousingGoOut (the type alone)
//
// HOUSINGINFO (`_Common/Housing.h:36-46`): DWORD item, time_t (the seconds left: `tKeepTime - time_null()`, 32 bits on our
// Win32 build), BOOL placed, D3DXVECTOR3, float angle; 28 bytes.

import type { ArReader } from '../ar/ArReader';
import type { Vec3 } from '../constants';
import { clientPacket } from './packet';

/** Personal housing's packet types, client to world (`Source/_Network/MsgHdr.h:729-734`). */
export const HousingPacket = {
  SETUPFURNITURE: 0x70003002,
  VISITROOM: 0x70003004,
  SETVISITALLOW: 0x70003005,
  REQVISITABLELIST: 0x70003006,
  GOOUT: 0x70003007,
} as const;

/** Personal housing's snapshot types (`MsgHdr.h:1250-1255`). */
export const HousingMessageType = {
  ALLINFO: 0x9200,
  FURNITURELIST: 0x9201,
  SETUPFURNITURE: 0x9202,
  PAPERINGINFO: 0x9203,
  SETVISITALLOW: 0x9204,
  VISITABLELIST: 0x9205,
} as const;

/** `WI_WORLD_MINIROOM` (`Resource/defineWorld.h:64`): the personal room, one layer per online owner. */
export const WI_WORLD_MINIROOM = 209;

/** The housing items' kinds (`Resource/defineItemkind.h:16, :52-53, :186-194`). */
export const HousingKind = {
  IK1_HOUSING: 7,
  IK2_FURNITURE: 34,
  IK2_PAPERING: 35,
  IK3_BED: 124,
  IK3_SOFA: 125,
  IK3_WARDROBE: 126,
  IK3_CLOSET: 127,
  IK3_TABLE: 128,
  IK3_CABINET: 129,
  IK3_PROPS: 130,
  IK3_WALLPAPER: 131,
  IK3_CARPET: 132,
} as const;

/** One HOUSINGINFO: a listed piece of furniture. */
export interface HousingInfo {
  itemId: number;
  /** The seconds it has left when the message was written (`tKeepTime - time_null()`); the reader adds its own clock. */
  secondsLeft: number;
  placed: boolean;
  pos: Vec3;
  /** Degrees. */
  angle: number;
}

/** Personal housing's snapshots. */
export type HousingMessage =
  | { type: 'housingAllInfo'; furniture: HousingInfo[]; allowed: number[] }
  /** `add` FALSE: the piece expired and left the list. */
  | { type: 'housingFurnitureList'; info: HousingInfo; add: boolean }
  | { type: 'housingSetupFurniture'; info: HousingInfo }
  /** A wallpaper or floor put on or taken off; `itemId` NULL_ID with `on` FALSE puts the room back as it was. */
  | { type: 'housingPapering'; itemId: number; on: boolean }
  | { type: 'housingSetVisitAllow'; playerId: number; allow: boolean }
  | { type: 'housingVisitableList'; owners: number[] };

/** A count of a list: `int nSize` as the reader takes it; a negative one reads no entries. */
const count = (r: ArReader): number => Math.max(0, r.i32());

/** `HOUSINGINFO::Serialize`, the loading side. */
export function readHousingInfo(r: ArReader): HousingInfo {
  const itemId = r.u32(), secondsLeft = r.i32(), placed = r.i32() !== 0;
  const pos = r.vec3();
  return { itemId, secondsLeft, placed, pos, angle: r.f32() };
}

export function readHousingAllInfo(r: ArReader): HousingMessage {
  const furniture = Array.from({ length: count(r) }, () => readHousingInfo(r));
  const allowed = Array.from({ length: count(r) }, () => r.u32());
  return { type: 'housingAllInfo', furniture, allowed };
}

export function readHousingFurnitureList(r: ArReader): HousingMessage {
  const info = readHousingInfo(r);
  return { type: 'housingFurnitureList', info, add: r.i32() !== 0 };
}

export function readHousingSetupFurniture(r: ArReader): HousingMessage {
  return { type: 'housingSetupFurniture', info: readHousingInfo(r) };
}

export function readHousingPapering(r: ArReader): HousingMessage {
  const itemId = r.u32();
  return { type: 'housingPapering', itemId, on: r.i32() !== 0 };
}

export function readHousingSetVisitAllow(r: ArReader): HousingMessage {
  const playerId = r.u32();
  return { type: 'housingSetVisitAllow', playerId, allow: r.i32() !== 0 };
}

export function readHousingVisitableList(r: ArReader): HousingMessage {
  return { type: 'housingVisitableList', owners: Array.from({ length: count(r) }, () => r.u32()) };
}

/** The snapshot readers of personal housing, for `WORLD_READERS`. */
export const HOUSING_READERS: ReadonlyArray<[number, (r: ArReader) => HousingMessage]> = [
  [HousingMessageType.ALLINFO, readHousingAllInfo],
  [HousingMessageType.FURNITURELIST, readHousingFurnitureList],
  [HousingMessageType.SETUPFURNITURE, readHousingSetupFurniture],
  [HousingMessageType.PAPERINGINFO, readHousingPapering],
  [HousingMessageType.SETVISITALLOW, readHousingSetVisitAllow],
  [HousingMessageType.VISITABLELIST, readHousingVisitableList],
];

const HOUSING_TYPES: ReadonlySet<string> = new Set([
  'housingAllInfo', 'housingFurnitureList', 'housingSetupFurniture', 'housingPapering', 'housingSetVisitAllow',
  'housingVisitableList',
]);

/** Whether a world message is one of personal housing's. */
export function isHousingMessage(message: { type: string }): message is HousingMessage {
  return HOUSING_TYPES.has(message.type);
}

// --- the client's packets ---

/** What the client's HOUSINGINFO carries: the room's window sends `tKeepTime` 0 and the placement's angle and point. */
export interface HousingRequest {
  itemId: number;
  placed: boolean;
  pos: Vec3;
  angle: number;
}

/**
 * `SendHousingReqSetupFurniture( housingInfo )`: HOUSINGINFO's storing side, whose time is `tKeepTime - time_null()`; the
 * window's `tKeepTime` is 0 (`WndHousing.cpp:493, :527`), so the field is minus the clock (`nowSeconds`, `time_null()`). The
 * server reads only the item, the flag, the point and the angle (`CHousing::SetupFurniture`, `Housing.cpp:162-186`).
 */
export const encodeHousingSetupFurniture = (request: HousingRequest, nowSeconds: number): Uint8Array =>
  clientPacket(HousingPacket.SETUPFURNITURE).u32(request.itemId).i32(-Math.trunc(nowSeconds) | 0)
    .i32(request.placed ? 1 : 0).vec3(request.pos).f32(request.angle).toBytes();

/** `SendHousingReqSetVisitAllow( dwPlayerId, bAllow )`. */
export const encodeHousingSetVisitAllow = (playerId: number, allow: boolean): Uint8Array =>
  clientPacket(HousingPacket.SETVISITALLOW).u32(playerId).i32(allow ? 1 : 0).toBytes();

/** `SendHousingVisitRoom( dwPlayerId )`: the own id for the own room. */
export const encodeHousingVisitRoom = (ownerId: number): Uint8Array =>
  clientPacket(HousingPacket.VISITROOM).u32(ownerId).toBytes();

/** `SendHousingReqVisitableList()`: the type alone. */
export const encodeHousingReqVisitableList = (): Uint8Array => clientPacket(HousingPacket.REQVISITABLELIST).toBytes();

/** `SendHousingGoOut()` (`CWndQuitRoom`'s OK): the type alone. */
export const encodeHousingGoOut = (): Uint8Array => clientPacket(HousingPacket.GOOUT).toBytes();

/** For the pretend servers: a client packet of personal housing after its type. */
export type HousingRequestPacket =
  | { type: 'housingSetupFurnitureRequest'; itemId: number; keepTime: number; placed: boolean; pos: Vec3; angle: number }
  | { type: 'housingSetVisitAllowRequest'; playerId: number; allow: boolean }
  | { type: 'housingVisitRoomRequest'; ownerId: number }
  | { type: 'housingReqVisitableListRequest' }
  | { type: 'housingGoOutRequest' };

export function readHousingRequestPacket(packetType: number, r: ArReader): HousingRequestPacket | null {
  switch (packetType) {
    case HousingPacket.SETUPFURNITURE: {
      const itemId = r.u32(), keepTime = r.i32(), placed = r.i32() !== 0;
      const pos = r.vec3();
      return { type: 'housingSetupFurnitureRequest', itemId, keepTime, placed, pos, angle: r.f32() };
    }
    case HousingPacket.SETVISITALLOW: {
      const playerId = r.u32();
      return { type: 'housingSetVisitAllowRequest', playerId, allow: r.i32() !== 0 };
    }
    case HousingPacket.VISITROOM:
      return { type: 'housingVisitRoomRequest', ownerId: r.u32() };
    case HousingPacket.REQVISITABLELIST:
      return { type: 'housingReqVisitableListRequest' };
    case HousingPacket.GOOUT:
      return { type: 'housingGoOutRequest' };
    default:
      return null;
  }
}
