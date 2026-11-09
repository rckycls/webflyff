// @vitest-environment jsdom
// pets R4: the Pet Tamer's rare windows (pets/petTamer.ts, pets/petTamerWindows.ts): the egg exchange (CWndPetTransEggs),
// the pick-up pet's awakening cancel (CWndPetAwakCancel) and the pet trade for a revival scroll piece (CWndPetRes), with the
// pretend world's QUE_PETRESURRECTION_RESULT; and the revival scrolls on the upgrade cursor (EXT_ITEM, DO_USE_ITEM_TARGET).

import { afterEach, describe, expect, it } from 'vitest';
import type { WebItemProp } from '@flyffweb/formats';
import type { InventoryItem } from '@flyffweb/protocol';
import { writePetResurrectionResult } from '@flyffweb/testkit';
import { UpgradeCursor } from '../src/world/items/upgradeCursor';
import type { UpgradeSend } from '../src/world/items/upgradeItems';
import { OwnState } from '../src/world/OwnState';
import { MAX_TRANS_EGG, isEatPet, petTradeResult, petTradeTakes, transEggRefusal } from '../src/world/pets/petTamer';
import { PetTamerWindows } from '../src/world/pets/petTamerWindows';
import type { PetTamerHost, PetTamerPacket } from '../src/world/pets/petTamerWindows';
import { II_PET_EGG } from '../src/world/pets/raisedPet';
import { STARTER_EQUIPMENT, itemProp } from './helpers/ownState';
import { EGG_SLOT, II_TIGER, TIGER_C, art, ownAddObj, pet, petData, read } from './helpers/petData';

afterEach(() => {
  document.body.replaceChildren();
});

/** A pick-up pet (`IK3_PET`, `II_PET_*`), the revival scrolls of the S, A and B classes (`dwExeTarget` EXT_ITEM 21). */
const PICKUP = 21046, REVIVAL_S = 26522, REVIVAL_A = 26523, REVIVAL_B = 26524, SWORD = 2901;
const PROPS = new Map<number, WebItemProp>([
  ...petData().itemProps,
  [PICKUP, itemProp({ id: PICKUP, name: 'Doggy', kind1: 5, kind2: 19, kind3: 100, part: -1, icon: 'ui/item/itm_petdoggy.png' })],
  ...[REVIVAL_S, REVIVAL_A, REVIVAL_B].map((id) => [id, itemProp({ id, name: 'Scroll of Pet Revival', kind1: 5, kind2: 19, kind3: 50, part: -1, exeTarget: 21 })] as const),
  [SWORD, itemProp({ id: SWORD, name: 'Sword', kind1: 1, kind2: 2, kind3: 3, part: 10 })],
]);
const TEXTS: Record<string, string> = {
  TID_GAME_PETTRADE: 'Exchange Pets for Scroll pieces of the same class.', TID_GAME_PETTRADE_OK: 'Exchange Successful',
  TID_GAME_PETTRADE_FAIL: 'Add Pet To Be Exchanged',
};
/** Ten eggs (one with no pet, as a fresh one comes), a C tiger, a B tiger, a dead S tiger, a pick-up pet and a sword. */
const EGGS = Array.from({ length: MAX_TRANS_EGG }, (_, i) => 40 + i);
const SLOTS = { tigerC: 50, tigerB: 51, deadS: 52, pickup: 53, sword: 54, revivalB: 55, revivalS: 56 };
const TIGER_B = pet({ level: 3, exp: 500, energy: 200, life: 2, availLevels: [1, 3, 2, 0, 0, 0] });
const TIGER_S = pet({ level: 5, life: 0, availLevels: [1, 3, 2, 4, 9, 0] });

