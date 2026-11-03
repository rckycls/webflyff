import { describe, expect, it } from 'vitest';
import type { OwnQuest } from '@flyffweb/protocol';
import type { WebQuest } from '@flyffweb/formats';
import { QUEST_TABS, questTree } from '../src/world/quests/questTree';

const node = (id: number, title: string, head: number): WebQuest => ({ id, title, head, states: {} });
const CATALOG = new Map<number, WebQuest>([
  [6000, node(6000, 'Scenario', 0)], [6001, node(6001, 'General', 0)], [6002, node(6002, 'Request Office', 0)],
  [6003, node(6003, 'Event', 0)], [6051, node(6051, '1st Job Change', 6001)], [6004, node(6004, 'Flaris', 6001)],
  [151, node(151, 'The Path of the Mercenary', 6051)], [83, node(83, 'Find Red Bang Thieves', 6004)],
  [40, node(40, 'An old story', 6000)],
]);
const own = (id: number): OwnQuest => ({ id, state: 0, time: 0, kills: [0, 0], patrol: false, dialog: false });
const current = (...ids: number[]) => new Map(ids.map((id) => [id, own(id)]));

describe('questTree (CWndQuest::Update, InsertQuestItem, WndQuest.cpp:145-200, :1422-1492)', () => {
  it('the tabs are the four kinds', () => {
    expect(QUEST_TABS).toEqual([6000, 6001, 6002, 6003]);
  });

  it('a current quest sits in its tab under its head folders', () => {
    const tree = questTree(6001, 'current', CATALOG, current(151), [], []);
    expect(tree).toEqual([{ id: 6051, title: '1st Job Change', folder: true, completed: false, checked: false, children: [
      { id: 151, title: 'The Path of the Mercenary', folder: false, completed: false, checked: false, children: [] },
    ] }]);
    expect(questTree(6000, 'current', CATALOG, current(151), [], [])).toEqual([]);
  });

  it('the filter shows current, completed or both, current ones first', () => {
    const leaves = (filter: 'all' | 'current' | 'completed') =>
      questTree(6001, filter, CATALOG, current(151), [83], []).flatMap((folder) => folder.children.map((leaf) => leaf.id));
    expect(leaves('current')).toEqual([151]);
    expect(leaves('completed')).toEqual([83]);
    expect(leaves('all')).toEqual([151, 83]);
  });

  it('a completed quest is not checkable; a checked one is marked', () => {
    const tree = questTree(6001, 'all', CATALOG, current(151), [83], [151, 83]);
    const leaves = tree.flatMap((folder) => folder.children);
    expect(leaves.map((leaf) => [leaf.id, leaf.completed, leaf.checked])).toEqual([[151, false, true], [83, true, false]]);
  });

  it('an unknown quest is a General leaf titled by its id', () => {
    expect(questTree(6001, 'current', CATALOG, current(999), [], [])).toEqual([
      { id: 999, title: 'Quest 999', folder: false, completed: false, checked: false, children: [] },
    ]);
    expect(questTree(6001, 'current', null, current(151), [], [])[0]!.title).toBe('Quest 151');
  });

  it('an empty folder is left out', () => {
    expect(questTree(6000, 'all', CATALOG, current(), [], [])).toEqual([]);
  });
});
