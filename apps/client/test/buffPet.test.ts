// @vitest-environment jsdom
// pets B1: the buff pets (V15 __PETVIS): the vis rules (pets/buffPet.ts), the own buff pet in OwnState (VISPET_ACTIVATE,
// UPDATE_ITEM UI_PETVIS_*), its window (CWndBuffPetStatus) driven by the pretend world's bundles, the vis boxes
// (CheckConfirm, CWndConfirmVis), the tooltips (PutNeededVis, PutVisPetInfo), the aura (CSfxLinkMover) and BUFF_EQUIP.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimationMixer, Group } from 'three';
import { NULL_ID } from '@flyffweb/protocol';
import type { AddedMover, InventoryItem } from '@flyffweb/protocol';
import { newVagrantOwn, writeAddNpc, writeAddSelf, writeMoverChangeSfx, writeUpdateItem, writeVisPetActivate } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import type { AssembledCharacter } from '@flyffweb/scene';
import type { WebItemProp } from '@flyffweb/formats';
import { ServerClock } from '../src/net/serverClock';
import type { GameData } from '../src/world/gameData';
import { BuffStatus } from '../src/world/hud/buffStatus';
import { WindowFrame } from '../src/world/hud/frame';
import { ownTooltipContext } from '../src/world/hud/itemDetails';
import { confirmedTarget, useOf } from '../src/world/items/premiumItems';
import { itemTooltip, visPetInfo } from '../src/world/items/itemTooltip';
import { OwnState } from '../src/world/OwnState';
import type { OwnEvent, VisPetChange } from '../src/world/OwnState';
import {
  II_SYS_SYS_SCR_PET_MAGIC, II_SYS_SYS_VIS_KEY01, NeedVis, checkConfirmVis, satisfyNeedVis, timeSpan, validVisTable,
  visPetSfxId, visTimeLeft,
} from '../src/world/pets/buffPet';
import { BuffPetAuras } from '../src/world/pets/buffPetAura';
import { BuffPetWindows } from '../src/world/pets/buffPetWindows';
import type { BuffPetHost } from '../src/world/pets/buffPetWindows';
import { buffPetCamera } from '../src/world/render/petPortrait';
import { terrainGround } from '../src/world/sim/collision';
import { WorldState } from '../src/world/WorldState';
import { addedNpc, addedPlayer, webMoverOf } from './helpers/movers';
import { OWN_ID, STARTER_EQUIPMENT, itemProp, ownGameData } from './helpers/ownState';
import { art, read, texts as lineTexts } from './helpers/petData';

afterEach(() => {
  document.body.replaceChildren();
});

// ---- the data: Resource/propItem.txt's rows, textClient's English ------------------------------------------------

const VIS_STR = 26848; // II_SYS_VIS_LV1_STR: STR +3, 60 minutes, level 1
const VIS_HP = 26890; // II_SYS_VIS_LV2_HPMAX: DST_HP_MAX_RATE +10, 4320 minutes, level 2
const VIS_ATK1 = 26866; // II_SYS_VIS_LV1_ATKPOWER
const VIS_ATK2 = 26886; // II_SYS_VIS_LV2_ATKPOWER
const VIS_WARRIOR = 26893; // II_SYS_VIS_LV3_WARRIOR: ATKPOWER_RATE +3, ATTACKSPEED +180, needs ATK1 and ATK2, level 3
const II_PET_RACCON = 26854;
const MI_PET_RACCON = 1102;
const BAG_PET = 5;
const BAG_VIS = 7;
const BAG_KEY = 8;
const BAG_MAGIC = 9;
const PET_MOVER = 0x3000;
const T0 = 1_800_000_000;

const vis = (id: number, name: string, minutes: number, level: number, over: Partial<WebItemProp> = {}): WebItemProp =>
  itemProp({
    id, name, kind1: 3, kind2: 19, kind3: 138, part: -1, abilityMin: minutes, abilityMax: level,
    icon: `ui/item/itm_syssysvislv0${level}.png`, ...over,
  });

