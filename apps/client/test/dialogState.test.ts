import { describe, expect, it } from 'vitest';
import type { NpcAction } from '@flyffweb/protocol';
import { DialogState, NO_QUESTS, REQUEST_LOCK_MS, type QuestLookup } from '../src/world/hud/dialogue/dialogState';
import { sayText } from '../src/world/hud/dialogue/dialogText';

const WORDS = { newQuest: 'New Quest', currentQuest: 'Quests in Progress' };
const key = (word: string, k = word, param = 0, quest = 0): NpcAction => ({ kind: 'key', label: word, key: k, param, quest });
const answer = (word: string, k = word): NpcAction => ({ kind: 'answer', label: word, key: k, param: 0, quest: 0 });
const say = (text: string, quest = 0): NpcAction => ({ kind: 'say', text, quest });
const newQuest = (title: string, k: string, quest: number, param = 0): NpcAction =>
  ({ kind: 'newQuest', label: title, key: k, param, quest });

function state(quests: QuestLookup = NO_QUESTS, ...actions: NpcAction[]): DialogState {
  const s = new DialogState(WORDS, quests);
  for (const action of actions) s.apply(action);
  return s;
}

describe('DialogState (CWndDialog, WndDialog.cpp)', () => {
  it("Julia's opening: keys, a new quest row and one page", () => {
    const s = state(NO_QUESTS, { kind: 'clear' }, key('Introduction'), key('Farewell'),
      newQuest('Report to Flaris', 'QUEST_BEGIN', 5), say('Hi'));
    expect(s.keys.map((k) => k.word)).toEqual(['Introduction', 'Farewell', 'New Quest']);
    expect(s.keys[2]).toEqual({ word: 'New Quest', key: 'New Quest', param: 0, quest: 0 });
    expect(s.newQuests).toEqual([{ word: 'Report to Flaris', key: 'QUEST_BEGIN', param: 0, quest: 5, valid: true }]);
    expect(s.pages).toEqual(['  Hi']);
    expect(s.page).toBe(0);
  });

  it('a key with a word it already has is ignored; REMOVEKEY removes by key', () => {
    const s = state(NO_QUESTS, key('Introduction', 'intro'), key('Introduction', 'other'), key('Farewell', 'bye'));
    expect(s.keys.map((k) => k.key)).toEqual(['intro', 'bye']);
    expect(s.apply({ kind: 'removeKey', key: 'intro' })).toBe('changed');
    expect(s.keys.map((k) => k.word)).toEqual(['Farewell']);
  });

  it('REMOVEALLKEY empties the keys and both quest lists', () => {
    const s = state(NO_QUESTS, key('Introduction'), newQuest('A', 'QUEST_BEGIN', 1),
      { kind: 'currentQuest', label: 'B', key: 'QUEST_END', param: 0, quest: 2 }, { kind: 'clear' });
    expect([s.keys, s.newQuests, s.currentQuests]).toEqual([[], [], []]);
  });

  it('each SAY adds a page and the view goes back to page 0', () => {
    const s = state(NO_QUESTS, say('one'), say('two'));
    expect(s.hasNextPage).toBe(true);
    s.nextPage();
    expect(s.page).toBe(1);
    expect(s.hasNextPage).toBe(false);
    s.apply(say('three'));
    expect(s.page).toBe(0);
    expect(s.pages).toHaveLength(3);
  });

  it('answers show only on the last page', () => {
    const s = state(NO_QUESTS, say('one'), say('two'), answer('__OK__', 'QUEST_END_COMPLETE'));
    expect(s.visibleAnswers).toEqual([]);
    s.nextPage();
    expect(s.visibleAnswers.map((a) => a.word)).toEqual(['__OK__']);
  });

  it("a quest SAY's title comes from the lookup, else from its row", () => {
    expect(state(NO_QUESTS, newQuest('Report to Flaris', 'QUEST_BEGIN', 5), say('Go', 5)).pages)
      .toEqual([sayText('Go', 'Report to Flaris')]);
    expect(state(NO_QUESTS, say('Go', 5)).pages).toEqual([sayText('Go')]);
    const known: QuestLookup = { titleOf: (id) => (id === 5 ? { title: 'Known', levelMin: 1, levelMax: 15 } : undefined), isReadyToHandIn: () => false };
    expect(state(known, newQuest('Report', 'QUEST_BEGIN', 5), say('Go', 5)).pages).toEqual([sayText('Go', 'Known')]);
  });

  it('pressing New Quest with rows shows the list and sends nothing', () => {
    const s = state(NO_QUESTS, key('Introduction'), key('Farewell'), newQuest('A', 'QUEST_BEGIN', 1));
    expect(s.pressKey(2, 0)).toBeNull();
    expect(s.list).toBe('new');
    expect(s.selectedKey).toBe(2);
    expect(s.title).toBe('New Quest');
  });

  it('pressing a key clears the pages and sends its key, param and quest', () => {
    const s = state(NO_QUESTS, key('Introduction', 'intro', 3, 0), say('Hi'), answer('__OK__'));
    expect(s.pressKey(0, 0)).toEqual({ key: 'intro', param: 3, quest: 0 });
    expect([s.pages, s.answers, s.list, s.title]).toEqual([[], [], null, 'Introduction']);
  });

  it('a QUEST_NEXT_LEVEL row is invalid and sends nothing', () => {
    const s = state(NO_QUESTS, newQuest('Later', 'QUEST_NEXT_LEVEL', 9), newQuest('Now', 'QUEST_BEGIN', 5, 2));
    expect(s.newQuests.map((row) => row.valid)).toEqual([false, true]);
    expect(s.pressQuest('new', 0, 0)).toBeNull();
    expect(s.pressQuest('new', 1, 0)).toEqual({ key: 'QUEST_BEGIN', param: 2, quest: 5 });
  });

  it('after a request, presses for 1 s send nothing', () => {
    const s = state(NO_QUESTS, key('Introduction'), key('Farewell'));
    expect(REQUEST_LOCK_MS).toBe(1000);
    expect(s.pressKey(0, 0)).not.toBeNull();
    expect(s.pressKey(1, 999)).toBeNull();
    expect(s.pressLink('k', 500)).toBeNull();
    expect(s.pressKey(1, 1000)).toEqual({ key: 'Farewell', param: 0, quest: 0 });
  });

  it('a link sends its key with no param or quest; an answer its own', () => {
    const s = state(NO_QUESTS, say('x'), answer('__YES__', 'QUEST_BEGIN_YES'));
    expect(s.pressLink('Yes_Enter', 0)).toEqual({ key: 'Yes_Enter', param: 0, quest: 0 });
    s.apply(say('again'));
    s.apply(answer('__YES__', 'QUEST_BEGIN_YES'));
    expect(s.pressAnswer(0, 2000)).toEqual({ key: 'QUEST_BEGIN_YES', param: 0, quest: 0 });
  });

  it('EXIT is exit; the stat, navigator and name functions are ignored here', () => {
    const s = state();
    expect(s.apply({ kind: 'exit' })).toBe('exit');
    expect(s.apply({ kind: 'initStat', stat: 'all', remainGP: 3 })).toBe('ignored');
    expect(s.apply({ kind: 'navigator', worldId: 1, pos: [0, 0, 0] })).toBe('ignored');
    expect(s.apply({ kind: 'queryName', of: 'player' })).toBe('ignored');
    expect(s.apply({ kind: 'none' })).toBe('ignored');
  });
});
