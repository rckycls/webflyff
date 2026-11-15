// The guild house's windows (2026-11-15, side-session-notes housing-research/A-client.md §2.4-2.5), each laid out from its
// resdata.inc entry by `ResWindow` (resData.txt.txt's English):
//
//   CWndGHMainMenu         APP_GH_MAIN 849               resdata.inc:4133-4197  288 x 112, "Guild House", no close button: "Time
//                                                                               Left:" and the upkeep's time, five 40 px buttons
//                                                                               (Set Permissions, Furniture Storage, Storage,
//                                                                               Teleporter, Fee Deposit; WndGuildHouse.cpp:59-222)
//   CWndGuildHousing       APP_GH_FURNITURE_STORAGE 853  resdata.inc:3971-4044  448 x 512: the kind combo (furniture only), the
//                                                                               headers Name / Time / I/R (a press sorts, LvUp / LvDn
//                                                                               beside the sorted one), rows of 40 px (icon, name,
//                                                                               time, the placed ones blue, the chosen one red), an
//                                                                               install / remove button on each, the chosen item's
//                                                                               words (WndHousing.cpp:553-1430)
//   CWndGHUpkeep           APP_CONFIRM_BUYEX 306         resdata.inc:3113-3204  272 x 176, "Maintenance Fee": Duration (days,
//                                                                               + / - / Max), Amount (money style), OK, Cancel
//                                                                               (WndGuildHouse.cpp:632-814)
//   CWndGHouseShowOneUnit  APP_GH_SHOWONE 872            resdata.inc:6584-6594  304 x 80, "Installed", no close button, at the
//                                                                               top in the middle while a piece is placed: its icon,
//                                                                               name and time, a red box blinking every 600 ms
//                                                                               (WndHousing.cpp:1436-1516)
//
// The windows draw and report presses; guildHouse/guildHouseHud.ts holds the rules and sends the packets.

import type { UiArt } from '../art';
import { place } from '../button';
import { ResWindow } from '../resWindow';
import type { ResControl, ResLayout } from '../resWindow';
import type { StorageSort } from '../../guildHouse/guildHouseBook';

const EDIT = 'WndEditTile00.tga';
const button = (id: string, rect: ResControl['rect'], picture: string, label: string, quarter = 72): ResControl =>
  ({ kind: 'button', id, rect, picture, label, quarter });

/** APP_GH_MAIN (resdata.inc:4133-4197). */
export const GH_MAIN: ResLayout = {
  title: 'Guild House', width: 288, height: 112, frame: { closeButton: false },
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [8, 8, 124, 24], text: 'Time Left:' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [118, 8, 262, 24], text: '' },
    button('WIDC_BTN_SETUPPOWER', [8, 32, 48, 72], 'ButtGuildhouseauthority.bmp', 'Set Permissions', 40),
    button('WIDC_BTN_FURNITURE', [62, 32, 102, 72], 'ButtGuildhousecargo.bmp', 'Furniture Storage', 40),
    button('WIDC_BTN_STORAGE', [120, 32, 160, 72], 'ButtGuildhouselocker.bmp', 'Storage', 40),
    button('WIDC_BTN_TELEPORTER', [174, 32, 214, 72], 'ButtGuildhouseteleport.bmp', 'Teleporter', 40),
    button('WIDC_BTN_UPKEEP', [228, 32, 268, 72], 'ButtGuildhousetex.bmp', 'Fee Deposit', 40),
  ],
};

/** APP_GH_FURNITURE_STORAGE (resdata.inc:3971-4044); the Time Left statics (WIDC_STATIC4-5) are hidden at open (:646-651). */
export const GH_STORAGE: ResLayout = {
  title: 'Furniture Storage', width: 448, height: 512,
  controls: [
    { kind: 'combo', id: 'WIDC_COMBOBOX1', rect: [300, 8, 412, 26], tile: EDIT },
    { kind: 'static', id: 'WIDC_STATIC1', rect: [92, 36, 188, 52], text: 'Name' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [266, 36, 310, 52], text: 'Time' },
    { kind: 'static', id: 'WIDC_STATIC3', rect: [366, 36, 398, 52], text: 'I/R' },
    { kind: 'custom', id: 'WIDC_LISTBOX1', rect: [6, 56, 436, 352], tile: EDIT },
    { kind: 'text', id: 'WIDC_TEXT1', rect: [26, 386, 416, 456], tile: EDIT, scroll: true },
  ],
};