/** The own player with the egg at bag slot 3 out (or not), the items above, and the windows in a layer. */
function pretendWorld(out = false) {
  const data = { ...petData(), itemProps: PROPS };
  const own = new OwnState(data, ownAddObj(pet(), out), STARTER_EQUIPMENT);
  const items: InventoryItem[] = [
    ...EGGS.map((objectId, i): InventoryItem => ({ objectId, itemId: II_PET_EGG, count: 1, ...(i === 0 ? {} : { pet: pet() }) })),
    { objectId: SLOTS.tigerC, itemId: II_TIGER, count: 1, pet: TIGER_C },
    { objectId: SLOTS.tigerB, itemId: II_TIGER, count: 1, pet: TIGER_B },
    { objectId: SLOTS.deadS, itemId: II_TIGER, count: 1, pet: TIGER_S, flag: 1 },
    { objectId: SLOTS.pickup, itemId: PICKUP, count: 1 },
    { objectId: SLOTS.sword, itemId: SWORD, count: 1 },
    { objectId: SLOTS.revivalB, itemId: REVIVAL_B, count: 1 },
    { objectId: SLOTS.revivalS, itemId: REVIVAL_S, count: 1 },
  ];
  for (const item of items) own.inventory!.set(item.objectId, item);
  const layer = document.createElement('div');
  document.body.append(layer);
  const sent: PetTamerPacket[] = [];
  const said: string[] = [];
  const alerts: string[] = [];
  const reserved = new Map<number, number>();
  let bagOpened = 0;
  const host: PetTamerHost = {
    own: () => own, props: PROPS,
    text: (tid) => TEXTS[tid] ?? tid,
    say: (tid, color) => void said.push(color === undefined ? tid : `${tid}|${color.toString(16)}`),
    alert: (text) => void alerts.push(text),
    send: (...packet) => void sent.push(packet),
    reserve: (id, on) => { const n = (reserved.get(id) ?? 0) + (on ? 1 : -1); if (n > 0) reserved.set(id, n); else reserved.delete(id); },
    held: (id) => (reserved.get(id) ?? 0) > 0,
    inUse: (id) => id === own.petSlot,
    openBag: () => { bagOpened++; },
    tooltipData: data,
    tooltipContext: () => ({ flag: 'other', viewer: null, shopOpen: false }),
    ui: { art, doc: document, layer: () => layer },
  };
  const tamer = new PetTamerWindows(host);
  const win = (title: string): HTMLElement | undefined =>
    [...layer.querySelectorAll<HTMLElement>('.hud-res-window')]
      .find((w) => !w.hidden && w.querySelector('.hud-window-title')!.textContent === title);
  const control = (title: string, id: string): HTMLElement => win(title)!.querySelector<HTMLElement>(`[data-control="${id}"]`)!;
  const button = (title: string, id: string): HTMLButtonElement => control(title, id) as HTMLButtonElement;
  /** A drop of the bag item `objectId` on `target` (the browser's drag and drop, `OnDropIcon`). */
  const drop = (target: HTMLElement, objectId: number): void => {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: { types: ['application/x-flyff-inventory'], getData: () => String(objectId) },
    });
    target.dispatchEvent(event);
  };
  const icons = (title: string, id: string): string[] =>
    [...control(title, id).querySelectorAll<HTMLImageElement>('.hud-res-slot img')].map((img) => img.getAttribute('src')!);
  return { own, tamer, sent, said, alerts, reserved, win, control, button, drop, icons, bagOpened: () => bagOpened };
}

describe("the Pet Tamer's rules (pets/petTamer.ts)", () => {
  it('the egg exchange takes ten unhatched eggs: in use ERROR2, a hatched pet or another item ERROR1', () => {
    expect(MAX_TRANS_EGG).toBe(10);
    const egg = { kind3: 120 };
    expect(transEggRefusal(egg, {}, false)).toBeNull();
    expect(transEggRefusal(egg, { pet: pet() }, false)).toBeNull();
    expect(transEggRefusal(egg, { pet: TIGER_C }, false)).toBe('TID_GAME_TRANS_EGGS_ERROR1');
    expect(transEggRefusal({ kind3: 3 }, {}, false)).toBe('TID_GAME_TRANS_EGGS_ERROR1');
    expect(transEggRefusal(egg, {}, true)).toBe('TID_GAME_TRANS_EGGS_ERROR2');
  });

  it('the awakening cancel takes a pick-up pet (IsEatPet); the pet trade a B, A or S pet not out, not held, not dead', () => {
    expect([isEatPet({ kind3: 100 }), isEatPet({ kind3: 120 })]).toEqual([true, false]);
    expect(petTradeTakes({ pet: TIGER_B }, false, false)).toBe(true);
    expect(petTradeTakes({ pet: TIGER_S }, false, false)).toBe(true);
    expect(petTradeTakes({ pet: TIGER_C }, false, false)).toBe(false);
    expect(petTradeTakes({}, false, false)).toBe(false);
    expect(petTradeTakes({ pet: TIGER_B }, true, false)).toBe(false);
    expect(petTradeTakes({ pet: TIGER_B }, false, true)).toBe(false);
    expect(petTradeTakes({ pet: TIGER_S, flag: 1 }, false, false)).toBe(false);
    expect([petTradeResult(true), petTradeResult(false)]).toEqual(['TID_GAME_PETTRADE_OK', 'TID_GAME_PETTRADE_FAIL']);
  });
});

