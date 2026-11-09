// The personal shop on the browser (2026-11-10, docs/superpowers/specs/2026-11-10-personal-shop-research.md): the state
// (vendorBook.ts), the windows (hud/vendor/vendorWindows.ts), the balloons (render/VendorSignLayer.ts) and the packets,
// wired as Neuz's classes wire them. The world screen hands it the messages, the presses on players and the frame.
//
//   CWndVendor              _Interface/WndVendor.cpp:49-505      opening, OK, Cancel, Reset, Chat, the drop, OnDestroy
//   CWndVendorCtrl          _Interface/WndVendorCtrl.cpp:300-465 the drop, the right click, the double click
//   CWndRegVend, CWndVendorBuy                                   the keypads' OK
//   CDPClient::OnPVendor*   Neuz/DPClient.cpp:13798-14062        the windows the snapshots open and close
//   CDPClient::OnChatting   :15054-15166                         the chat room's lines
//   CWndWorld::OnLButtonDown  _Interface/WndWorld.cpp:7019-7048  the click on a seller

import type { InventoryItem } from '@flyffweb/protocol';
import type { PerspectiveCamera } from 'three';
import type { Vec3 } from '@flyffweb/formats';
import type { GameData } from '../gameData';
import type { OwnState } from '../OwnState';
import type { Mover } from '../WorldState';
import type { WorldMessage } from '@flyffweb/protocol';
import type { AddedMover } from '@flyffweb/protocol';
import type { UiArt } from '../hud/art';
import type { WindowFrame } from '../hud/frame';
import { formatText } from '../hud/format';
import { BuyPadWindow, SellPadWindow, VendorChatWindow, VendorWindow } from '../hud/vendor/vendorWindows';
import type { SlotView } from '../hud/vendor/vendorWindows';
import { VendorSignLayer } from '../render/VendorSignLayer';
import { VendorBook } from './vendorBook';
import type { VendorEvent } from './vendorBook';
import {
  OPEN_CAMERA_RANGE, VENDOR_SLOTS, canPutUp, checkShopName, openGoldOk, registerGoldOk,
} from './vendorRules';

/** What the shop sends (`CDPClient::Send*`, world/vendor.ts's encoders through the session). */
export interface VendorSend {
  open(title: string): void;
  close(vendorId: number): void;
  register(slot: number, objectId: number, count: number, cost: number): void;
  unregister(slot: number): void;
  query(vendorId: number): void;
  buy(vendorId: number, slot: number, itemId: number, count: number): void;
  enterChat(roomId: number): void;
  chat(text: string): void;
  openChat(): void;
  closeChat(): void;
}

/** What the shop asks of the world screen. */
export interface ShopHost {
  doc: Document;
  art: UiArt;
  data: GameData;
  send: VendorSend;
  own(): OwnState | undefined;
  self(): Mover | undefined;
  mover(objectId: number): Mover | undefined;
  /** A line in the hud (`PutString`). */
  say(text: string, color?: number): void;
  /** `OpenMessageBox`. */
  box(text: string, buttons: 'ok' | 'okCancel', onOk: () => void, onCancel?: () => void): void;
  /** The bag: shown, its frame, an item held (`SetExtra`) or let go, and the phone's tap-to-pick. */
  inventory: {
    open(): void;
    frame: WindowFrame;
    reserve(objectId: number, on: boolean): void;
    held(objectId: number): boolean;
    pick(choose: ((objectId: number) => void) | undefined): void;
  };
  /**
   * A window that keeps the shop from opening (`CWndVendor::Initialize`, WndVendor.cpp:204-213, and `SetVendor`'s dialogue,
   * :67-68): a trade, an NPC shop, a bank or guild bank, an NPC dialogue.
   */
  busy(): boolean;
  /** `InvalidName_ENG.inc` in lower case. */
  invalidNames(): readonly string[];
  /** `CWndMgr::WordChange`. */
  wordChange(text: string): string;
  /** The item's tooltip as APP_VENDOR puts it (with the price), over `anchor`; null hides it. */
  tooltip(item: InventoryItem | null, cost: number, anchor: HTMLElement | null): void;
}

const RED = 0xffff0000;
const BLUE = 0xff0000ff;
/** `IK3_*` of the items that stack: `dwPackMax > 1` (WndVendorCtrl.cpp:223). */
const FLAG_EXPIRED = 0x01;

