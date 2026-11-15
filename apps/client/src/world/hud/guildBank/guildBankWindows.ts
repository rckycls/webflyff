// The guild bank's windows (2026-11-15, side-session-notes housing-research/research-note.md §1, A-client.md §1.2), each laid
// out from its resdata.inc entry by `ResWindow` (resData.txt.txt's English):
//
//   CWndGuildBank      APP_GUILD_BANK 336      resdata.inc:7058-7132    "WndGuildBank.tga" (one picture, 208 x 352; resdata says
//                                                                       236 x 348, but RenderWnd draws the picture at its own
//                                                                       size, so the window here is the picture's: see GUILD_BANK),
//                                                                       "Guild Safebox": a tab control of one "Item" tab holding
//                                                                       an item grid (6 x 7 cells of 32 px, the 42 slots), the coin
//                                                                       to drag the penya (CWndGold), the penya in money style,
//                                                                       Contribute Guild, Create Cloak, the log button
//                                                                       (_Interface/WndGuildBank.cpp:76-172)
//   CWndGuildMerit     APP_GUILD_MERIT1 579    resdata.inc:3038-3112    272 x 224, "Guild Contributing Window": Quest Items (a
//                                                                       check), the gems of the bag (6 a row at 32 px, from 13, 7;
//                                                                       WndGuildMerit.cpp:243-297), Penya, YES, NO
//   CWndGuildBankLog   APP_GUILD_BANK_LOG 682  resdata.inc:13304-13325  496 x 304, "Guild Bank Log Window": four tabs of lines 20
//                                                                       px apart in black from (4, 3), OK (WndGuildBank.cpp:411-541)
//
// The windows draw and report presses and drops; guildBank/guildBankHud.ts holds the rules and sends the packets. On a landscape
// phone the Guild Safebox is a panel beside the bag (style.css), taps replace drags and its buttons are words.

import type { InventoryItem } from '@flyffweb/protocol';
import { MAX_GUILDBANK } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { UiArt } from '../art';
import { place } from '../button';
import { ResWindow, textScrollBar } from '../resWindow';
import type { ResControl, ResLayout } from '../resWindow';
import { tabStrip } from '../tiles';
import { isPhone } from '../numpad';
import { padField } from '../amountBox';
import { sixFrameButton } from '../radio';
import type { RadioButton } from '../radio';
import { BAG_DRAG } from '../trade/tradeWindows';
import { itemIconOf } from '../../pets/petStatus';
import { withCommas } from '../../vendor/vendorRules';

const EDIT = 'WndEditTile00.tga';
const button = (id: string, rect: ResControl['rect'], picture: string, label: string, quarter = 72): ResControl =>
  ({ kind: 'button', id, rect, picture, label, quarter });

/** The drag of a guild bank item (its object id) and of the guild's penya (the coin, `CWndGold`). */
export const GUILD_BANK_DRAG = 'application/x-flyff-guild-bank';
export const GUILD_BANK_PENYA_DRAG = 'application/x-flyff-guild-bank-penya';

/**
 * APP_GUILD_BANK (resdata.inc:7058-7132). WIDC_BUTTON3, the dragon cloak, is hidden on V8 and later (:151-157). The window is
 * the picture's 208 x 352 (resdata's 236 x 348 would leave the close box, the tab's strip and its scroll bar off the
 * picture); the log button 16 px left of resdata's 196 to stay on it (2026-11-15 ruling).
 */
export const GUILD_BANK: ResLayout = {
  title: 'Guild Safebox', width: 208, height: 352, texture: 'WndGuildBank.tga',
  controls: [
    { kind: 'custom', id: 'WIDC_TABCTRL1', rect: [8, 8, 224, 254] },
    { kind: 'custom', id: 'WIDC_CUSTOM1', rect: [24, 258, 46, 280] },
    { kind: 'static', id: 'WIDC_GUILDBANK_NUM', rect: [58, 260, 158, 278], text: '0' },
    button('WIDC_BUTTON1', [18, 288, 90, 308], 'ButtSuppot.BMP', 'Contribute Guild'),
    button('WIDC_BUTTON2', [100, 288, 172, 308], 'ButtCloak.BMP', 'Create Cloak'),
    button('WIDC_LOG', [180, 258, 204, 282], 'ButtRecord.tga', 'Guild Bank Log', 24),
  ],
};

