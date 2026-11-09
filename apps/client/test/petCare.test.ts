// @vitest-environment jsdom
// pets R3: the raised pet's care (pets/petCare.ts, pets/petCareWindows.ts): the pet's items as SendDoUseItem takes them,
// the food mill, the tamer's mistake and miracle, the hatch, life and naming scrolls. The pretend world's bundles
// (testkit writers, protocol readers) drive the miracle's answer and PET_RELEASE.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebItemProp } from '@flyffweb/formats';
import { NULL_ID } from '@flyffweb/protocol';
import type { PetData } from '@flyffweb/protocol';
import { writePet, writePetRelease } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import { ServerClock } from '../src/net/serverClock';
import { formatDefinedText } from '../src/world/hud/messages';
import { ItemUse } from '../src/world/items/itemUse';
import type { UseFrom } from '../src/world/items/itemUse';
import { OwnState } from '../src/world/OwnState';
import {
  MiracleRoll, foodCountOf, foodCountStart, foodCountText, millRefusal, miracleOf, needsPet, petItemUse,
} from '../src/world/pets/petCare';
import { PetCareWindows } from '../src/world/pets/petCareWindows';
import type { PetCareHost, PetCarePacket } from '../src/world/pets/petCareWindows';
import { PetWindows } from '../src/world/pets/petWindows';
import { petMoverId } from '../src/world/pets/raisedPet';
import { terrainGround } from '../src/world/sim/collision';
import { WorldState } from '../src/world/WorldState';
import { OWN_ID, STARTER_EQUIPMENT, itemProp } from './helpers/ownState';
import { TIGER_C, art, ownAddObj, pet, petData, read } from './helpers/petData';

afterEach(() => {
  document.body.replaceChildren();
});

const MISTAKE = 21030, MIRACLE = 21031, LIFE = 21034, HATCH = 21036, FEED = 21037, MAKER = 21038, NAMING = 20039;
const GEM = 2900, SWORD_ID = 2901;
/** A B tiger whose C step is 3 (+4) and B step 2 (+2). */
const TIGER_B = pet({ level: 3, exp: 500, energy: 200, life: 2, availLevels: [1, 3, 2, 0, 0, 0] });

describe('the pet items (pets/petCare.ts)', () => {
  it('which branch of SendDoUseItem each takes (DPClient.cpp:10614-10661, :10845-10857)', () => {
    expect([MIRACLE, MISTAKE, HATCH, FEED, MAKER, LIFE, NAMING].map((id) => petItemUse({ id })))
      .toEqual(['miracle', 'mistake', 'hatch', 'feed', 'feedMaker', 'life', 'naming']);
    // the tonics, the feed pocket, the S pet's food: plain DOUSEITEMs
    for (const id of [21032, 21033, 21035, 26531, 26573, 26562]) expect(petItemUse({ id }), String(id)).toBeNull();
    expect(needsPet({ exeTarget: 19 })).toBe(true);
    expect(needsPet({})).toBe(false);
  });

  it("the miracle is for a B, A or S pet: the two levels' grades and steps (CWndPetMiracle::OnInitialUpdate)", () => {
    for (const level of [0, 1, 2]) expect(miracleOf(pet({ level })), String(level)).toBeNull();
    expect(miracleOf(TIGER_B)).toEqual({ level: 3, grades: ['TID_GAME_PET_GRADE_C', 'TID_GAME_PET_GRADE_B'], steps: [3, 2] });
    expect(miracleOf(pet({ level: 5, availLevels: [1, 2, 3, 4, 9, 0] }))!.grades).toEqual(['TID_GAME_PET_GRADE_A', 'TID_GAME_PET_GRADE_S']);
  });

  it("the food mill's count: the stack, at most 1000; kept so as it is typed (CWndFoodConfirm::OnDraw)", () => {
    expect([foodCountStart(1), foodCountStart(40), foodCountStart(5000)]).toEqual(['1', '40', '1000']);
    expect(foodCountText('9', 1)).toBe('1');
    expect(foodCountText('2000', 5000)).toBe('1000');
    expect(foodCountText('50', 40)).toBe('40');
    expect(foodCountText('12', 40)).toBe('12');
    expect(foodCountText('1a', 40)).toBe('40');
    expect(foodCountText('', 40)).toBe('');
    // OK: atoi, not 0, at most 1000
    expect([foodCountOf('12', 40), foodCountOf('', 40), foodCountOf('0', 40), foodCountOf('1001', 5000)]).toEqual([12, null, null, null]);
  });

  it('the food mill grinds a gem with a price, not charged (CWndPetFoodMill::OnChildNotify)', () => {
    expect(millRefusal({ kind3: 34, cost: 500 }, {})).toBeNull();
    expect(millRefusal({ kind3: 34, cost: 0 }, {})).toBe('TID_GAME_NOTFOOD');
    expect(millRefusal({ kind3: 34, cost: 500 }, { charged: 1 })).toBe('TID_GAME_NOTFOOD');
    expect(millRefusal({ kind3: 2, cost: 500 }, {})).toBe('TID_GAME_NOTFOOD');
  });

  it("the server's food lines show: TID_GAME_PETFEED_S01 with the count (OnUsePetFeed, DPSrvr.cpp:8116)", () => {
    const texts = new Map([['TID_GAME_PETFEED_S01', { id: 'TID_GAME_PETFEED_S01', text: 'You have used %s pet feed.', color: -1, textId: 3828 }]]);
    expect(formatDefinedText(texts, 3828, '75').text).toBe('You have used 75 pet feed.');
  });
});

