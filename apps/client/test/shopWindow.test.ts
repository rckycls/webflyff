// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { ShopWindow } from '../src/world/hud/shopWindow';
import { newVagrant, ownGameData, itemProp } from './helpers/ownState';

it('uses confirmed stock/inventory, validates quantity and refuses stale, equipped or unavailable items', () => {
  let valid = true;
  const own = newVagrant(), data = ownGameData();
  own.gold = 100; data.itemProps.set(2800, { ...itemProp({ id: 2800, part: -1, kind2: 14, packMax: 99 }), cost: 10 });
  own.inventory!.set(6, { objectId: 6, itemId: 2800, count: 3 });
  const actions = { open: vi.fn(), close: vi.fn(), buy: vi.fn(), sell: vi.fn() };
  const ui = new ShopWindow({ url: () => '', sheets: null }, data, () => own, () => valid, actions);
  document.body.append(ui.frame.element); ui.open(7, 'Luda');
  expect(actions.open).toHaveBeenCalledWith(7);
  ui.receive(8, [[{ objectId: 1, itemId: 2800, count: 99 }], [], [], []]);
  expect(ui.frame.element.querySelector('[data-stock-id]')).toBeNull();
  ui.receive(7, [[{ objectId: 1, itemId: 2800, count: 99 }], [], [], []]);
  // a stock item is drawn by the shop, not a CWndButton: no click sound (Piece 6 M2)
  expect(ui.frame.element.querySelector('[data-stock-id="1"]')!.hasAttribute('data-silent')).toBe(true);
  ui.frame.element.querySelector<HTMLButtonElement>('[data-stock-id="1"]')!.click();
  const quantity = ui.frame.element.querySelector<HTMLInputElement>('[name=quantity]')!;
  const buy = ui.frame.element.querySelector<HTMLButtonElement>('[data-shop-action=buy]')!;
  quantity.value = '0'; buy.click(); expect(actions.buy).not.toHaveBeenCalled();
  quantity.value = '2'; buy.click(); expect(actions.buy).toHaveBeenCalledWith(0, 1, 2, 2800);
  expect(own.gold).toBe(100); expect(own.inventory!.get(6)!.count).toBe(3);
  ui.feedback('Not enough penya.'); expect(ui.frame.element.textContent).toContain('Not enough penya.');
  own.gold = 0; buy.click(); expect(actions.buy).toHaveBeenCalledTimes(1);
  own.gold = 100; ui.update();
  ui.selectSell(6);
  quantity.value = '2'; ui.frame.element.querySelector<HTMLButtonElement>('[data-shop-action=sell]')!.click();
  expect(actions.sell).toHaveBeenCalledWith(6, 2);
  valid = false; ui.update(); expect(ui.frame.isOpen).toBe(false); expect(actions.close).toHaveBeenCalled();
  ui.dispose();
});

it('recognizes native empty positions whose index still points at an empty object slot', () => {
  const own = newVagrant(), data = ownGameData(); own.gold = 1000; own.inventory!.clear();
  own.inventorySlots = Array.from({ length: 73 }, (_, i) => i < 42 ? i : 0xffffffff);
  data.itemProps.set(2800, { ...itemProp({ id: 2800, part: -1, packMax: 99 }), cost: 10 });
  const actions = { open: vi.fn(), close: vi.fn(), buy: vi.fn(), sell: vi.fn() };
  const ui = new ShopWindow({ url: () => '', sheets: null }, data, () => own, () => true, actions);
  document.body.append(ui.frame.element); ui.open(7, 'Luda');
  ui.receive(7, [[{ objectId: 1, itemId: 2800, count: 99 }], [], [], []]);
  ui.frame.element.querySelector<HTMLButtonElement>('[data-stock-id]')!.click();
  ui.frame.element.querySelector<HTMLButtonElement>('[data-shop-action=buy]')!.click();
  expect(actions.buy).toHaveBeenCalledWith(0, 1, 1, 2800); ui.dispose();
});

it('refuses a full bag, clears stale stock selection, and never offers equipped items for sale', () => {
  const own = newVagrant(), data = ownGameData(); own.gold = 1000;
  own.equipmentObjectIds.fill(0xffffffff); own.inventorySlots.fill(0xffffffff); own.inventory!.clear();
  data.itemProps.set(2800, { ...itemProp({ id: 2800, part: -1, packMax: 99 }), cost: 10 });
  data.itemProps.set(2801, { ...itemProp({ id: 2801, part: -1, packMax: 99 }), cost: 10 });
  for (let i = 0; i < 42; i++) { own.inventorySlots[i] = i; own.inventory!.set(i, { objectId: i, itemId: 2801, count: 99 }); }
  const actions = { open: vi.fn(), close: vi.fn(), buy: vi.fn(), sell: vi.fn() };
  const ui = new ShopWindow({ url: () => '', sheets: null }, data, () => own, () => true, actions);
  document.body.append(ui.frame.element); ui.open(7, 'Luda');
  ui.receive(7, [[{ objectId: 1, itemId: 2800, count: 99 }], [], [], []]);
  ui.frame.element.querySelector<HTMLButtonElement>('[data-stock-id]')!.click();
  ui.frame.element.querySelector<HTMLButtonElement>('[data-shop-action=buy]')!.click();
  expect(actions.buy).not.toHaveBeenCalled(); expect(ui.frame.element.textContent).toContain('inventory is full');
  ui.receive(7, [[], [], [], []]);
  ui.frame.element.querySelector<HTMLButtonElement>('[data-shop-action=buy]')!.click(); expect(actions.buy).not.toHaveBeenCalled();
  own.equipmentObjectIds[10] = 6; own.inventoryRevision++; ui.update();
  ui.selectSell(6); ui.frame.element.querySelector<HTMLButtonElement>('[data-shop-action=sell]')!.click();
  expect(actions.sell).not.toHaveBeenCalled();
  expect(ui.frame.element.querySelector('[data-sell-id="6"]')).toBeNull();
  ui.dispose();
});

