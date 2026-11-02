// The audio catalog (`data/audio.json`, Piece 6 M2), loaded on its own as the world map's is: it is not one of the
// game-data catalogs every world entry needs, so game files converted before it still play, silent.

import { AUDIO_KEY } from '@flyffweb/formats';
import type { WebAudio } from '@flyffweb/formats';
import type { AssetStore } from '@flyffweb/scene';

/**
 * The catalog, or null when the asset index lacks it (said once through `report`, with what to run) or it cannot be
 * downloaded (said the same way).
 */
export async function loadAudio(
  store: Pick<AssetStore, 'json' | 'url'>, report: (error: Error) => void,
): Promise<WebAudio | null> {
  if (store.url(AUDIO_KEY) === null) {
    report(new Error('audio.json missing: run npm run convert -- --only audio,data'));
    return null;
  }
  try {
    return await store.json<WebAudio>(AUDIO_KEY);
  } catch (error) {
    report(error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}
