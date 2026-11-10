// The quest window and its detail (Piece 7 M1), drawn as V15 draws them (2026-11-11, the owner's request; the comparison is
// docs/2026-11-11-quest-window-research.md):
//
//   resdata.inc APP_QUEST_EX_LIST   Resource/resdata.inc:4076-4126  "WndTile00.tga" tiled, 336 x 416, "Quest": the "Quest
//                                                                   List" bar 16,8-192,24 (WndEditTile200, 0x2220051), the
//                                                                   tab control 16,28-320,328, the remove button
//                                                                   ("ButtRemoveQuest.bmp") 16,356-156,376, the filter combo
//                                                                   174,332-304,348, the close button ("ButtClose.tga")
//                                                                   232,356-304,376
//   resdata.inc APP_QUEST_EX_DETAIL :2795-2858                      272 x 416, no title (resData.txt.txt:6719): the bars
//                                                                   "Quest Contents" 12,8, "Requirement" 12,160, "Reward"
//                                                                   12,272 (160 x 16); the texts 12,28-252,156 and
//                                                                   12,292-252,374 and the condition tree 12,180-252,274, each
//                                                                   on WndEditTile00 with a scroll bar (0x20020000)
//   CStatic group box               _Interface/WndControl.cpp:53-112  white, centred both ways, drawn twice 1 px apart
//   CWndTabCtrl                     WndControl.cpp:4183-4458        the edit tiles 15 px short of the right; the strip at the
//                                                                   bottom (rows − 2), the titles centred (WndQuest.cpp:1096),
//                                                                   the chosen one black, the others white
//   CWndTreeCtrl                    WndControl.cpp:766-1420         client 4 px in (15 more off the right for the scroll bar
//                                                                   in the right 16 px), drawing 3 px into it; a row a font
//                                                                   high, 16 px a level; a folder's ButtTreeOpen/Close or a
//                                                                   quest's 13-px check box, then the text 16 px in; rows
//                                                                   ARGB(255,64,64,64), the chosen one's text blue, no bar;
//                                                                   the picture or a double press opens a folder, one press
//                                                                   on its text only chooses it; the wheel moves a row
//   CWndQuest::OnInitialUpdate      _Interface/WndQuest.cpp:1092-1160  four trees titled by 6000-6003; tab 0 (Scenario) and In
//                                                                   Progress at first (TreeInformation.cpp:36-37), both kept;
//                                                                   the read-only combo (:1145); opens in the middle
//                                                                   (MoveParentCenter, :1157-1159)
//   CWndQuest::OnChildNotify        :1202-1304                      a new tab or filter closes the detail (:1230-1234), so
//                                                                   does the remove button (:1257-1265); a quest's text
//                                                                   toggles its detail (:1279-1300)
//   CWndQuest::InsertQuestItem      :1422-1492                      a completed row grey (0xffc0c0c0) with no check box
//   CWndQuestTreeCtrl check boxes   :1524-1565                      at most 5 (a sixth says TID_GAME_ERROR_DONT_CHECK); the
//                                                                   box shows the server's QUEST_CHECKED, not the click
//   CWndQuest::RemoveQuest          :356-393, :21-55                only a current, not ended, removable quest, and not while
//                                                                   the NPC dialogue is open; a box asks first
//                                                                   (TID_GAME_QUEST_DELCONFIRM), OK sends REMOVEQUEST
//   CWndQuestDetail                 :1642-1885                      at the list's right edge less 2 px, at its top
//                                                                   (:1666-1674), not dragged while the list is open
//                                                                   (:1682-1690), moved with the list (:1177-1189); alone it
//                                                                   opens in the middle; a pressed condition row turns blue
//                                                                   and sets the destination (:1614-1640)
//
// Text the catalog or the rows hold goes in with `textContent` or the dialogue's text runs, never as markup. The tree's
// check box draws `ButtCheck.bmp` frame 0 unticked and frame 3 ticked (M1 ruling). On a touch phone (2026-11-11, owner) both
// windows take the frame's 0.7 as the Messenger does: the list opens in the middle above the task bar, and with a quest's
// detail open the two are centred together (style.css, the phone block after `.quest-confirm-text`).

