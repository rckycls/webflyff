// Personal housing's windows and rules (2026-11-15, side-session-notes housing-research/A-client.md §3): the Housing window
// (Y, the Start menu), the House List and the House box, the Housing Specialist's and the door's menu entries, the Messenger's
// house entries, and the snapshots (housingBook.ts). The windows are hud/housing/housingWindows.ts; placing a piece is the
// furniture core's (furniture/placement.ts), which the screen runs.
//
//   CWndWorld::OnCommand    _Interface/WndWorld.cpp:5221-5234   MMI_VISIT_FRIEND opens the House List, MMI_RETURNTO_WORLD the
//                                                               House box, MMI_VISIT_MYROOM sends VISITROOM with the own id
//   CWndHousing             _Interface/WndHousing.cpp:97-540    the list, its headers' sort, Install (placing, or a wallpaper or
//                                                               floor at once) and Remove, only in the own room
//   CWndRoomList            _Interface/WndRoomList.cpp:39-135   opened: the list cleared and asked for; OK visits, Refresh asks
//   CWndQuitRoom            _Interface/WndQuitRoom.cpp:75-88    OK sends GOOUT
//
// Going out matches the server's fix (outer branch housing-holes 508bccf: `OnHousingGoOut` returns unless the player is in
// WI_WORLD_MINIROOM): the box's OK sends GOOUT only from inside a room.

import type { HousingMessage, Vec3 } from '@flyffweb/protocol';
import {
  WI_WORLD_MINIROOM, encodeHousingGoOut, encodeHousingReqVisitableList, encodeHousingSetupFurniture,
  encodeHousingSetVisitAllow, encodeHousingVisitRoom,
} from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { Texts } from '../gameData';
import type { UiArt } from '../hud/art';
import { formatDuration } from '../hud/duration';
import { formatText } from '../hud/format';
import { HousingWindow, QuitRoomWindow, RoomListWindow } from '../hud/housing/housingWindows';
import type { HousingRowView } from '../hud/housing/housingWindows';
import { HOUSING_TYPE_TIDS, housingButtons, housingRows, installsAtOnce } from './housingBook';
import type { HousingBook } from './housingBook';
import type { HousingEvent, HousingRow, HousingSort } from './housingBook';

/** What the housing needs of the world screen. */
export interface HousingHudScreen {
  send(bytes: Uint8Array): void;
  /** `PutString( text, NULL, color )`. */
  say(text: string, color: number): void;
  prop(itemId: number): WebItemProp | undefined;
  ownPlayerId(): number;
  worldId(): number;
  /** `time_null()`: the clock's whole seconds. */
  nowSeconds(): number;
  /** A player's name (`GetPlayerString`), '' when not known yet (the data is asked for). */
  playerName(playerId: number): string;
  /** The Messenger's friend list again (`UpdateFriendList`). */
  refreshFriends(): void;
  /** A wallpaper's or floor's texture on (its file) or off (null), or both back (`reset`). */
  papering(event: Extract<HousingEvent, { kind: 'papering' }>): void;
  /** `CDeployManager::LoadToDeploy( dwLinkKind, info )`: the placing of `itemId`'s control; false when it cannot start. */
  startPlacement(itemId: number, ctrlIndex: number): boolean;
  /** `IsReady()`: a piece is being placed. */
  placing(): boolean;
  /** `EndDeploy()` without placing (Install pressed while placing). */
  endPlacement(): void;
}

export class HousingHud {
  readonly book: HousingBook;
  readonly housing: HousingWindow;
  readonly roomList: RoomListWindow;
  readonly quitRoom: QuitRoomWindow;
  private sort: HousingSort = 'type';
  private greater = true;
  /** `m_nSelected - 1`: the chosen row, -1 for none. */
  private chosen = -1;
  private rows: HousingRow[] = [];
  /** The second the list was last drawn (its times count down). */
  private drawnAt = -1;
  /** Install or Remove was pressed: both stay off until a row is chosen again (`EnableWindow( FALSE )`, :500-537). */
  private pressed = false;

