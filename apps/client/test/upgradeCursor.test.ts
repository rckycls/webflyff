// The upgrade cursor's flow (2026-11-05): a material starts it, the next bag item is its target, 4 s later the packet
// goes (CWndInventory, WndField.cpp:1664-1745, 13284-13583; CWndItemCtrl::OnLButtonDown, WndItemCtrl.cpp:723-922).

import { describe, expect, it } from 'vitest';
import type { WebItemProp } from '@flyffweb/formats';
import { UpgradeCursor } from '../src/world/items/upgradeCursor';
import { newVagrant, itemProp } from './helpers/ownState';

const SUNSTONE = itemProp({ id: 2035, kind3: 119, part: -1 });
const RANDOM_STR = itemProp({ id: 30012, kind3: 101, part: -1 });
const SWORD = itemProp({ id: 500, kind1: 1, kind2: 2, kind3: 3, part: 10, name: 'Sword' });
const RING = itemProp({ id: 504, kind1: 2, kind2: 13, kind3: 23, part: 16 });
const PROPS = new Map<number, WebItemProp>([[2035, SUNSTONE], [30012, RANDOM_STR], [500, SWORD], [504, RING]]);

function rig(sword: { abilityOption?: number; randomOption?: bigint } = {}) {
  const own = newVagrant();
  own.inventory!.set(3, { objectId: 3, itemId: 2035, count: 5 });
  own.inventory!.set(4, { objectId: 4, itemId: 30012, count: 1 });
  own.inventory!.set(12, { objectId: 12, itemId: 500, count: 1, ...sword });
  own.inventory!.set(13, { objectId: 13, itemId: 504, count: 1 });
  const sent: unknown[] = [];
  const said: string[] = [];
  const boxes: Array<{ tid: string; args: string[]; ok: () => void; cancel: () => void }> = [];
  const effects: boolean[] = [];
  let now = 0;
  let boxOpen = false;
  const cursor = new UpgradeCursor({
    own: () => own, props: PROPS, now: () => now, hasItemBuff: () => false, boxOpen: () => boxOpen,
    say: (tid) => void said.push(tid),
    confirm: (tid, args, ok, cancel) => void boxes.push({ tid, args, ok, cancel }),
    effect: (on) => void effects.push(on),
    send: (packet) => void sent.push(packet),
  });
  return { cursor, sent, said, boxes, effects, setNow: (t: number) => { now = t; }, setBox: (open: boolean) => { boxOpen = open; } };
}

describe('UpgradeCursor', () => {
  it('Sunstone on a sword: the mode, the target, 4 s, then ENCHANT (target, material)', () => {
    const r = rig();
    expect(r.cursor.begin(3)).toBe(true);
    expect(r.cursor.active).toBe(true);
    expect(r.effects).toEqual([true]);
    expect(r.cursor.pick(12)).toBe(true);
    expect(r.cursor.active).toBe(false); // RunUpgrade ends the mode at once
    expect(r.cursor.waitingTarget).toBe(12);
    r.setNow(3999);
    r.cursor.step();
    expect(r.sent).toEqual([]);
    r.setNow(4000);
    r.cursor.step();
    expect(r.sent).toEqual([{ packet: 'enchant', first: 12, second: 3 }]);
    expect(r.cursor.waitingTarget).toBeNull();
    expect(r.effects).toEqual([true, false]);
  });

  it('a target it does not take: said, and the mode ends', () => {
    const r = rig();
    r.cursor.begin(3);
    expect(r.cursor.pick(13)).toBe(true);
    expect(r.said).toEqual(['TID_GAME_NOTEQUALITEM']);
    expect(r.cursor.active).toBe(false);
    expect(r.effects).toEqual([true, false]);
    r.setNow(5000);
    r.cursor.step();
    expect(r.sent).toEqual([]);
  });

  it('from +3 the safety box asks first; No ends it, Yes goes on', () => {
    const r = rig({ abilityOption: 3 });
    r.cursor.begin(3);
    r.cursor.pick(12);
    expect(r.boxes.map((b) => b.tid)).toEqual(['TID_GAME_SMELT_SAFETY_CONFIRM_NORMAL']);
    r.boxes[0]!.cancel();
    expect(r.cursor.active).toBe(false);
    expect(r.cursor.waitingTarget).toBeNull();
    r.cursor.begin(3);
    r.cursor.pick(12);
    r.boxes[1]!.ok();
    expect(r.cursor.waitingTarget).toBe(12);
  });

  it("a random scroll asks after the wait, naming the item; Yes sends RANDOMSCROLL", () => {
    const r = rig({ randomOption: 2n });
    r.cursor.begin(4);
    r.cursor.pick(12);
    r.setNow(4000);
    r.cursor.step();
    expect(r.sent).toEqual([]);
    expect(r.boxes.map((b) => [b.tid, b.args])).toEqual([['TID_GAME_RANDOMSCROLL_CONFIRM1', ['Sword']]]);
    r.boxes[0]!.ok();
    expect(r.sent).toEqual([{ packet: 'randomScroll', first: 12, second: 4 }]);
  });

  it('while waiting, another start or pick is refused (TID_MMI_NOTUPGRADE); a cancel ends the mode only', () => {
    const r = rig();
    r.cursor.begin(3);
    r.cursor.pick(12);
    expect(r.cursor.begin(3)).toBe(false);
    expect(r.said).toEqual(['TID_MMI_NOTUPGRADE']);
    r.cursor.cancel(); // BaseMouseCursor: the wait goes on (WndField.cpp:13574-13583)
    r.setNow(4000);
    r.cursor.step();
    expect(r.sent).toHaveLength(1);
  });

  it('a pick with no mode does nothing, and reset clears the wait', () => {
    const r = rig();
    expect(r.cursor.pick(12)).toBe(false);
    r.cursor.begin(3);
    r.cursor.pick(12);
    r.cursor.reset();
    r.setNow(4000);
    r.cursor.step();
    expect(r.sent).toEqual([]);
  });
});
