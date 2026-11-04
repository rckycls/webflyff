// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { InventoryWindow } from '../src/world/hud/inventoryWindow';
import { newVagrant, ownGameData, itemProp } from './helpers/ownState';

describe('inventory window', () => {
  it('keeps the dressed preview through inventory updates and displays server-confirmed penya', () => {
    const own = newVagrant();
    const ui = new InventoryWindow({ url: () => '', sheets: null }, ownGameData(), {
      use: vi.fn(), equip: vi.fn(), drop: vi.fn(), move: vi.fn(), shortcut: vi.fn(),
    });
    document.body.append(ui.frame.element); ui.toggle(own);
    ui.frame.open({ x: 0, y: 0 }); ui.update(own);
    expect(ui.frame.element.classList.contains('inventory-actions-right')).toBe(true);
    const canvas = document.createElement('canvas'); ui.setPreview(canvas);
    own.apply({ type: 'setPointParam', param: 10000, value: 123456 }, own.objectId);
    ui.update(own);
    expect(ui.frame.element.querySelector('.inventory-preview canvas')).toBe(canvas);
    expect(ui.frame.element.querySelector('.inventory-money')?.textContent).toBe('123,456');
    ui.dispose();
  });
  it('has 42 bag cells, inspects unknown items safely, and keeps counts while requests wait', () => {
    const own = newVagrant(), data = ownGameData();
    own.inventory!.set(6, { objectId: 6, itemId: 999999, count: 7 });
    const use = vi.fn(), move = vi.fn();
    const ui = new InventoryWindow({ url: () => '', sheets: null }, data, {
      use, equip: vi.fn(), drop: vi.fn(), move, shortcut: vi.fn(),
    });
    document.body.append(ui.frame.element);
    ui.toggle(own);
    expect(ui.frame.element.style.width).toBe('240px');
    expect(ui.frame.element.style.height).toBe('464px');
    expect(ui.frame.element.querySelector('[data-equipment-part="10"]')).not.toBeNull();
    expect(ui.frame.element.querySelector('.inventory-preview')).not.toBeNull();
    expect(ui.frame.element.querySelectorAll('[data-bag-slot]')).toHaveLength(42);
    const cell = ui.frame.element.querySelector<HTMLButtonElement>('[data-bag-slot="6"]')!;
    expect(cell.textContent).toContain('7'); cell.click();
    cell.dispatchEvent(new MouseEvent('mouseenter'));
    expect(ui.frame.element.textContent).toContain('Unknown item');
    expect(ui.frame.element.querySelector('[data-item-action]')).toBeNull();
    expect(own.inventory!.get(6)?.count).toBe(7);
    ui.dispose();
  });
  it('shows native descriptions only while hovering the desktop item and wheels exactly one row', () => {
    const own = newVagrant(), data = ownGameData();
    data.itemProps.set(2800, { ...itemProp({ id: 2800, part: -1, kind2: 14 }), description: 'Restores 100 HP.' });
    own.inventory!.set(6, { objectId: 6, itemId: 2800, count: 2 });
    const ui = new InventoryWindow({ url: () => '', sheets: null }, data, { use: vi.fn(), equip: vi.fn(), drop: vi.fn(), move: vi.fn(), shortcut: vi.fn() });
    document.body.append(ui.frame.element); ui.toggle(own);
    const cell = ui.frame.element.querySelector('[data-bag-slot="6"]')!;
    cell.dispatchEvent(new MouseEvent('mouseenter'));
    expect(ui.frame.element.querySelector('.inventory-details')?.textContent).toContain('Restores 100 HP.');
    cell.dispatchEvent(new MouseEvent('mouseleave'));
    expect(ui.frame.element.querySelector('.inventory-details')).toBeNull();
    const scroll = ui.frame.element.querySelector<HTMLElement>('.inventory-bag-scroll')!;
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    scroll.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, cancelable: true }));
    expect(scroll.scrollTop).toBe(32);
    scroll.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, cancelable: true }));
    expect(scroll.scrollTop).toBe(32); // a burst must not race through the bag
    clock.mockReturnValue(1200);
    scroll.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, cancelable: true }));
    expect(scroll.scrollTop).toBe(64);
    scroll.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, cancelable: true }));
    expect(scroll.scrollTop).toBe(32); // reversing direction responds immediately
    clock.mockRestore();
    ui.dispose();
  });
  it('slows touch travel by half and snaps back to a row after dragging', () => {
    const ui = new InventoryWindow({ url: () => '', sheets: null }, ownGameData(), {
      use: vi.fn(), equip: vi.fn(), drop: vi.fn(), move: vi.fn(), shortcut: vi.fn(),
    });
    document.body.append(ui.frame.element); ui.toggle(newVagrant());
    const scroll = ui.frame.element.querySelector<HTMLElement>('.inventory-bag-scroll')!;
    const touch = (type: string, y?: number) => {
      const event = new Event(type, { cancelable: true });
      Object.defineProperty(event, 'touches', { value: y === undefined ? [] : [{ clientY: y }] });
      scroll.dispatchEvent(event); return event;
    };
    expect(touch('touchstart', 100).defaultPrevented).toBe(false);
    expect(touch('touchmove', 60).defaultPrevented).toBe(true);
    expect(scroll.scrollTop).toBe(20);
    touch('touchend'); expect(scroll.scrollTop).toBe(32);
    expect(scroll.style.scrollSnapType).toBe('');
    touch('touchstart', 100); touch('touchend'); expect(scroll.scrollTop).toBe(32);
    ui.dispose();
  });
  it('keeps desktop double click working after single-click inspection', () => {
    const own = newVagrant(), data = ownGameData();
    data.itemProps.set(2800, itemProp({ id: 2800, name: 'Food', part: -1, kind2: 14 }));
    own.inventory!.set(6, { objectId: 6, itemId: 2800, count: 2 });
    const use = vi.fn(), equip = vi.fn();
    const ui = new InventoryWindow({ url: () => '', sheets: null }, data, { use, equip, drop: vi.fn(), move: vi.fn(), shortcut: vi.fn() });
    document.body.append(ui.frame.element); ui.toggle(own);
    const cell = ui.frame.element.querySelector<HTMLButtonElement>('[data-bag-slot="6"]')!;
    cell.click();
    expect(ui.frame.element.querySelector('[data-bag-slot="6"]')).toBe(cell);
    expect(use).not.toHaveBeenCalled();
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(use).toHaveBeenCalledWith(6);
    expect(ui.frame.element.querySelector('[data-item-action]')).toBeNull();
    ui.dispose();
  });
  it('offers only relevant mobile actions and hides equipment in an incorrect slot', () => {
    const own = newVagrant(), data = ownGameData();
    data.itemProps.set(2800, itemProp({ id: 2800, part: -1, kind2: 14 }));
    own.inventory!.set(6, { objectId: 6, itemId: 2800, count: 2 });
    own.inventory!.set(7, { objectId: 7, itemId: 21, count: 1 });
    own.equipmentObjectIds[2] = 7; // sword cannot occupy the suit slot
    const equip = vi.fn();
    const ui = new InventoryWindow({ url: () => '', sheets: null }, data, { use: vi.fn(), equip, drop: vi.fn(), move: vi.fn(), shortcut: vi.fn() });
    document.body.append(ui.frame.element); ui.toggle(own);
    ui.frame.element.setAttribute('data-mobile-window', ''); ui.update(own, true);
    expect(ui.frame.element.querySelector('[data-equipment-part="2"]')!.getAttribute('aria-label')).toBe('Empty equipment slot 2');
    ui.frame.element.querySelector<HTMLButtonElement>('[data-bag-slot="6"]')!.click();
    const actions = () => [...ui.frame.element.querySelectorAll<HTMLElement>('[data-item-action]')].map((el) => el.dataset.itemAction);
    expect(actions()).toEqual(['use', 'drop']);
    ui.frame.element.querySelector<HTMLButtonElement>('[data-bag-slot="7"]')!.click();
    expect(actions()).toEqual(['equip', 'drop']);
    own.equipmentObjectIds[2] = 0xffffffff; own.equipmentObjectIds[10] = 7;
    own.inventoryRevision++; ui.update(own);
    ui.frame.element.querySelector<HTMLButtonElement>('[data-equipment-part="10"]')!.click();
    expect(actions()).toEqual(['unequip']);
    ui.frame.element.querySelector<HTMLButtonElement>('[data-item-action="unequip"]')!.click();
    expect(equip).toHaveBeenCalledWith(7);
    ui.dispose();
  });

  it('a ride shows Use on the phone, and its equipment cell lands it (Piece 7 M5)', () => {
    const own = newVagrant(), data = ownGameData();
    data.itemProps.set(5000, itemProp({
      id: 5000, part: 13, kind1: 4, kind2: 20,
      flight: { speed: Math.fround(0.0023), speedText: '0.0023', turn: Math.fround(0.6), pitch: 1, limit: 1, fuelMax: 1200, accelFuelMax: 12, motion: 31 },
    }));
    data.itemProps.set(5100, itemProp({ id: 5100, part: -1, kind2: 23 }));
    own.inventory!.set(3, { objectId: 3, itemId: 5000, count: 1 });
    own.inventory!.set(4, { objectId: 4, itemId: 5100, count: 1 });
    const use = vi.fn(), equip = vi.fn(), land = vi.fn();
    const ui = new InventoryWindow({ url: () => '', sheets: null }, data, { use, equip, land, drop: vi.fn(), move: vi.fn(), shortcut: vi.fn() });
    document.body.append(ui.frame.element); ui.toggle(own);
    // the PC: a ride's double-click in the bag uses it
    ui.frame.element.querySelector<HTMLButtonElement>('[data-bag-slot="3"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(use).toHaveBeenCalledWith(3);
    expect(equip).not.toHaveBeenCalled();
    // worn, its equipment cell's double-click lands it
    own.equipmentObjectIds[13] = 3; own.inventoryRevision++; ui.update(own);
    ui.frame.element.querySelector<HTMLButtonElement>('[data-equipment-part="13"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(land).toHaveBeenCalledWith(3);
    expect(equip).not.toHaveBeenCalled();
    // the phone: Use for the ride and the fuel; the worn ride's Unequip lands
    own.equipmentObjectIds[13] = 0xffffffff; own.inventoryRevision++;
    ui.frame.element.setAttribute('data-mobile-window', ''); ui.update(own, true);
    const actions = () => [...ui.frame.element.querySelectorAll<HTMLElement>('[data-item-action]')].map((el) => el.dataset.itemAction);
    ui.frame.element.querySelector<HTMLButtonElement>('[data-bag-slot="3"]')!.click();
    expect(actions()).toEqual(['use', 'drop']);
    ui.frame.element.querySelector<HTMLButtonElement>('[data-bag-slot="4"]')!.click();
    expect(actions()).toEqual(['use', 'drop']);
    own.equipmentObjectIds[13] = 3; own.inventoryRevision++; ui.update(own);
    ui.frame.element.querySelector<HTMLButtonElement>('[data-equipment-part="13"]')!.click();
    expect(actions()).toEqual(['unequip']);
    ui.frame.element.querySelector<HTMLButtonElement>('[data-item-action="unequip"]')!.click();
    expect(land).toHaveBeenLastCalledWith(3);
    ui.dispose();
  });

  it("the phone's Use shows for a Blinkwing and the Scroll of Return (Piece 7 M3)", () => {
    const own = newVagrant(), data = ownGameData();
    data.itemProps.set(4805, itemProp({ id: 4805, part: -1, kind2: 22, kind3: 47 }));
    data.itemProps.set(10469, itemProp({ id: 10469, part: -1, kind2: 19, kind3: 50 }));
    data.itemProps.set(10431, itemProp({ id: 10431, part: -1, kind2: 19 }));
    own.inventory!.set(2, { objectId: 2, itemId: 4805, count: 5 });
    own.inventory!.set(8, { objectId: 8, itemId: 10469, count: 1 });
    own.inventory!.set(9, { objectId: 9, itemId: 10431, count: 1 });
    const use = vi.fn();
    const ui = new InventoryWindow({ url: () => '', sheets: null }, data, { use, equip: vi.fn(), drop: vi.fn(), move: vi.fn(), shortcut: vi.fn() });
    document.body.append(ui.frame.element); ui.toggle(own);
    ui.frame.element.setAttribute('data-mobile-window', ''); ui.update(own, true);
    const actions = () => [...ui.frame.element.querySelectorAll<HTMLElement>('[data-item-action]')].map((el) => el.dataset.itemAction);
    ui.frame.element.querySelector<HTMLButtonElement>('[data-bag-slot="2"]')!.click();
    expect(actions()).toEqual(['use', 'drop']);
    ui.frame.element.querySelector<HTMLButtonElement>('[data-item-action="use"]')!.click();
    expect(use).toHaveBeenCalledWith(2);
    ui.frame.element.querySelector<HTMLButtonElement>('[data-bag-slot="8"]')!.click();
    expect(actions()).toEqual(['use', 'drop']);
    ui.frame.element.querySelector<HTMLButtonElement>('[data-bag-slot="9"]')!.click(); // the resurrection scroll: the revive window's
    expect(actions()).toEqual(['drop']);
    ui.dispose();
  });
  it('only requests a drop after dragging a bag item to the game canvas and confirming its quantity', () => {
    const own = newVagrant(), data = ownGameData(), drop = vi.fn(), equip = vi.fn();
    own.inventory!.set(6, { objectId: 6, itemId: 21, count: 2 });
    const ui = new InventoryWindow({ url: () => '', sheets: null }, data, { use: vi.fn(), equip, drop, move: vi.fn(), shortcut: vi.fn() });
    const world = document.createElement('div'); world.className = 'world-view';
    const canvas = document.createElement('canvas'); world.append(canvas); document.body.append(world, ui.frame.element); ui.toggle(own);
    const cell = ui.frame.element.querySelector<HTMLButtonElement>('[data-bag-slot="6"]')!;
    cell.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }));
    ui.frame.element.querySelector('[data-equipment-part="5"]')!.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(equip).not.toHaveBeenCalled(); // sword cannot be dropped onto boots
    cell.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }));
    canvas.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(drop).not.toHaveBeenCalled();
    const dialog = ui.frame.element.querySelector('[role="dialog"]')!;
    dialog.querySelector('input')!.value = '2';
    dialog.querySelector<HTMLButtonElement>('button')!.click();
    expect(drop).toHaveBeenCalledWith(6, 2); expect(own.inventory!.get(6)?.count).toBe(2);
    cell.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }));
    own.inventory!.set(6, { objectId: 6, itemId: 502, count: 1 }); // server reuses the object while the drag is pending
    canvas.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(ui.frame.element.querySelector('[role="dialog"]')).toBeNull();
    ui.dispose(); world.remove();
  });
});
