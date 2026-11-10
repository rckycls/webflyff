// The guild window (2026-11-10, guild research §3, appendix A §2.1-2.6): `CWndGuild`, APP_GUILD 323, opened by G and by
// Start → Guild, and its five tabs.
//
//   resdata.inc APP_GUILD                Resource/resdata.inc:5243-5263    "WndTile07.tga" tiled, 448 x 368, "Guild Window":
//                                                                          WIDC_TABCTRL1 18,6-434,330
//   CWndGuild::OnInitialUpdate           _Interface/WndGuild.cpp:42-113    the tabs, each page at left 5, top 0; centred
//   tab 0 CWndGuildTabInfo  APP_GUILD_TABINFO 325        resdata.inc:5060-5242   WndGuildTabInfo.cpp:396-618
//   tab 1 CWndGuildTabMember APP_GUILD_TABMEMBER_EX 698  resdata.inc:14892-14948 WndGuildTabMember.cpp:218-981
//   tab 2 CWndGuildTabApp   APP_GUILD_TABAPPELLATION 329 resdata.inc:5531-6064   WndGuildTabApp.cpp:30-712
//   tab 3 CWndGuildTabWar   APP_GUILD_TABGUILDWAR 343    resdata.inc:7355-7501   WndGuildTabWar.cpp:39-210
//   tab 4 CWndGuildTabPower APP_GUILD_TAPPOWER 864       resdata.inc:4463-4627   WndGuildTabPower.cpp:41-267
//
// Each page is its resdata.inc entry (a ResWindow's controls, moved into the page). The member list is drawn as Neuz
// draws it: 18 px rows, the rank icons, the job icons, the level, the name and the nickname, offline members grey.
// The Guild Duel tab's three buttons wait for the guild-war milestone (their windows, `CWndGuildWarDecl` ..., are not in
// this branch): they are shown disabled.

import type { UiArt } from '../art';
import { cssRgb, themeUrl } from '../art';
import { pictureButton, place } from '../button';
import type { ControlRect } from '../button';
import { WindowFrame } from '../frame';
import { ResWindow, textScrollBar } from '../resWindow';
import type { ResControl, ResLayout, TextScrollBar } from '../resWindow';
import { sixFrameButton } from '../radio';
import type { RadioButton } from '../radio';
import { TAB_TILE, TAB_TILE_HEIGHT, chosenTabTiles, tabStripTiles } from '../tiles';
import { phoneWords } from './guildDialogs';
import { jobFrames, playerDataFrame } from '../../friends/friendRules';
import type { Guild } from '../../guild/guildBook';
import {
  GuildRank, POWER_ROWS, RANK_NAMES, TITLE_ROWS, logoKey, maxOfRank, memberColor, memberName, rankCount, rankIcons,
} from '../../guild/guildRules';
import type { MemberRow, MemberSortKey } from '../../guild/guildRules';

const WIDTH = 448;
const HEIGHT = 368;
/** WIDC_TABCTRL1 (resdata.inc:5253): 18,6-434,330. */
const TABS: ControlRect = { left: 18, top: 6, width: 416, height: 324 };
/** A page's place in the tab control: left 5, top 0 (`WndGuild.cpp:51-53`). */
const PAGE_LEFT = TABS.left + 5;
const TAB_TITLES: ReadonlyArray<[string, string]> = [
  ['TID_GAME_TOOLTIP_GUILDINFO', 'Information'], ['TID_GAME_TOOLTIP_GUILDMEMBER', 'Member'],
  ['TID_GAME_TOOLTIP_APPELLATION', 'Title'], ['TID_GAME_TOOLTIP_GUILDWAR', 'Guild Duel'], ['TID_GAME_TOOLTIP_AGIT', 'Permissions'],
];

