// The quest rules (Piece 7 M1), without a window:
//
//   __IsEndQuestCondition     _Common/Mover.cpp:9274-9652     whether a current quest can be handed in: every end term
//                                                            met (the time, the patrol, each kill, the skill, the gold,
//                                                            the level, the EXP percent, the state, the completed quests,
//                                                            the one-of items, each end item); the dialogue flag is not
//                                                            a term; 2026-11-09 (pets R3): the summoned raised pet's
//                                                            EXP percent and level (:9365-9381)
//   MakeQuestConditionItems   _Interface/WndQuest.cpp:1887-2352 the detail's and the tracker's rows, only at the last
//                                                            state: the time, the kills, the items, the patrol, the
//                                                            one-of items, the dialogue, then "Meet <NPC>"; a met row
//                                                            is wrapped grey (MakeString, :2354)
//   CWndQuestDetail rewards   WndQuest.cpp:1795-1875          the reward lines, "????" when hidden
//
// The terms the browser cannot judge (party, guild, disguise, karma, chaotic: `WebQuest.unsupported`) are never met.
// Their rows, and the skill row, are not drawn (plan decision 6). The pet terms have no row in Neuz either.

import type { OwnQuest, PetData } from '@flyffweb/protocol';
import { QS_END } from '@flyffweb/protocol';
import { petWholeExpPercent } from '../pets/petStatus';
import type { WebQuest, WebQuestGoal, WebQuestItem } from '@flyffweb/formats';
import type { Texts } from '../gameData';
import { formatText } from '../hud/format';
import type { QuestLookup } from '../hud/dialogue/dialogState';

export type QuestCatalog = ReadonlyMap<number, WebQuest>;

/** What __IsEndQuestCondition reads off the player. */
export interface QuestOwner {
  level: number;
  job: number;
  sex: number;
  gold: number;
  expPercent: number;
  skillLevel(skill: number): number;
  itemCount(item: number): number;
  completed: readonly number[];
  /**
   * 2026-11-09 (pets R3): the summoned raised pet (`CMover::GetPet`, `Mover.cpp:10951-10957`): its level (`PL_*`, 0 the
   * egg) and `CPet::GetExpPercent` (`pet.h:139`); null or absent with none out.
   */
  pet?: QuestPet | null;
}

/** The summoned raised pet as the quest terms read it. */
export interface QuestPet {
  level: number;
  expPercent: number;
}

/** 2026-11-09 (pets R3): the own pet item's pet (`GetPet`) as the terms read it, null for none. */
export function questPet(pet: Pick<PetData, 'level' | 'exp'> | undefined): QuestPet | null {
  return pet === undefined ? null : { level: pet.level, expPercent: petWholeExpPercent(pet) };
}

/**
 * 2026-11-09 (pets R3): the raised pet's terms, to begin (`__IsBeginQuestCondition`, Mover.cpp:9956-9970;
 * `__IsNextLevelQuest`, :10323-10337) or to end (`__IsEndQuestCondition`, :9365-9381): an EXP percent of 0 and a level of
 * -1 are no term (absent here); otherwise a pet must be out with `GetExpPercent() >= exp` and `GetLevel() == level`.
 */
export function petTermsMet(pet: QuestPet | null | undefined, exp: number | undefined, level: number | undefined): boolean {
  if (exp !== undefined && exp !== 0 && (pet == null || pet.expPercent < exp)) return false;
  if (level !== undefined && level !== -1 && (pet == null || pet.level !== level)) return false;
  return true;
}

export interface QuestNames {
  mover(index: number): string;
  item(id: number): string;
  npc(key: string): string;
}

/** One line of the conditions, as the detail window and the tracker draw it (with the dialogue's text codes). */
export interface ConditionRow {
  text: string;
  met: boolean;
  goal?: WebQuestGoal;
}

/** `m_wTime` without the "all met" bit 15: the minutes left. */
const minutesOf = (quest: OwnQuest): number => quest.time & 0x7fff;

/** The state before the first state from 1 up that has no text: the one a quest ends from (Mover.cpp:9396-9405). */
export function lastState(prop: WebQuest): number {
  let i = 1;
  while (i < QS_END && prop.states[i] !== undefined) i++;
  return i - 1;
}

