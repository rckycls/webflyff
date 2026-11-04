// The party window (Piece 7 M4, [R §7.2]): `CWndParty`, APP_PARTY, opened by P and Start → Party.
//
//   resdata.inc APP_PARTY         Resource/resdata.inc:21393-21602   "WndTile07.tga" tiled, 448 x 336, "Party": the group
//                                                                    boxes, the statics and their values, the radios,
//                                                                    WIDC_TABCTRL1 10,118-448,266, the four buttons
//   CWndParty::OnInitialUpdate    _Interface/WndParty.cpp:226-268    the tabs "Information" and "Skill" (TID_APP_INFOMATION,
//                                                                    TID_APP_SKILL), panels in the tab control's area less
//                                                                    its 18 px strip; centred (MoveParentCenter, :267)
//   CWndParty::OnDraw             WndParty.cpp:64-214                every frame: the name ("Party", the party's name or
//                                                                    "Advance Party"), the level, the EXP "%.2f %%", the
//                                                                    points, the modes' radios, the buttons' states
//   CWndPartyInfo                 WndParty.cpp:502-824               the member list (`memberList.ts`)
//
// The tab control ends at x 448, past the 436 px client area: it is cut at the client area's edge (ledger ruling). On a
// phone the window is fitted whole on the screen (`fitWhole`), as the Character window is (plan Decisions 10).

import type { Texts } from '../../gameData';
import { handOverCheck, leaveTarget, modeChoice, partyExpText } from '../../party/partyRules';
import type { UiArt } from '../art';
import { themeUrl } from '../art';
import { pictureButton, place } from '../button';
import { radioButton } from '../radio';
import type { RadioButton } from '../radio';
import type { ControlRect } from '../button';
import { WindowFrame } from '../frame';
import { TAB_TILE, TAB_TILE_HEIGHT, chosenTabTiles, tabStripTiles } from '../tiles';
import { MemberList, memberRows } from './memberList';
import type { PartyView } from './memberList';
import { PartySkillTab } from './partySkillTab';

const WIDTH = 448;
const HEIGHT = 336;
/** The applet's title (IDS_RESDATA_INC_002674). */
const TITLE = 'Party';
/** The client area of a window with a caption: 448 − 4 − 8 wide. */
const CLIENT_WIDTH = WIDTH - 12;
/** WIDC_TABCTRL1 (resdata.inc:21556), cut at the client area's right edge. */
const TABS: ControlRect = { left: 10, top: 118, width: CLIENT_WIDTH - 10, height: 148 };
/** The strip of tabs at the tab control's bottom. */
const STRIP = 18;
/** The group boxes, the labels and the values (resdata.inc:21403-21547). */
const GROUPS: ReadonlyArray<[string, ControlRect]> = [
  ['Party Information', { left: 8, top: 8, width: 138, height: 18 }],
  ['EXP Share', { left: 190, top: 8, width: 92, height: 20 }],
  ['Distribute Item', { left: 316, top: 8, width: 114, height: 20 }],
];
const LABELS: ReadonlyArray<[string, ControlRect]> = [
  ['Name', { left: 8, top: 34, width: 64, height: 18 }],
  ['Level', { left: 8, top: 54, width: 64, height: 20 }],
  ['Exp', { left: 8, top: 74, width: 68, height: 20 }],
  ['Points', { left: 8, top: 94, width: 68, height: 16 }],
];
const VALUES: ReadonlyArray<[string, ControlRect]> = [
  ['name', { left: 78, top: 34, width: 72, height: 16 }],
  ['level', { left: 78, top: 54, width: 72, height: 16 }],
  ['exp', { left: 78, top: 74, width: 64, height: 16 }],
  ['point', { left: 78, top: 94, width: 64, height: 16 }],
];
const TAB_TITLES: ReadonlyArray<[string, string]> = [['TID_APP_INFOMATION', 'Information'], ['TID_APP_SKILL', 'Skill']];
/** The buttons (resdata.inc:21565-21600): 288 x 20 pictures of four 72 px states; WIDC_BUTTON2 has none (a 10 x 10 box). */
const BUTTONS: ReadonlyArray<[string, string, string, ControlRect]> = [
  ['leave', 'Leave', 'ButtLeave.bmp', { left: 184, top: 276, width: 72, height: 20 }],
  ['change', 'Change', 'ButtChange.bmp', { left: 306, top: 276, width: 72, height: 20 }],
  ['handOver', 'Hand Over Party Leader', 'ButtTransper.bmp', { left: 54, top: 276, width: 72, height: 20 }],
];
const QUICK: ControlRect = { left: 418, top: 286, width: 10, height: 10 };
/** The mode radios (resdata.inc:21430-21483), item modes 0-3 and EXP modes 0-1. */
const RADIOS: ReadonlyArray<['item' | 'exp', number, string, ControlRect]> = [
  ['item', 0, 'Individually', { left: 316, top: 34, width: 114, height: 16 }],
  ['item', 1, 'Sequentially', { left: 316, top: 54, width: 114, height: 16 }],
  ['item', 2, 'Manually', { left: 316, top: 74, width: 114, height: 16 }],
  ['item', 3, 'Randomly', { left: 316, top: 94, width: 114, height: 16 }],
  ['exp', 0, 'Level', { left: 190, top: 32, width: 118, height: 16 }],
  ['exp', 1, 'Contribution', { left: 190, top: 54, width: 118, height: 16 }],
];
/** The party level the advanced party needs (`WndParty.cpp:90-93`). */
const TROUP_LEVEL = 10;

