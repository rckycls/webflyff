// The quest window and its detail (Piece 7 M1), as Neuz draws them:
//
//   resdata.inc APP_QUEST_EX_LIST   Resource/resdata.inc:4076    "WndTile00.tga" tiled, 336 x 416, "Quest": the tab
//                                                               control 16,28-320,328, the remove button
//                                                               ("ButtRemoveQuest.bmp") 16,356-156,376, the filter combo
//                                                               174,332-304,348, the close button ("ButtClose.tga")
//                                                               232,356-304,376
//   resdata.inc APP_QUEST_EX_DETAIL :2795                        272 x 416: "Quest Contents" 12,28-252,156,
//                                                               "Requirement" 12,180-252,274, "Reward" 12,292-252,374
//   CWndQuest::OnInitialUpdate      _Interface/WndQuest.cpp:1092-1157 four tree tabs titled by 6000-6003, the filter
//                                                               (All / In Progress / Completed, In Progress first), both
//                                                               kept while the game runs
//   CWndQuest::InsertQuestItem      :1422-1492                  a completed row grey (0xffc0c0c0) with no check box
//   CWndQuest check boxes           :1524-1565                  at most 5 (a sixth says TID_GAME_ERROR_DONT_CHECK); the
//                                                               box shows the server's QUEST_CHECKED, not the click
//   CWndQuest::RemoveQuest          :356-393, :21-55            only a current, not ended, removable quest, and not while
//                                                               the NPC dialogue is open; a box asks first
//                                                               (TID_GAME_QUEST_DELCONFIRM), OK sends REMOVEQUEST
//   CWndQuestDetail                 :1647-1885                  at the list's right edge: the state's text, the rows,
//                                                               the rewards; a row with a goal sets the destination
//
// Text the catalog or the rows hold goes in with `textContent` or the dialogue's text runs, never as markup. The tree's
// check box draws `ButtCheck.bmp` frame 0 unticked and frame 3 ticked (plan ruling). On a touch phone the list and the
// detail are one full-screen panel (style.css, `.hud-quests[data-mobile-window]`).

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
const TABS: ControlRect = { left: 16, top: 28, width: 304, height: 20 };
const TREE: ControlRect = { left: 16, top: 50, width: 304, height: 278 };
const REMOVE: ControlRect = { left: 16, top: 356, width: 140, height: 20 };
const FILTER: ControlRect = { left: 174, top: 332, width: 130, height: 16 };
const CLOSE: ControlRect = { left: 232, top: 356, width: 72, height: 20 };
const LIST_TITLE: ControlRect = { left: 16, top: 8, width: 176, height: 16 };
const CONTENTS: ControlRect = { left: 12, top: 28, width: 240, height: 128 };
const CONDITIONS: ControlRect = { left: 12, top: 180, width: 240, height: 94 };
const REWARDS: ControlRect = { left: 12, top: 292, width: 240, height: 82 };
/** `MAX_CHECKED_QUEST` (_Common/ProjectCmn.h:23-26). */
const MAX_CHECKED = 5;
const CHECK_SIZE = 14;
const FILTERS: ReadonlyArray<[QuestFilter, string, string]> = [
  ['all', 'TID_GAME_QUEST_ALL_LIST', 'All Quests'],
  ['current', 'TID_GAME_QUEST_CURRENT_LIST', 'In Progress'],
  ['completed', 'TID_GAME_QUEST_COMPLETE_LIST', 'Completed'],
];

export class QuestWindow {
  readonly list: WindowFrame;
  readonly detail: WindowFrame;
  private readonly confirmFrame: WindowFrame;
  private readonly confirm: ModalBackdrop;
  private readonly tabs: HTMLElement;
  private readonly tree: HTMLElement;
  private readonly filter: HTMLSelectElement;
  private readonly remove: HTMLButtonElement;
  private readonly contents: HTMLElement;
  private readonly conditions: HTMLElement;
  private readonly rewards: HTMLElement;
  private tab: number = QUEST_TABS[1];
  private filterValue: QuestFilter = 'current';
  private readonly closed = new Set<number>();
  private selected: number | null = null;
  private state: QuestWindowState | null = null;
  /** `key()` as the windows were last drawn. */
  private shown = '';

