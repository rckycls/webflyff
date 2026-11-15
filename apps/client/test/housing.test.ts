// @vitest-environment jsdom
// 2026-11-15 (housing): personal housing's model, windows and rules (housing/housingBook.ts, housing/housingHud.ts), and the
// furniture core's placing (furniture/placement.ts, furniture/placementBar.ts).

import { beforeEach, describe, expect, it } from 'vitest';
import { Group, PerspectiveCamera } from 'three';
import { HousingKind, NULL_ID, WI_WORLD_MINIROOM, decodeWorldPacket } from '@flyffweb/protocol';
import type { HousingInfo } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { Ground } from '@flyffweb/scene';
import type { Texts } from '../src/world/gameData';
import type { UiArt } from '../src/world/hud/art';
import { HousingBook, housingButtons, housingRows } from '../src/world/housing/housingBook';
import { HousingHud } from '../src/world/housing/housingHud';
import type { HousingHudScreen } from '../src/world/housing/housingHud';
import { FurniturePlacement } from '../src/world/furniture/placement';
import type { PlacementHost } from '../src/world/furniture/placement';
import { PlacementControls } from '../src/world/furniture/placementBar';
import type { DropLoader } from '../src/world/items/groundModels';
import { modelTextureKey } from '../src/world/furniture/roomPapering';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const texts = new Map([
  ['TID_GAME_HOUSING_ADDITION', { text: '%s has been added to your Housing Menu. Press the Y Key to access it.', color: 0xff0088ff, textId: 1 }],
  ['TID_GAME_HOUSING_TIMEOUT', { text: '%s has expired.', color: 0xffffffff, textId: 2 }],
  ['TID_GAME_HOUSING_INSTALL', { text: '%s has been placed in your house.', color: 0xffffffff, textId: 3 }],
  ['TID_GAME_HOUSING_DEMOUNT', { text: '%s has been removed from your house.', color: 0xffffffff, textId: 4 }],
  ['TID_GAME_HOUSING_INVIATION', { text: 'You have allowed %s to enter your house.', color: 0xffffffff, textId: 5 }],
  ['TID_GAME_HOUSING_INVIATION_CANCEL', { text: 'You removed %s from your house entry list.', color: 0xffffffff, textId: 6 }],
  ['TID_GAME_HOUSING_BED', { text: 'Bed', color: 0xffffffff, textId: 7 }],
  ['TID_GAME_HOUSING_SOFA', { text: 'Sofa', color: 0xffffffff, textId: 8 }],
  ['TID_GAME_HOUSING_WALLPAPER', { text: 'Wallpaper', color: 0xffffffff, textId: 9 }],
]) as unknown as Texts;

const BED = 4916, SOFA = 4917, WALL = 4950;
const props = new Map<number, Partial<WebItemProp>>([
  [BED, { name: 'Basic Bed', kind1: 7, kind2: HousingKind.IK2_FURNITURE, kind3: HousingKind.IK3_BED, linkKind: 47, description: 'A bed.' }],
  [SOFA, { name: 'Basic Sofa', kind1: 7, kind2: HousingKind.IK2_FURNITURE, kind3: HousingKind.IK3_SOFA, linkKind: 50 }],
  [WALL, { name: 'Shabby-Chic Wallpaper', kind1: 7, kind2: HousingKind.IK2_PAPERING, kind3: HousingKind.IK3_WALLPAPER, textFile: 'Obj_HouPapwal01.dds' }],
]);
const prop = (itemId: number) => props.get(itemId) as WebItemProp | undefined;
const info = (itemId: number, over: Partial<HousingInfo> = {}): HousingInfo =>
  ({ itemId, secondsLeft: 86_400 * 30, placed: false, pos: [0, 0, 0], angle: 0, ...over });
const names = new Map([[500, 'Lead'], [600, 'Webby']]);

