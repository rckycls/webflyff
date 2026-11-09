// The Pet Tamer's rare windows (pets R4, docs/superpowers/plans/2026-11-09-pets-rest.md; [R] =
// docs/superpowers/specs/2026-11-09-pets-research.md §2.3, §5): each its own resdata.inc window as Neuz draws it, doing what
// its class does and sending its packet. The rules are petTamer.ts's.
//
//   Window / menu                         Neuz                                                        sends
//   MMI_PET_EGG01, the egg exchange        CWndWorld::OnCommand (_Interface/WndWorld.cpp:5098-5113),   TRANSFORM_ITEM
//                                          CWndPetTransEggs (_Interface/WndPetSys.cpp:1920-2159)
//   MMI_PET_AWAK_CANCEL, the pick-up pet's WndWorld.cpp:5231-5235, CWndPetAwakCancel                   PICKUP_PET_AWAKENING_CANCEL
//   awakening cancel                       (WndPetSys.cpp:15-165, its help Client/Client/PetAwakCancel.inc)
//   MMI_PET_RES, the pet trade for a       WndWorld.cpp:4423-4438, CWndPetRes (_Interface/WndPetRes.cpp) QUE_PETRESURRECTION
//   revival scroll piece
//   QUE_PETRESURRECTION_RESULT             CDPClient::OnQuePetResurrectionResult (DPClient.cpp:17423-17431)  -
//
// Each window opens centred (`MoveParentCenter`). An item goes in by a drop from the bag (`OnDropIcon`) or, as the food mill
// and the element change take theirs (a phone has no drag), by a click on it in the bag; the egg exchange also takes the
// bag's double-click in Neuz (`WndField.cpp:2237-2259`), which the click covers. A double-click on a slot empties it.
// A held item is drawn faded in the bag and not used (`SetExtra`), until the window lets it go (`OnDestroy`).

import type { WebItemProp } from '@flyffweb/formats';
import type { InventoryItem } from '@flyffweb/protocol';
import type { UiArt } from '../hud/art';
import { createItemDetails, positionItemDetails } from '../hud/itemDetails';
import { ResWindow } from '../hud/resWindow';
import type { ResControl, ResLayout } from '../hud/resWindow';
import type { TooltipContext, TooltipData } from '../items/itemTooltip';
import type { OwnState } from '../OwnState';
import { itemIconOf } from './petStatus';
import { MAX_TRANS_EGG, TRANSFORM_EGG, isEatPet, petTradeResult, petTradeTakes, transEggRefusal } from './petTamer';
import { II_PET_EGG } from './raisedPet';

const EDIT = 'WndEditTile00.tga';
const SLOT_PICTURE = 'WndChgElemItem.bmp';
const button = (id: string, rect: ResControl['rect'], picture: string, label: string, quarter = 72): ResControl =>
  ({ kind: 'button', id, rect, picture, label, quarter });
const slot = (id: string, rect: ResControl['rect']): ResControl => ({ kind: 'static', id, rect, picture: SLOT_PICTURE });

/** The egg exchange's ten slots, two rows of five (resdata.inc:22606-22687), as `m_nCtrlId` lists them (:1963-1972). */
const EGG_SLOTS = Array.from({ length: MAX_TRANS_EGG }, (_, i) => `WIDC_STATIC${i + 1}`);

/** APP_PET_TRANS_EGGS (resdata.inc:22596-22724, "Egg Change"), CWndPetTransEggs: the ten slots, the help, OK and Cancel. */
export const PET_TRANS_EGGS: ResLayout = {
  title: 'Egg Change', width: 240, height: 320,
  controls: [
    ...EGG_SLOTS.map((id, i) => {
      const left = 30 + 34 * (i % 5), top = i < 5 ? 20 : 54;
      return slot(id, [left, top, left + 32, top + 32]);
    }),
    { kind: 'text', id: 'WIDC_TEXT1', rect: [16, 100, 226, 252], tile: EDIT, scroll: true },
    button('WIDC_OK', [32, 262, 104, 282], 'ButOk2.bmp', 'OK'),
    button('WIDC_CANCEL', [127, 262, 199, 282], 'ButCancel2.bmp', 'Cancel'),
  ],
};