describe('the egg exchange (MMI_PET_EGG01, CWndPetTransEggs, WndPetSys.cpp:1920-2159)', () => {
  it('opens the bag and "Egg Change" with its help, OK off; a second open says TID_GAME_WND_OVERLAPED', () => {
    const p = pretendWorld();
    p.tamer.openEggs();
    expect(p.bagOpened()).toBe(1);
    expect(p.win('Egg Change')).toBeDefined();
    const help = p.control('Egg Change', 'WIDC_TEXT1').textContent!;
    expect(help).toContain(' Egg Hatching ');
    expect(help).toContain('Transform 10 Eggs into a D class Pet or Pet Feed at random chance.');
    expect(p.button('Egg Change', 'WIDC_OK').disabled).toBe(true);
    expect(p.tamer.picking).toBe(true);
    p.tamer.openEggs();
    expect(p.said).toEqual(['TID_GAME_WND_OVERLAPED']);
    expect(p.bagOpened()).toBe(1);
  });

  it('the bag fills the first empty slot; ten eggs turn OK on, which sends TRANSFORM_ITEM 0 with each egg once and closes', () => {
    const p = pretendWorld();
    p.tamer.openEggs();
    for (const egg of EGGS.slice(0, 9)) expect(p.tamer.pick(egg)).toBe(true);
    expect(p.button('Egg Change', 'WIDC_OK').disabled).toBe(true);
    // a held egg is passed over (IsUsableItem), saying nothing
    p.tamer.pick(EGGS[0]!);
    expect(p.said).toEqual([]);
    p.tamer.pick(EGGS[9]!);
    expect(p.button('Egg Change', 'WIDC_OK').disabled).toBe(false);
    expect([...p.reserved.keys()].sort()).toEqual(EGGS);
    expect(p.icons('Egg Change', 'WIDC_STATIC10')).toEqual(['/assets/ui/item/itm_petegg.png']);
    p.button('Egg Change', 'WIDC_OK').click();
    expect(p.sent).toEqual([['transformItem', 0, EGGS.map((objectId) => ({ objectId, count: 1 }))]]);
    expect(p.win('Egg Change')).toBeUndefined();
    expect(p.reserved.size).toBe(0);
    expect(p.tamer.picking).toBe(false);
  });

  it('refuses the summoned egg (ERROR2) and anything not an unhatched egg (ERROR1), in red as their TIDs are', () => {
    const p = pretendWorld(true);
    p.tamer.openEggs();
    p.tamer.pick(EGG_SLOT);
    p.tamer.pick(SLOTS.tigerC);
    p.tamer.pick(SLOTS.sword);
    expect(p.said).toEqual(['TID_GAME_TRANS_EGGS_ERROR2', 'TID_GAME_TRANS_EGGS_ERROR1', 'TID_GAME_TRANS_EGGS_ERROR1']);
    expect(p.reserved.size).toBe(0);
  });

  it('a drop goes in the empty slot it falls on; a double-click empties a slot and turns OK off; Cancel lets all go', () => {
    const p = pretendWorld();
    p.tamer.openEggs();
    p.drop(p.control('Egg Change', 'WIDC_STATIC3'), EGGS[0]!);
    expect(p.icons('Egg Change', 'WIDC_STATIC3')).toHaveLength(1);
    expect(p.icons('Egg Change', 'WIDC_STATIC1')).toHaveLength(0);
    // a drop on a full slot, or off the slots, puts nothing in
    p.drop(p.control('Egg Change', 'WIDC_STATIC3'), EGGS[1]!);
    p.drop(p.control('Egg Change', 'WIDC_TEXT1'), EGGS[1]!);
    expect([...p.reserved.keys()]).toEqual([EGGS[0]]);
    for (const egg of EGGS.slice(1)) p.tamer.pick(egg);
    expect(p.button('Egg Change', 'WIDC_OK').disabled).toBe(false);
    p.control('Egg Change', 'WIDC_STATIC3').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(p.button('Egg Change', 'WIDC_OK').disabled).toBe(true);
    expect(p.reserved.has(EGGS[0]!)).toBe(false);
    p.button('Egg Change', 'WIDC_CANCEL').click();
    expect(p.reserved.size).toBe(0);
    expect(p.sent).toEqual([]);
  });
});