/** APP_CONFIRM_BUYEX (resdata.inc:3113-3204) as CWndGHUpkeep sets it: its title and labels (`Initialize`, :687-708). */
export const GH_UPKEEP: ResLayout = {
  title: 'Maintenance Fee', width: 272, height: 176,
  controls: [
    { kind: 'static', id: 'WIDC_CONTROL1', rect: [26, 40, 82, 58], text: 'Duration' },
    { kind: 'edit', id: 'WIDC_CONTROL2', rect: [90, 42, 188, 60], tile: EDIT, maxLength: 3 },
    { kind: 'static', id: 'WIDC_STATIC1', rect: [26, 64, 82, 84], text: 'Amount' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [92, 68, 192, 84], text: '' },
    button('WIDC_PLUS', [198, 44, 214, 60], 'ButItemPlus.BMP', '+', 16),
    button('WIDC_MINUS', [216, 44, 232, 60], 'ButItemMinus.BMP', '-', 16),
    button('WIDC_MAX', [198, 64, 230, 80], 'ButItemMax.BMP', 'Max', 32),
    button('WIDC_OK', [44, 108, 116, 128], 'ButtOk.tga', 'OK'),
    button('WIDC_CANCEL', [148, 108, 220, 128], 'ButtCancel.tga', 'Cancel'),
  ],
};

/** APP_GH_SHOWONE (resdata.inc:6584-6594). */
export const GH_SHOWONE: ResLayout = {
  title: 'Installed', width: 304, height: 80, frame: { closeButton: false },
  controls: [{ kind: 'custom', id: 'WIDC_LISTBOX1', rect: [8, 8, 280, 42], tile: EDIT }],
};

/** The phone's words of the buttons (`data-word`). */
const PHONE_WORDS: Readonly<Record<string, string>> = { OK: 'OK', Cancel: 'Cancel', Max: 'Max', '+': '+', '-': '-' };

function phoneWords(window: ResWindow): void {
  for (const control of window.layout.controls) {
    if (control.kind === 'button' && PHONE_WORDS[control.label] !== undefined) window.button(control.id).dataset.word = PHONE_WORDS[control.label];
  }
}

/** CWndGHMainMenu. */
export class GuildHouseMenuWindow {
  readonly window: ResWindow;
  onPermissions: () => void = () => {};
  onFurniture: () => void = () => {};
  onStorage: () => void = () => {};
  onTeleporter: () => void = () => {};
  onUpkeep: () => void = () => {};

  constructor(art: UiArt, doc: Document = document) {
    const window = new ResWindow(GH_MAIN, art, doc);
    window.frame.element.classList.add('hud-guild-house');
    const wire = (id: string, run: () => void): void => {
      const b = window.button(id);
      b.title = b.getAttribute('aria-label') ?? '';
      b.addEventListener('click', run);
    };
    wire('WIDC_BTN_SETUPPOWER', () => this.onPermissions());
    wire('WIDC_BTN_FURNITURE', () => this.onFurniture());
    wire('WIDC_BTN_STORAGE', () => this.onStorage());
    wire('WIDC_BTN_TELEPORTER', () => this.onTeleporter());
    wire('WIDC_BTN_UPKEEP', () => this.onUpkeep());
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** `Process`: the upkeep's time left, or that it ran out. */
  setTime(text: string): void {
    this.window.setText('WIDC_STATIC2', text);
  }
}

/** The columns of a storage row from the list's left (`rect.left + 16`, `+ 80`, `+ 260`) and the I/R button (window x 368). */
const ICON_X = 16, NAME_X = 80, TIME_X = 260, BUTTON_X = 362;
/** A row's height (`nListFontHeight`, 40) and its box's offset (`renderBoxRect.top + 4`). */
const ROW = 40;
/** The headers and the column each sorts (`OnLButtonUp`, :1157-1215). */
const STORAGE_HEADERS: ReadonlyArray<[string, Exclude<StorageSort, null>]> = [
  ['WIDC_STATIC1', 'name'], ['WIDC_STATIC2', 'time'], ['WIDC_STATIC3', 'placed'],
];

/** One drawn storage row. */
export interface StorageRowView {
  icon: string | null;
  name: string;
  time: string;
  placed: boolean;
  /** The I/R button is on (`UpdateIRButton`). */
  enabled: boolean;
  /** The button's tooltip (`TID_TOOLTIP_GUILDHOUSE_BUTT_*`). */
  tip: string;
}

/** CWndGuildHousing. */
export class FurnitureStorageWindow {
  readonly window: ResWindow;
  onSort: (sort: Exclude<StorageSort, null>) => void = () => {};
  onChoose: (index: number) => void = () => {};
  /** A row's install / remove button. */
  onButton: (index: number) => void = () => {};
  /** The combo's kind chosen (its index in the choices). */
  onKind: (index: number) => void = () => {};
  private readonly rows: HTMLElement;
  private readonly arrow: HTMLElement;
  private readonly combo: HTMLInputElement;
  private choices: readonly string[] = [];
  /** What the rows show as drawn last (`draw`). */
  private drawnRows = '';

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    const window = new ResWindow(GH_STORAGE, art, doc);
    window.frame.element.classList.add('hud-gh-storage');
    for (const [id, sort] of STORAGE_HEADERS) {
      const header = window.control(id).parentElement!;
      header.classList.add('hud-gh-storage-head');
      header.dataset.sort = sort;
      header.addEventListener('click', () => this.onSort(sort));
    }
    const area = window.control('WIDC_LISTBOX1');
    const rows = doc.createElement('div');
    rows.className = 'hud-gh-storage-rows';
    rows.setAttribute('role', 'listbox');
    rows.setAttribute('aria-label', 'Furniture');
    place(rows, { left: 0, top: 4, width: 430, height: 292 });
    area.append(rows);
    const arrow = doc.createElement('i');
    arrow.className = 'hud-gh-storage-arrow';
    arrow.hidden = true;
    window.frame.body.append(arrow);
    // the read-only combo (EBS_READONLY): a choice picked is read back from its field
    const combo = window.input('WIDC_COMBOBOX1');
    combo.readOnly = true;
    combo.setAttribute('aria-label', 'Furniture kind');
    combo.parentElement!.addEventListener('click', (event) => {
      if ((event.target as Element | null)?.closest?.('[role="option"]') === null) return;
      const index = this.choices.indexOf(combo.value);
      if (index >= 0) this.onKind(index);
    });
    this.rows = rows;
    this.arrow = arrow;
    this.combo = combo;
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** `InitBySection`: the title, the combo's choices (the teleporter's one, greyed) at the first. */
  setSection(title: string, choices: readonly string[], comboEnabled: boolean): void {
    this.window.frame.setTitle(title);
    this.choices = choices;
    this.window.setChoices('WIDC_COMBOBOX1', choices);
    this.combo.value = choices[0] ?? '';
    this.combo.disabled = !comboEnabled;
  }

