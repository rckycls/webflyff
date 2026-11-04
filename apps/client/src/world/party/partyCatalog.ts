// The party catalog (`data/party.json`, Piece 7 M4), loaded on its own as the quests' is: game files converted before it
// still play, with no party skills offered (plan Decisions 17). A missing catalog is not an error, so it says nothing;
// one the asset index has but that cannot be downloaded is said through `report`.

import { PARTY_KEY, type WebParty } from '@flyffweb/formats';
import type { AssetStore } from '@flyffweb/scene';

export async function loadParty(store: Pick<AssetStore, 'json' | 'url'>, report: (error: Error) => void): Promise<WebParty | null> {
  if (store.url(PARTY_KEY) === null) return null;
  try {
    return await store.json<WebParty>(PARTY_KEY);
  } catch (error) {
    report(error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}