describe("MiracleRoll (CWndPetMiracle::Process, WndPetSys.cpp:1473-1620)", () => {
  it("still on the pet's steps; spun, the first stops on frame 130, the second on 315, each on its result", () => {
    const roll = new MiracleRoll([3, 2]);
    expect([roll.drawn(0), roll.drawn(1), roll.rolling]).toEqual([2, 1, false]);
    let sounds = 0;
    const random = (): number => 0.5; // rand() % 9 == 4 every time: 4, then 5 when 4 shows
    expect(roll.step(random, () => sounds++)).toEqual([]);
    expect(sounds).toBe(0);
    roll.receive(7, 9);
    expect(roll.rolling).toBe(true);
    const stops: Array<[number, number]> = [];
    const shown = new Set<number>();
    for (let frame = 1; frame <= 400; frame++) {
      for (const slot of roll.step(random, () => sounds++)) stops.push([frame, slot]);
      if (roll.spins[0].received) shown.add(roll.drawn(0));
    }
    expect(stops).toEqual([[130, 0], [315, 1]]);
    // 16 + 10 turns of the first, 21 + 20 of the second, each with InfOpen.wav
    expect(sounds).toBe(67);
    // never the same index twice in a row: 4 and 5 by turns
    expect([...shown].sort()).toEqual([4, 5]);
    expect([roll.drawn(0), roll.drawn(1), roll.rolling]).toEqual([6, 8, false]);
  });
});

// ---- the windows in the pretend world ----------------------------------------------------------------------------

const PROPS = new Map<number, WebItemProp>([
  ...petData().itemProps,
  [MISTAKE, itemProp({ id: MISTAKE, name: 'Blessing of the Pet Tamer', kind2: 19, kind3: 50, part: -1, exeTarget: 19 })],
  [MIRACLE, itemProp({ id: MIRACLE, name: 'Chance of the Pet Tamer', kind2: 19, kind3: 50, part: -1, exeTarget: 19 })],
  [LIFE, itemProp({ id: LIFE, name: 'Pet Energy', kind2: 19, kind3: 50, part: -1, exeTarget: 19 })],
  [HATCH, itemProp({ id: HATCH, name: 'Egg Hatcher', kind2: 19, kind3: 50, part: -1, exeTarget: 19 })],
  [FEED, itemProp({ id: FEED, name: 'Pet Feed', kind2: 19, kind3: 121, part: -1, exeTarget: 19, packMax: 9999 })],
  [MAKER, itemProp({ id: MAKER, name: 'Pet Feed Maker', kind2: 19, kind3: 50, part: -1 })],
  [NAMING, itemProp({ id: NAMING, name: 'Scroll of Change Pet Name', kind2: 19, kind3: 50, part: -1, exeTarget: 19 })],
  [21032, itemProp({ id: 21032, name: 'Pet Medicine (A)', kind2: 19, kind3: 50, part: -1, skillTime: 600000 })],
  [GEM, itemProp({ id: GEM, name: 'Twinkle Stone', kind2: 17, kind3: 34, part: -1, cost: 300, icon: 'ui/item/itm_gem.png' })],
  [SWORD_ID, itemProp({ id: SWORD_ID, name: 'Sword', kind2: 2, kind3: 2, part: 10, cost: 300 })],
]);
const TEXTS: Record<string, string> = {
  TID_GAME_PET_MISTAKE_DESC: 'Return your pet to its previous level.', TID_GAME_PET_HATCH_DESC: 'Turns an egg into a D Level pet.',
  TID_GAME_PET_USELIFE: 'This item gives your hatched pet 1 - 5 lives at random.  Proceed?',
  TID_GAME_PETFOODMILL_DESC: 'Select the item you want to turn into Pet Feed.', TID_GAME_KWAIBAWIBO_PRESENT_NUM: 'Count : %d',
  TID_GAME_ITEMCOUNT_CONFIRM: 'Check the amount of items you have.', TID_GAME_ITEMCOUNT_QUESTION: 'How many items will you use?',
  TID_GAME_PET_GRADE_C: 'Lv. C', TID_GAME_PET_GRADE_B: 'Lv. B', TID_DIAG_0012: 'A name cannot start with a number.',
};
const SLOTS = { mistake: 20, miracle: 21, life: 22, hatch: 23, feed: 24, maker: 25, naming: 26, tonic: 27, gem: 28, sword: 29 };