describe('HousingBook (CHousing)', () => {
  it('keeps the login list, adds and expires pieces, places them, with the chat lines', () => {
    const book = new HousingBook(prop, (id) => names.get(id) ?? '');
    expect(book.apply({ type: 'housingAllInfo', furniture: [info(BED)], allowed: [500] }, 1000)).toEqual([{ kind: 'list' }, { kind: 'friends' }]);
    expect(book.pieces).toEqual([{ itemId: BED, endsAt: 1000 + 86_400 * 30, placed: false, pos: [0, 0, 0], angle: 0 }]);
    expect(book.isAllowed(500)).toBe(true);
    expect(book.apply({ type: 'housingFurnitureList', info: info(SOFA), add: true }, 2000)).toEqual([
      { kind: 'list' }, { kind: 'line', tid: 'TID_GAME_HOUSING_ADDITION', arg: 'Basic Sofa' },
    ]);
    book.apply({ type: 'housingSetupFurniture', info: info(BED, { placed: true, pos: [253, 100, 241], angle: 90 }) }, 2000);
    expect(book.pieces[0]).toMatchObject({ placed: true, pos: [253, 100, 241], angle: 90 });
    expect(book.apply({ type: 'housingSetupFurniture', info: info(BED, { placed: false }) }, 2000).at(-1))
      .toEqual({ kind: 'line', tid: 'TID_GAME_HOUSING_DEMOUNT', arg: 'Basic Bed' });
    expect(book.pieces[0]).toMatchObject({ placed: false, pos: [253, 100, 241] });
    expect(book.apply({ type: 'housingFurnitureList', info: info(SOFA), add: false }, 3000).at(-1))
      .toEqual({ kind: 'line', tid: 'TID_GAME_HOUSING_TIMEOUT', arg: 'Basic Sofa' });
    expect(book.pieces.map((p) => p.itemId)).toEqual([BED]);
  });

  it('keeps the allow list and the visitable owners; the papers by the item kind', () => {
    const book = new HousingBook(prop, (id) => names.get(id) ?? '');
    expect(book.apply({ type: 'housingSetVisitAllow', playerId: 600, allow: true }, 0)[0])
      .toEqual({ kind: 'line', tid: 'TID_GAME_HOUSING_INVIATION', arg: 'Webby' });
    expect(book.allowed).toEqual([600]);
    book.apply({ type: 'housingSetVisitAllow', playerId: 600, allow: false }, 0);
    expect(book.allowed).toEqual([]);
    expect(book.apply({ type: 'housingVisitableList', owners: [700, 701] }, 0)).toEqual([{ kind: 'rooms' }]);
    expect(book.visitable).toEqual([700, 701]);
    expect(book.apply({ type: 'housingPapering', itemId: WALL, on: true }, 0)).toEqual([{ kind: 'papering', wall: 'Obj_HouPapwal01.dds' }]);
    expect(book.apply({ type: 'housingPapering', itemId: WALL, on: false }, 0)).toEqual([{ kind: 'papering', wall: null }]);
    expect(book.apply({ type: 'housingPapering', itemId: NULL_ID, on: false }, 0)).toEqual([{ kind: 'papering', reset: true }]);
    expect(book.apply({ type: 'housingPapering', itemId: BED, on: true }, 0)).toEqual([]);
    expect(modelTextureKey('Obj_HouPapwal01.dds')).toBe('textures/obj_houpapwal01.dds.ktx2');
  });
});