const INFO: ResLayout = {
  title: 'Information Window', width: 404, height: 300,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [6, 6, 72, 26], text: 'Name' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [6, 24, 72, 44], text: 'Master' },
    { kind: 'static', id: 'WIDC_STATIC3', rect: [6, 42, 72, 62], text: 'Exp' },
    { kind: 'static', id: 'WIDC_STATIC4', rect: [6, 60, 72, 80], text: 'Penya' },
    { kind: 'static', id: 'WIDC_STATIC5', rect: [236, 6, 302, 26], text: 'Level' },
    { kind: 'static', id: 'WIDC_STATIC6', rect: [236, 24, 302, 44], text: 'Member' },
    { kind: 'static', id: 'WIDC_STATIC7', rect: [236, 42, 302, 62], text: 'Logo' },
    { kind: 'text', id: 'WIDC_TEXT1', rect: [6, 84, 378, 254], tile: 'WndEditTile00.tga' },
    { kind: 'static', id: 'WIDC_GUILDLEVEL', rect: [304, 6, 359, 22], text: '0' },
    { kind: 'static', id: 'WIDC_GUILDMASTER', rect: [66, 24, 166, 44] },
    { kind: 'static', id: 'WIDC_GUILDEXPMERIT', rect: [66, 42, 166, 62], text: '0' },
    { kind: 'static', id: 'WIDC_GUILDPENYAMERIT', rect: [66, 60, 166, 80], text: '0' },
    { kind: 'static', id: 'WIDC_GUILDNAME', rect: [66, 6, 166, 26] },
    { kind: 'static', id: 'WIDC_GUILDNUMBER', rect: [304, 24, 359, 40], text: '0/0' },
    { kind: 'custom', id: 'WIDC_CUSTOM1', rect: [308, 46, 332, 70] },
    { kind: 'button', id: 'WIDC_BUTTON4', rect: [12, 262, 84, 282], picture: 'ButtName.BMP', label: 'Setup Guild Name', quarter: 72 },
    { kind: 'button', id: 'WIDC_BUTTON1', rect: [106, 262, 178, 282], picture: 'ButtNotice.BMP', label: 'Setup Notice', quarter: 72 },
    { kind: 'button', id: 'WIDC_BUTTON2', rect: [200, 262, 272, 282], picture: 'ButtSetlogo.BMP', label: 'Setup Logo', quarter: 72 },
    { kind: 'button', id: 'WIDC_BUTTON3', rect: [294, 262, 366, 282], picture: 'ButtDismiss.BMP', label: 'Disband Guild', quarter: 72 },
  ],
};
const INFO_TIPS: Record<string, string> = {
  WIDC_BUTTON4: "This establishes your guild's name. It can be done only once.", WIDC_BUTTON1: 'Setup Guild Notice',
  WIDC_BUTTON2: 'Setup Guild Logo', WIDC_BUTTON3: 'Disband Guild',
};

/** The member tab's heads (resdata.inc:14902-14938), each picture four states of its own width. */
const MEMBER_HEADS: ReadonlyArray<[MemberSortKey, string, string, ControlRect]> = [
  ['rank', 'Title', 'ButtGuildMemberTabMLevel.bmp', { left: 8, top: 4, width: 47, height: 20 }],
  ['job', 'Job', 'ButtGuildMemberTabJob.bmp', { left: 66, top: 4, width: 47, height: 20 }],
  ['level', 'Level', 'ButtGuildMemberTabLevel.bmp', { left: 124, top: 4, width: 40, height: 20 }],
  ['name', 'Character', 'ButtGuildMemberTabChar.bmp', { left: 174, top: 4, width: 85, height: 20 }],
  ['alias', 'Nickname', 'ButtGuildMemberTabAlias.bmp', { left: 270, top: 4, width: 85, height: 20 }],
];
/** `MAX_MEMBER_LIST_DRAW` 14 rows of 18 px; the first text at sy 32, the hit rects from 30 (`:25-26`, `:772-810`). */
const ROWS = 14;
const PITCH = 18;
const LIST_TOP = 28;
/** The scroll bar at width - 40 .. width - 25, from y 40 (`OnSize`, :666-681). */
const LIST_RECT: ControlRect = { left: 0, top: LIST_TOP, width: 380, height: ROWS * PITCH + 10 };