/** APP_GUILD_MERIT1 (resdata.inc:3038-3112); the Quest Items check (WIDC_CHECK2, 92,10) is built beside the entry. */
export const GUILD_MERIT: ResLayout = {
  title: 'Guild Contributing Window', width: 272, height: 224,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC3', rect: [8, 8, 108, 28], text: 'Quest Items' },
    { kind: 'custom', id: 'WIDC_LISTBOX1', rect: [10, 28, 252, 134], tile: EDIT },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [8, 139, 74, 157], text: 'Penya' },
    { kind: 'edit', id: 'WIDC_EDIT1', rect: [70, 140, 222, 158], tile: EDIT, maxLength: 10 },
    button('WIDC_BUTTON1', [50, 166, 122, 186], 'ButtYes.tga', 'YES'),
    button('WIDC_BUTTON2', [138, 166, 210, 186], 'ButtNo.tga', 'NO'),
  ],
};

/** APP_GUILD_BANK_LOG (resdata.inc:13304-13325). */
export const GUILD_BANK_LOG: ResLayout = {
  title: 'Guild Bank Log Window', width: 496, height: 304,
  controls: [
    { kind: 'custom', id: 'WIDC_TABCTRL1', rect: [8, 8, 478, 238] },
    button('WIDC_OK', [202, 242, 274, 262], 'ButOk2.bmp', 'OK'),
  ],
};

/** The phone's words of the buttons (`data-word`, the guild windows' style). */
const PHONE_WORDS: Readonly<Record<string, string>> = {
  'Contribute Guild': 'Contribute', 'Create Cloak': 'Cloak', 'Guild Bank Log': 'Log', YES: 'Yes', NO: 'No', OK: 'OK',
};

function phoneWords(window: ResWindow): void {
  for (const control of window.layout.controls) {
    if (control.kind === 'button') window.button(control.id).dataset.word = PHONE_WORDS[control.label] ?? control.label;
  }
}

/**
 * The item grid in its tab control: 4 px in, 6 x 7 cells of 32 px (all 42 slots, so no scroll bar), the tab's strip under them
 * as wide as the cells (the picture's panel).
 */
const CELL = 32;
const COLUMNS = 6;
const ROWS = 7;
const GRID_LEFT = 4;
/** The tab control's page: its 246 px less the 20 px strip of tabs. */
const PAGE_HEIGHT = 226;
const TAB_WIDTH = GRID_LEFT + COLUMNS * CELL;

/** What the Guild Safebox shows. */
export interface GuildBankView {
  /** The filled items, packed in position order (`GuildBankBook.packed`). */
  items: InventoryItem[];
  /** The guild's penya (`m_nGoldGuild`). */
  gold: number;
  /** Create Cloak is for the master only (`OnInitialUpdate`, :121-128). */
  master: boolean;
  prop(itemId: number): WebItemProp | undefined;
}

/** One item cell, as the bank's grid draws one: the icon, the expired tint, a stack's count at the bottom right. */
function itemCell(doc: Document, art: UiArt, item: InventoryItem | undefined, prop: (itemId: number) => WebItemProp | undefined): HTMLElement {
  const cell = doc.createElement('div');
  cell.className = 'hud-bank-cell';
  cell.setAttribute('role', 'listitem');
  if (item === undefined) return cell;
  const itemProp = prop(item.itemId);
  cell.dataset.objectId = String(item.objectId);
  cell.dataset.itemId = String(item.itemId);
  cell.setAttribute('aria-label', `${itemProp?.name ?? `Item ${item.itemId}`} ×${item.count}`);
  const icon = itemIconOf(item, itemProp);
  if (icon !== null) {
    const img = doc.createElement('img');
    img.src = art.url(icon);
    img.alt = '';
    cell.append(img);
    if (((item.flag ?? 0) & 0x01) !== 0) {
      const tint = doc.createElement('i');
      tint.className = 'hud-trade-expired';
      const url = `url(${JSON.stringify(art.url(icon))})`;
      tint.style.setProperty('-webkit-mask-image', url);
      tint.style.setProperty('mask-image', url);
      cell.append(tint);
    }
  }
  if ((itemProp?.packMax ?? 1) > 1) {
    const count = doc.createElement('span');
    count.textContent = String(item.count);
    cell.append(count);
  }
  return cell;
}