import type { OwnQuest } from '@flyffweb/protocol';
import type { WebQuestGoal } from '@flyffweb/formats';
import type { Texts } from '../../gameData';
import { conditionRows, rewardLines, type QuestCatalog, type QuestNames, type QuestOwner } from '../../quests/questRules';
import { QUEST_TABS, questTree, type QuestFilter, type QuestNode } from '../../quests/questTree';
import { themeKey, themeUrl, type UiArt } from '../art';
import { pictureButton, place, type ControlRect } from '../button';
import { parseDialogText } from '../dialogue/dialogText';
import { WindowFrame } from '../frame';
import { ModalBackdrop } from '../modal';
import { textScrollBar, type TextScrollBar } from '../resWindow';
import { EDIT, TAB_TILE_HEIGHT, editTiles, tabStrip } from '../tiles';

export interface QuestWindowState {
  catalog: QuestCatalog | null;
  current: ReadonlyMap<number, OwnQuest>;
  completed: readonly number[];
  checked: readonly number[];
  owner: QuestOwner | undefined;
  dialogueOpen: boolean;
}

export interface QuestActions {
  check(questId: number, check: boolean): void;
  abandon(questId: number): void;
  destination(goal: WebQuestGoal): void;
  say(text: string): void;
}

const LIST = { width: 336, height: 416 } as const;
const DETAIL = { width: 272, height: 416 } as const;
/** The detail's left edge on the list: its right less 2 px (`rtWndQuest.right - 2`, WndQuest.cpp:1670). */
const DOCK = LIST.width - 2;
const LIST_HEADER: ControlRect = { left: 16, top: 8, width: 176, height: 16 };
const TABCTRL: ControlRect = { left: 16, top: 28, width: 304, height: 300 };
const REMOVE: ControlRect = { left: 16, top: 356, width: 140, height: 20 };
const FILTER: ControlRect = { left: 174, top: 332, width: 130, height: 16 };
const CLOSE: ControlRect = { left: 232, top: 356, width: 72, height: 20 };
const DETAIL_HEADERS: ReadonlyArray<[string, number]> = [['Quest Contents', 8], ['Requirement', 160], ['Reward', 272]];
const HEADER = { left: 12, width: 160, height: 16 } as const;
const CONTENTS: ControlRect = { left: 12, top: 28, width: 240, height: 128 };
const CONDITIONS: ControlRect = { left: 12, top: 180, width: 240, height: 94 };
const REWARDS: ControlRect = { left: 12, top: 292, width: 240, height: 82 };
/** `VSCROLL_WIDTH`; the tab control's and a scrolled text's tiles stop 15-16 px short of the right for it. */
const SCROLL = 16;
const TAB_RIGHT = 15;
/** A tab's page is the tab control less the strip's 18 px (`InsertItem`, WndControl.cpp:4587). */
const STRIP = 18;
/** The tree's client 4 px in, its drawing 3 px into that (`DeflateRect( 4, 4 )`, `CPoint pt( 3, 3 )`). */
const TREE_IN = 7;
const TREE_OUT = 4;
/** A row's height: the font's (the tree's wheel step too). */
const ROW = 16;
/** `m_nTreeTabWidth`: each level 16 px further in. */
const TREE_TAB = 16;
/** `m_wndTextDelta`-free text: a text control's words 6 px in (`m_ptDeflateRect( 6, 6 )`), 15 px more off the right. */
const TEXT_IN = 6;
const SCROLL_TEXT_RIGHT = 15;
/** `MAX_CHECKED_QUEST` (_Common/ProjectCmn.h:23-26). */
const MAX_CHECKED = 5;
const CHECK_SIZE = 14;
/** The combo box's drop button: its right 20 px, ButtQuickListDn.tga's frames 14 x 12. */
const DROP_WIDTH = 20;
const DROP_QUARTER = 14;
/** The combo's list: (rows + 1) × (font + 3) + 8 (`AddString`, WndControl.cpp:4809-4815). */
const FILTER_LIST = (3 + 1) * (14 + 3) + 8;
const FILTERS: ReadonlyArray<[QuestFilter, string, string]> = [
  ['all', 'TID_GAME_QUEST_ALL_LIST', 'All Quests'],
  ['current', 'TID_GAME_QUEST_CURRENT_LIST', 'In Progress'],
  ['completed', 'TID_GAME_QUEST_COMPLETE_LIST', 'Completed'],
];
const TAB_FALLBACKS = ['Scenario', 'General', 'Request Office', 'Event'];