/**
 * APP_PET_AWAK_CANCEL (resdata.inc:23976-24008, "Remove Pick-up Pet Blessing"), CWndPetAwakCancel: the help, the start
 * button (ButtStart.bmp, four 64 px states) and the pet's slot.
 */
export const PET_AWAK_CANCEL: ResLayout = {
  title: 'Remove Pick-up Pet Blessing', width: 272, height: 224,
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [12, 50, 252, 150], tile: EDIT, scroll: true },
    button('WIDC_BUTTON1', [94, 164, 158, 184], 'ButtStart.bmp', 'Start', 64),
    slot('WIDC_STATIC1', [112, 8, 144, 42]),
  ],
};

/** APP_PET_RES (resdata.inc:13467-13510, "Trade Window"), CWndPetRes: OK, Cancel, the pet's slot and the help. */
export const PET_RES: ResLayout = {
  title: 'Trade Window', width: 208, height: 208,
  controls: [
    button('WIDC_OK', [20, 144, 92, 166], 'ButtOk.tga', 'OK'),
    button('WIDC_CANCEL', [104, 144, 176, 164], 'ButtCancel.tga', 'Cancel'),
    slot('WIDC_CHANGE', [82, 100, 116, 132]),
    { kind: 'text', id: 'WIDC_DESC', rect: [8, 8, 194, 92], tile: EDIT, scroll: true },
  ],
};

/**
 * `Client/Client/PetTransEggs.inc` and `PetAwakCancel.inc` (`SetDescription`, :2122-2134, :149-164): each its title in
 * `#b#cff0000ff` (blue, bold), then its help as the files have it.
 */
const EGGS_TITLE = ' Egg Hatching ';
const EGGS_HELP = 'Transform 10 Eggs into a D class Pet or Pet Feed at random chance.\nEgg EXP doesn\'t affect Hatching\n';
const AWAK_TITLE = '■ Scroll of Pet Reversion (Pickup Pets) ';
const AWAK_HELP = 'RRemoves the awakened traits of your pickup pet. Awakening is then made possible again. Awakened traits that'
  + ' have been removed cannot be re-applied, so please use carefully.';
/** `PutString( prj.GetText( TID_GAME_PETTRADE_ERROR ), NULL, 0xffff0000 )` (WndPetRes.cpp:156-180): red, not its TID's white. */
const RED = 0xffff0000;

/** The packets the windows send, by name, with their fields (WorldSession's senders). */
export type PetTamerPacket =
  | ['transformItem', number, Array<{ objectId: number; count: number }>]
  | ['pickupPetAwakeningCancel', number]
  | ['quePetResurrection', number];

export interface PetTamerHost {
  own(): OwnState | undefined;
  props: ReadonlyMap<number, WebItemProp>;
  /** A text by its TID (the catalog's "\n" as line breaks). */
  text(tid: string): string;
  /** A line in the TID's colour, or in `color` (ARGB) when given (`PutString`). */
  say(tid: string, color?: number): void;
  /** Neuz's message box (`OpenMessageBox`). */
  alert(text: string): void;
  send(...packet: PetTamerPacket): void;
  /** The bag's hold on an item while a window has it (`CItemBase::SetExtra`): drawn faded, not dragged nor used. */
  reserve(objectId: number, on: boolean): void;
  /** A window holds the bag item (`GetExtra() != 0`, so not `IsUsableItem`). */
  held(objectId: number): boolean;
  /** `g_pPlayer->IsUsing( item )` (`Mover.cpp:11259-11284`): the summoned raised pet's item or the ticket in use. */
  inUse(objectId: number): boolean;
  /** `CreateApplet( APP_INVENTORY )`: the bag opened (the egg exchange's). */
  openBag(): void;
  /** The item tooltip's catalogs and the own player's context (`ownTooltipContext`). */
  tooltipData: TooltipData;
  tooltipContext(item: InventoryItem): TooltipContext;
  /** What the windows draw with, and the layer they go in. */
  ui: { art: UiArt; doc: Document; layer(): HTMLElement | null };
}

