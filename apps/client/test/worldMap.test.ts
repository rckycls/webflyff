// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORLD_MAP_KEY, readContinents } from '@flyffweb/formats';
import type { WebWorldMap } from '@flyffweb/formats';
import { WorldMap } from '../src/world/hud/worldMap';
import type { MapView } from '../src/world/hud/worldMap';
import { loadWorldMap } from '../src/world/worldMapData';

const CNT = readFileSync(path.join(__dirname, 'fixtures', 'WdMadrigal.wld.cnt'), 'latin1');
const MAP_OF: Record<number, number> = { 1: 5, 2: 4, 3: 3, 4: 7, 241: 1, 242: 2, 243: 6 };
const BOUNDS = [
  [0, 1298, 11800, 9757], [2355, 2019, 7187, 5814], [985, 1621, 5754, 5149], [8080, 3200, 10280, 5000],
  [6854, 1580, 10600, 4430], [5500, 2540, 9200, 5130], [4795, 4587, 8391, 7236], [5150, 5573, 9890, 9158],
];
const CONTINENT = [null, 241, 242, 3, 2, 1, 243, 4];
const frames = (n: number, w: number, h: number, perRow: number) =>
  Array.from({ length: n }, (_, i) => ({ x: (i % perRow) * w, y: Math.floor(i / perRow) * h, w, h }));
const DATA: WebWorldMap = {
  world: 1,
  maps: BOUNDS.map(([x1, z1, x2, z2], index) => ({
    index,
    picture: `ui/world_${index}.png`,
    bounds: { x1: x1!, z1: z1!, x2: x2!, z2: z2! },
    continent: CONTINENT[index]!,
    monsters: index === 0 ? null : {
      sheet: `ui/texmapmonster_${index}.png`,
      frames: frames(2, 40, 40, 3),
      // the Aibatts at (436, 760), and a second icon 100 px to the right
      rows: [{ movers: [20, 21], x: 436, y: 760, drop: 2900 }, { movers: [21], x: 536, y: 760, drop: 0 }],
    },
  })),
  continents: readContinents(CNT, 'WdMadrigal.wld.cnt').filter((c) => !c.town)
    .map((c) => ({ id: c.id, map: MAP_OF[c.id]!, ring: c.ring })),
  buttons: { sheet: 'ui/texmapbutton.png', frames: frames(27, 228, 88, 3) },
  arrow: 'ui/imgmaparrow.png',
  tooltipTiles: Array.from({ length: 9 }, (_, i) => `ui/wndtooltiptile0${i}.png`),
};
const GAME = {
  movers: new Map([[20, { name: 'Small Aibatt', level: 1, element: 4 }], [21, { name: 'Aibatt', level: 3, element: 4 }]]),
  itemProps: new Map([[2900, { name: 'Twinkle Stone' }]]),
  texts: new Map([
    ['TID_GAME_MONSTER_INFORMATION_LEVEL', { text: 'Lv.', color: 0xff000000 }],
    ['TID_GAME_DROP_ITEM', { text: 'Booty', color: 0xffffffff }],
    ['TID_GAME_DROP_NONE', { text: 'None', color: 0xffffffff }],
  ]),
};
const ART = { url: (key: string) => key, sheets: null };
const FLARIS: MapView = { worldId: 1, pos: [6968, 100, 3328], camera: [6968, 110, 3320], name: 'Rocky' };

let maps: WorldMap[] = [];
function make(data: WebWorldMap | null = DATA) {
  const say = vi.fn();
  const map = new WorldMap(ART, data, GAME as never, say, document);
  document.body.append(map.element);
  maps.push(map);
  return { map, say };
}
afterEach(() => {
  for (const map of maps) map.dispose();
  maps = [];
});
const q = (map: WorldMap, selector: string) => map.element.querySelector<HTMLElement>(selector);
const press = (el: Element, type = 'pointerdown', init: MouseEventInit = {}, pointerType = 'mouse') => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  el.dispatchEvent(event);
  return event;
};
const key = (code: string, k: string) => {
  const event = new KeyboardEvent('keydown', { code, key: k, bubbles: true, cancelable: true });
  window.dispatchEvent(event);
  return event;
};