const TITLE_COLUMNS = [58, 124, 190, 256, 322];
const TITLE_CHECK_LEFT = [72, 138, 204, 270, 336];
const TITLE_ROW_TOP = [72, 98, 124, 150, 176];
const TITLE_LAYOUT: ResLayout = {
  title: 'Guild Title Management Window', width: 404, height: 304,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [0, 48, 58, 68], text: 'Member' },
    ...TITLE_ROWS.map((row, i): ResControl => ({ kind: 'static', id: `WIDC_STATIC${i + 2}`, rect: [0, TITLE_ROW_TOP[i]!, 58, TITLE_ROW_TOP[i]! + 20], text: row.label })),
    { kind: 'static', id: 'WIDC_STATIC7', rect: [0, 202, 58, 222], text: 'Pay' },
    ...RANK_NAMES.map((name, rank): ResControl => ({
      kind: 'static', id: `WIDC_HEAD_${rank}`, rect: [TITLE_COLUMNS[rank]! - 2, 8, TITLE_COLUMNS[rank]! + 64, 26], text: name,
    })),
    ...RANK_NAMES.map((_, rank): ResControl => ({
      kind: 'static', id: `WIDC_GUILD_NUM_${rank}`, rect: [TITLE_COLUMNS[rank]!, 48, TITLE_COLUMNS[rank]! + 45, 68], text: '00/00',
    })),
    ...RANK_NAMES.map((_, rank): ResControl => ({
      kind: 'static', id: `WIDC_GUILD_PAY_${rank}`, rect: [TITLE_COLUMNS[rank]!, 202, TITLE_COLUMNS[rank]! + 60, 222], text: '0',
    })),
    ...RANK_NAMES.map((name, rank): ResControl => ({
      kind: 'button', id: `WIDC_BUTTON${rank + 1}`, rect: [TITLE_COLUMNS[rank]!, 224, TITLE_COLUMNS[rank]! + 45, 244],
      picture: 'ButtPay.BMP', label: `Setup ${name} pay`, quarter: 45,
    })),
    ...RANK_NAMES.map((_, rank): ResControl => ({
      kind: 'custom', id: `WIDC_CUSTOM${rank + 1}`, rect: [TITLE_COLUMNS[rank]! + 12, 30, TITLE_COLUMNS[rank]! + 28, 46],
    })),
    { kind: 'button', id: 'WIDC_OK', rect: [162, 256, 234, 276], picture: 'ButtOk.tga', label: 'Apply Settings', quarter: 72 },
  ],
};

const WAR: ResLayout = {
  title: 'Guild Duel', width: 404, height: 300,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [6, 6, 90, 26], text: 'Guild Name: ' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [6, 26, 106, 46], text: 'Guild Logo: ' },
    { kind: 'static', id: 'WIDC_STATIC3', rect: [6, 62, 106, 82], text: 'Won: ' },
    { kind: 'static', id: 'WIDC_STATIC4', rect: [6, 82, 106, 102], text: 'Lost: ' },
    { kind: 'static', id: 'WIDC_STATIC5', rect: [6, 102, 106, 122], text: 'Gave Up: ' },
    { kind: 'custom', id: 'WIDC_CUSTOM1', rect: [98, 30, 122, 54] },
    { kind: 'static', id: 'WIDC_GUILDWARGUILDNAME', rect: [100, 6, 200, 22] },
    { kind: 'static', id: 'WIDC_GUILDWARWIN', rect: [110, 62, 210, 82] },
    { kind: 'static', id: 'WIDC_GUILDWARLOSE', rect: [110, 82, 210, 102] },
    { kind: 'static', id: 'WIDC_GUILDWARGIVEUP', rect: [110, 102, 210, 122] },
    // LANG_ENG swaps BUTTON1's picture to ButtGuildDuel.bmp (WndGuildTabWar.cpp:104-110)
    { kind: 'button', id: 'WIDC_BUTTON1', rect: [24, 256, 96, 276], picture: 'ButtGuildDuel.bmp', label: 'Declare Guild Duel', quarter: 72 },
    { kind: 'button', id: 'WIDC_BUTTON2', rect: [152, 256, 224, 276], picture: 'ButtPeace.BMP', label: 'Propose Cease-fire', quarter: 72 },
    { kind: 'button', id: 'WIDC_BUTTON3', rect: [272, 256, 344, 276], picture: 'ButtGiveUp.BMP', label: 'Give Up Guild Duel', quarter: 72 },
    { kind: 'static', id: 'WIDC_STATIC6', rect: [6, 124, 106, 142], text: 'Time Left' },
    { kind: 'static', id: 'WIDC_GUILDWARLEFTTIME', rect: [110, 124, 210, 142] },
  ],
};