/** The egg exchange open: `m_pItemElem[ MAX_TRANS_EGG ]`, the eggs' object ids by slot. */
interface Eggs { slots: Array<number | null> }
/** The awakening cancel or the pet trade open: `m_pItemElem`, the item placed, and its `OnDropIcon`. */
interface Single { item: number | null; take: (objectId: number) => void }

export class PetTamerWindows {
  private readonly windows = new Map<ResLayout, ResWindow>();
  private eggs: Eggs | null = null;
  private awak: Single | null = null;
  private trade: Single | null = null;
  private tooltip: HTMLElement | null = null;

  constructor(private readonly host: PetTamerHost) {}

  /** A click on a bag item goes in one of the windows: the egg exchange first (its bag path), then the others. */
  get picking(): boolean {
    return this.eggsOpen || this.awakOpen || this.tradeOpen;
  }

  private get eggsOpen(): boolean {
    return this.eggs !== null && this.window(PET_TRANS_EGGS).isOpen;
  }

  private get awakOpen(): boolean {
    return this.awak !== null && this.window(PET_AWAK_CANCEL).isOpen;
  }

  private get tradeOpen(): boolean {
    return this.trade !== null && this.window(PET_RES).isOpen;
  }

  /**
   * The Pet Tamer's `MMI_PET_EGG01` (`WndWorld.cpp:5098-5113`): `TID_GAME_WND_OVERLAPED` when it is open; else the bag
   * opens and a new CWndPetTransEggs (OK off until the ten slots are full, `OnInitialUpdate`, :1952-1980).
   */
  openEggs(): void {
    if (this.eggsOpen) {
      this.host.say('TID_GAME_WND_OVERLAPED');
      return;
    }
    this.host.openBag();
    const window = this.window(PET_TRANS_EGGS);
    window.close(); // SAFE_DELETE( m_pWndPetTransEggs )
    const eggs: Eggs = { slots: new Array<number | null>(MAX_TRANS_EGG).fill(null) };
    this.eggs = eggs;
    this.describe(window, EGGS_TITLE, EGGS_HELP);
    EGG_SLOTS.forEach((id, i) => {
      const box = this.box(window, id);
      // OnLButtonDblClk (:1988-2011): the slot's egg let go, OK off
      box.ondblclick = () => {
        const egg = eggs.slots[i];
        if (this.eggs !== eggs || egg == null) return;
        this.host.reserve(egg, false);
        eggs.slots[i] = null;
        window.button('WIDC_OK').disabled = true;
        this.hideTooltip();
        this.drawEggs();
      };
      // OnMouseWndSurface (:2013-2032): the slot's egg's tooltip (PutToolTip_Item)
      box.onpointerenter = () => this.showTooltip(eggs.slots[i] ?? null, box);
      box.onpointerleave = () => this.hideTooltip();
    });
    // OnDropIcon (:2034-2078): anywhere on the window, the egg going in the empty slot it was dropped on
    this.takeDrops(window, (id, target) => {
      if (this.eggs !== eggs) return;
      const at = target?.closest<HTMLElement>('[data-control]')?.dataset.control;
      this.putEgg(id, at === undefined ? -1 : EGG_SLOTS.indexOf(at));
    });
    window.button('WIDC_OK').disabled = true;
    this.press(window, 'WIDC_OK', () => {
      // OnChildNotify (:2102-2120): stuff( 0 ) of the ten eggs, one of each, then the window goes
      if (this.eggs !== eggs || eggs.slots.some((egg) => egg === null)) return;
      this.host.send('transformItem', TRANSFORM_EGG, eggs.slots.map((objectId) => ({ objectId: objectId!, count: 1 })));
      window.close();
    });
    this.press(window, 'WIDC_CANCEL', () => window.close());
    window.onClose = () => {
      // OnDestroy (:1929-1936): every egg let go
      this.hideTooltip();
      for (const egg of eggs.slots) if (egg !== null) this.host.reserve(egg, false);
      eggs.slots.fill(null);
      if (this.eggs === eggs) this.eggs = null;
    };
    this.drawEggs();
    window.open();
  }

