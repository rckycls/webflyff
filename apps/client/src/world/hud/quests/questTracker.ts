// The quest tracker (Piece 7 M1), as Neuz draws it:
//
//   resdata.inc APP_QUEST_QUICK_INFO      Resource/resdata.inc:4055          224 x 144, created hidden, no close button
//   CWndQuestQuickInfo::OnInitialUpdate   _Interface/WndQuestQuickInfo.cpp:199-211   at the right edge, 220 px down
//   CWndQuestQuickInfo::Process           :213-305   shown only while quests are checked: per checked quest, in the
//                                                    checked order, its title and its condition rows (a quest the
//                                                    catalog lacks is skipped); titles yellow, rows white, the one
//                                                    clicked last red; hovered, (161,28,70) and (121,80,255)
//   CWndQITreeCtrl::OnLButtonDown         :20-90     a title toggles the detail; a row sets the destination
//
// It is drawn without Neuz's hover fade (plan decision 8): the frame shows on hover (style.css, `.hud-quest-tracker`),
// and the text has a dark shadow so it reads over the world. The title's open/close picture is not drawn: every quest
// is open. The rows' text goes in through the dialogue's text runs, never as markup.

import type { OwnQuest } from '@flyffweb/protocol';
import type { WebQuestGoal } from '@flyffweb/formats';
import type { Texts } from '../../gameData';
import { conditionRows, type ConditionRow, type QuestNames } from '../../quests/questRules';
import { parseDialogText } from '../dialogue/dialogText';
import type { QuestWindowState } from './questWindow';

export interface TrackerActions {
  title(questId: number): void;
  destination(goal: WebQuestGoal): void;
}

interface TrackedQuest {
  id: number;
  title: string;
  rows: ConditionRow[];
}

export class QuestTracker {
  readonly element: HTMLElement;
  private shown = '';
  private selected: HTMLElement | null = null;

  constructor(
    private readonly texts: Texts, private readonly names: QuestNames,
    private readonly actions: TrackerActions, private readonly doc: Document = document,
  ) {
    this.element = doc.createElement('div');
    this.element.className = 'hud-quest-tracker';
    this.element.hidden = true;
  }

  /** Rebuilds the rows when the checked list or what a checked quest shows changed; hidden while nothing is checked. */
  update(state: QuestWindowState): void {
    const quests = this.tracked(state);
    const key = JSON.stringify(quests);
    if (key === this.shown) return;
    this.shown = key;
    this.selected = null;
    this.element.hidden = quests.length === 0;
    this.element.replaceChildren(...quests.map((quest) => this.group(quest)));
  }

  dispose(): void {
    this.element.replaceChildren();
    this.element.remove();
  }

  private tracked(state: QuestWindowState): TrackedQuest[] {
    const quests: TrackedQuest[] = [];
    for (const id of state.checked) {
      const prop = state.catalog?.get(id);
      const quest: OwnQuest | undefined = state.current.get(id);
      if (prop === undefined || quest === undefined) continue;
      const rows = state.owner === undefined ? [] : conditionRows(quest, prop, state.owner, this.names, this.texts);
      quests.push({ id, title: prop.title, rows });
    }
    return quests;
  }

  private group(quest: TrackedQuest): HTMLElement {
    const doc = this.doc;
    const group = doc.createElement('div');
    group.dataset.trackerQuest = String(quest.id);
    const title = doc.createElement('button');
    title.type = 'button';
    title.className = 'tracker-title';
    title.textContent = quest.title;
    title.addEventListener('click', () => {
      this.select(title);
      this.actions.title(quest.id);
    });
    group.append(title);
    for (const row of quest.rows) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = row.met ? 'tracker-row met' : 'tracker-row';
      for (const run of parseDialogText(row.text)) {
        const span = doc.createElement('span');
        span.textContent = run.text;
        if (run.color !== 0xff000000) span.style.color = `#${(run.color & 0xffffff).toString(16).padStart(6, '0')}`;
        if (run.bold) span.style.fontWeight = 'bold';
        button.append(span);
      }
      button.addEventListener('click', () => {
        this.select(button);
        if (row.goal !== undefined) this.actions.destination(row.goal);
      });
      group.append(button);
    }
    return group;
  }

  private select(element: HTMLElement): void {
    this.selected?.classList.remove('selected');
    this.selected = element;
    element.classList.add('selected');
  }
}
