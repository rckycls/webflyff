import { GAME_DATA_KEYS } from '@flyffweb/formats';
import type { WebHonorTitles, WebItemModel, WebMover, WebNameColors, WebNpc, WebWorlds } from '@flyffweb/formats';
import type { AssetStore } from '@flyffweb/scene';

/** NULL_ID, written `=` in `propItem.txt`: the `exclusive` and `baseIgnore` of an item that takes off and hides nothing. */
export const NO_PART = -1;

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
   * The web folder name of each world of `World.inc`, by world id (`WI_*`, what the world server sends in WORLD_READINFO):
   * `CWorldMng::Open` (`worldmng.cpp:206`) opens a world by that id. It lists every world, converted or not; the world is
   * converted if `worlds/<name>/manifest.json` is in the asset index.
   */
  worlds: Map<number, string>;
}

/**
 * An item of an items.json from before the converter kept `exclusive` and `baseIgnore` lacks them. That reads as the `=`
 * cell of the table, NULL_ID: the item takes off and hides nothing.
 */
const withHides = (item: WebItemModel): WebItemModel => ({
  ...item, exclusive: item.exclusive ?? NO_PART, baseIgnore: item.baseIgnore ?? NO_PART,
});

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
 * Loads the six catalogs. The converter writes the movers, items and characters as arrays of records that carry
 * their own id or key (`gameDataStage.ts`), and the honour titles and worlds as objects keyed by the id as text. A
 * repeated id or key keeps the later record, as `CProject::LoadCharacter`'s `SetAt` does. A catalog that is not in the
 * asset index fails the load with a `GameDataMissingError`, before anything is fetched; one that cannot be fetched
 * fails it with the download's error.
 */
export async function loadGameData(store: Pick<AssetStore, 'json' | 'url'>): Promise<GameData> {
  const missing = Object.values(GAME_DATA_KEYS).filter((key) => store.url(key) === null);
  if (missing.length > 0) throw new GameDataMissingError(missing);
  const [movers, items, npcs, nameColors, honorTitles, worlds] = await Promise.all([
    store.json<WebMover[]>(GAME_DATA_KEYS.movers),
    store.json<WebItemModel[]>(GAME_DATA_KEYS.items),
    store.json<WebNpc[]>(GAME_DATA_KEYS.npcs),
    store.json<WebNameColors>(GAME_DATA_KEYS.nameColors),
    store.json<WebHonorTitles>(GAME_DATA_KEYS.honorTitles),
    store.json<WebWorlds>(GAME_DATA_KEYS.worlds),
  ]);
  return {
    movers: new Map(movers.map((mover) => [mover.index, mover])),
    items: new Map(items.map((item) => [item.id, withHides(item)])),
    npcs: new Map(npcs.map((npc) => [npc.key.toLowerCase(), npc])),
    nameColors,
    honorTitles: new Map(Object.entries(honorTitles).map(([id, title]) => [Number(id), title])),
    worlds: new Map(Object.entries(worlds).map(([id, folder]) => [Number(id), folder])),
  };
}
