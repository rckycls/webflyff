import { describe, expect, it, vi } from 'vitest';
import { ItemActions } from '../src/world/items/itemActions';
import { newVagrant, ownGameData } from './helpers/ownState';
import type { GroundItem } from '@flyffweb/protocol';

describe('item actions', () => {
  it('sends equip/drop/move requests and leaves inventory unchanged on refusal', () => {
    const own = newVagrant();
    own.inventory!.set(6, { objectId: 6, itemId: 21, count: 2 });
    const sender = { sendEquipItem: vi.fn(), sendDropItem: vi.fn(), sendMoveItem: vi.fn(), sendDestObj: vi.fn() };
    const actions = new ItemActions(() => own, () => [10, 0, 10], () => new Map(), ownGameData().itemProps, sender, vi.fn());
    expect(actions.drop(6, 3)).toBe(false);
    expect(actions.drop(6, 1)).toBe(true);
    expect(sender.sendDropItem).toHaveBeenCalledWith(6, 1, [10, 0, 10]);
    expect(own.inventory!.get(6)?.count).toBe(2);
    expect(actions.equip(6)).toBe(true);
    expect(sender.sendEquipItem).toHaveBeenCalledWith(6, -1);
  });
  it('approaches one drop at a time and only advances the nearby queue after removal or timeout', () => {
    const own = newVagrant();
    const drop: GroundItem = { index: 21, scale: 1, pos: [11, 0, 10], angle: 0, item: { objectId: 0, itemId: 21, count: 1 } };
    const drops = new Map([[100, drop], [101, { ...drop, pos: [12, 0, 10] as [number, number, number] }], [102, { ...drop, pos: [100, 0, 100] as [number, number, number] }]]);
    const sender = { sendEquipItem: vi.fn(), sendDropItem: vi.fn(), sendMoveItem: vi.fn(), sendDestObj: vi.fn() };
    const approach = vi.fn();
    const actions = new ItemActions(() => own, () => [10, 0, 10], () => drops, ownGameData().itemProps, sender, approach);
    actions.pickNearby(0);
    expect(sender.sendDestObj).toHaveBeenCalledTimes(1);
    expect(approach).toHaveBeenCalledWith(drop.pos);
    actions.step(100); expect(sender.sendDestObj).toHaveBeenCalledTimes(1);
    drops.delete(100); actions.step(200);
    expect(sender.sendDestObj).toHaveBeenCalledTimes(2);
    expect(sender.sendDestObj).toHaveBeenLastCalledWith(101, 0);
    actions.cancel(); actions.step(9000);
    expect(sender.sendDestObj).toHaveBeenCalledTimes(2);
  });

  it('a drop that is never picked up is asked for once, then given up after 6 s', () => {
    // Piece 6 M0: a drop behind a wall stays on the ground; the pick-up must not keep asking for it
    const own = newVagrant();
    const drop: GroundItem = { index: 21, scale: 1, pos: [11, 0, 10], angle: 0, item: { objectId: 0, itemId: 21, count: 1 } };
    const drops = new Map([[100, drop]]);
    const sender = { sendEquipItem: vi.fn(), sendDropItem: vi.fn(), sendMoveItem: vi.fn(), sendDestObj: vi.fn() };
    const actions = new ItemActions(() => own, () => [10, 0, 10], () => drops, ownGameData().itemProps, sender, vi.fn());
    expect(actions.pick(100, 0)).toBe(true);
    for (let now = 1000 / 60; now <= 10_000; now += 1000 / 60) actions.step(now);
    expect(sender.sendDestObj).toHaveBeenCalledTimes(1);
  });
});
