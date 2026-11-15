// The guild house's client state (2026-11-15, side-session-notes housing-research/A-client.md §2): `CGuildHouseBase` as Neuz
// keeps it (`_Common/GuildHouse.cpp`, the `__CLIENT` parts) and what each snapshot does to it (`CDPClient::OnGuildHouse*`,
// `Neuz/DPClient.cpp:19011-19049`), and the Furniture Storage window's rows (`CWndGuildHousing`, `_Interface/WndHousing.cpp:
// 553-1430`). No DOM here: guildHouse/guildHouseHud.ts draws and sends.
//
//   SerializeAllInfo         GuildHouse.cpp:713-750   the house, its upkeep's end and the furniture list, at login
//   OnGuildHousePacket       :752-813                 LISTUP pushes, LISTDROP erases, SETUP / REMOVE / RESET / REFRESH take the
//                                                     record at its index (when the item matches), UPKEEP sets the end, EXPIRED
//                                                     takes every piece down; SETUP, REMOVE and RESET say a line
//   ApplyEFTexture           :206-246                 the placed wallpaper and floor, else the room's own
//   OnRestPoint              DPClient.cpp:19037-19049 `m_nExtraExp`, the rest gauge's percent

import type { GuildFurniture, GuildHouseMessage, Vec3 } from '@flyffweb/protocol';
import { GuildHouseKind, GuildHousePacketType, HousingKind, MAX_REST_POINT, NULL_ID } from '@flyffweb/protocol';

/** One listed piece: its record, with its end in `time_null()` seconds (0: its timer has not started). */
export interface GuildPiece {
  itemId: number;
  placed: boolean;
  pos: Vec3;
  angle: number;
  objectId: number;
  endsAt: number;
}

/** What the book reads of an item (`ItemProp`). */
export interface GuildHouseItemProp {
  name: string;
  kind2: number;
  kind3: number;
  abilityMin: number;
  abilityMax?: number;
  textFile?: string;
  description?: string;
  linkKind?: number;
  icon?: string | null;
}

export type GuildHouseEvent =
  | { kind: 'line'; tid: string; arg: string }
  /** The Furniture Storage list again (`RefreshItemList`), and the papers (`ApplyEFTexture`). */
  | { kind: 'list' }
  | { kind: 'rest' };

export class GuildHouseBook {
  /** `m_bSetFurnitureChannel`: furniture may be placed on this channel (ENABLE_GUILD_INVENTORY). */
  channel = false;
  /** `m_dwGuildId`, `m_dwWorldId` (NULL_ID / 0 without a house). */
  guildId = 0;
  worldId = 0;
  /** `m_tUpkeepTime`: when the upkeep runs out (`time_null()` seconds), 0 for none or ran out. */
  upkeepEndsAt = 0;
  /** `m_vecFntInfo`, in the server's order: a request names a piece by its index here. */
  pieces: GuildPiece[] = [];
  /** `m_nExtraExp`: the rest gauge, 0-100. */
  restPercent = 0;
  /** `m_dwSelectedObjID`: the placed piece last clicked in the world (or chosen in the list). */
  selected = NULL_ID;

  constructor(private readonly prop: (itemId: number) => GuildHouseItemProp | undefined) {}

  get hasHouse(): boolean {
    return this.worldId !== 0;
  }

  private piece(f: GuildFurniture, now: number): GuildPiece {
    return {
      itemId: f.itemId, placed: f.placed, pos: [...f.pos], angle: f.angle, objectId: f.objectId,
      endsAt: f.secondsLeft > 0 ? now + f.secondsLeft : 0,
    };
  }

  /** One snapshot at `now` (`time_null()`, whole seconds). */
  apply(message: GuildHouseMessage, now: number): GuildHouseEvent[] {
    switch (message.type) {
      case 'guildHouseAllInfo':
        this.channel = message.channel;
        if (message.house !== null) {
          this.guildId = message.house.guildId;
          this.worldId = message.house.worldId;
          this.upkeepEndsAt = message.house.upkeepSecondsLeft > 0 ? now + message.house.upkeepSecondsLeft : 0;
          this.pieces = message.house.furniture.map((f) => this.piece(f, now));
        }
        return [{ kind: 'list' }];
      case 'guildHouseRemove':
        this.pieces = [];
        return [{ kind: 'list' }];
      case 'guildHouseRestPoint':
        this.restPercent = Math.trunc((message.restPoint * 100) / MAX_REST_POINT);
        return [{ kind: 'rest' }];
      case 'guildHousePacket':
        return this.packet(message.packetType, message.index, message.furniture, now);
    }
  }