/** The tree's chosen row (`m_pFocusElem`): a folder or a quest. */
interface Focus {
  folder: boolean;
  id: number;
}

export class QuestWindow {
  readonly list: WindowFrame;
  readonly detail: WindowFrame;
  private readonly confirmFrame: WindowFrame;
  private readonly confirm: ModalBackdrop;
  private readonly tabctrl: HTMLElement;
  private strip: HTMLElement;
  private readonly tree: HTMLElement;
  private readonly filterField: HTMLButtonElement;
  private readonly filterList: HTMLElement;
  private readonly filterBox: HTMLElement;
  private readonly remove: HTMLButtonElement;
  private readonly contents: HTMLElement;
  private readonly conditions: HTMLElement;
  private readonly rewards: HTMLElement;
  private readonly bars: TextScrollBar[] = [];
  private readonly filterText: (filter: QuestFilter) => string;
  private tab: number = QUEST_TABS[0];
  private filterValue: QuestFilter = 'current';
  private readonly closed = new Set<number>();
  private focus: Focus | null = null;
  /** The quest the detail shows (`CWndQuestDetail::m_dwQuestID`), and its pressed condition row. */
  private detailId: number | null = null;
  private chosenRow: number | null = null;
  /** The quest the abandon box was opened for (`CWndRemoveQuest::m_nRemoveQuestId`). */
  private removing: number | null = null;
  private state: QuestWindowState | null = null;
  /** `key()` as the windows were last drawn. */
  private shown = '';
  /** The list's place the detail was last docked at. */
  private docked = { x: Number.NaN, y: Number.NaN };
  private readonly observer: MutationObserver | null;
  private readonly onOutside: (event: Event) => void;

