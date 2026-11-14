// @vitest-environment jsdom
// 2026-11-14 (owner): the phone's compact V15 panels (docs/2026-11-14-phone-panels.md): the private shop's 5 x 2 grid of
// ten a page, its short prices, the NPC menu's two columns, and the pictures ResWindow names for style.css.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { MoverMenu, TWO_COLUMNS } from '../src/world/hud/moverMenu';
import { ResWindow } from '../src/world/hud/resWindow';
import type { ResLayout } from '../src/world/hud/resWindow';
import { PHONE_PAGE, VendorWindow, phoneCells } from '../src/world/hud/vendor/vendorWindows';
import type { SlotView, VendorWindowActions } from '../src/world/hud/vendor/vendorWindows';
import { shortPrice } from '../src/world/vendor/vendorRules';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('shortPrice (the phone grid cell\'s price)', () => {
  it('is whole with commas under 10,000, then K, M and B with one decimal, cut, never rounded up', () => {
    expect([0, 5, 999, 1_000, 9_999].map(shortPrice)).toEqual(['0', '5', '999', '1,000', '9,999']);
    expect([10_000, 12_345, 99_999, 100_000, 999_999].map(shortPrice)).toEqual(['10K', '12.3K', '99.9K', '100K', '999K']);
    expect([1_000_000, 1_999_999, 25_500_000, 999_999_999].map(shortPrice)).toEqual(['1M', '1.9M', '25.5M', '999M']);
    expect([1_000_000_000, 2_150_000_000].map(shortPrice)).toEqual(['1B', '2.1B']);
  });
});

describe('phoneCells (the slots the phone grid shows)', () => {
  const view = { cost: 1 } as SlotView;
  it('every slot for the seller, the filled ones for a buyer, in order', () => {
    const slots: (SlotView | null)[] = Array(20).fill(null);
    slots[3] = view;
    slots[14] = view;
    expect(phoneCells(slots, true)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(phoneCells(slots, false)).toEqual([3, 14]);
  });
});

describe('the private shop on a phone: a 5 x 2 grid, ten a page', () => {
  const phone = () => vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width'), media: query }));
  const actions = (): VendorWindowActions => ({
    ok: vi.fn(), cancel: vi.fn(), reset: vi.fn(), chat: vi.fn(), drop: vi.fn(), remove: vi.fn(), buy: vi.fn(), tooltip: vi.fn(),
  });
  const potion = (cost: number, count: number): SlotView => ({
    item: { objectId: 6, itemId: 4805, count } as SlotView['item'], name: 'Refresher', icon: 'item/potion.png', stacks: true, count, cost,
  } as SlotView);

  it('shows ten slots and its page arrows; the next page shows the other ten', () => {
    phone();
    const shop = new VendorWindow(art, actions());
    document.body.append(shop.element);
    shop.setMode(true, '');
    shop.setSlots(Array(20).fill(null));
    const cells = () => [...shop.element.querySelectorAll<HTMLElement>('.vendor-phone-row')].map((cell) => Number(cell.dataset.slot));
    expect(PHONE_PAGE).toBe(10);
    expect(cells()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const pager = shop.element.querySelector<HTMLElement>('.vendor-phone-pager')!;
    expect(pager.hidden).toBe(false);
    expect(pager.textContent).toContain('1/2');
    shop.element.querySelector<HTMLButtonElement>('[data-vendor-button="page-next"]')!.click();
    expect(cells()).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    // a bag tap with nothing chosen fills the first free slot of the page shown
    expect(shop.freeSlot()).toBe(10);
  });

  it('a filled cell: the icon on the slot picture, its count, its price short in its colour; a tap shows the whole and Remove', () => {
    phone();
    const act = actions();
    const shop = new VendorWindow(art, act);
    document.body.append(shop.element);
    shop.setMode(true, '');
    const slots: (SlotView | null)[] = Array(20).fill(null);
    slots[0] = potion(1_250_000, 5);
    shop.setSlots(slots);
    const cell = shop.element.querySelector<HTMLElement>('.vendor-phone-row[data-slot="0"]')!;
    expect(cell.querySelector<HTMLElement>('.vendor-phone-icon')!.style.backgroundImage).toContain('wndchgelemitem');
    expect(cell.querySelector('.vendor-phone-count')!.textContent).toBe('5');
    const price = cell.querySelector<HTMLElement>('.vendor-slot-price')!;
    expect(price.textContent).toBe('1.2M');
    expect(price.style.color).toBe('rgb(51, 51, 255)'); // 1,000,000 or more: 0xff3333ff
    expect(cell.querySelector('.vendor-slot-name')!.textContent).toBe('Refresher x5');
    const detail = shop.element.querySelector<HTMLElement>('.vendor-phone-detail')!;
    expect(detail.hidden).toBe(true);
    cell.click();
    expect(detail.hidden).toBe(false);
    expect(detail.textContent).toContain('Refresher x5');
    expect(detail.textContent).toContain('1,250,000 penya');
    detail.querySelector<HTMLButtonElement>('[data-vendor-button="remove"]')!.click();
    expect(act.remove).toHaveBeenCalledWith(0);
  });

  it('a buyer sees the filled slots only, and a tap buys', () => {
    phone();
    const act = actions();
    const shop = new VendorWindow(art, act);
    document.body.append(shop.element);
    shop.setMode(false, 'Potions');
    const slots: (SlotView | null)[] = Array(20).fill(null);
    slots[4] = potion(50, 10);
    shop.setSlots(slots);
    const cells = [...shop.element.querySelectorAll<HTMLElement>('.vendor-phone-row')];
    expect(cells.map((cell) => cell.dataset.slot)).toEqual(['4']);
    expect(shop.element.querySelector<HTMLElement>('.vendor-phone-pager')!.hidden).toBe(true);
    cells[0]!.click();
    expect(act.buy).toHaveBeenCalledWith(4);
  });
});

describe('the NPC menu\'s columns (moverMenu.ts, style.css on a phone)', () => {
  const entries = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, label: `Entry ${i}`, enabled: true }));
  it(`one column under ${TWO_COLUMNS} entries; from ${TWO_COLUMNS}, two, as many rows as half (rounded up)`, () => {
    const menu = new MoverMenu(document);
    document.body.append(menu.element);
    menu.open(entries(6), { x: 0, y: 0 }, vi.fn());
    expect([menu.element.dataset.columns, menu.element.style.getPropertyValue('--menu-rows')]).toEqual(['1', '6']);
    menu.open(entries(11), { x: 0, y: 0 }, vi.fn());
    expect([menu.element.dataset.columns, menu.element.style.getPropertyValue('--menu-rows')]).toEqual(['2', '6']);
    menu.dispose();
  });
});

describe('ResWindow names its pictures (data-picture), for the phone panels', () => {
  const LAYOUT: ResLayout = {
    title: 'Piercing', width: 192, height: 256,
    controls: [
      { kind: 'static', id: 'WIDC_STATIC5', rect: [112, 38, 144, 70], picture: 'WndElemItemBlank.tga' },
      { kind: 'static', id: 'WIDC_STATIC1', rect: [22, 46, 70, 62], text: 'Item' },
    ],
  };
  it('a picture static says which picture, in lower case; a plain one says nothing', () => {
    const window = new ResWindow(LAYOUT, art);
    const slot = window.element.querySelector<HTMLElement>('[data-control="WIDC_STATIC5"]')!;
    expect(slot.dataset.picture).toBe('wndelemitemblank.tga');
    expect(window.element.querySelector<HTMLElement>('[data-control="WIDC_STATIC1"]')!.dataset.picture).toBeUndefined();
  });
});