/** A world with the own pet item `bagPet` out (or in the bag when `out` is false), the pet's items in the bag, and the windows. */
function pretendWorld(bagPet: PetData, out = true, over: Partial<PetCareHost> = {}) {
  const data = { ...petData(), itemProps: PROPS };
  const added = ownAddObj(bagPet, out);
  const own = new OwnState(data, added, STARTER_EQUIPMENT);
  const world = new WorldState(data, new ServerClock(() => 0), terrainGround(() => 0), own);
  world.apply(OWN_ID, { type: 'addMover', mover: added }, true);
  ([[SLOTS.mistake, MISTAKE], [SLOTS.miracle, MIRACLE], [SLOTS.life, LIFE], [SLOTS.hatch, HATCH], [SLOTS.feed, FEED],
    [SLOTS.maker, MAKER], [SLOTS.naming, NAMING], [SLOTS.tonic, 21032], [SLOTS.gem, GEM], [SLOTS.sword, SWORD_ID]] as const)
    .forEach(([objectId, itemId]) => own.inventory!.set(objectId, { objectId, itemId, count: itemId === GEM ? 40 : itemId === FEED ? 300 : 1 }));
  const layer = document.createElement('div');
  document.body.append(layer);
  const sent: PetCarePacket[] = [];
  const used: unknown[][] = [];
  const said: string[] = [];
  const boxes: Array<{ text: string; ok: () => void }> = [];
  const alerts: string[] = [];
  const reserved = new Set<number>();
  const locks: Array<[boolean, number, number]> = [];
  let shop = false, bagOpened = 0, sounds = 0;
  let windows: PetWindows | undefined;
  let itemUse: ItemUse | undefined;
  const host: PetCareHost = {
    own: () => own, props: PROPS,
    text: (tid, args = []) => (TEXTS[tid] ?? tid).replace(/%d/, String(args[0] ?? '')),
    say: (tid, args = []) => void said.push([tid, ...args].join('|')),
    box: (text, ok) => void boxes.push({ text, ok }),
    alert: (text) => void alerts.push(text),
    shopOpen: () => shop,
    use: (id, from, target) => void itemUse!.use(id, from, target),
    send: (...packet) => void sent.push(packet),
    reserve: (id, on) => { if (on) reserved.add(id); else reserved.delete(id); },
    openBag: () => { bagOpened++; },
    statusOpen: () => windows!.status.isOpen,
    lock: (on, level, slot) => { locks.push([on, level, slot]); windows!.status.lockShowLevel(on, level, slot); },
    sound: () => { sounds++; },
    random: () => 0.5,
    ui: { art, doc: document, layer: () => layer },
    ...over,
  };
  const care = new PetCareWindows(host);
  itemUse = new ItemUse(() => own, PROPS, {
    sendUseItem: (...args: number[]) => void used.push(args), sendRevival: vi.fn(),
  }, {
    check: () => ({ worldId: 1, casting: false, standing: true, flying: false, returnBuff: false, focusId: 77 }),
    say: (refusal) => void said.push(refusal.tid),
    returnScroll: { begin: vi.fn() },
    pet: (id, target) => care.use(id, target),
  });
  windows = new PetWindows(art, data, {
    own: () => own, statusFrame: () => null, sendPetRelease: vi.fn(),
    petMover: () => world.movers.get(petMoverId(OWN_ID)), loadPortrait: async () => null, renderer: () => null,
    miracle: () => care.miracleResult(),
  }, document);
  layer.append(windows.element);
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      world.step();
      for (const event of world.takeChanges().own) {
        if (event.kind !== 'pet') continue;
        windows.onPet(event.change);
        if (event.change.kind === 'released') care.released();
      }
      care.step();
    }
  };
  const send = (...messages: ScriptMessage[]): void => { for (const { objectId, value } of read(messages)) world.apply(objectId, value); };
  const use = (slot: number, from: UseFrom = 'bag'): boolean => itemUse!.use(slot, from);
  const win = (title: string): HTMLElement | undefined =>
    [...layer.querySelectorAll<HTMLElement>('.hud-res-window')]
      .find((w) => !w.hidden && w.querySelector('.hud-window-title')!.textContent === title);
  const control = (title: string, id: string): HTMLElement => win(title)!.querySelector<HTMLElement>(`[data-control="${id}"]`)!;
  return {
    own, world, care, windows, sent, used, said, boxes, alerts, reserved, locks, step, send, use, win, control, layer,
    setShop: (open: boolean) => { shop = open; }, bagOpened: () => bagOpened, sounds: () => sounds,
  };
}

