// @vitest-environment jsdom
// 2026-11-15 (guild house): the guild house's model, windows and rules (guildHouse/guildHouseBook.ts, guildHouse/guildHouseHud.ts),
// and the furniture core's guild-house placing (ray picking, the land check).

import { beforeEach, describe, expect, it } from 'vitest';
import { Group, PerspectiveCamera } from 'three';
import {
  GuildHouseKind, GuildHousePacketType, HousingKind, NULL_ID, WI_GUILDHOUSE_SMALL, decodeWorldPacket,
} from '@flyffweb/protocol';
import type { GuildFurniture } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { Ground } from '@flyffweb/scene';
import type { Texts } from '../src/world/gameData';
import type { UiArt } from '../src/world/hud/art';
import { GuildHouseBook, storageAction, storageButtons, storageRows } from '../src/world/guildHouse/guildHouseBook';
import { GHouseMenu, GuildHouseHud } from '../src/world/guildHouse/guildHouseHud';
import type { GuildHouseHudScreen } from '../src/world/guildHouse/guildHouseHud';
import { rayMeetsObb } from '../src/world/furniture/ctrlModels';
import { FurniturePlacement } from '../src/world/furniture/placement';
import type { PlacementHost, PlacementOptions } from '../src/world/furniture/placement';
import type { DropLoader } from '../src/world/items/groundModels';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const texts = new Map([
  ['TID_GAME_GUILDHOUSE_FUR_INSTALL_SUCCESS', { text: '%s has been placed in your Guild House.', color: 0xffff0000, textId: 1 }],
  ['TID_GAME_GUILDHOUSE_FUR_DISMANTLE_SUCCESS', { text: '%s has been removed from your Guild House.', color: 0xffff0000, textId: 2 }],
  ['TID_GAME_GUILDHOUSE_TAX_LEVEL', { text: 'You do not have permission to pay maintenance fees.', color: 0xffffffff, textId: 3 }],
  ['TID_GAME_GUILDHOUSE_INSIDE_INSTALL_CHANNEL', { text: "You can't place or remove furniture in this channel.", color: 0xffffffff, textId: 4 }],
  ['TID_GAME_GUILDHOUSE_LOCKER', { text: 'Guild Furniture Storage', color: 0xffffffff, textId: 5 }],
  ['TID_GAME_GUILDHOUSE_TELEPORTER', { text: 'Teleporter Storage', color: 0xffffffff, textId: 6 }],
  ['TID_GAME_TOOLTIP_NEWFURNITURE', { text: '(NEW)', color: 0xffffffff, textId: 7 }],
  ['TID_GAME_GUILDHOUSE_EXPIRATION', { text: 'Your Guild House has expired.', color: 0xffffffff, textId: 8 }],
]) as unknown as Texts;

const SOFA = 20117, BED = 20115, WALL = 20129, TELE = 20200, TELE2 = 20201;
const props = new Map<number, Partial<WebItemProp>>([
  [SOFA, { name: 'Guild Sofa', kind1: 7, kind2: GuildHouseKind.IK2_GUILDHOUSE_FURNITURE, kind3: HousingKind.IK3_SOFA, abilityMin: 10080, linkKind: 82, icon: 'ui/item/sofa.png' }],
  [BED, { name: 'Guild Bed', kind1: 7, kind2: GuildHouseKind.IK2_GUILDHOUSE_FURNITURE, kind3: HousingKind.IK3_BED, abilityMin: 1440, linkKind: 80, icon: null }],
  [WALL, { name: 'Guild Wallpaper', kind1: 7, kind2: GuildHouseKind.IK2_GUILDHOUSE_PAPERING, kind3: HousingKind.IK3_WALLPAPER, abilityMin: 10080, textFile: 'Ctrl_GhouseWall.dds' }],
  [TELE, { name: 'Summon: Apprentice Teleporter', kind1: 7, kind2: GuildHouseKind.IK2_GUILDHOUSE_NPC, kind3: GuildHouseKind.IK3_TELEPORTER, abilityMin: 10080 }],
  [TELE2, { name: 'Summon: Master Teleporter', kind1: 7, kind2: GuildHouseKind.IK2_GUILDHOUSE_NPC, kind3: GuildHouseKind.IK3_TELEPORTER, abilityMin: 10080 }],
]);
const prop = (itemId: number) => props.get(itemId) as WebItemProp | undefined;
const f = (itemId: number, over: Partial<GuildFurniture> = {}): GuildFurniture =>
  ({ itemId, placed: false, pos: [0, 0, 0], angle: 0, objectId: NULL_ID, secondsLeft: 0, ...over });

