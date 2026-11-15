// Personal housing's windows (2026-11-15, side-session-notes housing-research/A-client.md §3.2), each laid out from its
// resdata.inc entry by `ResWindow` (resData.txt.txt's English):
//
//   CWndHousing    APP_HOUSING 811        resdata.inc:28815-28897   448 x 416, "Housing": the headers Type / Item Name /
//                                                                   Remaining Time / Install (WndEditTile200, a press sorts),
//                                                                   the list (10 rows, black, the chosen one blue: type at
//                                                                   +5, name +85, time +250, "O"/"X" +375, WndHousing.cpp:
//                                                                   97-174), "Information" and the chosen item's words,
//                                                                   Install (ButOk2) and Remove (ButCancel2)
//   CWndRoomList   APP_MINIROOM_LIST 823  resdata.inc:2-48          272 x 272, "House List": the words, the list ("1. Name",
//                                                                   the chosen one red), OK, Refresh (ButtGWRefresh), Cancel
//   CWndQuitRoom   APP_QUIT_ROOM 822      resdata.inc:59-87         304 x 128, "House": "Are you sure you want to exit?", OK,
//                                                                   Cancel
//
// The windows draw and report presses; housing/housingHud.ts holds the rules and sends the packets. All three open centred
// (`MoveParentCenter`). On a landscape phone the Housing window is a compact sheet (style.css).

import type { UiArt } from '../art';
import { place } from '../button';
import { ResWindow } from '../resWindow';
import type { ResControl, ResLayout } from '../resWindow';
import type { HousingSort } from '../../housing/housingBook';

const EDIT = 'WndEditTile00.tga';
const HEAD = 'WndEditTile200.tga';
const button = (id: string, rect: ResControl['rect'], picture: string, label: string): ResControl =>
  ({ kind: 'button', id, rect, picture, label, quarter: 72 });

/** APP_HOUSING (resdata.inc:28815-28897). */
export const HOUSING: ResLayout = {
  title: 'Housing', width: 448, height: 416,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC2', rect: [8, 8, 88, 24], text: 'Type', group: HEAD },
    { kind: 'static', id: 'WIDC_STATIC3', rect: [92, 8, 252, 24], text: 'Item Name', group: HEAD },
    { kind: 'static', id: 'WIDC_STATIC4', rect: [258, 8, 362, 24], text: 'Remaining Time', group: HEAD },
    { kind: 'static', id: 'WIDC_STATIC5', rect: [366, 8, 428, 24], text: 'Install', group: HEAD },
    { kind: 'list', id: 'WIDC_LISTBOX1', rect: [8, 34, 432, 202], tile: EDIT },
    { kind: 'static', id: 'WIDC_STATIC1', rect: [8, 224, 104, 240], text: 'Information', group: HEAD },
    { kind: 'text', id: 'WIDC_TEXT1', rect: [8, 248, 432, 348], tile: EDIT, scroll: true },
    button('WIDC_BUTTON1', [64, 356, 136, 376], 'ButOk2.bmp', 'Install'),
    button('WIDC_BUTTON2', [282, 356, 356, 376], 'ButCancel2.bmp', 'Remove'),
  ],
};

/** APP_MINIROOM_LIST (resdata.inc:2-48). */
export const ROOM_LIST: ResLayout = {
  title: 'House List', width: 272, height: 272,
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [10, 8, 250, 84], tile: EDIT, text: "This is a list of your friend's houses." },
    { kind: 'list', id: 'WIDC_LISTBOX1', rect: [8, 92, 258, 196], tile: EDIT },
    button('WIDC_BUTTON1', [8, 208, 80, 228], 'ButOk2.bmp', 'OK'),
    button('WIDC_BUTTON2', [92, 208, 164, 228], 'ButtGWRefresh.tga', 'Refresh'),
    button('WIDC_BUTTON3', [180, 208, 252, 228], 'ButCancel2.bmp', 'Cancel'),
  ],
};

/** APP_QUIT_ROOM (resdata.inc:59-87). */
export const QUIT_ROOM: ResLayout = {
  title: 'House', width: 304, height: 128,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [30, 14, 254, 58], text: 'Are you sure you want to exit?' },
    button('WIDC_BUTTON1', [38, 62, 110, 82], 'ButOk2.bmp', 'OK'),
    button('WIDC_BUTTON2', [186, 62, 258, 82], 'ButCancel2.bmp', 'Cancel'),
  ],
};

/** The phone's words of the buttons (`data-word`, the guild windows' style). */
const PHONE_WORDS: Readonly<Record<string, string>> = { Install: 'Install', Remove: 'Remove', OK: 'OK', Refresh: 'Refresh', Cancel: 'Cancel' };

function phoneWords(window: ResWindow): void {
  for (const control of window.layout.controls) {
    if (control.kind === 'button') window.button(control.id).dataset.word = PHONE_WORDS[control.label] ?? control.label;
  }
}

/** The columns of a Housing row, from the list's left (`pCustom->rect.left + 5, + 85, + 250, + 375`), less the rows' 3 px. */
const COLUMNS = [2, 82, 247, 372] as const;
/** The headers and the column each sorts (`OnLButtonUp`, :229-261). */
const HEADERS: ReadonlyArray<[string, HousingSort]> = [
  ['WIDC_STATIC2', 'type'], ['WIDC_STATIC3', 'name'], ['WIDC_STATIC4', 'time'], ['WIDC_STATIC5', 'placed'],
];

/** One drawn Housing row: the four columns' words. */
export interface HousingRowView {
  type: string;
  name: string;
  time: string;
  placed: boolean;
}