  /**
   * The Pet Tamer's `MMI_PET_AWAK_CANCEL` (`WndWorld.cpp:5231-5235`): a new CWndPetAwakCancel in place of the one open, its
   * start button off until a pick-up pet is in (`OnInitialUpdate`, :39-54).
   */
  openAwakCancel(): void {
    const window = this.window(PET_AWAK_CANCEL);
    window.close(); // SAFE_DELETE( m_pWndPetAwakCancel )
    const open: Single = { item: null, take: () => {} };
    this.awak = open;
    this.describe(window, AWAK_TITLE, AWAK_HELP);
    this.single(window, open, 'WIDC_STATIC1', 'WIDC_BUTTON1', (id) => {
      // OnDropIcon (:120-147): a pick-up pet only, nothing said of another item
      const item = this.host.own()?.inventory?.get(id);
      const prop = item && this.host.props.get(item.itemId);
      if (prop === undefined || !isEatPet(prop)) return;
      this.place(window, open, 'WIDC_STATIC1', 'WIDC_BUTTON1', id);
    }, (item) => this.host.send('pickupPetAwakeningCancel', item));
    window.button('WIDC_BUTTON1').disabled = true;
    window.open();
  }

  /**
   * The Pet Tamer's `MMI_PET_RES` (`WndWorld.cpp:4423-4438`, `__JEFF_11`): `TID_GAME_WND_OVERLAPED` when it is open; else a
   * new CWndPetRes with `TID_GAME_PETTRADE` as its help (`OnInitialUpdate`, :47-61). Its OK is on from the start (it does
   * nothing with no pet in).
   */
  openTrade(): void {
    if (this.tradeOpen) {
      this.host.say('TID_GAME_WND_OVERLAPED');
      return;
    }
    const window = this.window(PET_RES);
    window.close(); // SAFE_DELETE( m_pPetRes )
    const open: Single = { item: null, take: () => {} };
    this.trade = open;
    window.setText('WIDC_DESC', this.host.text('TID_GAME_PETTRADE'));
    this.single(window, open, 'WIDC_CHANGE', 'WIDC_OK', (id) => {
      // OnDropIcon (:146-191): a B to S pet, not out, not held, not dead; else TID_GAME_PETTRADE_ERROR in red
      const item = this.host.own()?.inventory?.get(id);
      if (item === undefined) return;
      if (!petTradeTakes(item, this.host.own()?.petSlot === id, this.host.held(id))) {
        this.host.say('TID_GAME_PETTRADE_ERROR', RED);
        return;
      }
      this.place(window, open, 'WIDC_CHANGE', 'WIDC_OK', id);
    }, (item) => this.host.send('quePetResurrection', item));
    this.press(window, 'WIDC_CANCEL', () => window.close());
    window.button('WIDC_OK').disabled = false;
    window.open();
  }

  /** QUE_PETRESURRECTION_RESULT (`OnQuePetResurrectionResult`): `TID_GAME_PETTRADE_OK` or `_FAIL` in a message box. */
  onTradeResult(ok: boolean): void {
    this.host.alert(this.host.text(petTradeResult(ok)));
  }