describe('GuildHouseBook (CGuildHouseBase)', () => {
  it('keeps the login info; LISTUP, SETUP, REMOVE, RESET, LISTDROP, UPKEEP and EXPIRED change it, with their lines', () => {
    const book = new GuildHouseBook(prop);
    book.apply({ type: 'guildHouseAllInfo', channel: true, house: {
      guildId: 77, worldId: WI_GUILDHOUSE_SMALL, upkeepSecondsLeft: 3600, furniture: [f(SOFA, { placed: true, objectId: 0x7001, secondsLeft: 600 })],
    } }, 1000);
    expect([book.channel, book.hasHouse, book.upkeepEndsAt]).toEqual([true, true, 4600]);
    expect(book.pieces[0]).toMatchObject({ itemId: SOFA, placed: true, objectId: 0x7001, endsAt: 1600 });
    book.apply({ type: 'guildHousePacket', packetType: GuildHousePacketType.LISTUP, index: NULL_ID, furniture: f(BED) }, 1000);
    expect(book.pieces.map((p) => p.itemId)).toEqual([SOFA, BED]);
    expect(book.apply({ type: 'guildHousePacket', packetType: GuildHousePacketType.SETUP, index: 1,
      furniture: f(BED, { placed: true, objectId: 0x7002, pos: [80, 100, 70], angle: 90, secondsLeft: 86400 }) }, 1000))
      .toEqual([{ kind: 'line', tid: 'TID_GAME_GUILDHOUSE_FUR_INSTALL_SUCCESS', arg: 'Guild Bed' }, { kind: 'list' }]);
    expect(book.find(0x7002)).toEqual({ index: 1, piece: expect.objectContaining({ placed: true, angle: 90, endsAt: 87400 }) });
    // a SETUP whose item is not the index's changes nothing (SetupFurnitureCtrl's check)
    book.apply({ type: 'guildHousePacket', packetType: GuildHousePacketType.SETUP, index: 0, furniture: f(BED, { placed: true }) }, 1000);
    expect(book.pieces[0]!.itemId).toBe(SOFA);
    book.apply({ type: 'guildHousePacket', packetType: GuildHousePacketType.UPKEEP, index: NULL_ID, furniture: f(3, { secondsLeft: 86400 * 3 }) }, 2000);
    expect(book.upkeepEndsAt).toBe(2000 + 86400 * 3);
    book.apply({ type: 'guildHousePacket', packetType: GuildHousePacketType.EXPIRED, index: NULL_ID, furniture: f(0) }, 2000);
    expect(book.pieces.every((p) => !p.placed && p.objectId === NULL_ID)).toBe(true);
    expect(book.upkeepEndsAt).toBe(0);
    book.apply({ type: 'guildHousePacket', packetType: GuildHousePacketType.LISTDROP, index: 0, furniture: f(SOFA) }, 2000);
    expect(book.pieces.map((p) => p.itemId)).toEqual([BED]);
    book.apply({ type: 'guildHouseRestPoint', restPoint: 250_000 }, 2000);
    expect(book.restPercent).toBe(25);
    book.apply({ type: 'guildHouseRemove' }, 2000);
    expect(book.pieces).toEqual([]);
  });

  it('puts the placed wallpaper on, and the record carries the seconds left (0 for a timer not started)', () => {
    const book = new GuildHouseBook(prop);
    book.pieces = [
      { itemId: WALL, placed: true, pos: [0, 0, 0], angle: 0, objectId: 5, endsAt: 1500 },
      { itemId: BED, placed: false, pos: [0, 0, 0], angle: 0, objectId: NULL_ID, endsAt: 0 },
    ];
    expect(book.papers()).toEqual({ wall: 'Ctrl_GhouseWall.dds', floor: null });
    expect(book.record(0, 1000)).toMatchObject({ itemId: WALL, secondsLeft: 500 });
    expect(book.record(1, 1000)).toMatchObject({ itemId: BED, secondsLeft: 0 });
  });
});

