// custom (owner 2026-11-19): the Teleport window's places (docs/superpowers/specs/2026-11-19-teleport-window-design.md).
//
// The same list, in the same order, as the World's patch (outer repo, WORLDSERVER/TeleportWindow.h,
// patches/2026-11-19-teleport-window.patch): the index is the number the window sends (TELEPORT_WINDOW 0x8fff0120), and
// the World holds the real points, the VIP rule and the price. Keep both the same.
//
//   the points     V15's own teleporter points (Resource/character.inc, MaFl_TELEPORTER_3VETERAN's AddTeleport x, z) on
//                  Madrigal; "Darkon" is the city (the teleporter's Darkon 2 point, where V15's Darkon Blinkwing lands)
//   who            owner: "Make only flaris, darkon and sm for regular players add the other for VIP1-VIP4" (and the GMs)
//   the pictures   V15's region maps (`WORLD_*.dds`, already converted), the bounds `CWorldMap::WorldPosToMapPos` gives
//                  each (WorldMap.cpp:1394-1461; tools/convert/src/data/worldMapCatalog.ts)
//   the lines      the monsters' levels near the point (WdMadrigal.rgn) or inside the dungeon (its own .rgn)

import { VIP_AUTHORITIES } from '@flyffweb/protocol';
import { isGameMaster } from '../authorization';
import { mapPoint } from '../worldMapRules';

export interface TeleportPlace {
  name: string;
  /** The landing point on Madrigal (the World finds the ground height). */
  x: number;
  z: number;
  /** For VIP1-VIP4 and the game masters only. */
  vip: boolean;
  /** The region map shown (a theme file). */
  map: string;
  /** The line under the picture. */
  about: string;
}

/** The price of one teleport (`TELEPORT_WINDOW_COST`). */
export const TELEPORT_COST = 10_000;

/** The maps' world rectangles (x1, z1 bottom, x2, z2 top), as `WorldPosToMapPos`. */
const MAP_BOUNDS: Readonly<Record<string, { x1: number; z1: number; x2: number; z2: number }>> = {
  'WORLD_Flaris.dds': { x1: 5500, z1: 2540, x2: 9200, z2: 5130 },
  'WORLD_Saint.dds': { x1: 6854, z1: 1580, x2: 10600, z2: 4430 },
  'WORLD_Darkon12.dds': { x1: 2355, z1: 2019, x2: 7187, z2: 5814 },
  'WORLD_Darkon3.dds': { x1: 985, z1: 1621, x2: 5754, z2: 5149 },
  'WORLD_Ricis.dds': { x1: 8080, z1: 3200, x2: 10280, z2: 5000 },
  'WORLD_harmonin.dds': { x1: 4795, z1: 4587, x2: 8391, z2: 7236 },
};

const place = (name: string, x: number, z: number, vip: boolean, map: string, about: string): TeleportPlace =>
  ({ name, x, z, vip, map, about });

export const TELEPORT_PLACES: readonly TeleportPlace[] = Object.freeze([
  place('Flaris', 7161, 3264, false, 'WORLD_Flaris.dds', 'Madrigal\'s first town: shops, the bank and quests. Monsters nearby: Lv 1-22.'),
  place('Saint Morning', 8321, 3720, false, 'WORLD_Saint.dds', 'The town of Saint Morning: shops, the bank and quests. Monsters nearby: Lv 15-30.'),
  place('Darkon', 3896, 4378, false, 'WORLD_Darkon12.dds', 'The city of Darkon: shops, the bank and quests. Monsters nearby: Lv 55-73.'),
  place('Darkon 1', 5593, 3920, true, 'WORLD_Darkon12.dds', 'The fields of Darkon 1. Monsters nearby: Lv 51-67.'),
  place('Darkon 3', 3221, 3416, true, 'WORLD_Darkon3.dds', 'The heart of Darkon 3. Monsters nearby: Lv 72-91.'),
  place('Shaduwar', 5933, 5393, true, 'WORLD_harmonin.dds', 'Shaduwar, the far land past Darkon. Monsters nearby: Lv 105 and up.'),
  place('Garden of Rhisis', 9273, 3720, true, 'WORLD_Ricis.dds', 'The Garden of Rhisis, east of Saint Morning. Monsters nearby: Lv 42-49.'),
  place('Mars Dungeon', 7593, 4246, true, 'WORLD_Flaris.dds', 'The way into the Mars Dungeon. Monsters inside: Lv 21-25.'),
  place('Dekane Mine', 5076, 3958, true, 'WORLD_Darkon12.dds', 'The way into the Dekane Mine. Monsters inside: Lv 85-91.'),
  place('Ivillis Temple', 8629, 2178, true, 'WORLD_Saint.dds', 'The way into Ivillis Temple. Monsters inside: Lv 45-70.'),
  place('Dead Wilderness', 3846, 3264, true, 'WORLD_Darkon3.dds', 'The Dead Wilderness, Darkon\'s desert. Monsters nearby: Lv 68-91.'),
  place('Volcane', 3341, 1886, true, 'WORLD_Darkon3.dds', 'The way to Volcanic Island, home of Meteonyker (Lv 118).'),
  place('Aminus Dungeon', 6644, 6450, true, 'WORLD_harmonin.dds', 'The Aminus lands. Monsters nearby: Lv 108-109.'),
  place('Aminus Dungeon (Hero)', 6781, 6062, true, 'WORLD_harmonin.dds', 'The Aminus lands, the heroes\' side. Monsters nearby: Lv 108-118.'),
]);

/** Whether a player of this authorization letter may teleport there: anyone for an open place, VIP1-VIP4 and GMs else. */
export function canTeleportTo(target: TeleportPlace, authorization: number): boolean {
  if (!target.vip) return true;
  return VIP_AUTHORITIES.some((letter) => letter.charCodeAt(0) === authorization) || isGameMaster(authorization);
}

/** Where the landing point falls on the place's map, in percent of the picture (left, top). */
export function placeMarker(target: TeleportPlace): { left: number; top: number } {
  const bounds = MAP_BOUNDS[target.map];
  if (bounds === undefined) return { left: 50, top: 50 };
  const point = mapPoint(bounds, target, { left: 0, top: 0, width: 10_000, height: 10_000 });
  return { left: point.x / 100, top: point.y / 100 };
}
