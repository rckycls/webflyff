// The world map's rules (Piece 6 M1), copied from CWorldMap (Source/Neuz/WorldMap.cpp) and CContinent
// (Source/_Common/Continent.cpp): which map the player is on, where a world point falls on a picture, the arrow, the
// buttons' frames and the monster tooltip. Pure: the window (`hud/worldMap.ts`) draws what these give.

import type { MapMonsterRow, WebWorldMap } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/protocol';

const f = Math.fround;

/** `GetMapNo`'s answer for no map (Continent.cpp:407-430): the player is off Madrigal, or in none of its continents. */
export const MAP_NONE = 100;

/**
 * `CContinent::Point_In_Poly` (Continent.cpp:219-254) for the integer point (`x`, `z`): crossings counted edge by edge
 * in ring order, with the C++'s integer intersection (`xinters`, all LONG: truncated before it becomes a double).
 */
export function pointInPoly(x: number, z: number, ring: ReadonlyArray<readonly [number, number]>): boolean {
  if (ring.length === 0) return false;
  let counter = 0;
  let [p1x, p1z] = ring[0]!;
  for (let i = 1; i <= ring.length; i++) {
    const [p2x, p2z] = ring[i % ring.length]!;
    if (z > Math.min(p1z, p2z) && z <= Math.max(p1z, p2z) && x <= Math.max(p1x, p2x) && p1z !== p2z) {
      const xinters = Math.trunc(((z - p1z) * (p2x - p1x)) / (p2z - p1z)) + p1x;
      if (p1x === p2x || x <= xinters) counter++;
    }
    [p1x, p1z] = [p2x, p2z];
  }
  return counter % 2 === 1;
}

/**
 * `CContinent::GetMapNo( g_pPlayer )` (Continent.cpp:405-432): `MAP_NONE` off the map's world; else the map of the first
 * continent, in ascending id (`GetContinent`'s `std::map` order, :288-304), whose outline holds the truncated point
 * (`(long)vPos.x`, `(long)vPos.z`); `MAP_NONE` in none.
 */
export function mapNumber(worldId: number, pos: { x: number; z: number }, map: Pick<WebWorldMap, 'world' | 'continents'>): number {
  if (worldId !== map.world) return MAP_NONE;
  const x = Math.trunc(f(pos.x));
  const z = Math.trunc(f(pos.z));
  for (const continent of map.continents) if (pointInPoly(x, z, continent.ring)) return continent.map;
  return MAP_NONE;
}

/**
 * `CWorldMap::WorldPosToMapPos` (WorldMap.cpp:1463-1490): the point of `rect` (left, top to left + width, top + height)
 * where the world point `pos` falls on a map whose picture shows `bounds`, positive z toward the top, in FLOAT
 * (`D3DXVec3Lerp( v3, v2, v1, rate )` from the bottom-right corner) and truncated to int.
 */
export function mapPoint(
  bounds: { x1: number; z1: number; x2: number; z2: number }, pos: { x: number; z: number },
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const rate1 = f(f(f(bounds.x2) - f(pos.x)) / f(f(bounds.x2) - f(bounds.x1)));
  const rate2 = f(f(f(bounds.z1) - f(pos.z)) / f(f(bounds.z1) - f(bounds.z2)));
  const [left, top] = [f(rect.left), f(rect.top)];
  const [right, bottom] = [f(rect.left + rect.width), f(rect.top + rect.height)];
  return {
    x: Math.trunc(f(right + f(rate1 * f(left - right)))),
    y: Math.trunc(f(bottom + f(rate2 * f(top - bottom)))),
  };
}

/**
 * The arrow's turn (`RenderPlayer`, WorldMap.cpp:593-611): the direction from the camera to the player, as the yaw
 * `QuaternionRotationToYPW` gives (`atan2( dx, dz )`, _Common/xUtil3D.cpp:7-22): 0 looking north, π/2 looking east.
 */
export function cameraYaw(camera: Vec3, player: Vec3): number {
  return Math.atan2(player[0] - camera[0], player[2] - camera[2]);
}

/**
 * The arrow's CSS matrix `a, b, c, d` for a picture `width` by `height` (RenderPlayer, WorldMap.cpp:578-613, :725-738):
 * the 37x35 arrow scaled to 0.07 of the identity view (0.035 of the picture across per texel of the 37), turned
 * clockwise by `yaw`, and squeezed by the picture's aspect as the identity matrices draw it in Neuz.
 */
export function arrowMatrix(yaw: number, width: number, height: number): [number, number, number, number] {
  const kW = (0.035 * width) / 37;
  const kH = (0.035 * height) / 37;
  const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)];
  return [kW * cos, kH * sin, -kW * sin, kH * cos];
}

/**
 * Button `i`'s rectangle on a picture `height` pixels tall (WorldMap.cpp:327-380): 228x88 scaled by `height / 1024`
 * (`m_fRate`, :328) and truncated, stacked with no gap from y = 80 scaled, at the picture's left edge.
 */
export function buttonRect(i: number, height: number): { x: number; y: number; w: number; h: number } {
  const rate = f(height / 1024);
  const w = Math.trunc(f(228 * rate));
  const h = Math.trunc(f(88 * rate));
  return { x: 0, y: Math.trunc(f(80 * rate)) + i * h, w, h };
}

/**
 * Button `i`'s frame of `texMapButton.inc` (`m_nDrawMenu`, WorldMap.cpp:428-465, :828): three per button, the hover
 * frame on a hovered button that is not the shown map, the selected frame on the shown map's. The monster switch (8)
 * is never the shown map, so it is never drawn selected.
 */
export function buttonFrame(i: number, shown: number, hovered: number | null): number {
  if (i === shown) return 3 * i + 2;
  return 3 * i + (hovered === i ? 1 : 0);
}

export interface TipLine {
  parts: Array<{ text: string; color: number }>;
  /** The line's element icon (`eElementType`, 0 for none). */
  element: number;
}

const BLACK = 0xff000000; // CEditString's default colour (EditString.h:117)

/**
 * The monster icon's tooltip (CWorldMap::Process, WorldMap.cpp:478-516): for each mover of the row with a MoverProp,
 * "Lv." in blue, its level, its name (the row's last mover in red, "only the giant"), and its element; then an empty
 * line and "Booty : " with the row's drop, or "None".
 */
export function monsterTip(
  row: MapMonsterRow,
  movers: ReadonlyMap<number, { name: string; level: number; element: number }>,
  itemProps: ReadonlyMap<number, { name: string }>,
  texts: ReadonlyMap<string, { text: string }>,
): TipLine[] {
  const text = (id: string): string => texts.get(id)?.text ?? id;
  const lines: TipLine[] = [];
  row.movers.forEach((id, i) => {
    const mover = movers.get(id);
    if (mover === undefined) return;
    lines.push({
      parts: [
        { text: text('TID_GAME_MONSTER_INFORMATION_LEVEL'), color: 0xff0000ff },
        { text: `${mover.level} `, color: 0xff8282c8 },
        { text: mover.name, color: i === row.movers.length - 1 ? 0xffff0000 : BLACK },
      ],
      element: mover.element,
    });
  });
  lines.push({ parts: [], element: 0 });
  const item = row.drop === 0 ? undefined : itemProps.get(row.drop);
  lines.push({
    parts: [
      { text: `${text('TID_GAME_DROP_ITEM')} : `, color: BLACK },
      item === undefined ? { text: text('TID_GAME_DROP_NONE'), color: BLACK } : { text: item.name, color: 0xff2e70a9 },
    ],
    element: 0,
  });
  return lines;
}