const PROPS: WebItemProp[] = [
  vis(VIS_STR, 'Bead of STR', 60, 1, { destParams: [1, -1, -1], adjParams: [3, -1, -1] }),
  vis(VIS_HP, 'Bead of HP', 4320, 2, { destParams: [52, -1, -1], adjParams: [10, -1, -1] }),
  vis(VIS_ATK1, 'Bead of Attack', 60, 1, { destParams: [83, -1, -1], adjParams: [5, -1, -1] }),
  vis(VIS_ATK2, 'Bead of Attack II', 4320, 2, { destParams: [83, -1, -1], adjParams: [10, -1, -1] }),
  vis(VIS_WARRIOR, 'Bead of the Warrior', 10080, 3, {
    destParams: [66, 24, -1], adjParams: [3, 180, -1], referTarget1: VIS_ATK1, referTarget2: VIS_ATK2,
  }),
  itemProp({ id: II_PET_RACCON, name: 'Tiny Tanuki', kind1: 3, kind2: 1, kind3: 100, part: -1, referStat1: 1, icon: 'ui/item/itm_petdaringraccon.png' }),
  itemProp({ id: II_SYS_SYS_VIS_KEY01, name: 'Bead Slot Key', kind1: 3, kind2: 19, kind3: 105, part: -1 }),
  itemProp({ id: II_SYS_SYS_SCR_PET_MAGIC, name: 'Pick-up Pet Upgrade', kind1: 3, kind2: 19, kind3: 105, part: -1 }),
];
const PROP_MAP = new Map(PROPS.map((prop) => [prop.id, prop]));

const TEXTS: Record<string, string> = {
  TID_GAME_BUFFPET_REQUIRE: 'Required Bead: ', TID_GAME_BUFFPET_EQUIP: 'Would you like to place the %s into your Buff Pet?',
  TID_GAME_BUFFPET_CANCEL: 'Delete the %s? ', TID_GAME_BUFFPET_KET01: "Would you like to unlock %s's Bead Slot?",
  TID_GAME_PET_TRAN: 'Would you like to transform your Pick-up Pet into a Buff Pet?', TID_PK_LIMIT_DAY: '%.1dday',
  TID_PK_LIMIT_HOUR: '%.1dhr', TID_PK_LIMIT_MINUTE: '%.1dmin', TID_PK_LIMIT_SECOND: '%.1dsec',
  TID_GAME_TOOLTIP_TIMEOUT: 'Expiration', TID_TOOLTIP_PERIOD: 'Period', TID_TOOLTIP_STR: 'STR',
  TID_TOOLTIP_DST_HP_MAX_RATE: 'Increased HP', TID_TOOLTIP_ATKPOWER: 'Increased Attack', TID_TOOLTIP_ATKSPEED: 'Attack Speed',
  TID_TOOLTIP_PET_BUFF: '[Buff Pet]',
};
const TEXT_MAP: GameData['texts'] = new Map(Object.entries(TEXTS).map(([id, text]) => [id, { id, text, color: 0xff000000 }]));

function buffPetData(): GameData {
  return ownGameData({
    movers: new Map([
      [11, webMoverOf({ index: 11, name: 'Male', ai: 1, speed: 0.1 })],
      [MI_PET_RACCON, webMoverOf({ index: MI_PET_RACCON, name: 'Tiny Tanuki', ai: 10, belligerence: 1, speed: 0.1 })],
    ]),
    itemProps: new Map([...ownGameData().itemProps, ...PROP_MAP]),
    texts: TEXT_MAP,
  });
}

/** A pet's vis list and times: `ends` the end times. */
const petOf = (piercing: number[], ends: number[] = piercing.map(() => T0 + 3600)) => ({ piercing, ends });

// ---- the rules ---------------------------------------------------------------------------------------------------