describe('the awakening cancel (MMI_PET_AWAK_CANCEL, CWndPetAwakCancel, WndPetSys.cpp:15-165)', () => {
  it('takes a pick-up pet only; its button sends PICKUP_PET_AWAKENING_CANCEL and closes', () => {
    const p = pretendWorld();
    p.tamer.openAwakCancel();
    const title = 'Remove Pick-up Pet Blessing';
    expect(p.control(title, 'WIDC_TEXT1').textContent).toContain('Scroll of Pet Reversion (Pickup Pets)');
    expect(p.button(title, 'WIDC_BUTTON1').disabled).toBe(true);
    p.tamer.pick(SLOTS.tigerB);
    expect([p.said, p.button(title, 'WIDC_BUTTON1').disabled]).toEqual([[], true]);
    p.drop(p.control(title, 'WIDC_TEXT1'), SLOTS.pickup); // anywhere on the window
    expect(p.button(title, 'WIDC_BUTTON1').disabled).toBe(false);
    expect(p.icons(title, 'WIDC_STATIC1')).toEqual(['/assets/ui/item/itm_petdoggy.png']);
    expect([...p.reserved.keys()]).toEqual([SLOTS.pickup]);
    p.control(title, 'WIDC_STATIC1').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect([p.reserved.size, p.button(title, 'WIDC_BUTTON1').disabled]).toEqual([0, true]);
    p.tamer.pick(SLOTS.pickup);
    p.button(title, 'WIDC_BUTTON1').click();
    expect(p.sent).toEqual([['pickupPetAwakeningCancel', SLOTS.pickup]]);
    expect(p.win(title)).toBeUndefined();
    expect(p.reserved.size).toBe(0);
  });

  it('a second open replaces the first (SAFE_DELETE), letting its pet go', () => {
    const p = pretendWorld();
    p.tamer.openAwakCancel();
    p.tamer.pick(SLOTS.pickup);
    p.tamer.openAwakCancel();
    expect(p.said).toEqual([]);
    expect(p.reserved.size).toBe(0);
    expect(p.button('Remove Pick-up Pet Blessing', 'WIDC_BUTTON1').disabled).toBe(true);
  });
});

describe('the pet trade (MMI_PET_RES, CWndPetRes, WndPetRes.cpp) and QUE_PETRESURRECTION_RESULT', () => {
  it('takes a living B to S pet not out; OK sends QUE_PETRESURRECTION and closes; others say TID_GAME_PETTRADE_ERROR in red', () => {
    const p = pretendWorld();
    p.tamer.openTrade();
    expect(p.control('Trade Window', 'WIDC_DESC').textContent).toBe('Exchange Pets for Scroll pieces of the same class.');
    // OK is on with no pet: it does nothing
    expect(p.button('Trade Window', 'WIDC_OK').disabled).toBe(false);
    p.button('Trade Window', 'WIDC_OK').click();
    expect([p.sent, p.win('Trade Window') !== undefined]).toEqual([[], true]);
    for (const id of [EGGS[1]!, SLOTS.tigerC, SLOTS.deadS, SLOTS.sword]) p.tamer.pick(id);
    expect(p.said).toEqual(new Array(4).fill('TID_GAME_PETTRADE_ERROR|ffff0000'));
    p.tamer.pick(SLOTS.tigerB);
    expect(p.icons('Trade Window', 'WIDC_CHANGE')).toEqual(['/assets/ui/item/itm_petwhitetiger01_01.png']);
    p.tamer.openTrade();
    expect(p.said.at(-1)).toBe('TID_GAME_WND_OVERLAPED');
    p.button('Trade Window', 'WIDC_OK').click();
    expect(p.sent).toEqual([['quePetResurrection', SLOTS.tigerB]]);
    expect(p.win('Trade Window')).toBeUndefined();
    expect(p.reserved.size).toBe(0);
  });

  it("the answer's box: TID_GAME_PETTRADE_OK or _FAIL (OnQuePetResurrectionResult)", () => {
    const p = pretendWorld();
    for (const ok of [true, false]) {
      for (const { value } of read([writePetResurrectionResult(ok)])) {
        if (value.type === 'petResurrectionResult') p.tamer.onTradeResult(value.ok);
      }
    }
    expect(p.alerts).toEqual(['Exchange Successful', 'Add Pet To Be Exchanged']);
  });
});

describe('the revival scrolls (II_SYS_SYS_QUE_PETRESURRECTION02_S/A/B, EXT_ITEM): the upgrade cursor', () => {
  it('a double-clicked scroll, then the dead pet: 4 s later DO_USE_ITEM_TARGET (scroll, pet); the server judges the class', () => {
    const p = pretendWorld();
    let now = 0;
    const sent: UpgradeSend[] = [];
    const cursor = new UpgradeCursor({
      own: () => p.own, props: PROPS, now: () => now, hasItemBuff: () => false, boxOpen: () => false,
      say: () => {}, confirm: () => {}, effect: () => {}, send: (packet) => void sent.push(packet),
    });
    expect(cursor.begin(SLOTS.revivalS)).toBe(true);
    expect(cursor.pick(SLOTS.deadS)).toBe(true);
    now = 4000;
    cursor.step();
    expect(sent).toEqual([{ packet: 'doUseItemTarget', first: SLOTS.revivalS, second: SLOTS.deadS }]);
    // a B scroll on the S pet goes too: TID_GAME_PETRESURRECTION_WRONG_TARGET_02 is the server's (DPSrvr.cpp:3389-3398)
    expect(cursor.begin(SLOTS.revivalB)).toBe(true);
    expect(cursor.pick(SLOTS.deadS)).toBe(true);
    now = 8000;
    cursor.step();
    expect(sent.at(-1)).toEqual({ packet: 'doUseItemTarget', first: SLOTS.revivalB, second: SLOTS.deadS });
  });
});