describe("the pet's items from the bag (SendDoUseItem, DPClient.cpp:10604-10661)", () => {
  it('an EXT_PET item with no pet out says TID_GAME_PET_NOT_FOUND and sends nothing', () => {
    const p = pretendWorld(TIGER_C, false);
    for (const slot of [SLOTS.feed, SLOTS.mistake, SLOTS.miracle, SLOTS.life, SLOTS.hatch, SLOTS.naming]) expect(p.use(slot)).toBe(false);
    expect(p.said).toEqual(new Array(6).fill('TID_GAME_PET_NOT_FOUND'));
    expect([p.sent, p.used, p.boxes]).toEqual([[], [], []]);
    // the feed maker and the tonic need no pet
    expect(p.use(SLOTS.maker)).toBe(true);
    expect(p.use(SLOTS.tonic)).toBe(true);
    expect(p.used).toEqual([[SLOTS.tonic, -1, -1, 77]]);
  });

  it('the food sends USE_PET_FEED at once, from the bag and the task bar (__PET_0519)', () => {
    const p = pretendWorld(TIGER_C);
    expect(p.use(SLOTS.feed)).toBe(true);
    expect(p.use(SLOTS.feed, 'bar')).toBe(true);
    expect(p.sent).toEqual([['usePetFeed', SLOTS.feed], ['usePetFeed', SLOTS.feed]]);
    expect(p.used).toEqual([]);
  });

  it("the tamer's mistake: CWndCommItemDlg, whose OK sends PET_TAMER_MISTAKE, or TID_GAME_TRADELIMITUSING with a shop open", () => {
    const p = pretendWorld(TIGER_C);
    expect(p.use(SLOTS.mistake)).toBe(true);
    expect(p.boxes.map((b) => b.text)).toEqual(['Return your pet to its previous level.']);
    p.setShop(true);
    p.boxes[0]!.ok();
    expect(p.said).toEqual(['TID_GAME_TRADELIMITUSING']);
    p.setShop(false);
    p.boxes[0]!.ok();
    expect(p.sent).toEqual([['petTamerMistake', SLOTS.mistake]]);
    expect(p.used).toEqual([]);
  });

  it('the hatch scroll: CWndCommItemDlg, whose OK sends DOUSEITEM naming the focus of the first press', () => {
    const p = pretendWorld(pet());
    expect(p.use(SLOTS.hatch)).toBe(true);
    expect(p.boxes.map((b) => b.text)).toEqual(['Turns an egg into a D Level pet.']);
    expect(p.used).toEqual([]);
    p.boxes[0]!.ok();
    expect(p.used).toEqual([[SLOTS.hatch, -1, -1, 77]]);
  });

  it('the life scroll: CWndPetLifeConfirm (APP_MESSAGEBOX), YES sends DOUSEITEM naming no one; any answer closes it', () => {
    const p = pretendWorld(TIGER_C);
    expect(p.use(SLOTS.life)).toBe(true);
    const box = p.win('Message Box')!;
    expect(box.querySelector('[data-control="TEXT"]')!.textContent).toContain('1 - 5 lives');
    p.control('Message Box', 'IDNO').click();
    expect(p.win('Message Box')).toBeUndefined();
    expect(p.used).toEqual([]);
    p.use(SLOTS.life);
    p.control('Message Box', 'IDYES').click();
    expect(p.used).toEqual([[SLOTS.life, -1, -1, NULL_ID]]);
    expect(p.win('Message Box')).toBeUndefined();
  });

  it('the naming scroll: APP_CHANGENAME, the name checked as a player\'s, then DO_USE_ITEM_INPUT with the scroll', () => {
    const p = pretendWorld(TIGER_C);
    expect(p.use(SLOTS.naming)).toBe(true);
    const input = p.win('Change Name')!.querySelector<HTMLInputElement>('input')!;
    input.value = '1Fluffy';
    p.control('Change Name', 'WIDC_OK').click();
    expect(p.alerts).toEqual(['A name cannot start with a number.']);
    expect(p.win('Change Name')).toBeDefined();
    input.value = ' Fluffy ';
    p.control('Change Name', 'WIDC_OK').click();
    expect(p.sent).toEqual([['doUseItemInput', SLOTS.naming, 'Fluffy']]);
    expect(p.win('Change Name')).toBeUndefined();
  });
});

