import { beforeAll, expect, it } from 'vitest';
import { loadDefines } from '@flyffweb/formats';
import type { WebWorldMap } from '@flyffweb/formats';
import { ClientFs } from '../src/ClientFs';
import { buildWorldMap } from '../src/data/worldMapCatalog';
import { clientRoot, describeClient } from '../../../packages/formats/test/helpers/client';

describeClient('the world map catalog on the real client folder', () => {
  let map: WebWorldMap;
  const warnings: string[] = [];

  beforeAll(async () => {
    const client = await ClientFs.open(clientRoot()!);
    map = buildWorldMap({ client, defines: loadDefines(client.packs), warn: (s, m) => warnings.push(`${s}: ${m}`) })!;
  });

  it('reads the seven continents and every map\'s monster script without a warning', () => {
    expect(warnings).toEqual([]);
    expect(map.continents.map((c) => c.id)).toEqual([1, 2, 3, 4, 241, 242, 243]);
    expect(map.maps.slice(1).every((m) => m.monsters !== null)).toBe(true);
    expect(map.maps.reduce((n, m) => n + (m.monsters?.rows.length ?? 0), 0)).toBe(78);
    expect(map.buttons.frames).toHaveLength(27);
  });

  it('places every icon inside its map\'s rectangle, and the Flaris Aibatts where they spawn', () => {
    // the icon's centre in the 1280x960 picture, back to the world (WorldPosToMapPos, WorldMap.cpp:1463-1490, inverted)
    const world = (m: WebWorldMap['maps'][number], x: number, y: number) => ({
      x: m.bounds.x1 + ((x + 20) / 1280) * (m.bounds.x2 - m.bounds.x1),
      z: m.bounds.z2 - ((y + 20) / 960) * (m.bounds.z2 - m.bounds.z1),
    });
    for (const m of map.maps.slice(1)) {
      for (const row of m.monsters!.rows) {
        const at = world(m, row.x, row.y);
        expect(at.x).toBeGreaterThanOrEqual(m.bounds.x1);
        expect(at.x).toBeLessThanOrEqual(m.bounds.x2);
        expect(at.z).toBeGreaterThanOrEqual(m.bounds.z1);
        expect(at.z).toBeLessThanOrEqual(m.bounds.z2);
      }
    }
    // Small Aibatts spawn at x 6711-7279, z 2953-3478 (World/WdMadrigal/WdMadrigal.rgn, respawn7)
    const aibatt = world(map.maps[5]!, map.maps[5]!.monsters!.rows[0]!.x, map.maps[5]!.monsters!.rows[0]!.y);
    expect(aibatt.x).toBeGreaterThan(6411);
    expect(aibatt.x).toBeLessThan(7579);
    expect(aibatt.z).toBeGreaterThan(2653);
    expect(aibatt.z).toBeLessThan(3778);
  });
});
