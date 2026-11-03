// The quest window's tree (Piece 7 M1), without the window:
//
//   CWndQuest::Update          _Interface/WndQuest.cpp:145-200     the current and the completed quests, by the filter
//   CWndQuest::InsertQuestItem WndQuest.cpp:1422-1492              each quest under the folders of its head chain,
//                                                                 inserted on the way; the tab is the chain's root
//                                                                 (GetRootHeadQuest, :2419), an unknown root General
//
// A quest the catalog does not know is a General leaf titled "Quest <id>" (plan decision 6).

import type { OwnQuest } from '@flyffweb/protocol';
import { QUEST_KIND } from '@flyffweb/formats';
import type { QuestCatalog } from './questRules';

export type QuestFilter = 'all' | 'current' | 'completed';
/** The four tabs, by the props that title them (6000-6003: Scenario, General, Request Office, Event). */
export const QUEST_TABS = [QUEST_KIND.SCENARIO, QUEST_KIND.NORMAL, QUEST_KIND.REQUEST, QUEST_KIND.EVENT] as const;

export interface QuestNode {
  id: number;
  title: string;
  folder: boolean;
  completed: boolean;
  checked: boolean;
  children: QuestNode[];
}

/** No head chain is longer (a guard against a loop in the data). */
const MAX_DEPTH = 16;

/** The folders above `id`, root first, and the tab they belong to. */
function chainOf(id: number, catalog: QuestCatalog | null): { tab: number; folders: number[] } {
  const folders: number[] = [];
  let head = catalog?.get(id)?.head ?? 0;
  for (let depth = 0; depth < MAX_DEPTH && head !== 0; depth++) {
    if ((QUEST_TABS as readonly number[]).includes(head)) return { tab: head, folders };
    const parent = catalog?.get(head);
    if (parent === undefined) break;
    folders.unshift(head);
    head = parent.head;
  }
  return { tab: QUEST_KIND.NORMAL, folders: head === 0 ? folders : [] };
}

export function questTree(
  tab: number, filter: QuestFilter, catalog: QuestCatalog | null,
  current: ReadonlyMap<number, OwnQuest>, completed: readonly number[], checked: readonly number[],
): QuestNode[] {
  const roots: QuestNode[] = [];
  const titleOf = (id: number): string => catalog?.get(id)?.title || `Quest ${id}`;
  const place = (id: number, isCompleted: boolean): void => {
    const chain = chainOf(id, catalog);
    if (chain.tab !== tab) return;
    let level = roots;
    for (const folderId of chain.folders) {
      let folder = level.find((n) => n.folder && n.id === folderId);
      if (folder === undefined) {
        folder = { id: folderId, title: titleOf(folderId), folder: true, completed: false, checked: false, children: [] };
        level.push(folder);
      }
      level = folder.children;
    }
    level.push({ id, title: titleOf(id), folder: false, completed: isCompleted, checked: !isCompleted && checked.includes(id), children: [] });
  };
  if (filter !== 'completed') for (const id of current.keys()) place(id, false);
  if (filter !== 'current') for (const id of completed) if (!current.has(id)) place(id, true);
  return roots;
}
