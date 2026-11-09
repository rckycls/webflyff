import { describe, expect, it } from 'vitest';
import type { OwnQuest } from '@flyffweb/protocol';
import type { WebQuest } from '@flyffweb/formats';
import {
  conditionRows, createQuestLookup, isEndQuestCondition, petTermsMet, questPet, rewardLines, type QuestNames, type QuestOwner,
} from '../src/world/quests/questRules';
import { QuestMarkerIndex } from '../src/world/quests/questMarkers';

const MERCENARY: WebQuest = {
  id: 151, title: 'The Path of the Mercenary', head: 6051, npc: 'MaFl_Mustang', endNpc: 'MaFl_Mustang',
  endGoal: { x: 7153, z: 3244, text: 1 }, levelMin: 15, levelMax: 15, jobs: [0],
  kills: [{ slot: 0, mover: 20, count: 10, goal: { x: 7128, z: 3333, text: 1 } }],
  rewards: { gold: [1500, 1500] }, states: { 0: 'Slay 10 Small Aibatts.', 14: '' },
};
const RED_BANG: WebQuest = {
  id: 83, title: 'Find Red Bang Thieves', head: 6004, endNpc: 'MaFl_Luda', levelMin: 30, levelMax: 60,
  items: [{ sex: -1, type: 0, jobOrItem: -1, item: 7000, count: 1, goal: { x: 7506, z: 4210, text: 2 } },
    { sex: 1, type: 0, jobOrItem: -1, item: 7001, count: 5 }, { sex: -1, type: 0, jobOrItem: 3, item: 7002, count: 5 }],
  rewards: { exp: [14258, 14258], items: [{ sex: -1, type: 0, jobOrItem: -1, item: 7003, count: 2 }] },
  states: { 0: 'Bring a head.' },
};
const quest = (id: number, kills = 0, extra: Partial<OwnQuest> = {}): OwnQuest =>
  ({ id, state: 0, time: 0, kills: [kills, 0], patrol: false, dialog: false, ...extra });
const owner = (items: Record<number, number> = {}, extra: Partial<QuestOwner> = {}): QuestOwner => ({
  level: 15, job: 0, sex: 0, gold: 0, expPercent: 0, skillLevel: () => 0, itemCount: (item) => items[item] ?? 0,
  completed: [], ...extra,
});
const NAMES: QuestNames = {
  mover: (index) => (index === 20 ? 'Small Aibatt' : `mover ${index}`),
  item: (id) => (id === 7000 ? 'Red Bang Head' : id === 7003 ? 'Potion' : `item ${id}`),
  npc: (key) => (key === 'MaFl_Mustang' ? 'Mustang' : key === 'MaFl_Luda' ? 'Luda' : key),
};
const TEXTS = new Map();

describe('isEndQuestCondition (_Common/Mover.cpp:9274-9652)', () => {
  it("the Mercenary's first quest ends at 10 Aibatts, not 9", () => {
    expect(isEndQuestCondition(quest(151, 9), MERCENARY, owner())).toBe(false);
    expect(isEndQuestCondition(quest(151, 10), MERCENARY, owner())).toBe(true);
    expect(isEndQuestCondition(quest(151, 10, { state: 14 }), MERCENARY, owner())).toBe(false);
  });

  it('an item quest counts the inventory, filtered by sex and job', () => {
    // item 7001 is for sex 1 only, 7002 for job 3 only: neither applies to a male Vagrant
    expect(isEndQuestCondition(quest(83), RED_BANG, owner({ 7000: 0 }, { level: 30 }))).toBe(false);
    expect(isEndQuestCondition(quest(83), RED_BANG, owner({ 7000: 1 }, { level: 30 }))).toBe(true);
    expect(isEndQuestCondition(quest(83), RED_BANG, owner({ 7000: 1 }, { level: 30, job: 3 }))).toBe(false);
  });

  it('a time limit counts while minutes are left, and the met bit is ignored for the count', () => {
    const timed: WebQuest = { ...MERCENARY, limitTime: 30, kills: [] };
    expect(isEndQuestCondition(quest(151, 0, { time: 0 }), timed, owner())).toBe(false);
    expect(isEndQuestCondition(quest(151, 0, { time: 0x8005 }), timed, owner())).toBe(true);
    expect(conditionRows(quest(151, 0, { time: 0x8005 }), timed, owner(), NAMES, TEXTS)[0]!.text).toContain('5 minutes');
  });

  it('an item of type 1 with no item to own (-1) applies to everyone: not ready without it, and its row shows', () => {
    // Homesick Paul (quest 17): an item condition of type 1 and -1, Mover.cpp:9600-9608
    const PAUL: WebQuest = {
      id: 17, title: 'Homesick Paul', head: 6004, levelMin: 1, levelMax: 15,
      items: [{ sex: -1, type: 1, jobOrItem: -1, item: 7004, count: 20 }], states: { 0: 'Bring wings.' },
    };
    expect(isEndQuestCondition(quest(17), PAUL, owner())).toBe(false);
    expect(isEndQuestCondition(quest(17), PAUL, owner({ 7004: 20 }))).toBe(true);
    expect(conditionRows(quest(17), PAUL, owner({ 7004: 3 }), NAMES, TEXTS).map((row) => row.text))
      .toEqual(['item 7004 number #b(3/20)#nb']);
  });

  it('a quest with an unsupported end term is never ready', () => {
    expect(isEndQuestCondition(quest(151, 10), { ...MERCENARY, unsupported: ['party'] }, owner())).toBe(false);
  });

  it('the dialogue flag is not a condition', () => {
    const talk: WebQuest = { ...MERCENARY, kills: [], dialog: { npc: 'MaFl_Luda', key: 'k' } };
    expect(isEndQuestCondition(quest(151, 0, { dialog: false }), talk, owner())).toBe(true);
  });

  it('the state must be the one before the first state with no text', () => {
    const steps: WebQuest = { ...MERCENARY, kills: [], states: { 0: 'a', 1: 'b', 2: 'c', 14: '' } };
    expect(isEndQuestCondition(quest(151, 0, { state: 1 }), steps, owner())).toBe(false);
    expect(isEndQuestCondition(quest(151, 0, { state: 2 }), steps, owner())).toBe(true);
  });
});

