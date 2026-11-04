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
