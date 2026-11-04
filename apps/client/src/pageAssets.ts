// The page's asset index and game data, each loaded once a page (2026-11-04 loading audit). The lobby's skin, the audio
// catalog, the 3-D side (`sceneAssets`) and the character list's world prefetch all read the one index (it was fetched
// and parsed twice, 2 MB each time), and the game data starts loading as the page does, not at the character list.
// A failure is forgotten, so the next call tries again.

import { AssetStore } from '@flyffweb/scene';
import { loadGameData } from './world/gameData';
import type { GameData } from './world/gameData';

let assets: Promise<AssetStore> | undefined;
let gameData: Promise<GameData> | undefined;

/** Keeps `loading` in `slot` until it fails. */
function once<T>(get: () => Promise<T> | undefined, set: (value: Promise<T> | undefined) => void, load: () => Promise<T>): Promise<T> {
  const kept = get();
  if (kept !== undefined) return kept;
  const loading = load();
  set(loading);
  loading.catch(() => {
    if (get() === loading) set(undefined);
  });
  return loading;
}

/** The asset index (`/assets/index.json`). */
export function pageAssets(): Promise<AssetStore> {
  return once(() => assets, (value) => { assets = value; }, () => AssetStore.load());
}

/** The game data (`loadGameData`) from the page's index. */
export function pageGameData(): Promise<GameData> {
  return once(() => gameData, (value) => { gameData = value; }, async () => loadGameData(await pageAssets()));
}