describe("the Housing window's rows (RefreshItemList, Sort)", () => {
  const book = { pieces: [
    { itemId: SOFA, endsAt: 500, placed: true, pos: [0, 0, 0] as [number, number, number], angle: 0 },
    { itemId: BED, endsAt: 900, placed: false, pos: [0, 0, 0] as [number, number, number], angle: 0 },
    { itemId: WALL, endsAt: 100, placed: false, pos: [0, 0, 0] as [number, number, number], angle: 0 },
  ] };
  const order = (sort: Parameters<typeof housingRows>[2], greater: boolean) => housingRows(book, prop, sort, greater).map((r) => r.itemId);

  it('sorts as Neuz compares: type, time and placed downwards, the name upwards, each the other way pressed again', () => {
    expect(order('type', true)).toEqual([WALL, SOFA, BED]);
    expect(order('type', false)).toEqual([BED, SOFA, WALL]);
    expect(order('name', true)).toEqual([BED, SOFA, WALL]);
    expect(order('time', true)).toEqual([BED, SOFA, WALL]);
    expect(order('placed', true)[0]).toBe(SOFA);
  });

  it('allows Install or Remove only in the own room', () => {
    const [sofa, bed] = housingRows(book, prop, 'time', false).reverse().slice(1);
    expect(housingButtons(sofa, true)).toEqual({ install: false, remove: true });
    expect(housingButtons(bed, true)).toEqual({ install: true, remove: false });
    expect(housingButtons(bed, false)).toEqual({ install: false, remove: false });
    expect(housingButtons(undefined, true)).toEqual({ install: false, remove: false });
  });
});

describe('HousingHud', () => {
  let sent: ReturnType<typeof decodeWorldPacket>[];
  let lines: string[];
  let world: number;
  let started: Array<[number, number]>;
  let placing: boolean;
  let book: HousingBook;
  let hud: HousingHud;

  beforeEach(() => {
    document.body.replaceChildren();
    sent = []; lines = []; world = 1; started = []; placing = false;
    book = new HousingBook(prop, (id) => names.get(id) ?? '');
    const screen: HousingHudScreen = {
      send: (bytes) => sent.push(decodeWorldPacket(bytes)),
      say: (text) => lines.push(text),
      prop, ownPlayerId: () => 9, worldId: () => world, nowSeconds: () => 1000,
      playerName: (id) => names.get(id) ?? '', refreshFriends: () => {}, papering: () => {},
      startPlacement: (itemId, ctrl) => { started.push([itemId, ctrl]); placing = true; return true; },
      placing: () => placing, endPlacement: () => { placing = false; },
    };
    hud = new HousingHud(art, texts, screen, book, document);
    document.body.append(...hud.elements);
  });

  const rows = () => [...hud.housing.window.control('WIDC_LISTBOX1').querySelectorAll<HTMLElement>('[role="option"]')];
  const install = () => hud.housing.window.button('WIDC_BUTTON1');
  const remove = () => hud.housing.window.button('WIDC_BUTTON2');

  it('lists the pieces with their type, name, short time and O/X, and says the server lines', () => {
    hud.handle({ type: 'housingAllInfo', furniture: [info(BED, { secondsLeft: 86_400 * 29 + 3600 * 23 }), info(SOFA, { placed: true })], allowed: [] });
    hud.toggle();
    expect(hud.housing.isOpen).toBe(true);
    expect(rows().map((r) => [...r.querySelectorAll('span')].map((s) => s.textContent))).toEqual([
      ['Sofa', 'Basic Sofa', '30d', 'O'], ['Bed', 'Basic Bed', '29d23h', 'X'],
    ]);
    hud.handle({ type: 'housingFurnitureList', info: info(WALL), add: true });
    expect(lines).toEqual(['Shabby-Chic Wallpaper has been added to your Housing Menu. Press the Y Key to access it.']);
    expect(rows()).toHaveLength(3);
  });

  it('Install places a piece, puts a wallpaper on at once, and Remove takes one down, only in the own room', () => {
    hud.handle({ type: 'housingAllInfo', furniture: [info(BED), info(WALL), info(SOFA, { placed: true })], allowed: [] });
    hud.toggle();
    rows()[2]!.click(); // the type order: wallpaper, sofa, bed
    expect(install().disabled).toBe(true); // not in the room
    hud.visitOwnRoom();
    expect(sent.at(-1)).toEqual({ type: 'housingVisitRoomRequest', ownerId: 9 });
    world = WI_WORLD_MINIROOM;
    rows()[2]!.click();
    expect(hud.housing.window.control('WIDC_TEXT1').textContent).toBe('A bed.');
    expect([install().disabled, remove().disabled]).toEqual([false, true]);
    install().click();
    expect(started).toEqual([[BED, 47]]);
    expect(install().disabled).toBe(true);
    rows()[0]!.click();
    install().click(); // a wallpaper: at once, ending the bed's placing
    expect(placing).toBe(false);
    expect(sent.at(-1)).toMatchObject({ type: 'housingSetupFurnitureRequest', itemId: WALL, placed: true });
    rows()[1]!.click();
    remove().click();
    expect(sent.at(-1)).toMatchObject({ type: 'housingSetupFurnitureRequest', itemId: SOFA, placed: false });
    hud.place(BED, [253, 100, 241], 45);
    expect(sent.at(-1)).toMatchObject({ type: 'housingSetupFurnitureRequest', itemId: BED, placed: true, pos: [253, 100, 241], angle: 45 });
  });

  it("visits a friend's house from the House List, and goes out only from inside a room", () => {
    hud.openRoomList();
    expect(hud.roomList.isOpen).toBe(true);
    expect(sent).toEqual([{ type: 'housingReqVisitableListRequest' }]);
    hud.handle({ type: 'housingVisitableList', owners: [500, 999, 600] }); // 999: no name known, not listed
    const list = [...hud.roomList.window.control('WIDC_LISTBOX1').querySelectorAll<HTMLElement>('[role="option"]')];
    expect(list.map((r) => r.textContent)).toEqual(['1. Lead', '2. Webby']);
    list[1]!.click();
    hud.roomList.window.button('WIDC_BUTTON1').click();
    expect(sent.at(-1)).toEqual({ type: 'housingVisitRoomRequest', ownerId: 600 });
    expect(book.myRoom).toBe(false);
    expect(hud.roomList.isOpen).toBe(false);
    hud.openQuitRoom();
    hud.quitRoom.window.button('WIDC_BUTTON1').click();
    expect(sent.at(-1)).toEqual({ type: 'housingVisitRoomRequest', ownerId: 600 }); // not in a room: no GOOUT
    world = WI_WORLD_MINIROOM;
    hud.openQuitRoom();
    hud.quitRoom.window.button('WIDC_BUTTON1').click();
    expect(sent.at(-1)).toEqual({ type: 'housingGoOutRequest' });
    hud.setVisitAllow(500, true);
    expect(sent.at(-1)).toEqual({ type: 'housingSetVisitAllowRequest', playerId: 500, allow: true });
  });
});

