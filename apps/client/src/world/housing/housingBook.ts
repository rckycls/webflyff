// Personal housing's client state (2026-11-15, side-session-notes housing-research/A-client.md §3): `CHousing` as Neuz
// keeps it, and what each snapshot does to it (`CDPClient::OnHousing*`, `Neuz/DPClient.cpp:18433-18544`), and the Housing
// window's rows (`CWndHousing`, `_Interface/WndHousing.cpp:97-261`). No DOM here: housing/housingHud.ts draws and sends.
//
//   CHousing::Serialize          _Common/Housing.cpp:73-112     the list and the allow list, replaced at login
//   CHousing::SetFurnitureList   :129-142                       a piece listed (pushed) or expired (removed by its item)
//   CHousing::SetupFurniture     :162-186                       placed or taken down; a placed one keeps its point and angle
//   CHousing::SetVisitAllow      :188-219                       a friend allowed in (pushed) or removed
//   CDeployManager::SetMyRoom    Neuz/DPClient.cpp:18557-18569  set when VISITROOM is sent: the own id is the own room

import type { HousingInfo, HousingMessage, Vec3 } from '@flyffweb/protocol';
import { HousingKind, NULL_ID, WI_WORLD_MINIROOM } from '@flyffweb/protocol';

/** One listed piece: its item, when it ends (in `time_null()` seconds: the seconds left plus the clock it came at). */
export interface HousingPiece {
  itemId: number;
  endsAt: number;
  placed: boolean;
  pos: Vec3;
  angle: number;
}

/** What a snapshot asks the windows, the chat and the room to do. */
export type HousingEvent =
  /** A chat line, `PutString( Format( GETTEXT( tid ), arg ), GETTEXTCOLOR( tid ) )`. */
  | { kind: 'line'; tid: string; arg: string }
  /** The Housing window's list again (`CWndHousing::RefreshItemList`). */
  | { kind: 'list' }
  /** The Messenger's friend list again (`UpdateFriendList`). */
  | { kind: 'friends' }
  /** The House List again (`CWndRoomList::Refresh`). */
  | { kind: 'rooms' }
  /** A wallpaper or a floor on (its texture file) or off; `reset` both back (`ChangeWallTex()`, `ChangeTileTex()`). */
  | { kind: 'papering'; wall?: string | null; floor?: string | null; reset?: boolean };

/** What the book reads of an item (`ItemProp`). */
export interface HousingItemProp {
  name: string;
  kind2: number;
  kind3: number;
  textFile?: string;
  description?: string;
  linkKind?: number;
}

export class HousingBook {
  /** `m_vecHousingInfo`, in the server's order. */
  pieces: HousingPiece[] = [];
  /** `m_vecIdVisitAllow`: the friends allowed into the own room. */
  allowed: number[] = [];
  /** `m_vecVisitable`: the online owners who allowed the player in (the House List). */
  visitable: number[] = [];
  /** `CDeployManager::m_bIsMyRoom`: the last VISITROOM sent was for the own room. */
  myRoom = false;

  constructor(private readonly prop: (itemId: number) => HousingItemProp | undefined,
    private readonly playerName: (playerId: number) => string) {}

  private piece(info: HousingInfo, now: number): HousingPiece {
    return { itemId: info.itemId, endsAt: now + info.secondsLeft, placed: info.placed, pos: [...info.pos], angle: info.angle };
  }

  /** One snapshot at `now` (`time_null()`, whole seconds): what it changes, and what then follows. */
  apply(message: HousingMessage, now: number): HousingEvent[] {
    switch (message.type) {
      case 'housingAllInfo':
        this.pieces = message.furniture.map((info) => this.piece(info, now));
        this.allowed = [...message.allowed];
        return [{ kind: 'list' }, { kind: 'friends' }];
      case 'housingFurnitureList': {
        const { info, add } = message;
        if (add) this.pieces.push(this.piece(info, now));
        else this.pieces = this.pieces.filter((p) => p.itemId !== info.itemId);
        const name = this.prop(info.itemId)?.name;
        const events: HousingEvent[] = [{ kind: 'list' }];
        if (name !== undefined) events.push({ kind: 'line', tid: add ? 'TID_GAME_HOUSING_ADDITION' : 'TID_GAME_HOUSING_TIMEOUT', arg: name });
        return events;
      }
      case 'housingSetupFurniture': {
        const { info } = message;
        const piece = this.pieces.find((p) => p.itemId === info.itemId);
        if (piece !== undefined) {
          piece.placed = info.placed;
          if (info.placed) { piece.pos = [...info.pos]; piece.angle = info.angle; }
        }
        const name = this.prop(info.itemId)?.name;
        const events: HousingEvent[] = [{ kind: 'list' }];
        if (name !== undefined) events.push({ kind: 'line', tid: info.placed ? 'TID_GAME_HOUSING_INSTALL' : 'TID_GAME_HOUSING_DEMOUNT', arg: name });
        return events;
      }
      case 'housingPapering': {
        // OnHousingPaperingInfo (:18479-18511): NULL_ID and FALSE put both back; else the item's kind says which
        if (message.itemId === NULL_ID && !message.on) return [{ kind: 'papering', reset: true }];
        const prop = this.prop(message.itemId);
        if (prop === undefined || prop.kind2 !== HousingKind.IK2_PAPERING) return [];
        const texture = message.on ? prop.textFile ?? null : null;
        if (prop.kind3 === HousingKind.IK3_WALLPAPER) return [{ kind: 'papering', wall: texture }];
        if (prop.kind3 === HousingKind.IK3_CARPET) return [{ kind: 'papering', floor: texture }];
        return [];
      }
      case 'housingSetVisitAllow': {
        const { playerId, allow } = message;
        if (allow) this.allowed.push(playerId);
        else {
          const at = this.allowed.indexOf(playerId);
          if (at >= 0) this.allowed.splice(at, 1);
        }
        return [
          { kind: 'line', tid: allow ? 'TID_GAME_HOUSING_INVIATION' : 'TID_GAME_HOUSING_INVIATION_CANCEL', arg: this.playerName(playerId) },
          { kind: 'friends' },
        ];
      }
      case 'housingVisitableList':
        this.visitable = [...message.owners];
        return [{ kind: 'rooms' }];
    }
  }