export class PersonalShop {
  readonly book = new VendorBook();
  readonly signs: VendorSignLayer;
  readonly window: VendorWindow;
  readonly sell: SellPadWindow;
  readonly buyPad: BuyPadWindow;
  readonly chat: VendorChatWindow;
  /** The shop the window shows: the own mover's or a seller's (`m_pVendor`). */
  private shown: number | null = null;

  constructor(private readonly host: ShopHost) {
    const { doc, art } = host;
    this.signs = new VendorSignLayer(doc, art, (objectId) => this.tapSign(objectId));
    this.window = new VendorWindow(art, {
      ok: (name) => this.ok(name),
      cancel: () => this.cancel(),
      reset: () => this.resetSlots(),
      chat: () => this.openChat(),
      drop: (slot, objectId) => this.drop(slot, objectId),
      remove: (slot) => this.remove(slot),
      buy: (slot) => this.startBuy(slot),
      tooltip: (slot, anchor) => this.tooltip(slot, anchor),
    }, doc);
    this.window.frame.onClose = () => this.destroyed();
    this.sell = new SellPadWindow(art, (result) => this.register(result), doc);
    this.buyPad = new BuyPadWindow(art, (count) => this.buy(count), doc);
    this.chat = new VendorChatWindow(art, (id, english) => this.text(id, english), doc);
    this.chat.onSend = (text) => {
      try { host.send.chat(text); } catch { /* a letter the game's encoding lacks: not sent */ }
    };
    // the seller's close button: CLOSECHATTINGROOM (WndVendor.cpp:655-659)
    this.chat.onClosed = () => { if (this.book.ownOpen(this.selfId)) host.send.closeChat(); };
  }

  /** What goes in the hud: the balloons first (under the windows), then the windows. */
  get elements(): HTMLElement[] {
    return [this.signs.element, this.window.element, this.sell.element, this.buyPad.element, this.chat.element];
  }

  private get selfId(): number | undefined {
    return this.host.self()?.objectId;
  }

  private text(id: string, english: string): string {
    return this.host.data.texts.get(id)?.text ?? english;
  }

  // --- what the world screen asks ---

  /** The shop window is open (`GetWndVendorBase()`). */
  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** A mover with an open shop (`m_vtInfo.IsVendorOpen()`). */
  hasShop(objectId: number): boolean {
    return (this.book.titles.get(objectId) ?? '') !== '';
  }

  /** No click in the world (`OnLButtonDown`, WndWorld.cpp:6721-6728): an item up, or the shop window open. */
  get blocksWorld(): boolean {
    return this.book.isVendor || this.window.isOpen;
  }

  /** No walking, no item or skill shortcuts (`ControlPlayer`, WndWorldControlPlayer.cpp:30; WndManager.cpp:2726, :2781). */
  get blocksActions(): boolean {
    return this.book.isVendor;
  }

  /** No motions while the window is open (WndManager.cpp:2924-2928). */
  get blocksMotions(): boolean {
    return this.window.isOpen;
  }

  /**
   * A left press on a mover (WndWorld.cpp:7019-7048): another player with an open shop, the own partner empty, within 20 of
   * the camera and Alt not held asks for its shop. True when it did.
   */
  press(objectId: number, cameraDistance: number, alt: boolean): boolean {
    const mover = this.host.mover(objectId);
    if (mover?.kind !== 'player' || mover.isSelf || !this.hasShop(objectId) || this.book.browsed !== null) return false;
    if (cameraDistance >= OPEN_CAMERA_RANGE || alt) return false;
    this.host.send.query(objectId);
    return true;
  }

  /** The phone's tap on a balloon: the same query, from any distance in view (the phone's own way in). */
  private tapSign(objectId: number): void {
    if (objectId === this.selfId || this.book.browsed !== null || this.window.isOpen) return;
    if (!this.hasShop(objectId)) return;
    this.host.send.query(objectId);
  }

  /** The Start menu's "Private Shop" (`APP_VENDOR_REVISION`): opens the own shop, or shuts the window (`ObjectExecutor`). */
  toggle(): void {
    if (this.window.isOpen) { this.window.close(); return; }
    this.openOwn('');
  }

  /** ADD_OBJ of a mover. */
  added(mover: AddedMover): void {
    this.handle(this.book.added(mover));
  }

  /** DEL_OBJ of a mover. */
  removed(objectId: number): void {
    this.handle(this.book.removed(objectId));
  }