describe("the Furniture Storage's rows", () => {
  const book = { pieces: [
    { itemId: SOFA, placed: true, pos: [0, 0, 0] as [number, number, number], angle: 0, objectId: 0x7001, endsAt: 5000 },
    { itemId: BED, placed: false, pos: [0, 0, 0] as [number, number, number], angle: 0, objectId: NULL_ID, endsAt: 0 },
    { itemId: TELE, placed: true, pos: [0, 0, 0] as [number, number, number], angle: 0, objectId: 0x7003, endsAt: 9000 },
    { itemId: TELE2, placed: false, pos: [0, 0, 0] as [number, number, number], angle: 0, objectId: NULL_ID, endsAt: 0 },
    { itemId: WALL, placed: false, pos: [0, 0, 0] as [number, number, number], angle: 0, objectId: NULL_ID, endsAt: 0 },
  ] };

  it('lists a section, a kind, the time (the prop length for a new piece), in the order pressed', () => {
    const furniture = storageRows(book, prop, 'furniture', 0, null, true);
    expect(furniture.map((r) => [r.slot, r.itemId, r.fresh, r.time])).toEqual([[0, SOFA, false, 5000], [1, BED, true, 86400], [4, WALL, true, 604800]]);
    expect(storageRows(book, prop, 'teleporter', 0, null, true).map((r) => r.slot)).toEqual([2, 3]);
    expect(storageRows(book, prop, 'furniture', HousingKind.IK3_BED, null, true).map((r) => r.itemId)).toEqual([BED]);
    expect(storageRows(book, prop, 'furniture', 0, 'name', true).map((r) => r.name)).toEqual(['Guild Bed', 'Guild Sofa', 'Guild Wallpaper']);
    expect(storageRows(book, prop, 'furniture', 0, 'time', true).map((r) => r.itemId)).toEqual([WALL, BED, SOFA]);
    expect(storageRows(book, prop, 'furniture', 0, 'placed', false)[2]!.itemId).toBe(SOFA);
  });

  it('turns the buttons on with the right, one teleporter at a time; says what each does', () => {
    const teleporters = storageRows(book, prop, 'teleporter', 0, null, true);
    expect(storageButtons(teleporters, true, 'teleporter')).toEqual([true, false]);
    expect(storageButtons(teleporters, false, 'teleporter')).toEqual([false, false]);
    const furniture = storageRows(book, prop, 'furniture', 0, null, true);
    expect(furniture.map(storageAction)).toEqual(['remove', 'place', 'setupAtOnce']);
    expect(storageAction(teleporters[1]!)).toBe('setupAtOnce');
  });
});

