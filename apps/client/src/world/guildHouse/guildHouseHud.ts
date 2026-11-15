// The guild house's windows and rules (2026-11-15, side-session-notes housing-research/A-client.md §2): the Guild House menu
// (opened by itself inside), Furniture Storage (R, the menu's Furniture Storage and Teleporter), the Maintenance Fee window,
// the "Installed" strip while a piece is placed, Bertha's and the door's entries, and the placed pieces' menu (Information,
// Reinstall, Remove). The state is guildHouseBook.ts; the placing is the furniture core's, which the screen runs.
//
//   CWndWorld::OnCommand          _Interface/WndWorld.cpp:6091-6133    Pay Maintenance Fee (the right, else TID_GAME_GUILDHOUSE_
//                                                                      TAX_LEVEL), Enter, Exit, Purchase (no box)
//   CWorld::InProcessing / Out    _Common/WorldEnvironment.cpp:51-94   in a guild house world the menu opens and the papers go on;
//                                                                      out of it the menu closes and a piece being placed ends
//   CWndGHMainMenu                _Interface/WndGuildHouse.cpp:59-222  the five buttons, the time left
//   CWndGuildHousing              _Interface/WndHousing.cpp:553-1430   the rows, the install / remove buttons, hidden while a piece
//                                                                      is placed (SETUP), with the "Installed" strip
//   CWndWorld::ShowCCtrlMenu      WndWorld.cpp:11442-11477             a placed piece pressed: Information / Reinstall / Remove
//   CWndMenu::OnCommand           WndControl.cpp:3575-3603             Information opens the storage, Reinstall places it again
//                                                                      (RESET), Remove sends REMOVE

import type { GuildFurniture, GuildHouseMessage, Vec3 } from '@flyffweb/protocol';
import {
  GuildHousePacketType, GuildPower, NULL_ID, WI_GUILDHOUSE_MIDDLE, encodeGuildHouseBuy, encodeGuildHouseEnter,
  encodeGuildHouseGoOut, encodeGuildHousePacket, isGuildHouseWorld,
} from '@flyffweb/protocol';
import type { Texts } from '../gameData';
import type { UiArt } from '../hud/art';
import { formatDuration } from '../hud/duration';
import { formatText } from '../hud/format';
import { FurnitureStorageWindow, GuildHouseMenuWindow, ShowOneWindow, UpkeepWindow } from '../hud/guildHouse/guildHouseWindows';
import type { StorageRowView } from '../hud/guildHouse/guildHouseWindows';
import { hasPower } from '../guild/guildRules';
import type { GuildLike } from '../guild/guildRules';
import { withCommas } from '../vendor/vendorRules';
import { STORAGE_KINDS, storageAction, storageButtons, storageRows } from './guildHouseBook';
import type { GuildHouseBook, GuildHouseItemProp, StorageRow, StorageSection, StorageSort } from './guildHouseBook';
import type { PlacementOptions } from '../furniture/placement';

/** `MAX_UPKEEP_DAY - 1` (WndGuildHouse.cpp:627): the most days the window pays. */
export const MAX_UPKEEP_DAYS = 34;
/** `UPKEEP_DAY_PENYA_SMALL` / `_MIDDLE` (GuildHouse.h:32-33). */
export const upkeepDayCost = (worldId: number): number => (worldId === WI_GUILDHOUSE_MIDDLE ? 24_000_000 : 2_400_000);

/** `MMI_GHOUSE_INFO`, `REINSTALL`, `RECALL` (`Resource/defineNeuz.h:269-271`): the placed piece's menu. */
export const GHouseMenu = { INFO: 143, REINSTALL: 144, RECALL: 145 } as const;

