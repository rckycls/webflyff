// The Backpack window (2026-11-17, docs/2026-11-17-extra-bag-research.md §3), laid out from its resdata.inc entry by
// `ResWindow`:
//
//   CWndBagEx   APP_BAG_EX 689   resdata.inc:13938-14037   "InventoryBag.tga" (one picture), 236 x 496, "Backpack": three tab
//                                                           controls of one "Item" tab (pocket 0 WIDC_BASIC, pockets 1 and 2
//                                                           WIDC_EXBAG1/2), each an item grid of 32 px cells, 6 across, by
//                                                           position, with a scroll bar; the two bag icons WIDC_ICO_BAG1/2
//   CWndBagEx::OnDraw           _Interface/WndBagEx.cpp:62-140   a pocket in use: Itm_SysSysScrBagBag01.bmp on its icon at alpha
//                                                           200; not: InventoryBagEff.tga over its grid at alpha 150 (from
//                                                           WIDC_CUSTOM4/5's top left) and Itm_SysSysScrBagBag02.bmp at 200
//   CWndItemCtrl (APP_BAG_EX)   _Interface/WndItemCtrl.cpp:188-210, 455-520   the items by position, the bag's tooltip
//
// The window draws and reports presses and drops; pocket/pocketHud.ts holds the rules and sends the packets. On a landscape
// phone it is a compact panel beside the phone's bag (style.css) showing one pocket at a time, chosen by its tabs; taps
// replace drags, and a pocket's bag icon has its line (the time left, or "Place the Extra Bag icon here.") under its tabs.

import type { InventoryItem } from '@flyffweb/protocol';
import { POCKET_COUNT, POCKET_SLOTS } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { UiArt } from '../art';
import { themeUrl } from '../art';
import { place } from '../button';
import { ResWindow, textScrollBar } from '../resWindow';
import type { ResLayout } from '../resWindow';
import { tabStrip } from '../tiles';
import { isPhone } from '../numpad';
import { BAG_DRAG } from '../trade/tradeWindows';
import { itemIconOf } from '../../pets/petStatus';

/** The drag of a pocket's item: `"<pocket>:<object id>"`. */
export const POCKET_DRAG = 'application/x-flyff-pocket';

/** The tab controls of pockets 0, 1, 2 and the icons of pockets 1, 2. */
const GRIDS = ['WIDC_BASIC', 'WIDC_EXBAG1', 'WIDC_EXBAG2'] as const;
const ICONS = ['WIDC_ICO_BAG1', 'WIDC_ICO_BAG2'] as const;

/** APP_BAG_EX (resdata.inc:13938-14037). WIDC_TABCTRL2/3 and WIDC_CUSTOM3 lie off the window or are not drawn. */
export const BAG_EX: ResLayout = {
  title: 'Backpack', width: 236, height: 496, texture: 'InventoryBag.tga',
  controls: [
    { kind: 'custom', id: 'WIDC_BASIC', rect: [10, 10, 230, 66] },
    { kind: 'custom', id: 'WIDC_EXBAG1', rect: [10, 138, 230, 284] },
    { kind: 'custom', id: 'WIDC_EXBAG2', rect: [10, 312, 230, 458] },
    { kind: 'custom', id: 'WIDC_ICO_BAG1', rect: [46, 72, 86, 110] },
    { kind: 'custom', id: 'WIDC_ICO_BAG2', rect: [132, 72, 174, 110] },
    { kind: 'custom', id: 'WIDC_CUSTOM4', rect: [9, 134, 99, 225] },
    { kind: 'custom', id: 'WIDC_CUSTOM5', rect: [9, 306, 99, 397] },
  ],
};

/** The grid inside its tab control: 4 px in, 6 columns of 32 px; the scroll bar 3 px in from the right; the tab strip under. */
const CELL = 32;
const COLUMNS = 6;
const GRID_LEFT = 4;
const TAB_STRIP = 20;
/** The item control's client area: the tab control less its 18 px (the bank's 180 to 162). */
const PAGE_LESS = 18;
const SCROLL_RIGHT = 3;
/** InventoryBagEff.tga's size (201 x 134), drawn at its own size; the alphas of `OnDraw`. */
const COVER = { width: 201, height: 134 };
const COVER_ALPHA = 150 / 255;
const ICON_ALPHA = 200 / 255;
/** The phone's tab words: the picture's "Bag.1" and "Bag.2"; pocket 0 has none of its own. */
export const PHONE_TABS = ['Basic', 'Bag 1', 'Bag 2'] as const;