  constructor(
    private readonly art: UiArt, private readonly texts: Texts, private readonly names: QuestNames,
    private readonly actions: QuestActions, private readonly doc: Document = document,
  ) {
    const text = (id: string, fallback: string): string => texts.get(id)?.text ?? fallback;
    this.filterText = (filter) => {
      const [, id, fallback] = FILTERS.find(([value]) => value === filter)!;
      return text(id, fallback);
    };
    this.list = new WindowFrame('Quest', art, { width: LIST.width, height: LIST.height }, doc);
    this.list.element.classList.add('hud-quests');
    this.list.onClose = () => {
      this.filterList.hidden = true;
      this.detail.close();
    };
    this.detail = new WindowFrame('', art, { width: DETAIL.width, height: DETAIL.height }, doc);
    this.detail.element.classList.add('hud-quest-detail');
    this.detail.onClose = () => {
      this.detailId = null;
      this.chosenRow = null;
      this.render();
      // the phone's list goes back to the middle once alone
      if (this.list.isOpen && this.phone) this.list.open('center');
    };
    // docked to the list, the detail is not dragged by its title (DelWndStyle( WBS_MOVE ), WndQuest.cpp:1682-1690)
    this.detail.element.addEventListener('pointerdown', (event) => {
      if (!this.list.isOpen || !(event.target instanceof Element) || event.target.closest('.hud-window-title') === null) return;
      event.stopPropagation();
      this.detail.raise();
    }, true);

    const div = (className: string, rect: ControlRect): HTMLElement => {
      const element = doc.createElement('div');
      element.className = className;
      place(element, rect);
      return element;
    };
    /** A WSS_GROUPBOX static of WndEditTile200 tiles, its white title centred (0x2220051). */
    const header = (title: string, rect: ControlRect): HTMLElement => {
      const element = div('hud-res-static is-group quest-header', rect);
      element.append(editTiles(doc, art, Math.trunc(rect.width / EDIT), Math.trunc(rect.height / EDIT), 'WndEditTile200.tga'));
      const words = doc.createElement('span');
      words.className = 'hud-res-static-text';
      words.textContent = title;
      element.append(words);
      return element;
    };
    /**
     * A control on edit tiles with a scroll bar in its right 16 px (`WBS_VSCROLL`): its words `inset` px in (a text's 6, a
     * tree's 7), off the right by the bar and 15 px (a text) or 4 + 15 (a tree).
     */
    const scrolled = (className: string, rect: ControlRect, inset: number, right: number, tiles: boolean): HTMLElement => {
      const box = div('quest-box', rect);
      if (tiles) box.append(editTiles(doc, art, Math.trunc((rect.width - SCROLL) / EDIT), Math.trunc(rect.height / EDIT)));
      const words = div(`hud-res-text-body ${className}`, {
        left: inset, top: inset, width: rect.width - inset - right, height: rect.height - inset - (inset === TREE_IN ? TREE_OUT : inset),
      });
      const bar = textScrollBar(doc, art, words, { left: 0, top: 0, width: rect.width, height: rect.height });
      this.bars.push(bar);
      box.append(words, bar.element);
      return words;
    };
    /** The wheel moves a tree a row at a time (`OnMouseWheel`, WndControl.cpp:1398-1418). */
    const rowWheel = (tree: HTMLElement): void => {
      tree.addEventListener('wheel', (event) => {
        if (event.deltaY === 0) return;
        event.preventDefault();
        tree.scrollTop += Math.sign(event.deltaY) * ROW;
        this.drawBars();
      }, { passive: false });
    };

    // the tab control: its tiles, a page the strip's 18 px short, the strip at the bottom
    this.tabctrl = div('quest-tabctrl', TABCTRL);
    const columns = Math.trunc((TABCTRL.width - TAB_RIGHT) / EDIT);
    const rows = Math.trunc(TABCTRL.height / EDIT);
    this.tabctrl.append(editTiles(doc, art, columns, rows));
    const page = div('quest-page', { left: 0, top: 0, width: TABCTRL.width, height: TABCTRL.height - STRIP });
    this.tabctrl.append(page);
    this.tree = scrolled('quest-tree', { left: 0, top: 0, width: TABCTRL.width, height: TABCTRL.height - STRIP }, TREE_IN,
      TREE_OUT + TAB_RIGHT, false);
    page.append(this.tree.parentElement!);
    rowWheel(this.tree);
    this.strip = doc.createElement('div');
    this.tabctrl.append(this.strip);

    // the filter: a read-only combo box (EBS_READONLY) on edit tiles, its drop button, its list under it
    this.filterBox = div('hud-res-edit hud-res-combo quest-filter', FILTER);
    this.filterBox.append(editTiles(doc, art, Math.trunc(FILTER.width / EDIT), Math.trunc(FILTER.height / EDIT)));
    this.filterField = doc.createElement('button');
    this.filterField.type = 'button';
    this.filterField.className = 'quest-filter-field';
    this.filterField.setAttribute('aria-haspopup', 'listbox');
    this.filterField.addEventListener('click', () => { this.filterList.hidden = !this.filterList.hidden; });
    const drop = pictureButton(doc, art, 'ButtQuickListDn.tga', {
      left: FILTER.width - DROP_WIDTH, top: 0, width: DROP_QUARTER, height: 12,
    }, DROP_QUARTER, () => { this.filterList.hidden = !this.filterList.hidden; });
    drop.classList.add('hud-res-combo-drop');
    drop.setAttribute('aria-label', 'Show the list');
    this.filterList = div('hud-res-combo-list quest-filter-list', { left: 0, top: FILTER.height, width: FILTER.width, height: FILTER_LIST });
    this.filterList.hidden = true;
    this.filterList.setAttribute('role', 'listbox');
    this.filterList.append(editTiles(doc, art, Math.trunc(FILTER.width / EDIT), Math.trunc(FILTER_LIST / EDIT)));
    const choices = doc.createElement('div');
    choices.className = 'hud-res-combo-rows';
    for (const [value] of FILTERS) {
      const option = doc.createElement('div');
      option.setAttribute('role', 'option');
      option.dataset.filter = value;
      option.textContent = this.filterText(value);
      option.addEventListener('click', () => {
        this.filterList.hidden = true;
        this.choose(this.tab, value);
      });
      choices.append(option);
    }
    this.filterList.append(choices);
    this.filterBox.append(this.filterField, drop, this.filterList);
    // the list closes when the focus goes elsewhere (WNM_KILLFOCUS, WndControl.cpp:4790-4803)
    this.onOutside = (event) => {
      if (!this.filterList.hidden && event.target instanceof Node && !this.filterBox.contains(event.target)) this.filterList.hidden = true;
    };
    doc.addEventListener('pointerdown', this.onOutside, true);

    this.remove = pictureButton(doc, art, 'ButtRemoveQuest.bmp', REMOVE, REMOVE.width, () => this.askAbandon());
    this.remove.classList.add('quest-remove');
    this.remove.setAttribute('aria-label', 'Cancel Quest in Progress');
    const close = pictureButton(doc, art, 'ButtClose.tga', CLOSE, CLOSE.width, () => this.list.close());
    close.classList.add('quest-close');
    close.setAttribute('aria-label', 'Close');
    this.list.body.append(header('Quest List', LIST_HEADER), this.tabctrl, this.remove, close, this.filterBox);

    this.contents = scrolled('quest-contents', CONTENTS, TEXT_IN, TEXT_IN + SCROLL_TEXT_RIGHT, true);
    this.conditions = scrolled('quest-conditions', CONDITIONS, TREE_IN, TREE_OUT + TAB_RIGHT, true);
    rowWheel(this.conditions);
    this.rewards = scrolled('quest-rewards', REWARDS, TEXT_IN, TEXT_IN + SCROLL_TEXT_RIGHT, true);
    this.detail.body.append(
      ...DETAIL_HEADERS.map(([title, top]) => header(title, { ...HEADER, top })),
      this.contents.parentElement!, this.conditions.parentElement!, this.rewards.parentElement!,
    );

    // the abandon box: CWndRemoveQuest, a message box with OK and Cancel (WndQuest.cpp:21-55)
    this.confirmFrame = new WindowFrame('Quest', art, { width: 256, height: 144, texture: 'WndMessagebox.tga' }, doc);
    this.confirmFrame.element.classList.add('quest-confirm');
    this.confirm = new ModalBackdrop(this.confirmFrame, doc);
    this.confirmFrame.onClose = () => this.confirm.hide();
    const message = doc.createElement('div');
    message.className = 'quest-confirm-text';
    message.textContent = text('TID_GAME_QUEST_DELCONFIRM', 'Are you going to cancel the quest?');
    place(message, { left: 10, top: 10, width: 224, height: 67 });
    const ok = pictureButton(doc, art, 'ButtOk.tga', { left: 42, top: 82, width: 72, height: 20 }, 72, () => {
      this.confirmFrame.close();
      if (this.removing !== null && this.canAbandon(this.removing)) this.actions.abandon(this.removing);
    });
    ok.dataset.button = 'ok';
    const cancel = pictureButton(doc, art, 'ButtCancel.tga', { left: 122, top: 82, width: 72, height: 20 }, 72, () => this.confirmFrame.close());
    cancel.dataset.button = 'cancel';
    this.confirmFrame.body.append(message, ok, cancel);

    // the detail moves with the list (CWndQuest::SetWndRect, WndQuest.cpp:1177-1189): a drag, a refit, a new place
    const Observer = doc.defaultView?.MutationObserver;
    this.observer = Observer === undefined ? null : new Observer(() => this.follow());
    this.observer?.observe(this.list.element, { attributes: true, attributeFilter: ['style'] });
  }