/** What the guild house needs of the world screen. */
export interface GuildHouseHudScreen {
  send(bytes: Uint8Array): void;
  say(text: string, color: number): void;
  prop(itemId: number): GuildHouseItemProp | undefined;
  ownPlayerId(): number;
  worldId(): number;
  nowSeconds(): number;
  /** The own guild (its ranks' rights), or null. */
  guild(): GuildLike | null;
  /** The own mover's point (`g_pPlayer->GetPos()`). */
  ownPos(): Vec3 | null;
  /** The guild window on its Permissions tab, or closed (`SetCurTab( 4 )`). */
  togglePermissions(): void;
  /** The guild bank opened (GUILD_BANK_WND) or closed (GUILD_BANK_WND_CLOSE). */
  toggleGuildBank(): void;
  papers(wall: string | null, floor: string | null): void;
  /** The rest gauge's percent (the status window). */
  rest(percent: number): void;
  /** The furniture core's placing of `itemId`'s control; `placed` gets the copy's point and angle (`EndDeploy`). */
  startPlacement(itemId: number, ctrlIndex: number, options: PlacementOptions, placed: (pos: Vec3, angle: number) => void): boolean;
  placing(): boolean;
  /** The place the menu opens at (the layer's top right, below the map). */
  menuAt(): { x: number; y: number };
  /** The strip's place: the top, in the middle (`OnInitialUpdate`, WndHousing.cpp:1452-1460). */
  stripAt(width: number): { x: number; y: number };
}

export class GuildHouseHud {
  readonly menu: GuildHouseMenuWindow;
  readonly storage: FurnitureStorageWindow;
  readonly upkeep: UpkeepWindow;
  readonly strip: ShowOneWindow;
  private section: StorageSection = 'furniture';
  private kind3 = 0;
  private sort: StorageSort = null;
  private greater = true;
  private rows: StorageRow[] = [];
  /** The row a SETUP placing is for (`m_nWndDeployingIndex`), null when none. */
  private deploying: StorageRow | null = null;
  private storageAway = false;
  /** 2026-11-15 (consistency scan): where the storage was while it stepped aside for a placing, to come back there. */
  private storageAt: { x: number; y: number } | 'center' = 'center';
  private drawnAt = -1;

  constructor(art: UiArt, private readonly texts: Texts, private readonly screen: GuildHouseHudScreen,
    readonly book: GuildHouseBook, doc: Document = document) {
    this.menu = new GuildHouseMenuWindow(art, doc);
    this.storage = new FurnitureStorageWindow(art, doc);
    this.upkeep = new UpkeepWindow(art, MAX_UPKEEP_DAYS, (days) => withCommas(days * upkeepDayCost(book.worldId)), doc);
    this.strip = new ShowOneWindow(art, doc);
    this.menu.onPermissions = () => screen.togglePermissions();
    this.menu.onFurniture = () => this.toggleSection('furniture');
    this.menu.onStorage = () => screen.toggleGuildBank();
    this.menu.onTeleporter = () => this.toggleSection('teleporter');
    this.menu.onUpkeep = () => this.toggleUpkeep();
    this.storage.onSort = (sort) => {
      if (this.sort === sort) this.greater = !this.greater;
      else { this.sort = sort; this.greater = true; }
      this.refresh();
    };
    this.storage.onKind = (index) => { this.kind3 = STORAGE_KINDS[index]?.[1] ?? 0; this.refresh(); };
    this.storage.onChoose = (index) => { this.book.selected = this.rows[index]?.objectId ?? NULL_ID; this.draw(); };
    this.storage.onButton = (index) => this.pressRow(index);
    this.upkeep.onOk = (days) => {
      const record: GuildFurniture = { itemId: days, placed: false, pos: [0, 0, 0], angle: 0, objectId: NULL_ID, secondsLeft: 0 };
      screen.send(encodeGuildHousePacket(GuildHousePacketType.UPKEEP, NULL_ID, record));
    };
  }

  get elements(): HTMLElement[] {
    return [this.menu.window.element, this.storage.window.element, this.upkeep.window.element, this.strip.window.element];
  }

  private text(tid: string, fallback = ''): { text: string; color: number } {
    const entry = this.texts.get(tid);
    return { text: entry?.text ?? fallback, color: entry?.color ?? 0xffffffff };
  }