  /** A world message (the shop's snapshots and the chat room's). */
  apply(objectId: number, value: WorldMessage): void {
    const own = this.host.own();
    this.handle(this.book.apply(objectId, value, this.selfId, (id) => own?.inventory?.get(id)));
  }

  /** Each frame: the balloons placed. */
  frame(camera: PerspectiveCamera, canvas: DOMRect, layer: DOMRect, placeOf: (objectId: number) => { at: Vec3; head: Vec3 } | null): void {
    this.signs.update(camera, canvas, layer, placeOf);
  }

  /** The own bag changed: the slots' names and counts drawn again. */
  refresh(): void {
    if (this.window.isOpen) this.drawSlots();
  }

  /** A new world, or the screen gone: everything shut, nothing sent. */
  reset(): void {
    this.window.frame.onClose = undefined;
    this.window.close();
    this.window.frame.onClose = () => this.destroyed();
    this.sell.close();
    this.buyPad.close();
    this.chat.close();
    for (const id of this.book.heldObjectIds()) this.host.inventory.reserve(id, false);
    this.book.reset();
    this.signs.clear();
    this.shown = null;
    this.host.inventory.pick(undefined);
  }

  // --- the events ---

  private handle(events: readonly VendorEvent[]): void {
    for (const event of events) {
      switch (event.kind) {
        case 'title': this.signs.set(event.objectId, event.title); break;
        case 'ownOpened': this.ownOpened(); break;
        case 'ownClosed': this.ownClosed(event.title); break;
        case 'ownSlot':
          this.host.inventory.reserve(event.objectId, event.held);
          if (this.window.isOpen && this.shown === this.selfId) this.drawSlots();
          break;
        case 'browse': this.browse(event.sellerId, event.chatting); break;
        case 'browseClosed':
          if (this.window.isOpen && this.shown === event.sellerId) this.window.close();
          break;
        case 'itemNum': this.itemNum(event); break;
        case 'chatMembers': this.chat.setUsers([...this.book.members.values()]); break;
        case 'chatEnter':
          this.chat.addInfo(formatText(this.text('TID_GAME_VENCHATIN', '%s has just logged in.'), [event.name]), RED);
          break;
        case 'chatLeave':
          this.chat.addInfo(formatText(this.text('TID_GAME_VENCHATOUT', '%s has disconnected.'), [event.name]), RED);
          break;
        case 'chatLine': this.chat.addMessage(event.name, event.text, event.name === this.host.self()?.name); break;
        case 'chatState': if (!event.open) this.chat.close(); break;
        case 'chatDeleted': this.chat.setUsers([]); break;
      }
    }
  }

  /**
   * `OnPVendorOpen` for the own mover (DPClient.cpp:13814-13843): the name field off, ENTERCHTTING, the chat window as the
   * owner's, the shop in front, its title "Private Shop(Shop is opening)".
   */
  private ownOpened(): void {
    if (!this.window.isOpen || this.shown !== this.selfId) return;
    this.window.setOpen(true);
    this.host.inventory.pick(undefined);
    const playerId = this.host.self()?.added.player?.playerId;
    if (playerId !== undefined) this.host.send.enterChat(playerId);
    if (!this.chat.isOpen) this.chat.open(true);
    this.window.frame.raise();
    this.window.setTitle(this.text('TID_GAME_VENDOR_TITLE', 'Private Shop') + this.text('TID_GAME_VENDOR_TITLE0', '(Shop is opening)'));
    this.window.setHint('');
  }

  /**
   * `OnPVendorClose` for the own mover with the shop open (DPClient.cpp:13866-13931): the window comes back, if it was shut,
   * with the old title (line breaks as spaces), and its saved list is registered again (`ReloadItemList`).
   */
  private ownClosed(title: string): void {
    if (this.window.isOpen && this.shown === this.selfId) {
      this.window.setOpen(false);
      this.window.setTitle(this.text('TID_GAME_VENDOR_TITLE', 'Private Shop'));
      return;
    }
    if (this.window.isOpen) return;
    this.openOwn(title.replace(/\n/g, ' '));
  }

