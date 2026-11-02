// The world map's catalog (`data/worldMap.json`, Piece 6 M1), loaded on its own: it is not one of the game-data catalogs
// every world entry needs, so game files converted before it still play, without the map.

import { WORLD_MAP_KEY } from '@flyffweb/formats';
import type { WebWorldMap } from '@flyffweb/formats';
import type { AssetStore } from '@flyffweb/scene';

/**
 * The catalog, or null when the asset index lacks it (said once through `report`, with what to run) or it cannot be
 * downloaded (said the same way).
 */
export async function loadWorldMap(
  store: Pick<AssetStore, 'json' | 'url'>, report: (error: Error) => void,
): Promise<WebWorldMap | null> {
  if (store.url(WORLD_MAP_KEY) === null) {
    report(new Error('worldMap.json missing: run npm run convert -- --only ui,data'));
    return null;
  }
  try {
    return await store.json<WebWorldMap>(WORLD_MAP_KEY);
  } catch (error) {
    report(error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}
