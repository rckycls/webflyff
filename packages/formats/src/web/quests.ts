// The quest catalog (Piece 7 M1): `data/quests.json`, the `QuestProp`s of the five quest files Neuz loads
// (Resource/Masquerade.prj:116-123, CProject::LoadPropQuest, Source/_Common/Project.cpp:1368-2517), with the fields the
// browser shows or judges. Party and guild quests are the world server's only and are not in it.

/** The data key of the catalog: optional, as the world map's. */
export const QUESTS_KEY = 'data/quests.json';

/** The quest files of `Masquerade.prj:116-123`, in its order. */
export const QUEST_FILES = [
  'propQuest.inc', 'propQuest-RequestBox.inc', 'propQuest-Scenario.inc', 'propQuest-RequestBox2.inc',
  'propQuest-DungeonandPK.inc',
] as const;

/** `QUEST_KIND_*` (Resource/definequest.h:507-510): the four tabs of the quest window. */
export const QUEST_KIND = { SCENARIO: 6000, NORMAL: 6001, REQUEST: 6002, EVENT: 6003 } as const;

/** `QuestGoalData` (Project.h:71-79) without its index: where a condition is fulfilled, and its destination text id. */
export interface WebQuestGoal {
  x: number;
  z: number;
  text: number;
}

/** `QuestPropItem`: an item a condition or a reward names, for a sex (-1 any) and, by `type`, a job or an owned item. */
export interface WebQuestItem {
  sex: number;
  type: number;
  jobOrItem: number;
  item: number;
  count: number;
  goal?: WebQuestGoal;
}

/** One `QuestProp`. A title-only entry (1992-1997, 6000-6060) is a folder of the quest window's tree. */
export interface WebQuest {
  id: number;
  title: string;
  /** `m_nHeadQuest`, after the 1800-1999 remap (Project.cpp:2329-2364): the parent folder. */
  head: number;
  /** `SetCharacter`: the NPC that gives it. */
  npc?: string;
  /** `SetEndCondCharacter`: the NPC that takes it back, and where. */
  endNpc?: string;
  endGoal?: WebQuestGoal;
  levelMin?: number;
  levelMax?: number;
  jobs?: number[];
  /** `!SetRemove( n )`: the player cannot abandon it. */
  noRemove?: true;
  /** `SetRepeat`: it never joins the completed list. */
  repeat?: true;
  /** `SetEndCondLimitTime`, minutes. */
  limitTime?: number;
  kills?: Array<{ slot: number; mover: number; count: number; goal?: WebQuestGoal }>;
  items?: WebQuestItem[];
  oneItems?: WebQuestItem[];
  patrol?: { world: number; name: string; goal?: WebQuestGoal };
  dialog?: { npc: string; key: string; goal?: WebQuestGoal };
  endLevel?: [number, number];
  endGold?: number;
  endExpPercent?: [number, number];
  endSkill?: [number, number];
  endState?: number;
  endCompleteQuests?: { oper: number; quests: number[] };
  /** End conditions set to anything but their default that the browser cannot judge ('party', 'guild', 'pet' ...). */
  unsupported?: string[];
  rewards?: {
    items?: WebQuestItem[];
    gold?: [number, number];
    exp?: [number, number];
    skillPoints?: number;
    pk?: [number, number];
    hidden?: true;
  };
  /** `state N { SetDesc( ... ) }`: the description of each state. */
  states: Record<number, string>;
}