describe('the vis rules (pets/buffPet.ts)', () => {
  it('GetValidVisTable: an empty slot fails; a vis works when the vis it needs work (MoverSkill.cpp:4188-4248)', () => {
    expect(validVisTable(petOf([VIS_STR, VIS_WARRIOR, VIS_ATK1, 0]), PROP_MAP))
      .toEqual([NeedVis.SUCCESS, NeedVis.FAILED_2ND, NeedVis.SUCCESS, NeedVis.FAILED_BOTH]);
    expect(validVisTable(petOf([VIS_WARRIOR, VIS_ATK2, VIS_ATK1]), PROP_MAP)).toEqual([NeedVis.SUCCESS, NeedVis.SUCCESS, NeedVis.SUCCESS]);
    expect(validVisTable(petOf([VIS_WARRIOR]), PROP_MAP)).toEqual([NeedVis.FAILED_BOTH]);
  });

  it('IsSatisfyNeedVis: each need in a working slot whose time is not out (MoverSkill.cpp:4250-4275)', () => {
    const warrior = PROP_MAP.get(VIS_WARRIOR)!;
    const pet = petOf([VIS_ATK1, VIS_ATK2, 0], [T0 + 10, T0 + 10, 0]);
    expect(satisfyNeedVis(pet, warrior, PROP_MAP, T0)).toBe(NeedVis.SUCCESS);
    expect(satisfyNeedVis({ ...pet, ends: [T0, T0 + 10, 0] }, warrior, PROP_MAP, T0)).toBe(NeedVis.FAILED_1ST);
    expect(satisfyNeedVis(petOf([VIS_ATK1]), warrior, PROP_MAP, T0)).toBe(NeedVis.FAILED_2ND);
    expect(satisfyNeedVis(petOf([]), warrior, PROP_MAP, T0)).toBe(NeedVis.FAILED_BOTH);
    expect(satisfyNeedVis(petOf([]), PROP_MAP.get(VIS_STR)!, PROP_MAP, T0)).toBe(NeedVis.SUCCESS);
  });

  it('GetVisPetSfxId: the aura of the best vis level, none without vis (Item.cpp:810-828)', () => {
    expect(visPetSfxId(petOf([VIS_STR, 0]), PROP_MAP)).toBe(1914);
    expect(visPetSfxId(petOf([VIS_STR, VIS_HP]), PROP_MAP)).toBe(1915);
    expect(visPetSfxId(petOf([VIS_WARRIOR]), PROP_MAP)).toBe(1916);
    expect(visPetSfxId(petOf([0, 0]), PROP_MAP)).toBe(NULL_ID);
  });

  it("PutVisPetInfo's time words, CTimeSpan's parts truncated (WndManager.cpp:7562-7596)", () => {
    expect(timeSpan(-90)).toEqual({ days: 0, hours: 0, minutes: -1, seconds: -30 });
    expect(visTimeLeft(90061, TEXT_MAP)).toBe('1day1hr1min');
    expect(visTimeLeft(3700, TEXT_MAP)).toBe('1hr1min');
    expect(visTimeLeft(75, TEXT_MAP)).toBe('1min15sec');
    expect(visTimeLeft(5, TEXT_MAP)).toBe('5sec');
    expect(visTimeLeft(-5, TEXT_MAP)).toBe('Expiration');
    expect(visTimeLeft(-120, TEXT_MAP)).toBe('0sec'); // a whole minute past: `nSec >= 0`
  });

  it('CheckConfirm asks before a vis or the vis key with a buff pet out, and always before Pet Magic (WndManager.cpp:7646-7692)', () => {
    expect(checkConfirmVis(PROP_MAP.get(VIS_STR)!, true)).toBe('equipVis');
    expect(checkConfirmVis(PROP_MAP.get(VIS_STR)!, false)).toBeNull();
    expect(checkConfirmVis(PROP_MAP.get(II_SYS_SYS_VIS_KEY01)!, true)).toBe('equipVisKey');
    expect(checkConfirmVis(PROP_MAP.get(II_SYS_SYS_VIS_KEY01)!, false)).toBeNull();
    expect(checkConfirmVis(PROP_MAP.get(II_SYS_SYS_SCR_PET_MAGIC)!, false)).toBe('pickupToBuff');
  });

  it("the vis is used from the bag now, its box's OK naming the player (premiumItems.ts)", () => {
    expect(useOf(PROP_MAP.get(VIS_STR)!)).toBe('use');
    expect(confirmedTarget(PROP_MAP.get(VIS_STR)!, 0x77, OWN_ID)).toBe(OWN_ID);
    expect(confirmedTarget(PROP_MAP.get(II_SYS_SYS_VIS_KEY01)!, 0x77, OWN_ID)).toBe(OWN_ID);
    expect(confirmedTarget(PROP_MAP.get(II_SYS_SYS_SCR_PET_MAGIC)!, 0x77, OWN_ID)).toBe(OWN_ID);
  });

  it("the window's camera: the event point (here the origin) + (0.5, 1.8, -3), the model at 1.5 over its radius (WndPetSys.cpp:2380-2399)", () => {
    const camera = buffPetCamera([0, 0, 0], { min: [-1, 0, -1], max: [1, 2, 1] }, 1);
    expect(camera.pos).toEqual([0.5, Math.fround(1.8), -3]);
    expect(camera.lookAt).toEqual([-0.24, 0.28, 1]);
    // the radius is half the box's diagonal, sqrt( 12 ) / 2
    expect(camera.scale).toBeCloseTo(1.5 / (Math.sqrt(12) / 2), 5);
    // a model scaled up in mdlDyna.inc moves the event point: 2 - 2 * ( 0.9 + 0.02 )
    expect(buffPetCamera([0, 1, 0], { min: [0, 0, 0], max: [1, 1, 1] }, 2).pos[1]).toBeCloseTo(1.8 + 0.16, 5);
  });
});