describe('GuildHouseHud', () => {
  let sent: ReturnType<typeof decodeWorldPacket>[];
  let lines: string[];
  let world: number;
  let power: number;
  let placings: Array<{ itemId: number; ctrl: number; options: PlacementOptions; placed: (pos: [number, number, number], angle: number) => void }>;
  let book: GuildHouseBook;
  let hud: GuildHouseHud;

  beforeEach(() => {
    document.body.replaceChildren();
    sent = []; lines = []; world = WI_GUILDHOUSE_SMALL; power = 0xff; placings = [];
    book = new GuildHouseBook(prop);
    const screen: GuildHouseHudScreen = {
      send: (bytes) => sent.push(decodeWorldPacket(bytes)),
      say: (text) => lines.push(text),
      prop, ownPlayerId: () => 500, worldId: () => world, nowSeconds: () => 1000,
      guild: () => ({ masterId: 1, members: new Map([[500, { rank: 1 }]]), power: [0xff, power, 0, 0, 0] }) as never,
      ownPos: () => [80, 100, 70], togglePermissions: () => {}, toggleGuildBank: () => {}, papers: () => {}, rest: () => {},
      startPlacement: (itemId, ctrl, options, placed) => { placings.push({ itemId, ctrl, options, placed }); return true; },
      placing: () => placings.length > 0, menuAt: () => ({ x: 0, y: 0 }), stripAt: () => ({ x: 0, y: 0 }),
    };
    hud = new GuildHouseHud(art, texts, screen, book, document);
    document.body.append(...hud.elements);
    hud.handle({ type: 'guildHouseAllInfo', channel: true, house: { guildId: 77, worldId: WI_GUILDHOUSE_SMALL, upkeepSecondsLeft: 7 * 86400, furniture: [
      f(SOFA, { placed: true, objectId: 0x7001, secondsLeft: 600, pos: [81, 100, 71], angle: 30 }), f(BED), f(WALL),
    ] } });
  });

  const rows = () => [...hud.storage.window.control('WIDC_LISTBOX1').querySelectorAll<HTMLElement>('.hud-gh-storage-row')];

  it('opens the menu in a guild house with the time left, and closes it elsewhere', () => {
    hud.enteredWorld(WI_GUILDHOUSE_SMALL);
    expect(hud.menu.isOpen).toBe(true);
    expect(hud.menu.window.control('WIDC_STATIC2').textContent).toBe('7d');
    hud.enteredWorld(1);
    expect(hud.menu.isOpen).toBe(false);
  });

  it('lists the furniture, places a new piece (the strip shown, the storage away) and removes a placed one', () => {
    hud.toggleStorage();
    expect(rows().map((r) => r.getAttribute('aria-label'))).toEqual(['Guild Sofa 10m', 'Guild Bed 1d(NEW)', 'Guild Wallpaper 7d(NEW)']);
    rows()[1]!.querySelector<HTMLButtonElement>('.hud-gh-storage-ir')!.click();
    expect(placings[0]).toMatchObject({ itemId: BED, ctrl: 80, options: { angle: 0, land: true } });
    hud.update();
    expect(hud.storage.isOpen).toBe(false);
    expect(hud.strip.isOpen).toBe(true);
    placings[0]!.placed([80, 100, 72], 45);
    expect(sent.at(-1)).toMatchObject({ type: 'guildHousePacketRequest', packetType: GuildHousePacketType.SETUP, index: 1,
      furniture: { itemId: BED, placed: true, pos: [80, 100, 72], angle: 45, objectId: NULL_ID, secondsLeft: 86400 - 1000 } });
    placings = [];
    hud.update();
    expect([hud.storage.isOpen, hud.strip.isOpen]).toEqual([true, false]);
    rows()[2]!.querySelector<HTMLButtonElement>('.hud-gh-storage-ir')!.click(); // the wallpaper: at once
    expect(sent.at(-1)).toMatchObject({ packetType: GuildHousePacketType.SETUP, index: 2, furniture: { itemId: WALL } });
    rows()[0]!.querySelector<HTMLButtonElement>('.hud-gh-storage-ir')!.click(); // the sofa: down
    expect(sent.at(-1)).toMatchObject({ packetType: GuildHousePacketType.REMOVE, index: 0, furniture: { itemId: SOFA, objectId: 0x7001, secondsLeft: 600 } });
  });

  it('keeps the buttons off without the Furniture right or out of the house, and says so on another channel', () => {
    power = 0;
    hud.toggleStorage();
    expect(rows().every((r) => r.querySelector<HTMLButtonElement>('button')!.disabled)).toBe(true);
    power = 0xff;
    hud.handle({ type: 'guildHouseAllInfo', channel: false, house: null });
    rows()[1]!.querySelector<HTMLButtonElement>('button')!.click();
    expect(lines).toEqual(["You can't place or remove furniture in this channel."]);
  });

  it("a pressed piece's menu: Information opens the storage, Reinstall places it again at its angle, Remove takes it down", () => {
    expect(hud.pressPiece(0x9999)).toEqual([]);
    expect(hud.pressPiece(0x7001).map((e) => e.id)).toEqual([GHouseMenu.INFO, GHouseMenu.REINSTALL, GHouseMenu.RECALL]);
    expect(book.selected).toBe(0x7001);
    hud.choosePiece(GHouseMenu.INFO);
    expect(hud.storage.isOpen).toBe(true);
    hud.choosePiece(GHouseMenu.REINSTALL);
    expect(placings[0]).toMatchObject({ itemId: SOFA, ctrl: 82, options: { angle: 30, ignore: 0x7001, land: true } });
    placings[0]!.placed([82, 100, 72], 30);
    expect(sent.at(-1)).toMatchObject({ packetType: GuildHousePacketType.RESET, index: 0, furniture: { itemId: SOFA, objectId: 0x7001, secondsLeft: 0 } });
    hud.pressPiece(0x7001);
    hud.choosePiece(GHouseMenu.RECALL);
    expect(sent.at(-1)).toMatchObject({ packetType: GuildHousePacketType.REMOVE, index: 0 });
  });

  it('pays the upkeep with the right: days, 2,400,000 each, at most 34; without it, the line', () => {
    hud.openUpkeep();
    expect(hud.upkeep.isOpen).toBe(true);
    expect(hud.upkeep.window.control('WIDC_STATIC2').textContent).toBe('2,400,000');
    hud.upkeep.window.button('WIDC_MAX').click();
    expect(hud.upkeep.window.control('WIDC_STATIC2').textContent).toBe('81,600,000');
    hud.upkeep.window.button('WIDC_OK').click();
    expect(sent.at(-1)).toMatchObject({ type: 'guildHousePacketRequest', packetType: GuildHousePacketType.UPKEEP, index: -1, furniture: { itemId: 34 } });
    power = 0;
    hud.openUpkeep();
    expect(lines).toEqual(['You do not have permission to pay maintenance fees.']);
  });
});

