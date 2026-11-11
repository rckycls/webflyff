import { CHAT_KEY, GAME_DATA_KEYS, HONOR_NEEDS_KEY, ITEM_ETC_KEY, PETS_KEY, ULTIMATE_KEY, WORLD_NO_FLY_KEY } from '@flyffweb/formats';
import type { WebChat, WebHonorNeeds, WebUltimate } from '@flyffweb/formats';
import type {
  ExpRow,
  TextEntry,
  WebEffectRef,
  WebEffectsIndex,
  WebExpRow,
  WebHonorTitles,
  WebItemEtc,
  WebItemModel,
  WebItemProp,
  WebJob,
  WebMover,
  WebNameColors,
  WebNpc,
  WebPets,
  WebSkill,
  WebTexts,
  WebWorlds,
} from '@flyffweb/formats';
import type { AssetStore } from '@flyffweb/scene';
import { itemEtcOf } from './items/itemTooltip';
import type { ItemEtc } from './items/itemTooltip';

/** NULL_ID, written `=` in `propItem.txt`: the `exclusive` and `baseIgnore` of an item that takes off and hides nothing. */
export const NO_PART = -1;

/**
 * A client text: its `TID_*` name, text and ARGB colour, and the number `defineText.h` gives the name (`textId`), which the
 * server names it by (DEFINEDTEXT); none in game files converted before the converter kept the numbers.
 */
export interface ClientText extends TextEntry {
  textId?: number;
}

/** The client texts by `TID_*` name (`textClient.inc`): the text and its ARGB colour, what GETTEXT and GETTEXTCOLOR give. */
export type Texts = ReadonlyMap<string, ClientText>;

/**
 * The converter's game-data catalogs (`data/*.json`), looked up the way Neuz looks the same things up.
 */
export interface GameData {
  /** `MoverProp` by the `MI_*` id that ADD_OBJ sends (`WebMover.index`). */
  movers: Map<number, WebMover>;
  /** The items that show a part model, by item id (`II_*`). */
  items: Map<number, WebItemModel>;
  /** The characters of `character.inc` by their key, lower-cased: `CProject::GetCharacter` (`Project.h:1376-1384`) lower-cases the key it is given. */
  npcs: Map<string, WebNpc>;
  nameColors: WebNameColors;
  /** The honour titles of `honorList.txt` by honour id (`CTitleManager::GetTitle`). */
  honorTitles: Map<number, string>;
  /**
   * 2026-11-11: the count that earns each honour title (`CTitleManager::GetNeedCount( id, -1 )`), empty without
   * `data/honorNeeds.json` (game files converted before it): the honour window then lists no title.
   */
  honorNeeds: ReadonlyMap<number, number>;
  /**
   * The web folder name of each world of `World.inc`, by world id (`WI_*`, what the world server sends in WORLD_READINFO):
   * `CWorldMng::Open` (`worldmng.cpp:206`) opens a world by that id. It lists every world, converted or not; the world is
   * converted if `worlds/<name>/manifest.json` is in the asset index.
   */
  worlds: Map<number, string>;
  /** Every item of `propItem.txt` by item id (`II_*`), with the columns the fight reads; a repeated id keeps the later row. */
  itemProps: Map<number, WebItemProp>;
  /**
   * The jobs of `propJob.inc`, `jobs[JOB_*]` (CProject::m_aPropJob), each with its name of etc.inc (`m_aJob[ id ].szName`,
   * what `GetJobString` gives the Character window).
   */
  jobs: WebJob[];
  /** The character EXP table of `ExpTable.inc`, `exp[level]` (CProject::m_aExpCharacter), the 64-bit columns as bigint. */
  exp: ExpRow[];
  /** The client texts by `TID_*` name. */
  texts: Texts;
  /** The effect (converted file and scale) of each `XI_*` id of mdlDyna.inc. */
  effects: Map<number, WebEffectRef>;
  /**
   * The job skills of `propSkill.txt` by skill id (`SI_*`, what a player's skill slot calls `dwSkill`; CProject::GetSkillProp),
   * each with its levels of `propSkillAdd.csv`. The common skills (items' and buffs' effects) are not in it.
   */
  skills: Map<number, WebSkill>;
  /**
   * Piece 7 M5: the worlds whose `.wld` says `fly 0` (`CWorld::m_bFly` false), by world id. Empty without the optional
   * `data/worldNoFly.json`: every world then allows flight, the `.wld`'s default.
   */
  noFlyWorlds: ReadonlySet<number>;
  /** 2026-11-05: the sets, socket cards and accessories the item tooltip shows; absent without `data/itemEtc.json`. */
  itemEtc?: ItemEtc;
  /** 2026-11-09: the chat's word filter and help texts; absent without `data/chat.json` (the converter's `chat` stage). */
  chat?: WebChat;
  /** 2026-11-10: the set jewels' stats and the jewel windows' descriptions; absent without `data/ultimate.json`. */
  ultimate?: WebUltimate;
  /**
   * 2026-11-09 (pets R1): the raised pets' table of `pet.inc` (`CPetProperty`), `pets.kinds[PK_*]`; absent without
   * `data/pets.json`: a summoned egg is still drawn (`MI_PET_EGG`), a hatched pet is not.
   */
  pets?: WebPets;
}

/**
 * An item of an items.json from before the converter kept `exclusive` and `baseIgnore` lacks them. That reads as the `=`
 * cell of the table, NULL_ID: the item takes off and hides nothing.
 */
const withHides = (item: WebItemModel): WebItemModel => ({
  ...item, exclusive: item.exclusive ?? NO_PART, baseIgnore: item.baseIgnore ?? NO_PART,
});

/**
 * A mover of a movers.json from before the converter kept `flying` (`dwFlying`) or `atk1` (`dwAtk1`) lacks them: it does
 * not fly, and attacks with no item (`NULL_ID`, -1).
 */