describe('the rows (MakeQuestConditionItems, WndQuest.cpp:1887-2352)', () => {
  it('the rows read as Neuz writes them', () => {
    const rows = conditionRows(quest(151, 3), MERCENARY, owner(), NAMES, TEXTS);
    expect(rows.map((row) => row.text)).toEqual(['Defeat Small Aibatt #b(3/10)#nb', '#bMeet Mustang#nb']);
    expect(rows[0]!.goal).toEqual({ x: 7128, z: 3333, text: 1 });
    expect(rows[0]!.met).toBe(false);
    const done = conditionRows(quest(151, 10), MERCENARY, owner(), NAMES, TEXTS)[0]!;
    expect(done.met).toBe(true);
    expect(done.text).toBe('#cffa0a0a0Defeat Small Aibatt #b(10/10)#nb#nc');
    expect(conditionRows(quest(83), RED_BANG, owner({ 7000: 0 }), NAMES, TEXTS)[0]!.text).toBe('Red Bang Head number #b(0/1)#nb');
  });

  it('a goal at (-1, -1) is no place: its row sets no destination (WndQuest.cpp:2506)', () => {
    const nowhere: WebQuest = { ...RED_BANG, items: [{ ...RED_BANG.items![0]!, goal: { x: -1, z: -1, text: 3 } }] };
    const [row] = conditionRows(quest(83), nowhere, owner(), NAMES, TEXTS);
    expect(row!.text).toBe('Red Bang Head number #b(0/1)#nb');
    expect(row!.goal).toBeUndefined();
  });

  it('a quest not yet at its last state shows no rows', () => {
    const steps: WebQuest = { ...MERCENARY, states: { 0: 'a', 1: 'b', 14: '' } };
    expect(conditionRows(quest(151, 0), steps, owner(), NAMES, TEXTS)).toEqual([]);
  });

  it('the rewards read as Neuz writes them', () => {
    expect(rewardLines(MERCENARY, NAMES, TEXTS)).toEqual(['Penya: 1500']);
    expect(rewardLines(RED_BANG, NAMES, TEXTS)).toEqual(['Item: Potion(2)', 'Experience Gained.']);
    expect(rewardLines({ ...RED_BANG, rewards: { ...RED_BANG.rewards, gold: [10, 20], hidden: true } }, NAMES, TEXTS))
      .toEqual(['Item: ????', 'Penya: ????', 'Experience Gained.']);
    expect(rewardLines({ ...MERCENARY, rewards: { gold: [10, 20] } }, NAMES, TEXTS)).toEqual(['Penya: 10~20']);
  });
});