  /** The rows (the chosen one red, -1 for none), the chosen item's words, the sorted header's arrow. */
  draw(rows: readonly StorageRowView[], chosen: number, words: string, sort: StorageSort, greater: boolean): void {
    // 2026-11-15 (consistency scan): the rows made again only when what they show changed (the once-a-second tick of the
    // times rebuilt them every second: a press whose down and up straddled it went nowhere, and the I/R button's tooltip
    // started over), as the bank redraws
    const signature = JSON.stringify([rows, chosen]);
    if (signature !== this.drawnRows) {
      this.drawnRows = signature;
      this.drawRows(rows, chosen);
    }
    this.drawHead(words, sort, greater);
  }

  private drawRows(rows: readonly StorageRowView[], chosen: number): void {
    const top = this.rows.scrollTop;
    this.rows.replaceChildren(...rows.map((row, index) => {
      const line = this.doc.createElement('div');
      line.className = 'hud-gh-storage-row';
      line.setAttribute('role', 'option');
      line.setAttribute('aria-selected', String(index === chosen));
      line.setAttribute('aria-label', `${row.name} ${row.time}`);
      line.dataset.placed = String(row.placed);
      place(line, { left: 0, top: index * ROW, width: 430, height: ROW });
      if (row.icon !== null) {
        const icon = this.doc.createElement('img');
        icon.src = this.art.url(row.icon);
        icon.alt = '';
        place(icon, { left: ICON_X, top: 6, width: 32, height: 32 });
        line.append(icon);
      }
      const text = (value: string, left: number, width: number, column: string): void => {
        const cell = this.doc.createElement('span');
        cell.textContent = value;
        cell.dataset.column = column;
        place(cell, { left, top: 16, width, height: 15 });
        line.append(cell);
      };
      text(row.name, NAME_X, TIME_X - NAME_X - 4, 'name');
      text(row.time, TIME_X, BUTTON_X - TIME_X - 4, 'time');
      const press = this.doc.createElement('button');
      press.type = 'button';
      press.className = 'hud-picture-button hud-gh-storage-ir';
      press.style.backgroundImage = `url(${JSON.stringify(this.art.url(row.placed ? 'ui/buttlockerinstall.png' : 'ui/buttlockerdismantle.png'))})`;
      press.style.setProperty('--hud-quarter', '32px');
      press.title = row.tip;
      press.setAttribute('aria-label', row.placed ? 'Remove' : 'Install');
      press.dataset.word = row.placed ? 'Remove' : 'Install';
      press.disabled = !row.enabled;
      place(press, { left: BUTTON_X, top: 5, width: 32, height: 32 });
      press.addEventListener('click', (event) => { event.stopPropagation(); this.onButton(index); });
      line.append(press);
      line.addEventListener('click', () => this.onChoose(index));
      return line;
    }));
    const spacer = this.doc.createElement('div');
    place(spacer, { left: 0, top: 0, width: 1, height: rows.length * ROW });
    this.rows.append(spacer);
    this.rows.scrollTop = top;
  }

