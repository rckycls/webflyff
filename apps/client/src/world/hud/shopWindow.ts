import { createItemDetails, ownTooltipContext, positionItemDetails } from './itemDetails';
import type { WebNpc } from '@flyffweb/formats';
import type { InventoryItem } from '@flyffweb/protocol';
import type { GameData } from '../gameData';
import type { OwnState } from '../OwnState';
import { themeUrl } from './art';
import type { UiArt } from './art';
import { WindowFrame } from './frame';
import { TAB_TILE, chosenTabTiles, tabStripTiles } from './tiles';

/** The shop's four stock tabs (`CWndShop`, MAX_VENDOR_INVENTORY_TAB). */
const SHOP_TABS = 4;

interface ShopActions {
  open(id: number): void; close(): void;
  buy(tab: number, id: number, count: number, itemId: number): void;
  sell(id: number, count: number): void;
}
type Selection = { kind: 'buy' | 'sell'; tab: number; id: number; itemId: number };

export class ShopWindow {
  readonly frame: WindowFrame;
  onOpen?: () => void;
  onClosed?: () => void;
  private id: number | null = null;
  private name = '';
  private metadata: WebNpc | undefined;
  private tabs: InventoryItem[][] | null = null;
  private tab = 0;
  private selection: Selection | null = null;
  private revision = -1;
  private gold = -1;
  private pending: number | null = null;
  private readonly quantity: HTMLInputElement;
  private readonly status: HTMLElement;
  private hoverDetails: HTMLElement | undefined;
  constructor(private readonly art: UiArt, private readonly data: GameData, private readonly own: () => OwnState | undefined,
    private readonly valid: (id: number) => boolean, private readonly actions: ShopActions, private readonly doc: Document = document) {
    this.frame = new WindowFrame('Shop', art, { width: 264, height: 400, mobileScale: 1 }, doc); this.frame.element.classList.add('hud-shop');
    this.frame.element.style.setProperty('--classic-shop-art', themeUrl(art, 'WndInventory3D.tga'));
    this.quantity = doc.createElement('input'); this.quantity.type = 'number'; this.quantity.name = 'quantity';
    this.quantity.setAttribute('aria-label', 'Shop quantity'); this.quantity.min = '1'; this.quantity.max = '32767'; this.quantity.value = '1';
    const editPieces = [0, 2, 6, 8, 1, 7, 3, 5, 4].map(index => themeUrl(art, 'WndEditTile' + String(index).padStart(2, '0') + '.tga'));
    this.quantity.style.backgroundImage = editPieces.join(','); this.quantity.classList.add('classic-shop-edit');
    this.status = doc.createElement('p'); this.status.setAttribute('role', 'status'); this.status.className = 'shop-feedback'; this.status.hidden = true;
    this.frame.onClose = () => { this.hideDetails(); if (this.id !== null) this.actions.close(); this.id = null; this.tabs = null; this.selection = null; this.pending = null; this.onClosed?.(); };
  }
  open(id: number, name: string, metadata?: WebNpc): void {
    if (!this.valid(id)) return;
    this.frame.close(); this.metadata = metadata; this.id = id; this.name = name; this.tabs = null; this.tab = 0; this.selection = null;
    this.pending = null; this.revision = -1; this.gold = -1; this.setStatus('');
    this.frame.open({ x: 240, y: 70 }); this.update(); this.onOpen?.(); this.actions.open(id);
  }
  receive(id: number, tabs: InventoryItem[][]): void {
    if (id !== this.id || !this.check()) return;
    this.tabs = tabs; this.selection = null; this.pending = null; this.setStatus('');
    this.draw();
  }
  feedback(text: string): void { if (this.frame.isOpen) { this.pending = null; this.setStatus(text); } }
  private check(): boolean {
    if (this.id === null || !this.frame.isOpen) return false;
    if (!this.valid(this.id)) { this.frame.close(); return false; }
    return true;
  }
  update(): void {
    if (!this.check()) return;
    const own = this.own(); if (!own) return;
    const changed = own.inventoryRevision !== this.revision || own.gold !== this.gold;
    if (this.pending !== null && changed) this.feedback('');
    if (this.pending !== null && performance.now() - this.pending > 5000) this.feedback('Request not confirmed. Check your inventory before trying again.');
    if (changed) { this.revision = own.inventoryRevision; this.gold = own.gold; this.draw(); }
  }
  private bag(): InventoryItem[] {
    const own = this.own(); if (!own?.inventory) return [];
    return own.inventorySlots.slice(0, 42).flatMap((id) => {
      const item = own.inventory!.get(id);
      return item && !own.equipmentObjectIds.includes(id) ? [item] : [];
    });
  }
  selectSell(id: number): void {
    const item = this.bag().find(item => item.objectId === id);
    if (!this.check()) return;
    this.selection = null;
    if (!item) { this.feedback('Choose an unequipped bag item to sell.'); return; }
    this.select(item, 'sell');
  }
  private select(item: InventoryItem, kind: 'buy' | 'sell'): void {
    const prop = this.data.itemProps.get(item.itemId);
    this.selection = { kind, tab: this.tab, id: item.objectId, itemId: item.itemId }; this.quantity.value = '1';
    for (const cell of this.frame.body.querySelectorAll<HTMLElement>('[data-stock-id]')) cell.classList.toggle('is-selected', kind === 'buy' && Number(cell.dataset.stockId) === item.objectId);
    const price = prop?.cost;
    const displayPrice = this.frame.body.querySelector('output');
    if (displayPrice) displayPrice.textContent = String(price === undefined ? 0 : kind === 'buy' ? price : Math.max(1, Math.floor(price / 4)));
    this.setStatus('');
  }
  private setStatus(text: string): void { this.status.textContent = text; this.status.hidden = !text; }
  private hideDetails(): void { this.hoverDetails?.remove(); this.hoverDetails = undefined; }
  private showDetails(item: InventoryItem, anchor: HTMLElement): void {
    if (!this.frame.isOpen || this.doc.defaultView?.matchMedia?.('(pointer: coarse)').matches) return;
    this.hideDetails();
    // the tooltip as APP_SHOP_ asks for it: with the buy price
    const details = createItemDetails(this.doc, this.art, this.data, item, this.data.itemProps.get(item.itemId),
      ownTooltipContext(this.own(), item, 'shop'));
    details.classList.add('shop-item-details');
    (this.frame.element.parentElement ?? this.doc.body).append(details);
    positionItemDetails(details, anchor, this.doc); this.hoverDetails = details;
  }
  private draw(): void {
    this.hideDetails();
    const body = this.frame.body; body.replaceChildren();
    const heading = this.doc.createElement('div'); heading.className = 'shop-heading'; heading.textContent = 'Item List';
    heading.title = this.name;
    const tabs = this.doc.createElement('div'); tabs.className = 'shop-tabs';
    const strip = this.doc.createElement('div'); strip.className = 'shop-tab-strip'; strip.setAttribute('aria-hidden', 'true');
    tabs.append(strip);
    for (let i = 0; i < 4; i++) {
      const button = this.doc.createElement('button'); button.type = 'button'; button.textContent = this.metadata?.vendorTabs?.[i] ?? ''; button.setAttribute('aria-label', button.textContent || 'Stock tab ' + (i + 1));
      button.disabled = !button.textContent.trim() && (this.tabs?.[i]?.length ?? 0) === 0;
      button.ariaPressed = String(this.tab === i); button.addEventListener('click', () => { this.tab = i; this.selection = null; this.draw(); }); tabs.append(button);
    }
    const list = this.doc.createElement('div'); list.className = 'shop-items shop-stock-grid'; list.setAttribute('aria-label', 'Vendor items');
    for (const item of this.tabs?.[this.tab] ?? []) {
      const prop = this.data.itemProps.get(item.itemId), button = this.doc.createElement('button'); button.type = 'button';
      button.dataset.stockId = String(item.objectId); button.dataset.silent = ''; button.disabled = !prop || item.count <= 0;
      const name = prop?.name ?? 'Unknown item'; button.setAttribute('aria-label', name + ' ×' + item.count); button.title = name + (prop?.cost === undefined ? '' : ' · Base price: ' + prop.cost + ' penya');
      if (prop?.icon) { const icon = this.doc.createElement('img'); icon.src = this.art.url(prop.icon); icon.alt = ''; button.append(icon); }
      else button.textContent = '?';
      button.removeAttribute('title');
      button.addEventListener('mouseenter', () => this.showDetails(item, button));
      button.addEventListener('mouseleave', () => this.hideDetails());
      button.addEventListener('focus', () => this.showDetails(item, button));
      button.addEventListener('blur', () => this.hideDetails());
      button.addEventListener('click', () => this.select(item, 'buy')); list.append(button);
    }
    const price = this.doc.createElement('label'); price.className = 'shop-price'; price.append('Item Price');
    const output = this.doc.createElement('output');
    const selectedCost = this.selection ? this.data.itemProps.get(this.selection.itemId)?.cost : undefined;
    output.textContent = String(selectedCost === undefined ? 0 : this.selection?.kind === 'sell' ? Math.max(1, Math.floor(selectedCost / 4)) : selectedCost); output.classList.add('classic-shop-edit'); output.style.backgroundImage = this.quantity.style.backgroundImage; output.setAttribute('aria-label', 'Base item price'); price.append(output);
    const controls = this.doc.createElement('div'); controls.className = 'shop-controls'; controls.append(this.quantity);
    for (const kind of ['buy', 'sell'] as const) {
      const button = this.doc.createElement('button'); button.type = 'button'; button.textContent = kind === 'buy' ? 'Buy' : 'Sell'; button.dataset.shopAction = kind;
      button.addEventListener('click', () => this.transact(kind)); controls.append(button);
    }
    body.append(heading, list, tabs, price, this.status, controls);
    this.drawTabStrip(strip, tabs.clientWidth);
  }