describe('FurniturePlacement (CDeployManager)', () => {
  const ground = { terrainHeight: () => 100, objectsNear: () => [] } as unknown as Ground;
  const camera = new PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(250, 120, -235);
  camera.lookAt(250, 100, -240);
  camera.updateMatrixWorld();
  const load: DropLoader = async () => {
    const root = new Group();
    root.userData = { bbMin: [-1, 0, -1], bbMax: [1, 1, 1] };
    return { root, height: 1, release: () => {} };
  };
  const host = (others: number[][] = []): PlacementHost => ({
    scene: new Group(), camera: () => camera, ground: () => ground, mpu: () => 4,
    data: { ctrls: new Map([[47, { id: 47, model: 'models/ctrl_houfurbedbasic01.glb', scale: 0.7 }]]) },
    load, collision: async () => null, red: async () => null, releaseRed: () => {},
    others: () => others.map(() => ({ center: [250, 100, 240], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], extents: [1, 1, 1] })),
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('needs a converted control; steps 45 on the Page keys and 2.5 on the wheel, as Neuz keeps the angle', () => {
    const placement = new FurniturePlacement(host());
    expect(placement.start(BED, 9999)).toBe(false);
    expect(placement.start(BED, 47)).toBe(true);
    placement.step(1);
    placement.wheel(true);
    expect(placement.state!.angle).toBeCloseTo(47.5, 2);
    placement.step(1); // the manager's 90, the wheel's turn forgotten
    expect(placement.state!.angle).toBeCloseTo(90, 2);
    placement.step(-1); placement.step(-1); placement.step(-1);
    expect(placement.state!.angle).toBeCloseTo(315, 2); // -45 kept as 315
    placement.cancel();
    expect(placement.active).toBe(false);
  });

  it('follows the floor under the pointer and places a free piece; a red one stays', async () => {
    const free = new FurniturePlacement(host());
    free.start(BED, 47);
    await settle();
    free.pointer(0, 0);
    free.frame();
    const at = free.state!.pos!;
    expect(at[1]).toBeCloseTo(100, 3);
    expect(free.colliding).toBe(false); // no wall in this world: never red
    expect(free.confirm()).toEqual({ itemId: BED, pos: at, angle: 0 });
    expect(free.active).toBe(false);
    expect(free.confirm()).toBeNull();
  });

  it("the phone's bar shows while placing on a touch screen; its buttons turn, place and drop", () => {
    const placement = new FurniturePlacement(host());
    const canvas = document.createElement('canvas');
    const calls: string[] = [];
    const controls = new PlacementControls(placement, canvas, window, {
      confirm: () => calls.push('confirm'), cancel: () => { calls.push('cancel'); placement.cancel(); },
    }, () => true, document);
    controls.update();
    expect(controls.bar.hidden).toBe(true);
    placement.start(BED, 47);
    controls.update();
    expect(controls.bar.hidden).toBe(false);
    const buttons = [...controls.bar.querySelectorAll('button')];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Turn left', 'Turn right', 'Place', 'Cancel']);
    buttons[1]!.click();
    expect(placement.state!.angle).toBeCloseTo(45, 2);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'PageUp' }));
    expect(placement.state!.angle).toBeCloseTo(0, 2);
    buttons[2]!.click();
    buttons[3]!.click();
    expect(calls).toEqual(['confirm', 'cancel']);
    controls.update();
    expect(controls.bar.hidden).toBe(true);
    controls.dispose();
  });
});