describe('the food mill (CWndPetFoodMill, WndPetSys.cpp:1637-1822)', () => {
  it("the feed maker opens it with the bag; a second says TID_GAME_WND_OVERLAPED; a gem's count, MAKE_PET_FEED, PET_MILL closes it", () => {
    const p = pretendWorld(TIGER_C, false);
    expect(p.use(SLOTS.maker)).toBe(true);
    expect(p.win('Feed machine')).toBeDefined();
    expect(p.control('Feed machine', 'WIDC_STATIC1').textContent).toBe('Select the item you want to turn into Pet Feed.');
    expect(p.bagOpened()).toBe(1);
    expect(p.care.picking).toBe(true);
    p.use(SLOTS.maker);
    expect(p.said).toEqual(['TID_GAME_WND_OVERLAPED']);

    // a click on the gem in the bag: CWndFoodConfirm( 2 ) asks how many, the stack at first
    expect(p.care.pick(SLOTS.gem)).toBe(true);
    const count = p.win('Check the amount of items you have.')!;
    expect(count.querySelector('[data-control="WIDC_STATIC1"]')!.textContent).toBe('How many items will you use?');
    const input = count.querySelector<HTMLInputElement>('input')!;
    expect(input.value).toBe('40');
    input.value = '75';
    input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('40');
    input.value = '12';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(p.win('Check the amount of items you have.')).toBeUndefined();
    // the slot: the gem's icon and "Count : 12", the gem held in the bag
    const slot = p.control('Feed machine', 'WIDC_STATIC2').parentElement!;
    expect(slot.querySelector('img')!.getAttribute('src')).toBe('/assets/ui/item/itm_gem.png');
    expect(slot.querySelector('.hud-pet-mill-count')!.textContent).toBe('Count : 12');
    expect([...p.reserved]).toEqual([SLOTS.gem]);

    p.control('Feed machine', 'WIDC_OK').click();
    expect(p.sent).toEqual([['makePetFeed', SLOTS.gem, SLOTS.maker, 12]]);
    // the answer: the line, the slot emptied, and a feed maker's mill closes
    p.care.onMill(1, 168);
    expect(p.said).toEqual(['TID_GAME_WND_OVERLAPED', 'TID_GAME_PETFEED_MAKE|168']);
    expect(p.reserved.size).toBe(0);
    expect(p.win('Feed machine')).toBeUndefined();
    expect(p.care.picking).toBe(false);
  });

  it("the tamer's: no tool (NULL_ID), stays open after PET_MILL; a non-gem is TID_GAME_NOTFOOD; the bag's close closes it", () => {
    const p = pretendWorld(TIGER_C, false);
    p.care.tamerMill();
    p.care.tamerMill();
    expect(p.said).toEqual(['TID_GAME_NOWUSING']);
    p.care.pick(SLOTS.sword);
    p.control('Check the amount of items you have.', 'WIDC_OK').click();
    p.control('Feed machine', 'WIDC_OK').click();
    expect(p.said).toEqual(['TID_GAME_NOWUSING', 'TID_GAME_NOTFOOD']);
    // a second pick lets the first go; Cancel on the count leaves the slot empty
    p.care.pick(SLOTS.gem);
    expect(p.reserved.size).toBe(0);
    p.control('Check the amount of items you have.', 'WIDC_OK').click();
    p.control('Feed machine', 'WIDC_OK').click();
    expect(p.sent).toEqual([['makePetFeed', SLOTS.gem, NULL_ID, 40]]);
    p.care.onMill(0, 0);
    expect(p.said.at(-1)).toBe('TID_GAME_LACKSPACE');
    expect(p.win('Feed machine')).toBeDefined();
    expect([...p.reserved]).toEqual([SLOTS.gem]);
    // the bag closed (CWndInventory::OnDestroy): the mill goes, its item let go
    p.care.bagClosed();
    expect(p.win('Feed machine')).toBeUndefined();
    expect(p.reserved.size).toBe(0);
  });
});