// ---- the own buff pet in the pretend world -----------------------------------------------------------------------

/** The own ADD_OBJ: a Vagrant with the buff pet item in bag slot 5 (STR in slot 0, an hour left; slot 1 empty), a vis, the key and Pet Magic. */
function ownWithBuffPet(): AddedMover {
  const own = newVagrantOwn();
  const inventory: InventoryItem[] = [
    ...own.inventory!,
    { objectId: BAG_PET, itemId: II_PET_RACCON, count: 1, piercing: [VIS_STR, 0], visKeepTimes: [3600, -T0] },
    { objectId: BAG_VIS, itemId: VIS_HP, count: 2 },
    { objectId: BAG_KEY, itemId: II_SYS_SYS_VIS_KEY01, count: 1 },
    { objectId: BAG_MAGIC, itemId: II_SYS_SYS_SCR_PET_MAGIC, count: 1 },
  ].sort((x, y) => x.objectId - y.objectId);
  const added = addedPlayer(OWN_ID, {
    self: true, own: { ...own, inventory }, equipmentObjectIds: new Array<number>(31).fill(NULL_ID),
  }, { hitPoint: 230 });
  const [message] = read([writeAddSelf(OWN_ID, added)]);
  if (message?.value.type !== 'addMover') throw new Error('the own ADD_OBJ was not read');
  return message.value.mover;
}

function fakeModel(): AssembledCharacter {
  const root = new Group();
  return {
    root, mixer: new AnimationMixer(root), release: vi.fn(), box: () => ({ min: [-1, 0, -1], max: [1, 2, 1] }),
  } as unknown as AssembledCharacter;
}

function pretendWorld() {
  const data = buffPetData();
  let now = T0;
  const added = ownWithBuffPet();
  const own = new OwnState(data, added, STARTER_EQUIPMENT, () => false, () => now);
  const world = new WorldState(data, new ServerClock(() => 0), terrainGround(() => 0), own);
  world.apply(OWN_ID, { type: 'addMover', mover: added }, true);
  const statusFrame = new WindowFrame('', art, { width: 220, height: 112, texture: 'WndStatus2.tga' }, document);
  document.body.append(statusFrame.element);
  statusFrame.open({ x: 0, y: 0 });
  const confirms: Array<{ text: string; ok: () => void; parent: unknown }> = [];
  const host: BuffPetHost = {
    own: () => own, props: data.itemProps, texts: data.texts,
    statusFrame: () => statusFrame, worldRight: () => 1280,
    mover: (id) => world.movers.get(id),
    moverName: (index) => data.movers.get(index)?.name ?? null,
    modelScale: () => 1,
    loadPortrait: vi.fn(async () => ({ model: fakeModel(), motion: null })),
    renderer: () => null,
    confirm: (text, ok, parent) => { confirms.push({ text, ok, parent }); },
    use: vi.fn(), sendRemoveVis: vi.fn(), sendSwapVis: vi.fn(),
    tooltipData: data, tooltipContext: (item) => ownTooltipContext(own, item, 'other'),
    ui: { art, doc: document },
  };
  const windows = new BuffPetWindows(host);
  document.body.append(windows.element);
  const events: OwnEvent[] = [];
  const send = (...messages: ScriptMessage[]): VisPetChange[] => {
    for (const { objectId, value } of read(messages)) world.apply(objectId, value);
    const own = world.takeChanges().own;
    events.push(...own);
    const changes = own.flatMap((e) => (e.kind === 'visPet' ? [e.change] : []));
    for (const change of changes) windows.onVisPet(change);
    return changes;
  };
  const petMover = addedNpc(PET_MOVER, MI_PET_RACCON, {}, { sfxId: NULL_ID });
  return {
    data, own, world, host, windows, send, confirms, events, petMover, statusFrame,
    tick: (seconds: number) => { now += seconds; },
  };
}