  private line(tid: string, arg?: string): void {
    const { text, color } = this.text(tid);
    if (text !== '') this.screen.say(arg === undefined ? text : formatText(text, [arg]), color);
  }

  private allowed(bit: number): boolean {
    return hasPower(this.screen.guild(), this.screen.ownPlayerId(), bit);
  }

  /** One guild house snapshot. */
  handle(message: GuildHouseMessage): void {
    for (const event of this.book.apply(message, this.screen.nowSeconds())) {
      if (event.kind === 'line') this.line(event.tid, event.arg);
      else if (event.kind === 'rest') this.screen.rest(this.book.restPercent);
      else this.listChanged();
    }
  }

  /** `RefreshItemList` when the storage is open, else `ApplyEFTexture` alone (DPClient.cpp:19016-19021). */
  private listChanged(): void {
    if (this.storage.isOpen || this.storageAway) this.refresh();
    if (isGuildHouseWorld(this.screen.worldId())) this.applyPapers();
  }

  private applyPapers(): void {
    const { wall, floor } = this.book.papers();
    this.screen.papers(wall, floor);
  }

  // --- entering and leaving (WorldEnvironment.cpp:51-94) ---

  /** A world was entered: the menu opens in a guild house, with its papers; it closes elsewhere. */
  enteredWorld(worldId: number): void {
    if (isGuildHouseWorld(worldId)) {
      if (!this.menu.isOpen) this.menu.window.open(this.screen.menuAt());
      this.applyPapers();
      this.update();
    } else this.closeAll();
  }

  /** `~CWndGHMainMenu`: the storage, the guild window and the guild bank close with the menu (done by the world change here). */
  private closeAll(): void {
    this.menu.window.close();
    this.storage.window.close();
    this.upkeep.window.close();
    this.strip.window.close();
    this.storageAway = false;
    this.deploying = null;
  }

  /** Bertha's Purchase Guild House (`MMI_GUILDHOUSE_SALE`): at once, no box. */
  buy(): void {
    this.screen.send(encodeGuildHouseBuy());
  }

  /** Bertha's Enter your Guild House. */
  enter(): void {
    this.screen.send(encodeGuildHouseEnter());
  }

  /** The door's Exit Your Guild House: no box (the server checks the house). */
  goOut(): void {
    this.screen.send(encodeGuildHouseGoOut());
  }

  /** Pay Maintenance Fee (Bertha) and Fee Deposit (the menu): the right first; Bertha's opens anew, the menu's toggles. */
  openUpkeep(): void {
    if (!this.allowed(GuildPower.GUILDHOUSE_UPKEEP)) { this.line('TID_GAME_GUILDHOUSE_TAX_LEVEL'); return; }
    this.upkeep.open();
  }

  private toggleUpkeep(): void {
    if (!this.allowed(GuildPower.GUILDHOUSE_UPKEEP)) { this.line('TID_GAME_GUILDHOUSE_TAX_LEVEL'); return; }
    if (this.upkeep.isOpen) this.upkeep.window.close();
    else this.upkeep.open();
  }

  // --- Furniture Storage ---

  /** R and the applet: the storage on its furniture section, open or closed. */
  toggleStorage(): void {
    if (this.storage.isOpen) { this.storage.window.close(); return; }
    this.openSection('furniture', 'Furniture Storage');
  }

  /** The menu's Furniture Storage and Teleporter: the window on that section; pressed again, closed. */
  private toggleSection(section: StorageSection): void {
    if (this.storage.isOpen && this.section === section) { this.storage.window.close(); return; }
    this.openSection(section);
  }