describe("the guild house's placing", () => {
  it('a ray meets the nearest box, from inside too, and misses beside it', () => {
    const obb = { center: [10, 0, 0] as [number, number, number], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as never, extents: [1, 1, 1] as [number, number, number] };
    expect(rayMeetsObb([0, 0, 0], [1, 0, 0], obb)).toBeCloseTo(9);
    expect(rayMeetsObb([10, 0, 0], [1, 0, 0], obb)).toBeCloseTo(1);
    expect(rayMeetsObb([0, 5, 0], [1, 0, 0], obb)).toBeNull();
    expect(rayMeetsObb([0, 0, 0], [-1, 0, 0], obb)).toBeNull();
  });

  it('starts at the given angle, and is red on land nobody may walk (the wall present)', async () => {
    const wallTriangles = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 1]); // bounds 0..1 on every axis
    const wall = { triangles: wallTriangles, matrix: new Float32Array([200, 0, 0, 0, 0, 20, 0, 0, 0, 0, 200, 0, -100, 90, -100, 1]), model: 'models/obj_miniwall01.glb' };
    const ground = { terrainHeight: () => 100, objectsNear: () => [wall] } as unknown as Ground;
    const camera = new PerspectiveCamera(60, 1, 0.1, 500);
    camera.position.set(80, 120, -65);
    camera.lookAt(80, 100, -70);
    camera.updateMatrixWorld();
    let attr = 0;
    const load: DropLoader = async () => {
      const root = new Group();
      root.userData = { bbMin: [-0.5, 0, -0.5], bbMax: [0.5, 1, 0.5] };
      return { root, height: 1, release: () => {} };
    };
    const host: PlacementHost = {
      scene: new Group(), camera: () => camera, ground: () => ground, mpu: () => 1,
      data: { ctrls: new Map([[80, { id: 80, model: 'models/ctrl_ghousebagicbed.glb', scale: 1 }]]) },
      load, collision: async () => null, red: async () => null, releaseRed: () => {}, others: () => [], landAttr: () => attr,
    };
    const placement = new FurniturePlacement(host);
    placement.start(BED, 80, { angle: 30, land: true });
    expect(placement.state!.angle).toBeCloseTo(30, 2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    placement.pointer(0, 0);
    placement.frame();
    expect(placement.colliding).toBe(false);
    attr = 1; // HATTR_NOWALK
    placement.frame();
    expect(placement.colliding).toBe(true);
    expect(placement.confirm()).toBe('collide');
  });
});
