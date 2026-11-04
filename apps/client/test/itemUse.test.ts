import { describe, expect, it, vi } from 'vitest';
import { ItemUse } from '../src/world/items/itemUse';
import { newVagrant, itemProp } from './helpers/ownState';

describe('items use native requests without predicting results', () => {
  it.each([11, 12, 14])('uses consumable kind %s by inventory object ID without predicting consumption', (kind2) => {
    const own = newVagrant();
    own.inventory!.set(6, { objectId: 6, itemId: 2800, count: 3 });
    const send = vi.fn();
    const use = new ItemUse(() => own, new Map([[2800, itemProp({ id: 2800, part: -1, kind2 })]]), { sendUseItem: send, sendRevival: vi.fn() });
    expect(use.use(6)).toBe(true);
    expect(send).toHaveBeenCalledWith(6);
    expect(own.inventory!.get(6)?.count).toBe(3);
    use.use(6); // if the server refuses this repeat during cooldown, no reply means no local consumption
    expect(own.inventory!.get(6)?.count).toBe(3);
    expect(use.use(99)).toBe(false);
    own.hp = 0;
    expect(use.use(6)).toBe(false);
  });
  it('enables revival only for the exact scroll and waits for server revival', () => {
    const own = newVagrant(); own.hp = 0;
    const send = vi.fn();
    const use = new ItemUse(() => own, new Map(), { sendUseItem: vi.fn(), sendRevival: send });
    expect(use.revive()).toBe(false);
    own.inventory!.set(6, { objectId: 6, itemId: 10431, count: 1 });
    expect(use.revive()).toBe(true);
    expect(send).toHaveBeenCalledOnce();
    expect(own.hp).toBe(0);
    expect(own.inventory!.get(6)?.count).toBe(1);
  });
});

describe('the rides and the fuel (Piece 7 M5, SendDoUseItem)', () => {
  const f32 = Math.fround;
  const BROOM = itemProp({
    id: 5000, part: 13, kind1: 4, kind2: 20, castMs: 2500, // the Magic Broom's dwSkillReadyType
    flight: { speed: f32(0.0023), speedText: '0.0023', turn: f32(0.6), pitch: 1, limit: 1, fuelMax: 1200, accelFuelMax: 12, motion: 31 },
  });
  const FUEL = itemProp({ id: 5100, part: -1, kind2: 23 });
  function rig(over: Record<string, unknown> = {}, worn = false) {
    const own = newVagrant(20);
    own.inventory!.set(3, { objectId: 3, itemId: 5000, count: 1 });
    own.inventory!.set(4, { objectId: 4, itemId: 5100, count: 2 });
    if (worn) own.equipmentObjectIds[13] = 3;
    const used: unknown[][] = [];
    const equipped: unknown[][] = [];
    const said: unknown[] = [];
    const use = new ItemUse(() => own, new Map([[5000, BROOM], [5100, FUEL]]), {
      sendUseItem: (...args: number[]) => void used.push(args), sendRevival: vi.fn(),
      sendEquipItem: (...args: number[]) => void equipped.push(args),
    }, {
      check: () => ({
        worldId: 1, casting: false, standing: true, flying: false, returnBuff: false, level: 20, worldFly: true,
        landAttr: 0, disguised: false, sitting: false, ...over,
      }),
      say: (refusal) => void said.push(refusal),
      returnScroll: { begin: vi.fn() },
    });
    return { use, used, equipped, said };
  }

  it('a ride is used with part 13 and its exact float', () => {
    const r = rig();
    expect(r.use.use(3, 'bag')).toBe(true);
    expect(r.used).toEqual([[3, 13, Math.fround(0.0023)]]); // Math.fround(parseFloat(speedText))
  });

  it('a refused ride says why and sends nothing', () => {
    const r = rig({ level: 19 });
    expect(r.use.use(3, 'bag')).toBe(false);
    expect(r.said).toEqual([{ kind: 'say', tid: 'TID_GAME_USEAIRCRAFT' }]);
    expect(r.used).toEqual([]);
  });

  it('a worn ride lands, unless the land refuses it (silently)', () => {
    const r = rig({ flying: true }, true);
    expect(r.use.use(3, 'bar')).toBe(true);
    expect(r.used).toEqual([[3, 13, Math.fround(0.0023)]]);
    const refused = rig({ flying: true, landAttr: 1 }, true); // HATTR_NOWALK
    expect(refused.use.use(3, 'bar')).toBe(false);
    expect(refused.said).toEqual([]);
    // the equipment cell's double-click: DOEQUIP with the float
    const cell = rig({ flying: true }, true);
    expect(cell.use.land(3)).toBe(true);
    expect(cell.equipped).toEqual([[3, 13, Math.fround(0.0023)]]);
    expect(rig({ flying: true, sitting: true }, true).use.land(3)).toBe(false);
  });

  it('Accelor Fuel only while flying', () => {
    const ground = rig();
    expect(ground.use.use(4, 'bag')).toBe(false);
    expect(ground.said).toEqual([]);
    const air = rig({ flying: true });
    expect(air.use.use(4, 'bag')).toBe(true);
    expect(air.used).toEqual([[4]]);
  });
});