  /** `book` is the world screen's: it outlives this HUD, which a world change builds anew (the list comes at login only). */
  constructor(art: UiArt, private readonly texts: Texts, private readonly screen: HousingHudScreen, book: HousingBook,
    doc: Document = document) {
    this.book = book;
    this.housing = new HousingWindow(art, doc);
    this.roomList = new RoomListWindow(art, doc);
    this.quitRoom = new QuitRoomWindow(art, doc);
    this.housing.onSort = (sort) => this.pressHeader(sort);
    this.housing.onChoose = (index) => { this.chosen = index; this.pressed = false; this.draw(); };
    this.housing.onInstall = () => this.install();
    this.housing.onRemove = () => this.remove();
    this.roomList.onVisit = (ownerId) => this.visit(ownerId);
    this.roomList.onRefresh = () => screen.send(encodeHousingReqVisitableList());
    this.quitRoom.onOk = () => this.goOut();
  }

  /** The windows' elements, for the windows' layer. */
  get elements(): HTMLElement[] {
    return [this.housing.window.element, this.roomList.window.element, this.quitRoom.window.element];
  }

  private text(tid: string, fallback = ''): { text: string; color: number } {
    const entry = this.texts.get(tid);
    return { text: entry?.text ?? fallback, color: entry?.color ?? 0xffffffff };
  }

  /** One housing snapshot. */
  handle(message: HousingMessage): void {
    for (const event of this.book.apply(message, this.screen.nowSeconds())) {
      switch (event.kind) {
        case 'line': {
          const { text, color } = this.text(event.tid);
          if (text !== '') this.screen.say(formatText(text, [event.arg]), color);
          break;
        }
        case 'list': this.refresh(); break;
        case 'friends': this.screen.refreshFriends(); break;
        case 'rooms': this.showRooms(); break;
        case 'papering': this.screen.papering(event); break;
      }
    }
  }

  // --- the Housing window ---

  /** Y, the Start menu's Housing line, an applet slot: the window opens (centred) or closes. */
  toggle(): void {
    if (this.housing.isOpen) { this.housing.window.close(); return; }
    this.refresh();
    this.housing.window.open();
  }

  /** `RefreshItemList` (:181-201): the list again, in its order, nothing chosen and both buttons off. */
  private refresh(): void {
    this.rows = housingRows(this.book, (itemId) => this.screen.prop(itemId), this.sort, this.greater);
    this.chosen = -1;
    this.draw();
  }

  private pressHeader(sort: HousingSort): void {
    if (this.sort === sort) this.greater = !this.greater;
    else { this.sort = sort; this.greater = true; }
    this.refresh();
  }

  private rowView(row: HousingRow, now: number): HousingRowView {
    const tid = HOUSING_TYPE_TIDS.get(row.type);
    // 2026-11-14 (owner): every duration short, "29d23h" (hud/duration.ts), where Neuz writes TID_GAME_REMAIN_TIME
    const left = Math.max(0, row.endsAt - now);
    return { type: tid === undefined ? '' : this.text(tid).text, name: row.name, time: formatDuration(left, 's'), placed: row.placed };
  }

  private draw(): void {
    if (!this.housing.isOpen && this.drawnAt >= 0) return;
    const now = this.screen.nowSeconds();
    this.drawnAt = now;
    const row = this.rows[this.chosen];
    this.housing.draw(this.rows.map((r) => this.rowView(r, now)), this.chosen, row?.description ?? '',
      housingButtons(this.pressed ? undefined : row, this.book.inOwnRoom(this.screen.worldId())));
  }

  /** Every frame: the open list's times, once a second. */
  update(): void {
    if (this.housing.isOpen && this.screen.nowSeconds() !== this.drawnAt) this.draw();
  }