const withLaterColumns = (mover: WebMover): WebMover => ({
  ...mover, flying: mover.flying ?? false, atk1: mover.atk1 ?? -1,
});

/**
 * An item of an itemProps.json from before the converter kept `packMax` (`dwPackMax`) lacks it: it reads as 1, one to a
 * slot, so the task bar counts nothing and keeps no item id for it.
 */
const withPackMax = (prop: WebItemProp): WebItemProp => ({ ...prop, packMax: prop.packMax ?? 1 });

/** A job of a jobs.json from before the converter kept the job's name (etc.inc) lacks it: it reads as no name. */
const withTitle = (job: WebJob): WebJob => ({ ...job, title: job.title ?? '' });

/**
 * The asset index lists none of `keys`: the game files on the server were converted by a version older than these
 * catalogs (`npm run convert -- --only data` makes them).
 */
export class GameDataMissingError extends Error {
  constructor(readonly keys: string[]) {
    super(`the asset index has no ${keys.join(', ')}: the game files are older than this version`);
    this.name = 'GameDataMissingError';
  }
}

/**
 * Loads the twelve catalogs. The converter writes the movers, items, item props, skills and characters as arrays of records
 * that carry their own id or key (`gameDataStage.ts`), the honour titles, worlds, texts and effects as objects keyed
 * by the id as text, the jobs and EXP rows as arrays in table order, and the EXP columns as decimal text (they pass
 * 2^53), which become bigint here. A repeated id or key keeps the later record, as `CProject::LoadCharacter`'s
 * `SetAt` does. A catalog that is not in the asset index fails the load with a `GameDataMissingError`, before
 * anything is fetched; one that cannot be fetched fails it with the download's error.
 */
export async function loadGameData(store: Pick<AssetStore, 'json' | 'url'>): Promise<GameData> {
  const missing = Object.values(GAME_DATA_KEYS).filter((key) => store.url(key) === null);
  if (missing.length > 0) throw new GameDataMissingError(missing);
  const [movers, items, npcs, nameColors, honorTitles, worlds, itemProps, jobs, exp, texts, effects, skills] = await Promise.all([
    store.json<WebMover[]>(GAME_DATA_KEYS.movers),
    store.json<WebItemModel[]>(GAME_DATA_KEYS.items),
    store.json<WebNpc[]>(GAME_DATA_KEYS.npcs),
    store.json<WebNameColors>(GAME_DATA_KEYS.nameColors),
    store.json<WebHonorTitles>(GAME_DATA_KEYS.honorTitles),
    store.json<WebWorlds>(GAME_DATA_KEYS.worlds),
    store.json<WebItemProp[]>(GAME_DATA_KEYS.itemProps),
    store.json<WebJob[]>(GAME_DATA_KEYS.jobs),
    store.json<WebExpRow[]>(GAME_DATA_KEYS.exp),
    store.json<WebTexts>(GAME_DATA_KEYS.texts),
    store.json<WebEffectsIndex>(GAME_DATA_KEYS.effectsIndex),
    store.json<WebSkill[]>(GAME_DATA_KEYS.skills),
  ]);
  const noFly = store.url(WORLD_NO_FLY_KEY) === null ? [] : await store.json<number[]>(WORLD_NO_FLY_KEY);
  const itemEtc = store.url(ITEM_ETC_KEY) === null ? undefined : itemEtcOf(await store.json<WebItemEtc>(ITEM_ETC_KEY));
  const chat = store.url(CHAT_KEY) === null ? undefined : await store.json<WebChat>(CHAT_KEY);
  const ultimate = store.url(ULTIMATE_KEY) === null ? undefined : await store.json<WebUltimate>(ULTIMATE_KEY);
  const pets = store.url(PETS_KEY) === null ? undefined : await store.json<WebPets>(PETS_KEY); // pets R1
  // 2026-11-11: the honour titles' needs (the honour window); none in game files converted before it
  const honorNeeds = store.url(HONOR_NEEDS_KEY) === null ? {} : await store.json<WebHonorNeeds>(HONOR_NEEDS_KEY);
  return {
    movers: new Map(movers.map((mover) => [mover.index, withLaterColumns(mover)])),
    items: new Map(items.map((item) => [item.id, withHides(item)])),
    npcs: new Map(npcs.map((npc) => [npc.key.toLowerCase(), npc])),
    nameColors,
    honorTitles: new Map(Object.entries(honorTitles).map(([id, title]) => [Number(id), title])),
    honorNeeds: new Map(Object.entries(honorNeeds).map(([id, need]) => [Number(id), need])),
    worlds: new Map(Object.entries(worlds).map(([id, folder]) => [Number(id), folder])),
    itemProps: new Map(itemProps.map((prop) => [prop.id, withPackMax(prop)])),
    jobs: jobs.map(withTitle),
    exp: exp.map((row) => ({
      exp1: BigInt(row.exp1), exp2: BigInt(row.exp2), lpPoint: row.lpPoint, limitExp: BigInt(row.limitExp),
    })),
    texts: new Map(Object.entries(texts).map(([id, { text, color, textId }]): [string, ClientText] => [
      id, textId === undefined ? { id, text, color } : { id, text, color, textId },
    ])),
    effects: new Map(Object.entries(effects).map(([id, effect]) => [Number(id), effect])),
    skills: new Map(skills.map((skill) => [skill.id, skill])),
    noFlyWorlds: new Set(noFly),
    ...(itemEtc !== undefined ? { itemEtc } : {}),
    ...(chat !== undefined ? { chat } : {}),
    ...(ultimate !== undefined ? { ultimate } : {}),
    ...(pets !== undefined ? { pets } : {}),
  };
}