/** CWndGuildBank with its CWndItemCtrl. */
export class GuildBankWindow {
  readonly window: ResWindow;
  /** A bag item dropped on the grid (`OnChildNotify`'s WIN_ITEMDROP from APP_INVENTORY, WndGuildBank.cpp:225-277). */
  onDrop: (objectId: number) => void = () => {};
  /** The phone's tap on a bank item (take it out) and on the penya. */
  onTapItem: (objectId: number) => void = () => {};
  onTapPenya: () => void = () => {};
  /** A slot hovered (or tapped on the desktop): its tooltip, null to hide it. */
  onHover: (objectId: number | null, anchor: HTMLElement | null) => void = () => {};
  onContribute: () => void = () => {};
  onCloak: () => void = () => {};
  onLog: () => void = () => {};
  readonly phone: boolean;
  private readonly grid: HTMLElement;

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    // 2026-11-15 (consistency scan): a phone's panel has Neuz's tiled frame, as the bank's (WndGuildBank.tga's 208 px picture
    // cannot frame the narrow panel beside the bag)
    const window = new ResWindow(isPhone(doc) ? { ...GUILD_BANK, texture: undefined } : GUILD_BANK, art, doc);
    window.frame.element.classList.add('hud-guild-bank');
    phoneWords(window);
    this.phone = isPhone(doc);
    const area = window.control('WIDC_TABCTRL1');
    area.classList.add('hud-guild-bank-tab');
    const grid = doc.createElement('div');
    grid.className = 'hud-bank-grid hud-guild-bank-grid';
    grid.setAttribute('role', 'list');
    grid.setAttribute('aria-label', 'Guild bank');
    place(grid, { left: GRID_LEFT, top: 0, width: COLUMNS * CELL, height: ROWS * CELL });
    const strip = tabStrip(doc, art, TAB_WIDTH, ['Item'], 0);
    place(strip, { left: 0, top: PAGE_HEIGHT, width: TAB_WIDTH, height: 20 });
    area.append(grid, strip);
    this.grid = grid;
    // a bag item only: penya cannot go in (`m_dwData` 0 is not handled, :225-229; Contribute Guild takes it)
    area.addEventListener('dragover', (event) => {
      if ((event.dataTransfer?.types ?? []).includes(BAG_DRAG)) event.preventDefault();
    });
    area.addEventListener('drop', (event) => {
      const data = event.dataTransfer;
      if (data === null || !data.types.includes(BAG_DRAG)) return;
      event.preventDefault();
      this.onDrop(Number(data.getData(BAG_DRAG)));
    });

    const gold = window.control('WIDC_GUILDBANK_NUM').parentElement!;
    gold.classList.add('hud-guild-bank-gold');
    gold.addEventListener('click', () => { if (this.phone) this.onTapPenya(); });
    const coin = window.control('WIDC_CUSTOM1');
    coin.classList.add('hud-bank-coin', 'hud-guild-bank-coin');
    coin.dataset.usable = 'true';
    coin.setAttribute('aria-label', 'Guild penya');
    coin.draggable = !this.phone;
    coin.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData(GUILD_BANK_PENYA_DRAG, 'gold');
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    coin.addEventListener('click', () => { if (this.phone) this.onTapPenya(); });