const slotsOf = (windows: BuffPetWindows): HTMLElement[] =>
  [...windows.status.frame.element.querySelectorAll<HTMLElement>('.hud-buffpet-slot')];

describe('the own buff pet (OwnState: OnActivateVisPet, UpdateItem UI_PETVIS_*)', () => {
  it('keeps the vis times as end times, which count down', () => {
    const p = pretendWorld();
    expect(p.own.visPetOf(BAG_PET)).toEqual({ piercing: [VIS_STR, 0], ends: [T0 + 3600, 0] });
    p.tick(600);
    expect(p.own.visPetOf(BAG_PET)!.ends[0]! - p.own.clock()).toBe(3000);
  });

  it('VISPET_ACTIVATE sets and clears the buff pet item and its mover (DPClient.cpp:19002-19029)', () => {
    const p = pretendWorld();
    expect(p.send(writeVisPetActivate(OWN_ID, BAG_PET, PET_MOVER))).toEqual([{ kind: 'activated' }]);
    expect(p.own.visPetSlot).toBe(BAG_PET);
    expect(p.own.eatPetId).toBe(PET_MOVER);
    expect(p.own.visPetItem()?.itemId).toBe(II_PET_RACCON);
    expect(p.send(writeVisPetActivate(OWN_ID, NULL_ID, NULL_ID))).toEqual([{ kind: 'deactivated' }]);
    expect(p.own.visPetSlot).toBeNull();
    expect(p.own.eatPetId).toBeNull();
  });

  it('UI_PETVIS_ITEM puts a vis in with its minutes from now, ITEMSWAP swaps, SIZE opens a slot (MoverParam.cpp:3981-4012)', () => {
    const p = pretendWorld();
    p.tick(100);
    // MAKELONG( slot 1, VIS_HP ), 4320 minutes
    expect(p.send(writeUpdateItem(OWN_ID, BAG_PET, 16, (VIS_HP << 16) | 1, 4320))).toEqual([{ kind: 'vis' }]);
    expect(p.own.visPetOf(BAG_PET)).toEqual({ piercing: [VIS_STR, VIS_HP], ends: [T0 + 3600, T0 + 100 + 4320 * 60] });
    expect(p.send(writeUpdateItem(OWN_ID, BAG_PET, 17, (1 << 16) | 0))).toEqual([{ kind: 'vis' }]);
    expect(p.own.visPetOf(BAG_PET)).toEqual({ piercing: [VIS_HP, VIS_STR], ends: [T0 + 100 + 4320 * 60, T0 + 3600] });
    expect(p.send(writeUpdateItem(OWN_ID, BAG_PET, 15, 3))).toEqual([{ kind: 'vis' }]);
    expect(p.own.visPetOf(BAG_PET)).toEqual({ piercing: [VIS_HP, VIS_STR, 0], ends: [T0 + 100 + 4320 * 60, T0 + 3600, 0] });
    // a slot emptied (RemovePetVisItem: MAKELONG( slot, 0 ), time 0): the time is now
    p.send(writeUpdateItem(OWN_ID, BAG_PET, 16, 0));
    expect(p.own.visPetOf(BAG_PET)!.piercing).toEqual([0, VIS_STR, 0]);
    // a swap past the list does nothing
    expect(p.send(writeUpdateItem(OWN_ID, BAG_PET, 17, (5 << 16) | 0))).toEqual([]);
  });

  it('UI_TRANSFORM_VISPET makes a Pet Magic pet, charged, with no sound (MoverParam.cpp:4014-4019)', () => {
    const p = pretendWorld();
    expect(p.send(writeUpdateItem(OWN_ID, BAG_PET, 18, 1))).toEqual([]);
    expect(p.own.inventory!.get(BAG_PET)).toMatchObject({ transformVisPet: true, charged: 1 });
  });

  it('MOVER_CHANGESFX and the ADD_OBJ give a mover its aura id (DPClient.cpp:19032-19042)', () => {
    const p = pretendWorld();
    p.send(writeAddNpc(PET_MOVER, { ...p.petMover, sfxId: 1914 }));
    expect(p.world.movers.get(PET_MOVER)!.moverSfxId).toBe(1914);
    p.send(writeMoverChangeSfx(PET_MOVER, 1916));
    expect(p.world.movers.get(PET_MOVER)!.moverSfxId).toBe(1916);
  });
});

