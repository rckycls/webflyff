// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { InventoryItem } from '@flyffweb/protocol';
import { ShopConfirmWindows, buyMost, buyTotal } from '../src/world/hud/shopConfirmWindows';
import { itemProp } from './helpers/ownState';

const art = { url: () => '', sheets: null };
const click = (root: Element, control: string): void => root.querySelector<HTMLButtonElement>(`[data-control="${control}"]`)!.click();

describe("the NPC shop's drag boxes (2026-11-20, mouse-drag-ui)", () => {
  it('takes 99 at most, 9999 of the charms, arrows and Red Chips, 21 Perins', () => {
    expect(buyMost(itemProp({ id: 1 }))).toBe(99);
    expect(buyMost(itemProp({ id: 1, kind3: 60 }))).toBe(9999);
    expect(buyMost(itemProp({ id: 26460 }))).toBe(9999);
    expect(buyMost(itemProp({ id: 26456 }))).toBe(21);
    expect(buyTotal(3, 10)).toEqual({ count: 3, total: 30 });
    expect(buyTotal(2, 0x7fffffff)).toEqual({ count: 1, total: 0x7fffffff });
  });

  it('CWndConfirmBuy: from 1, + - Max, the cost of them all, OK buys', () => {
    const boxes = new ShopConfirmWindows(art);
    const ok = vi.fn();
    boxes.openBuy({ prop: itemProp({ id: 1 }), unit: () => 25, stock: () => 99, ok }, document.body);
    const buy = document.querySelector<HTMLElement>('.hud-confirm-buy')!;
    const input = buy.querySelector('input')!;
    const total = (): string => buy.querySelector('[data-control="WIDC_STATIC2"]')!.textContent ?? '';
    expect(input.value).toBe('1');
    expect(total()).toBe('25');
    click(buy, 'WIDC_PLUS');
    expect(input.value).toBe('2');
    expect(total()).toBe('50');
    click(buy, 'WIDC_MAX');
    expect(input.value).toBe('99');
    expect(total()).toBe('2,475');
    click(buy, 'WIDC_MINUS');
    expect(input.value).toBe('98');
    input.value = '500';
    input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('99');
    click(buy, 'WIDC_OK');
    expect(ok).toHaveBeenCalledWith(99);
    expect(buy.hidden).toBe(true);
    boxes.dispose();
  });

  it('CWndConfirmSell: the whole stack, kept to it, OK sells; a charged item warns first; it goes once in use', () => {
    const boxes = new ShopConfirmWindows(art);
    const ok = vi.fn();
    let item: InventoryItem | undefined = { objectId: 6, itemId: 2800, count: 3 };
    let inUse = false;
    const target = { item: () => item, inUse: () => inUse, unit: () => 10, ok };
    boxes.openSell(target, document.body, false);
    const sell = document.querySelector<HTMLElement>('.hud-confirm-sell')!;
    const input = sell.querySelector('input')!;
    expect(input.value).toBe('3');
    expect(sell.querySelector('[data-control="WIDC_STATIC2"]')!.textContent).toBe('30');
    input.value = '7';
    input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('3');
    input.value = '2';
    input.dispatchEvent(new Event('input'));
    click(sell, 'WIDC_OK');
    expect(ok).toHaveBeenCalledWith(2);
    boxes.openSell(target, document.body, true);
    const warning = document.querySelector<HTMLElement>('.hud-sell-warning')!;
    expect(warning.hidden).toBe(false);
    expect(sell.hidden).toBe(true);
    click(warning, 'WIDC_OK');
    expect(sell.hidden).toBe(false);
    inUse = true;
    boxes.check();
    expect(sell.hidden).toBe(true);
    inUse = false;
    item = undefined;
    boxes.openSell(target, document.body, false);
    expect(sell.hidden).toBe(true);
    boxes.dispose();
  });
});