  /** `InitBySection`: the title, the combo (all kinds, or TELEPORTER greyed), the list. */
  private openSection(section: StorageSection, title?: string): void {
    this.section = section;
    this.kind3 = 0;
    const furniture = section === 'furniture';
    const name = title ?? this.text(furniture ? 'TID_GAME_GUILDHOUSE_LOCKER' : 'TID_GAME_GUILDHOUSE_TELEPORTER',
      furniture ? 'Guild Furniture Storage' : 'Teleporter Storage').text;
    const choices = furniture ? STORAGE_KINDS.map(([tid]) => this.text(tid).text) : ['TELEPORTER'];
    this.storage.setSection(name, choices, furniture);
    if (!this.storage.isOpen) this.storage.window.open();
    this.refresh();
  }

  private refresh(): void {
    this.rows = storageRows(this.book, (id) => this.screen.prop(id), this.section, this.kind3, this.sort, this.greater);
    this.draw();
  }

  private timeText(row: StorageRow, now: number): string {
    // 2026-11-14 (owner): durations short, one unit as Neuz shows here (TID_PK_LIMIT_DAY / HOUR / MINUTE)
    const left = row.fresh ? row.time : Math.max(0, row.time - now);
    return formatDuration(left, 's', 1) + (row.fresh ? this.text('TID_GAME_TOOLTIP_NEWFURNITURE', '(NEW)').text : '');
  }

  private draw(): void {
    if (!this.storage.isOpen) return;
    const now = this.screen.nowSeconds();
    this.drawnAt = now;
    const allowed = this.allowed(GuildPower.GUILDHOUSE_FURNITURE) && isGuildHouseWorld(this.screen.worldId());
    const enabled = storageButtons(this.rows, allowed, this.section);
    const installTip = this.text('TID_TOOLTIP_GUILDHOUSE_BUTT_INSTALL').text;
    const removeTip = this.text('TID_TOOLTIP_GUILDHOUSE_BUTT_DISMANTLE').text;
    const views: StorageRowView[] = this.rows.map((row, i) => ({
      icon: row.icon, name: row.name, time: this.timeText(row, now), placed: row.placed, enabled: enabled[i]!,
      tip: row.placed ? removeTip : installTip,
    }));
    const chosen = this.rows.findIndex((r) => r.objectId !== NULL_ID && r.objectId === this.book.selected);
    this.storage.draw(views, chosen, chosen >= 0 ? this.rows[chosen]!.description : '', this.sort, this.greater);
  }

  /** A row's install / remove button (`OnChildNotify`, WndHousing.cpp:990-1050). */
  private pressRow(index: number): void {
    const row = this.rows[index];
    if (row === undefined) return;
    if (!this.book.channel) { this.line('TID_GAME_GUILDHOUSE_INSIDE_INSTALL_CHANNEL'); return; }
    const now = this.screen.nowSeconds();
    const action = storageAction(row);
    const record = this.book.record(row.slot, now);
    if (record === null) return;
    if (action === 'remove') { this.screen.send(encodeGuildHousePacket(GuildHousePacketType.REMOVE, row.slot, record)); return; }
    if (action === 'setupAtOnce') { this.screen.send(encodeGuildHousePacket(GuildHousePacketType.SETUP, row.slot, record)); return; }
    const link = this.screen.prop(row.itemId)?.linkKind;
    if (link === undefined) return;
    // LoadToDeploy with the row (its point the player's, angle 0); EndDeploy then Setup( kInfo ): the item, placed, the copy's
    // point and angle, the row's object id and `m_dwTime` (its end, or for a timer not started the prop's length) less the clock
    const started = this.screen.startPlacement(row.itemId, link, { angle: 0, land: true }, (pos, angle) => {
      const sent: GuildFurniture = { itemId: row.itemId, placed: true, pos, angle, objectId: row.objectId, secondsLeft: row.time - this.screen.nowSeconds() };
      this.screen.send(encodeGuildHousePacket(GuildHousePacketType.SETUP, row.slot, sent));
      this.book.selected = NULL_ID;
    });
    if (started) this.deploying = row;
  }

  // --- a placed piece pressed in the world ---

