// custom (owner 2026-11-19): the Teleport window's places (hud/teleportPlaces.ts), the same list as the World's patch
// (outer repo, WORLDSERVER/TeleportWindow.h): the order is the packet's number.

import { describe, expect, it } from 'vitest';
import { TELEPORT_PLACE_COUNT } from '@flyffweb/protocol';
import { TELEPORT_COST, TELEPORT_PLACES, canTeleportTo, placeMarker } from '../src/world/hud/teleportPlaces';

const code = (letter: string): number => letter.charCodeAt(0);

describe('the Teleport window\'s places', () => {
  it('are V15\'s 14 teleporter points in the World\'s order, the first three for everyone', () => {
    expect(TELEPORT_PLACES.map((p) => [p.name, p.x, p.z, p.vip])).toEqual([
      ['Flaris', 7161, 3264, false],
      ['Saint Morning', 8321, 3720, false],
      ['Darkon', 3896, 4378, false],
      ['Darkon 1', 5593, 3920, true],
      ['Darkon 3', 3221, 3416, true],
      ['Shaduwar', 5933, 5393, true],
      ['Garden of Rhisis', 9273, 3720, true],
      ['Mars Dungeon', 7593, 4246, true],
      ['Dekane Mine', 5076, 3958, true],
      ['Ivillis Temple', 8629, 2178, true],
      ['Dead Wilderness', 3846, 3264, true],
      ['Volcane', 3341, 1886, true],
      ['Aminus Dungeon', 6644, 6450, true],
      ['Aminus Dungeon (Hero)', 6781, 6062, true],
    ]);
    expect(TELEPORT_PLACES).toHaveLength(TELEPORT_PLACE_COUNT);
    expect(TELEPORT_COST).toBe(10_000);
  });

  it('let everyone go to Flaris, Saint Morning and Darkon, and only VIP1-VIP4 and game masters further', () => {
    const volcane = TELEPORT_PLACES[11]!;
    expect(canTeleportTo(volcane, code('F'))).toBe(false);
    expect(canTeleportTo(volcane, code('D'))).toBe(false);
    for (const letter of ['A', 'B', 'C', 'E', 'L', 'P']) expect(canTeleportTo(volcane, code(letter))).toBe(true);
    for (const place of TELEPORT_PLACES.slice(0, 3)) expect(canTeleportTo(place, code('F'))).toBe(true);
  });

  it('mark each landing point inside its region map, with a short line about the place', () => {
    for (const place of TELEPORT_PLACES) {
      const { left, top } = placeMarker(place);
      expect(left, place.name).toBeGreaterThan(0);
      expect(left, place.name).toBeLessThan(100);
      expect(top, place.name).toBeGreaterThan(0);
      expect(top, place.name).toBeLessThan(100);
      expect(place.map, place.name).toMatch(/^WORLD_\w+\.dds$/);
      expect(place.about.length, place.name).toBeGreaterThan(10);
      expect(place.about.length, place.name).toBeLessThan(120);
    }
    expect(TELEPORT_PLACES.map((p) => p.map)).toEqual([
      'WORLD_Flaris.dds', 'WORLD_Saint.dds', 'WORLD_Darkon12.dds', 'WORLD_Darkon12.dds', 'WORLD_Darkon3.dds',
      'WORLD_harmonin.dds', 'WORLD_Ricis.dds', 'WORLD_Flaris.dds', 'WORLD_Darkon12.dds', 'WORLD_Saint.dds',
      'WORLD_Darkon3.dds', 'WORLD_Darkon3.dds', 'WORLD_harmonin.dds', 'WORLD_harmonin.dds',
    ]);
  });
});