// ---- the window ----------------------------------------------------------------------------------------------------

describe('CWndBuffPetStatus in the pretend world (pets/buffPetWindows.ts, hud/buffPetStatusWindow.ts)', () => {
  it('opens beside the status window on VISPET_ACTIVATE and closes when the pet goes', () => {
    const p = pretendWorld();
    p.send(writeVisPetActivate(OWN_ID, BAG_PET, PET_MOVER));
    expect(p.windows.status.isOpen).toBe(true);
    expect(p.windows.status.frame.position).toEqual({ x: 220, y: 0 });
    expect(p.windows.status.frame.element.getAttribute('aria-label')).toBe('Buff Pet Status');
    p.send(writeVisPetActivate(OWN_ID, NULL_ID, NULL_ID));
    expect(p.windows.status.isOpen).toBe(false);
  });

  it('draws the open slots (a vis, white when it works, faded when not), the closed ones locked (DrawSlotItems)', () => {
    const p = pretendWorld();
    p.send(writeVisPetActivate(OWN_ID, BAG_PET, PET_MOVER));
    p.windows.frame();
    const slots = slotsOf(p.windows);
    expect(slots.map((slot) => slot.dataset.state)).toEqual(['vis', 'empty', ...new Array(7).fill('locked')]);
    const icon = (i: number): HTMLImageElement => slots[i]!.querySelector('img')!;
    expect(icon(0).getAttribute('src')).toBe('/assets/ui/item/itm_syssysvislv01.png');
    expect(icon(0).style.opacity).toBe('');
    expect(icon(1).hidden).toBe(true);
    expect(icon(2).getAttribute('src')).toBe('/assets/ui/icon_lock.png');
    // the Warrior with neither of its needs: faded (0x4fffffff)
    p.send(writeUpdateItem(OWN_ID, BAG_PET, 16, (VIS_WARRIOR << 16) | 1, 10080));
    p.windows.frame();
    expect(icon(1).style.opacity).toBe(String(0x4f / 255));
  });

  it("takes the pet mover's name as the title and its model as the portrait, once it is in view (Process)", async () => {
    const p = pretendWorld();
    p.send(writeVisPetActivate(OWN_ID, BAG_PET, PET_MOVER));
    p.windows.frame();
    expect(p.host.loadPortrait).not.toHaveBeenCalled();
    p.send(writeAddNpc(PET_MOVER, p.petMover));
    p.windows.frame();
    expect(p.windows.status.frame.element.getAttribute('aria-label')).toBe('Tiny Tanuki');
    expect(p.host.loadPortrait).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(p.windows.portrait.shown).toBe(true));
  });

  it('a double-click asks to take a vis out, OK sends VISPET_REMOVEVIS (OnLButtonDblClk, CWndConfirmVis)', () => {
    const p = pretendWorld();
    p.send(writeVisPetActivate(OWN_ID, BAG_PET, PET_MOVER));
    p.windows.frame();
    const slots = slotsOf(p.windows);
    slots[1]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(p.confirms).toEqual([]); // an empty slot asks nothing
    slots[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(p.confirms.map((c) => c.text)).toEqual(['Delete the Bead of STR? ']);
    expect(p.confirms[0]!.parent).toEqual({ x: 220, y: 0, width: 192, height: 128 });
    p.confirms[0]!.ok();
    expect(p.host.sendRemoveVis).toHaveBeenCalledWith(0);
  });

  it('a vis dropped from the bag on an open slot asks, OK uses it; a slot dragged to another swaps (OnDropIcon)', () => {
    const p = pretendWorld();
    p.send(writeVisPetActivate(OWN_ID, BAG_PET, PET_MOVER));
    p.windows.frame();
    const slots = slotsOf(p.windows);
    const drop = (slot: HTMLElement, data: Record<string, string>): void => {
      const event = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown };
      event.dataTransfer = { getData: (type: string) => data[type] ?? '', types: Object.keys(data) };
      slot.dispatchEvent(event);
    };
    drop(slots[4]!, { 'application/x-flyff-inventory': String(BAG_VIS) }); // a closed slot: nothing
    expect(p.confirms).toEqual([]);
    drop(slots[1]!, { 'application/x-flyff-inventory': String(BAG_KEY) }); // not a vis: nothing
    expect(p.confirms).toEqual([]);
    drop(slots[1]!, { 'application/x-flyff-inventory': String(BAG_VIS) });
    expect(p.confirms.map((c) => c.text)).toEqual(['Would you like to place the Bead of HP into your Buff Pet?']);
    p.confirms[0]!.ok();
    expect(p.host.use).toHaveBeenCalledWith(BAG_VIS);
    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown };
    dragStart.dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    slots[0]!.dispatchEvent(dragStart);
    drop(slots[1]!, { 'application/x-flyff-vis-slot': '0' });
    expect(p.host.sendSwapVis).toHaveBeenCalledWith(0, 1);
  });

  it("CheckConfirm: a vis or the key with the pet out opens the window and asks; Pet Magic asks centred", () => {
    const p = pretendWorld();
    expect(p.windows.checkConfirm(BAG_VIS)).toBe(false); // no buff pet out: DOUSEITEM at once
    expect(p.windows.checkConfirm(BAG_MAGIC)).toBe(true);
    expect(p.confirms.at(-1)).toMatchObject({ text: 'Would you like to transform your Pick-up Pet into a Buff Pet?', parent: null });
    p.send(writeVisPetActivate(OWN_ID, BAG_PET, PET_MOVER), writeAddNpc(PET_MOVER, p.petMover));
    p.windows.status.close();
    expect(p.windows.checkConfirm(BAG_KEY)).toBe(true);
    expect(p.windows.status.isOpen).toBe(true);
    expect(p.confirms.at(-1)!.text).toBe("Would you like to unlock Tiny Tanuki's Bead Slot?");
    expect(p.windows.checkConfirm(BAG_VIS)).toBe(true);
    p.confirms.at(-1)!.ok();
    expect(p.host.use).toHaveBeenCalledWith(BAG_VIS);
  });

  it("a slot's tooltip is the vis with its time left as its keep time (OnMouseWndSurface, PutKeepTime)", () => {
    const p = pretendWorld();
    p.send(writeVisPetActivate(OWN_ID, BAG_PET, PET_MOVER));
    p.windows.frame();
    p.tick(60);
    slotsOf(p.windows)[0]!.dispatchEvent(new Event('pointerenter'));
    const tooltip = p.windows.status.frame.element.querySelector<HTMLElement>('.hud-item-tooltip')!;
    const lines = [...tooltip.querySelectorAll('.hud-item-tooltip-line')].map((line) => line.textContent);
    expect(lines).toContain('STR+3');
    expect(lines).toContain('59min0secPeriod');
    // made again each second while the pointer stays: the time counts down
    p.tick(1);
    p.windows.frame();
    const again = p.windows.status.frame.element.querySelectorAll('.hud-item-tooltip');
    expect(again).toHaveLength(1);
    expect([...again[0]!.querySelectorAll('.hud-item-tooltip-line')].map((line) => line.textContent)).toContain('58min59secPeriod');
    slotsOf(p.windows)[0]!.dispatchEvent(new Event('pointerleave'));
    p.tick(1);
    p.windows.frame();
    expect(p.windows.status.frame.element.querySelector('.hud-item-tooltip')).toBeNull();
  });
});

