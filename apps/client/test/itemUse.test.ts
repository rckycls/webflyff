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