  /** The elements that go in the windows' layer. */
  get elements(): HTMLElement[] {
    return [this.list.element, this.detail.element, this.confirm.element];
  }

  get isOpen(): boolean {
    return this.list.isOpen;
  }

  /** The abandon box's backdrop (WBS_MODAL), which the world screen watches as it does the log-out box's. */
  get modal(): ModalBackdrop {
    return this.confirm;
  }

  /**
   * Q, or the Start menu's Quest Diary: opens it in the middle of the screen (`MoveParentCenter`, WndQuest.cpp:1157-1159;
   * above the task bar), or closes it. (The layer's width is no longer needed; the frame centres on its layer.)
   */
  toggle(_layerWidth: number, state: QuestWindowState): void {
    if (this.list.isOpen) {
      this.list.close();
      return;
    }
    this.state = state;
    this.render();
    this.list.open('center');
    if (this.detail.isOpen) this.openDetail();
  }

  /**
   * The world's frame: the windows drawn again from `state` when what they show changed (plan decision 7), not
   * otherwise, so that a row pressed between two frames is still there for its click.
   */
  update(state: QuestWindowState): void {
    this.state = state;
    if (this.detailId !== null && !state.current.has(this.detailId) && !state.completed.includes(this.detailId)) this.detail.close();
    if ((this.list.isOpen || this.detail.isOpen) && this.key() !== this.shown) this.render();
  }