// ---- the tooltips, the aura, the buff bar ------------------------------------------------------------------------

describe('the vis tooltips (PutNeededVis, PutVisPetInfo, PutKeepTime)', () => {
  const data = { texts: TEXT_MAP, itemProps: PROP_MAP };

  it("a vis says what it needs, in red what the buff pet lacks, and its prop's minutes (WndManager.cpp:7429-7476, :5866-5875)", () => {
    const item: InventoryItem = { objectId: 1, itemId: VIS_WARRIOR, count: 1 };
    const prop = PROP_MAP.get(VIS_WARRIOR)!;
    const lines = itemTooltip(item, prop, data, { flag: 'inventory', viewer: null, now: T0, activeVisPet: petOf([VIS_ATK1]) });
    const needs = lines.filter((line) => line[0]?.text.startsWith('Required'));
    expect(needs.map((line) => [line[0]!.text, line[0]!.color])).toEqual([
      ['Required Bead: : Bead of Attack', 0x000000], ['Required Bead: : Bead of Attack II', 0xff0000],
    ]);
    expect(lineTexts(lines)).toContain('7day0hr0minPeriod');
  });

  it("a buff pet's vis: their stats added up by DST, then each vis's time, red past its end (WndManager.cpp:7479-7608)", () => {
    const pet = petOf([VIS_HP, VIS_STR, VIS_ATK1, 0], [T0 + 3700, T0 + 75, T0 - 5, 0]);
    expect(visPetInfo(pet, data, T0)).toEqual([
      { text: 'STR+3', color: 0xb200ff },
      { text: 'Increased HP+10%', color: 0xb200ff },
      { text: 'Bead of HP (1hr1min)', color: 0x00c800 },
      { text: 'Bead of STR (1min15sec)', color: 0x00c800 },
      { text: 'Bead of Attack (Expiration)', color: 0xff0000 },
    ]);
    const item: InventoryItem = { objectId: BAG_PET, itemId: II_PET_RACCON, count: 1, piercing: pet.piercing };
    const lines = lineTexts(itemTooltip(item, PROP_MAP.get(II_PET_RACCON)!, data, { flag: 'inventory', viewer: null, now: T0, visPet: pet }));
    expect(lines.slice(0, 4)).toEqual(['Tiny Tanuki    (3/4)', '[Buff Pet]', 'STR+3', 'Increased HP+10%']);
  });
});