/** The Permissions tab's columns (Kingpin to Rookie) and rows (resdata.inc:4473-4617). */
const POWER_COLUMNS: ReadonlyArray<[rank: number, head: ResControl['rect'], check: number]> = [
  [GuildRank.KINGPIN, [100, 30, 144, 46], 110], [GuildRank.CAPTAIN, [166, 30, 212, 46], 176],
  [GuildRank.SUPPORTER, [238, 30, 286, 46], 250], [GuildRank.ROOKIE, [322, 30, 358, 46], 330],
];
const POWER_ROW_TOP = [92, 152];
const POWER_LAYOUT: ResLayout = {
  title: 'Permissions', width: 404, height: 304,
  controls: [
    ...POWER_COLUMNS.map(([rank, rect]): ResControl => ({ kind: 'static', id: `WIDC_HEAD_${rank}`, rect, text: RANK_NAMES[rank] })),
    { kind: 'static', id: 'WIDC_STATIC11111', rect: [8, 88, 64, 106], text: 'Furniture' },
    { kind: 'static', id: 'WIDC_STATIC111111', rect: [8, 106, 72, 124], text: 'Teleporter' },
    { kind: 'static', id: 'WIDC_STATIC1111111', rect: [8, 148, 82, 164], text: 'Maintenance Fee' },
    { kind: 'button', id: 'WIDC_BUTTON1', rect: [70, 220, 166, 244], picture: 'ButtOk.tga', label: 'OK', quarter: 72 },
    { kind: 'button', id: 'WIDC_BUTTON11', rect: [230, 220, 326, 244], picture: 'ButtCancel.tga', label: 'CANCEL', quarter: 72 },
  ],
};

/** What the window draws from: the own guild (null without one) and what goes with it. */
export interface GuildView {
  guild: Guild | null;
  ownPlayerId: number;
  /** The master's name (`CPlayerDataCenter::GetPlayerString( m_idMaster )`). */
  masterName: string;
  /** The member tab's rows, in their order. */
  rows: readonly MemberRow[];
  /** The rights as the Title and Permissions tabs show them (the master's edits not yet applied). */
  draft: readonly number[];
  /** The Permissions tab has a change to apply. */
  powerChanged: boolean;
  /** The enemy guild of a war: its name and logo, and the war's time left ("%H:%M:%S"), or blanks. */
  enemyName: string;
  enemyLogo: number;
  warLeft: string;
  /** The tooltip of a row. */
  tipOf(row: MemberRow): string;
}

export type InfoButton = 'name' | 'notice' | 'logo' | 'disband';

