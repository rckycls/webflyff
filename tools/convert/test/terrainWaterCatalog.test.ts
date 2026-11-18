// The water catalog (2026-11-19): Terrain.inc's water lists and the cloud sea's texture, as texture keys.

import { describe, expect, it } from 'vitest';
import { buildTerrainWater } from '../src/data/terrainWaterCatalog';

/** Script text with the CRLF line ends the shipped files use. */
const script = (...lines: string[]): string => lines.join('\r\n') + '\r\n';

const TERRAIN = script(
  '"sky" 0',
  '{',
  '  9 0 "sky_cloud01.dds" 0 ""',
  '  10 0 "sky_cloud02.dds" 0 ""',
  '}',
  '"water" 2',
  '{',
  '  "w1" 3',
  '  {',
  '    20 0 "water_riverAni0001.dds" 0 ""',
  '    21 0 "water_riverAni0002.dds" 0 ""',
  '    22 0 "water_riverAni0003.dds" 0 ""',
  '  }',
  '  "water2" 2',
  '  {',
  '    147 0 "water_HarAni0001.dds" 0 ""',
  '    148 0 "water_HarAni0002.dds" 0 ""',
  '  }',
  '  11 0 "water_riverAni.dds" 0 ""',
  '}',
);

describe('buildTerrainWater', () => {
  it('gives each water list its frames as terrain texture keys, and id 10 as the cloud sea', () => {
    const warnings: string[] = [];
    const water = buildTerrainWater(TERRAIN, new Map(), {
      converted: () => true,
      warn: (_source, message) => warnings.push(message),
    });
    expect(water).toEqual({
      water: [
        [
          'textures/terrain/water_riverani0001.dds.ktx2',
          'textures/terrain/water_riverani0002.dds.ktx2',
          'textures/terrain/water_riverani0003.dds.ktx2',
        ],
        ['textures/terrain/water_harani0001.dds.ktx2', 'textures/terrain/water_harani0002.dds.ktx2'],
      ],
      cloud: 'textures/terrain/sky_cloud02.dds.ktx2',
    });
    expect(warnings).toEqual([]);
  });

  it('names null, with one warning, for a texture that was not converted', () => {
    const warnings: string[] = [];
    const water = buildTerrainWater(TERRAIN, new Map(), {
      converted: (key) => !key.includes('0002') && !key.includes('cloud'),
      warn: (_source, message) => warnings.push(message),
    });
    expect(water.water[0]).toEqual([
      'textures/terrain/water_riverani0001.dds.ktx2',
      null,
      'textures/terrain/water_riverani0003.dds.ktx2',
    ]);
    expect(water.water[1]![1]).toBeNull();
    expect(water.cloud).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('water_riverAni0002.dds');
    expect(warnings[0]).toContain('sky_cloud02.dds');
  });

  it('has no lists and no cloud for a Terrain.inc without them', () => {
    const water = buildTerrainWater(script('"rock" 0', '{', '  3 0 "r.dds" 0 ""', '}'), new Map(), {
      converted: () => true,
      warn: () => undefined,
    });
    expect(water).toEqual({ water: [], cloud: null });
  });
});