/** What the window shows. */
export interface BagExView {
  /** Each pocket's cells by position (`PocketBook.cells`), [] for one that is not there. */
  cells: Array<Array<InventoryItem | null>>;
  /** `IsAvailable` of each pocket (in use). */
  usable: boolean[];
  /** The bag icons' lines (pockets 1 and 2): the time left, or the "place the icon" line. */
  iconText: string[];
  prop(itemId: number): WebItemProp | undefined;
}

/** What a drop on a pocket's grid carries. */
export type PocketDrop = { kind: 'bagItem'; objectId: number } | { kind: 'pocketItem'; from: number; objectId: number };

/** CWndBagEx with its three CWndItemCtrl. */
export class BagExWindow {
  readonly window: ResWindow;
  /** A drop on pocket `pocket`'s grid (`OnChildNotify`'s WIN_ITEMDROP). */
  onDrop: (pocket: number, what: PocketDrop) => void = () => {};
  /** A bag item dropped on the icon of pocket 1 or 2 (`OnDropIcon`). */
  onDropIcon: (pocket: number, objectId: number) => void = () => {};
  /** The phone's tap on a pocket's item: out to the bag. */
  onTapItem: (pocket: number, objectId: number) => void = () => {};
  /** A slot hovered (or clicked on the desktop): its tooltip, null to hide it. */
  onHover: (pocket: number, objectId: number | null, anchor: HTMLElement | null) => void = () => {};
  /** A bag icon hovered (`OnMouseWndSurface`): its tooltip, null to hide it. */
  onIconHover: (pocket: number | null, anchor: HTMLElement | null) => void = () => {};
  readonly phone: boolean;
  private readonly grids: HTMLElement[] = [];
  private readonly scrolls: Array<{ draw(): void }> = [];
  private readonly covers: HTMLElement[] = [];
  private readonly icons: HTMLElement[] = [];
  private readonly phoneTabs: HTMLElement;
  private readonly phoneLine: HTMLElement;
  private shown = 0;
  private usable: boolean[] = [true, false, false];
  private iconText: string[] = ['', ''];

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    // the phone's panel has Neuz's tiled frame (the 236 px picture of three pockets does not fit one pocket's panel)
    const phone = isPhone(doc);
    const window = new ResWindow(phone ? { ...BAG_EX, texture: undefined } : BAG_EX, art, doc);
    window.frame.element.classList.add('hud-bagex');
    // 2026-11-16 (owner): above the phone's open bag
    window.frame.overBag = true;
    this.phone = phone;
    for (let pocket = 0; pocket < POCKET_COUNT; pocket++) {
      const area = window.control(GRIDS[pocket]!);
      const [left, top, right, bottom] = BAG_EX.controls[pocket]!.rect;
      const width = right - left, height = bottom - top;
      const rows = Math.trunc((height - PAGE_LESS) / CELL);
      area.classList.add('hud-bagex-tab');
      area.dataset.pocket = String(pocket);
      const grid = doc.createElement('div');
      grid.className = 'hud-bagex-grid';
      grid.dataset.pocket = String(pocket);
      grid.setAttribute('role', 'list');
      grid.setAttribute('aria-label', pocket === 0 ? 'Backpack' : `Extra Bag ${pocket}`);
      place(grid, { left: GRID_LEFT, top: 0, width: COLUMNS * CELL, height: rows * CELL });
      const scroll = textScrollBar(doc, art, grid, { left: 0, top: 0, width: width - SCROLL_RIGHT, height: height - PAGE_LESS });
      scroll.element.classList.add('hud-bagex-scroll');
      const strip = tabStrip(doc, art, width, ['Item'], 0);
      place(strip, { left: 0, top: height - TAB_STRIP, width, height: TAB_STRIP });
      area.append(grid, scroll.element, strip);
      this.grids.push(grid);
      this.scrolls.push(scroll);
      this.acceptDrops(area, pocket);
    }
    for (const [i, id] of ICONS.entries()) {
      const pocket = i + 1;
      const icon = window.control(id);
      icon.classList.add('hud-bagex-icon');
      icon.dataset.pocket = String(pocket);
      icon.setAttribute('role', 'img');
      const picture = doc.createElement('i');
      picture.style.opacity = String(ICON_ALPHA);
      icon.append(picture);
      icon.addEventListener('mouseenter', () => { if (!this.phone) this.onIconHover(pocket, icon); });
      icon.addEventListener('mouseleave', () => this.onIconHover(null, null));
      icon.addEventListener('dragover', (event) => { if (event.dataTransfer?.types.includes(BAG_DRAG)) event.preventDefault(); });
      icon.addEventListener('drop', (event) => {
        const data = event.dataTransfer;
        if (data === null || !data.types.includes(BAG_DRAG)) return;
        event.preventDefault();
        event.stopPropagation();
        this.onDropIcon(pocket, Number(data.getData(BAG_DRAG)));
      });
      this.icons.push(icon);
      // the cover, at its own size from WIDC_CUSTOM4/5's top left, over the grid it covers (it takes no press)
      const anchor = window.control(`WIDC_CUSTOM${3 + pocket}`);
      anchor.classList.add('hud-bagex-cover');
      const cover = doc.createElement('i');
      cover.style.backgroundImage = themeUrl(art, 'InventoryBagEff.tga');
      cover.style.width = `${COVER.width}px`;
      cover.style.height = `${COVER.height}px`;
      cover.style.opacity = String(COVER_ALPHA);
      anchor.append(cover);
      this.covers.push(anchor);
    }
    // the phone's choice of the pocket it shows, and the shown bag's line
    this.phoneTabs = doc.createElement('div');
    this.phoneTabs.className = 'hud-bagex-phone-tabs';
    this.phoneTabs.setAttribute('role', 'tablist');
    PHONE_TABS.forEach((label, pocket) => {
      const tab = doc.createElement('button');
      tab.type = 'button';
      tab.dataset.pocketTab = String(pocket);
      tab.setAttribute('role', 'tab');
      tab.textContent = label;
      tab.addEventListener('click', () => this.show(pocket));
      this.phoneTabs.append(tab);
    });
    this.phoneLine = doc.createElement('div');
    this.phoneLine.className = 'hud-bagex-phone-line';
    const lineIcon = doc.createElement('i');
    const lineText = doc.createElement('span');
    this.phoneLine.append(lineIcon, lineText);
    window.frame.body.prepend(this.phoneTabs, this.phoneLine);
    this.window = window;
    this.show(0);
  }

  get frame(): ResWindow['frame'] {
    return this.window.frame;
  }

  /** The phone's shown pocket. */
  get shownPocket(): number {
    return this.shown;
  }

  /** The phone shows pocket `pocket` (Basic when the window opens). */
  show(pocket: number): void {
    this.shown = pocket;
    this.window.frame.element.dataset.shownPocket = String(pocket);
    for (const tab of this.phoneTabs.children) {
      tab.setAttribute('aria-selected', String((tab as HTMLElement).dataset.pocketTab === String(pocket)));
    }
    this.drawPhoneLine();
  }

  /** A pocket's grid takes a bag item or another pocket's item; one not in use takes nothing. */
  private acceptDrops(area: HTMLElement, pocket: number): void {
    const types = [BAG_DRAG, POCKET_DRAG];
    area.addEventListener('dragover', (event) => {
      if (this.usable[pocket] !== true) return;
      if ((event.dataTransfer?.types ?? []).some((type) => types.includes(type))) event.preventDefault();
    });
    area.addEventListener('drop', (event) => {
      const data = event.dataTransfer;
      if (data === null || this.usable[pocket] !== true) return;
      if (data.types.includes(BAG_DRAG)) {
        event.preventDefault();
        this.onDrop(pocket, { kind: 'bagItem', objectId: Number(data.getData(BAG_DRAG)) });
      } else if (data.types.includes(POCKET_DRAG)) {
        event.preventDefault();
        const [from, objectId] = data.getData(POCKET_DRAG).split(':').map(Number);
        this.onDrop(pocket, { kind: 'pocketItem', from: from ?? -1, objectId: objectId ?? -1 });
      }
    });
  }

  /** `OnDraw` and its item controls: each pocket's items by position, its cover and its icon. */
  draw(view: BagExView): void {
    this.usable = [...view.usable];
    this.iconText = [...view.iconText];
    for (let pocket = 0; pocket < POCKET_COUNT; pocket++) {
      const usable = view.usable[pocket] === true;
      const grid = this.grids[pocket]!;
      grid.dataset.usable = String(usable);
      grid.closest<HTMLElement>('.hud-bagex-tab')!.dataset.usable = String(usable);
      this.fill(grid, pocket, view.cells[pocket] ?? [], usable, view.prop);
      this.scrolls[pocket]!.draw();
    }
    for (let i = 0; i < 2; i++) {
      const usable = view.usable[i + 1] === true;
      this.covers[i]!.hidden = usable;
      const icon = this.icons[i]!;
      icon.dataset.usable = String(usable);
      icon.setAttribute('aria-label', view.iconText[i] ?? '');
      (icon.firstElementChild as HTMLElement).style.backgroundImage =
        themeUrl(this.art, usable ? 'Itm_SysSysScrBagBag01.bmp' : 'Itm_SysSysScrBagBag02.bmp');
    }
    this.drawPhoneLine();
  }

  /** The phone's line under the tabs: the shown bag's icon and words; none for pocket 0. */
  private drawPhoneLine(): void {
    const pocket = this.shown;
    this.phoneLine.hidden = pocket === 0;
    if (pocket === 0) return;
    const usable = this.usable[pocket] === true;
    this.phoneLine.dataset.usable = String(usable);
    (this.phoneLine.firstElementChild as HTMLElement).style.backgroundImage =
      themeUrl(this.art, usable ? 'Itm_SysSysScrBagBag01.bmp' : 'Itm_SysSysScrBagBag02.bmp');
    (this.phoneLine.lastElementChild as HTMLElement).textContent = this.iconText[pocket - 1] ?? '';
  }

  private fill(grid: HTMLElement, pocket: number, cells: Array<InventoryItem | null>, usable: boolean, prop: BagExView['prop']): void {
    const top = grid.scrollTop;
    const size = POCKET_SLOTS[pocket] ?? 0;
    const elements = Array.from({ length: size }, (_, i) => {
      const cell = this.doc.createElement('div');
      cell.className = 'hud-bagex-cell';
      cell.setAttribute('role', 'listitem');
      const item = cells[i] ?? null;
      if (item === null) return cell;
      const itemProp = prop(item.itemId);
      cell.dataset.objectId = String(item.objectId);
      cell.dataset.itemId = String(item.itemId);
      cell.setAttribute('aria-label', `${itemProp?.name ?? `Item ${item.itemId}`} ×${item.count}`);
      const icon = itemIconOf(item, itemProp);
      if (icon !== null) {
        const img = this.doc.createElement('img');
        img.src = this.art.url(icon);
        img.alt = '';
        cell.append(img);
        // an expired item tinted ARGB( a, 255, 100, 100 ) (WndItemCtrl.cpp:345-361)
        if (((item.flag ?? 0) & 0x01) !== 0) {
          const tint = this.doc.createElement('i');
          tint.className = 'hud-trade-expired';
          const url = `url(${JSON.stringify(this.art.url(icon))})`;
          tint.style.setProperty('-webkit-mask-image', url);
          tint.style.setProperty('mask-image', url);
          cell.append(tint);
        }
      }
      // a stack's count at the bottom right (`dwPackMax > 1`)
      if ((itemProp?.packMax ?? 1) > 1) {
        const count = this.doc.createElement('span');
        count.textContent = String(item.count);
        cell.append(count);
      }
      cell.draggable = usable && !this.phone;
      cell.addEventListener('dragstart', (event) => {
        if (!usable) { event.preventDefault(); return; }
        this.onHover(pocket, null, null);
        event.dataTransfer?.setData(POCKET_DRAG, `${pocket}:${item.objectId}`);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      });
      cell.addEventListener('mouseenter', () => { if (!this.phone) this.onHover(pocket, item.objectId, cell); });
      cell.addEventListener('mouseleave', () => this.onHover(pocket, null, null));
      cell.addEventListener('click', () => {
        if (this.phone) { if (usable) this.onTapItem(pocket, item.objectId); }
        else this.onHover(pocket, item.objectId, cell);
      });
      return cell;
    });
    grid.replaceChildren(...elements);
    grid.scrollTop = top;
  }
}