  /** Toggles the detail for `questId` (a quest's text in the tree, the tracker's title). */
  showDetail(questId: number | null, state: QuestWindowState): void {
    this.state = state;
    if (questId === null || this.detailId === questId) {
      this.detail.close();
      return;
    }
    this.detailId = questId;
    this.chosenRow = null;
    this.render();
    this.openDetail();
  }

  dispose(): void {
    this.observer?.disconnect();
    this.doc.removeEventListener('pointerdown', this.onOutside, true);
    this.confirmFrame.close();
    this.detail.close();
    this.list.close();
    for (const element of this.elements) element.remove();
  }

  /** A touch phone's windows: the frame scales them (its 0.7) and marks them. */
  private get phone(): boolean {
    return this.list.element.hasAttribute('data-mobile-window');
  }

  /** The list's scale on its layer (0.7 on a phone). */
  private get scale(): number {
    return this.list.scaledSize.width / LIST.width;
  }

  /**
   * The detail at the list's right edge less 2 px (WndQuest.cpp:1666-1674), or in the middle with no list. On a phone the
   * list and its detail are centred together.
   */
  private openDetail(): void {
    if (!this.list.isOpen) {
      this.detail.open('center');
      return;
    }
    if (this.phone) {
      const layer = this.list.element.parentElement;
      const width = (DOCK + DETAIL.width) * this.scale;
      this.list.open({ x: ((layer?.clientWidth ?? 0) - width) / 2, y: this.list.position.y });
    }
    const at = this.list.position;
    this.docked = at;
    this.detail.open({ x: at.x + DOCK * this.scale, y: at.y });
  }

  /** The list moved: its detail with it. */
  private follow(): void {
    if (!this.list.isOpen || !this.detail.isOpen) return;
    const at = this.list.position;
    if (at.x === this.docked.x && at.y === this.docked.y) return;
    this.docked = at;
    this.detail.element.style.left = `${Math.round(at.x + DOCK * this.scale)}px`;
    this.detail.element.style.top = `${at.y}px`;
  }

  /** A tab or a filter chosen (WNM_SELCHANGE): the trees drawn again with no choice, the detail closed (:1230-1234). */
  private choose(tab: number, filter: QuestFilter): void {
    this.tab = tab;
    this.filterValue = filter;
    this.focus = null;
    this.detail.close();
    this.render();
  }

  private canAbandon(questId: number): boolean {
    const state = this.state;
    const quest = state?.current.get(questId);
    if (state === null || quest === undefined || quest.state === 14 || state.dialogueOpen) return false;
    return state.catalog?.get(questId)?.noRemove !== true;
  }

  /** The remove button: the chosen quest's box, the detail closed first (WndQuest.cpp:1257-1265). */
  private askAbandon(): void {
    const focus = this.focus;
    if (focus === null || focus.folder || !this.canAbandon(focus.id)) return;
    this.removing = focus.id;
    this.detail.close();
    this.confirm.show();
    this.confirmFrame.open('center');
  }

