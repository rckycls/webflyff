// Pending sends as the page shows them: with the item's name from the item list.

import type { AdminDeps } from '../adminServer';
import type { PendingSend } from '../adminStore';

/** Pending sends with the item's name ('penya' for penya; null for an id the item list does not have). */
export async function namedPendingSends(deps: AdminDeps, idPlayer: string): Promise<(PendingSend & { name: string | null })[]> {
  return (await deps.store.pendingSends(idPlayer)).map((s) => ({
    ...s,
    name: s.item.toLowerCase() === 'penya' ? 'penya' : deps.catalog.find((i) => String(i.id) === s.item)?.name ?? null,
  }));
}
