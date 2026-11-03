// Refresh only the existing web item catalog's gear values from ../Resource.
// Keep names, artwork, models and every unrelated asset-index entry intact.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { decodeScript, parseDefines, readPropItem } from '@flyffweb/formats';
import type { WebItemProp } from '@flyffweb/formats';
import { AssetWriter } from './convert/src/output/AssetWriter';

const root = path.resolve('..');
const resource = path.join(root, 'Resource');
const out = path.resolve('dist/assets');
const indexFile = path.join(out, 'index.json');
const indexBytes = await fs.readFile(indexFile);
const index = JSON.parse(indexBytes.toString('utf8')) as { version: number; files: Record<string, string> };
const key = 'data/itemProps.json';
const currentPath = index.files[key];
if (!currentPath) throw new Error('Existing item catalog is missing');
const currentBytes = await fs.readFile(path.join(out, currentPath));
const catalog = JSON.parse(currentBytes.toString('utf8')) as WebItemProp[];
const defines = new Map<string, number>();
for (const name of await fs.readdir(resource)) {
  if (/^(define.*|lang|resdata|wndstyle)\.h$/i.test(name)) {
    parseDefines(decodeScript(await fs.readFile(path.join(resource, name))), defines, name);
  }
}
const text = decodeScript(await fs.readFile(path.join(resource, 'propItem.txt')));
const rows = readPropItem(text, defines, new Map());
const gearIds = new Set<number>();
for (const line of text.split(/\r?\n/)) {
  const fields = line.trim().split(/\s+/);
  if (fields[18]?.startsWith('PARTS_') && fields[1]?.startsWith('II_') &&
      fields[1] !== 'II_WEA_HAN_HAND' && !fields[1].startsWith('II_WEA_MOB_')) {
    const id = defines.get(fields[1]);
    if (id !== undefined) gearIds.add(id);
  }
}
const byId = new Map(rows.map(row => [row.id, row]));
let changed = 0;
for (const item of catalog) {
  if (!gearIds.has(item.id)) continue;
  const row = byId.get(item.id);
  if (!row) throw new Error(`Resource gear ${item.id} is missing`);
  const next = { ...item, abilityMin: row.abilityMin, abilityMax: row.abilityMax, adjParams: [...row.adjParams] };
  if (JSON.stringify(item) !== JSON.stringify(next)) changed++;
  Object.assign(item, next);
}
const backup = path.join(root, 'Output/before-resource-gear-catalog');
await fs.mkdir(backup, { recursive: true });
for (const [name, bytes] of [['index.json', indexBytes], ['itemProps.json', currentBytes]] as const) {
  try { await fs.writeFile(path.join(backup, name), bytes, { flag: 'wx' }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
}
const writer = new AssetWriter(out);
index.files[key] = await writer.write(key, new TextEncoder().encode(JSON.stringify(catalog)), 'Resource/propItem.txt');
await fs.writeFile(indexFile, JSON.stringify(index));
console.log(`Updated ${changed} existing gear catalog entries; ${catalog.length} total items; ${index.files[key]}`);