it('keeps later native stock tabs reachable and preserves the selected base price on refresh', () => {
  const own = newVagrant(), data = ownGameData(); own.gold = 100;
  data.itemProps.set(2800, { ...itemProp({ id: 2800, part: -1, packMax: 99 }), cost: 10 });
  const actions = { open: vi.fn(), close: vi.fn(), buy: vi.fn(), sell: vi.fn() };
  const ui = new ShopWindow({ url: () => '', sheets: null }, data, () => own, () => true, actions);
  document.body.append(ui.frame.element); ui.open(7, 'Vendor');
  ui.receive(7, [[], [], [{ objectId: 1, itemId: 2800, count: 99 }], []]);
  expect(ui.frame.element.querySelector<HTMLElement>('.shop-tabs')!.hidden).toBe(false);
  ui.frame.element.querySelector<HTMLButtonElement>('[aria-label="Stock tab 3"]')!.click();
  ui.frame.element.querySelector<HTMLButtonElement>('[data-stock-id="1"]')!.click();
  own.gold = 90; ui.update(); expect(ui.frame.element.querySelector('output')!.textContent).toBe('10');
  ui.frame.element.querySelector<HTMLButtonElement>('[data-shop-action=buy]')!.click();
  expect(actions.buy).toHaveBeenCalledWith(2, 1, 1, 2800); ui.dispose();
});

it('uses resource store labels below the list and removes search and placeholder categories', () => {
  const own = newVagrant(), data = ownGameData();
  const ui = new ShopWindow({ url: () => '', sheets: null }, data, () => own, () => true, { open: vi.fn(), close: vi.fn(), buy: vi.fn(), sell: vi.fn() });
  document.body.append(ui.frame.element); ui.open(7, 'Luda', { key: 'luda', name: 'Luda', vendorTabs: { 0: 'Weapons', 1: 'Armors', 2: 'Shields', 3: ' ' } });
  expect([...ui.frame.element.querySelectorAll('.shop-tabs button')].map(button => button.textContent)).toEqual(['Weapons', 'Armors', 'Shields', ' ']);
  const list = ui.frame.element.querySelector('.shop-stock-grid')!;
  expect(list.nextElementSibling!.className).toBe('shop-tabs');
  expect(ui.frame.element.querySelector('.shop-search, .shop-awaken, .shop-reference-filters')).toBeNull(); ui.dispose();
});

it('shows shared inventory-style hover details and keeps descriptions out of the button footer', () => {
  const own = newVagrant(), data = ownGameData(); own.gold = 100;
  data.itemProps.set(2800, { ...itemProp({ id: 2800, part: 2, abilityMin: 3, abilityMax: 7 }), name: 'Test Suit', description: '<script>safe text</script>', cost: 10 });
  const ui = new ShopWindow({ url: () => '', sheets: null }, data, () => own, () => true, { open: vi.fn(), close: vi.fn(), buy: vi.fn(), sell: vi.fn() });
  document.body.append(ui.frame.element); ui.open(7, 'Luda'); ui.receive(7, [[{ objectId: 1, itemId: 2800, count: 99 }], [], [], []]);
  const item = ui.frame.element.querySelector<HTMLButtonElement>('[data-stock-id="1"]')!;
  item.dispatchEvent(new MouseEvent('mouseenter'));
  const tooltip = document.querySelector('.shop-item-details')!;
  expect(tooltip.textContent).toContain('Test Suit'); expect(tooltip.textContent).toContain('Quantity: 99');
  expect(tooltip.textContent).toContain('Defence 3–7'); expect(tooltip.textContent).toContain('<script>safe text</script>'); expect(tooltip.querySelector('script')).toBeNull();
  item.dispatchEvent(new MouseEvent('mouseleave')); expect(document.querySelector('.shop-item-details')).toBeNull();
  item.click(); expect(ui.frame.element.querySelector<HTMLElement>('.shop-feedback')!.hidden).toBe(true);
  expect(ui.frame.body.lastElementChild!.className).toBe('shop-controls');
  ui.feedback('Not enough penya.'); const feedback = ui.frame.element.querySelector<HTMLElement>('.shop-feedback')!;
  expect(feedback.hidden).toBe(false); expect(feedback.nextElementSibling!.className).toBe('shop-controls');
  item.dispatchEvent(new MouseEvent('mouseenter')); ui.frame.close(); expect(document.querySelector('.shop-item-details')).toBeNull(); ui.dispose();
});