  /**
   * `SetObjFocus` of a guild house control (World.cpp:269-287): it is the selected piece, chosen in the storage; and
   * `ShowCCtrlMenu`'s entries for it (WndWorld.cpp:11442-11477), none when it is not one of the house's.
   */
  pressPiece(objectId: number): Array<{ id: number; label: string }> {
    const found = this.book.find(objectId);
    if (found === null) return [];
    this.book.selected = objectId;
    if (this.storage.isOpen) {
      this.refresh();
      const row = this.rows.findIndex((r) => r.objectId === objectId);
      if (row >= 0) this.storage.showRow(row);
    }
    return [
      { id: GHouseMenu.INFO, label: this.text('TID_APP_INFOMATION', 'Information').text },
      { id: GHouseMenu.REINSTALL, label: this.text('TID_MMI_GHOUSE_REINSTALL', 'Reinstall').text },
      { id: GHouseMenu.RECALL, label: this.text('TID_MMI_GHOUSE_RECALL', 'Remove').text },
    ];
  }

  /** The piece menu's entry (`CWndMenu::OnCommand`, WndControl.cpp:3575-3603). */
  choosePiece(entry: number): void {
    const found = this.book.find(this.book.selected);
    if (entry === GHouseMenu.INFO) {
      if (!this.storage.isOpen) this.openSection('furniture');
      return;
    }
    if (found === null) return;
    const now = this.screen.nowSeconds();
    if (entry === GHouseMenu.RECALL) {
      const record = this.book.record(found.index, now);
      if (record !== null) this.screen.send(encodeGuildHousePacket(GuildHousePacketType.REMOVE, found.index, record));
      this.book.selected = NULL_ID;
      return;
    }
    // Reset(): the copy at the piece's angle, the piece itself left out of the boxes; EndDeploy then Reset( kInfo ) with RESET
    const link = this.screen.prop(found.piece.itemId)?.linkKind;
    if (link === undefined) return;
    const { index, piece } = found;
    this.screen.startPlacement(piece.itemId, link, { angle: piece.angle, ignore: piece.objectId, land: true }, (pos, angle) => {
      const sent: GuildFurniture = { itemId: piece.itemId, placed: true, pos, angle, objectId: piece.objectId, secondsLeft: 0 };
      this.screen.send(encodeGuildHousePacket(GuildHousePacketType.RESET, index, sent));
      this.book.selected = NULL_ID;
    });
  }

  // --- every frame ---

  /** `Process`: the time left on the menu, the storage's times, and the storage hidden with the strip while a SETUP is placed. */
  update(): void {
    const now = this.screen.nowSeconds();
    if (this.menu.isOpen) {
      const left = this.book.upkeepEndsAt - now;
      this.menu.setTime(left < 0 ? this.text('TID_GAME_GUILDHOUSE_EXPIRATION', 'Your Guild House has expired.').text : formatDuration(left, 's'));
    }
    if (this.deploying !== null && this.screen.placing()) {
      // (V15 only hides and shows the window, WndHousing.cpp:1348, :1366: it comes back where it was)
      if (this.storage.isOpen) { this.storageAt = this.storage.window.frame.position; this.storage.window.close(); this.storageAway = true; }
      const row = this.deploying;
      const time = formatDuration(row.fresh ? row.time : Math.max(0, row.time - now), 's', 1) + (row.fresh ? ' (NEW)' : ' (▶)');
      if (!this.strip.isOpen) this.strip.show(row.icon, row.name, time, this.screen.stripAt(304));
    } else if (this.deploying !== null || this.strip.isOpen) {
      this.deploying = null;
      this.strip.window.close();
      if (this.storageAway && !this.storage.isOpen) { this.storage.window.open(this.storageAt); this.refresh(); }
      this.storageAway = false;
    }
    if (this.storage.isOpen && now !== this.drawnAt) this.draw();
  }

  /** The world goes: every window closes (the new world's HUD is built anew). */
  reset(): void {
    this.closeAll();
  }
}