export class PartyWindow {
  readonly frame: WindowFrame;
  /** The selected member's player id, or null. */
  selected: number | null = null;
  /** True while a press may not select (the auto-attack, the task bar running: `OnLButtonDown`, :785-789). */
  ignoreClicks = false;
  /** A member pressed in view becomes the target (its id), or the target goes (null: the own row, or outside the rows). */
  onTarget: (playerId: number | null) => void = () => {};
  /** The panels of the tabs: 0 the member list, 1 the party skills. */
  readonly panels: HTMLElement[];
  /** The Skill tab's grid (`CWndPartySkill`). */
  readonly skillTab: PartySkillTab;
  /** Leave: the member to remove (`leaveTarget`) and whether that is a kick; the screen opens the leave box. */
  onLeave: (leaveId: number, kick: boolean) => void = () => {};
  onHandOver: (playerId: number) => void = () => {};
  /** Change, for a normal party: the screen opens the convert box. */
  onChangeTroup: () => void = () => {};
  /** The small button: the quick view on or off. */
  onQuick: () => void = () => {};
  onItemMode: (mode: number) => void = () => {};
  onExpMode: (mode: number) => void = () => {};
  /** A chat line (TID) or a message box (TID) the window's rules give. */
  onLine: (tid: string) => void = () => {};
  onBox: (tid: string) => void = () => {};
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly radios: Array<{ kind: 'item' | 'exp'; value: number; radio: RadioButton }> = [];
  private readonly members: MemberList;
  private readonly values = new Map<string, HTMLElement>();
  private view: PartyView | null = null;
  private tab = 0;
  private readonly tabTiles: HTMLElement;

  constructor(private readonly art: UiArt, private readonly texts: Texts, private readonly doc: Document = document) {
    const mobile = doc.defaultView?.matchMedia?.('(max-width: 1000px) and (pointer: coarse)').matches === true;
    const frame = new WindowFrame(TITLE, art, mobile
      ? { width: WIDTH, height: HEIGHT, mobileScale: 1, fitWhole: true }
      : { width: WIDTH, height: HEIGHT }, doc);
    frame.element.classList.add('hud-party');
    const body = frame.body;
    for (const [title, rect] of GROUPS) body.append(this.label('hud-party-group', title, rect));
    for (const [title, rect] of LABELS) body.append(this.label('hud-party-label', title, rect));
    for (const [key, rect] of VALUES) {
      const value = this.label('hud-party-value', '', rect);
      value.dataset.value = key;
      this.values.set(key, value);
      body.append(value);
    }
    const panelRect = { left: TABS.left, top: TABS.top, width: TABS.width, height: TABS.height - STRIP };
    this.members = new MemberList(art, doc);
    this.members.onPress = (playerId) => this.press(playerId);
    const skills = doc.createElement('div');
    skills.className = 'hud-party-skills';
    this.skillTab = new PartySkillTab(art, { width: panelRect.width, height: panelRect.height }, doc);
    skills.append(this.skillTab.element);
    this.panels = [this.members.element, skills];
    for (const panel of this.panels) {
      place(panel, panelRect);
      body.append(panel);
    }
    this.tabTiles = doc.createElement('div');
    this.tabTiles.className = 'hud-party-tabs';
    place(this.tabTiles, { left: TABS.left, top: TABS.top + TABS.height - TAB_TILE_HEIGHT, width: TABS.width, height: TAB_TILE_HEIGHT });
    body.append(this.tabTiles);
    for (const [name, label, picture, rect] of BUTTONS) {
      const button = pictureButton(doc, art, picture, rect, rect.width, () => this.pressButton(name));
      button.dataset.button = name;
      button.setAttribute('aria-label', label);
      button.disabled = true;
      this.buttons.set(name, button);
      body.append(button);
    }
    const quick = doc.createElement('button');
    quick.type = 'button';
    quick.className = 'hud-party-quick';
    quick.dataset.button = 'quick';
    quick.title = 'Simple Party Display.';
    quick.disabled = true;
    place(quick, QUICK);
    quick.addEventListener('click', () => this.pressButton('quick'));
    this.buttons.set('quick', quick);
    body.append(quick);
    for (const [kind, value, label, rect] of RADIOS) {
      const radio = radioButton(doc, art, label, rect, () => this.pressRadio(kind, value));
      radio.element.dataset.radio = `${kind}${value}`;
      this.radios.push({ kind, value, radio });
      body.append(radio.element);
    }
    this.frame = frame;
    this.showTab(0);
  }