  constructor(
    private readonly art: UiArt, private readonly texts: Texts, private readonly names: QuestNames,
    private readonly actions: QuestActions, private readonly doc: Document = document,
  ) {
    const text = (id: string, fallback: string): string => texts.get(id)?.text ?? fallback;
    this.list = new WindowFrame('Quest', art, { width: LIST.width, height: LIST.height }, doc);
    this.list.element.classList.add('hud-quests');
    this.list.onClose = () => this.detail.close();
    this.detail = new WindowFrame('', art, { width: DETAIL.width, height: DETAIL.height }, doc);
    this.detail.element.classList.add('hud-quest-detail');
    this.detail.onClose = () => { this.selected = null; this.render(); };

    const div = (className: string, rect: ControlRect): HTMLElement => {
      const element = doc.createElement('div');
      element.className = className;
      place(element, rect);
      return element;
    };
    const heading = div('quest-group', LIST_TITLE);
    heading.textContent = 'Quest List';
    this.tabs = div('quest-tabs', TABS);
    this.tree = div('quest-tree', TREE);
    this.filter = doc.createElement('select');
    this.filter.className = 'quest-filter';
    place(this.filter, FILTER);
    for (const [value, id, fallback] of FILTERS) {
      const option = doc.createElement('option');
      option.value = value;
      option.textContent = text(id, fallback);
      this.filter.append(option);
    }
    this.filter.value = this.filterValue;
    this.filter.addEventListener('change', () => { this.filterValue = this.filter.value as QuestFilter; this.render(); });
    this.remove = pictureButton(doc, art, 'ButtRemoveQuest.bmp', REMOVE, REMOVE.width, () => this.askAbandon());
    this.remove.classList.add('quest-remove');
    this.remove.setAttribute('aria-label', 'Cancel Quest in Progress');
    const close = pictureButton(doc, art, 'ButtClose.tga', CLOSE, CLOSE.width, () => this.list.close());
    close.classList.add('quest-close');
    close.setAttribute('aria-label', 'Close');
    this.list.body.append(heading, this.tabs, this.tree, this.filter, this.remove, close);

    const group = (title: string, top: number): HTMLElement => {
      const element = div('quest-group', { left: 12, top, width: 160, height: 16 });
      element.textContent = title;
      return element;
    };
    this.contents = div('quest-contents', CONTENTS);
    this.conditions = div('quest-conditions', CONDITIONS);
    this.rewards = div('quest-rewards', REWARDS);
    this.detail.body.append(group('Quest Contents', 8), this.contents, group('Requirement', 160), this.conditions,
      group('Reward', 272), this.rewards);

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
      if (this.selected !== null && this.canAbandon(this.selected)) this.actions.abandon(this.selected);
    });
    ok.dataset.button = 'ok';
    const cancel = pictureButton(doc, art, 'ButtCancel.tga', { left: 122, top: 82, width: 72, height: 20 }, 72, () => this.confirmFrame.close());
    cancel.dataset.button = 'cancel';
    this.confirmFrame.body.append(message, ok, cancel);
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

  /** Q, or the Start menu's Quest Diary: opens it at the right edge, 110 px down (WndQuest.cpp:1153-1157), or closes it. */
  toggle(layerWidth: number, state: QuestWindowState): void {
    if (this.list.isOpen) {
      this.list.close();
      return;
    }
    this.state = state;
    this.render();
    this.list.open({ x: Math.max(0, layerWidth - LIST.width - DETAIL.width), y: 110 });
  }

  /**
   * The world's frame: the windows drawn again from `state` when what they show changed (plan decision 7), not
   * otherwise, so that a row pressed between two frames is still there for its click.
   */
  update(state: QuestWindowState): void {
    this.state = state;
    if (this.selected !== null && !state.current.has(this.selected) && !state.completed.includes(this.selected)) {
      this.selected = null;
      this.detail.close();
    }
    if ((this.list.isOpen || this.detail.isOpen) && this.key() !== this.shown) this.render();
  }

  /** Toggles the detail for `questId` (a leaf's click, the tracker's title). */
  showDetail(questId: number | null, state: QuestWindowState): void {
    this.state = state;
    if (questId === null || this.selected === questId) {
      this.detail.close();
      return;
    }
    this.selected = questId;
    this.render();
    const at = this.list.isOpen ? this.list.position : { x: 0, y: 110 };
    this.detail.open({ x: at.x + LIST.width - 2, y: at.y });
  }

  dispose(): void {
    this.confirmFrame.close();
    this.detail.close();
    this.list.close();
    for (const element of this.elements) element.remove();
  }

  private canAbandon(questId: number): boolean {
    const state = this.state;
    const quest = state?.current.get(questId);
    if (state === null || quest === undefined || quest.state === 14 || state.dialogueOpen) return false;
    return state.catalog?.get(questId)?.noRemove !== true;
  }

  private askAbandon(): void {
    if (this.selected === null || !this.canAbandon(this.selected)) return;
    this.confirm.show();
    this.confirmFrame.open('center');
  }

  /** What the windows show from the state: the tree, the selected quest's rows and rewards, and the remove button. */
  private key(): string {
    const state = this.state!;
    const id = this.selected;
    const quest = id === null ? undefined : state.current.get(id);
    const prop = id === null ? undefined : state.catalog?.get(id);
    return JSON.stringify([
      this.tab, this.filterValue, [...this.closed], id, quest, id !== null && state.completed.includes(id),
      questTree(this.tab, this.filterValue, state.catalog, state.current, state.completed, state.checked),
      quest === undefined || state.owner === undefined ? null : conditionRows(quest, prop, state.owner, this.names, this.texts),
      id === null ? null : rewardLines(prop, this.names, this.texts, state.owner), id !== null && this.canAbandon(id),
    ]);
  }

  private render(): void {
    const state = this.state;
    if (state === null) return;
    this.shown = this.key();
    const doc = this.doc;
    this.tabs.replaceChildren(...QUEST_TABS.map((tab) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'quest-tab';
      button.dataset.questTab = String(tab);
      button.textContent = state.catalog?.get(tab)?.title || ['Scenario', 'General', 'Request Office', 'Event'][QUEST_TABS.indexOf(tab)]!;
      const on = tab === this.tab;
      button.setAttribute('aria-pressed', String(on));
      button.style.backgroundImage = [on ? 10 : 0, on ? 13 : 3, on ? 11 : 1]
        .map((index) => themeUrl(this.art, `WndTabTile${String(index).padStart(2, '0')}.bmp`)).join(',');
      button.addEventListener('click', () => { this.tab = tab; this.render(); });
      return button;
    }));
    this.filter.value = this.filterValue;
    this.tree.replaceChildren(...this.rows(questTree(this.tab, this.filterValue, state.catalog, state.current, state.completed, state.checked), 0));
    this.remove.disabled = this.selected === null || !this.canAbandon(this.selected);
    this.renderDetail();
  }

  private rows(nodes: readonly QuestNode[], depth: number): HTMLElement[] {
    const doc = this.doc;
    return nodes.flatMap((node) => {
      const row = doc.createElement('div');
      row.style.paddingLeft = `${depth * 12}px`;
      if (node.folder) {
        const open = !this.closed.has(node.id);
        const folder = doc.createElement('button');
        folder.type = 'button';
        folder.className = 'quest-folder';
        folder.dataset.questFolder = String(node.id);
        const icon = doc.createElement('img');
        icon.alt = '';
        icon.src = this.art.url(themeKey(open ? 'buttTreeOpen.tga' : 'buttTreeClose.tga'));
        folder.append(icon, doc.createTextNode(node.title));
        folder.addEventListener('click', () => {
          if (open) this.closed.add(node.id);
          else this.closed.delete(node.id);
          this.render();
        });
        row.append(folder);
        return open ? [row, ...this.rows(node.children, depth + 1)] : [row];
      }
      row.className = node.completed ? 'quest-leaf completed' : 'quest-leaf';
      row.dataset.questId = String(node.id);
      if (node.id === this.selected) row.classList.add('selected');
      if (!node.completed) {
        const check = doc.createElement('button');
        check.type = 'button';
        check.className = 'quest-check';
        check.dataset.checked = String(node.checked);
        check.setAttribute('aria-label', node.checked ? 'Untick' : 'Tick');
        check.style.backgroundImage = themeUrl(this.art, 'ButtCheck.bmp');
        check.style.backgroundPosition = `-${(node.checked ? 3 : 0) * CHECK_SIZE}px 0`;
        check.addEventListener('click', () => this.tick(node.id, node.checked));
        row.append(check);
      }
      const title = doc.createElement('button');
      title.type = 'button';
      title.className = 'quest-title';
      title.textContent = node.title;
      title.addEventListener('click', () => this.showDetail(node.id, this.state!));
      row.append(title);
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
    const id = this.selected;
    if (state === null || id === null) return;
    const prop = state.catalog?.get(id);
    const quest = state.current.get(id);
    this.detail.setTitle(prop?.title || `Quest ${id}`);
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
      runs(this.conditions, this.texts.get('TID_QUEST_COMPLETED')?.text ?? 'Quest completed.');
    } else if (state.owner !== undefined) {
      conditionRows(quest, prop, state.owner, this.names, this.texts).forEach((row, index) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = row.met ? 'quest-row met' : 'quest-row';
        button.dataset.row = String(index);
        runs(button, row.text);
        button.addEventListener('click', () => { if (row.goal !== undefined) this.actions.destination(row.goal); });
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