describe('the travel items (Piece 7 M3, SendDoUseItem, DPClient.cpp:10254-10431)', () => {
  const TOWN = itemProp({ id: 4805, part: -1, kind2: 22, kind3: 47, castMs: 10000, sfxReady: 118 });
  const SCROLL = itemProp({ id: 10469, part: -1, kind2: 19, kind3: 50, castMs: 4000 });
  const POTION = itemProp({ id: 2800, part: -1, kind2: 12 });
  function rig(check: Partial<{ worldId: number; casting: boolean; standing: boolean; flying: boolean; returnBuff: boolean }> = {}, shopOpen = false) {
    const own = newVagrant();
    own.inventory!.set(2, { objectId: 2, itemId: 4805, count: 5 });
    own.inventory!.set(8, { objectId: 8, itemId: 10469, count: 1 });
    own.inventory!.set(6, { objectId: 6, itemId: 2800, count: 3 });
    const sent: number[] = [];
    const said: unknown[] = [];
    const begun: number[] = [];
    const use = new ItemUse(() => own, new Map([[4805, TOWN], [10469, SCROLL], [2800, POTION]]),
      { sendUseItem: (id) => void sent.push(id), sendRevival: vi.fn() }, {
        check: () => ({ worldId: 1, casting: false, standing: true, flying: false, returnBuff: false, ...check }),
        say: (refusal) => void said.push(refusal),
        returnScroll: { begin: (id) => void begun.push(id) },
        shopOpen: () => shopOpen,
      });
    return { use, sent, said, begun };
  }

  it('a Blinkwing is sent from the bar', () => {
    const r = rig();
    expect(r.use.use(2, 'bar')).toBe(true);
    expect(r.sent).toEqual([2]);
    expect(r.said).toEqual([]);
  });

  it('from the bag with the shop open, nothing is sent and the trade text is said; the bar does not check', () => {
    const r = rig({}, true);
    expect(r.use.use(6, 'bag')).toBe(false);
    expect(r.use.use(2, 'bag')).toBe(false);
    expect(r.said).toEqual([{ kind: 'say', tid: 'TID_GAME_TRADELIMITUSING' }, { kind: 'say', tid: 'TID_GAME_TRADELIMITUSING' }]);
    expect(r.sent).toEqual([]);
    expect(r.use.use(2, 'bar')).toBe(true);
    expect(r.sent).toEqual([2]);
  });

  it('a refusal is said and nothing sent', () => {
    const r = rig({ standing: false });
    expect(r.use.use(2, 'bar')).toBe(false);
    expect(r.said).toEqual([{ kind: 'say', tid: 'TID_PK_STAND_LIMIT' }]);
    expect(r.sent).toEqual([]);
    // a potion has no cast: it goes
    expect(r.use.use(6, 'bar')).toBe(true);
    expect(r.sent).toEqual([6]);
  });

  it("the Scroll opens its box, and only 'again' sends it", () => {
    const r = rig();
    expect(r.use.use(8, 'bag')).toBe(true);
    expect(r.begun).toEqual([8]);
    expect(r.sent).toEqual([]);
    expect(r.use.use(8, 'again')).toBe(true);
    expect(r.sent).toEqual([8]);
    // the answer re-checks the use: walking by then, it is refused (Review Focus 4)
    const walking = rig({ standing: false });
    expect(walking.use.use(8, 'again')).toBe(false);
    expect(walking.said).toEqual([{ kind: 'say', tid: 'TID_PK_STAND_LIMIT' }]);
    expect(walking.sent).toEqual([]);
  });
});

