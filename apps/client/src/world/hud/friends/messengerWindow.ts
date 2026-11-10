// The Messenger (2026-11-10, friends-say research §2, §3): `CWndMessengerEx`, APP_MESSENGER_EX, opened by E and by
// Start → Messenger, and its Friend tab, `CWndFriendCtrlEx`.
//
//   resdata.inc APP_MESSENGER_EX     Resource/resdata.inc:2180-2299            "WndTile10.tga" tiled, 352 x 368, "Messenger"
//   CWndMessengerEx::OnDraw          _Interface/WndMessenger.cpp:417-620       the own state icon, name and state, the server
//                                                                              and channel names
//   CWndMessengerEx::OnInitialUpdate WndMessenger.cpp:658-776                  the tabs, the state menu, the pictures; at the
//                                                                              layout's bottom-right corner
//   CWndMessengerEx::OnChildNotify   WndMessenger.cpp:800-928                  Add, the state menu, the column heads
//   CWndFriendCtrlEx::OnDraw         _Interface/WndMessengerCtrl.cpp:356-538   the rows (friendRules.ts)
//   OnLButtonUp, OnLButtonDblClk,    WndMessengerCtrl.cpp:567-630, :816-903    select, open the Message window, the menu
//   OnRButtonUp
//
// The Guild tab (2026-11-10, guild research §5) lists the own guild's members as `CWndGuildCtrlEx` does
// (`WndMessengerCtrl.cpp:1094-1419`): the same columns and sort, a double click opens a message; it has no menu. The
// Mentor-Pupil tab is drawn, but its list stays empty: the browser keeps no campus member list.
// The note button and the mail icon wait for the memos and the post (research §9).

import type { UiArt } from '../art';
import { cssRgb, themeUrl } from '../art';
import { pictureButton, place } from '../button';
import type { ControlRect } from '../button';
import { WindowFrame } from '../frame';
import { textScrollBar } from '../resWindow';
import type { TextScrollBar } from '../resWindow';
import { EDIT, TAB_TILE, TAB_TILE_HEIGHT, chosenTabTiles, editTiles, tabStripTiles } from '../tiles';
import {
  channelFrame, jobFrames, nameColor, nameText, ownStateFrame, playerDataFrame, stateFrame,
} from '../../friends/friendRules';
import type { FriendRow, SortKey } from '../../friends/friendRules';

const WIDTH = 352;
const HEIGHT = 368;
const TITLE = 'Messenger';
/** WIDC_TABCTRL1 (resdata.inc:2199): 8,78-336,306. */
const TABS: ControlRect = { left: 8, top: 78, width: 328, height: 228 };
/** The tab strip at the tab control's bottom (the party window's). */
const STRIP = 18;
/** The column heads (resdata.inc:2253-2297): key, picture, rect; each picture is four states. */
const HEADS: ReadonlyArray<[SortKey, string, string, ControlRect]> = [
  ['channel', 'Channel', 'ButtMessengerChannel.bmp', { left: 8, top: 52, width: 58, height: 20 }],
  ['state', 'Status', 'ButtMessengerState.bmp', { left: 68, top: 52, width: 54, height: 20 }],
  ['level', 'Level', 'ButtMessengerLevel.bmp', { left: 123, top: 52, width: 50, height: 20 }],
  ['job', 'Job', 'ButtMessengerJob.bmp', { left: 174, top: 52, width: 58, height: 20 }],
  ['name', 'Character', 'ButtMessengerChar.bmp', { left: 234, top: 52, width: 88, height: 20 }],
];
const STATE_BUTTON: ControlRect = { left: 122, top: 26, width: 12, height: 12 };
const ADD: ControlRect = { left: 8, top: 310, width: 16, height: 16 };
const NOTE: ControlRect = { left: 30, top: 310, width: 16, height: 16 };
const STATIC1: ControlRect = { left: 8, top: 8, width: 32, height: 32 };
const STATIC2: ControlRect = { left: 168, top: 8, width: 152, height: 32 };
const TAB_TITLES: ReadonlyArray<[string, string]> = [
  ['TID_APP_COMMUNITY_FRIEND', 'Friend'], ['TID_APP_COMPANY', 'Guild'], ['TID_APP_COMMUNITY_CAMPUS', 'Mentor-Pupil'],
];
/** `m_nFontHeight` (`WndMessengerCtrl.cpp:230`) and the first row's top (`CPoint pt( 3, 3 )`). */
const PITCH = 20;
const TOP = 3;
/** The texts' 0xff606060. */
const GREY = 0xff606060;