/** CWndHousing. */
export class HousingWindow {
  readonly window: ResWindow;
  /** A header pressed: its column. */
  onSort: (sort: HousingSort) => void = () => {};
  /** A row chosen (its index in the drawn order). */
  onChoose: (index: number) => void = () => {};
  onInstall: () => void = () => {};
  onRemove: () => void = () => {};
  private readonly rows: HTMLElement;
  /** What the rows show as drawn last (`draw`). */
  private drawnRows = '';

  constructor(art: UiArt, private readonly doc: Document = document) {
    const window = new ResWindow(HOUSING, art, doc);
    window.frame.element.classList.add('hud-housing');
    phoneWords(window);
    for (const [id, sort] of HEADERS) {
      const header = window.control(id).parentElement!;
      header.classList.add('hud-housing-head');
      header.dataset.sort = sort;
      header.addEventListener('click', () => this.onSort(sort));
    }
    this.rows = window.control('WIDC_LISTBOX1');
    this.rows.classList.add('hud-housing-rows');
    this.rows.setAttribute('aria-label', 'Housing');
    window.button('WIDC_BUTTON1').addEventListener('click', () => this.onInstall());
    window.button('WIDC_BUTTON2').addEventListener('click', () => this.onRemove());
    this.window = window;
  }

  get frame(): ResWindow['frame'] {
    return this.window.frame;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** The rows (the chosen one blue, -1 for none), the chosen item's words and the two buttons. */
  draw(rows: readonly HousingRowView[], chosen: number, words: string, buttons: { install: boolean; remove: boolean }): void {
    // 2026-11-15 (consistency scan): the rows made again only when what they show changed (the once-a-second tick of the
    // times rebuilt them every second, and a press whose down and up straddled it went nowhere), as the bank redraws
    const signature = JSON.stringify([rows, chosen]);
    if (signature !== this.drawnRows) {
      this.drawnRows = signature;
      this.drawRows(rows, chosen);
    }
    this.window.setText('WIDC_TEXT1', words);
    this.window.button('WIDC_BUTTON1').disabled = !buttons.install;
    this.window.button('WIDC_BUTTON2').disabled = !buttons.remove;
  }

  private drawRows(rows: readonly HousingRowView[], chosen: number): void {
    const top = this.rows.scrollTop;
    this.rows.replaceChildren(...rows.map((row, index) => {
      const line = this.doc.createElement('div');
      line.className = 'hud-housing-row';
      line.setAttribute('role', 'option');
      line.setAttribute('aria-selected', String(index === chosen));
      line.setAttribute('aria-label', `${row.type} ${row.name} ${row.time} ${row.placed ? 'O' : 'X'}`);
      line.dataset.index = String(index);
      [row.type, row.name, row.time, row.placed ? 'O' : 'X'].forEach((text, i) => {
        const cell = this.doc.createElement('span');
        cell.textContent = text;
        cell.dataset.column = String(i);
        place(cell, { left: COLUMNS[i]!, top: 0, width: (COLUMNS[i + 1] ?? 424) - COLUMNS[i]! - 2, height: 15 });
        line.append(cell);
      });
      line.addEventListener('click', () => this.onChoose(index));
      return line;
    }));
    this.rows.scrollTop = top;
  }
}

/** CWndRoomList. */
export class RoomListWindow {
  readonly window: ResWindow;
  /** OK with a row chosen: its owner. */
  onVisit: (ownerId: number) => void = () => {};
  onRefresh: () => void = () => {};
  private readonly rows: HTMLElement;
  private owners: number[] = [];
  private chosen = -1;

  constructor(art: UiArt, private readonly doc: Document = document) {
    const window = new ResWindow(ROOM_LIST, art, doc);
    window.frame.element.classList.add('hud-room-list');
    phoneWords(window);
    this.rows = window.control('WIDC_LISTBOX1');
    this.rows.setAttribute('aria-label', 'House List');
    window.button('WIDC_BUTTON1').addEventListener('click', () => {
      const owner = this.owners[this.chosen];
      if (owner === undefined) return; // GetCurSel() < 0
      this.onVisit(owner);
      window.close();
    });
    window.button('WIDC_BUTTON2').addEventListener('click', () => this.onRefresh());
    window.button('WIDC_BUTTON3').addEventListener('click', () => window.close());
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** `OnInitialUpdate`: the list cleared, then the window centred. */
  open(): void {
    this.show([]);
    this.window.open();
  }

  /** `Refresh` (:39-60): "n. Name" for each owner whose name is known. */
  show(owners: ReadonlyArray<{ id: number; name: string }>): void {
    this.owners = owners.map((owner) => owner.id);
    this.chosen = -1;
    this.rows.replaceChildren(...owners.map((owner, index) => {
      const row = this.doc.createElement('div');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', 'false');
      row.textContent = `${index + 1}. ${owner.name}`;
      row.addEventListener('click', () => {
        this.chosen = index;
        for (const other of this.rows.children) other.setAttribute('aria-selected', String(other === row));
      });
      return row;
    }));
  }
}

/** CWndQuitRoom. */
export class QuitRoomWindow {
  readonly window: ResWindow;
  onOk: () => void = () => {};

  constructor(art: UiArt, doc: Document = document) {
    const window = new ResWindow(QUIT_ROOM, art, doc);
    window.frame.element.classList.add('hud-quit-room');
    phoneWords(window);
    window.button('WIDC_BUTTON1').addEventListener('click', () => { this.onOk(); window.close(); });
    window.button('WIDC_BUTTON2').addEventListener('click', () => window.close());
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }
}
