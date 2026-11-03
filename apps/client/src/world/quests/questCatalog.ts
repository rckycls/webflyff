// The quest catalog (`data/quests.json`, Piece 7 M1), loaded on its own as the world map's is: game files converted
// before it still play, listing quests by id (plan decision 6). A missing catalog is not an error, so it says nothing;
// one the asset index has but that cannot be downloaded is said through `report`.

import { QUESTS_KEY, type WebQuest } from '@flyffweb/formats';
import type { AssetStore } from '@flyffweb/scene';
import type { QuestCatalog } from './questRules';

export async function loadQuests(
  store: Pick<AssetStore, 'json' | 'url'>, report: (error: Error) => void,
): Promise<QuestCatalog | null> {
  if (store.url(QUESTS_KEY) === null) return null;
  try {
    const quests = await store.json<WebQuest[]>(QUESTS_KEY);
    return new Map(quests.map((quest) => [quest.id, quest]));
  } catch (error) {
    report(error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}