describe('createQuestLookup (M0 QuestLookup)', () => {
  it('the lookup gives the title and levels, and ready only for a current quest that meets its conditions', () => {
    const current = new Map([[151, quest(151, 10)]]);
    const lookup = createQuestLookup(() => new Map([[151, MERCENARY], [83, RED_BANG]]), () => current, () => owner());
    expect(lookup.titleOf(151)).toEqual({ title: 'The Path of the Mercenary', levelMin: 15, levelMax: 15 });
    expect(lookup.titleOf(999)).toBeUndefined();
    expect(lookup.isReadyToHandIn(151)).toBe(true);
    expect(lookup.isReadyToHandIn(83)).toBe(false); // not current
    expect(createQuestLookup(() => null, () => current, () => owner()).titleOf(151)).toBeUndefined();
  });
});

describe("the raised pet's quest terms (pets R3; Mover.cpp:9365-9381, :9956-9970, :10323-10337)", () => {
  // QUEST_PETTAME01 (Resource/propQuest.inc:17545-17565): begin with the egg out, end with it at 100% EXP
  const PETTAME01: WebQuest = {
    id: 1176, title: 'Raising Pet 1', head: 6004, npc: 'MaFl_PetTamer', endNpc: 'MaFl_PetTamer', levelMin: 1, levelMax: 129,
    repeat: true, beginPetLevel: 0, endPetLevel: 0, endPetExp: 100, rewards: { petLevelup: true }, states: { 0: 'Feed it.', 14: '' },
  };

  it('GetExpPercent is the whole percent of 50,000 for the egg and 100,000 for a pet', () => {
    expect(questPet(undefined)).toBeNull();
    expect(questPet({ level: 0, exp: 49999 })).toEqual({ level: 0, expPercent: 99 });
    expect(questPet({ level: 0, exp: 50000 })).toEqual({ level: 0, expPercent: 100 });
    expect(questPet({ level: 2, exp: 99999 })).toEqual({ level: 2, expPercent: 99 });
  });

  it('an EXP percent of 0 and a level of -1 are no term; otherwise a pet must be out', () => {
    expect(petTermsMet(null, undefined, undefined)).toBe(true);
    expect(petTermsMet(null, 0, -1)).toBe(true);
    expect(petTermsMet(null, undefined, 0)).toBe(false);
    expect(petTermsMet({ level: 0, expPercent: 0 }, undefined, 0)).toBe(true);
    expect(petTermsMet({ level: 1, expPercent: 100 }, 100, 0)).toBe(false);
    expect(petTermsMet({ level: 0, expPercent: 99 }, 100, 0)).toBe(false);
    expect(petTermsMet({ level: 0, expPercent: 100 }, 100, 0)).toBe(true);
  });

  it('QUEST_PETTAME01 is ready only with the egg out at 100%', () => {
    expect(isEndQuestCondition(quest(1176), PETTAME01, owner())).toBe(false);
    expect(isEndQuestCondition(quest(1176), PETTAME01, owner({}, { pet: questPet({ level: 0, exp: 49999 }) }))).toBe(false);
    expect(isEndQuestCondition(quest(1176), PETTAME01, owner({}, { pet: questPet({ level: 0, exp: 50000 }) }))).toBe(true);
    expect(isEndQuestCondition(quest(1176), PETTAME01, owner({}, { pet: questPet({ level: 1, exp: 100000 }) }))).toBe(false);
    // no row for the pet terms (MakeQuestConditionItems has none): only "Meet <NPC>"
    expect(conditionRows(quest(1176), PETTAME01, owner(), NAMES, TEXTS).map((row) => row.text)).toEqual(['#bMeet MaFl_PetTamer#nb']);
  });

  it('the tamer offers QUEST_PETTAME01 only with the egg out (its marker, __IsBeginQuestCondition)', () => {
    const index = new QuestMarkerIndex(new Map([[PETTAME01.id, PETTAME01]]));
    expect(index.forNpc('MaFl_PetTamer', new Map(), [], owner())).toBeNull();
    expect(index.forNpc('MaFl_PetTamer', new Map(), [], owner({}, { pet: { level: 1, expPercent: 0 } }))).toBeNull();
    expect(index.forNpc('MaFl_PetTamer', new Map(), [], owner({}, { pet: { level: 0, expPercent: 3 } }))).toBe('available');
    const current = new Map([[1176, quest(1176)]]);
    expect(index.forNpc('MaFl_PetTamer', current, [], owner({}, { pet: { level: 0, expPercent: 50 } }))).toBe('inProgress');
    expect(index.forNpc('MaFl_PetTamer', current, [], owner({}, { pet: { level: 0, expPercent: 100 } }))).toBe('ready');
  });
});