    window.button('WIDC_BUTTON1').addEventListener('click', () => this.onContribute());
    window.button('WIDC_BUTTON2').addEventListener('click', () => this.onCloak());
    window.button('WIDC_LOG').addEventListener('click', () => this.onLog());
    this.window = window;
  }

  get frame(): ResWindow['frame'] {
    return this.window.frame;
  }

  /** `OnDraw` and the item control's: the items packed, the penya with commas (WSS_MONEY), the cloak button's state. */
  draw(view: GuildBankView): void {
    this.window.setText('WIDC_GUILDBANK_NUM', withCommas(view.gold));
    this.window.button('WIDC_BUTTON2').disabled = !view.master;
    const top = this.grid.scrollTop;
    const cells = Array.from({ length: MAX_GUILDBANK }, (_, i) => {
      const item = view.items[i];
      const cell = itemCell(this.doc, this.art, item, view.prop);
      if (item === undefined) return cell;
      cell.draggable = !this.phone;
      cell.addEventListener('dragstart', (event) => {
        this.onHover(null, null);
        event.dataTransfer?.setData(GUILD_BANK_DRAG, String(item.objectId));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      });
      cell.addEventListener('mouseenter', () => { if (!this.phone) this.onHover(item.objectId, cell); });
      cell.addEventListener('mouseleave', () => this.onHover(null, null));
      cell.addEventListener('click', () => {
        if (this.phone) this.onTapItem(item.objectId);
        else this.onHover(item.objectId, cell);
      });
      return cell;
    });
    this.grid.replaceChildren(...cells);
    this.grid.scrollTop = top;
  }
}

/** CWndGuildMerit: the gems (Quest Items) and the penya given to the guild. */
export class GuildMeritWindow {
  readonly window: ResWindow;
  /** YES or Enter: the typed penya and whether Quest Items is checked. */
  onOk: (penya: string, items: boolean) => void = () => {};
  /** Quest Items checked or cleared: the window asks for the bag's gems (`m_wndctrlMerit.AddItem`). */
  onCheck: (on: boolean) => void = () => {};
  /** A gem pointed at or pressed: its tooltip at `anchor`, null to hide it. */
  onHover: (item: InventoryItem | null, anchor: HTMLElement | null) => void = () => {};
  /** The most penya the phone's number pad takes: the own penya. */
  penyaMax: () => number = () => 0;
  private readonly input: HTMLInputElement;
  private readonly check: RadioButton;
  private readonly list: HTMLElement;

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    const window = new ResWindow(GUILD_MERIT, art, doc);
    window.frame.element.classList.add('hud-guild-dialog', 'hud-guild-merit');
    phoneWords(window);
    const check = sixFrameButton(doc, art, 'ButtCheck.bmp', 14, { left: 92, top: 10, width: 18, height: 16 },
      { role: 'checkbox', name: 'Quest Items' }, () => {
        check.checked = !check.checked;
        this.onCheck(check.checked);
      });
    check.element.dataset.control = 'WIDC_CHECK2';
    window.frame.body.append(check.element);
    const list = doc.createElement('div');
    list.className = 'hud-guild-merit-items';
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', 'Quest items');
    window.control('WIDC_LISTBOX1').append(list);
    const input = window.input('WIDC_EDIT1');
    input.inputMode = 'numeric';
    input.enterKeyHint = 'done';
    input.setAttribute('aria-label', 'Penya');
    // 2026-11-16 (owner): the phone's number pad, as the bank's and the mail's amounts (`padField`)
    padField(input, art, doc, () => ({ max: this.penyaMax() }));
    // EN_RETURN is YES (:166-169)
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); this.onOk(input.value, check.checked); }
    });
    window.button('WIDC_BUTTON1').addEventListener('click', () => this.onOk(input.value, check.checked));
    window.button('WIDC_BUTTON2').addEventListener('click', () => window.close());
    this.input = input;
    this.check = check;
    this.list = list;
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** `OnInitialUpdate` (:54-75): "0" in the field, focused; nothing checked, no gem listed. */
  open(): void {
    this.input.value = '0';
    this.check.checked = false;
    this.list.replaceChildren();
    this.window.open();
    this.input.focus();
    this.input.select();
  }

  close(): void {
    this.window.close();
  }

  /** The gems listed with Quest Items checked (`AddItem`), each with its count when it stacks. */
  showItems(items: readonly InventoryItem[], prop: (itemId: number) => WebItemProp | undefined): void {
    this.onHover(null, null);
    this.list.replaceChildren(...items.map((item) => {
      const cell = itemCell(this.doc, this.art, item, prop);
      // 2026-11-15 (consistency scan): a gem's item tooltip (`PutToolTip_Item`, WndGuildMerit.cpp:275-283), as the Guild
      // Safebox's cells show theirs: on the pointer, or on a press (a phone's tap)
      cell.addEventListener('mouseenter', () => this.onHover(item, cell));
      cell.addEventListener('mouseleave', () => this.onHover(null, null));
      cell.addEventListener('click', () => this.onHover(item, cell));
      return cell;
    }));
  }
}