  /** `OnPVendorItem` (DPClient.cpp:14031-14055): another's shop in the window, ENTERCHTTING, its chat if the room is open. */
  private browse(sellerId: number, chatting: boolean): void {
    if (this.window.isOpen) {
      // one shop window at a time (CreateApplet gives the open one): the old one goes first
      this.window.frame.onClose = undefined;
      this.window.close();
      this.window.frame.onClose = () => this.destroyed();
    }
    this.shown = sellerId;
    this.window.setMode(false, this.book.titles.get(sellerId) ?? '');
    this.window.setTitle(this.text('TID_GAME_VENDOR_TITLE', 'Private Shop'));
    this.window.setOpen(false);
    this.window.setHint('Tap an item to buy it.');
    this.drawSlots();
    this.placeBesideBag();
    const playerId = this.host.mover(sellerId)?.added.player?.playerId;
    if (playerId !== undefined) this.host.send.enterChat(playerId);
    if (chatting && !this.chat.isOpen) this.chat.open(false);
    // the shop in front of its chat, as the seller's is (DPClient.cpp:13836)
    this.window.frame.raise();
  }

  /** `OnPVendorItemNum` (DPClient.cpp:13963-13996): the counts again; the seller's Information tab says who bought what. */
  private itemNum(event: Extract<VendorEvent, { kind: 'itemNum' }>): void {
    if (this.window.isOpen) this.drawSlots();
    if (event.sellerId === this.selfId && event.sold > 0) {
      const name = this.host.data.itemProps.get(event.itemId)?.name ?? '';
      const line = formatText(this.text('TID_GAME_BUY_INFO', 'Character: %s has purchased %s(%d), it is spent %d penya.'),
        [event.buyer, name, event.sold, event.total]);
      this.chat.addInfo(line, BLUE);
    }
    if (this.buyPad.isOpen && this.buyPad.slot === event.slot && event.left <= 0) this.buyPad.close();
  }

  // --- the seller ---

  /**
   * `CWndVendor::Initialize` and `OnInitialUpdate` (WndVendor.cpp:76-145, :199-220): refused with a trade, a shop, a bank or
   * a dialogue open; the own shop with `title` in the name field; the bag open beside it; the saved list registered again.
   */
  private openOwn(title: string): void {
    const self = this.host.self();
    if (self === undefined || this.host.busy()) return;
    this.shown = self.objectId;
    const open = this.book.ownOpen(self.objectId);
    this.window.setMode(true, open ? this.book.titles.get(self.objectId) ?? title : title);
    this.window.setTitle(this.text('TID_GAME_VENDOR_TITLE', 'Private Shop'));
    this.window.setOpen(open);
    this.window.showOk(!open);
    this.drawSlots();
    this.placeBesideBag();
    if (!open) {
      this.window.setHint('Tap an empty slot, then an item in your bag.');
      this.host.inventory.pick((objectId) => {
        const slot = this.window.freeSlot();
        if (slot !== null) this.drop(slot, objectId);
      });
      // ReloadItemList (WndVendor.cpp:147-184)
      const own = this.host.own();
      for (const entry of this.book.reload((id) => own?.inventory?.get(id))) {
        if (this.book.own[entry.slot] !== null) continue;
        try { this.host.send.register(entry.slot, entry.objectId, entry.count, entry.cost); } catch { /* out of range: skipped */ }
      }
    }
  }

  /** The bag opens, and the shop goes beside it: to its left on the right half of the screen, else to its right (:135-144). */
  private placeBesideBag(): void {
    this.host.inventory.open();
    const bag = this.host.inventory.frame;
    const layer = this.window.frame.element.parentElement;
    if (this.window.phone || layer === null || !bag.isOpen) {
      this.window.open({ x: 12, y: 8 });
      return;
    }
    const { x, y } = bag.position;
    const width = this.window.frame.scaledSize.width || 448;
    const at = x > layer.clientWidth / 2 ? { x: x - width, y } : { x: x + bag.scaledSize.width, y };
    this.window.open({ x: Math.max(0, at.x), y: Math.max(0, at.y) });
  }

  /** The slots as the window draws them: the own registered items, or the browsed shop's copies. */
  private drawSlots(): void {
    const own = this.host.own();
    const views: (SlotView | null)[] = [];
    for (let i = 0; i < VENDOR_SLOTS; i++) {
      let item: InventoryItem | undefined, count = 0, cost = 0;
      if (this.shown === this.selfId) {
        const entry = this.book.own[i];
        item = entry ? own?.inventory?.get(entry.objectId) : undefined;
        count = entry?.count ?? 0;
        cost = entry?.cost ?? 0;
      } else {
        const entry = this.book.browsed?.items[i];
        item = entry?.item;
        count = entry?.count ?? 0;
        cost = entry?.cost ?? 0;
      }
      if (item === undefined) { views.push(null); continue; }
      const prop = this.host.data.itemProps.get(item.itemId);
      views.push({
        item, name: prop?.name ?? `#${item.itemId}`, icon: prop?.icon ?? null, stacks: (prop?.packMax ?? 1) > 1,
        count, cost, expired: ((item.flag ?? 0) & FLAG_EXPIRED) !== 0,
      });
    }
    this.window.setSlots(views);
  }