  /**
   * A bag item clicked (or double-clicked) while a window is open: the egg exchange's `SetItem` path (`WndField.cpp:
   * 2237-2259`: in use or not an egg said, a held egg passed over), else the open window's `OnDropIcon`. True when a window
   * took the click.
   */
  pick(objectId: number): boolean {
    if (this.eggsOpen) {
      this.putEgg(objectId, null);
      return true;
    }
    const open = this.awakOpen ? this.awak : this.tradeOpen ? this.trade : null;
    open?.take(objectId);
    return open !== null;
  }

  dispose(): void {
    this.hideTooltip();
    for (const window of this.windows.values()) window.dispose();
    this.windows.clear();
    this.eggs = null;
    this.awak = null;
    this.trade = null;
  }

  /** A window by its layout, made once and kept in the layer. */
  private window(layout: ResLayout): ResWindow {
    let window = this.windows.get(layout);
    if (window === undefined) {
      window = new ResWindow(layout, this.host.ui.art, this.host.ui.doc);
      this.windows.set(layout, window);
    }
    const layer = this.host.ui.layer();
    if (layer !== null && window.element.parentElement !== layer) layer.append(window.element);
    return window;
  }

  /** The button `id` of `window` now does `press`, in place of what it did. */
  private press(window: ResWindow, id: string, press: () => void): void {
    window.button(id).onclick = (event) => {
      event.preventDefault();
      press();
    };
  }

  /** A slot's box: the picture static's element. */
  private box(window: ResWindow, id: string): HTMLElement {
    return window.control(id).parentElement!;
  }

  /** `SetDescription`: the file's title in blue and bold, then its help. */
  private describe(window: ResWindow, title: string, help: string): void {
    const head = this.host.ui.doc.createElement('span');
    head.className = 'hud-res-words-title';
    head.textContent = title;
    window.setContent('WIDC_TEXT1', head, '\n', help);
  }

  /** Drops from the bag on the window (`OnDropIcon`): `take` hears the item's object id and the element it fell on. */
  private takeDrops(window: ResWindow, take: (objectId: number, target: Element | null) => void): void {
    const element = window.frame.element;
    element.ondragover = (event) => {
      if (event.dataTransfer?.types.includes('application/x-flyff-inventory') === true) event.preventDefault();
    };
    element.ondrop = (event) => {
      const id = Number(event.dataTransfer?.getData('application/x-flyff-inventory'));
      if (!Number.isFinite(id)) return;
      event.preventDefault();
      take(id, event.target instanceof Element ? event.target : null);
    };
  }

  /**
   * An egg for the exchange: `OnDropIcon` on slot `at` (-1 off the slots; it goes in only when that slot is empty) or the
   * bag's `SetItem` (`null`: the first empty slot). In use: ERROR2; not an unhatched egg: ERROR1; held: passed over.
   * `CheckFull` turns OK on when all ten are in.
   */
  private putEgg(objectId: number, at: number | null): void {
    const eggs = this.eggs;
    const item = this.host.own()?.inventory?.get(objectId);
    const prop = item && this.host.props.get(item.itemId);
    if (eggs === null || item === undefined || prop === undefined) return;
    const refused = transEggRefusal(prop, item, this.host.inUse(objectId));
    if (refused !== null) {
      this.host.say(refused);
      return;
    }
    if (this.host.held(objectId)) return; // IsUsableItem
    const slot = at === null ? eggs.slots.indexOf(null) : at;
    if (slot >= 0 && eggs.slots[slot] === null) {
      eggs.slots[slot] = objectId;
      this.host.reserve(objectId, true);
    }
    // CheckFull (:2142-2159)
    if (eggs.slots.every((egg) => egg !== null)) this.window(PET_TRANS_EGGS).button('WIDC_OK').disabled = false;
    this.drawEggs();
  }