/**
 * Whether an item condition or reward applies to the player: its sex, and its job or the item it asks the player to own,
 * -1 for either meaning everyone (Mover.cpp:9600-9608, WndQuest.cpp:1950-1952).
 */
function applies(item: WebQuestItem, owner: QuestOwner): boolean {
  if (item.sex !== -1 && item.sex !== owner.sex) return false;
  if (item.jobOrItem === -1) return true;
  if (item.type === 0) return item.jobOrItem === owner.job;
  return owner.itemCount(item.jobOrItem) > 0;
}

export function isEndQuestCondition(quest: OwnQuest, prop: WebQuest, owner: QuestOwner): boolean {
  if (quest.state === QS_END || (prop.unsupported?.length ?? 0) > 0) return false;
  if (prop.limitTime !== undefined && prop.limitTime !== 0 && quest.time === 0) return false;
  if (prop.patrol !== undefined && prop.patrol.world !== 0 && !quest.patrol) return false;
  for (const kill of prop.kills ?? []) if (kill.mover !== 0 && (quest.kills[kill.slot] ?? 0) < kill.count) return false;
  if (prop.endSkill !== undefined && prop.endSkill[0] !== 0 && owner.skillLevel(prop.endSkill[0]) < prop.endSkill[1]) return false;
  if (prop.endGold !== undefined && owner.gold < prop.endGold) return false;
  if (prop.endLevel !== undefined && (prop.endLevel[0] !== 0 || prop.endLevel[1] !== 0) &&
    (owner.level < prop.endLevel[0] || owner.level > prop.endLevel[1])) return false;
  if (prop.endExpPercent !== undefined && (prop.endExpPercent[0] !== 0 || prop.endExpPercent[1] !== 0) &&
    (owner.expPercent < prop.endExpPercent[0] || owner.expPercent > prop.endExpPercent[1])) return false;
  if (!petTermsMet(owner.pet, prop.endPetExp, prop.endPetLevel)) return false; // 2026-11-09 (pets R3)
  if ((prop.endState ?? 0) === 0 ? quest.state !== lastState(prop) : quest.state !== prop.endState) return false;
  const done = prop.endCompleteQuests;
  if (done !== undefined && done.oper !== 0) {
    const completed = (id: number): boolean => owner.completed.includes(id);
    if (done.oper === 1 ? !done.quests.some(completed) : !done.quests.every(completed)) return false;
  }
  const oneOf = (prop.oneItems ?? []).filter((item) => applies(item, owner));
  if (oneOf.length > 0 && !oneOf.some((item) => owner.itemCount(item.item) >= item.count)) return false;
  for (const item of prop.items ?? []) if (applies(item, owner) && owner.itemCount(item.item) < item.count) return false;
  return true;
}

const textOf = (texts: Texts, id: string, fallback: string): string => texts.get(id)?.text ?? fallback;
const grey = (text: string): string => `#cffa0a0a0${text}#nc`;