  /**
   * A bag item on a slot (`OnChildNotify` 100, WndVendor.cpp:244-305): from the bag, not a quest item, not expired, the slot
   * free, the item not held, the own shop and not open: the registration keypad.
   */
  private drop(slot: number, objectId: number): void {
    const own = this.host.own();
    const self = this.host.self();
    if (!this.window.isOpen || self === undefined || this.shown !== self.objectId || this.book.ownOpen(self.objectId)) return;
    if (slot < 0 || slot >= VENDOR_SLOTS || this.book.own[slot] !== null) return;
    const item = own?.inventory?.get(objectId);
    if (own === undefined || item === undefined) return;
    const bagSlot = own.inventorySlots.indexOf(objectId);
    const worn = bagSlot < 0 || bagSlot >= 42 || own.equipmentObjectIds.includes(objectId);
    const held = this.host.inventory.held(objectId) || this.book.heldObjectIds().includes(objectId);
    if (!canPutUp(item, this.host.data.itemProps.get(item.itemId)?.kind3, held, worn)) return;
    this.sell.open(slot, objectId, item.count);
  }

  /** The registration keypad's OK (WndRegVend.cpp:272-349): the gold check, then REGISTER_PVENDOR_ITEM. */
  private register(result: { count: number; cost: number } | null): void {
    if (result === null) return;
    const own = this.host.own();
    const item = own?.inventory?.get(this.sell.objectId);
    if (own === undefined || item === undefined) { this.sell.close(); return; }
    if (!registerGoldOk(own.gold, this.book.own, result.cost, result.count)) {
      this.host.box(this.text('TID_GAME_VENDOR_MAX_ALL_GOLD', 'The amount of Penya in your inventory and the price of what you are selling cannot exceed 2,100,000,000.'), 'ok', () => {});
      return;
    }
    try {
      this.host.send.register(this.sell.slot, this.sell.objectId, result.count, result.cost);
    } catch { /* out of range: nothing sent */ }
    this.sell.close();
  }

  /** A right click on a slot (WndVendorCtrl.cpp:419-435): UNREGISTER_PVENDOR_ITEM (the server refuses it once open). */
  private remove(slot: number): void {
    if (this.shown !== this.selfId || this.book.own[slot] === null) return;
    this.host.send.unregister(slot);
  }

  /** Reset (WndVendor.cpp:439-461): every slot taken off, the saved list emptied. */
  private resetSlots(): void {
    if (this.shown !== this.selfId) return;
    for (const [slot, entry] of this.book.own.entries()) if (entry !== null) this.host.send.unregister(slot);
    this.book.clearSaved();
  }

  /**
   * OK (WndVendor.cpp:308-379): not flying, an item up; the gold check; the name's rules; then "Will you open your shop?",
   * OK hidden while it asks. Its OK sends PVENDOR_OPEN; its Cancel shows OK again.
   */
  private ok(typed: string): void {
    const self = this.host.self();
    if (self === undefined || this.shown !== self.objectId || this.book.ownOpen(self.objectId)) return;
    if (self.act.isFlying() || !this.book.isVendor) return;
    const own = this.host.own();
    if (!openGoldOk(own?.gold ?? 0, this.book.own)) {
      this.host.box(this.text('TID_GAME_VENDOR_MAX_ALL_GOLD', 'The amount of Penya in your inventory and the price of what you are selling cannot exceed 2,100,000,000.'), 'ok', () => {});
      return;
    }
    const name = checkShopName(typed, this.host.invalidNames(), (text) => this.host.wordChange(text));
    if (!name.ok) {
      this.host.box(this.text(name.box, name.box === 'TID_DIAG_0020' ? 'Character name is not allowed.' : 'The name must be 6 to 18 characters long.'), 'ok', () => {});
      return;
    }
    this.window.showOk(false);
    this.host.box(this.text('TID_GAME_VENDOR_START', 'Will you open your shop?'), 'okCancel', () => {
      if (!this.window.isOpen || this.book.ownOpen(this.selfId)) return;
      try { this.host.send.open(name.name); } catch { this.window.showOk(true); }
    }, () => {
      if (!this.book.ownOpen(this.selfId)) this.window.showOk(true);
    });
  }

