// @vitest-environment jsdom
// custom (owner 2026-11-19, VIP perks): the bag's two VIP icon buttons beside the penya, sort and Penya -> Perin, for
// VIP1-VIP4 only (hidden for everyone else), and the bag's new order after the server's sort.
import { describe, expect, it, vi } from 'vitest';
import { InventoryWindow } from '../src/world/hud/inventoryWindow';
import { newVagrant, ownGameData } from './helpers/ownState';

const open = (vipLevel: number, gold: number) => {
  const own = newVagrant();
  own.gold = gold;
  const sort = vi.fn(), perin = vi.fn();
  const ui = new InventoryWindow({ url: () => '', sheets: null }, ownGameData(), {
    use: vi.fn(), equip: vi.fn(), drop: vi.fn(), move: vi.fn(), shortcut: vi.fn(),
    vip: { level: () => vipLevel, sort, perin },
  });
  document.body.append(ui.frame.element);
  ui.toggle(own);
  return { ui, own, sort, perin, el: ui.frame.element };
};

describe('the VIP bag buttons', () => {
  it('are hidden for a player who is not VIP', () => {
    const { ui, el } = open(0, 500_000_000);
    expect(el.querySelector('[data-vip-tool]')).toBeNull();
    ui.dispose();
  });

  it('are two icon buttons beside the penya for a VIP, and sort sends at once', () => {
    const { ui, el, sort } = open(2, 0);
    const tools = [...el.querySelectorAll<HTMLButtonElement>('[data-vip-tool]')];
    expect(tools.map((b) => b.getAttribute('aria-label'))).toEqual(['Sort the bag', 'Turn penya into Perins']);
    for (const b of tools) {
      expect(b.textContent).toBe('');
      expect(b.querySelector('img')).not.toBeNull();
    }
    expect(el.querySelector('.inventory-vip-tools')?.parentElement).toBe(el.querySelector('.inventory-money')?.parentElement);
    tools[0]!.click();
    expect(sort).toHaveBeenCalledTimes(1);
    ui.dispose();
  });

  it('Penya -> Perin asks first, with the count and the penya it takes, then sends; Cancel sends nothing', () => {
    const { ui, el, perin } = open(1, 735_000_000);
    el.querySelector<HTMLButtonElement>('[data-vip-tool="perin"]')!.click();
    const ask = el.querySelector('.inventory-vip-ask')!;
    expect(ask.textContent).toContain('Turn 700,000,000 penya into 7 Perins?');
    ask.querySelector<HTMLButtonElement>('[data-vip-answer="no"]')!.click();
    expect(perin).not.toHaveBeenCalled();
    expect(el.querySelector('.inventory-vip-ask')).toBeNull();
    el.querySelector<HTMLButtonElement>('[data-vip-tool="perin"]')!.click();
    el.querySelector<HTMLButtonElement>('[data-vip-answer="yes"]')!.click();
    expect(perin).toHaveBeenCalledTimes(1);
    ui.dispose();
  });

  it('Penya -> Perin says what is missing below 100,000,000 penya, and sends nothing', () => {
    const { ui, el, perin } = open(4, 99_999_999);
    el.querySelector<HTMLButtonElement>('[data-vip-tool="perin"]')!.click();
    expect(el.querySelector('.inventory-vip-ask')?.textContent).toContain('A Perin takes 100,000,000 penya.');
    expect(el.querySelector('[data-vip-answer="yes"]')).toBeNull();
    expect(perin).not.toHaveBeenCalled();
    ui.dispose();
  });
});

describe('the bag after the server sorts it', () => {
  it('takes the new order of the slots it is given, and leaves the worn gear', () => {
    const own = newVagrant();
    const before = [...own.inventorySlots];
    const revision = own.inventoryRevision;
    const order = [5, 3, 0xffffffff];
    own.apply({ type: 'vipInventorySort', slots: [...order, ...before.slice(3)] }, own.objectId);
    expect(own.inventorySlots.slice(0, 3)).toEqual(order);
    expect(own.inventorySlots.slice(42)).toEqual(before.slice(42));
    expect(own.inventoryRevision).toBeGreaterThan(revision);
    // another mover's sort, or a longer list than the bag, changes nothing
    own.apply({ type: 'vipInventorySort', slots: [1] }, own.objectId + 1);
    own.apply({ type: 'vipInventorySort', slots: new Array(200).fill(1) }, own.objectId);
    expect(own.inventorySlots.slice(0, 3)).toEqual(order);
  });
});