describe("the tamer's miracle (CWndPetMiracle, WndPetSys.cpp:1269-1634)", () => {
  it('shows nothing for a C pet', () => {
    const p = pretendWorld(TIGER_C);
    expect(p.use(SLOTS.miracle)).toBe(true);
    expect(p.win('Chance of the Pet Tamer')).toBeUndefined();
    expect(p.sent).toEqual([]);
  });

  it("a B pet: the grades and steps; Chance sends PET_TAMER_MIRACLE; the pet made again spins to its new steps; then OK", () => {
    const p = pretendWorld(TIGER_B);
    p.step(); // the pet's mover made: the status window opens
    expect(p.windows.status.isOpen).toBe(true);
    p.use(SLOTS.miracle);
    const window = p.win('Chance of the Pet Tamer')!;
    expect([...window.querySelectorAll('.hud-pet-miracle-grade')].map((e) => e.textContent)).toEqual(['Lv. C', 'Lv. B']);
    const steps = (): string[] => [...window.querySelectorAll<HTMLElement>('.hud-pet-miracle-step')].map((e) => e.dataset.step!);
    expect(steps()).toEqual(['3', '2']);
    expect(window.querySelector('.hud-pet-miracle-step')!.getAttribute('src')).toBe('/assets/ui/icon_petlevel3_l.png');
    expect(p.locks).toEqual([[true, 2, 0], [true, 3, 1]]);
    const ok = p.control('Chance of the Pet Tamer', 'WIDC_OK') as HTMLButtonElement;
    const chance = p.control('Chance of the Pet Tamer', 'WIDC_BUTTON2') as HTMLButtonElement;
    expect([ok.hidden, chance.hidden, chance.disabled]).toEqual([true, false, false]);
    chance.click();
    chance.click();
    expect(p.sent).toEqual([['petTamerMiracle', SLOTS.miracle]]);
    expect(chance.disabled).toBe(true);

    // the server rerolls the two steps (OnPetTamerMiracle) and sends PET with PF_PET_GET_AVAIL; ProcessPet remakes the pet
    p.send(writePet(OWN_ID, { ...TIGER_B, availLevels: [1, 7, 5, 0, 0, 0] }, 3));
    p.step(64);
    expect(p.sounds()).toBeGreaterThan(0);
    p.step(400);
    expect(steps()).toEqual(['7', '5']);
    expect([ok.hidden, ok.disabled, chance.hidden]).toEqual([false, false, true]);
    expect(p.locks).toEqual([[true, 2, 0], [true, 3, 1], [false, 2, 0], [false, 3, 1]]);
    ok.click();
    expect(p.win('Chance of the Pet Tamer')).toBeUndefined();
  });

  it('closes on PET_RELEASE, its locks let go (OnPetRelease, OnDestroy)', () => {
    const p = pretendWorld(TIGER_B);
    p.step();
    p.use(SLOTS.miracle);
    p.send(writePetRelease(OWN_ID));
    p.step();
    expect(p.win('Chance of the Pet Tamer')).toBeUndefined();
    expect(p.windows.status.isOpen).toBe(false);
  });
});