describe('the premium items and scrolls (2026-11-05, SendDoUseItem and CWndInventory)', () => {
  const BUFF = itemProp({ id: 26101, part: -1, kind2: 29 }); // a premium buff (IK2_BUFF)
  const PILL = itemProp({ id: 700, part: -1, kind2: 14, kind3: 59, cooldownMs: 5000 });
  const SPROTECT = itemProp({ id: 10464, part: -1, kind2: 19, kind3: 50 });
  const RESKILL = itemProp({ id: 10434, part: -1, kind2: 19, kind3: 50 });
  const BLESSING = itemProp({ id: 10430, part: -1, kind2: 19, kind3: 50 });
  const RENAME = itemProp({ id: 10424, part: -1, kind2: 19, kind3: 50 });
  const PROPS = new Map([[26101, BUFF], [700, PILL], [10464, SPROTECT], [10434, RESKILL], [10430, BLESSING], [10424, RENAME]]);
  function rig(check: Record<string, unknown> = {}, boxOpen = false) {
    const own = newVagrant();
    [[11, 26101], [12, 700], [13, 10464], [14, 10434], [15, 10430], [16, 10424]]
      .forEach(([objectId, itemId]) => own.inventory!.set(objectId!, { objectId: objectId!, itemId: itemId!, count: 3 }));
    const sent: unknown[][] = [];
    const said: unknown[] = [];
    const boxes: Array<{ tid: string; ok: () => void }> = [];
    let now = 0;
    const use = new ItemUse(() => own, PROPS, { sendUseItem: (...args) => void sent.push(args), sendRevival: vi.fn() }, {
      check: () => ({ worldId: 1, casting: false, standing: true, flying: false, returnBuff: false, focusId: 0x77, ...check }),
      say: (refusal) => void said.push(refusal),
      returnScroll: { begin: vi.fn() },
      confirm: (tid, ok) => void boxes.push({ tid, ok }),
      boxOpen: () => boxOpen,
      now: () => now,
    });
    return { use, sent, said, boxes, setNow: (t: number) => { now = t; } };
  }

  it('a premium buff is sent from the bag and the bar, with the focused mover as Neuz sends it', () => {
    const r = rig();
    expect(r.use.use(11, 'bag')).toBe(true);
    expect(r.use.use(11, 'bar')).toBe(true);
    expect(r.sent).toEqual([[11, -1, -1, 0x77], [11, -1, -1, 0x77]]);
  });

  it('an item whose use is a window the browser lacks sends nothing', () => {
    const r = rig();
    expect(r.use.use(16, 'bag')).toBe(false);
    expect(r.sent).toEqual([]);
  });

  it("the cool-down: UPDATE_ITEM UI_COOLTIME starts the group, and a use within it is refused", () => {
    const r = rig();
    expect(r.use.use(12, 'bar')).toBe(true);
    r.use.cooled(12); // the server's answer
    r.setNow(4000);
    expect(r.use.use(12, 'bar')).toBe(false);
    expect(r.said).toEqual([{ kind: 'say', tid: 'TID_GAME_ATTENTIONCOOLTIME' }]);
    r.setNow(5001);
    expect(r.use.use(12, 'bar')).toBe(true);
    expect(r.sent).toHaveLength(2);
  });

  it("the protection scroll's box, from the bag and the bar; OK sends it with part -1", () => {
    const r = rig();
    expect(r.use.use(13, 'bar')).toBe(true);
    expect(r.sent).toEqual([]);
    expect(r.boxes.map((b) => b.tid)).toEqual(['TID_GAME_REGARDLESS_USE']);
    r.boxes[0]!.ok();
    expect(r.sent).toEqual([[13, -1, -1, 0x77]]);
  });

  it("the bag's own boxes: Re-Skill asks, from the bar it goes at once", () => {
    const r = rig({ skillPointsSpent: true });
    expect(r.use.use(14, 'bag')).toBe(true);
    expect(r.boxes.map((b) => b.tid)).toEqual(['TID_GAME_SKILLINIT']);
    expect(r.sent).toEqual([]);
    r.boxes[0]!.ok();
    expect(r.use.use(14, 'bar')).toBe(true);
    expect(r.sent).toEqual([[14, -1, -1, 0x77], [14, -1, -1, 0x77]]);
  });

  it("Blessing while one is on is refused from the bag (SM_REVIVAL)", () => {
    const r = rig({ revival: true });
    expect(r.use.use(15, 'bag')).toBe(false);
    expect(r.said).toEqual([{ kind: 'say', tid: 'TID_GAME_LIMITED_USE' }]);
  });

  it('with a box open, a use from the bag is refused (TID_TOOLTIP_ITEM_USING_ERROR)', () => {
    const r = rig({}, true);
    expect(r.use.use(11, 'bag')).toBe(false);
    expect(r.said).toEqual([{ kind: 'say', tid: 'TID_TOOLTIP_ITEM_USING_ERROR' }]);
  });
});