/** The log's tabs (`TID_GAME_GUILD_BANK_*LOG`), in the order of `GuildLogType` 1-4. */
export const LOG_TABS = ['Add Item', 'Remove Item', 'Deposit Penya', 'Withdraw Penya'] as const;
/** The tab control's page (its 230 px less the strip), and a list's height: the page less 15 (`rect.bottom -= 15`, :421). */
const LOG_PAGE = 212;
const LOG_LIST = LOG_PAGE - 15;
const LOG_WIDTH = 470;

/** CWndGuildBankLog: four tabs of log lines, OK to close. */
export class GuildBankLogWindow {
  readonly window: ResWindow;
  /** A tab chosen (also the first, on opening): its list type, 1-4 (`UpdateLogList`, :495-525). */
  onTab: (logType: number) => void = () => {};
  private readonly lines: HTMLElement;
  private readonly scroll: { draw(): void };
  private strip: HTMLElement;
  private titles: readonly string[] = LOG_TABS;
  private chosen = 0;

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    const window = new ResWindow(GUILD_BANK_LOG, art, doc);
    window.frame.element.classList.add('hud-guild-dialog', 'hud-guild-bank-log');
    phoneWords(window);
    const area = window.control('WIDC_TABCTRL1');
    const lines = doc.createElement('div');
    lines.className = 'hud-guild-bank-log-lines';
    lines.setAttribute('role', 'list');
    place(lines, { left: 0, top: 0, width: LOG_WIDTH - 16, height: LOG_LIST });
    const scroll = textScrollBar(doc, art, lines, { left: 0, top: 0, width: LOG_WIDTH, height: LOG_LIST });
    this.strip = doc.createElement('div');
    area.append(lines, scroll.element, this.strip);
    window.button('WIDC_OK').addEventListener('click', () => window.close());
    this.lines = lines;
    this.scroll = scroll;
    this.window = window;
    this.drawStrip();
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** The tabs' titles from the game's texts. */
  setTitles(titles: readonly string[]): void {
    this.titles = titles;
    this.drawStrip();
  }

  private drawStrip(): void {
    const strip = tabStrip(this.doc, this.art, LOG_WIDTH, this.titles, this.chosen, (tab) => this.choose(tab));
    place(strip, { left: 0, top: LOG_PAGE, width: LOG_WIDTH, height: 20 });
    this.strip.replaceWith(strip);
    this.strip = strip;
  }

  /** The shown list type (1-4). */
  get logType(): number {
    return this.chosen + 1;
  }

  /** Opens on Add Item at `at` (beside the Guild Safebox), and asks for its list. */
  open(at: { x: number; y: number } | 'center'): void {
    this.chosen = 0;
    this.drawStrip();
    this.lines.replaceChildren();
    this.window.open(at);
    this.onTab(1);
  }

  close(): void {
    this.window.close();
  }

  private choose(tab: number): void {
    if (tab === this.chosen) return;
    this.chosen = tab;
    this.drawStrip();
    this.lines.replaceChildren();
    this.scroll.draw();
    this.onTab(tab + 1);
  }

  /** GUILDLOG_VIEW for the shown list: its lines, the scroll at the top (`UpdateScroll`). */
  showLines(logType: number, lines: readonly string[]): void {
    if (logType !== this.logType) return;
    this.lines.replaceChildren(...lines.map((text) => {
      const line = this.doc.createElement('div');
      line.className = 'hud-guild-bank-log-line';
      line.setAttribute('role', 'listitem');
      line.textContent = text;
      return line;
    }));
    this.lines.scrollTop = 0;
    this.scroll.draw();
  }
}
