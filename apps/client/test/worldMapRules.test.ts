import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readContinents } from '@flyffweb/formats';
import type { WebWorldMap } from '@flyffweb/formats';
import {
  MAP_NONE, arrowMatrix, buttonFrame, buttonRect, cameraYaw, mapNumber, mapPoint, monsterTip, pointInPoly,
} from '../src/world/worldMapRules';

// Client/World/WdMadrigal/WdMadrigal.wld.cnt, copied as it is: the seven outlines GetContinent tests.
const CNT = readFileSync(path.join(__dirname, 'fixtures', 'WdMadrigal.wld.cnt'), 'latin1');
const MAP_OF: Record<number, number> = { 1: 5, 2: 4, 3: 3, 4: 7, 241: 1, 242: 2, 243: 6 };
/** `WorldPosToMapPos`'s rectangles (WorldMap.cpp:1394-1461), by map index. */
const BOUNDS = [
  [0, 1298, 11800, 9757], [2355, 2019, 7187, 5814], [985, 1621, 5754, 5149], [8080, 3200, 10280, 5000],
  [6854, 1580, 10600, 4430], [5500, 2540, 9200, 5130], [4795, 4587, 8391, 7236], [5150, 5573, 9890, 9158],
].map(([x1, z1, x2, z2]) => ({ x1: x1!, z1: z1!, x2: x2!, z2: z2! }));
const MAP: Pick<WebWorldMap, 'world' | 'continents'> = {
  world: 1,
  continents: readContinents(CNT, 'WdMadrigal.wld.cnt').filter((c) => !c.town)
    .map((c) => ({ id: c.id, map: MAP_OF[c.id]!, ring: c.ring })),
};
const PICTURE = { left: 0, top: 0, width: 1280, height: 960 };

describe('the current map (CContinent::GetContinent and GetMapNo, Continent.cpp:219-304, :405-432)', () => {
  // [R §4] fixtures: the point, its map, where it falls on that map and on map 0
  const FIXTURES: Array<[number, number, number, [number, number], [number, number]]> = [
    [6968, 3328, 5, [507, 667], [755, 729]], // the Flaris lodestar
    [8470, 3635, 4, [552, 267], [918, 694]], // Saint Morning
    [3808, 4455, 1, [384, 343], [413, 601]], // Darken
    [2500, 3000, 2, [406, 584], [271, 766]],
    [9500, 4300, 3, [826, 373], [1030, 619]],
    [6500, 6000, 6, [606, 447], [705, 426]],
    [7200, 7100, 7, [553, 551], [781, 301]],
  ];
  it.each(FIXTURES)('(%i, %i) is on map %i, at %j there and %j on map 0', (x, z, map, onMap, onWorld) => {
    expect(mapNumber(1, { x, z }, MAP as WebWorldMap)).toBe(map);
    expect(mapPoint(BOUNDS[map]!, { x, z }, PICTURE)).toEqual({ x: onMap[0], y: onMap[1] });
    expect(mapPoint(BOUNDS[0]!, { x, z }, PICTURE)).toEqual({ x: onWorld[0], y: onWorld[1] });
  });

  it('takes the lowest id where two outlines overlap, and none on a shared edge or off Madrigal', () => {
    expect(mapNumber(1, { x: 6370, z: 3826 }, MAP as WebWorldMap)).toBe(5); // in Flaris and Darkon12: Flaris
    expect(mapNumber(1, { x: 7253, z: 2690 }, MAP as WebWorldMap)).toBe(MAP_NONE);
    expect(mapNumber(200, { x: 6968, z: 3328 }, MAP as WebWorldMap)).toBe(MAP_NONE); // Mars Mine
  });

  it('counts crossings with the integer intersection of Point_In_Poly', () => {
    const square: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    expect(pointInPoly(5, 5, square)).toBe(true);
    expect(pointInPoly(11, 5, square)).toBe(false);
    expect(pointInPoly(5, 0, square)).toBe(false); // ty > min(p1.y, p2.y) leaves the bottom edge out
    expect(pointInPoly(5, 10, square)).toBe(true); // ty <= max(...) keeps the top edge in
  });
});

