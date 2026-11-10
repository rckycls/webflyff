import { createItemDetails, ownTooltipContext, positionItemDetails } from './itemDetails';
import { drawCooldown } from './cooldown';
import { upgradeKindOf } from '../items/upgradeItems';
import type { OwnState } from '../OwnState';
import type { GameData } from '../gameData';
import { themeUrl } from './art';
import type { UiArt } from './art';
import { WindowFrame } from './frame';
import { fitsEquipmentSlot } from '../items/equipment';
import { usableFromBag } from '../items/travelItems';
import { isRide } from '../items/rideItems';
import { itemIconOf, itemName } from '../pets/petStatus';
import type { WebItemProp } from '@flyffweb/formats';
import type { InventoryItem } from '@flyffweb/protocol';

/** `CItemElem::expired` (`m_byFlag`, `_Common/Item.h:119`). */
const ITEM_EXPIRED = 0x01;

/** Piece 7 M5: a ride's prop (`PARTS_RIDE` with flight columns). */
const isRideProp = (prop: WebItemProp | undefined): boolean => prop !== undefined && isRide(prop);

export interface InventoryActions {
  /** 2026-11-05: `shift`, Shift held on the double-click (the safe upgrade fills a column with it). */
  use(id: number, shift?: boolean): void;
  equip(id: number, shift?: boolean): void;
  /** Piece 7 M5: the worn ride's equipment cell lands it (`ItemUse.land`). */
  land?(id: number): void;
  drop(id: number, count: number): void;
  move(source: number, destination: number): void;
  shortcut(id: number, slot: number): void;
  /**
   * 2026-11-05: the upgrade cursor (items/upgradeCursor.ts): whether it is on, the item its wait is for, a bag item
   * clicked as its target (true when taken), and its cancel (a right click, the bag closing).
   */
  upgrade?: { active(): boolean; waitingTarget(): number | null; pick(id: number): boolean; cancel(): void };
  /** 2026-11-05: an item a window holds (`m_dwExtra`): drawn faded, neither used nor dragged. */
  held?(id: number): boolean;
  /** 2026-11-05: an item in use, drawn faded and still usable (the ticket in use, `CMover::GetTicket`). */
  inUse?(id: number): boolean;
  /** 2026-11-05: the pieces of a stack a window holds under the safe upgrade's die flag: the count shows the rest. */
  reservedCount?(id: number): number;
  /** 2026-11-05: the bag closed (the windows that go with it: the piercing and the safe upgrade). */
  closed?(): void;
  /** 2026-11-05: the hammer over the bag: the upgrade mode's (`m_bIsUpgradeMode`), not a window's pick. */
  hammer?(): boolean;
  /** 2026-11-09 (pets R2): the own player has the buff, for the tooltips that ask (PutPetFeedPocket). */
  hasBuff?(buffType: number, id: number): boolean;
}

export class InventoryWindow {
  readonly frame: WindowFrame;
  shopSelect?: (id: number) => void;
  onShopClose?: () => void;
  /**
   * 2026-11-10 (trade): while the trade window is open the phone, which has no drag, puts a tapped item or the tapped
   * penya in the trade (the desktop drags them onto the own grid, CWndTradeCtrl::OnDropIcon).
   */
  trade?: { active(): boolean; tapItem(id: number): void; tapPenya(): void };
  private own: OwnState | undefined;
  private selected: number | null = null;
  private revision = -1;
  /** 2026-11-09 (pets review): the pet numbers' revision the open tooltip was drawn at, and the item it was drawn of. */
  private petRevision = -1;
  private detailsItem: InventoryItem | undefined;
  private preview: HTMLCanvasElement | undefined;
  private actionsOpen = false;
  private dragged: { id: number; itemId: number } | null = null;
  private mobile = false;
  private hoverAnchor: HTMLElement | null = null;
  constructor(private readonly art: UiArt, private readonly data: GameData,
    private readonly actions: InventoryActions, private readonly doc: Document = document) {
    this.frame = new WindowFrame('Inventory', art, { width: 240, height: 464, texture: 'WndInventory3D.tga' }, doc);
    this.frame.element.classList.add('hud-inventory');
    this.frame.element.style.setProperty('--classic-inventory-art', themeUrl(art, 'WndInventory3D.tga'));
    // 2026-11-05: the hammer cursor (ui/anvil.png, the converter's from Client/Cursor/anvil.cur), its hotspot the top left
    const hammer = art.url('ui/anvil.png');
    if (hammer !== '') this.frame.element.style.setProperty('--hud-hammer', `url(${JSON.stringify(hammer)}) 0 0, crosshair`);
    doc.addEventListener('dragover', this.onDragOver);
    doc.addEventListener('drop', this.onDrop);
    this.frame.onClose = () => { if (this.shopSelect) this.onShopClose?.(); this.dragged = null; this.actionsOpen = false; this.frame.element.querySelector('.inventory-drop-dialog')?.remove(); this.actions.upgrade?.cancel(); this.actions.closed?.(); };
    // 2026-11-05: a right click on the bag ends the upgrade mode (CWndInventory::OnRButtonUp, WndField.cpp:2806)
    this.frame.element.addEventListener('contextmenu', () => this.actions.upgrade?.cancel());
  }

