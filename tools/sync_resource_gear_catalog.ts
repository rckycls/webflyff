// Refresh only the existing web item catalog's gear values from ../Resource.
// Keep names, artwork, models and every unrelated asset-index entry intact.
// 2026-11-17 (wing capes): a gear row only Resource has (an item the server adds, which the client packs lack) is added
// whole, as the converter's data stage writes an item (`webItemPropOf`): named from Resource/propItem.txt.txt, its
// model from Resource/mdlDyna.inc when that model is converted. No worn part model is made for it (items.json).
// FLYFF_RESOURCE names another Resource folder (a worktree's); the backup goes next to it, in Output.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { decodeScript, parseDefines, readModelIndex, readPropItem, readStringTable } from '@flyffweb/formats';
import type { ModelElem, WebItemProp } from '@flyffweb/formats';
import { webItemPropOf } from './convert/src/data/gameDataStage';
import { AssetWriter } from './convert/src/output/AssetWriter';

const resource = process.env.FLYFF_RESOURCE ? path.resolve(process.env.FLYFF_RESOURCE) : path.resolve('../Resource');
const root = path.dirname(resource);
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
const readText = async (name: string): Promise<string> => decodeScript(await fs.readFile(path.join(resource, name)));
const strings = readStringTable(await readText('propItem.txt.txt'), 'propItem.txt.txt');
const text = await readText('propItem.txt');
const rows = readPropItem(text, defines, strings);
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
const known = new Set(catalog.map(item => item.id));
const models = new Map<string, ModelElem>();
for (const elem of readModelIndex(await readText('mdlDyna.inc'), defines, 'mdlDyna.inc')) models.set(`${elem.type}:${elem.id}`, elem);
const added: string[] = [];
for (const id of [...gearIds].sort((a, b) => a - b)) {
  const row = byId.get(id);
  if (known.has(id) || !row) continue;
  const { item, unconverted } = webItemPropOf(row, models, modelKey => (index.files[modelKey] === undefined ? null : modelKey));
  if (unconverted !== null) console.warn(`${id} "${row.name}": model ${unconverted} is not converted`);
  catalog.push(item);
  added.push(`${id} ${row.name}`);
}
catalog.sort((a, b) => a.id - b.id);
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
if (added.length > 0) console.log(`Added ${added.length} gear items only Resource has: ${added.join(', ')}`);