  /**
   * Cancel and the close button (WndVendor.cpp:380-392): with the own shop open, "Will you close your shop?" and its OK
   * shuts the window (which shuts the shop); otherwise the window shuts.
   */
  private cancel(): void {
    if (this.shown === this.selfId && this.book.ownOpen(this.selfId)) {
      this.host.box(this.text('TID_GAME_VENDOR_STOP', 'Will you close your shop?'), 'okCancel', () => this.window.close());
      return;
    }
    this.window.close();
  }

  /**
   * `CWndVendor::OnDestroy` (WndVendor.cpp:483-505): the own list saved, PVENDOR_CLOSE with the shop's id (the own for the
   * seller, the seller's for a buyer), the keypads and the chat shut.
   */
  private destroyed(): void {
    const own = this.host.own();
    const self = this.selfId;
    if (this.shown !== null && this.shown === self) this.book.save((id) => own?.inventory?.get(id));
    if (this.shown !== null && this.shown !== self) this.book.leave();
    if (this.shown !== null) this.host.send.close(this.shown);
    this.shown = null;
    this.sell.close();
    this.buyPad.close();
    if (this.chat.isOpen) {
      this.chat.onClosed = () => {};
      this.chat.close();
      this.chat.onClosed = () => { if (this.book.ownOpen(this.selfId)) this.host.send.closeChat(); };
    }
    this.host.tooltip(null, 0, null);
    this.host.inventory.pick(undefined);
  }

  /** Chat (WndVendor.cpp:393-437): the open seller opens the room (OPENCHATTINGROOM); a buyer only while it is open. */
  private openChat(): void {
    const self = this.selfId;
    let room = false;
    if (this.shown === self && this.book.ownOpen(self)) {
      this.host.send.openChat();
      room = true;
    } else if (this.shown !== self && this.book.browsed !== null && this.book.chatOpen) room = true;
    if (!room) return;
    if (!this.chat.isOpen) this.chat.open(this.shown === self);
    else this.chat.toggle();
  }

  // --- the buyer ---

  /** A double click on a slot (WndVendorCtrl.cpp:442-465): the buy keypad. */
  private startBuy(slot: number): void {
    const entry = this.book.browsed?.items[slot];
    if (entry === null || entry === undefined) return;
    this.buyPad.open(slot, entry.count, entry.cost);
  }

  /** The buy keypad's OK (WndVendorBuy.cpp:189-207): the count over 0, the penya enough, then BUY_PVENDOR_ITEM. */
  private buy(count: number): void {
    const browsed = this.book.browsed;
    const entry = browsed?.items[this.buyPad.slot];
    if (browsed === null || entry === null || entry === undefined || count < 1) return;
    const pieces = Math.min(count, entry.count);
    if ((this.host.own()?.gold ?? 0) < entry.cost * pieces) {
      this.host.box(this.text('TID_GAME_LACKMONEY', 'You do not have enough Penya.'), 'ok', () => {});
      return;
    }
    try {
      this.host.send.buy(browsed.sellerId, this.buyPad.slot, entry.item.itemId, Math.min(count, 32767));
    } catch { /* out of range: nothing sent */ }
    this.buyPad.close();
  }

  private tooltip(slot: number | null, anchor: HTMLElement | null): void {
    if (slot === null || anchor === null) { this.host.tooltip(null, 0, null); return; }
    const own = this.host.own();
    if (this.shown === this.selfId) {
      const entry = this.book.own[slot];
      const item = entry ? own?.inventory?.get(entry.objectId) : undefined;
      this.host.tooltip(item ?? null, entry?.cost ?? 0, item ? anchor : null);
    } else {
      const entry = this.book.browsed?.items[slot];
      this.host.tooltip(entry?.item ?? null, entry?.cost ?? 0, entry ? anchor : null);
    }
  }
}

/** The camera's distance to a mover's feet (`m_fDistCamera`, World3D.cpp:671). */
export function cameraDistance(camera: { position: { x: number; y: number; z: number } }, at: Vec3): number {
  const dx = camera.position.x - at[0], dy = camera.position.y - at[1], dz = camera.position.z - at[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

