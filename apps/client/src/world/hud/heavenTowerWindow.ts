// The Forsaken Tower window (2026-11-10; docs/superpowers/specs/2026-11-10-arena-tower-research.md §4): what the Forsaken
// Tower Manager (`MaFl_HEAVENMAN`, `Resource/character.inc:6951-6966`) opens, as Neuz V15 draws and runs it. On in the
// owner's build: its code is `#if __VER >= 12 // __HEAVEN_TOWER`, and `__VER` is 15.
//
//   OnCommand MMI_HEAVEN_TOWER          _Interface/WndWorld.cpp:5115-5129  open already: TID_GAME_WND_OVERLAPED; else a new one
//   resdata.inc APP_HEAVEN_TOWER        Resource/resdata.inc:20907-20953    "WndTile00.tga" tiled 304 x 416, "Enter Forsaken
//                                                                         Tower"; WIDC_TEXT1 (14, 12, 288, 112), WIDC_BUTTON1
//                                                                         (252, 84, 276, 108), WIDC_LISTBOX1 (14, 116, 282, 364),
//                                                                         WIDC_CUSTOM2 (14, 120, 277, 134)
//   CWndHeavenTower::InitText           _Interface/WndField.cpp:21642-21695  the description (one page: WIDC_BUTTON1 hidden),
//                                                                         seven lines "%d. %s", the costs of floors 1-5
//   CWndHeavenTower::InitWnd            WndField.cpp:21778-21829            the list as tall as its lines + 10, the window
//                                                                         as the list + the text + 60, all 80 px wider
//   CWndHeavenTower::OnDraw             WndField.cpp:21624-21640            ARGB(60, 240, 0, 0) over the chosen line
//   CWndHeavenTower::OnChildNotify      WndField.cpp:21720-21776            line 7 closes; lines 1-6 open the entrance box
//   CWndHeavenTowerEntranceConfirm      WndField.cpp:21835-21862            MB_OKCANCEL; OK sends floors 1-5
//                                                                         (SendTeleportToHeavenTower) and closes the window
//
// The server (`CDPSrvr::OnTeleportToHeavenTower`, `WORLDSERVER/DPSrvr.cpp:9509-9575`) checks the NPC is near, takes the fee
// or answers TID_GAME_LACKMONEY, and REPLACEs the player onto the floor. No level limit: the levels are only words.
//
// The phone: the window as a panel (style.css, `.hud-heaven-tower`), its lines 14 px and tall enough for a finger; a tap
// on a line is the click.

import type { UiArt } from './art';
import { formatText } from './format';
import { ResWindow } from './resWindow';
import type { ResLayout } from './resWindow';

/** The edit tiles of the text and the list. */
const EDIT = 'WndEditTile00.tga';
/** "Do not Enter.", the seventh line, closes the window (`m_nChoiceNum == 6`, :21751-21755). */
const DO_NOT_ENTER = 6;
/** The Secret Room's line: its box sends nothing (`m_nFloor != 6`, :21851). */
const SECRET_ROOM = 5;
/** `m_nCost` (:21662-21666): floors B1 to B5. */
export const FLOOR_COSTS: readonly number[] = [10000, 30000, 50000, 70000, 100000];
/** A list line's pitch, `m_nGap` (font height + 2): the browser's list rows are 15 px (style.css `.hud-res-list-rows`). */
const GAP = 15;
const LINES = 7;
/** "Make the window larger for English" (:21803-21828). */
const WIDER = 80;
const LIST_HEIGHT = LINES * GAP + 10;
const TEXT_HEIGHT = 112 - 12;

/** APP_HEAVEN_TOWER as `InitWnd` leaves it; WIDC_BUTTON1 (the next page) is hidden with the one page there is. */
export const HEAVEN_TOWER: ResLayout = {
  title: 'Enter Forsaken Tower', width: 304 + WIDER, height: LIST_HEIGHT + TEXT_HEIGHT + 60,
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [14, 12, 288 + WIDER, 112], tile: EDIT, scroll: true },
    { kind: 'list', id: 'WIDC_LISTBOX1', rect: [14, 116, 282 + WIDER, 116 + LIST_HEIGHT], tile: EDIT },
  ],
};

/** What the window asks of the world screen. */
export interface HeavenTowerHost {
  /** A text of the catalog by its TID (empty when missing). */
  text(tid: string): string;
  /** A line of the catalog in the chat (`PutString`). */
  say(tid: string): void;
  /** `CWndHeavenTowerEntranceConfirm`: an OK / Cancel box with `text`; OK runs `ok`. */
  confirm(text: string, ok: () => void): void;
  /** `SendTeleportToHeavenTower( floor )`, floors 1 to 5. */
  send(floor: number): void;
}

const floorTid = (line: number): string => `TID_GAME_HEAVETOWER_FLOOR0${line + 1}`;

export class HeavenTowerWindow {
  readonly window: ResWindow;
  /** `m_nChoiceNum`: the line pressed last, -1 for none. */
  private chosen = -1;

  constructor(private readonly host: HeavenTowerHost, art: UiArt, doc: Document = document) {
    this.window = new ResWindow(HEAVEN_TOWER, art, doc);
    this.window.frame.element.classList.add('hud-heaven-tower');
    this.window.onClose = () => this.choose(-1);
    this.window.setText('WIDC_TEXT1', host.text('TID_TOOLTIP_HEAVENTOWER'));
    const rows = this.window.control('WIDC_LISTBOX1');
    for (let line = 0; line < LINES; line++) {
      const row = doc.createElement('div');
      row.setAttribute('role', 'option');
      row.dataset.floor = String(line + 1);
      row.textContent = `${line + 1}. ${host.text(floorTid(line))}`;
      row.addEventListener('click', () => this.press(line));
      rows.append(row);
    }
  }

  /** What goes in the windows' layer. */
  get element(): HTMLElement {
    return this.window.element;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** MMI_HEAVEN_TOWER: the window centred (`MoveParentCenter`), or TID_GAME_WND_OVERLAPED when it is open. */
  open(): void {
    if (this.isOpen) {
      this.host.say('TID_GAME_WND_OVERLAPED');
      return;
    }
    this.choose(-1);
    this.window.open('center');
  }

  close(): void {
    this.window.close();
  }

  dispose(): void {
    this.window.dispose();
  }

  /** A click on the list's line `line` (0-6, `GetCurSel`). */
  private press(line: number): void {
    this.choose(line);
    if (line === DO_NOT_ENTER) {
      this.close();
      return;
    }
    const message = this.host.text(`${floorTid(line)}_MSG`);
    const text = line === SECRET_ROOM ? message : formatText(message, [FLOOR_COSTS[line]!]);
    this.host.confirm(text, () => {
      if (line === SECRET_ROOM) return;
      this.host.send(line + 1);
      this.close();
    });
  }

  /** `m_nChoiceNum` and its red bar (OnDraw), with the list's own selection. */
  private choose(line: number): void {
    this.chosen = line;
    const rows = this.window.control('WIDC_LISTBOX1').children;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as HTMLElement;
      row.toggleAttribute('data-chosen', i === this.chosen);
      row.setAttribute('aria-selected', String(i === this.chosen));
    }
  }
}