  private packet(type: number, index: number, f: GuildFurniture, now: number): GuildHouseEvent[] {
    const name = this.prop(f.itemId)?.name;
    const line = (tid: string): GuildHouseEvent[] => (name === undefined ? [] : [{ kind: 'line', tid, arg: name }]);
    const matches = index >= 0 && index < this.pieces.length && this.pieces[index]!.itemId === f.itemId;
    switch (type) {
      case GuildHousePacketType.LISTUP:
        this.pieces.push(this.piece(f, now));
        break;
      case GuildHousePacketType.LISTDROP:
        if (index >= 0 && index < this.pieces.length) this.pieces.splice(index, 1);
        break;
      case GuildHousePacketType.SETUP:
        if (matches) this.pieces[index] = this.piece(f, now);
        return [...line('TID_GAME_GUILDHOUSE_FUR_INSTALL_SUCCESS'), { kind: 'list' }];
      case GuildHousePacketType.REMOVE:
        if (matches) this.pieces[index] = this.piece(f, now);
        return [...line('TID_GAME_GUILDHOUSE_FUR_DISMANTLE_SUCCESS'), { kind: 'list' }];
      case GuildHousePacketType.RESET:
        // ResetFurnitureCtrl: a teleporter is never reinstalled
        if (matches && this.prop(f.itemId)?.kind3 !== GuildHouseKind.IK3_TELEPORTER) this.pieces[index] = this.piece(f, now);
        return [...line('TID_GAME_GUILDHOUSE_FUR_REINSTALL_SUCCESS'), { kind: 'list' }];
      case GuildHousePacketType.REFRESH:
        if (matches) this.pieces[index] = this.piece(f, now);
        break;
      case GuildHousePacketType.UPKEEP:
        this.upkeepEndsAt = f.secondsLeft > 0 ? now + f.secondsLeft : 0;
        break;
      case GuildHousePacketType.EXPIRED:
        for (const piece of this.pieces) if (piece.placed) { piece.placed = false; piece.objectId = NULL_ID; }
        this.upkeepEndsAt = 0;
        break;
      default:
        return [];
    }
    return [{ kind: 'list' }];
  }

  /** `Find( objId )`: the listed piece placed as that object, and its index; null for none. */
  find(objectId: number): { piece: GuildPiece; index: number } | null {
    const index = this.pieces.findIndex((p) => p.objectId === objectId);
    return index < 0 ? null : { piece: this.pieces[index]!, index };
  }

  /** `ApplyEFTexture`: the placed wallpaper's and floor's texture files, null for the room's own. */
  papers(): { wall: string | null; floor: string | null } {
    let wall: string | null = null, floor: string | null = null;
    for (const piece of this.pieces) {
      const p = this.prop(piece.itemId);
      if (p === undefined || !piece.placed) continue;
      if (p.kind2 !== GuildHouseKind.IK2_GUILDHOUSE_FURNITURE && p.kind2 !== GuildHouseKind.IK2_GUILDHOUSE_PAPERING) continue;
      if (p.kind3 === HousingKind.IK3_WALLPAPER) wall = p.textFile ?? null;
      if (p.kind3 === HousingKind.IK3_CARPET) floor = p.textFile ?? null;
    }
    return { wall, floor };
  }

  /**
   * The record a request carries for the piece at `index` (`GH_Fntr_Info::Serialize`'s storing side): its time is the seconds
   * left (`tKeepTime - time_null()`), 0 for a timer not started.
   */
  record(index: number, now: number): GuildFurniture | null {
    const p = this.pieces[index];
    if (p === undefined) return null;
    return { itemId: p.itemId, placed: p.placed, pos: [...p.pos], angle: p.angle, objectId: p.objectId, secondsLeft: p.endsAt > 0 ? p.endsAt - now : 0 };
  }

  /** `ResetValues` / leaving the guild: nothing kept. */
  clear(): void {
    this.channel = false; this.guildId = 0; this.worldId = 0; this.upkeepEndsAt = 0; this.pieces = []; this.restPercent = 0;
    this.selected = NULL_ID;
  }
}

// --- the Furniture Storage window's rows ---

/** The window's two sections (`GS_FURNITURE`, `GS_TELEPORTER`). */
export type StorageSection = 'furniture' | 'teleporter';
/** The headers a press sorts by (WIDC_STATIC1-3); null before the first press (`m_nSortType` is never set before it). */
export type StorageSort = 'name' | 'time' | 'placed' | null;