/** What the window draws from. */
export interface MessengerView {
  ownName: string;
  /** The own state's text, "(Online)" and so on, or ''. */
  stateText: string;
  ownState: number;
  serverName: string;
  channelName: string;
  /** The Friend tab's rows, sorted. */
  rows: readonly FriendRow[];
  /** 2026-11-10: the Guild tab's rows, sorted (none outside a guild). */
  guildRows?: readonly FriendRow[];
  /** The job's name of a row (its tooltip). */
  jobName: (job: number) => string;
}

export class MessengerWindow {
  readonly frame: WindowFrame;
  /** A column head pressed, on the Friend tab (0) or the Guild tab (1). */
  onSort: (key: SortKey, tab: number) => void = () => {};
  /** The arrow by the state: open the state menu at this point of the window layer. */
  onStateMenu: (at: { x: number; y: number }) => void = () => {};
  onAdd: () => void = () => {};
  /** A row double-clicked. */
  onOpen: (row: FriendRow) => void = () => {};
  /** A row right-clicked, at this point of the window layer, on its tab. */
  onMenu: (row: FriendRow, at: { x: number; y: number }, tab: number) => void = () => {};
  /** `m_nCurSelect`: an index into the current tab's sorted rows, or -1. */
  selected = -1;
  private tab = 0;
  private readonly tabTiles: HTMLElement;
  private readonly panels: HTMLElement[];
  /** The Friend tab's list and the Guild tab's (2026-11-10), each with its scroll bar. */
  private readonly lists: HTMLElement[] = [];
  private readonly scrolls: TextScrollBar[] = [];
  private readonly listed: Array<readonly FriendRow[]> = [[], []];
  private readonly ownIcon: HTMLElement;
  private readonly name: HTMLElement[];
  private readonly state: HTMLElement;
  private readonly server: HTMLElement;
  private readonly channel: HTMLElement;
  private rows: readonly FriendRow[] = [];
  private shown = '';

  constructor(private readonly art: UiArt, private readonly text: (id: string, english: string) => string, private readonly doc: Document = document) {
    // 2026-11-10 (owner): on a phone the phones' smaller size (the frame's 0.7, as the other windows), not fitted to the
    // whole screen
    const frame = new WindowFrame(TITLE, art, { width: WIDTH, height: HEIGHT }, doc);
    frame.element.classList.add('hud-messenger');
    const body = frame.body;

    const static1 = doc.createElement('div');
    static1.className = 'hud-messenger-static';
    place(static1, STATIC1);
    static1.style.backgroundImage = themeUrl(art, 'WndChgElemItem.bmp');
    this.ownIcon = this.icon(8, 8);
    const static2 = doc.createElement('div');
    static2.className = 'hud-messenger-static';
    place(static2, STATIC2);
    static2.append(editTiles(doc, art, Math.trunc(STATIC2.width / EDIT), Math.trunc(STATIC2.height / EDIT)));
    // the name twice, a pixel apart (:482-483)
    this.name = [this.label(47, 10), this.label(48, 10)];
    for (const name of this.name) name.dataset.own = 'name';
    this.state = this.label(46, 27);
    this.state.dataset.own = 'state';
    this.server = this.label(170, 13);
    this.server.dataset.own = 'server';
    this.channel = this.label(170, 27);
    this.channel.dataset.own = 'channel';
    body.append(static1, this.ownIcon, static2, ...this.name, this.state, this.server, this.channel);

    const stateButton = pictureButton(doc, art, 'ButtMsgRight.bmp', STATE_BUTTON, STATE_BUTTON.width, () => {
      // the menu under the button (:810-819)
      const layer = frame.element.parentElement?.getBoundingClientRect();
      const box = stateButton.getBoundingClientRect();
      this.onStateMenu({ x: Math.round(box.left - (layer?.left ?? 0)), y: Math.round(box.bottom - (layer?.top ?? 0)) });
    });
    stateButton.dataset.button = 'state';
    stateButton.setAttribute('aria-label', 'Status');
    body.append(stateButton);
    for (const [key, label, picture, rect] of HEADS) {
      const head = pictureButton(doc, art, picture, rect, rect.width, () => { if (this.tab < 2) this.onSort(key, this.tab); });
      head.dataset.sort = key;
      head.setAttribute('aria-label', label);
      body.append(head);
    }
    const add = pictureButton(doc, art, 'ButtMessAdd.bmp', ADD, ADD.width, () => this.onAdd());
    add.dataset.button = 'add';
    add.setAttribute('aria-label', 'Add friend.');
    add.title = 'Add friend.';
    const note = pictureButton(doc, art, 'ButtMessNote.bmp', NOTE, NOTE.width, () => {});
    note.dataset.button = 'note';
    note.setAttribute('aria-label', 'Memos');
    note.disabled = true;
    body.append(add, note);

    // the tab control: the Friend list, the Guild list (2026-11-10) and the Mentor-Pupil panel
    const panelRect = { left: TABS.left, top: TABS.top, width: TABS.width, height: TABS.height - STRIP };
    const empty = (): HTMLElement => {
      const panel = doc.createElement('div');
      panel.className = 'hud-messenger-panel';
      place(panel, panelRect);
      return panel;
    };
    const listPanel = (tab: number): HTMLElement => {
      const panel = empty();
      const list = doc.createElement('div');
      list.className = 'hud-messenger-list';
      list.dataset.tab = String(tab);
      list.setAttribute('role', 'list');
      place(list, { left: 0, top: 0, width: panelRect.width, height: panelRect.height });
      list.addEventListener('scroll', () => {
        // a row a step (`CWndScrollBar` of the list, its page the height / 20)
        const snapped = Math.round(list.scrollTop / PITCH) * PITCH;
        if (snapped !== list.scrollTop) list.scrollTop = snapped;
      });
      list.addEventListener('click', (event) => this.press(event, 'select', tab));
      list.addEventListener('dblclick', (event) => this.press(event, 'open', tab));
      list.addEventListener('contextmenu', (event) => { event.preventDefault(); this.press(event, 'menu', tab); });
      const scroll = textScrollBar(doc, art, list, { left: 0, top: 0, width: panelRect.width, height: panelRect.height });
      panel.append(list, scroll.element);
      this.lists.push(list);
      this.scrolls.push(scroll);
      return panel;
    };
    this.panels = [listPanel(0), listPanel(1), empty()];
    body.append(...this.panels);
    this.tabTiles = doc.createElement('div');
    this.tabTiles.className = 'hud-messenger-tabs';
    place(this.tabTiles, { left: TABS.left, top: TABS.top + TABS.height - TAB_TILE_HEIGHT, width: TABS.width, height: TAB_TILE_HEIGHT });
    body.append(this.tabTiles);
    this.frame = frame;
    this.showTab(0);
  }

