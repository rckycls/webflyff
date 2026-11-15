// The application status (2026-11-15, B3; A-client.md §2.2): what Frankie's Status opens when the world server answers
// GC_REQUEST_STATUS (`DPClient.cpp:6869-6925`). V15's `CWndGuildCombatState` takes the 1:1 layout:
//
//   CWndGuildCombatState   _Interface/WndField.cpp:16406-16610   APP_GUILDCOMBAT_1TO1_OFFERSTATE, resdata.inc:11960,
//                                                                304 x 480, "Guild Siege - Applying Situation"
//   WIDC_STATIC2           the count-down to the next siege (the owner's short duration, formatDuration: "1h2m"), redrawn every frame (:16540-16560, :16577-16587)
//   WIDC_LISTBOX1          one row per applying guild, "No.%.2d\t\t%s" in bid order (:16531-16538)
//   WIDC_STATIC5           the own place, red past the guilds that fight (:16562-16575)
//   WIDC_STATIC6           the own bid
//   WIDC_BUTTON1           closes and asks for the offer window; WIDC_BUTTON2 asks for the status again (:16503-16526)

import type { UiArt } from '../art';
import { ResWindow } from '../resWindow';
import type { ResLayout } from '../resWindow';
import { formatDuration } from '../duration';
import { ownRank, statusRankRed } from '../../guildCombat/guildCombatRules';

const EDIT = 'WndEditTile00.tga';

export function statusLayout(title: string): ResLayout {
  return {
    title, width: 304, height: 480,
    controls: [
      { kind: 'static', id: 'WIDC_STATIC1', rect: [20, 20, 116, 36], text: 'Remaining Time.' },
      { kind: 'static', id: 'WIDC_STATIC2', rect: [134, 20, 270, 36] },
      { kind: 'list', id: 'WIDC_LISTBOX1', rect: [22, 100, 278, 328], tile: EDIT },
      { kind: 'static', id: 'WIDC_STATIC3', rect: [20, 342, 116, 358], text: 'Bidding Rank' },
      { kind: 'static', id: 'WIDC_STATIC5', rect: [134, 342, 230, 358] },
      { kind: 'static', id: 'WIDC_STATIC7', rect: [20, 368, 116, 384], text: 'Current Application Fee.' },
      { kind: 'static', id: 'WIDC_STATIC6', rect: [134, 368, 230, 384] },
      { kind: 'button', id: 'WIDC_BUTTON1', rect: [18, 404, 90, 424], picture: 'ButtApply.tga', label: 'Apply', quarter: 72 },
      { kind: 'button', id: 'WIDC_BUTTON2', rect: [108, 404, 180, 424], picture: 'ButtGWRefresh.tga', label: 'Refresh', quarter: 72 },
      { kind: 'button', id: 'WIDC_CLOSE', rect: [200, 404, 272, 424], picture: 'ButtClose.tga', label: 'Close', quarter: 72 },
    ],
  };
}

/** What the window shows. */
export interface StatusData {
  /** When the next siege starts, on the screen's clock (ms). */
  endsAt: number;
  guildNames: readonly string[];
  ownBid: number;
  ownGuildName: string;
}

export class StatusWindow {
  readonly window: ResWindow;
  /** Apply: close, then ask for the offer window. Refresh: ask again. */
  onApply: () => void = () => {};
  onRefresh: () => void = () => {};
  private data: StatusData | null = null;

  constructor(title: string, art: UiArt, private readonly doc: Document = document) {
    const window = new ResWindow(statusLayout(title), art, doc);
    window.frame.element.classList.add('hud-gc', 'hud-gc-status');
    window.button('WIDC_BUTTON1').addEventListener('click', () => { window.close(); this.onApply(); });
    window.button('WIDC_BUTTON2').addEventListener('click', () => this.onRefresh());
    window.button('WIDC_CLOSE').addEventListener('click', () => window.close());
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  get element(): HTMLElement {
    return this.window.element;
  }

  setTitle(title: string): void {
    this.window.frame.setTitle(title);
  }

  /** Shown (or refreshed in place when already open) with `data`. */
  show(data: StatusData, now: number): void {
    this.data = data;
    const rows = data.guildNames.map((name, i) => {
      const row = this.doc.createElement('div');
      row.setAttribute('role', 'option');
      const no = this.doc.createElement('span');
      no.className = 'hud-gc-no';
      no.textContent = `No.${String(i + 1).padStart(2, '0')}`;
      const guild = this.doc.createElement('span');
      guild.className = 'hud-gc-name';
      guild.textContent = name;
      row.append(no, guild);
      return row;
    });
    this.window.control('WIDC_LISTBOX1').replaceChildren(...rows);
    const rank = ownRank(data.guildNames, data.ownGuildName);
    const place = this.window.control('WIDC_STATIC5');
    place.textContent = rank === 0 ? '' : String(rank);
    place.style.color = statusRankRed(rank) ? '#ff0000' : '';
    this.window.setText('WIDC_STATIC6', data.ownBid === 0 ? '' : data.ownBid.toLocaleString('en-US'));
    this.tick(now);
    if (!this.window.isOpen) this.window.open();
  }

  /** The count-down, from the screen's clock; called once a second. */
  tick(now: number): void {
    if (this.data === null) return;
    this.window.setText('WIDC_STATIC2', formatDuration(Math.ceil((this.data.endsAt - now) / 1000)));
  }

  close(): void {
    this.window.close();
  }
}