  setPreview(canvas: HTMLCanvasElement): void {
    this.preview = canvas;
    this.frame.element.querySelector('.inventory-preview')?.replaceChildren(canvas);
  }

  toggle(own: OwnState): void {
    if (this.frame.isOpen) this.frame.close();
    else {
      const layer = this.frame.element.parentElement;
      this.frame.open({ x: Math.max(0, (layer?.clientWidth ?? 440) - 252), y: 80 }); this.update(own, true);
    }
  }
  update(own: OwnState, force = false): void {
    this.own = own;
    if (this.frame.isOpen) {
      const mobile = this.frame.element.hasAttribute('data-mobile-window');
      if (mobile !== this.mobile) { this.mobile = mobile; force = true; }
      this.frame.element.classList.toggle('inventory-actions-right', !mobile && this.frame.position.x < 240);
      const layer = this.frame.element.parentElement;
      if (mobile && layer) {
        const taskbarHeight = parseFloat(this.doc.defaultView?.getComputedStyle(layer).getPropertyValue('--hud-taskbar-height') ?? '') || 48;
        const bagWidth = Math.max(0, Math.min(layer.clientWidth - 24, (layer.clientHeight - taskbarHeight - 16) * 1.62));
        this.frame.element.style.setProperty('--mobile-inventory-width', `${bagWidth}px`);
        layer.style.setProperty('--bag-window-width', `${bagWidth}px`);
      }
      if (layer) {
        const rect = this.frame.element.getBoundingClientRect(), parent = layer.getBoundingClientRect();
        const left = rect.left - parent.left, top = rect.top - parent.top;
        const shopLeft = left >= 276 ? left - 276 : left + rect.width + 12;
        layer.style.setProperty('--shop-window-left', Math.max(8, shopLeft) + 'px');
        layer.style.setProperty('--bag-window-top', top + 'px');
      }
      const width = this.frame.element.clientWidth, height = this.frame.element.clientHeight;
      const scale = mobile ? Math.max(.5, Math.min((width - 12) / 456, (height - 42) / 252)) : 1;
      this.frame.element.style.setProperty('--classic-inventory-scale', String(scale));
    }
    if (!this.frame.isOpen) return;
    if (!force && this.revision === own.inventoryRevision) {
      // 2026-11-09 (pets review): the pet's numbers (PET_STATE about once a second) are not the bag's: the open tooltip
      // alone shows them again, as Neuz's tooltip is put each frame the mouse is on the item
      if (this.petRevision !== own.petRevision) { this.petRevision = own.petRevision; this.refreshDetails(own); }
      return;
    }
    this.revision = own.inventoryRevision;
    this.petRevision = own.petRevision;
    const body = this.frame.body;
    const scrollTop = body.querySelector('.inventory-bag-scroll')?.scrollTop ?? 0;
    this.hoverAnchor = null;
    if (!this.mobile) this.actionsOpen = false;
    body.replaceChildren();
    if (own.inventory === null) { body.textContent = 'Inventory unavailable. Reconnect to reload it.'; return; }
    const sections = this.doc.createElement('div'); sections.className = 'inventory-sections';
    const equipmentBox = this.doc.createElement('div'); equipmentBox.className = 'inventory-equipment-box';
    const bagBox = this.doc.createElement('div'); bagBox.className = 'inventory-bag-box';
    const bag = this.doc.createElement('div'); bag.className = 'inventory-bag';
    const scroll = this.doc.createElement('div'); scroll.className = 'inventory-bag-scroll';
    let lastWheel = -Infinity, wheelDirection = 0;
    scroll.addEventListener('wheel', (event) => {
      if (!event.deltaY) return;
      event.preventDefault();
      const now = performance.now(), direction = Math.sign(event.deltaY);
      if (direction === wheelDirection && now - lastWheel < 200) return;
      lastWheel = now; wheelDirection = direction;
      scroll.scrollTop = Math.max(0, Math.round(scroll.scrollTop / 32) * 32 + direction * 32);
      if (!this.mobile) { this.actionsOpen = false; this.drawDetails(); }
    }, { passive: false });
    let touch: { y: number; top: number; scale: number; dragged: boolean } | null = null;
    const finishTouch = () => {
      if (touch?.dragged) {
        scroll.scrollTop = Math.round(scroll.scrollTop / 32) * 32;
        scroll.style.removeProperty('scroll-snap-type');
      }
      touch = null;
    };
    scroll.addEventListener('touchstart', (event) => {
      finishTouch();
      if (event.touches.length !== 1) return;
      touch = { y: event.touches[0]!.clientY, top: scroll.scrollTop,
        scale: scroll.getBoundingClientRect().height / scroll.clientHeight || 1, dragged: false };
    }, { passive: true });
    scroll.addEventListener('touchmove', (event) => {
      if (!touch || event.touches.length !== 1) { finishTouch(); return; }
      const distance = touch.y - event.touches[0]!.clientY;
      if (!touch.dragged && Math.abs(distance) < 4) return;
      event.preventDefault();
      touch.dragged = true; scroll.style.scrollSnapType = 'none';
      // 2026-11-10 (mobile-ux-fixes): a whole row at a time, as Neuz scrolls the bag (`GetScrollPos() * nWidth`,
      // WndItemCtrl.cpp:446-454): the items never stand across the bag's dividers, which stay put; the last row's offset
      // is the bound (the bag scrolls a few px past its 7 rows)
      const room = scroll.scrollHeight - scroll.clientHeight;
      const last = room > 0 ? Math.round(room / 32) * 32 : Infinity;
      scroll.scrollTop = Math.max(0, Math.min(last, Math.round((touch.top + distance * .5 / touch.scale) / 32) * 32));
    }, { passive: false });
    scroll.addEventListener('touchend', finishTouch);
    scroll.addEventListener('touchcancel', finishTouch);
    const grid = this.doc.createElement('div'); grid.className = 'inventory-grid';
    grid.setAttribute('aria-label', 'Inventory bag');
    for (let slot = 0; slot < 42; slot++) {
      const id = own.inventorySlots[slot]!, item = own.inventory.get(id), prop = item && this.data.itemProps.get(item.itemId);
      const cell = this.doc.createElement('button'); cell.type = 'button'; cell.dataset.bagSlot = String(slot); cell.dataset.silent = '';
      cell.className = 'inventory-cell'; cell.classList.toggle('is-selected', id === this.selected && item !== undefined);
      // 2026-11-05: an item in use drawn at alpha 60 (CWndItemCtrl::OnDraw, WndItemCtrl.cpp:472-487): one a window holds
      // (SetExtra), which is not used nor dragged, and the ticket in use (GetTicket)
      const held = item !== undefined && this.actions.held?.(id) === true;
      if (item !== undefined && (held || this.actions.inUse?.(id) === true)) cell.classList.add('is-in-use');
      // 2026-11-09 (pets R2): the name of `GetName` (a raised pet's "Cage"), the icon of `SetTexture` (by its pet's level)
      const name = item !== undefined && prop !== undefined ? itemName(item, prop, this.data) : 'Unknown item';
      cell.setAttribute('aria-label', item ? `${name} ×${item.count}, slot ${slot + 1}` : `Empty slot ${slot + 1}`);
      const iconKey = item === undefined ? null : itemIconOf(item, prop);
      if (iconKey) {
        const icon = this.doc.createElement('img'); icon.src = this.art.url(iconKey); icon.alt = ''; cell.append(icon);
        // 2026-11-09 (pets R2): an expired item (a dead pet) tinted ARGB(alpha, 255, 100, 100) (RanderIcon, WndItemCtrl.cpp:345-361)
        if (((item?.flag ?? 0) & ITEM_EXPIRED) !== 0) cell.append(this.expiredTint(iconKey));
      } else if (item) cell.append('?');
      if (item) { const count = this.doc.createElement('span'); count.textContent = String(item.count - (this.actions.reservedCount?.(id) ?? 0)); cell.append(count); }
      cell.addEventListener('click', () => {
        // 2026-11-05: in the upgrade mode a click is its target's (CWndItemCtrl::OnLButtonDown); an empty cell does nothing
        if (this.actions.upgrade?.active() === true) { if (item) this.actions.upgrade.pick(id); return; }
        if (this.shopSelect) { this.selected = item ? id : null; this.actionsOpen = false; this.drawDetails(); this.shopSelect(item ? id : -1); return; }
        if (this.mobile && item && this.trade?.active() === true) { if (!held) this.trade.tapItem(id); return; }
        this.selected = item ? id : null; this.actionsOpen = item !== undefined && (this.mobile || this.hoverAnchor === cell);
        this.drawDetails();
      });
      this.hoverItem(cell, item?.objectId);
      cell.addEventListener('dblclick', (event) => {
        event.preventDefault();
        if (!item || this.mobile || this.shopSelect) return;
        if (held) return; // a held item is not used (IsUsingItem)
        // a ride (PARTS_RIDE) is used, not equipped (Piece 7 M5)
        if ((prop?.part ?? -1) >= 0 && !isRideProp(prop)) this.actions.equip(id, event.shiftKey); else this.actions.use(id, event.shiftKey);
      });
      cell.draggable = !!item && !held && !this.mobile && !this.shopSelect;
      cell.addEventListener('dragstart', (event) => {
        if (!item || this.mobile || this.own?.equipmentObjectIds.includes(id)) { event.preventDefault(); return; }
        this.dragged = { id, itemId: item.itemId };
        this.actionsOpen = false; this.drawDetails();
        event.dataTransfer?.setData('application/x-flyff-inventory', String(id));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      });
      cell.addEventListener('dragend', () => { this.dragged = null; });
      grid.append(cell);
    }
    const equipment = this.doc.createElement('div'); equipment.className = 'inventory-equipment';
    const preview = this.doc.createElement('div'); preview.className = 'inventory-preview';
    preview.setAttribute('aria-label', 'Character equipment preview');
    if (this.preview) preview.append(this.preview);
    equipment.append(preview);
    // CWndInventory::OnInitialUpdate, WndField.cpp:1570-1608: native control rectangles in client coordinates.
    const alternate = (part: number, other: number): number => this.itemAt(other) ? other : part;
    const slots = [
      [10, 6, 4, 44], [alternate(11, 9), 6, 52, 44], [25, 6, 100, 44], [8, 6, 148, 44], [12, 6, 196, 44],
      [alternate(6, 14), 178, 4, 44], [alternate(2, 15), 178, 52, 44], [alternate(4, 17), 178, 100, 44],
      [alternate(5, 18), 178, 148, 44], [13, 176, 196, 44],
      [20, 52, 4, 24], [22, 76, 4, 24], [19, 102, 4, 24], [23, 128, 4, 24], [21, 152, 4, 24],
      [26, 52, 210, 31], [27, 82, 210, 31], [28, 114, 210, 31], [29, 144, 210, 31],
    ];
    for (const [part, x, y, size] of slots as Array<[number, number, number, number]>) {
      const item = this.itemAt(part);
      const prop = item && this.data.itemProps.get(item.itemId);
      const cell = this.doc.createElement('button'); cell.type = 'button';
      cell.className = 'inventory-equipped-cell'; cell.dataset.silent = ''; cell.dataset.equipmentPart = String(part);
      Object.assign(cell.style, { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` });
      cell.setAttribute('aria-label', item ? `Equipped ${prop?.name ?? 'Unknown equipment'}` : `Empty equipment slot ${part}`);
      // a worn item shows the item tooltip (CWndInventory::OnMouseWndSurface, WndField.cpp:1151); an empty slot its name
      if (item) cell.removeAttribute('title'); else cell.title = `Equipment slot ${part}`;
      if (prop?.icon) { const img = this.doc.createElement('img'); img.src = this.art.url(prop.icon); img.alt = ''; cell.append(img); }
      cell.addEventListener('click', () => { if (!item) return; if (this.shopSelect) { this.shopSelect(item.objectId); return; } this.selected = item.objectId; this.actionsOpen = this.mobile || this.hoverAnchor === cell; this.drawDetails(); });
      this.hoverItem(cell, item?.objectId);
      cell.addEventListener('dblclick', (event) => {
        event.preventDefault();
        if (!item || this.mobile || this.shopSelect) return;
        if (isRideProp(prop)) this.actions.land?.(item.objectId); else this.actions.equip(item.objectId);
      });
      equipment.append(cell);
    }
    scroll.append(grid);
    if (this.mobile) {
      // Extend the original grid with native middle-row artwork, keeping square 32px cells.
      const artwork = this.doc.createElement('div'); artwork.className = 'inventory-mobile-grid-art';
      artwork.setAttribute('aria-hidden', 'true');
      for (let row = 0; row < 6; row++) {
        const strip = this.doc.createElement('div');
        strip.style.backgroundPosition = `-4px -${row === 0 ? 272 : row === 5 ? 368 : 304}px`;
        artwork.append(strip);
      }
      const heading = this.doc.createElement('div'); heading.className = 'inventory-grid-heading'; heading.textContent = 'Item';
      const base = this.doc.createElement('div'); base.className = 'inventory-mobile-bag-footer'; base.setAttribute('aria-hidden', 'true');
      bag.append(artwork, heading, base);
    }
    const footer = this.doc.createElement('div'); footer.className = 'inventory-money';
    footer.setAttribute('aria-label', 'Penya'); footer.textContent = own.gold.toLocaleString('en-US');
    // 2026-11-10 (trade): the penya sack (`CWndGold`, WndField.cpp:490-500), dragged onto the own trade grid; tapped on a phone
    footer.draggable = !this.mobile;
    footer.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('application/x-flyff-penya', String(own.gold));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    footer.addEventListener('click', () => { if (this.mobile && this.trade?.active() === true) this.trade.tapPenya(); });
    bag.append(scroll, footer);
    bagBox.append(bag); equipmentBox.append(equipment); sections.append(equipmentBox, bagBox);
    body.append(sections);
    scroll.scrollTop = Math.round(scrollTop / 32) * 32;
    this.drawDetails();
  }

  /**
   * 2026-11-09 (pets R2): `Render2( ..., D3DCOLOR_ARGB( nalpha, 255, 100, 100 ) )`, the icon times (1, 100/255, 100/255):
   * a red over the icon, multiplied, cut to the icon's shape (its own alpha as the mask), as the gauges are drawn.
   */
  private expiredTint(iconKey: string): HTMLElement {
    const tint = this.doc.createElement('i');
    tint.className = 'inventory-expired';
    const url = `url(${JSON.stringify(this.art.url(iconKey))})`;
    tint.style.setProperty('-webkit-mask-image', url);
    tint.style.setProperty('mask-image', url);
    return tint;
  }

  private hoverItem(cell: HTMLElement, id: number | undefined): void {
    cell.addEventListener('mouseenter', () => {
      if (this.mobile || id === undefined || this.dragged) return;
      this.hoverAnchor = cell; this.selected = id; this.actionsOpen = true; this.drawDetails();
    });
    cell.addEventListener('mouseleave', () => {
      if (this.mobile || this.hoverAnchor !== cell) return;
      this.hoverAnchor = null; this.actionsOpen = false; this.drawDetails();
    });
  }

  /**
   * 2026-11-05: each bag cell's cool-down sweep (`RenderRadar` in the item list, `WndItemCtrl.cpp:540-550`): `done` gives
   * the share gone for an item's object, or null. One call a frame while the bag is open.
   */
  drawCooldowns(done: (objectId: number) => number | null): void {
    const own = this.own;
    if (!own || !this.frame.isOpen) return;
    for (const cell of this.frame.element.querySelectorAll<HTMLElement>('[data-bag-slot]')) {
      const id = own.inventorySlots[Number(cell.dataset.bagSlot)];
      drawCooldown(cell, id === undefined || !own.inventory?.has(id) ? null : done(id));
    }
  }

  /**
   * 2026-11-05: the upgrade mode on the bag (the hammer cursor, CUR_HAMMER) and the waiting target's cell (its
   * `Icon_ImgIncAni` frames, here a CSS pulse). One call a frame while the bag is open.
   */
  drawUpgrade(): void {
    const own = this.own, upgrade = this.actions.upgrade;
    if (!own || !this.frame.isOpen) return;
    this.frame.element.toggleAttribute('data-upgrading', (this.actions.hammer?.() ?? upgrade?.active()) === true);
    const waiting = upgrade?.waitingTarget() ?? null;
    for (const cell of this.frame.element.querySelectorAll<HTMLElement>('[data-bag-slot]')) {
      cell.toggleAttribute('data-upgrade-wait', waiting !== null && own.inventorySlots[Number(cell.dataset.bagSlot)] === waiting);
    }
  }

  private itemAt(part: number) {
    const item = this.own?.inventory?.get(this.own.equipmentObjectIds[part]!);
    return item && fitsEquipmentSlot(this.data.itemProps.get(item.itemId), part) ? item : undefined;
  }

  /** Selecting an item preserves the clicked cell, so the browser can dispatch its subsequent double click. */
  private drawDetails(): void {
    const own = this.own;
    if (!own) return;
    for (const cell of this.frame.element.querySelectorAll<HTMLElement>('[data-bag-slot]')) {
      cell.classList.toggle('is-selected', own.inventorySlots[Number(cell.dataset.bagSlot)] === this.selected);
    }
    this.frame.body.querySelector('.inventory-details')?.remove();
    this.detailsItem = undefined;
    const item = this.selected === null ? undefined : own.inventory?.get(this.selected);
    if (!item || !this.actionsOpen || (this.shopSelect && this.mobile)) return;
    const prop = this.data.itemProps.get(item.itemId);
    const details = this.tooltipOf(own, item);
    this.detailsItem = item;
    const close = this.doc.createElement('button'); close.type = 'button'; close.className = 'inventory-details-close';
    close.textContent = '×'; close.setAttribute('aria-label', 'Close item details');
    close.addEventListener('click', () => { this.actionsOpen = false; this.drawDetails(); }); details.append(close);
    if (this.mobile) {
      // 2026-11-10 (owner): a tap on Use, Equip, Unequip or Drop closes the tooltip it is on; a tap on the item opens it again
      const button = (action: string, label: string, run: () => void) => {
        const el = this.doc.createElement('button'); el.type = 'button'; el.dataset.itemAction = action; el.textContent = label;
        el.disabled = own.hp <= 0;
        el.addEventListener('click', () => { el.blur(); this.actionsOpen = false; this.drawDetails(); run(); });
        details.append(el);
      };
      if (own.equipmentObjectIds.some((id, part) => id === item.objectId && this.itemAt(part))) {
        button('unequip', 'Unequip', () => (isRideProp(prop) ? this.actions.land?.(item.objectId) : this.actions.equip(item.objectId)));
      } else {
        if (prop && prop.part >= 0 && prop.part < 31 && prop.part !== 13) button('equip', 'Equip', () => this.actions.equip(item.objectId));
        // Piece 7 M3: and the travel items; 2026-11-05: and the upgrade materials, which start the upgrade mode
        if (prop && (usableFromBag(prop) || upgradeKindOf(prop) !== null)) button('use', 'Use', () => this.actions.use(item.objectId));
        button('drop', 'Drop', () => this.requestDrop(item.objectId));
      }
    }
    this.frame.body.append(details);
    if (!this.mobile && this.hoverAnchor) {
      positionItemDetails(details, this.hoverAnchor, this.doc);
    }
  }

  /** The tooltip as APP_INVENTORY asks for it: the selling price while a shop is open, the set +N on a worn piece. */
  private tooltipOf(own: OwnState, item: InventoryItem): HTMLElement {
    return createItemDetails(this.doc, this.art, this.data, item, this.data.itemProps.get(item.itemId),
      ownTooltipContext(own, item, 'inventory', this.shopSelect !== undefined, this.actions.hasBuff?.bind(this.actions)));
  }

  /**
   * 2026-11-09 (pets review): the open tooltip's text and frame made again when its item was (a pet's numbers), in place:
   * the close and Use/Equip buttons stay on the page, so a press on them is not lost.
   */
  private refreshDetails(own: OwnState): void {
    const shown = this.detailsItem;
    const details = this.frame.body.querySelector<HTMLElement>('.inventory-details');
    if (shown === undefined || details === null) return;
    const item = own.inventory?.get(shown.objectId);
    if (item === shown) return;
    if (item === undefined || item.itemId !== shown.itemId) { this.drawDetails(); return; }
    const fresh = this.tooltipOf(own, item);
    for (const child of [...details.children]) if (child.tagName !== 'BUTTON') child.remove();
    details.prepend(...fresh.children);
    this.detailsItem = item;
    if (!this.mobile && this.hoverAnchor) positionItemDetails(details, this.hoverAnchor, this.doc);
  }

  private requestDrop(id: number): void {
    const item = this.own?.inventory?.get(id);
    if (!item || this.own!.equipmentObjectIds.includes(id) || this.own!.hp <= 0) return;
    this.actionsOpen = false; this.drawDetails();
    this.frame.element.querySelector('.inventory-drop-dialog')?.remove();
    const dialog = this.doc.createElement('div'); dialog.className = 'inventory-drop-dialog';
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-label', 'Drop item');
    const title = this.doc.createElement('strong'); title.textContent = `Drop ${this.data.itemProps.get(item.itemId)?.name ?? 'item'}?`;
    const quantity = this.doc.createElement('input'); quantity.type = 'number'; quantity.min = '1'; quantity.max = String(item.count); quantity.value = '1';
    quantity.setAttribute('aria-label', 'Drop quantity');
    const confirm = this.doc.createElement('button'); confirm.type = 'button'; confirm.textContent = 'Drop';
    confirm.addEventListener('click', () => {
      const count = Number(quantity.value), current = this.own?.inventory?.get(id);
      if (current?.itemId !== item.itemId || !Number.isInteger(count) || count < 1 || count > current.count || this.own!.equipmentObjectIds.includes(id)) return;
      this.actions.drop(id, count); dialog.remove();
    });
    const cancel = this.doc.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.addEventListener('click', () => dialog.remove());
    dialog.append(title, quantity, confirm, cancel); this.frame.element.append(dialog);
  }

  private readonly onDragOver = (event: DragEvent): void => { if (this.dragged) event.preventDefault(); };
  private readonly onDrop = (event: DragEvent): void => {
    const drag = this.dragged; this.dragged = null;
    if (!drag) return;
    event.preventDefault();
    const current = this.own?.inventory?.get(drag.id);
    const source = this.own?.inventorySlots.indexOf(drag.id) ?? -1;
    if (current?.itemId !== drag.itemId || source < 0 || source >= 42 || this.own!.equipmentObjectIds.includes(drag.id)) return;
    const target = event.target as Element | null;
    const slot = target?.closest?.<HTMLElement>('[data-bag-slot]');
    if (slot && this.frame.element.contains(slot)) { this.actions.move(source, Number(slot.dataset.bagSlot)); return; }
    const equipment = target?.closest?.<HTMLElement>('[data-equipment-part]');
    if (equipment && this.frame.element.contains(equipment)) {
      const item = this.own?.inventory?.get(drag.id);
      if (item && fitsEquipmentSlot(this.data.itemProps.get(item.itemId), Number(equipment.dataset.equipmentPart))) this.actions.equip(drag.id);
      return;
    }
    const shortcut = target?.closest?.<HTMLElement>('.hud-slot[data-row="item"]');
    if (shortcut) { this.actions.shortcut(drag.id, Number(shortcut.dataset.slot)); return; }
    if (target?.matches?.('.world-view canvas')) this.requestDrop(drag.id);
  };

  dispose(): void {
    this.doc.removeEventListener('dragover', this.onDragOver); this.doc.removeEventListener('drop', this.onDrop);
    this.frame.close(); this.frame.element.remove();
  }
}