  get currentTab(): number {
    return this.tab;
  }

  /** The chosen tab (`WIDC_TABCTRL1`'s change, :829-841). */
  showTab(tab: number): void {
    if (tab !== this.tab) { this.selected = -1; this.shown = ''; }
    this.tab = tab;
    this.panels.forEach((panel, i) => { panel.hidden = i !== tab; });
    const columns = Math.trunc(TABS.width / TAB_TILE);
    const tile = (index: number, left: number, width = TAB_TILE): HTMLElement => {
      const element = this.doc.createElement('div');
      place(element, { left, top: 0, width, height: TAB_TILE_HEIGHT });
      element.style.backgroundImage = themeUrl(this.art, `WndTabTile${String(index).padStart(2, '0')}.bmp`);
      element.style.backgroundSize = '100% 100%';
      return element;
    };
    const tiles = tabStripTiles(columns, TAB_TITLES.length).map((index, i) => tile(index, i * TAB_TILE));
    for (const chosen of chosenTabTiles(columns, TAB_TITLES.length, tab)) tiles.push(tile(chosen.index, chosen.left, chosen.width));
    const length = Math.trunc(TABS.width / TAB_TITLES.length);
    const titles = TAB_TITLES.map(([id, english], i) => {
      const title = this.doc.createElement('button');
      title.type = 'button';
      title.className = 'hud-messenger-tab';
      title.dataset.tab = String(i);
      title.setAttribute('aria-pressed', String(i === tab));
      title.textContent = this.text(id, english);
      place(title, { left: i * length, top: 0, width: length, height: TAB_TILE_HEIGHT });
      title.addEventListener('click', () => this.showTab(i));
      return title;
    });
    this.tabTiles.replaceChildren(...tiles, ...titles);
  }

  /** While open, every frame: the upper part and the rows, written only where they changed. */
  update(view: MessengerView): void {
    this.setText(this.name[0]!, view.ownName);
    this.setText(this.name[1]!, view.ownName);
    this.setText(this.state, view.stateText);
    this.place(this.ownIcon, ownStateFrame(view.ownState));
    // the server and channel on the Friend and Guild tabs; the campus points on Mentor-Pupil (not kept here: blank)
    this.setText(this.server, this.tab === 2 ? '' : view.serverName);
    this.setText(this.channel, this.tab === 2 ? '' : view.channelName);
    const lists = [view.rows, view.guildRows ?? []];
    const current = lists[Math.min(this.tab, 1)]!;
    if (this.selected >= (this.tab < 2 ? current.length : 0)) this.selected = -1;
    const key = JSON.stringify([lists, this.selected, this.tab]);
    if (key === this.shown) return;
    this.shown = key;
    lists.forEach((rows, tab) => {
      this.listed[tab] = rows;
      const list = this.lists[tab]!;
      const selected = tab === this.tab ? this.selected : -1;
      list.replaceChildren(...rows.map((row, i) => this.rowElement(row, i, view.jobName(row.job), selected)));
      // the rows' full height, so that the list scrolls by rows below its last
      const spacer = this.doc.createElement('div');
      spacer.className = 'hud-messenger-spacer';
      place(spacer, { left: 0, top: 0, width: 1, height: TOP + PITCH * rows.length });
      list.append(spacer);
      this.scrolls[tab]!.draw();
    });
  }