  /** What the windows show from the state: the tree, the chosen rows, the detail's quest, rows and rewards, the remove button. */
  private key(): string {
    const state = this.state!;
    const id = this.detailId;
    const quest = id === null ? undefined : state.current.get(id);
    const prop = id === null ? undefined : state.catalog?.get(id);
    return JSON.stringify([
      this.tab, this.filterValue, [...this.closed], this.focus, id, this.chosenRow, quest, id !== null && state.completed.includes(id),
      questTree(this.tab, this.filterValue, state.catalog, state.current, state.completed, state.checked),
      quest === undefined || state.owner === undefined ? null : conditionRows(quest, prop, state.owner, this.names, this.texts),
      id === null ? null : rewardLines(prop, this.names, this.texts, state.owner),
      this.focus !== null && !this.focus.folder && this.canAbandon(this.focus.id),
    ]);
  }

  private render(): void {
    const state = this.state;
    if (state === null) return;
    this.shown = this.key();
    const titles = QUEST_TABS.map((tab, i) => state.catalog?.get(tab)?.title || TAB_FALLBACKS[i]!);
    const strip = tabStrip(this.doc, this.art, Math.trunc((TABCTRL.width - TAB_RIGHT) / EDIT) * EDIT, titles,
      QUEST_TABS.indexOf(this.tab as typeof QUEST_TABS[number]), (i) => this.choose(QUEST_TABS[i]!, this.filterValue));
    strip.classList.add('quest-tab-strip');
    strip.style.left = '0px';
    strip.style.top = `${(Math.trunc(TABCTRL.height / EDIT) - 2) * EDIT}px`;
    strip.style.height = `${TAB_TILE_HEIGHT}px`;
    strip.querySelectorAll<HTMLElement>('.hud-tab-title').forEach((button, i) => { button.dataset.questTab = String(QUEST_TABS[i]); });
    this.strip.replaceWith(strip);
    this.strip = strip;
    this.filterField.textContent = this.filterText(this.filterValue);
    const top = this.tree.scrollTop;
    this.tree.replaceChildren(...this.rows(questTree(this.tab, this.filterValue, state.catalog, state.current, state.completed, state.checked), 0));
    this.tree.scrollTop = top;
    const focus = this.focus;
    this.remove.disabled = focus === null || focus.folder || !this.canAbandon(focus.id);
    this.renderDetail();
    this.drawBars();
  }

  private drawBars(): void {
    for (const bar of this.bars) bar.draw();
  }

  private chosen(folder: boolean, id: number): boolean {
    return this.focus !== null && this.focus.folder === folder && this.focus.id === id;
  }

  private fold(id: number): void {
    if (this.closed.has(id)) this.closed.delete(id);
    else this.closed.add(id);
    this.render();
  }

  private rows(nodes: readonly QuestNode[], depth: number): HTMLElement[] {
    const doc = this.doc;
    return nodes.flatMap((node) => {
      const row = doc.createElement('div');
      row.style.paddingLeft = `${depth * TREE_TAB}px`;
      if (node.folder) {
        const open = !this.closed.has(node.id);
        row.className = 'quest-node quest-folder';
        row.dataset.questFolder = String(node.id);
        if (this.chosen(true, node.id)) row.classList.add('selected');
        const fold = doc.createElement('button');
        fold.type = 'button';
        fold.className = 'quest-fold';
        fold.setAttribute('aria-expanded', String(open));
        fold.setAttribute('aria-label', open ? 'Close' : 'Open');
        const icon = doc.createElement('img');
        icon.alt = '';
        icon.src = this.art.url(themeKey(open ? 'buttTreeOpen.tga' : 'buttTreeClose.tga'));
        fold.append(icon);
        fold.addEventListener('click', () => {
          this.focus = { folder: true, id: node.id };
          this.fold(node.id);
        });
        const title = doc.createElement('button');
        title.type = 'button';
        title.className = 'quest-folder-title';
        title.textContent = node.title;
        // one press chooses it; a double press opens or closes it. A finger has no double press: its tap does both.
        title.addEventListener('click', () => {
          this.focus = { folder: true, id: node.id };
          if (this.phone) this.fold(node.id);
          else this.render();
        });
        title.addEventListener('dblclick', () => { if (!this.phone) this.fold(node.id); });
        row.append(fold, title);
        return open ? [row, ...this.rows(node.children, depth + 1)] : [row];
      }
      row.className = node.completed ? 'quest-node quest-leaf completed' : 'quest-node quest-leaf';
      row.dataset.questId = String(node.id);
      if (this.chosen(false, node.id)) row.classList.add('selected');
      const slot = doc.createElement('span');
      slot.className = 'quest-slot';
      if (!node.completed) {
        const check = doc.createElement('button');
        check.type = 'button';
        check.className = 'quest-check';
        check.dataset.checked = String(node.checked);
        check.setAttribute('aria-label', node.checked ? 'Untick' : 'Tick');
        check.style.backgroundImage = themeUrl(this.art, 'ButtCheck.bmp');
        check.style.backgroundPosition = `-${(node.checked ? 3 : 0) * CHECK_SIZE}px 0`;
        check.addEventListener('click', () => this.tick(node.id, node.checked));
        slot.append(check);
      }
      const title = doc.createElement('button');
      title.type = 'button';
      title.className = 'quest-title';
      title.textContent = node.title;
      title.addEventListener('click', () => {
        this.focus = { folder: false, id: node.id };
        this.showDetail(node.id, this.state!);
        if (!this.detail.isOpen) this.render();
      });
      row.append(slot, title);
      return [row];
    });
  }