describe('WorldMap: opening and closing (CWndMap::Initialize, WorldMap.cpp:922-999)', () => {
  it('opens on the map of the continent the player stands in, its button selected, and closes on toggle', () => {
    const { map } = make();
    map.toggle(FLARIS);
    expect(map.isOpen).toBe(true);
    expect(q(map, '.hud-worldmap-picture')!.style.backgroundImage).toContain('ui/world_5.png');
    expect(q(map, '[data-map-button="5"]')!.dataset.frame).toBe('17');
    expect(q(map, '[data-map-button="0"]')!.dataset.frame).toBe('0');
    map.toggle(FLARIS);
    expect(map.isOpen).toBe(false);
    expect(map.element.hidden).toBe(true);
  });

  it('says TID_GAME_MAPMSG and stays closed off Madrigal or outside every continent', () => {
    const { map, say } = make();
    map.toggle({ ...FLARIS, worldId: 200 });
    map.toggle({ ...FLARIS, pos: [7253, 0, 2690] });
    expect(say).toHaveBeenCalledTimes(2);
    expect(say).toHaveBeenCalledWith('TID_GAME_MAPMSG');
    expect(map.isOpen).toBe(false);
  });

  it('closes on M, on Escape and on its close button, holding every other key while open', () => {
    const { map } = make();
    const heard = vi.fn();
    window.addEventListener('keydown', heard);
    map.toggle(FLARIS);
    key('KeyW', 'w');
    expect(heard).not.toHaveBeenCalled();
    key('KeyM', 'm');
    expect(map.isOpen).toBe(false);
    map.toggle(FLARIS);
    key('Escape', 'Escape');
    expect(map.isOpen).toBe(false);
    map.toggle(FLARIS);
    q(map, '[data-worldmap-close]')!.click();
    expect(map.isOpen).toBe(false);
    key('KeyW', 'w');
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', heard);
  });

  it('keeps presses on it from the world', () => {
    const { map } = make();
    const world = vi.fn();
    document.body.addEventListener('pointerdown', world);
    map.toggle(FLARIS);
    press(q(map, '.hud-worldmap-picture')!);
    expect(world).not.toHaveBeenCalled();
    document.body.removeEventListener('pointerdown', world);
  });
});

describe('WorldMap: the buttons and the arrow (WorldMap.cpp:428-465, :542-543, :1183-1234)', () => {
  it('shows another map from its button, hiding the arrow off that map; map 0 always shows it', () => {
    const { map } = make();
    map.toggle(FLARIS);
    expect(q(map, '.hud-worldmap-arrow')!.hidden).toBe(false);
    press(q(map, '[data-map-button="3"]')!);
    expect(q(map, '.hud-worldmap-picture')!.style.backgroundImage).toContain('ui/world_3.png');
    expect(q(map, '[data-map-button="3"]')!.dataset.frame).toBe('11');
    expect(q(map, '.hud-worldmap-arrow')!.hidden).toBe(true);
    press(q(map, '[data-map-button="0"]')!);
    expect(q(map, '.hud-worldmap-arrow')!.hidden).toBe(false);
    expect(q(map, '.hud-worldmap-name')!.textContent).toBe('Rocky');
  });
});

describe('WorldMap: the monster switch and its details (WorldMap.cpp:467-531, :852-872)', () => {
  it('shows the icons on maps 1-7 only, and a hovered icon\'s tooltip', () => {
    const { map } = make();
    map.toggle(FLARIS);
    expect(map.element.querySelectorAll('[data-monster]')).toHaveLength(0);
    press(q(map, '[data-map-button="8"]')!);
    expect(map.monsterInfo).toBe(true);
    expect(map.element.querySelectorAll('[data-monster]')).toHaveLength(2);
    press(q(map, '[data-monster="0"]')!, 'pointermove');
    const tip = q(map, '.hud-worldmap-tip')!;
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toContain('Lv.1 Small Aibatt');
    expect(tip.textContent).toContain('Booty : Twinkle Stone');
    press(q(map, '[data-map-button="0"]')!);
    expect(map.element.querySelectorAll('[data-monster]')).toHaveLength(0);
  });

  it('on a touch screen, a tap within 22 px of an icon\'s centre shows it, and one elsewhere shows nothing', () => {
    const { map } = make();
    map.toggle(FLARIS);
    press(q(map, '[data-map-button="8"]')!);
    // the picture is 1280x960 in jsdom (no layout): the first icon's box is 436..476 by 760..800, centre (456, 780)
    press(q(map, '.hud-worldmap-picture')!, 'pointerup', { clientX: 470, clientY: 790 }, 'touch');
    expect(q(map, '.hud-worldmap-tip')!.hidden).toBe(false);
    expect(q(map, '.hud-worldmap-tip')!.textContent).toContain('Small Aibatt');
    press(q(map, '.hud-worldmap-picture')!, 'pointerup', { clientX: 300, clientY: 300 }, 'touch');
    expect(q(map, '.hud-worldmap-tip')!.hidden).toBe(true);
  });
});

describe('WorldMap: without its catalog, and its teardown', () => {
  it('does nothing without a catalog, and loadWorldMap says so once', async () => {
    const { map, say } = make(null);
    map.toggle(FLARIS);
    expect(map.isOpen).toBe(false);
    expect(say).not.toHaveBeenCalled();
    const report = vi.fn();
    const store = { url: () => null, json: vi.fn() };
    expect(await loadWorldMap(store as never, report)).toBeNull();
    expect(report).toHaveBeenCalledTimes(1);
    expect(store.json).not.toHaveBeenCalled();
    const loaded = await loadWorldMap({ url: () => 'x', json: async () => DATA } as never, report);
    expect(loaded).toBe(DATA);
    expect(WORLD_MAP_KEY).toBe('data/worldMap.json');
  });

  it('dispose removes its element and its key listener', () => {
    const { map } = make();
    map.toggle(FLARIS);
    map.dispose();
    maps = maps.filter((m) => m !== map);
    expect(document.querySelectorAll('.hud-worldmap')).toHaveLength(0);
    const heard = vi.fn();
    window.addEventListener('keydown', heard);
    key('KeyW', 'w');
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', heard);
  });
});