export class GuildWindow {
  readonly frame: WindowFrame;
  onInfo: (button: InfoButton) => void = () => {};
  onSort: (key: MemberSortKey) => void = () => {};
  /** A member's menu (a right click, or a tap on a phone), at this point of the window layer. */
  onMemberMenu: (row: MemberRow, at: { x: number; y: number }) => void = () => {};
  /** A right's check box pressed: the rank and its bit. */
  onToggle: (rank: number, bit: number) => void = () => {};
  /** The Title tab's Apply Settings, and the Permissions tab's OK: the draft sent. */
  onApply: () => void = () => {};
  /** A salary's Setup: the rank. */
  onPay: (rank: number) => void = () => {};
  /** The chosen member (`m_nSelect`, kept by the player's id so a refresh does not move it to another member). */
  selected: number | null = null;
  private tab = 0;
  private readonly tabTiles: HTMLElement;
  private readonly pages: HTMLElement[] = [];
  private readonly info: ResWindow;
  private readonly title: ResWindow;
  private readonly war: ResWindow;
  private readonly power: ResWindow;
  private readonly list: HTMLElement;
  private readonly scroll: TextScrollBar;
  private readonly titleChecks: RadioButton[][] = [];
  private readonly powerChecks: Array<{ rank: number; bit: number; check: RadioButton }> = [];
  private readonly heads: HTMLButtonElement[] = [];
  private readonly rankIconCells: HTMLElement[] = [];
  private rows: readonly MemberRow[] = [];
  private shown = '';

  constructor(
    private readonly art: UiArt,
    private readonly text: (id: string, english: string) => string,
    private readonly url: (key: string) => string,
    private readonly doc: Document = document,
  ) {
    const frame = new WindowFrame('Guild Window', art, { width: WIDTH, height: HEIGHT, mobileScale: 1, fitWhole: true }, doc);
    frame.element.classList.add('hud-guild');
    this.frame = frame;

    this.info = this.page(INFO, 'info');
    for (const [id, tip] of Object.entries(INFO_TIPS)) this.info.button(id).title = tip;
    const infoButtons: Array<[string, InfoButton]> = [['WIDC_BUTTON4', 'name'], ['WIDC_BUTTON1', 'notice'], ['WIDC_BUTTON2', 'logo'], ['WIDC_BUTTON3', 'disband']];
    for (const [id, button] of infoButtons) this.info.button(id).addEventListener('click', () => this.onInfo(button));

    // the member tab: its heads, the list and its scroll bar
    const member = this.doc.createElement('div');
    member.className = 'hud-guild-page';
    member.dataset.page = 'member';
    for (const [key, label, picture, rect] of MEMBER_HEADS) {
      const head = pictureButton(doc, art, picture, rect, rect.width, () => this.onSort(key));
      head.dataset.sort = key;
      head.dataset.word = label;
      head.setAttribute('aria-label', label);
      this.heads.push(head);
      member.append(head);
    }
    this.list = doc.createElement('div');
    this.list.className = 'hud-guild-members';
    this.list.setAttribute('role', 'list');
    place(this.list, { left: 0, top: LIST_TOP, width: LIST_RECT.width - 16, height: LIST_RECT.height });
    this.list.addEventListener('scroll', () => {
      const snapped = Math.round(this.list.scrollTop / PITCH) * PITCH;
      if (snapped !== this.list.scrollTop) this.list.scrollTop = snapped;
    });
    this.list.addEventListener('click', (event) => this.press(event, phone(doc) ? 'menu' : 'select'));
    this.list.addEventListener('contextmenu', (event) => { event.preventDefault(); this.press(event, 'menu'); });
    this.scroll = textScrollBar(doc, art, this.list, LIST_RECT);
    member.append(this.list, this.scroll.element);
    this.mount(member);

    this.title = this.pageOnly(TITLE_LAYOUT);
    for (let rank = 0; rank < RANK_NAMES.length; rank++) {
      this.title.button(`WIDC_BUTTON${rank + 1}`).addEventListener('click', () => this.onPay(rank));
      // the rank's icon: icon_IconMessenger frame 49 + rank, 16 x 16 at (1 + 16k, 141) (`OnDraw`, :30-53)
      const icon = this.title.control(`WIDC_CUSTOM${rank + 1}`);
      icon.classList.add('hud-guild-rank-icon');
      icon.style.backgroundImage = themeUrl(art, 'icon_IconMessenger.dds');
      icon.style.backgroundPosition = `-${1 + 16 * rank}px -141px`;
      this.rankIconCells.push(icon);
      this.titleChecks.push(TITLE_ROWS.map((row, i) => {
        const check = sixFrameButton(doc, art, 'ButtCheck.bmp', 14, { left: TITLE_CHECK_LEFT[rank]!, top: TITLE_ROW_TOP[i]!, width: 18, height: 16 },
          { role: 'checkbox', name: `${RANK_NAMES[rank]} ${row.label}` }, () => this.onToggle(rank, row.bit));
        check.element.dataset.rank = String(rank);
        check.element.dataset.bit = String(row.bit);
        this.title.frame.body.append(check.element);
        return check;
      }));
    }
    this.title.button('WIDC_OK').addEventListener('click', () => this.onApply());
    this.moveInto('title', this.title);

    this.war = this.page(WAR, 'war');
    for (const id of ['WIDC_BUTTON1', 'WIDC_BUTTON2', 'WIDC_BUTTON3']) this.war.button(id).disabled = true;

    this.power = this.pageOnly(POWER_LAYOUT);
    for (const [rank, , left] of POWER_COLUMNS) {
      POWER_ROWS.forEach((row, i) => {
        const check = sixFrameButton(doc, art, 'ButtCheck.bmp', 14, { left, top: POWER_ROW_TOP[i]!, width: 14, height: 14 },
          { role: 'checkbox', name: `${RANK_NAMES[rank]} ${row.label}` }, () => this.onToggle(rank, row.bit));
        check.element.dataset.rank = String(rank);
        check.element.dataset.bit = String(row.bit);
        this.power.frame.body.append(check.element);
        this.powerChecks.push({ rank, bit: row.bit, check });
      });
    }
    this.power.button('WIDC_BUTTON1').addEventListener('click', () => this.onApply());
    this.power.button('WIDC_BUTTON11').disabled = true; // always (WndGuildTabPower.cpp:108-110)
    this.moveInto('power', this.power);

    this.tabTiles = doc.createElement('div');
    this.tabTiles.className = 'hud-guild-tabs';
    place(this.tabTiles, { left: TABS.left, top: TABS.top + TABS.height - TAB_TILE_HEIGHT, width: TABS.width, height: TAB_TILE_HEIGHT });
    frame.body.append(this.tabTiles);
    this.showTab(0);
  }

