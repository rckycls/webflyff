import { QS_END, type OwnQuest } from '@flyffweb/protocol';
import type { WebQuest, WebQuestItem } from '@flyffweb/formats';
import { isEndQuestCondition, type QuestCatalog, type QuestOwner } from './questRules';

export type QuestMarker = 'available' | 'future' | 'inProgress' | 'ready';
interface QuestLink { quest: WebQuest; item: number }

/** Indexes quest giver and hand-in NPCs once, then derives the v15 head marker for the current character. */
export class QuestMarkerIndex {
  private readonly sources = new Map<string, QuestLink[]>();
  private readonly destinations = new Map<string, QuestLink[]>();

  constructor(catalog: QuestCatalog) {
    for (const quest of catalog.values()) {
      if (quest.npc) this.add(this.sources, quest.npc, quest, 0);
      for (const giver of quest.givers ?? []) this.add(this.sources, giver.npc, quest, giver.item);
      if (quest.endNpc) this.add(this.destinations, quest.endNpc, quest, 0);
      for (const receiver of quest.endNpcs ?? []) this.add(this.destinations, receiver.npc, quest, receiver.item);
    }
  }

  forNpc(
    characterKey: string,
    current: ReadonlyMap<number, OwnQuest>,
    completed: readonly number[],
    owner: QuestOwner | undefined,
  ): QuestMarker | null {
    if (!characterKey || owner === undefined) return null;
    const key = characterKey.toLowerCase();
    const sources = this.sources.get(key) ?? [];
    const destinations = this.destinations.get(key) ?? [];
    let result: QuestMarker | null = null;
    for (const { quest: prop, item } of sources) {
      const active = current.get(prop.id);
      const done = completed.includes(prop.id);
      if (item !== 0 && owner.itemCount(item) === 0) continue;
      if (active === undefined && !done) {
        if (beginAllowed(prop, owner, current, completed, false)) result = 'available';
        else if (result !== 'available' && beginAllowed(prop, owner, current, completed, true)) result = 'future';
      } else if (active !== undefined && !done && active.state !== QS_END && result !== 'available') {
        result = 'inProgress';
      }
    }
    for (const { quest: prop, item } of destinations) {
      const active = current.get(prop.id);
      if (active === undefined || completed.includes(prop.id) || active.state === QS_END || (item !== 0 && owner.itemCount(item) === 0)) continue;
      if (isEndQuestCondition(active, prop, owner)) result = 'ready';
      else if (result !== 'ready' && result !== 'available') result = 'inProgress';
    }
    return result;
  }

  private add(index: Map<string, QuestLink[]>, key: string, quest: WebQuest, item: number): void {
    const name = key.toLowerCase();
    const list = index.get(name) ?? [];
    list.push({ quest, item });
    index.set(name, list);
  }
}

function beginAllowed(
  quest: WebQuest,
  owner: QuestOwner,
  current: ReadonlyMap<number, OwnQuest>,
  completed: readonly number[],
  future: boolean,
): boolean {
  if (quest.beginUnsupported || (quest.jobs?.length && !quest.jobs.includes(owner.job))) return false;
  if (quest.beginSex !== undefined && quest.beginSex !== -1 && quest.beginSex !== owner.sex) return false;
  if ((quest.beginGold ?? 0) > owner.gold) return false;
  if (quest.beginSkill !== undefined && owner.skillLevel(quest.beginSkill[0]) < quest.beginSkill[1]) return false;
  if (quest.beginPrevious !== undefined && !quest.beginPrevious.quests.every((id) => {
    const active = current.has(id), done = completed.includes(id);
    switch (quest.beginPrevious!.type) {
      case 0: return active || done;
      case 1: return !active && done;
      case 2: return active && !done;
      default: return false;
    }
  })) return false;
  for (const item of quest.beginItems ?? []) if (applies(item, owner) && owner.itemCount(item.item) < item.count) return false;
  for (const item of quest.beginNotItems ?? []) if (applies(item, owner) && owner.itemCount(item.item) >= item.count) return false;

  const min = quest.levelMin ?? 0;
  const max = quest.levelMax ?? 0;
  if (future) return min > owner.level && owner.level + 5 >= min;
  return min === 0 || (owner.level >= min && owner.level <= max);
}

function applies(item: WebQuestItem, owner: QuestOwner): boolean {
  if (item.sex !== -1 && item.sex !== owner.sex) return false;
  if (item.jobOrItem === -1) return true;
  if (item.type === 0) return item.jobOrItem === owner.job;
  return owner.itemCount(item.jobOrItem) > 0;
}