  private tick(questId: number, checked: boolean): void {
    const state = this.state!;
    if (!checked && state.checked.length >= MAX_CHECKED) {
      this.actions.say(this.texts.get('TID_GAME_ERROR_DONT_CHECK')?.text ?? 'You cannot check that anymore.');
      return;
    }
    this.actions.check(questId, !checked);
  }

  private renderDetail(): void {
    const state = this.state;
    const id = this.detailId;
    if (state === null || id === null) return;
    const prop = state.catalog?.get(id);
    const quest = state.current.get(id);
    // the title bar is empty (IDS_RESDATA_INC_006718); the quest's title names the window for screen readers
    this.detail.setTitle('');
    this.detail.element.setAttribute('aria-label', prop?.title || `Quest ${id}`);
    const doc = this.doc;
    const runs = (element: HTMLElement, text: string): void => {
      for (const run of parseDialogText(text)) {
        const span = doc.createElement('span');
        span.textContent = run.text;
        if (run.color !== 0xff000000) span.style.color = `#${(run.color & 0xffffff).toString(16).padStart(6, '0')}`;
        if (run.bold) span.style.fontWeight = 'bold';
        element.append(span);
      }
    };
    this.contents.replaceChildren();
    const states = prop?.states ?? {};
    const last = Math.max(-1, ...Object.keys(states).map(Number).filter((n) => n !== 14));
    runs(this.contents, (quest !== undefined ? states[quest.state] : states[last]) ?? '');
    this.conditions.replaceChildren();
    if (quest === undefined) {
      const done = doc.createElement('div');
      done.className = 'quest-row';
      runs(done, this.texts.get('TID_QUEST_COMPLETED')?.text ?? 'Quest completed.');
      this.conditions.append(done);
    } else if (state.owner !== undefined) {
      conditionRows(quest, prop, state.owner, this.names, this.texts).forEach((row, index) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = row.met ? 'quest-row met' : 'quest-row';
        if (index === this.chosenRow) button.classList.add('selected');
        button.dataset.row = String(index);
        runs(button, row.text);
        button.addEventListener('click', () => {
          // the pressed row turns blue (m_pFocusElem), and its goal is the destination (WndQuest.cpp:1614-1640)
          this.chosenRow = index;
          for (const other of this.conditions.querySelectorAll('.quest-row.selected')) other.classList.remove('selected');
          button.classList.add('selected');
          if (row.goal !== undefined) this.actions.destination(row.goal);
        });
        this.conditions.append(button);
      });
    }
    this.rewards.replaceChildren(...rewardLines(prop, this.names, this.texts, state.owner).map((line) => {
      const element = doc.createElement('div');
      element.textContent = line;
      return element;
    }));
  }
}