  get currentTab(): number {
    return this.tab;
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** The chosen tab (`SetCurTab`, :164-170). */
  showTab(tab: number): void {
    this.tab = tab;
    this.pages.forEach((page, i) => { page.hidden = i !== tab; });
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
      title.className = 'hud-guild-tab';
      title.dataset.tab = String(i);
      title.setAttribute('aria-pressed', String(i === tab));
      title.textContent = this.text(id, english);
      place(title, { left: i * length, top: 0, width: length, height: TAB_TILE_HEIGHT });
      title.addEventListener('click', () => this.showTab(i));
      return title;
    });
    this.tabTiles.replaceChildren(...tiles, ...titles);
    this.scroll.draw();
  }

  /** The tabs' `UpdateData`, written only where they changed. */
  update(view: GuildView): void {
    const key = JSON.stringify([view, this.selected, view.rows]);
    if (key === this.shown) return;
    this.shown = key;
    this.updateInfo(view);
    this.updateMembers(view);
    this.updateTitle(view);
    this.updateWar(view);
    this.updatePower(view);
  }

  /** The rows shown (for the tests). */
  get shownRows(): readonly MemberRow[] {
    return this.rows;
  }

  private updateInfo({ guild, masterName }: GuildView): void {
    const info = this.info;
    info.setText('WIDC_GUILDNAME', guild?.name ?? '');
    info.setText('WIDC_GUILDLEVEL', guild === null ? '' : String(guild.level));
    info.setText('WIDC_GUILDMASTER', guild === null ? '' : masterName);
    info.setText('WIDC_GUILDNUMBER', guild === null ? '' : `${guild.members.size} / ${maxOfRank(GuildRank.ROOKIE, guild.level)}`);
    info.setText('WIDC_GUILDEXPMERIT', guild === null ? '' : String(guild.contributionPxp));
    info.setText('WIDC_GUILDPENYAMERIT', guild === null ? '' : String(guild.gold));
    info.setText('WIDC_TEXT1', guild?.notice ?? '');
    this.logo(info.control('WIDC_CUSTOM1'), guild?.logo ?? 0);
  }

  private updateMembers(view: GuildView): void {
    this.rows = view.rows;
    if (this.selected !== null && !view.rows.some((row) => row.playerId === this.selected)) this.selected = null;
    this.list.replaceChildren(...view.rows.map((row, i) => this.rowElement(row, i, view.tipOf(row))));
    const spacer = this.doc.createElement('div');
    spacer.className = 'hud-guild-spacer';
    place(spacer, { left: 0, top: 0, width: 1, height: Math.max(PITCH * view.rows.length, 1) });
    this.list.append(spacer);
    this.scroll.draw();
  }

  private updateTitle({ guild, ownPlayerId, draft }: GuildView): void {
    const master = guild !== null && guild.masterId === ownPlayerId;
    for (let rank = 0; rank < RANK_NAMES.length; rank++) {
      const count = guild === null ? 0 : [...guild.members.values()].filter((m) => m.rank === rank).length;
      this.title.setText(`WIDC_GUILD_NUM_${rank}`, rankCount(count, guild === null ? 0 : maxOfRank(rank, guild.level)));
      this.title.setText(`WIDC_GUILD_PAY_${rank}`, String(guild?.penya[rank] ?? 0));
      this.title.button(`WIDC_BUTTON${rank + 1}`).disabled = !master;
      this.titleChecks[rank]!.forEach((check, i) => {
        check.checked = ((draft[rank] ?? 0) & TITLE_ROWS[i]!.bit) !== 0;
        // the Master column is always disabled (:700-711)
        check.disabled = !master || rank === GuildRank.MASTER;
      });
    }
    this.title.button('WIDC_OK').disabled = !master;
  }

  private updateWar({ guild, enemyName, enemyLogo, warLeft }: GuildView): void {
    const war = this.war;
    war.setText('WIDC_GUILDWARGUILDNAME', enemyName);
    war.setText('WIDC_GUILDWARWIN', guild === null ? '' : String(guild.win));
    war.setText('WIDC_GUILDWARLOSE', guild === null ? '' : String(guild.lose));
    war.setText('WIDC_GUILDWARGIVEUP', guild === null ? '' : String(guild.surrender));
    war.setText('WIDC_GUILDWARLEFTTIME', warLeft);
    this.logo(war.control('WIDC_CUSTOM1'), enemyLogo);
  }

  private updatePower({ guild, ownPlayerId, draft, powerChanged }: GuildView): void {
    const master = guild !== null && guild.masterId === ownPlayerId;
    for (const { rank, bit, check } of this.powerChecks) {
      check.checked = ((draft[rank] ?? 0) & bit) !== 0;
      check.disabled = !master;
    }
    this.power.button('WIDC_BUTTON1').disabled = !master || !powerChanged;
  }

  /** A logo drawn opaque at the box's top left (`OnDraw`, SRCBLEND ONE / DESTBLEND ZERO), or nothing. */
  private logo(box: HTMLElement, logo: number): void {
    const src = logo === 0 ? '' : this.url(logoKey(logo));
    box.style.backgroundImage = src === '' ? '' : `url("${src}")`;
    box.dataset.logo = String(logo);
  }

  private rowElement(row: MemberRow, index: number, tip: string): HTMLElement {
    const doc = this.doc;
    const element = doc.createElement('div');
    element.className = 'hud-guild-member';
    element.dataset.index = String(index);
    element.dataset.player = String(row.playerId);
    element.setAttribute('role', 'listitem');
    element.title = tip;
    const selected = row.playerId === this.selected;
    if (selected) element.dataset.selected = '';
    if (!row.online) element.dataset.offline = '';
    place(element, { left: 0, top: PITCH * index, width: LIST_RECT.width - 16, height: PITCH });
    for (const icon of rankIcons(row.rank, row.rankClass)) element.append(this.icon(icon.left, 0, icon.frame, 'rank'));
    const jobs = jobFrames(row.job, row.level);
    if (jobs.type !== null) element.append(this.icon(72, 1, jobs.type, 'jobType', !row.online));
    element.append(this.icon(92, 1, jobs.job, 'job', !row.online));
    const color = cssRgb(memberColor(row, selected));
    element.append(this.cell(134, 40, String(row.level), 'level', color), this.cell(176, 92, memberName(row.name), 'name', color),
      this.cell(272, 88, row.alias, 'alias', color));
    return element;
  }

  private cell(left: number, width: number, text: string, column: string, color: string): HTMLElement {
    const cell = this.doc.createElement('div');
    cell.className = 'hud-guild-member-text';
    cell.dataset.column = column;
    cell.textContent = text;
    cell.style.color = color;
    place(cell, { left, top: 2, width, height: 14 });
    return cell;
  }

  /** A frame of `icon_PlayerData.inc`; an offline member's job icons tinted red (0xffff6464, :339-344). */
  private icon(left: number, top: number, frame: number, part: string, offline = false): HTMLElement {
    const element = this.doc.createElement('div');
    element.className = 'hud-guild-icon';
    element.dataset.part = part;
    element.dataset.frame = String(frame);
    if (offline) element.dataset.tint = '';
    const at = playerDataFrame(frame);
    element.style.backgroundImage = themeUrl(this.art, 'icon_PlayerData.dds');
    if (at === null) element.hidden = true;
    else {
      place(element, { left, top, width: at.size, height: at.size });
      element.style.backgroundPosition = `-${at.x}px -${at.y}px`;
    }
    return element;
  }

  private press(event: MouseEvent, kind: 'select' | 'menu'): void {
    const target = (event.target as Element | null)?.closest?.('.hud-guild-member') as HTMLElement | null;
    const row = target === null ? undefined : this.rows[Number(target.dataset.index)];
    if (row === undefined) return;
    this.selected = row.playerId;
    this.shown = '';
    for (const element of this.list.querySelectorAll<HTMLElement>('.hud-guild-member')) {
      element.toggleAttribute('data-selected', element.dataset.player === String(row.playerId));
    }
    if (kind === 'menu') {
      const layer = this.frame.element.parentElement?.getBoundingClientRect();
      this.onMemberMenu(row, { x: Math.round(event.clientX - (layer?.left ?? 0)), y: Math.round(event.clientY - (layer?.top ?? 0)) });
    }
  }

  /** A page from its layout (its ResWindow's controls), mounted in the tab control. */
  private page(layout: ResLayout, name: string): ResWindow {
    const window = this.pageOnly(layout);
    this.moveInto(name, window);
    return window;
  }

  private pageOnly(layout: ResLayout): ResWindow {
    const window = new ResWindow(layout, this.art, this.doc);
    phoneWords(window);
    return window;
  }

  private moveInto(name: string, window: ResWindow): void {
    const page = this.doc.createElement('div');
    page.className = 'hud-guild-page';
    page.dataset.page = name;
    page.append(...Array.from(window.frame.body.children));
    this.mount(page);
  }

  private mount(page: HTMLElement): void {
    place(page, { left: PAGE_LEFT, top: TABS.top, width: 404, height: TABS.height - TAB_TILE_HEIGHT });
    this.pages.push(page);
    this.frame.body.append(page);
  }
}

/** The phone rule (`(max-width: 1000px) and (pointer: coarse)`, frame.ts's). */
function phone(doc: Document): boolean {
  return doc.defaultView?.matchMedia?.('(max-width: 1000px) and (pointer: coarse)').matches === true;
}
