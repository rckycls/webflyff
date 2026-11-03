import { describe, expect, it } from 'vitest';
import type { OwnQuest } from '@flyffweb/protocol';
import type { WebQuest } from '@flyffweb/formats';
import { questLines, timedOut } from '../src/world/quests/questLines';
import type { QuestNames } from '../src/world/quests/questRules';

const PROP: WebQuest = {
  id: 151, title: 'The Path of the Mercenary', head: 6051, limitTime: 30,
  kills: [{ slot: 0, mover: 20, count: 10 }], patrol: { world: 1, name: 'Flaris Hill' }, dialog: { npc: 'MaFl_Luda', key: 'k' },
  states: { 0: '' },
};
const CATALOG = new Map([[151, PROP]]);
const NAMES: QuestNames = { mover: () => 'Small Aibatt', item: () => 'item', npc: () => 'Luda' };
const TEXTS = new Map([
  ['TID_EVE_STARTJOB1', { id: 'TID_EVE_STARTJOB1', text: 'The next step of the quest has started.', color: 0xff00ff00 }],
  ['TID_EVE_ENDJOB1', { id: 'TID_EVE_ENDJOB1', text: 'Quest Complete!', color: 0xffffff00 }],
]);
const q = (extra: Partial<OwnQuest> = {}): OwnQuest => ({ id: 151, state: 0, time: 10, kills: [3, 0], patrol: false, dialog: false, ...extra });
const progress = (after: Partial<OwnQuest>) => ({ kind: 'progress' as const, before: q(), after: q(after) });
const texts = (lines: { text: string }[]) => lines.map((line) => line.text);

describe("questLines (CDPClient::OnSetQuest, DPClient.cpp:8444-8573; OnRemoveQuest, :14633-14684)", () => {
  it('a kill count change says "Defeat Small Aibatt (4/10)"', () => {
    expect(texts(questLines(progress({ kills: [4, 0] }), CATALOG, NAMES, TEXTS))).toEqual(['Defeat Small Aibatt #b(4/10)#nb']);
  });

  it('the patrol and dialogue flags and a new time say their lines', () => {
    expect(texts(questLines(progress({ patrol: true }), CATALOG, NAMES, TEXTS))).toEqual(['Flaris Hill Search']);
    expect(texts(questLines(progress({ dialog: true }), CATALOG, NAMES, TEXTS))).toEqual(['Chat with Luda']);
    expect(texts(questLines(progress({ time: 9 }), CATALOG, NAMES, TEXTS))).toEqual(['Time Left: #b9 minutes#nb']);
  });

  it('step 1 says the next step started; the end says Quest Complete!', () => {
    expect(questLines({ kind: 'started', quest: q({ state: 1 }) }, CATALOG, NAMES, TEXTS))
      .toEqual([{ text: 'The next step of the quest has started.', color: 0xff00ff00 }]);
    expect(questLines({ kind: 'started', quest: q() }, CATALOG, NAMES, TEXTS)).toEqual([]);
    expect(questLines({ kind: 'ended', quest: q({ state: 14 }) }, CATALOG, NAMES, TEXTS))
      .toEqual([{ text: 'Quest Complete!', color: 0xffffff00 }]);
  });

  it('every SETQUEST at state 1 of a known quest says the next step started, a step from 0 too (DPClient.cpp:8546-8562)', () => {
    const START = { text: 'The next step of the quest has started.', color: 0xff00ff00 };
    expect(questLines(progress({ state: 1 }), CATALOG, NAMES, TEXTS)).toEqual([START]);
    const kill = { kind: 'progress' as const, before: q({ state: 1 }), after: q({ state: 1, kills: [4, 0] }) };
    expect(questLines(kill, CATALOG, NAMES, TEXTS)).toEqual([{ text: 'Defeat Small Aibatt #b(4/10)#nb' }, START]);
    // without the quest's prop Neuz says neither line, and never "Quest Complete!" for QUEST_CREGUILD (142)
    expect(questLines(progress({ state: 1 }), null, NAMES, TEXTS)).toEqual([]);
    expect(questLines({ kind: 'started', quest: q({ state: 1 }) }, null, NAMES, TEXTS)).toEqual([]);
    expect(questLines({ kind: 'ended', quest: q({ state: 14 }) }, null, NAMES, TEXTS)).toEqual([]);
    const guild = new Map([[142, { ...PROP, id: 142 }]]);
    expect(questLines({ kind: 'ended', quest: q({ id: 142, state: 14 }) }, guild, NAMES, TEXTS)).toEqual([]);
  });

  it('a time running out says the time-out and the failure, and asks for the abandon', () => {
    const change = progress({ time: 0 });
    expect(texts(questLines(change, CATALOG, NAMES, TEXTS))).toEqual(['#bYou exceeded the time limit#nb', 'Quest cancelled.']);
    expect(timedOut(change)).toBe(true);
    expect(timedOut(progress({ time: 9 }))).toBe(false);
  });

  it('a cancelled quest says "<title> quest has been cancelled."', () => {
    expect(texts(questLines({ kind: 'removed', questId: 151, cancelled: true }, CATALOG, NAMES, TEXTS)))
      .toEqual(['The Path of the Mercenary quest has been cancelled.']);
    expect(questLines({ kind: 'removed', questId: 151, cancelled: false }, CATALOG, NAMES, TEXTS)).toEqual([]);
    expect(texts(questLines({ kind: 'removed', questId: 9, cancelled: true }, null, NAMES, TEXTS))).toEqual(['Quest 9 quest has been cancelled.']);
  });
});