  /** The Friend tab's rows shown (for the tests). */
  get shownRows(): readonly FriendRow[] {
    return this.listed[0]!;
  }

  /** 2026-11-10: the Guild tab's rows shown (for the tests). */
  get shownGuildRows(): readonly FriendRow[] {
    return this.listed[1]!;
  }

  private rowElement(row: FriendRow, index: number, jobName: string, selected: number): HTMLElement {
    const doc = this.doc;
    const element = doc.createElement('div');
    element.className = 'hud-messenger-row';
    element.dataset.index = String(index);
    element.dataset.player = String(row.playerId);
    element.setAttribute('role', 'listitem');
    // the click zone: the list's width less its scroll bar (`OnLButtonUp`, :574)
    place(element, { left: 0, top: TOP + PITCH * index, width: TABS.width - 16, height: PITCH });
    const icon = (left: number, frame: number | null, part: string): void => {
      if (frame === null) return;
      const part1 = this.icon(left, 0, frame);
      part1.dataset.part = part;
      element.append(part1);
    };
    icon(20, channelFrame(row.channel), 'channel');
    icon(76, stateFrame(row.state), 'state');
    const level = doc.createElement('div');
    level.className = 'hud-messenger-text';
    level.dataset.column = 'level';
    level.textContent = String(row.level);
    place(level, { left: 127, top: 3, width: 46, height: 14 });
    element.append(level);
    const jobs = jobFrames(row.job, row.level);
    icon(174, jobs.type, 'jobType');
    icon(194, jobs.job, 'job');
    // the job's tooltip over 188-212 (`OnMouseMove`, :540-565)
    const tip = doc.createElement('div');
    tip.className = 'hud-messenger-tip';
    tip.title = jobName;
    place(tip, { left: 188, top: 0, width: 24, height: PITCH });
    element.append(tip);
    const name = doc.createElement('div');
    name.className = 'hud-messenger-text';
    name.dataset.column = 'name';
    name.textContent = nameText(row.name);
    name.style.color = cssRgb(nameColor(row, index === selected));
    place(name, { left: 226, top: 3, width: 84, height: 14 });
    element.append(name);
    if (index === selected) element.dataset.selected = '';
    return element;
  }

  private press(event: MouseEvent, kind: 'select' | 'open' | 'menu', tab: number): void {
    const target = (event.target as Element | null)?.closest?.('.hud-messenger-row') as HTMLElement | null;
    const index = target === null ? -1 : Number(target.dataset.index);
    const row = index >= 0 ? this.listed[tab]?.[index] : undefined;
    if (row === undefined) return;
    this.selected = index;
    this.shown = '';
    if (kind === 'open') this.onOpen(row);
    if (kind === 'menu') {
      const layer = this.frame.element.parentElement?.getBoundingClientRect();
      this.onMenu(row, { x: Math.round(event.clientX - (layer?.left ?? 0)), y: Math.round(event.clientY - (layer?.top ?? 0)) }, tab);
    }
  }

  private icon(left: number, top: number, frame?: number): HTMLElement {
    const element = this.doc.createElement('div');
    element.className = 'hud-messenger-icon';
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.backgroundImage = themeUrl(this.art, 'icon_PlayerData.dds');
    if (frame !== undefined) this.place(element, frame);
    return element;
  }

  /** A frame of `icon_PlayerData.inc` drawn in `element`. */
  private place(element: HTMLElement, frame: number): void {
    const at = playerDataFrame(frame);
    if (at === null) { element.hidden = true; return; }
    element.hidden = false;
    element.dataset.frame = String(frame);
    element.style.width = `${at.size}px`;
    element.style.height = `${at.size}px`;
    element.style.backgroundPosition = `-${at.x}px -${at.y}px`;
  }

  private label(left: number, top: number): HTMLElement {
    const element = this.doc.createElement('div');
    element.className = 'hud-messenger-own';
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.color = cssRgb(GREY);
    return element;
  }

  private setText(element: HTMLElement, value: string): void {
    if (element.textContent !== value) element.textContent = value;
  }
}
