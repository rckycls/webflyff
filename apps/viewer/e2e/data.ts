// Data the end-to-end tests read from disk: Playwright's loader does not take `import x from './x.json'`.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetIndex, WorldManifest } from '@flyffweb/formats';
import type { Spot } from '../src/compare/ComparePage';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '../../../dist/assets');

/** Madrigal's manifest, as the viewer reads it (through the asset index). */
export function madrigal(): WorldManifest {
  const index = JSON.parse(readFileSync(path.join(assets, 'index.json'), 'utf8')) as AssetIndex;
  const file = index.files['worlds/wdmadrigal/manifest.json'];
  if (file === undefined) throw new Error('the asset index has no worlds/wdmadrigal/manifest.json');
  return JSON.parse(readFileSync(path.join(assets, file), 'utf8')) as WorldManifest;
}

/** The compare page's spots, as written in `src/compare/spots.json`. */
export function spots(): Spot[] {
  return JSON.parse(readFileSync(path.join(here, '../src/compare/spots.json'), 'utf8')) as Spot[];
}
