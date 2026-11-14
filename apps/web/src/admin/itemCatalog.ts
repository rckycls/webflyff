// The game's item list for the Send tab (admin panel spec §5.5), from FlyffWeb's converted data: the folder Caddy serves
// at /assets has index.json, whose `files['data/itemProps.json']` names the fingerprinted item list. Read once at start.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CatalogItem {
  id: number;
  name: string;
  /** The most of it one slot holds. */
  packMax: number;
  /** A weapon or armour (kind1 1 or 2): it can carry +0 to +10. */
  upgradable: boolean;
}

/** IK1_WEAPON and IK1_ARMOR (Resource/defineItemkind.h). */
const UPGRADABLE_KINDS = new Set([1, 2]);

/** The items with a name, by id; `[]` and one warning when the data cannot be read (the Send tab then finds nothing). */
export function loadItemCatalog(assetsDir: string, warn: (line: string) => void): CatalogItem[] {
  try {
    const index = JSON.parse(readFileSync(join(assetsDir, 'index.json'), 'utf8')) as { files?: Record<string, unknown> };
    const file = index.files?.['data/itemProps.json'];
    if (typeof file !== 'string') throw new Error('index.json names no data/itemProps.json');
    const props = JSON.parse(readFileSync(join(assetsDir, file), 'utf8')) as unknown;
    if (!Array.isArray(props)) throw new Error(`${file} is not a list`);
    return props
      .filter((p): p is { id: number; name: string; packMax?: number; kind1?: number } =>
        typeof p === 'object' && p !== null && Number.isInteger(p.id) && typeof p.name === 'string' && p.name.trim() !== '')
      .map((p) => ({
        id: p.id,
        name: p.name.trim(),
        packMax: Number.isInteger(p.packMax) && p.packMax! > 0 ? p.packMax! : 1,
        upgradable: UPGRADABLE_KINDS.has(p.kind1 ?? -1),
      }))
      .sort((a, b) => a.id - b.id);
  } catch (error) {
    warn(`admin: no item list from ${assetsDir}: ${String((error as Error)?.message ?? error).replace(/[\r\n]+/g, ' ')}`);
    return [];
  }
}

/** An all-digit query finds that id first; then names holding the query, in any case. */
export function searchItems(items: CatalogItem[], query: string, limit = 30): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const byId = /^\d+$/.test(q) ? items.filter((i) => i.id === Number(q)) : [];
  const byName = items.filter((i) => i.name.toLowerCase().includes(q) && !byId.includes(i));
  return [...byId, ...byName].slice(0, limit);
}