/** One row: `HOUSING_ITEM` of the guild window. */
export interface StorageRow {
  /** `m_nSlotIndex`: the piece's index in the house's list, which a request names. */
  slot: number;
  itemId: number;
  name: string;
  description: string;
  icon: string | null;
  placed: boolean;
  objectId: number;
  /** `m_dwTime`: the end (`time_null()` seconds), or for a timer not started its prop length in seconds. */
  time: number;
  /** The timer has not started (never placed): its time is the prop's, and the row says " (NEW)". */
  fresh: boolean;
  kind3: number;
}

/** The combo box's kinds (`AutoAddingComboItems`, :1258-1291), 0 for all: the TIDs and their IK3. */
export const STORAGE_KINDS: ReadonlyArray<[string, number]> = [
  ['TID_GAME_GUILDHOUSE_FURKIND', 0],
  ['TID_MMI_GHOUSE_BED', HousingKind.IK3_BED],
  ['TID_MMI_GHOUSE_TABLE', HousingKind.IK3_TABLE],
  ['TID_MMI_GHOUSE_SOFA', HousingKind.IK3_SOFA],
  ['TID_MMI_GHOUSE_DESK', GuildHouseKind.IK3_DESK],
  ['TID_MMI_GHOUSE_CHAIR', GuildHouseKind.IK3_CHAIR],
  ['TID_MMI_GHOUSE_CASE', GuildHouseKind.IK3_CASE],
  ['TID_MMI_GHOUSE_CLOSET', HousingKind.IK3_CLOSET],
  ['TID_MMI_GHOUSE_WARDROBE', HousingKind.IK3_WARDROBE],
  ['TID_MMI_GHOUSE_CARPET', HousingKind.IK3_CARPET],
  ['TID_MMI_GHOUSE_WALLPAPER', HousingKind.IK3_WALLPAPER],
];

/** `RefreshItemList` (:796-858) and `Sort` (:920-944): the section's pieces of the chosen kind, in the chosen order. */
export function storageRows(book: Pick<GuildHouseBook, 'pieces'>, prop: (itemId: number) => GuildHouseItemProp | undefined,
  section: StorageSection, kind3: number, sort: StorageSort, greater: boolean): StorageRow[] {
  const rows: StorageRow[] = [];
  book.pieces.forEach((piece, slot) => {
    const p = prop(piece.itemId);
    if (p === undefined) return;
    if (kind3 !== 0 && p.kind3 !== kind3) return;
    if (section === 'furniture' && p.kind2 === GuildHouseKind.IK2_GUILDHOUSE_NPC) return;
    if (section === 'teleporter' && (p.kind2 === GuildHouseKind.IK2_GUILDHOUSE_FURNITURE || p.kind2 === GuildHouseKind.IK2_GUILDHOUSE_PAPERING)) return;
    const fresh = piece.endsAt <= 0;
    rows.push({
      slot, itemId: piece.itemId, name: p.name, description: p.description ?? '', icon: p.icon ?? null, placed: piece.placed,
      objectId: piece.objectId, time: fresh ? p.abilityMin * 60 : piece.endsAt, fresh, kind3: p.kind3,
    });
  });
  if (sort === null || rows.length < 2) return rows;
  const compare: (a: StorageRow, b: StorageRow) => number =
    sort === 'name' ? (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
      : sort === 'time' ? (a, b) => b.time - a.time
        : (a, b) => Number(b.placed) - Number(a.placed);
  return rows.sort(greater ? compare : (a, b) => compare(b, a));
}

/**
 * `UpdateIRButton` (:860-918): each row's install/remove button is on with the Furniture right in a guild house world; in
 * the teleporter section, with one placed, the others are off (one teleporter at a time).
 */
export function storageButtons(rows: readonly StorageRow[], allowed: boolean, section: StorageSection): boolean[] {
  const anyPlaced = section === 'teleporter' && rows.some((r) => r.placed);
  return rows.map((row) => allowed && (!anyPlaced || row.placed));
}

/** What a row's button does (`OnChildNotify`, :990-1050): placed comes down; a teleporter, wallpaper or floor goes up at once; else it is placed. */
export function storageAction(row: StorageRow): 'remove' | 'setupAtOnce' | 'place' {
  if (row.placed) return 'remove';
  if (row.kind3 === GuildHouseKind.IK3_TELEPORTER || row.kind3 === HousingKind.IK3_WALLPAPER || row.kind3 === HousingKind.IK3_CARPET) return 'setupAtOnce';
  return 'place';
}