  /** The chosen item's words and the sorted header's arrow. */
  private drawHead(words: string, sort: StorageSort, greater: boolean): void {
    this.window.setText('WIDC_TEXT1', words);
    // LvUp (rising) or LvDn beside the sorted header, 18 px to its left (:775-788)
    const header = STORAGE_HEADERS.find(([, s]) => s === sort);
    this.arrow.hidden = header === undefined;
    if (header !== undefined) {
      const rect = this.window.layout.controls.find((c) => c.id === header[0])!.rect;
      this.arrow.style.backgroundImage = `url(${JSON.stringify(this.art.url(greater ? 'ui/lvup.png' : 'ui/lvdn.png'))})`;
      place(this.arrow, { left: rect[0] - 18, top: rect[1], width: 16, height: 16 });
    }
  }

  /** Scrolls the chosen row into view (`FixScrollBar`). */
  showRow(index: number): void {
    const top = index * ROW;
    if (top < this.rows.scrollTop) this.rows.scrollTop = top;
    else if (top + ROW > this.rows.scrollTop + this.rows.clientHeight) this.rows.scrollTop = top + ROW - this.rows.clientHeight;
  }
}

/** CWndGHUpkeep. */
export class UpkeepWindow {
  readonly window: ResWindow;
  /** OK with the days typed. */
  onOk: (days: number) => void = () => {};
  private readonly input: HTMLInputElement;
  private days = 1;

  constructor(art: UiArt, private readonly maxDays: number, private readonly cost: (days: number) => string, doc: Document = document) {
    const window = new ResWindow(GH_UPKEEP, art, doc);
    window.frame.element.classList.add('hud-gh-upkeep');
    phoneWords(window);
    const input = window.input('WIDC_CONTROL2');
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', 'Duration');
    // EN_CHANGE (:741-757): the count typed, clamped 0..200, the amount again (a count past the most is not taken)
    input.addEventListener('input', () => this.change(Math.min(Math.max(Number.parseInt(input.value, 10) || 0, 0), 200), false));
    window.button('WIDC_PLUS').addEventListener('click', () => this.change(Math.min(this.read() + 1, maxDays)));
    window.button('WIDC_MINUS').addEventListener('click', () => this.change(Math.max(this.read() - 1, 1)));
    window.button('WIDC_MAX').addEventListener('click', () => this.change(maxDays));
    window.button('WIDC_OK').addEventListener('click', () => {
      const days = this.read();
      if (days > 0 && days <= maxDays) this.onOk(days);
      window.close();
    });
    window.button('WIDC_CANCEL').addEventListener('click', () => window.close());
    this.input = input;
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  private read(): number {
    return Number.parseInt(this.input.value, 10) || 0;
  }

  /** `OnChangeBuyCount`: past the most, nothing; else the field and the amount. */
  private change(days: number, write = true): void {
    if (days > this.maxDays) return;
    this.days = days;
    if (write && String(days) !== this.input.value) this.input.value = String(days);
    this.window.setText('WIDC_STATIC2', this.cost(days));
  }

  /** `Initialize`: centred, one day. */
  open(): void {
    this.input.value = '1';
    this.change(1);
    this.window.open();
  }

  get value(): number {
    return this.days;
  }
}

/** CWndGHouseShowOneUnit. */
export class ShowOneWindow {
  readonly window: ResWindow;
  private readonly area: HTMLElement;

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    const window = new ResWindow(GH_SHOWONE, art, doc);
    window.frame.element.classList.add('hud-gh-showone');
    this.area = window.control('WIDC_LISTBOX1');
    this.area.classList.add('hud-gh-showone-item');
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** `SetItem` and `OnDraw`: the icon, the name and the time, " (NEW)" or " (▶)". */
  show(icon: string | null, name: string, time: string, at: { x: number; y: number }): void {
    const parts: HTMLElement[] = [];
    if (icon !== null) {
      const img = this.doc.createElement('img');
      img.src = this.art.url(icon);
      img.alt = '';
      place(img, { left: 10, top: 0, width: 32, height: 32 });
      parts.push(img);
    }
    for (const [value, left, width] of [[name, 50, 150], [time, 200, 72]] as const) {
      const span = this.doc.createElement('span');
      span.textContent = value;
      place(span, { left, top: 12, width, height: 15 });
      parts.push(span);
    }
    const blink = this.doc.createElement('i');
    blink.className = 'hud-gh-showone-blink';
    parts.push(blink);
    this.area.querySelectorAll(':scope > :not(.hud-edit-tiles)').forEach((e) => e.remove());
    this.area.append(...parts);
    if (!this.window.isOpen) this.window.open(at);
  }
}