describe('RoomPapering (ChangeWallTex, ChangeTileTex)', () => {
  it("puts the wallpaper on the wall's materials and the floor on the land's, and both back on reset", async () => {
    const { Mesh, MeshLambertMaterial, ShaderMaterial, Texture, BoxGeometry } = await import('three');
    const { RoomPapering, DEFAULT_WALL, DEFAULT_FLOOR } = await import('../src/world/furniture/roomPapering');
    const cache = new Map<string, InstanceType<typeof Texture>>();
    const textures = {
      acquire: async (key: string | null) => { if (!cache.has(key!)) cache.set(key!, new Texture()); return cache.get(key!)!; },
      release: () => {},
    };
    const scene = new Group();
    const wallMaterial = new MeshLambertMaterial({ map: await textures.acquire(DEFAULT_WALL) });
    const other = new MeshLambertMaterial({ map: await textures.acquire('textures/other.dds.ktx2') });
    const land = new ShaderMaterial({ uniforms: { texture: { value: await textures.acquire(DEFAULT_FLOOR) } } });
    scene.add(new Mesh(new BoxGeometry(), wallMaterial), new Mesh(new BoxGeometry(), other), new Mesh(new BoxGeometry(), land));
    const papering = new RoomPapering(scene, textures);
    await new Promise((resolve) => setTimeout(resolve, 0));
    papering.set({ wall: 'Obj_HouPapwal01.dds', floor: 'Obj_HouPapCar01.dds' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    papering.update(10);
    expect(wallMaterial.map).toBe(cache.get('textures/obj_houpapwal01.dds.ktx2'));
    expect(land.uniforms.texture!.value).toBe(cache.get('textures/obj_houpapcar01.dds.ktx2'));
    expect(other.map).toBe(cache.get('textures/other.dds.ktx2'));
    papering.set({ reset: true });
    papering.update(20);
    expect(wallMaterial.map).toBe(cache.get(DEFAULT_WALL));
    expect(land.uniforms.texture!.value).toBe(cache.get(DEFAULT_FLOOR));
  });
});