export function conditionRows(quest: OwnQuest, prop: WebQuest | undefined, owner: QuestOwner, names: QuestNames, texts: Texts): ConditionRow[] {
  if (prop === undefined || (quest.state !== lastState(prop) && quest.state !== QS_END)) return [];
  const rows: ConditionRow[] = [];
  // a goal at (-1, -1) is no place: Neuz opens no map for it (`ProcessQuestDestinationWorldMap`, WndQuest.cpp:2506)
  const row = (text: string, met: boolean, goal?: WebQuestGoal): void => {
    const place = goal !== undefined && !(goal.x === -1 && goal.z === -1);
    rows.push({ text: met ? grey(text) : text, met, ...(place ? { goal } : {}) });
  };
  if (prop.limitTime !== undefined && prop.limitTime !== 0) {
    const minutes = minutesOf(quest);
    if (minutes > 0) row(formatText(textOf(texts, 'TID_QUEST_LIMIT_TIME', 'Time Left: #b%d minutes#nb'), [minutes]), false);
    else row(`#cffff0000${textOf(texts, 'TID_QUEST_LIMIT_TIMEOUT', '#bYou exceeded the time limit#nb')}#nc`, false);
  }
  for (const kill of prop.kills ?? []) {
    if (kill.mover === 0) continue;
    const count = Math.min(quest.kills[kill.slot] ?? 0, kill.count);
    row(formatText(textOf(texts, 'TID_QUEST_KILL_NPC', 'Defeat %s #b(%d/%d)#nb'), [names.mover(kill.mover), count, kill.count]),
      count >= kill.count, kill.goal);
  }
  const itemRow = (item: WebQuestItem): void => {
    const count = Math.min(owner.itemCount(item.item), item.count);
    row(formatText(textOf(texts, 'TID_QUEST_ITEM', '%s number #b(%d/%d)#nb'), [names.item(item.item), count, item.count]),
      count >= item.count, item.goal);
  };
  for (const item of prop.items ?? []) if (applies(item, owner)) itemRow(item);
  if (prop.patrol !== undefined && prop.patrol.world !== 0) {
    const search = formatText(textOf(texts, 'TID_QUEST_PATROL', '%s Search'), [prop.patrol.name]);
    row(quest.patrol ? `${search} ${textOf(texts, 'TID_GAME_QUEST_COMPLETE_TEXT', '[Complete]')}` : search, quest.patrol, prop.patrol.goal);
  }
  const oneOf = (prop.oneItems ?? []).filter((item) => applies(item, owner));
  if (oneOf.length > 0) {
    row(textOf(texts, 'TID_QUEST_COND_ITEM', 'Must meet one of the listed requirements.'), false);
    oneOf.forEach(itemRow);
  }
  if (prop.dialog !== undefined) {
    row(formatText(textOf(texts, 'TID_QUEST_DIALOG', 'Chat with %s'), [names.npc(prop.dialog.npc)]), quest.dialog, prop.dialog.goal);
  }
  if (prop.endNpc !== undefined) {
    row(formatText(textOf(texts, 'TID_QUEST_DESTINATION', '#bMeet %s#nb'), [names.npc(prop.endNpc)]), false, prop.endGoal);
  }
  return rows;
}

/** The reward lines (WndQuest.cpp:1795-1875); `owner` filters the items by sex and job when given. */
export function rewardLines(prop: WebQuest | undefined, names: QuestNames, texts: Texts, owner?: QuestOwner): string[] {
  const rewards = prop?.rewards;
  if (rewards === undefined) return [];
  const lines: string[] = [];
  const hidden = rewards.hidden === true;
  const items = (rewards.items ?? []).filter((item) => owner === undefined || applies(item, owner));
  if (hidden && items.length > 0) lines.push(textOf(texts, 'TID_QUEST_ITEM2', 'Item: ????'));
  else for (const item of items) lines.push(formatText(textOf(texts, 'TID_QUEST_ITEM1', 'Item: %s(%d)'), [names.item(item.item), item.count]));
  const gold = rewards.gold;
  if (gold !== undefined && gold[1] > 0) {
    if (hidden) lines.push(textOf(texts, 'TID_QUEST_GOLD3', 'Penya: ????'));
    else if (gold[0] === gold[1]) lines.push(formatText(textOf(texts, 'TID_QUEST_GOLD1', 'Penya: %d'), [gold[0]]));
    else lines.push(formatText(textOf(texts, 'TID_QUEST_GOLD2', 'Penya: %d~%d'), [gold[0], gold[1]]));
  }
  if (rewards.exp !== undefined && rewards.exp[1] > 0) lines.push(textOf(texts, 'TID_QUEST_EXP1', 'Experience Gained.'));
  if ((rewards.skillPoints ?? 0) > 0) lines.push(textOf(texts, 'TID_QUEST_SKILLPOINT', 'To give the skill point'));
  return lines;
}

/** M0's `QuestLookup`, from the catalog and the own quests. */
export function createQuestLookup(
  catalog: () => QuestCatalog | null, quests: () => ReadonlyMap<number, OwnQuest>, owner: () => QuestOwner | undefined,
): QuestLookup {
  return {
    titleOf(questId) {
      const prop = catalog()?.get(questId);
      if (prop === undefined || prop.title === '') return undefined;
      return { title: prop.title, levelMin: prop.levelMin ?? 0, levelMax: prop.levelMax ?? 0 };
    },
    isReadyToHandIn(questId) {
      const quest = quests().get(questId), prop = catalog()?.get(questId), who = owner();
      return quest !== undefined && prop !== undefined && who !== undefined && isEndQuestCondition(quest, prop, who);
    },
  };
}