  /** Install (:476-513): a piece being placed ends; a wallpaper or a floor goes on at once, anything else is placed. */
  private install(): void {
    const row = this.rows[this.chosen];
    if (row === undefined || !housingButtons(row, this.book.inOwnRoom(this.screen.worldId())).install) return;
    if (this.screen.placing()) this.screen.endPlacement();
    if (installsAtOnce(row.type)) {
      this.screen.send(encodeHousingSetupFurniture({ itemId: row.itemId, placed: true, pos: [0, 0, 0], angle: 0 }, this.screen.nowSeconds()));
    } else {
      const link = this.screen.prop(row.itemId)?.linkKind;
      if (link !== undefined) this.screen.startPlacement(row.itemId, link);
    }
    this.pressed = true;
    this.draw();
  }

  /** Remove (:515-539): only while nothing is being placed. */
  private remove(): void {
    const row = this.rows[this.chosen];
    if (row === undefined || this.screen.placing() || !housingButtons(row, this.book.inOwnRoom(this.screen.worldId())).remove) return;
    this.screen.send(encodeHousingSetupFurniture({ itemId: row.itemId, placed: false, pos: [0, 0, 0], angle: 0 }, this.screen.nowSeconds()));
    this.pressed = true;
    this.draw();
  }

  /** The placing's left click on a free spot (`EndDeploy` and SETUPFURNITURE, WndWorld.cpp:6814-6826). */
  place(itemId: number, pos: Vec3, angle: number): void {
    this.screen.send(encodeHousingSetupFurniture({ itemId, placed: true, pos, angle }, this.screen.nowSeconds()));
  }

  // --- entering and leaving ---

  /** MMI_VISIT_MYROOM (WndWorld.cpp:5231-5234). */
  visitOwnRoom(): void {
    this.visit(this.screen.ownPlayerId());
  }

  /** `SendHousingVisitRoom` (DPClient.cpp:18557-18569): "my room" is set as it is sent. */
  private visit(ownerId: number): void {
    this.book.myRoom = ownerId === this.screen.ownPlayerId();
    this.screen.send(encodeHousingVisitRoom(ownerId));
  }

  /** MMI_VISIT_FRIEND (:5221-5225): the House List, emptied, and the list asked for (`OnInitialUpdate`, WndRoomList.cpp:62-78). */
  openRoomList(): void {
    this.book.visitable = [];
    this.roomList.open();
    this.screen.send(encodeHousingReqVisitableList());
  }

  private showRooms(): void {
    if (!this.roomList.isOpen) return;
    const owners = this.book.visitable.map((id) => ({ id, name: this.screen.playerName(id) })).filter((owner) => owner.name !== '');
    this.roomList.show(owners);
  }

  /** MMI_RETURNTO_WORLD (:5226-5230): the House box. */
  openQuitRoom(): void {
    this.quitRoom.window.open();
  }

  /** The House box's OK (WndQuitRoom.cpp:75-88), only from inside a room (the server's fix, 508bccf). */
  private goOut(): void {
    if (this.screen.worldId() !== WI_WORLD_MINIROOM) return;
    this.screen.send(encodeHousingGoOut());
  }

  // --- the Messenger ---

  /** `m_bVisitAllowed` of a friend. */
  isAllowed(playerId: number): boolean {
    return this.book.isAllowed(playerId);
  }

  /** The friend menu's House Entry Permissions (8) and Cancel Entry Permissions (7) (WndMessengerCtrl.cpp:795-810). */
  setVisitAllow(playerId: number, allow: boolean): void {
    if (playerId > 0) this.screen.send(encodeHousingSetVisitAllow(playerId, allow));
  }

  /** The world changed: the windows close (Neuz's windows stay, but a world change here rebuilds the HUD). */
  reset(): void {
    this.housing.window.close();
    this.roomList.window.close();
    this.quitRoom.window.close();
  }
}