  /** The buttons' states and the radios' checks, from the party (`OnDraw`, :66-93, :130-213). */
  private drawControls(view: PartyView): void {
    const party = view.party;
    const two = party.size() >= 2;
    this.buttons.get('leave')!.disabled = !(two || party.level > 1);
    this.buttons.get('handOver')!.disabled = !two;
    this.buttons.get('quick')!.disabled = !two;
    this.buttons.get('change')!.disabled = !(party.isLeader(view.ownPlayerId) && party.level >= TROUP_LEVEL);
    for (const { kind, value, radio } of this.radios) radio.checked = (kind === 'item' ? party.itemMode : party.expMode) === value;
  }

  private pressButton(name: string): void {
    const view = this.view;
    if (view === null) return;
    const party = view.party;
    const own = view.ownPlayerId;
    if (name === 'leave') {
      const leaveId = leaveTarget(party, own, this.selected);
      this.selected = null;
      this.onLeave(leaveId, leaveId !== own);
      this.update(view);
    } else if (name === 'handOver') {
      const result = handOverCheck(party, own, this.selected);
      if (result !== null && 'line' in result) this.onLine(result.line);
      else if (result !== null) this.onHandOver(result.send);
    } else if (name === 'change') {
      if (party.kind === 0) this.onChangeTroup();
    } else if (name === 'quick') {
      if (party.size() >= 2) this.onQuick();
    }
  }

  private pressRadio(kind: 'item' | 'exp', value: number): void {
    const view = this.view;
    if (view === null) return;
    const result = modeChoice(view.party, view.ownPlayerId, kind, value);
    if (result === null) return;
    if ('box' in result) this.onBox(result.box);
    else if (kind === 'item') this.onItemMode(value);
    else this.onExpMode(value);
  }

  /** Every frame while open: the upper half and the rows from the party (`OnDraw`). */
  update(view: PartyView): void {
    this.view = view;
    const party = view.party;
    if (this.selected !== null && !party.isMember(this.selected)) this.selected = null;
    const name = party.kind === 0
      ? this.text('TID_GAME_PARTY1', 'Party')
      : party.name !== '' ? party.name : this.text('TID_GAME_PARTY2', 'Advance Party');
    this.set('name', name);
    this.set('level', String(party.level));
    this.set('exp', view.exp.length > 0 || party.level >= 10 ? partyExpText(party.exp, party.level, view.exp) : '');
    this.set('point', String(party.point));
    this.members.update(memberRows(view, this.selected, this.texts));
    if (this.tab === 1) this.skillTab.update(party, view.catalog ?? null);
    this.drawControls(view);
  }

  /** The chosen tab: 0 "Information", 1 "Skill". */
  showTab(tab: number): void {
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
      title.className = 'hud-party-tab';
      title.dataset.tab = String(i);
      title.setAttribute('aria-pressed', String(i === tab));
      title.textContent = this.text(id, english);
      place(title, { left: i * length, top: 0, width: length, height: TAB_TILE_HEIGHT });
      title.addEventListener('click', () => this.showTab(i));
      return title;
    });
    this.tabTiles.replaceChildren(...tiles, ...titles);
  }

  get currentTab(): number {
    return this.tab;
  }

  private press(playerId: number | null): void {
    if (this.ignoreClicks) return;
    const view = this.view;
    this.selected = playerId;
    if (playerId === null) {
      this.onTarget(null);
    } else if (playerId === view?.ownPlayerId) {
      this.onTarget(null);
    } else if (view?.members.find((member) => member.playerId === playerId)?.inView === true) {
      this.onTarget(playerId);
    }
    if (view !== null) this.update(view);
  }

  private label(cls: string, text: string, rect: ControlRect): HTMLElement {
    const element = this.doc.createElement('div');
    element.className = cls;
    element.textContent = text;
    place(element, rect);
    return element;
  }

  private set(key: string, value: string): void {
    const element = this.values.get(key)!;
    if (element.textContent !== value) element.textContent = value;
  }

  private text(id: string, english: string): string {
    return this.texts.get(id)?.text ?? english;
  }
}