  /** `OnDraw` (:1938-1950): II_PET_EGG's icon at the top left of each slot holding an egg. */
  private drawEggs(): void {
    const eggs = this.eggs;
    if (eggs === null) return;
    const window = this.window(PET_TRANS_EGGS);
    const icon = this.host.props.get(II_PET_EGG)?.icon ?? null;
    EGG_SLOTS.forEach((id, i) => this.drawSlot(this.box(window, id), eggs.slots[i] == null ? null : icon));
  }

  /** A slot's picture: `icon` at its top left (`Render( p2DRender, rect.TopLeft() )`), or none. */
  private drawSlot(box: HTMLElement, icon: string | null): void {
    box.querySelector('.hud-res-slot')?.remove();
    if (icon === null) return;
    const doc = this.host.ui.doc;
    const holder = doc.createElement('div');
    holder.className = 'hud-res-slot';
    const img = doc.createElement('img');
    img.src = this.host.ui.art.url(icon);
    img.alt = '';
    img.draggable = false;
    holder.append(img);
    box.append(holder);
  }

  /**
   * The awakening cancel's and the pet trade's one slot: `take` is their `OnDropIcon` (a drop anywhere on the window, or a
   * click in the bag); a double-click on the slot lets the item go and turns `ok` off (`OnLButtonDblClk`); `ok` with an
   * item turns off, sends and closes (`OnChildNotify`); the close lets the item go (`OnDestroy`).
   */
  private single(window: ResWindow, open: Single, slotId: string, okId: string, take: (objectId: number) => void, send: (item: number) => void): void {
    open.take = (id) => { if (this.isCurrent(open)) take(id); };
    this.takeDrops(window, (id) => open.take(id));
    this.box(window, slotId).ondblclick = () => {
      if (!this.isCurrent(open) || open.item === null) return;
      this.host.reserve(open.item, false);
      open.item = null;
      window.button(okId).disabled = true;
      this.drawSlot(this.box(window, slotId), null);
    };
    this.press(window, okId, () => {
      if (!this.isCurrent(open) || open.item === null) return;
      window.button(okId).disabled = true;
      send(open.item);
      window.close();
    });
    window.onClose = () => {
      if (open.item !== null) this.host.reserve(open.item, false);
      open.item = null;
      if (this.awak === open) this.awak = null;
      if (this.trade === open) this.trade = null;
    };
    this.drawSlot(this.box(window, slotId), null);
  }

  /** The item at `objectId` in `open`'s slot, the one before let go, `ok` on; drawn with its own icon (`m_pTexture`). */
  private place(window: ResWindow, open: Single, slotId: string, okId: string, objectId: number): void {
    if (open.item !== null) this.host.reserve(open.item, false);
    open.item = objectId;
    this.host.reserve(objectId, true);
    window.button(okId).disabled = false;
    const item = this.host.own()?.inventory?.get(objectId);
    const prop = item && this.host.props.get(item.itemId);
    this.drawSlot(this.box(window, slotId), item === undefined ? null : itemIconOf(item, prop));
  }

  private isCurrent(open: Single): boolean {
    return this.awak === open || this.trade === open;
  }

  /** The egg at `objectId`'s tooltip over its slot (flag 0), or none for an empty one. */
  private showTooltip(objectId: number | null, anchor: HTMLElement): void {
    this.hideTooltip();
    const item = objectId === null ? undefined : this.host.own()?.inventory?.get(objectId);
    if (item === undefined) return;
    const { art, doc } = this.host.ui;
    const ctx: TooltipContext = { ...this.host.tooltipContext(item), flag: 'other' };
    const tooltip = createItemDetails(doc, art, this.host.tooltipData, item, this.host.props.get(item.itemId), ctx);
    tooltip.classList.add('hud-pet-tooltip');
    this.window(PET_TRANS_EGGS).frame.element.append(tooltip);
    positionItemDetails(tooltip, anchor, doc);
    this.tooltip = tooltip;
  }

  private hideTooltip(): void {
    this.tooltip?.remove();
    this.tooltip = null;
  }
}