describe('the aura (pets/buffPetAura.ts: SetSfxBuffPet, CSfxLinkMover)', () => {
  it("plays a mover's id as a looping effect that follows it, undrawn up, and lets it go when the id changes", () => {
    const auras = new BuffPetAuras();
    const played: Array<{ xi: number; followId?: number; lift?: number; whileTrue?: () => boolean }> = [];
    const mover = { objectId: PET_MOVER, moverSfxId: 1914, act: { body: { pos: [1, 2, 3] as [number, number, number] } } };
    auras.sync([mover, { ...mover, objectId: 1, moverSfxId: NULL_ID }], (request) => played.push(request));
    auras.sync([mover], (request) => played.push(request));
    expect(played.map(({ xi, followId, lift }) => ({ xi, followId, lift }))).toEqual([{ xi: 1914, followId: PET_MOVER, lift: 0 }]);
    expect(played[0]!.whileTrue!()).toBe(true);
    mover.moverSfxId = 1915;
    auras.sync([mover], (request) => played.push(request));
    expect(played[0]!.whileTrue!()).toBe(false);
    expect(played[1]!.xi).toBe(1915);
    auras.sync([], () => {});
    expect(played[1]!.whileTrue!()).toBe(false);
  });
});

describe('BUFF_EQUIP in the buff bar (WndWorld.cpp:9209-9218, :9392-9401)', () => {
  it("shows the buff pet item's icon last, with no time, and the vis in its tooltip", () => {
    const items = new Map([...PROP_MAP, [30000, itemProp({ id: 30000, name: 'Grilled Eel', kind2: 14, part: -1, icon: 'ui/item/itm_eel.png' })]]);
    const status = new BuffStatus(art, document, {
      items, visPetTooltip: (itemId) => (itemId === II_PET_RACCON ? ['STR+3', 'Bead of STR (59min59sec)'] : null),
    });
    document.body.append(status.element);
    const buff = (buffType: number, id: number, totalMs: number) => ({ buffType, id, level: 1, leftMs: totalMs, totalMs });
    status.update([buff(4, II_PET_RACCON, 999_999_999), buff(0, 30000, 60_000)], new Map(), 0);
    const icons = [...status.element.querySelectorAll<HTMLElement>('.hud-buff')];
    expect(icons.map((icon) => icon.querySelector('img')!.getAttribute('src'))).toEqual([
      '/assets/ui/item/itm_eel.png', '/assets/ui/item/itm_petdaringraccon.png',
    ]);
    expect(icons[1]!.querySelector('.hud-buff-time, .hud-buff-seconds')).toBeNull();
    expect(icons[1]!.title.split('\n')).toEqual(['Tiny Tanuki', 'STR+3', 'Bead of STR (59min59sec)']);
    status.dispose();
  });
});