  /**
   * The tab strip as `CWndTabCtrl` lays it (tiles.ts): one strip of 8 px tiles under the four tabs (`tabStripTiles`), the
   * chosen tab's tiles over it (`chosenTabTiles`: its slope 13 with 14 on the next tab), so the tabs join with smooth
   * edges (the owner's fix of 2026-11-05: each tab drawn alone cut the slope off). The shop is wider than Neuz's, so each
   * tab is as many whole tiles as fit (7 when nothing is measured) and the strip is stretched to the row's width.
   */
  private drawTabStrip(strip: HTMLElement, width: number): void {
    const size = width > 0 ? Math.max(4, Math.floor(width / TAB_TILE / SHOP_TABS)) : 7;
    const columns = size * SHOP_TABS;
    const span = columns * TAB_TILE;
    const percent = (px: number): string => `${Math.round((px / span) * 10000) / 100}%`;
    const tile = (index: number, left: number, tileWidth: number): HTMLElement => {
      const element = this.doc.createElement('div');
      element.dataset.tile = String(index);
      element.style.left = percent(left);
      element.style.width = percent(tileWidth);
      element.style.backgroundImage = themeUrl(this.art, `WndTabTile${String(index).padStart(2, '0')}.bmp`);
      return element;
    };
    strip.replaceChildren(
      ...tabStripTiles(columns, SHOP_TABS).map((index, i) => tile(index, i * TAB_TILE, TAB_TILE)),
      ...chosenTabTiles(columns, SHOP_TABS, this.tab).map(({ index, left, width: w }) => tile(index, left, w)),
    );
  }
  private transact(kind: 'buy' | 'sell'): void {
    if (!this.check()) return;
    const own = this.own(), selection = this.selection, count = Number(this.quantity.value);
    if (!own?.inventory || !selection || selection.kind !== kind) { this.feedback(`Select an item to ${kind}.`); return; }
    if (this.pending !== null) { this.setStatus('Waiting for the previous request.'); return; }
    const item = kind === 'buy' ? this.tabs?.[selection.tab]?.find((item) => item.objectId === selection.id) : this.bag().find((item) => item.objectId === selection.id);
    const prop = item && this.data.itemProps.get(item.itemId);
    if (!item || item.itemId !== selection.itemId || !prop) { this.feedback('This item is no longer available. Select it again.'); return; }
    const max = Math.min(32767, item.count, kind === 'buy' ? Math.max(1, prop.packMax) : item.count);
    if (!Number.isInteger(count) || count < 1 || count > max) { this.feedback(`Choose a quantity from 1 to ${max}.`); return; }
    if (kind === 'buy') {
      if (own.gold <= 0) { this.feedback('Not enough penya.'); return; }
      const pack = Math.max(1, prop.packMax), bag = this.bag();
      const free = own.inventorySlots.slice(0, 42).filter((id) => !own.inventory!.has(id)).length * pack;
      const room = bag.filter((entry) => entry.itemId === item.itemId).reduce((total, entry) => total + Math.max(0, pack - entry.count), free);
      if (room < count) { this.feedback('Your inventory is full.'); return; }
    }
    try {
      if (kind === 'buy') this.actions.buy(selection.tab, item.objectId, count, item.itemId);
      else this.actions.sell(item.objectId, count);
      this.pending = performance.now(); this.setStatus('');
    } catch (error) { this.feedback(error instanceof Error ? error.message : 'Shop request failed.'); }
  }
  dispose(): void { this.hideDetails(); this.frame.close(); this.frame.element.remove(); }
}