  /** `m_bVisitAllowed` of a friend's row. */
  isAllowed(playerId: number): boolean {
    return this.allowed.includes(playerId);
  }

  /** `pWorld->GetID() == WI_WORLD_MINIROOM && IsMyRoom()`: Install and Remove work only in the own room. */
  inOwnRoom(worldId: number): boolean {
    return worldId === WI_WORLD_MINIROOM && this.myRoom;
  }
}

// --- the Housing window's rows ---

/** The columns a header press sorts by (WIDC_STATIC2-5). */
export type HousingSort = 'type' | 'name' | 'time' | 'placed';

/** `TID_GAME_HOUSING_*` of each IK3 (`OnDraw`, :124-152); none for another kind. */
export const HOUSING_TYPE_TIDS: ReadonlyMap<number, string> = new Map([
  [HousingKind.IK3_BED, 'TID_GAME_HOUSING_BED'],
  [HousingKind.IK3_SOFA, 'TID_GAME_HOUSING_SOFA'],
  [HousingKind.IK3_WARDROBE, 'TID_GAME_HOUSING_WARDROBE'],
  [HousingKind.IK3_CLOSET, 'TID_GAME_HOUSING_CLOSET'],
  [HousingKind.IK3_TABLE, 'TID_GAME_HOUSING_TABLE'],
  [HousingKind.IK3_CABINET, 'TID_GAME_HOUSING_CABINET'],
  [HousingKind.IK3_PROPS, 'TID_GAME_HOUSING_PROPS'],
  [HousingKind.IK3_WALLPAPER, 'TID_GAME_HOUSING_WALLPAPER'],
  [HousingKind.IK3_CARPET, 'TID_GAME_HOUSING_CARPET'],
]);

/** One row: `HOUSING_ITEM`. */
export interface HousingRow {
  itemId: number;
  type: number;
  name: string;
  description: string;
  endsAt: number;
  placed: boolean;
}

/**
 * `RefreshItemList` and `Sort` (:181-228): the rows in the chosen order. The comparisons are Neuz's: "greater" puts the
 * higher type, the later end and the placed ones first, but the names in rising order (`CompName_Greater` is `<`), and the
 * other way round when the same header is pressed again. A stable sort (std::sort is not; equal rows keep the list's order).
 */
export function housingRows(book: Pick<HousingBook, 'pieces'>, prop: (itemId: number) => HousingItemProp | undefined,
  sort: HousingSort, greater: boolean): HousingRow[] {
  const rows = book.pieces.map((piece): HousingRow => {
    const p = prop(piece.itemId);
    return {
      itemId: piece.itemId, type: p?.kind3 ?? 0, name: p?.name ?? `Item ${piece.itemId}`, description: p?.description ?? '',
      endsAt: piece.endsAt, placed: piece.placed,
    };
  });
  if (rows.length < 2) return rows;
  const compare: (a: HousingRow, b: HousingRow) => number =
    sort === 'type' ? (a, b) => b.type - a.type
      : sort === 'name' ? (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
        : sort === 'time' ? (a, b) => b.endsAt - a.endsAt
          : (a, b) => Number(b.placed) - Number(a.placed);
  return rows.sort(greater ? compare : (a, b) => compare(b, a));
}

/** What Install and Remove may do for the chosen row (`OnChildNotify`'s WIDC_LISTBOX1, :423-474). */
export function housingButtons(row: HousingRow | undefined, ownRoom: boolean): { install: boolean; remove: boolean } {
  if (row === undefined || !ownRoom) return { install: false, remove: false };
  return { install: !row.placed, remove: row.placed };
}

/** Whether Install puts the item on at once (a wallpaper, a floor) instead of placing it (`:483-500`). */
export function installsAtOnce(type: number): boolean {
  return type === HousingKind.IK3_WALLPAPER || type === HousingKind.IK3_CARPET;
}