describe('an upgrade material from the bag (2026-11-05, WndField.cpp:2351-2398)', () => {
  it('starts the upgrade cursor; from the task bar nothing is sent', () => {
    const own = newVagrant();
    own.inventory!.set(3, { objectId: 3, itemId: 2035, count: 5 });
    const begun: number[] = [];
    const sent: unknown[] = [];
    const use = new ItemUse(() => own, new Map([[2035, itemProp({ id: 2035, part: -1, kind3: 119 })]]),
      { sendUseItem: (...args) => void sent.push(args), sendRevival: vi.fn() }, {
        check: () => ({ worldId: 1, casting: false, standing: true, flying: false, returnBuff: false }),
        say: vi.fn(), returnScroll: { begin: vi.fn() }, upgrade: { begin: (id) => { begun.push(id); return true; } },
      });
    expect(use.use(3, 'bag')).toBe(true);
    expect(begun).toEqual([3]);
    expect(use.use(3, 'bar')).toBe(false);
    expect(sent).toEqual([]);
  });
});

describe('the quick boxes and the maps (2026-11-05)', () => {
  function rig() {
    const own = newVagrant();
    [[3, 26453], [4, 26961], [5, 30000], [6, 4801]].forEach(([objectId, itemId]) =>
      own.inventory!.set(objectId!, { objectId: objectId!, itemId: itemId!, count: 2 }));
    const props = new Map([
      [26453, itemProp({ id: 26453, part: -1, kind2: 19 })], [26961, itemProp({ id: 26961, part: -1, kind2: 19 })],
      [30000, itemProp({ id: 30000, part: -1, kind2: 36, name: 'Funny Coin 1000' })], [4801, itemProp({ id: 4801, part: -1, kind2: 19 })],
    ]);
    const sent: unknown[][] = [];
    const boxes: Array<{ tid: string; ok: () => void; args?: string[] }> = [];
    let maps = 0;
    const use = new ItemUse(() => own, props, { sendUseItem: (...args) => void sent.push(args), sendRevival: vi.fn() }, {
      check: () => ({ worldId: 1, casting: false, standing: true, flying: false, returnBuff: false, focusId: 0x77 }),
      say: vi.fn(), returnScroll: { begin: vi.fn() }, confirm: (tid, ok, args) => void boxes.push({ tid, ok, args }),
      openMap: () => { maps++; },
    });
    return { own, use, sent, boxes, maps: () => maps };
  }

  it("a battery's OK names its own item id; the Funny Coin's NULL_ID and names the coin; Awakening Protection the player", () => {
    const r = rig();
    r.use.use(3, 'bar');
    r.use.use(5, 'bag');
    r.use.use(4, 'bar');
    expect(r.boxes.map((b) => b.tid)).toEqual(['TID_GAME_BETTERY_DESC', 'TID_GAME_FUNNYCOIN_ASKUSE', 'TID_GAME_REGARDLESS_USE01']);
    expect(r.boxes[1]!.args).toEqual(['Funny Coin 1000']);
    r.boxes.forEach((b) => b.ok());
    expect(r.sent).toEqual([[3, -1, -1, 26453], [5, -1, -1, 0xffffffff], [4, -1, -1, r.own.objectId]]);
  });

  it('a map from the bag opens the world map and is used; from the bar it is only used', () => {
    const r = rig();
    r.use.use(6, 'bag');
    r.use.use(6, 'bar');
    expect(r.maps()).toBe(1);
    expect(r.sent).toEqual([[6, -1, -1, 0x77], [6, -1, -1, 0x77]]);
  });
});