describe('the picture (WorldPosToMapPos, WorldMap.cpp:1463-1490)', () => {
  it('puts every map\'s corners at the picture\'s corners, positive z up', () => {
    for (const b of BOUNDS) {
      expect(mapPoint(b, { x: b.x1, z: b.z2 }, PICTURE)).toEqual({ x: 0, y: 0 });
      expect(mapPoint(b, { x: b.x2, z: b.z1 }, PICTURE)).toEqual({ x: 1280, y: 960 });
    }
  });
});

describe('the arrow (RenderPlayer, WorldMap.cpp:578-613)', () => {
  it('turns by the camera\'s yaw, from the camera to the player', () => {
    expect(cameraYaw([0, 10, -5], [0, 0, 0])).toBeCloseTo(0); // camera south of the player: looking north
    expect(cameraYaw([-5, 10, 0], [0, 0, 0])).toBeCloseTo(Math.PI / 2); // camera west: looking east
  });

  it('is 0.035 of the view across, squeezed by its aspect, as the identity matrices draw it', () => {
    const [a, b, c, d] = arrowMatrix(0, 1280, 960);
    expect(37 * a).toBeCloseTo(44.8, 1);
    expect(35 * d).toBeCloseTo(31.8, 1);
    expect(b).toBeCloseTo(0);
    expect(c).toBeCloseTo(0);
  });
});

describe('the buttons (CWorldMap, WorldMap.cpp:327-465, :828-849)', () => {
  it('stacks 228x88 buttons from y 80, scaled by the height over 1024 and truncated', () => {
    expect(buttonRect(0, 768)).toEqual({ x: 0, y: 60, w: 171, h: 66 });
    expect(buttonRect(8, 768)).toEqual({ x: 0, y: 588, w: 171, h: 66 });
  });

  it('draws the shown map selected, a hovered other one hovered, and the monster switch never selected', () => {
    expect(buttonFrame(5, 5, 5)).toBe(17);
    expect(buttonFrame(3, 5, 3)).toBe(10);
    expect(buttonFrame(3, 5, null)).toBe(9);
    expect(buttonFrame(8, 5, 8)).toBe(25);
  });
});

describe('the monster tooltip (CWorldMap::Process, WorldMap.cpp:467-531)', () => {
  const movers = new Map([20, 21, 22, 23].map((id, i) => [id, { name: `Aibatt ${i}`, level: i + 1, element: 4 }]));
  const itemProps = new Map([[2900, { name: 'Twinkle Stone' }]]);
  const texts = new Map([
    ['TID_GAME_MONSTER_INFORMATION_LEVEL', { text: 'Lv.', color: 0xff000000 }],
    ['TID_GAME_DROP_ITEM', { text: 'Booty', color: 0xffffffff }],
    ['TID_GAME_DROP_NONE', { text: 'None', color: 0xffffffff }],
  ]);
  const row = { movers: [20, 21, 22, 23], x: 436, y: 760, drop: 2900 };

  it('lists each mover as Lv. and name, the last in red, then the booty', () => {
    const lines = monsterTip(row, movers, itemProps, texts);
    expect(lines).toHaveLength(6);
    expect(lines[0]).toEqual({
      parts: [{ text: 'Lv.', color: 0xff0000ff }, { text: '1 ', color: 0xff8282c8 }, { text: 'Aibatt 0', color: 0xff000000 }],
      element: 4,
    });
    expect(lines[3]!.parts[2]).toEqual({ text: 'Aibatt 3', color: 0xffff0000 });
    expect(lines[4]).toEqual({ parts: [], element: 0 });
    expect(lines[5]!.parts).toEqual([{ text: 'Booty : ', color: 0xff000000 }, { text: 'Twinkle Stone', color: 0xff2e70a9 }]);
  });

  it('says None for no drop, and leaves out a mover with no MoverProp', () => {
    const lines = monsterTip({ ...row, movers: [20, 999], drop: 0 }, movers, itemProps, texts);
    expect(lines).toHaveLength(3);
    expect(lines[2]!.parts).toEqual([{ text: 'Booty : ', color: 0xff000000 }, { text: 'None', color: 0xff000000 }]);
  });
});
