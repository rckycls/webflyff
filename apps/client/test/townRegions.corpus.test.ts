// custom (owner 2026-11-20): the town table (combat/townRegions.ts) against the client's own `.rgn` files: WdMadrigal's
// RA_TOWN rows, in file order, and no RA_TOWN row in any other world. Runs with `npm run test:corpus` (FLYFF_CLIENT).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { decodeScript, readRegions } from '@flyffweb/formats';
import { RA_TOWN, TOWN_RECTS } from '../src/world/combat/townRegions';
import { clientRoot, describeClient } from '../../../packages/formats/test/helpers/client';

const rgn = (file: string) => readRegions(decodeScript(new Uint8Array(readFileSync(file))), file);

describeClient('townRegions: V15\'s RA_TOWN rows', () => {
  it('WdMadrigal.rgn\'s RA_TOWN rects are the table\'s world 1, in file order', () => {
    const rows = rgn(path.join(clientRoot()!, 'World', 'WdMadrigal', 'WdMadrigal.rgn'));
    expect(rows.filter((row) => (row.attribute & RA_TOWN) !== 0).map((row) => row.rect)).toEqual(TOWN_RECTS.get(1));
  });

  it('no other world has an RA_TOWN row', () => {
    const worlds = path.join(clientRoot()!, 'World');
    const withTowns: string[] = [];
    for (const dir of readdirSync(worlds)) {
      const file = path.join(worlds, dir, `${dir}.rgn`);
      if (dir === 'WdMadrigal' || !existsSync(file)) continue;
      if (rgn(file).some((row) => (row.attribute & RA_TOWN) !== 0)) withTowns.push(dir);
    }
    // WdIvilisTemple.rgn is a copy of Madrigal's rows; no world id loads it (Resource/World.inc)
    expect(withTowns.filter((dir) => dir !== 'WdIvilisTemple')).toEqual([]);
  });
});
